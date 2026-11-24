// Docker and compose are pinned (rules 18, 21 and the safety rules): loopback publish only, non-root, read-only, restart: unless-stopped, a /api/health healthcheck.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { allowedExtraHosts, resolvePort } from '../server/src/safety.js';

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lines = (name) => here(name).split('\n');
const uncommented = (name) => lines(name).filter((l) => !/^\s*#/.test(l)).join('\n');
// The lines of one block under the service (a key at 4 spaces), without a YAML dependency.
function block(key) {
  const ls = lines('docker-compose.yml'); const out = [];
  const at = ls.findIndex((l) => l === `    ${key}:` || l.startsWith(`    ${key}: `));
  if (at < 0) return null;
  for (let i = at + 1; i < ls.length; i += 1) { if (/^ {0,4}\S/.test(ls[i])) break; out.push(ls[i]); }
  return out;
}

test('the host port is published on 127.0.0.1 only, exactly as pinned, and nowhere else', () => {
  assert.deepEqual(publishedPorts(here('docker-compose.yml')), ['127.0.0.1:${HOST_PORT:-7837}:7837']);
  assert.ok(!/0\.0\.0\.0:|network_mode: ?host|expose:/.test(uncommented('docker-compose.yml')));
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "7837:7837"', '- "0.0.0.0:7837:7837"', '- 7837', '- "::1:7837:7837"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('the compose host port, the Dockerfile port and the server default agree, and are allowed ports', () => {
  const host = Number(/\$\{HOST_PORT:-(\d+)\}/.exec(here('docker-compose.yml'))[1]);
  const port = Number(/^EXPOSE (\d+)/m.exec(here('Dockerfile'))[1]);
  assert.equal(host, 7837); assert.equal(port, 7837);
  assert.equal(resolvePort({}), 7837);
  assert.doesNotThrow(() => resolvePort({ PORT: String(host) }));
  assert.match(here('docker-compose.yml'), /:7837"/);
  assert.match(here('Dockerfile'), /^ENV PRL_BIND=0\.0\.0\.0$/m);
  assert.match(here('Dockerfile'), /^ENV NODE_ENV=production PORT=7837$/m);
});

test('restart: unless-stopped (rule 21) and a /api/health healthcheck on the demo-health/1 contract', () => {
  assert.match(uncommented('docker-compose.yml'), /^\s{4}restart: unless-stopped$/m);
  const hc = block('healthcheck').join('\n');
  assert.match(hc, /127\.0\.0\.1:7837\/api\/health/); assert.match(hc, /demo-health\/1/); assert.match(hc, /state==='ready'/);
});

test('non-root, read-only, no capabilities, no new privileges, a tmpfs for /tmp', () => {
  const c = uncommented('docker-compose.yml');
  for (const re of [/^\s{4}user: node$/m, /^\s{4}read_only: true$/m, /^\s{4}cap_drop: \[ALL\]$/m, /no-new-privileges:true/]) assert.match(c, re);
  assert.deepEqual(block('tmpfs').map((l) => l.trim()), ['- /tmp']);
  assert.match(here('Dockerfile'), /^USER node$/m);
});

test('no secret anywhere: the environment block holds only non-secret settings, the Dockerfile sets none, the build context excludes them', () => {
  const keys = block('environment').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(':')[0]);
  assert.deepEqual(keys.sort(), ['LAB_ALLOWED_HOSTS', 'PORT', 'PRL_BIND']);
  assert.ok(!/env_file|secrets/.test(uncommented('docker-compose.yml')), 'Mock only: no env_file and no secrets mount');
  assert.ok(!/PRIVATE KEY|\.pem|\.env|secrets|ARG /i.test(uncommented('Dockerfile')));
  const ignore = here('.dockerignore').split('\n');
  for (const p of ['.env', '.env.*', 'secrets', '*.pem', '*.key', '.git', 'customer.config.json']) assert.ok(ignore.includes(p), `.dockerignore excludes ${p}`);
  const git = here('.gitignore').split('\n');
  for (const p of ['.env', 'secrets/*', '*.pem', 'node_modules/', 'dist/', 'customer.config.json']) assert.ok(git.includes(p), `.gitignore has ${p}`);
});

test('LAB_ALLOWED_HOSTS defaults to the lab-proxy names, every one a valid host name', () => {
  const def = /LAB_ALLOWED_HOSTS: \$\{LAB_ALLOWED_HOSTS:-([^}]*)\}/.exec(here('docker-compose.yml'))[1].split(',');
  assert.ok(def.includes('local.ping-devops.com') && def.includes('privilege-rate-limit-lab.local.ping-devops.com'));
  assert.equal(allowedExtraHosts({ LAB_ALLOWED_HOSTS: def.join(',') }).size, 2);
});

test('the image builds the web app, copies only the server source, the diagram data and the built web, runs as node, and never installs dev dependencies', () => {
  const d = here('Dockerfile');
  assert.match(d, /^FROM node:26-alpine AS build$/m);
  assert.match(d, /^RUN npm run build -w web$/m);
  assert.match(d, /^COPY server\/src server\/src$/m);
  assert.match(d, /^COPY server\/diagrams server\/diagrams$/m, 'the diagram data ships in the image (rule 17: loaded by name)');
  assert.match(d, /^COPY --from=build \/app\/web\/dist web\/dist$/m);
  assert.match(d, /npm ci --omit=dev/);
  assert.match(d, /^CMD \["node", "server\/src\/index\.js"\]$/m);
});

// A COPY source that .dockerignore excludes makes the build fail (or copy nothing). A real OrbStack build proves it; this keeps it from regressing without one.
function dockerignoreExcludes(patterns, source) {
  const src = source.replace(/^\.\//, '').replace(/\/$/, '');
  return patterns.some((raw) => {
    const p = raw.replace(/^\//, '').replace(/\/$/, '');
    if (!p || p.startsWith('!')) return false;
    if (p === src || src.startsWith(`${p}/`)) return true;
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*')}$`);
    return re.test(src) || src.split('/').some((_, i, a) => re.test(a.slice(0, i + 1).join('/')));
  });
}

test('no COPY source in the Dockerfile is excluded by .dockerignore (the build context really has them)', () => {
  const patterns = here('.dockerignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const sources = [];
  for (const l of uncommented('Dockerfile').split('\n')) {
    const m = /^COPY\s+(?!--from)(?:--\S+\s+)*(.+)$/.exec(l.trim());
    if (m) { const parts = m[1].trim().split(/\s+/); sources.push(...parts.slice(0, -1)); }
  }
  assert.ok(sources.length >= 6, `found the COPY sources (${sources.join(', ')})`);
  for (const s of sources) {
    assert.ok(fs.existsSync(new URL(`../${s}`, import.meta.url)), `${s} exists in the repo`);
    assert.equal(dockerignoreExcludes(patterns, s), false, `${s} is excluded by .dockerignore`);
  }
});

test('the check itself works: it flags an excluded source and lets an allowed one through', () => {
  assert.equal(dockerignoreExcludes(['docs', '**/dist', '*.pem'], 'docs'), true);
  assert.equal(dockerignoreExcludes(['docs'], 'docs/spec.md'), true);
  assert.equal(dockerignoreExcludes(['**/dist'], 'web/dist'), true);
  assert.equal(dockerignoreExcludes(['docs', 'scripts'], 'server/src'), false);
  assert.equal(dockerignoreExcludes(['docs'], 'package.json'), false);
});

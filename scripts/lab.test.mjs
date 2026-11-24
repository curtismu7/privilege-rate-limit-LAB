// The rulebook's artifacts, pinned: shelf entry, customer config, CI, workspace id (rule 13), README and CLAUDE.md, the docs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validWorkspaceId } from '../server/src/workspaces.js';

const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');

test('the rulebook files exist', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml', '.dockerignore', '.github/workflows/ci.yml', 'docs/talk-track.md', 'docs/spec.md', 'docs/shelf-entry.json', 'docs/content-pack.schema.json', 'customer.config.example.json', 'content-pack.json', 'scripts/doctor.mjs', 'scripts/reset.mjs', 'scripts/check-ui-standard.sh', 'web/src/styles/standalone-ui.css']) {
    assert.ok(fs.existsSync(new URL(f, root)), f);
  }
});

test('the shelf entry is portable (a relative composeFile, no absolute path) and honest about the provisional port and catalog id', () => {
  const e = JSON.parse(read('docs/shelf-entry.json')).demos[0];
  assert.equal(e.id, 'privilege-rate-limit-lab');
  assert.ok(!/^\//.test(e.composeFile) && !/(Users|home)\//.test(e.composeFile) && !e.composeFile.includes('..'), e.composeFile);
  assert.match(e.composeFile, /docker-compose\.yml$/);
  assert.equal(e.kind, 'Demo'); assert.equal(e.healthPath, '/api/health'); assert.equal(e.url, 'http://localhost:7837');
  assert.deepEqual(e.pingProducts, []);
  assert.ok(e.description.length <= 300, 'the shelf allows 300 characters');
  assert.match(e.notes, /PROVISIONAL/);
  assert.ok(!/(Users|home)\/[a-z]/i.test(JSON.stringify(e)));
});

test('the customer config example overrides only the brand', () => {
  const c = JSON.parse(read('customer.config.example.json'));
  assert.deepEqual(Object.keys(c), ['cast']);
  assert.deepEqual(Object.keys(c.cast), ['brand']);
});

test('CI runs the build, the tests, the UI-standard check, the doctor on PORT=7837, the content-pack validation, the forbidden-strings scan, the attribution check and gitleaks on Node 26', () => {
  const ci = read('.github/workflows/ci.yml');
  for (const needle of ['npm run build', 'npm test', 'bash scripts/check-ui-standard.sh', 'PORT=7837 npm run doctor', 'node scripts/validate-content-pack.mjs', 'FORBIDDEN_STRINGS', 'check-no-ai-attribution.sh', 'gitleaks detect']) assert.ok(ci.includes(needle), needle);
  assert.ok(!/node-version: (?!26)/.test(ci), 'Node 26 only');
  for (const job of ['build:', 'test:', 'doctor:', 'forbidden-strings:', 'gitleaks:']) assert.ok(ci.includes(`\n  ${job}`), job);
});

test('rule 13: the page keeps the workspace rule in step with the server (a table of ids)', async () => {
  const src = read('web/src/workspace.js');
  const parts = /CREDENTIAL_PARTS = new Set\(\[([^\]]*)\]\)/.exec(src)[1].match(/"([a-z]+)"/g).map((s) => s.replaceAll('"', ''));
  const { CREDENTIAL_PARTS } = await import('../server/src/workspaces.js');
  assert.deepEqual([...parts].sort(), [...CREDENTIAL_PARTS].sort());
  // the page's own validWorkspaceId, evaluated from its source
  const fn = /export function validWorkspaceId[\s\S]*?\n}\n/.exec(src)[0].replace('export ', '');
  const page = new Function(`const CREDENTIAL_PARTS = new Set(${JSON.stringify(parts)});\n${fn}\nreturn validWorkspaceId;`)();
  for (const id of ['default', 'w-0123456789abcdef', 'a', 'x'.repeat(40), 'x'.repeat(41), '', 'Upper', 'a b', 'sk-live-abc', 'my-token-1', 'eyjhbGciOi', 'abcdef0123456789abcdef0123', 'ok-id-2', '__proto__', '-', 'a/b']) {
    assert.equal(page(id), validWorkspaceId(id), `page and server agree on "${id}"`);
  }
  assert.equal(validWorkspaceId('default'), true); assert.equal(validWorkspaceId('sk-live-abc'), false);
});

test('the README declares the tier, says Mock only and the provisional port, and names the open question and the missing detector', () => {
  const r = read('README.md');
  assert.match(r, /\*\*Tier: Demo\.\*\*/);
  assert.match(r, /PROVISIONAL/); assert.match(r, /Mock only/);
  assert.match(r, /fallback/i); assert.match(r, /baseline-jump/i);
  assert.match(r, /demo-health\/1|api\/health/);
});

test('no shipped file names an absolute author path, an AI-DEMO2 path or a private repo', () => {
  const bad = [];
  // Vendored shared files are pinned byte for byte and name their own canonical origin; they are checked by their pins, not here.
  const vendored = ['web/src/floating-dialog/', 'web/src/diagram-kit/', 'web/src/gateway-trace/', 'web/src/run-observability/', 'web/src/top-menu/', 'web/src/components/JsonPane', 'web/src/styles/'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
      const p = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|jsx|json|md|sh|yml|css|html|sha256)$/.test(e.name) && !e.name.endsWith('package-lock.json') && !e.name.endsWith('lab.test.mjs')) {
        const rel = p.pathname.replace(root.pathname, '');
        if (vendored.some((v) => rel.startsWith(v))) continue;
        const t = fs.readFileSync(p, 'utf8');
        if (/\/Users\/[a-z]|\/home\/[a-z]+\/|AI-DEMO2|cmuir/i.test(t)) bad.push(p.pathname.replace(root.pathname, ''));
      }
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});

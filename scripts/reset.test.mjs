import test from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './reset.mjs';
import { createApp, startHttpServer } from '../server/src/app.js';

async function withLab(fn) {
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ log: () => {}, env: { WEB_DIST: '/nonexistent' } }) });
  const base = url.replace(/\/$/, '');
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}
const run = (base, ws) => fetch(`${base}/api/scenario/refusal-recorded`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-workspace': ws }, body: '{}' });
const runs = async (base, ws) => (await (await fetch(`${base}/api/info`, { headers: { 'x-workspace': ws } })).json()).runsSinceReset;

test('npm run reset takes a workspace id: it clears that workspace and no other', async () => {
  await withLab(async (base) => {
    await run(base, 'w-tab-one'); await run(base, 'w-tab-one'); await run(base, 'w-tab-two'); await run(base, 'default');
    const r = await reset(base, 'w-tab-one');
    assert.equal(r.workspace, 'w-tab-one'); assert.equal(r.cleared, 2);
    assert.equal(await runs(base, 'w-tab-one'), 0);
    assert.equal(await runs(base, 'w-tab-two'), 1, 'another tab is untouched');
    assert.equal(await runs(base, 'default'), 1, 'and so is the default workspace');
    assert.equal((await reset(base)).workspace, 'default');
    assert.equal(await runs(base, 'default'), 0);
  });
});

test('the workspace can come from PRL_WORKSPACE; a bad id and a non-loopback host are refused before any request', async () => {
  await withLab(async (base) => {
    await run(base, 'w-from-env');
    process.env.PRL_WORKSPACE = 'w-from-env';
    try { assert.equal((await reset(base)).cleared, 1); } finally { delete process.env.PRL_WORKSPACE; }
    await assert.rejects(() => reset(base, 'sk-live-abc'), /must not look like a credential/);
    await assert.rejects(() => reset(base, 'UPPER'), /lowercase/);
    await assert.rejects(() => reset('http://example.invalid:7837', 'default'), /loopback only/);
  });
});

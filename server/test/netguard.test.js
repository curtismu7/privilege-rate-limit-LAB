import test from 'node:test';
import assert from 'node:assert/strict';
import { installNetguard, netguardSelfTest } from '../src/netguard.js';
import { createApp, startHttpServer } from '../src/app.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { runLoad } from '../src/load.js';

test('the netguard self-test: every outbound path is refused and recorded', async () => {
  const guard = installNetguard();
  const r = await netguardSelfTest();
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.blocked, 6);
  assert.equal(guard.attempts.length, 0, 'self-test attempts are not counted as real');
  guard.restore();
});

test('a full run of every scenario, every engine and the HTTP API makes zero outbound attempts', async () => {
  const guard = installNetguard();
  for (const sc of SCENARIOS) assert.equal(runScenario(sc.id).ok, true);
  runLoad({ engine: 'cluster', config: { nodes: 2, shared: true, storeAvailable: false, limit: { kind: 'bucket', capacity: 2, refillPerSec: 1 } }, profile: { phases: [{ type: 'burst', count: 3, durationMs: 1000 }] } });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp() });
  try {
    const base = url.replace(/\/$/, '');
    assert.equal((await fetch(`${base}/api/health`)).status, 200); // loopback is allowed
    assert.equal((await fetch(`${base}/api/scenario/refusal-recorded`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' })).status, 200);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(guard.attempts, []);
  await assert.rejects(() => fetch('http://self-test.invalid/'), /network blocked/);
  assert.equal(guard.attempts.length, 1, 'and the guard does record a real attempt');
  guard.restore();
});

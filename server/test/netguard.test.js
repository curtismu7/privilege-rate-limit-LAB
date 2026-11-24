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

test('a literal IP address needs no DNS: the guarded lookup resolves it (an opted-in PRL_BIND), and connecting to it is still refused', async () => {
  const dns = (await import('node:dns')).default; const net = (await import('node:net')).default; // the default objects, which the guard patches
  const guard = installNetguard();
  const lit = ['192', '0', '2', '55'].join('.'); // a documentation address, not a real host
  const out = await new Promise((res, rej) => dns.lookup(lit, (e, address, family) => (e ? rej(e) : res({ address, family }))));
  assert.deepEqual(out, { address: lit, family: 4 });
  assert.equal((await dns.promises.lookup(lit)).address, lit);
  assert.deepEqual(guard.attempts, [], 'a literal address is not a name lookup, so nothing is recorded');
  await assert.rejects(() => new Promise((_, rej) => { try { const s = net.connect({ host: lit, port: 80 }); s.on('error', rej); } catch (e) { rej(e); } }), /network blocked/);
  assert.equal(guard.attempts.length, 1, 'but a connection to it is still an outbound attempt and is refused');
  await assert.rejects(() => new Promise((res, rej) => dns.lookup('not-an-ip.invalid', (e) => (e ? rej(e) : res()))), /network blocked/);
  assert.equal(guard.attempts.length, 2, 'a name is still refused');
  assert.equal((await netguardSelfTest()).ok, true, 'the zero-outbound self-test still passes');
  guard.restore();
});

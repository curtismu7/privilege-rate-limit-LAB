import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoad, validateProfile } from '../src/load.js';
import { code } from './helpers.js';

const B = { engine: 'bucket', config: { capacity: 10, refillPerSec: 2 } };
const run = (phases, extra = {}) => runLoad({ ...B, ...extra, profile: { phases, ...(extra.tickMs ? { tickMs: extra.tickMs } : {}) } });

test('steady spaces requests evenly, per tick', () => {
  const r = runLoad({ engine: 'bucket', config: { capacity: 100, refillPerSec: 100 }, profile: { phases: [{ type: 'steady', ratePerSec: 2, durationMs: 3000 }] } });
  assert.equal(r.totals.requests, 6);
  assert.deepEqual(r.series.map((s) => s.allowed), [2, 2, 2]);
});

test('a burst lands at the first instant of its phase; idle makes no requests; spike is a high-rate phase', () => {
  const r = run([{ type: 'idle', durationMs: 2000 }, { type: 'burst', count: 4, durationMs: 1000 }, { type: 'spike', ratePerSec: 20, durationMs: 1000 }]);
  assert.deepEqual(r.series.map((s) => s.allowed + s.refused), [0, 0, 4, 20]);
  assert.equal(r.refusals.every((x) => x.t >= 2000), true);
});

test('the series has one point per tick plus the start, and its ticks add up to the totals', () => {
  const r = run([{ type: 'burst', count: 15, durationMs: 1000 }, { type: 'idle', durationMs: 4000 }], { tickMs: 500 });
  assert.equal(r.series.length, 10);
  assert.equal(r.start.tokens, 10);
  assert.equal(r.series.reduce((a, s) => a + s.allowed, 0), r.totals.allowed);
  assert.equal(r.series.reduce((a, s) => a + s.refused, 0), r.totals.refused);
  assert.equal(r.totals.requests, r.totals.allowed + r.totals.refused + r.totals.errors);
  assert.deepEqual(r.series.map((s) => s.t), [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]);
});

test('a burst larger than capacity is served up to capacity only', () => {
  const r = run([{ type: 'burst', count: 5000, durationMs: 1000 }]);
  assert.equal(r.totals.allowed, 10);
  assert.equal(r.totals.refused, 4990);
  assert.equal(r.refusals.length, 50, 'recorded refusals are capped');
  assert.equal(r.refusalsTruncated, true);
  assert.equal(r.byReason.bucket_empty, 4990);
});

test('the same input gives the same output (no real time, no randomness)', () => {
  const p = [{ type: 'steady', ratePerSec: 7, durationMs: 9000 }, { type: 'burst', count: 33, durationMs: 1000 }];
  assert.deepEqual(run(p), run(p));
});

test('per-agent counts and the node pin reach the engine', () => {
  const r = runLoad({
    engine: 'appCaps', config: { kind: 'a2a', appRpm: 6, appMaxConcurrent: 5, keyRpm: 6, keyMaxConcurrent: 5 },
    profile: { phases: [{ type: 'burst', count: 4, durationMs: 1000, agents: ['x1', 'x2'] }] },
  });
  assert.deepEqual(r.byAgent, { x1: { allowed: 2, refused: 0, errors: 0 }, x2: { allowed: 2, refused: 0, errors: 0 } });
  const c = runLoad({ engine: 'cluster', config: { nodes: 2, shared: false, limit: { kind: 'bucket', capacity: 3, refillPerSec: 1 } }, profile: { phases: [{ type: 'burst', count: 5, durationMs: 1000, node: 1 }] } });
  assert.equal(c.totals.allowed, 3);
  assert.equal(c.refusals[0].node, 1);
});

test('a store outage is counted as errors, not refusals', () => {
  const r = runLoad({ engine: 'cluster', config: { nodes: 2, shared: true, storeAvailable: false, limit: { kind: 'bucket', capacity: 3, refillPerSec: 1 } }, profile: { phases: [{ type: 'burst', count: 4, durationMs: 1000 }] } });
  assert.deepEqual([r.totals.allowed, r.totals.refused, r.totals.errors], [0, 0, 4]);
  assert.equal(r.refusals[0].client.status, 503);
  assert.equal(r.byReason.shared_store_unavailable, 4);
});

test('hostile profiles are bounded and refused with a named error', () => {
  const idle = { type: 'idle', durationMs: 1 };
  const bad = [
    null, [], 'x', {}, { phases: [] }, { phases: 'x' }, { phases: Array.from({ length: 51 }, () => idle) },
    { phases: [{ type: 'idle', durationMs: 600001 }] },
    { phases: [{ type: 'idle', durationMs: 400000 }, { type: 'idle', durationMs: 400000 }] },
    { phases: [{ type: 'steady', ratePerSec: 1001, durationMs: 1000 }] },
    { phases: [{ type: 'burst', count: 5001, durationMs: 1000 }] },
    { phases: [{ type: 'steady', ratePerSec: 1000, durationMs: 21000 }] },
    { phases: [{ type: 'burst', count: 5000, durationMs: 1 }, { type: 'burst', count: 5000, durationMs: 1 }, { type: 'burst', count: 5000, durationMs: 1 }, { type: 'burst', count: 5000, durationMs: 1 }, { type: 'burst', count: 1, durationMs: 1 }] },
    { tickMs: 100, phases: [{ type: 'idle', durationMs: 300000 }] },
    { tickMs: 99, phases: [idle] }, { tickMs: 60001, phases: [idle] }, { tickMs: 1.5, phases: [idle] },
    { phases: [{ type: 'steady', ratePerSec: 0, durationMs: 1000 }] }, { phases: [{ type: 'steady', ratePerSec: -1, durationMs: 1000 }] },
    { phases: [{ type: 'burst', count: 0, durationMs: 1000 }] }, { phases: [{ type: 'burst', count: 1.5, durationMs: 1000 }] },
    { phases: [{ type: 'idle', durationMs: 0 }] }, { phases: [{ type: 'idle', durationMs: -5 }] }, { phases: [{ type: 'idle', durationMs: NaN }] },
    { phases: [{ type: 'warp', durationMs: 5 }] }, { phases: [{ type: 'idle', durationMs: 5, ratePerSec: 4 }] }, { phases: [idle], extra: 1 },
    { phases: [{ type: 'burst', count: 1, durationMs: 5, agents: [] }] }, { phases: [{ type: 'burst', count: 1, durationMs: 5, agents: ['__proto__'] }] },
    { phases: [{ type: 'burst', count: 1, durationMs: 5, agents: Array.from({ length: 17 }, (_, i) => `a${i}`) }] },
    { phases: [{ type: 'burst', count: 1, durationMs: 5, callMs: -1 }] }, { phases: [{ type: 'burst', count: 1, durationMs: 5, node: 8 }] },
    JSON.parse('{"phases":[{"type":"idle","durationMs":1}],"__proto__":{"x":1}}'),
  ];
  for (const profile of bad) assert.equal(code(() => validateProfile(profile)), 'invalid_profile', JSON.stringify(profile)?.slice(0, 90));
});

test('the largest allowed run finishes quickly and its answer stays a sane size', () => {
  const t0 = Date.now();
  const r = runLoad({ engine: 'inflight', config: { maxInFlight: 1000 }, profile: { tickMs: 1000, phases: [{ type: 'steady', ratePerSec: 1000, durationMs: 20000, callMs: 600000 }] } });
  assert.equal(r.totals.requests, 20000);
  assert.equal(r.totals.allowed, 1000);
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(JSON.stringify(r).length < 300_000);
});

test('an unknown engine and a bad config are refused before anything runs', () => {
  const profile = { phases: [{ type: 'idle', durationMs: 5 }] };
  assert.equal(code(() => runLoad({ engine: 'nope', config: {}, profile })), 'invalid_config');
  assert.equal(code(() => runLoad({ engine: '__proto__', config: {}, profile })), 'invalid_config');
  assert.equal(code(() => runLoad({ engine: 'bucket', config: { capacity: -1, refillPerSec: 1 }, profile })), 'invalid_config');
});

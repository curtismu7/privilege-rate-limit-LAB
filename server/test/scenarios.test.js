import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, evaluate, getPath, runScenario } from '../src/scenarios.js';
import { callDurationMs } from '../src/slowCall.js';

const EXPECTED_IDS = [
  'burst-drains-and-refills', 'bucket-vs-fixed-window', 'inflight-refuses-at-low-rate', 'cluster-without-shared-limit',
  'cluster-with-shared-limit', 'app-cap-exhausted-by-one-agent', 'refusal-recorded',
];

test('the scenarios are the seven the spec names, as data with an expected result each', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), EXPECTED_IDS);
  for (const s of SCENARIOS) {
    assert.ok(s.title && s.story, s.id);
    assert.ok(s.expect.length >= 2, `${s.id} has expected results`);
    assert.equal(JSON.stringify(s).includes('function'), false, 'plain data');
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s, `${s.id} survives a JSON round trip`);
  }
});

for (const id of EXPECTED_IDS) {
  test(`scenario ${id}: every expected result holds`, () => {
    const r = runScenario(id);
    const failed = r.checks.filter((c) => !c.pass).map((c) => `${c.path} ${c.op} ${c.wanted} (got ${c.actual})`);
    assert.deepEqual(failed, []);
    assert.equal(r.ok, true);
    for (const c of r.checks) assert.notEqual(c.actual, undefined, `${c.path} resolves to a value`);
  });
}

test('the check evaluator is not vacuous: a wrong expectation fails', () => {
  const runs = { a: { totals: { allowed: 5 } }, b: { totals: { allowed: 7 } } };
  const [eq, gt, nope] = evaluate([
    { path: 'a.totals.allowed', op: 'eq', value: 6 }, { path: 'a.totals.allowed', op: 'gt', than: 'b.totals.allowed' }, { path: 'a.missing.path', op: 'eq', value: 1 },
  ], runs);
  assert.deepEqual([eq.pass, gt.pass, nope.pass], [false, false, false]);
  assert.equal(getPath({ a: 1 }, '__proto__.x'), undefined);
});

test('burst scenario: tokens climb continuously and a second burst finds the bucket full', () => {
  const s = runScenario('burst-drains-and-refills').runs.bucket;
  assert.deepEqual(s.series.map((x) => x.tokens), [2, 4, 6, 8, 10, 2]);
  assert.deepEqual(s.series.map((x) => x.allowed), [10, 0, 0, 0, 0, 10]);
});

test('bucket vs window: the window resets all at once at the edge, the bucket does not', () => {
  const { bucket, window: win } = runScenario('bucket-vs-fixed-window').runs;
  assert.deepEqual([win.totals.allowed, bucket.totals.allowed], [20, 11]);
  assert.equal(win.series[18].tokens, 0, 'half a second after the first burst the window is empty');
  assert.equal(win.series[19].tokens, 10, 'and at the edge it is full again, all at once');
  assert.equal(bucket.series[18].tokens, 0.5);
  assert.equal(bucket.series[19].tokens, 1, 'the bucket has refilled one token in that second');
});

test('in-flight scenario: the slow call is the provider stub\'s slow call, and a bucket would have served every request', () => {
  assert.equal(callDurationMs('slow', 400), 4000);
  assert.equal(callDurationMs('healthy', 400), 400);
  const { inflight, bucket } = runScenario('inflight-refuses-at-low-rate').runs;
  assert.equal(inflight.profile.phases[0].callMs, 4000);
  assert.deepEqual(inflight.refusals.map((r) => [r.t, r.retryAfterMs]), [[2000, 2000], [3000, 1000]]);
  assert.equal(bucket.totals.refused, 0);
});

test('cluster scenarios: double without sharing, once with it', () => {
  assert.equal(runScenario('cluster-without-shared-limit').runs.cluster.totals.allowed, 20);
  assert.equal(runScenario('cluster-with-shared-limit').runs.cluster.totals.allowed, 10);
});

test('app cap scenario: agent-b is refused at the app layer although it never used its own key cap', () => {
  const r = runScenario('app-cap-exhausted-by-one-agent').runs.app;
  assert.deepEqual(r.byAgent['agent-b'], { allowed: 0, refused: 3, errors: 0 });
  assert.equal(r.refusals.every((x) => x.layer === 'app'), true);
});

test('refusal scenario: the client view is recorded and marked UNVERIFIED', () => {
  const [first] = runScenario('refusal-recorded').runs.bucket.refusals;
  assert.equal(first.client.status, 429);
  assert.equal(first.client.headers['Retry-After'], '1');
  assert.equal(first.client.unverified, true);
  assert.match(first.client.note, /UNVERIFIED/);
});

test('no scenario mentions fallback behaviour as a fact (owner decision: no opinion)', () => {
  const text = JSON.stringify(SCENARIOS);
  assert.equal(/fall ?back/i.test(text), false);
});

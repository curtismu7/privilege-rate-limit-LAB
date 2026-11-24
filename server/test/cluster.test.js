import test from 'node:test';
import assert from 'node:assert/strict';
import { createCluster } from '../src/cluster.js';
import { newClock, code } from './helpers.js';

const bucket10 = { kind: 'bucket', capacity: 10, refillPerSec: 1 };
const burst = (c, n, req = {}) => Array.from({ length: n }, () => c.take(req));
const count = (ds, o) => ds.filter((d) => d.outcome === o).length;

test('without a shared store each node allows the full limit (double for two nodes)', () => {
  const c = createCluster({ nodes: 2, shared: false, limit: bucket10 }, newClock());
  const ds = burst(c, 20);
  assert.equal(count(ds, 'allowed'), 20);
  assert.deepEqual([0, 1].map((n) => ds.filter((d) => d.node === n).length), [10, 10], 'requests were spread over both nodes');
});

test('with a shared store the limit is counted once', () => {
  const c = createCluster({ nodes: 2, shared: true, limit: bucket10 }, newClock());
  const ds = burst(c, 20);
  assert.equal(count(ds, 'allowed'), 10);
  assert.equal(count(ds, 'refused'), 10);
});

test('the shared limit holds whichever node a client lands on', () => {
  const c = createCluster({ nodes: 3, shared: true, limit: bucket10 }, newClock());
  const ds = [...burst(c, 6, { node: 0 }), ...burst(c, 6, { node: 2 })];
  assert.equal(count(ds, 'allowed'), 10);
});

test('without sharing, pinning every request to one node stops at that node\'s own limit', () => {
  const c = createCluster({ nodes: 2, shared: false, limit: bucket10 }, newClock());
  assert.equal(count(burst(c, 15, { node: 0 }), 'allowed'), 10);
  assert.equal(c.take({ node: 1 }).allowed, true, 'the other node still has its own full limit');
});

test('nodes x limit: three unshared nodes allow three times the limit', () => {
  const c = createCluster({ nodes: 3, shared: false, limit: { kind: 'fixedWindow', limit: 4, windowMs: 1000 } }, newClock());
  assert.equal(count(burst(c, 30), 'allowed'), 12);
});

test('shared in-flight cap is counted once across nodes; unshared is per node', () => {
  const lim = { kind: 'inflight', maxInFlight: 2 };
  const shared = createCluster({ nodes: 2, shared: true, limit: lim }, newClock());
  const own = createCluster({ nodes: 2, shared: false, limit: lim }, newClock());
  assert.equal(count(burst(shared, 6, { callMs: 5000 }), 'allowed'), 2);
  assert.equal(count(burst(own, 6, { callMs: 5000 }), 'allowed'), 4);
});

test('shared store unavailable gives the named error, not a limit refusal, and says the behaviour is unverified', () => {
  const c = createCluster({ nodes: 2, shared: true, limit: bucket10 }, newClock());
  c.store.setAvailable(false);
  const d = c.take();
  assert.equal(d.outcome, 'error');
  assert.equal(d.error, 'shared_store_unavailable');
  assert.equal(d.allowed, false);
  assert.match(d.unverified, /not known/);
  c.store.setAvailable(true);
  assert.equal(c.take().allowed, true, 'the store coming back serves again, and nothing was spent while it was down');
  assert.equal(c.sample().tokens, 9);
});

test('storeAvailable false at config makes a shared cluster answer the named error', () => {
  const c = createCluster({ nodes: 2, shared: true, storeAvailable: false, limit: bucket10 }, newClock());
  assert.equal(count(burst(c, 5), 'error'), 5);
});

test('an unshared cluster does not use the store at all', () => {
  const c = createCluster({ nodes: 2, shared: false, storeAvailable: false, limit: bucket10 }, newClock());
  assert.equal(c.store, null);
  assert.equal(c.take().allowed, true);
});

test('config: node count and limit are bounded and validated', () => {
  const ok = { nodes: 2, shared: true, limit: bucket10 };
  for (const nodes of [0, -1, 9, 1.5, '2', NaN]) assert.equal(code(() => createCluster({ ...ok, nodes }, newClock())), 'invalid_config', String(nodes));
  for (const limit of [undefined, { kind: 'bucket', capacity: 0, refillPerSec: 1 }, { kind: 'nope' }, { capacity: 1, refillPerSec: 1 }, null, { kind: 'bucket', capacity: 1, refillPerSec: 1, x: 1 }]) {
    assert.equal(code(() => createCluster({ ...ok, limit }, newClock())), 'invalid_config', JSON.stringify(limit));
  }
  assert.equal(code(() => createCluster({ ...ok, shared: 'yes' }, newClock())), 'invalid_config');
  assert.equal(code(() => createCluster({ ...ok, extra: 1 }, newClock())), 'invalid_config');
  assert.equal(code(() => createCluster({ ...ok, nodes: 8 }, newClock())), null);
});

test('a request for a node that does not exist is refused', () => {
  const c = createCluster({ nodes: 2, shared: false, limit: bucket10 }, newClock());
  for (const node of [2, -1, 1.5, '0']) assert.equal(code(() => c.take({ node })), 'invalid_request', String(node));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBucket, tokensAt } from '../src/bucket.js';
import { newClock, code } from './helpers.js';

const state = (o = {}) => Object.freeze({ capacity: 10, refillPerSec: 2, tokens: 0, atMs: 0, ...o });

test('tokensAt is a pure, linear, capped function of time', () => {
  const s = state();
  assert.equal(tokensAt(s, 0), 0);
  assert.equal(tokensAt(s, 500), 1);       // 2 per second for half a second
  assert.equal(tokensAt(s, 2500), 5);
  assert.equal(tokensAt(s, 4999), 9.998);
  assert.equal(tokensAt(s, 5000), 10);     // full
  assert.equal(tokensAt(s, 600000), 10);   // never above capacity
  assert.equal(tokensAt(state({ tokens: 3, atMs: 1000 }), 1500), 4);
  assert.deepEqual({ ...s }, { capacity: 10, refillPerSec: 2, tokens: 0, atMs: 0 }, 'the state is not touched');
});

test('refill rate: tokensAt follows refillPerSec exactly', () => {
  for (const rate of [0.5, 1, 3, 7.25]) assert.equal(tokensAt(state({ refillPerSec: rate, capacity: 1000 }), 4000), 4 * rate);
});

test('tokensAt refuses a time before the last update (the clock never goes backwards)', () => {
  assert.equal(code(() => tokensAt(state({ atMs: 1000 }), 999)), 'clock_backwards');
  assert.equal(code(() => tokensAt(state(), NaN)), 'clock_backwards');
});

test('the kit clock refuses to be set backwards', () => {
  const c = newClock(500);
  assert.throws(() => c.set(499), RangeError);
  assert.equal(c.now(), 500);
});

test('a burst bigger than capacity serves only the capacity and refuses the rest', () => {
  const b = createBucket({ capacity: 10, refillPerSec: 2 }, newClock());
  const out = Array.from({ length: 15 }, () => b.take());
  assert.equal(out.filter((d) => d.allowed).length, 10);
  assert.equal(out.filter((d) => !d.allowed).length, 5);
  assert.equal(out[10].reason, 'bucket_empty');
  assert.equal(b.tokens(), 0);
});

test('refusal carries a retry-after in ms, and waiting that long always works', () => {
  for (const [capacity, refillPerSec] of [[10, 2], [5, 0.3], [3, 7], [1, 1 / 3]]) {
    const clock = newClock();
    const b = createBucket({ capacity, refillPerSec }, clock);
    for (let i = 0; i < capacity; i++) assert.ok(b.take().allowed);
    const d = b.take();
    assert.equal(d.allowed, false);
    assert.ok(Number.isInteger(d.retryAfterMs) && d.retryAfterMs > 0);
    clock.advance(d.retryAfterMs - 1);
    assert.equal(b.peek().allowed, false, `one ms early must still refuse (${capacity}, ${refillPerSec})`);
    clock.advance(1);
    assert.equal(b.take().allowed, true, `after exactly retryAfterMs it must serve (${capacity}, ${refillPerSec})`);
  }
});

test('refill is continuous: tokens climb between requests', () => {
  const clock = newClock();
  const b = createBucket({ capacity: 10, refillPerSec: 2 }, clock);
  for (let i = 0; i < 10; i++) b.take();
  const seen = [];
  for (let i = 0; i < 5; i++) { clock.advance(1000); seen.push(b.tokens()); }
  assert.deepEqual(seen, [2, 4, 6, 8, 10]);
});

test('a request costing more than the capacity is refused with no retry hint', () => {
  const b = createBucket({ capacity: 5, refillPerSec: 1 }, newClock());
  const d = b.take({ cost: 6 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'cost_exceeds_capacity');
  assert.equal(d.retryAfterMs, null);
  assert.equal(b.tokens(), 5, 'nothing was spent');
});

test('a start balance above capacity is clamped and flagged; zero starts empty', () => {
  const b = createBucket({ capacity: 10, refillPerSec: 1, initialTokens: 50 }, newClock());
  assert.equal(b.tokens(), 10);
  assert.equal(b.config.initialClamped, true);
  const e = createBucket({ capacity: 10, refillPerSec: 1, initialTokens: 0 }, newClock());
  assert.equal(e.take().allowed, false);
});

test('config: zero, negative, non-finite, non-number, unknown and oversized values are refused', () => {
  const bad = [
    { capacity: 0, refillPerSec: 1 }, { capacity: -1, refillPerSec: 1 }, { capacity: 1, refillPerSec: 0 }, { capacity: 1, refillPerSec: -2 },
    { capacity: NaN, refillPerSec: 1 }, { capacity: Infinity, refillPerSec: 1 }, { capacity: '10', refillPerSec: 1 }, { capacity: 1 },
    { capacity: 1, refillPerSec: 1, initialTokens: -1 }, { capacity: 1, refillPerSec: 1, extra: 1 }, { capacity: 1e9, refillPerSec: 1 },
    JSON.parse('{"capacity":1,"refillPerSec":1,"__proto__":{"x":1}}'), null, [], 'x',
  ];
  for (const c of bad) assert.equal(code(() => createBucket(c, newClock())), 'invalid_config', JSON.stringify(c));
});

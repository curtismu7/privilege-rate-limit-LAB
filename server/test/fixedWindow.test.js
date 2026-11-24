import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindow, windowStartAt } from '../src/fixedWindow.js';
import { newClock, code } from './helpers.js';

test('windowStartAt aligns windows to lab time 0', () => {
  assert.equal(windowStartAt(1000, 0), 0);
  assert.equal(windowStartAt(1000, 999), 0);
  assert.equal(windowStartAt(1000, 1000), 1000);
  assert.equal(windowStartAt(10000, 25000), 20000);
});

test('the limit holds inside a window and everything resets at once at the edge', () => {
  const clock = newClock();
  const w = createFixedWindow({ limit: 3, windowMs: 1000 }, clock);
  clock.set(999);
  assert.deepEqual([1, 2, 3].map(() => w.take().allowed), [true, true, true]);
  const refused = w.take();
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'window_full');
  assert.equal(refused.retryAfterMs, 1, 'the edge is 1 ms away');
  clock.set(1000);
  assert.deepEqual([1, 2, 3].map(() => w.take().allowed), [true, true, true], 'a fresh window serves the full limit');
  assert.equal(w.take().allowed, false);
});

test('the window does not reset in the middle of itself', () => {
  const clock = newClock();
  const w = createFixedWindow({ limit: 2, windowMs: 1000 }, clock);
  w.take(); w.take();
  clock.set(500);
  assert.equal(w.take().allowed, false);
  assert.equal(w.take().retryAfterMs, 500);
  assert.equal(w.sample().tokens, 0);
});

test('sample reports the reset at the edge', () => {
  const clock = newClock();
  const w = createFixedWindow({ limit: 4, windowMs: 1000 }, clock);
  w.take(); w.take();
  assert.equal(w.sample().tokens, 2);
  clock.set(1000);
  assert.equal(w.sample().tokens, 4);
});

test('config: zero, negative, fractional and unknown values are refused', () => {
  for (const c of [{ limit: 0, windowMs: 1000 }, { limit: -1, windowMs: 1000 }, { limit: 1, windowMs: 0 }, { limit: 1.5, windowMs: 1000 }, { limit: 1, windowMs: 1000, x: 1 }, { limit: 1 }, { limit: 1, windowMs: 99999999 }]) {
    assert.equal(code(() => createFixedWindow(c, newClock())), 'invalid_config', JSON.stringify(c));
  }
});

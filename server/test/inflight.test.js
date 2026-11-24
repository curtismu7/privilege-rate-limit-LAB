import test from 'node:test';
import assert from 'node:assert/strict';
import { createInflight } from '../src/inflight.js';
import { newClock, code } from './helpers.js';

test('slow calls hold slots and the next call is refused although the request rate is low', () => {
  const clock = newClock();
  const f = createInflight({ maxInFlight: 2 }, clock);
  assert.ok(f.take({ callMs: 4000 }).allowed);   // t=0, ends 4000
  clock.set(1000);
  assert.ok(f.take({ callMs: 4000 }).allowed);   // ends 5000
  clock.set(2000);
  const d = f.take({ callMs: 4000 });            // one request a second: still refused
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'in_flight_cap');
  assert.equal(d.retryAfterMs, 2000);
  assert.equal(f.inFlight(), 2);
});

test('slots are released on the lab clock, at the instant a call ends', () => {
  const clock = newClock();
  const f = createInflight({ maxInFlight: 1 }, clock);
  assert.ok(f.take({ callMs: 1000 }).allowed);
  clock.set(999);
  assert.equal(f.take({ callMs: 1000 }).allowed, false, 'still held 1 ms before the end');
  clock.set(1000);
  assert.equal(f.inFlight(), 0, 'released exactly at the end');
  assert.ok(f.take({ callMs: 1000 }).allowed);
  clock.advance(5000);
  assert.equal(f.inFlight(), 0, 'a slot is never held forever');
});

test('a refused call holds nothing, and peek spends nothing', () => {
  const clock = newClock();
  const f = createInflight({ maxInFlight: 1 }, clock);
  f.take({ callMs: 100 });
  f.take({ callMs: 100 });
  assert.equal(f.inFlight(), 1);
  clock.set(100);
  assert.equal(f.peek().allowed, true);
  assert.equal(f.peek().allowed, true);
  assert.equal(f.inFlight(), 0);
});

test('a zero-length call holds no slot', () => {
  const f = createInflight({ maxInFlight: 1 }, newClock());
  for (let i = 0; i < 5; i++) assert.ok(f.take({ callMs: 0 }).allowed);
  assert.equal(f.inFlight(), 0);
});

test('hostile callMs and config are refused', () => {
  const f = createInflight({ maxInFlight: 1 }, newClock());
  for (const callMs of [-1, NaN, Infinity, 1e12]) assert.equal(code(() => f.take({ callMs })), 'invalid_request');
  for (const c of [{ maxInFlight: 0 }, { maxInFlight: -3 }, { maxInFlight: 1.5 }, { maxInFlight: 1e6 }, {}, { maxInFlight: 1, x: 2 }]) {
    assert.equal(code(() => createInflight(c, newClock())), 'invalid_config', JSON.stringify(c));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppCaps } from '../src/appCaps.js';
import { newClock, code } from './helpers.js';

const cfg = (o = {}) => ({ kind: 'mcp', appRpm: 12, appMaxConcurrent: 50, keyRpm: 30, keyMaxConcurrent: 50, ...o });

test('one agent exhausts the app-wide cap and another agent, far from its own key cap, is refused at the app layer', () => {
  const clock = newClock();
  const app = createAppCaps(cfg(), clock);
  for (let i = 0; i < 12; i++) assert.ok(app.take({ agent: 'agent-a' }).allowed);
  clock.advance(1000);
  const d = app.take({ agent: 'agent-b' });
  assert.equal(d.allowed, false);
  assert.equal(d.layer, 'app');
  assert.equal(d.reason, 'app_rpm');
  assert.equal(d.agent, 'agent-b');
  assert.ok(d.retryAfterMs > 0);
  const s = app.sample();
  assert.ok(s.byKey['agent-b'].tokens >= 29.9, 'agent-b has used none of its own key cap');
  assert.ok(s.byKey['agent-a'].tokens <= 18.6, 'agent-a used 12 of its 30 (plus a second of refill)');
});

test('a key cap is separate from the app cap: the greedy agent is stopped at its own key, others are untouched', () => {
  const app = createAppCaps(cfg({ appRpm: 600, keyRpm: 5 }), newClock());
  const a = Array.from({ length: 8 }, () => app.take({ agent: 'agent-a' }));
  assert.equal(a.filter((d) => d.allowed).length, 5);
  assert.equal(a[5].layer, 'key');
  assert.equal(a[5].reason, 'key_rpm');
  assert.equal(app.take({ agent: 'agent-b' }).allowed, true, 'the other key is served');
});

test('a key-level refusal spends nothing at the app level', () => {
  const app = createAppCaps(cfg({ appRpm: 12, keyRpm: 2 }), newClock());
  const before = app.sample().tokens;
  for (let i = 0; i < 10; i++) app.take({ agent: 'agent-a' });
  assert.equal(app.sample().tokens, before - 2, 'only the 2 allowed calls were charged to the app');
});

test('app max-concurrent is shared by every key; key max-concurrent is per key', () => {
  const clock = newClock();
  const app = createAppCaps(cfg({ appRpm: 600, keyRpm: 600, appMaxConcurrent: 3, keyMaxConcurrent: 10 }), clock);
  for (let i = 0; i < 3; i++) assert.ok(app.take({ agent: 'agent-a', callMs: 5000 }).allowed);
  const d = app.take({ agent: 'agent-b', callMs: 5000 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'app_concurrent');
  clock.advance(5000);
  assert.ok(app.take({ agent: 'agent-b', callMs: 5000 }).allowed, 'slots were released on the lab clock');

  const k = createAppCaps(cfg({ appRpm: 600, keyRpm: 600, appMaxConcurrent: 50, keyMaxConcurrent: 2 }), newClock());
  k.take({ agent: 'agent-a', callMs: 5000 }); k.take({ agent: 'agent-a', callMs: 5000 });
  assert.equal(k.take({ agent: 'agent-a', callMs: 5000 }).reason, 'key_concurrent');
  assert.equal(k.take({ agent: 'agent-b', callMs: 5000 }).allowed, true);
});

test('MCP and A2A apps both work and are labelled', () => {
  for (const kind of ['mcp', 'a2a']) assert.equal(createAppCaps(cfg({ kind }), newClock()).config.kind, kind);
  assert.equal(code(() => createAppCaps(cfg({ kind: 'rest' }), newClock())), 'invalid_config');
});

test('config: every cap is required and positive', () => {
  for (const k of ['appRpm', 'appMaxConcurrent', 'keyRpm', 'keyMaxConcurrent']) {
    for (const v of [0, -1, NaN, 1.5, '3', undefined]) assert.equal(code(() => createAppCaps(cfg({ [k]: v }), newClock())), 'invalid_config', `${k}=${v}`);
  }
  assert.equal(code(() => createAppCaps(cfg({ extra: 1 }), newClock())), 'invalid_config');
});

test('hostile agent ids and too many agents are refused', () => {
  const app = createAppCaps(cfg(), newClock());
  for (const agent of ['__proto__', 'a b', '', 'x'.repeat(41), 7, '<script>', 'constructor.x']) assert.equal(code(() => app.take({ agent })), 'invalid_request', String(agent));
  for (let i = 0; i < 16; i++) app.take({ agent: `agent-${i}` });
  assert.equal(code(() => app.take({ agent: 'agent-17' })), 'invalid_request');
  assert.equal(app.take({ agent: 'agent-3' }).outcome !== undefined, true, 'a known agent still works');
});

test('a bad callMs is refused before anything is spent', () => {
  const app = createAppCaps(cfg(), newClock());
  const before = app.sample().tokens;
  assert.equal(code(() => app.take({ agent: 'agent-a', callMs: -5 })), 'invalid_request');
  assert.equal(app.sample().tokens, before);
});

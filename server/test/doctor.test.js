import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../src/checks.js';
import { allPassed } from '../src/doctor.js';
import { SCENARIOS } from '../src/scenarios.js';
import { BANNER, OPEN_QUESTION } from '../src/banner.js';

test('every doctor check passes, and every scenario has its own check', () => {
  const checks = runChecks({});
  assert.equal(allPassed(checks), true, JSON.stringify(checks.filter((c) => c.level === 'fail')));
  for (const sc of SCENARIOS) assert.equal(checks.find((c) => c.id === `scenario:${sc.id}`)?.level, 'pass', sc.id);
  for (const id of ['node', 'banner', 'bind', 'kit-pin', 'config-validation']) assert.ok(checks.find((c) => c.id === id), id);
});

test('doctor fails on a non-loopback bind and on a reserved port', () => {
  assert.equal(runChecks({ PRL_BIND: '' , PORT: '8080' }).find((c) => c.id === 'bind').level, 'fail');
});

test('the banner says what is simulated and that the rest is unverified; the open question shows no opinion', () => {
  assert.match(BANNER, /SIMULATED/);
  assert.match(BANNER, /2026-11-21/);
  assert.match(BANNER, /UNVERIFIED/);
  assert.match(OPEN_QUESTION, /no opinion/i);
});

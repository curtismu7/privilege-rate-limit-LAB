import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, startHttpServer } from '../src/app.js';
import { SCENARIOS } from '../src/scenarios.js';

let server; let base; let port;
before(async () => {
  ({ server, url: base } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ env: { LAB_ALLOWED_HOSTS: 'lab.example' } }) }));
  port = server.address().port;
  base = base.replace(/\/$/, '');
});
after(() => new Promise((r) => server.close(r)));

const J = { 'content-type': 'application/json' };
const post = (p, body, headers = {}) => fetch(`${base}${p}`, { method: 'POST', headers: { ...J, origin: base, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) });
// fetch cannot set Host, so raw http for Host tests.
const raw = (method, p, headers) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
  req.on('error', reject); req.end(method === 'POST' ? '{}' : undefined);
});

test('GET /api/health is demo-health/1 and ready', async () => {
  const j = await (await fetch(`${base}/api/health`)).json();
  assert.equal(j.schema, 'demo-health/1');
  assert.equal(j.state, 'ready');
  assert.equal(j.runtime, 'offline');
  assert.equal(j.demo.id, 'privilege-rate-limit-lab');
});

test('GET /api/info: mock, Real not available with a plain reason, banner says UNVERIFIED', async () => {
  const j = await (await fetch(`${base}/api/info`)).json();
  assert.equal(j.source, 'mock');
  assert.equal(j.mode, 'mock');
  assert.equal(j.realAvailable, false);
  assert.match(j.realReason, /not built yet/);
  assert.match(j.banner, /UNVERIFIED/);
  assert.match(j.openQuestion, /no opinion/i);
  assert.deepEqual(j.scenarios, SCENARIOS.map((s) => s.id));
});

test('POST /api/mode: mock is fine, real and live are refused with a plain message, anything else is a 400', async () => {
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  for (const source of ['real', 'live']) {
    const r = await post('/api/mode', { source });
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.equal(j.error, 'real_not_available');
    assert.match(j.message, /not built yet/);
  }
  for (const body of [{}, { source: 'moon' }, { source: 5 }, { source: 'mock', x: 1 }, [], 'x']) assert.equal((await post('/api/mode', body)).status, 400, JSON.stringify(body));
});

test('GET /api/scenarios lists the data, with the expected results', async () => {
  const j = await (await fetch(`${base}/api/scenarios`)).json();
  assert.equal(j.scenarios.length, 7);
  assert.ok(j.scenarios.every((s) => s.expect.length && s.runs));
});

for (const sc of SCENARIOS) {
  test(`POST /api/scenario/${sc.id} runs and meets its expected results`, async () => {
    const r = await post(`/api/scenario/${sc.id}`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.ok(Object.keys(j.runs).length >= 1);
  });
}

test('unknown scenario is 404 and named', async () => {
  const r = await post('/api/scenario/nope');
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'unknown_scenario');
  assert.equal((await post('/api/scenario/__proto__')).status, 404);
});

test('POST /api/run replays a profile and returns a time series', async () => {
  const r = await post('/api/run', { engine: 'bucket', config: { capacity: 4, refillPerSec: 1 }, profile: { phases: [{ type: 'burst', count: 6, durationMs: 1000 }] } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.totals.allowed, 4);
  assert.equal(j.series.length, 1);
  assert.equal(j.refusals[0].client.status, 429);
});

test('POST /api/run refuses bad input with named errors', async () => {
  const phases = [{ type: 'idle', durationMs: 10 }];
  const cases = [
    [{ engine: 'bucket', config: { capacity: 0, refillPerSec: 1 }, profile: { phases } }, 'invalid_config'],
    [{ engine: 'inflight', config: { maxInFlight: -2 }, profile: { phases } }, 'invalid_config'],
    [{ engine: 'nope', config: {}, profile: { phases } }, 'invalid_config'],
    [{ engine: 'bucket', config: { capacity: 1, refillPerSec: 1 }, profile: { phases: [] } }, 'invalid_profile'],
    [{ engine: 'bucket', config: { capacity: 1, refillPerSec: 1 }, profile: { phases: [{ type: 'burst', count: 99999, durationMs: 5 }] } }, 'invalid_profile'],
    [{ engine: 'bucket' }, 'invalid_config'],
    [{ engine: 'bucket', config: {}, profile: {}, extra: 1 }, 'invalid_request'],
  ];
  for (const [body, error] of cases) {
    const r = await post('/api/run', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal((await r.json()).error, error);
  }
  assert.equal((await post('/api/run', '{"engine":"bucket","config":{"__proto__":{"capacity":9}},"profile":{}}')).status, 400);
  assert.equal((await post('/api/run', '[]')).status, 400);
});

test('bad JSON is 400, an oversized body is 413, a non-JSON body is 415', async () => {
  const bad = await post('/api/run', '{nope');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'bad_json');
  const big = await post('/api/run', JSON.stringify({ engine: 'bucket', config: { pad: 'x'.repeat(70000) } }));
  assert.equal(big.status, 413);
  const r = await fetch(`${base}/api/reset`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: base }, body: 'hi' });
  assert.equal(r.status, 415);
});

test('POST /api/reset clears the run log', async () => {
  await post('/api/scenario/refusal-recorded');
  assert.ok((await (await fetch(`${base}/api/info`)).json()).runsSinceReset >= 1);
  const j = await (await post('/api/reset')).json();
  assert.equal(j.reset, 'ok');
  assert.ok(j.cleared >= 1);
  assert.equal((await (await fetch(`${base}/api/info`)).json()).runsSinceReset, 0);
});

test('unknown API paths and methods answer JSON, never HTML', async () => {
  const r = await fetch(`${base}/api/nope`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'not_found');
  assert.equal((await fetch(`${base}/api/health`, { method: 'POST', headers: { ...J, origin: base }, body: '{}' })).status, 405);
});

test('Host check: a foreign or malformed Host is 421; an allowed name is served', async () => {
  for (const host of ['evil.example', 'evil.example:7837', '[::1]evil', '127.0.0.1.evil.example', 'a b']) {
    const r = await raw('GET', '/api/info', { host });
    assert.equal(r.status, 421, host);
  }
  assert.equal((await raw('GET', '/api/info', { host: `127.0.0.1:${port}` })).status, 200);
  assert.equal((await raw('GET', '/api/info', { host: `localhost:${port}` })).status, 200);
  assert.equal((await raw('GET', '/api/info', { host: 'lab.example' })).status, 200);
});

test('same-origin writes: a cross-origin Origin or a cross-site fetch is 403', async () => {
  assert.equal((await post('/api/reset', {}, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('/api/reset', {}, { origin: 'https://127.0.0.1' })).status, 403);
  assert.equal((await post('/api/reset', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post('/api/reset', {}, { 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal((await post('/api/reset', {}, { origin: 'null' })).status, 403);
});

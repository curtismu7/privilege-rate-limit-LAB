// The web step's API: story, limits, diagram by name, workspaces (rule 13), observability (rule 27), traces (rule 25), static serving and the stdout line.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, startHttpServer } from '../src/app.js';
import { VERTICALS, unfilled } from '../src/cast.js';
import { DIAGRAM_NAMES, buildDiagram, hasDiagram, loadDiagram, rawDiagram } from '../src/diagramData.js';
import { validateDiagram } from '../src/diagramStudioValidate.js';
import { assertTrace } from '../src/gatewayTrace.js';
import { assertRunObservability, classify, defaultLayers } from '../src/runObservability.js';
import { decisionLine, labIso } from '../src/runObs.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import { SCENARIOS } from '../src/scenarios.js';
import { REPO_ROOT } from '../src/pin.js';

const lines = [];
let server; let base; let dist;
before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'prl-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>page</title>');
  ({ server, url: base } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ env: { WEB_DIST: dist }, log: (l) => lines.push(l) }) }));
  base = base.replace(/\/$/, '');
});
after(() => new Promise((r) => server.close(r)));

const J = { 'content-type': 'application/json' };
const post = (p, body, ws) => fetch(`${base}${p}`, { method: 'POST', headers: { ...J, origin: base, ...(ws ? { 'x-workspace': ws } : {}) }, body: JSON.stringify(body ?? {}) });
const get = (p, ws) => fetch(`${base}${p}`, { headers: ws ? { 'x-workspace': ws } : {} });

test('GET /api/story: filled for each vertical, falls back to the default, and carries the talk track and the page map', async () => {
  for (const v of Object.keys(VERTICALS)) {
    const r = await get(`/api/story?vertical=${v}`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    const s = await r.json();
    assert.equal(s.vertical, v);
    assert.equal(s.beats.length, SCENARIOS.length);
    assert.ok(s.talkTrack.length >= 10);
    const text = JSON.stringify(s);
    assert.ok(!text.includes('{{')); assert.deepEqual(unfilled(text, VERTICALS[v]), []);
    assert.deepEqual(scanHosts(text), []); assert.deepEqual(scanKeys(text), []);
  }
  assert.equal((await (await get('/api/story?vertical=zzz')).json()).vertical, 'finance');
  assert.equal((await (await get('/api/story?vertical=__proto__')).json()).vertical, 'finance');
});

test('GET /api/limits: the open question has no result, and the page data says nothing about fallback', async () => {
  const l = await (await get('/api/limits')).json();
  assert.equal(l.openQuestions.length, 1);
  assert.equal(l.openQuestions[0].status, 'open');
  assert.ok(!('result' in l.openQuestions[0]) && !('answer' in l.openQuestions[0]));
  assert.equal(l.releaseNotes.says.length, 4);
});

test('GET /api/diagram: rate-limit-bucket by name (diagram-studio/1 data), one step per arrow, unknown names are 404', async () => {
  assert.deepEqual(DIAGRAM_NAMES, ['rate-limit-bucket']);
  const doc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server/diagrams/rate-limit-bucket.json'), 'utf8'));
  assert.deepEqual(validateDiagram(doc), []); assert.equal(doc.schema, 'diagram-studio/1'); assert.equal(doc.id, 'rate-limit-bucket');
  assert.ok(loadDiagram('rate-limit-bucket') && rawDiagram('rate-limit-bucket') && hasDiagram('rate-limit-bucket'));
  for (const bad of ['', 'nope', '__proto__', 'constructor', '../diagrams/rate-limit-bucket', 'rate-limit-bucket.json', 'RATE-LIMIT-BUCKET', undefined, 7, null]) assert.equal(hasDiagram(bad), false, String(bad));
  const d = await (await get('/api/diagram?name=rate-limit-bucket&vertical=health')).json();
  assert.equal(d.name, 'rate-limit-bucket'); assert.equal(d.vertical, 'health');
  assert.equal(d.nodes.length, doc.nodes.length);
  assert.equal(d.steps.length, doc.edges.length, 'every arrow is a step, including the three refusal arrows of the studio step 5');
  const ids = new Set(d.nodes.map((n) => n.id));
  for (const n of d.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  for (const s of d.steps) { assert.ok(ids.has(s.from) && ids.has(s.to)); assert.ok(s.label && s.say); assert.ok(!/^\d/.test(s.label), 'the page numbers the arrows, so the studio number is dropped'); }
  assert.equal((await get('/api/diagram?name=nope')).status, 404);
  assert.equal((await get('/api/diagram')).status, 404);
  assert.equal(buildDiagram(VERTICALS.finance, 'rate-limit-bucket').title, doc.title);
});

test('the diagram data is the studio export it says it is (pinned by hash, so a hand edit fails)', () => {
  const pin = fs.readFileSync(path.join(REPO_ROOT, 'server/diagrams/rate-limit-bucket.sha256'), 'utf8').split('\n');
  assert.match(pin[0], /^# exported from diagram-studio-LAB branch feat\/model-gateway-diagrams @ [0-9a-f]{7,40} \(PR #35/);
  const [hash, file] = pin[1].split(/\s+/);
  assert.equal(file, 'rate-limit-bucket.json');
  assert.equal(createHashOf(path.join(REPO_ROOT, 'server/diagrams/rate-limit-bucket.json')), hash);
});
import { createHash } from 'node:crypto';
const createHashOf = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('every scenario answers with a trace per run that passes assertTrace, labelled mock, on a reserved host, with no real credential', async () => {
  for (const sc of SCENARIOS) {
    const out = await (await post(`/api/scenario/${sc.id}`, {}, `trace-${sc.id}`.slice(0, 40))).json();
    assert.equal(out.ok, true, sc.id);
    for (const [label, list] of Object.entries(out.traces)) {
      assert.ok(Array.isArray(list), `${sc.id}/${label}`);
      const run = out.runs[label];
      assert.equal(list.length > 0, run.totals.allowed > 0 || run.refusals.length > 0);
      list.forEach((ex, i) => {
        assert.equal(ex.step, i + 1);
        assert.deepEqual(assertTrace(ex.trace), [], `${sc.id}/${label}/${ex.step}`);
        assert.equal(ex.trace.source, 'mock');
        assert.ok(ex.trace.decisions.every((d) => d.basis === 'checked'), 'a simulated gateway only ever says checked');
        assert.match(ex.trace.request.url, /^https:\/\/gateway\.lab\.invalid\//);
        assert.match(ex.trace.request.headers.authorization, /MOCK/);
        assert.deepEqual(scanHosts(JSON.stringify(ex)), []);
      });
      // every refusal trace carries the lab-model label
      for (const ex of list.filter((e) => e.status >= 400)) assert.equal(ex.trace.response.body.unverified, 'the lab\'s model of the client\'s view');
    }
  }
});

test('a custom run answers with traces too, and the first refusal of each reason is traced once', async () => {
  const r = await (await post('/api/run', { engine: 'appCaps', config: { kind: 'a2a', appRpm: 3, appMaxConcurrent: 5, keyRpm: 2, keyMaxConcurrent: 5 }, profile: { phases: [{ type: 'burst', count: 6, durationMs: 1000, agents: ['agent-a', 'agent-b'] }] } })).json();
  assert.ok(r.traces.length >= 2);
  const reasons = r.traces.filter((e) => e.status === 429).map((e) => e.title.split(',')[0]);
  assert.equal(new Set(reasons).size, reasons.length, 'one refusal trace per distinct reason');
  assert.ok(r.traces[0].trace.request.url.includes('/a2a/'));
  assert.deepEqual(r.traces.flatMap((e) => assertTrace(e.trace)), []);
});

test('rule 27: /api/observability is empty before a run, then holds the latest run as a mock record that passes assertRunObservability', async () => {
  const ws = 'obs-ws-1';
  const empty = await (await get('/api/observability', ws)).json();
  assert.equal(empty.record, null); assert.equal(empty.run, null);
  assert.ok(empty.streams.length >= 1);
  await post('/api/scenario/app-cap-exhausted-by-one-agent', {}, ws);
  const j = await (await get('/api/observability', ws)).json();
  assert.equal(j.run.id, 'app-cap-exhausted-by-one-agent');
  const rec = j.record;
  assert.equal(rec.source, 'mock');
  assert.deepEqual(assertRunObservability(rec), []);
  assert.ok(rec.rows.some((r) => r.layer === 'gateway' && r.origin === 'simulated' && r.outcome === 'refused'));
  assert.ok(rec.rows.every((r) => r.origin === 'simulated' || r.origin === 'not-logged'), 'a mock record holds only simulated and not-logged rows');
  assert.equal(rec.coverage.gateway, 'simulated');
  for (const layer of ['person', 'agent', 'authorize', 'privilege', 'resource']) assert.equal(rec.coverage[layer], 'not-logged', layer);
  assert.ok(rec.rows.every((r) => !r.at || /^2026-11-02T09:/.test(r.at)), 'lab time on the fixed lab date, never the real clock');
  assert.equal(rec.summary.refused, 3); assert.equal(rec.summary.allowed, 1);
  // a second run replaces the first as "the latest run"
  await post('/api/scenario/refusal-recorded', {}, ws);
  assert.equal((await (await get('/api/observability', ws)).json()).run.id, 'refusal-recorded');
});

test('rule 27: a custom run with an unavailable shared store records the error as information, never as a refusal, and claims nothing about fail-open or fail-closed', async () => {
  const ws = 'obs-ws-2';
  await post('/api/run', { engine: 'cluster', config: { nodes: 2, shared: true, storeAvailable: false, limit: { kind: 'bucket', capacity: 5, refillPerSec: 1 } }, profile: { phases: [{ type: 'burst', count: 4, durationMs: 1000 }] } }, ws);
  const rec = (await (await get('/api/observability', ws)).json()).record;
  assert.deepEqual(assertRunObservability(rec), []);
  const row = rec.rows.find((r) => /shared store unavailable/.test(r.message));
  assert.equal(row.outcome, 'info');
  assert.match(row.message, /no claim about fail-open or fail-closed/);
});

test('rule 13: workspaces keep runs apart, Reset clears only the current workspace, and a bad id is refused without being echoed', async () => {
  await post('/api/scenario/refusal-recorded', {}, 'ws-a'); await post('/api/scenario/refusal-recorded', {}, 'ws-a');
  await post('/api/scenario/refusal-recorded', {}, 'ws-b');
  assert.equal((await (await get('/api/info', 'ws-a')).json()).runsSinceReset, 2);
  assert.equal((await (await get('/api/info', 'ws-b')).json()).runsSinceReset, 1);
  assert.equal((await (await get('/api/info', 'ws-a')).json()).workspace, 'ws-a');
  const reset = await (await post('/api/reset', {}, 'ws-a')).json();
  assert.equal(reset.cleared, 2);
  assert.equal((await (await get('/api/info', 'ws-a')).json()).runsSinceReset, 0);
  assert.equal((await (await get('/api/info', 'ws-b')).json()).runsSinceReset, 1);
  assert.equal((await (await get('/api/observability', 'ws-a')).json()).record, null, 'Reset cleared the latest run too');
  for (const bad of ['sk-live-abc123', 'UPPER', 'a b', 'x'.repeat(41), 'eyJhbGciOiJIUzI1NiJ9', 'abcdef0123456789abcdef0123456789']) {
    const r = await get('/api/info', bad);
    assert.equal(r.status, 400, bad); const body = await r.text();
    assert.ok(!body.includes(bad), 'the refused id is never echoed'); assert.equal(JSON.parse(body).error, 'bad_workspace');
  }
  assert.equal((await get('/api/info')).status, 200, 'no header is the default workspace');
});

test('rule 27: one stdout line per decision, with a lab timestamp, an actor and an outcome, and no word a shared matcher reads as a product decision', async () => {
  lines.length = 0;
  await post('/api/scenario/app-cap-exhausted-by-one-agent', {}, 'ws-log');
  assert.equal(lines.length, 4);
  for (const l of lines) {
    assert.match(l, /^2026-11-02T09:00:0\d\.\d{3}Z privilege-rate-limit-lab decision actor=[A-Za-z0-9._:@-]+ outcome=[a-z]+ code=[A-Za-z0-9._:@-]+ run=r\d+$/);
    assert.ok(!/refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served/i.test(l.replace(/code=\S+/, '')), l);
    for (const layer of defaultLayers()) for (const product of layer.products) assert.equal(classify(l, [], () => {}) ?? null, null, `${product}: ${l}`);
  }
  assert.ok(lines.some((l) => /actor=agent-b outcome=limited code=app_rpm/.test(l)));
  assert.ok(lines.some((l) => /outcome=passed code=served/.test(l)));
});

test('decisionLine and labIso: a hostile actor cannot add a second field or a second line, and lab time is arithmetic', () => {
  const line = decisionLine({ at: labIso(1500), actor: 'a b\nfake=1 outcome=x', outcome: 'allowed', code: 'served', runId: 'r1' });
  assert.ok(!line.includes('\n'));
  assert.equal(line.split(' ').filter((p) => p.startsWith('outcome=')).length, 1);
  assert.equal(labIso(0), '2026-11-02T09:00:00.000Z'); assert.equal(labIso(61_001), '2026-11-02T09:01:01.001Z');
  assert.equal(labIso(-5), '2026-11-02T09:00:00.000Z'); assert.equal(labIso(1e12), '2026-11-02T09:59:59.999Z'); assert.equal(labIso(NaN), '2026-11-02T09:00:00.000Z');
});

test('static serving: the built page is served when it exists, the API is unaffected, and an app with no build still answers the API', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200); assert.match(await page.text(), /<title>page<\/title>/);
  assert.equal((await get('/api/health')).status, 200);
  const none = createApp({ env: { WEB_DIST: path.join(dist, 'missing') }, log: () => {} });
  const s2 = await startHttpServer({ port: 0, host: '127.0.0.1', app: none });
  try {
    const b = s2.url.replace(/\/$/, '');
    assert.equal((await fetch(`${b}/api/info`)).status, 200);
    assert.equal((await fetch(`${b}/`)).status, 404, 'no build: no page, no crash');
  } finally { await new Promise((r) => s2.server.close(r)); }
});

test('rule 19: POST /api/mode answers 409 with the plain reason the page shows, and /api/info says Real is not available', async () => {
  const r = await post('/api/mode', { source: 'real' });
  assert.equal(r.status, 409);
  const body = await r.json();
  assert.equal(body.error, 'real_not_available'); assert.match(body.message, /not built yet/);
  const info = await (await get('/api/info')).json();
  assert.equal(info.realAvailable, false); assert.equal(info.realReason, body.message); assert.equal(info.source, 'mock');
});

test('?record=0 (the cluster compare) answers but is not the latest run and is not counted', async () => {
  const ws = 'rec-ws';
  const body = { engine: 'cluster', config: { nodes: 2, shared: true, limit: { kind: 'bucket', capacity: 5, refillPerSec: 1 } }, profile: { phases: [{ type: 'burst', count: 8, durationMs: 1000 }] } };
  await post('/api/scenario/refusal-recorded', {}, ws);
  const a = await (await post('/api/run?record=0', body, ws)).json();
  assert.equal(a.totals.allowed, 5);
  assert.equal((await (await get('/api/info', ws)).json()).runsSinceReset, 1, 'not counted');
  assert.equal((await (await get('/api/observability', ws)).json()).run.id, 'refusal-recorded', 'not the latest run');
  const before = lines.length;
  await post('/api/run?record=0', body, ws);
  assert.equal(lines.length, before, 'and it writes no decision line');
  await post('/api/run', body, ws);
  assert.equal((await (await get('/api/info', ws)).json()).runsSinceReset, 2, 'a normal run is counted');
});

test('observability: an idle run made no decisions (it is not "nothing has run"), and a run with more decisions than the page lists says how many were cut', async () => {
  const idle = 'idle-ws';
  await post('/api/run', { engine: 'bucket', config: { capacity: 3, refillPerSec: 1 }, profile: { phases: [{ type: 'idle', durationMs: 2000 }] } }, idle);
  const j = await (await get('/api/observability', idle)).json();
  assert.equal(j.record, null); assert.equal(j.run.decisions, 0); assert.equal(j.run.truncated, false); assert.equal(j.run.kind, 'run');
  const big = 'big-ws';
  await post('/api/run', { engine: 'bucket', config: { capacity: 1, refillPerSec: 1 }, profile: { phases: [{ type: 'burst', count: 500, durationMs: 1000 }] } }, big);
  const k = await (await get('/api/observability', big)).json();
  assert.equal(k.run.decisions, 500, 'the first served call and 499 refusals');
  assert.equal(k.run.shown, 51, 'the first served call and the 50 refusals the engine keeps'); assert.equal(k.run.truncated, true);
  assert.deepEqual(assertRunObservability(k.record), []);
  await post('/api/scenario/refusal-recorded', {}, 'small-ws');
  const m = await (await get('/api/observability', 'small-ws')).json();
  assert.equal(m.run.truncated, false);
});

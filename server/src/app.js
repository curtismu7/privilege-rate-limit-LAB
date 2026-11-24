// The Express API. Everything under /api/, plus the built web page (web/dist) when it exists; the API and its tests need no build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { BANNER, OPEN_QUESTION } from './banner.js';
import { BOUNDS } from './bounds.js';
import { runChecks as defaultChecks } from './checks.js';
import { allPassed } from './doctor.js';
import { ENGINE_NAMES } from './engines.js';
import { LabError } from './errors.js';
import { createHealth } from './health.js';
import { runLoad } from './load.js';
import { jsonWritesOnly, makeHostCheck, sameOriginWrites } from './safety.js';
import { SCENARIOS, describeScenarios, findScenario, runScenario } from './scenarios.js';
import { buildDiagram, DIAGRAM_NAMES, hasDiagram } from './diagramData.js';
import { loadCast, verticalFrom } from './cast.js';
import { buildLimits, buildStory } from './story.js';
import { tracesForRuns } from './labTrace.js';
import { buildRunRecord, decisionLine, eventsForRun, STREAMS } from './runObs.js';
import { createWorkspaces, workspaceFrom } from './workspaces.js';
import { CLIENT_VIEW_NOTE } from './clientView.js';

const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOT_REAL = 'Real mode is not built yet. It needs a tenant running the 2026-11-21 release and an owner-run, read-only read; until then this lab is Mock only.';

export function createApp({ env = process.env, runChecks = () => defaultChecks(env), log = (line) => console.log(line), workspaces = createWorkspaces() } = {}) {
  const webDist = env.WEB_DIST || path.resolve(HERE, '../../web/dist');
  const configFile = env.CUSTOMER_CONFIG || path.resolve(HERE, '../../customer.config.json');
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(env));
  app.use(sameOriginWrites);
  app.use(jsonWritesOnly);
  app.use(express.json({ limit: BOUNDS.maxBodyBytes, strict: true }));

  const health = createHealth({ demoId: 'privilege-rate-limit-lab', demoName: 'Privilege Rate Limit LAB', version, runChecks, allPassed, mockOnly: () => true });
  app.use('/api/health', health.router);

  // Rule 13: every API call belongs to a workspace (X-Workspace, default "default"); an id that looks like a credential is refused, never echoed.
  app.use('/api', (req, res, next) => {
    const id = workspaceFrom(req);
    if (id === null) return res.status(400).json({ error: 'bad_workspace', message: 'X-Workspace must be 1 to 40 lowercase letters, digits or hyphens and must not look like a credential' });
    req.workspace = id;
    return next();
  });
  const stateOf = (req) => workspaces.get(req.workspace);

  app.get('/api/info', (req, res) => {
    res.json({
      app: 'privilege-rate-limit-lab', version, tier: 'Demo',
      source: 'mock', mode: 'mock', realAvailable: false, realReason: NOT_REAL,
      banner: BANNER, openQuestion: OPEN_QUESTION, clientViewNote: CLIENT_VIEW_NOTE,
      engines: ENGINE_NAMES, bounds: BOUNDS, scenarios: SCENARIOS.map((s) => s.id), runsSinceReset: stateOf(req).runs.count(), workspace: req.workspace,
    });
  });

  app.post('/api/mode', (req, res) => {
    const body = req.body;
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    if (keys.length !== 1 || keys[0] !== 'source' || typeof body.source !== 'string') {
      return res.status(400).json({ error: 'bad_request', message: 'send exactly { "source": "mock" } or { "source": "real" }' });
    }
    if (body.source === 'mock') return res.json({ source: 'mock', realAvailable: false });
    if (body.source === 'real' || body.source === 'live') return res.status(409).json({ error: 'real_not_available', message: NOT_REAL });
    return res.status(400).json({ error: 'bad_request', message: 'source must be "mock" or "real"' });
  });

  app.get('/api/scenarios', (_req, res) => res.json({ banner: BANNER, scenarios: describeScenarios() }));

  // The story (beats, talk track, cast) for a vertical; the vertical falls back to the default like every other route.
  app.get('/api/story', (req, res) => {
    const vertical = verticalFrom(req.query.vertical);
    res.set('Cache-Control', 'no-store').json(buildStory(loadCast(configFile, vertical), vertical));
  });

  app.get('/api/limits', (_req, res) => res.set('Cache-Control', 'no-store').json(buildLimits()));

  app.get('/api/diagram', (req, res) => {
    const name = req.query.name;
    if (!hasDiagram(name)) return res.status(404).json({ error: 'unknown_diagram', message: `no such diagram; the lab has: ${DIAGRAM_NAMES.join(', ')}` });
    const vertical = verticalFrom(req.query.vertical);
    return res.set('Cache-Control', 'no-store').json({ ...buildDiagram(loadCast(configFile, vertical), name), vertical });
  });

  // Remember a run for "What this run left behind" and write one stdout line per decision (actor and outcome, no token).
  const remember = (req, kind, id, runs) => {
    const w = stateOf(req);
    w.seq += 1;
    const runId = `r${w.seq}`;
    const { events, total } = eventsForRun(runId, runs);
    w.last = { runId, kind, id, events, total };
    for (const e of events) log(decisionLine(e));
  };

  app.post('/api/scenario/:id', (req, res) => {
    if (!findScenario(req.params.id)) return res.status(404).json({ error: 'unknown_scenario', message: 'no such scenario' });
    const out = runScenario(req.params.id);
    stateOf(req).runs.add({ kind: 'scenario', id: out.id, ok: out.ok });
    remember(req, 'scenario', out.id, out.runs);
    res.json({ ...out, traces: tracesForRuns(out.runs) });
  });

  app.post('/api/run', (req, res) => {
    const b = req.body;
    const keys = b && typeof b === 'object' && !Array.isArray(b) ? Object.keys(b) : null;
    if (!keys || keys.some((k) => !['engine', 'config', 'profile'].includes(k))) {
      return res.status(400).json({ error: 'invalid_request', message: 'send { engine, config, profile }' });
    }
    const out = runLoad({ engine: b.engine, config: b.config, profile: b.profile });
    // ?record=0 is a look-aside run (the cluster compare): it answers, but it is not "the latest run" and is not counted.
    if (req.query.record !== '0') {
      stateOf(req).runs.add({ kind: 'run', engine: out.engine });
      remember(req, 'run', out.engine, { run: out });
    }
    res.json({ ...out, traces: tracesForRuns({ run: out }).run });
  });

  // What the latest run in this workspace left behind (rule 27): the panel's record, or null before any run.
  app.get('/api/observability', async (req, res, next) => {
    try {
      const last = stateOf(req).last;
      const record = last ? await buildRunRecord({ runId: last.runId, events: last.events }) : null;
      // A run can make no decision at all (an idle profile): that is not "nothing has run". A run with more decisions than the cap says how many were cut.
      res.set('Cache-Control', 'no-store').json({
        record, run: last ? { runId: last.runId, kind: last.kind, id: last.id, decisions: last.total, shown: last.events.length, truncated: last.total > last.events.length } : null, streams: STREAMS,
      });
    } catch (e) { next(e); }
  });

  app.post('/api/reset', (req, res) => res.json({ reset: 'ok', cleared: workspaces.reset(req.workspace) }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'no such endpoint' }));

  // The built page, when there is one. The API never needs it: tests and doctor run without a build.
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { redirect: false, index: 'index.html', dotfiles: 'ignore', fallthrough: true }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof LabError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'the body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `the body is over ${BOUNDS.maxBodyBytes} bytes` });
    return res.status(500).json({ error: 'internal_error', message: 'something went wrong in the lab' });
  });

  app.locals.health = health;
  app.locals.workspaces = workspaces;
  return app;
}

export function startHttpServer({ port, host, app }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const a = server.address();
      resolve({ server, url: `http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}/` });
    });
    server.once('error', reject);
  });
}

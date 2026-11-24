// The Express API. Everything under /api/. No static files yet (the web UI is a later step).
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
import { createRunLog } from './state.js';
import { CLIENT_VIEW_NOTE } from './clientView.js';

const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
const NOT_REAL = 'Real mode is not built yet. It needs a tenant running the 2026-11-21 release and an owner-run, read-only read; until then this lab is Mock only.';

export function createApp({ env = process.env, runChecks = () => defaultChecks(env), runLog = createRunLog() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(env));
  app.use(sameOriginWrites);
  app.use(jsonWritesOnly);
  app.use(express.json({ limit: BOUNDS.maxBodyBytes, strict: true }));

  const health = createHealth({ demoId: 'privilege-rate-limit-lab', demoName: 'Privilege Rate Limit LAB', version, runChecks, allPassed, mockOnly: () => true });
  app.use('/api/health', health.router);

  app.get('/api/info', (_req, res) => {
    res.json({
      app: 'privilege-rate-limit-lab', version, tier: 'Demo',
      source: 'mock', mode: 'mock', realAvailable: false, realReason: NOT_REAL,
      banner: BANNER, openQuestion: OPEN_QUESTION, clientViewNote: CLIENT_VIEW_NOTE,
      engines: ENGINE_NAMES, bounds: BOUNDS, scenarios: SCENARIOS.map((s) => s.id), runsSinceReset: runLog.count(),
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

  app.post('/api/scenario/:id', (req, res) => {
    if (!findScenario(req.params.id)) return res.status(404).json({ error: 'unknown_scenario', message: 'no such scenario' });
    const out = runScenario(req.params.id);
    runLog.add({ kind: 'scenario', id: out.id, ok: out.ok });
    res.json(out);
  });

  app.post('/api/run', (req, res) => {
    const b = req.body;
    const keys = b && typeof b === 'object' && !Array.isArray(b) ? Object.keys(b) : null;
    if (!keys || keys.some((k) => !['engine', 'config', 'profile'].includes(k))) {
      return res.status(400).json({ error: 'invalid_request', message: 'send { engine, config, profile }' });
    }
    const out = runLoad({ engine: b.engine, config: b.config, profile: b.profile });
    runLog.add({ kind: 'run', engine: out.engine });
    res.json(out);
  });

  app.post('/api/reset', (_req, res) => res.json({ reset: 'ok', cleared: runLog.reset() }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'no such endpoint' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof LabError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'the body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `the body is over ${BOUNDS.maxBodyBytes} bytes` });
    return res.status(500).json({ error: 'internal_error', message: 'something went wrong in the lab' });
  });

  app.locals.health = health;
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

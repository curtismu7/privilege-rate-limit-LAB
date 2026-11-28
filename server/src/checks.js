// The lab's doctor checks: synchronous, no network, no secret. Used by `npm run doctor` and (refreshed in the background) GET /api/health.
// Every scenario is one check: the same run the tests make, with its expected result.
import fs from 'node:fs';
import { BANNER } from './banner.js';
import { nodeCheck } from './doctor.js';
import { checkPin, PIN_FILE } from './pin.js';
import { assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { SCENARIOS, runScenario } from './scenarios.js';
import { validateProfile } from './load.js';
import { validateEngineConfig } from './engines.js';
import { VERTICALS, unfilled } from './cast.js';
import { DIAGRAM_NAMES, buildDiagram } from './diagramData.js';
import { buildStory, rawStory } from './story.js';

const attempt = (id, fn) => {
  try { const r = fn(); return { id, level: r.ok ? 'pass' : 'fail', detail: r.detail }; } catch (e) { return { id, level: 'fail', detail: String(e.message).slice(0, 160) }; }
};
const refused = (fn) => { try { fn(); return false; } catch (e) { return e?.code === 'invalid_config' || e?.code === 'invalid_profile'; } };

export function runChecks(env = process.env) {
  const checks = [nodeCheck(26)];
  checks.push(attempt('banner', () => ({ ok: /UNVERIFIED/.test(BANNER) && /2026-11-21/.test(BANNER) && /SIMULATED/.test(BANNER), detail: 'the banner says what is simulated and that the rest is UNVERIFIED' })));
  checks.push(attempt('bind', () => { const h = assertBindAllowed(bindHost(env), env); resolvePort(env); return { ok: true, detail: `binds ${h} (loopback unless PRL_BIND is set on purpose)` }; }));
  checks.push(fs.existsSync(PIN_FILE)
    ? attempt('kit-pin', () => { const p = checkPin(); return { ok: p.length === 0, detail: p.length ? p.join('; ') : 'the vendored model-gateway-sim files match the pin' }; })
    : { id: 'kit-pin', level: 'info', detail: 'pin file not shipped in this build; the repo tests check it' });
  checks.push(attempt('config-validation', () => ({
    ok: refused(() => validateEngineConfig('bucket', { capacity: 0, refillPerSec: 1 }))
      && refused(() => validateEngineConfig('inflight', { maxInFlight: -1 }))
      && refused(() => validateProfile({ phases: Array.from({ length: 51 }, () => ({ type: 'idle', durationMs: 1 })) })),
    detail: 'zero and negative limits and an over-long profile are refused',
  })));
  checks.push(attempt('story-tokens', () => {
    const raw = JSON.stringify(rawStory());
    const missing = Object.entries(VERTICALS).flatMap(([v, cast]) => unfilled(raw, cast).map((k) => `${v}:${k}`));
    const filled = Object.entries(VERTICALS).every(([v, cast]) => !JSON.stringify(buildStory(cast, v)).includes('{{'));
    return { ok: !missing.length && filled, detail: missing.length ? `undefined tokens: ${missing.join(', ')}` : 'every story token is defined in all four vertical packs' };
  }));
  checks.push(attempt('diagram-data', () => {
    const d = DIAGRAM_NAMES.map((n) => buildDiagram(VERTICALS.airlines, n));
    return { ok: d.every((x) => x.nodes.length && x.steps.length), detail: `${DIAGRAM_NAMES.join(', ')} load by name from diagram-studio data` };
  }));
  for (const sc of SCENARIOS) {
    checks.push(attempt(`scenario:${sc.id}`, () => {
      const r = runScenario(sc.id);
      const failed = r.checks.filter((c) => !c.pass);
      return { ok: r.ok, detail: r.ok ? `${r.checks.length} expected results hold` : `failed: ${failed.map((c) => c.path).join(', ')}` };
    }));
  }
  return checks;
}

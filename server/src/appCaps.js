// App-wide caps for an MCP or A2A application: an RPM cap and a max-concurrent cap that cover EVERY agent key of the app, kept
// separate from each key's own caps. One greedy agent can exhaust the app caps and leave the others refused, however far each of
// them is from its own key cap. Check order (key first, then app) and RPM as "a bucket of N refilling N per minute" are the LAB'S
// MODEL, UNVERIFIED against the product.
import { BOUNDS, ID_PATTERN } from './bounds.js';
import { createBucket } from './bucket.js';
import { createInflight } from './inflight.js';
import { invalidRequest } from './errors.js';
import { noUnknown, num, objectOf, oneOf } from './validate.js';

export const APP_KINDS = ['mcp', 'a2a'];

export function validateAppCapsConfig(config, what = 'config') {
  const c = objectOf(config, what);
  noUnknown(c, ['kind', 'appRpm', 'appMaxConcurrent', 'keyRpm', 'keyMaxConcurrent'], what);
  return {
    kind: oneOf(c, 'kind', what, APP_KINDS),
    appRpm: num(c, 'appRpm', what, { positive: true, int: true, max: BOUNDS.maxLimit }),
    appMaxConcurrent: num(c, 'appMaxConcurrent', what, { positive: true, int: true, max: BOUNDS.maxInFlight }),
    keyRpm: num(c, 'keyRpm', what, { positive: true, int: true, max: BOUNDS.maxLimit }),
    keyMaxConcurrent: num(c, 'keyMaxConcurrent', what, { positive: true, int: true, max: BOUNDS.maxInFlight }),
  };
}

const rpmBucket = (rpm, clock) => createBucket({ capacity: rpm, refillPerSec: rpm / 60 }, clock);

export function createAppCaps(config, clock) {
  const cfg = validateAppCapsConfig(config);
  const appRpm = rpmBucket(cfg.appRpm, clock);
  const appConc = createInflight({ maxInFlight: cfg.appMaxConcurrent }, clock);
  const keys = new Map(); // agent id -> { rpm, conc }; only ever filled with ids that match ID_PATTERN
  const keyFor = (agent) => {
    if (typeof agent !== 'string' || !ID_PATTERN.test(agent)) throw invalidRequest('agent must be 1 to 40 characters of letters, digits and dashes');
    if (!keys.has(agent)) {
      if (keys.size >= BOUNDS.maxAgents) throw invalidRequest(`at most ${BOUNDS.maxAgents} agents per run`);
      keys.set(agent, { rpm: rpmBucket(cfg.keyRpm, clock), conc: createInflight({ maxInFlight: cfg.keyMaxConcurrent }, clock) });
    }
    return keys.get(agent);
  };

  return {
    kind: 'appCaps',
    config: cfg,
    take(req = {}) {
      const agent = req.agent ?? 'agent-a';
      const callMs = req.callMs ?? 0;
      if (!Number.isFinite(callMs) || callMs < 0 || callMs > BOUNDS.maxCallMs) throw invalidRequest(`callMs must be between 0 and ${BOUNDS.maxCallMs}`);
      const key = keyFor(agent);
      // Peek every layer first so a refusal at one layer spends nothing at another.
      const layers = [
        ['key', 'rpm', key.rpm], ['key', 'concurrent', key.conc],
        ['app', 'rpm', appRpm], ['app', 'concurrent', appConc],
      ];
      for (const [layer, what, limiter] of layers) {
        const p = limiter.peek();
        if (!p.allowed) return { allowed: false, outcome: 'refused', layer, reason: `${layer}_${what}`, retryAfterMs: p.retryAfterMs, agent };
      }
      for (const [, , limiter] of layers) limiter.take(req);
      return { allowed: true, outcome: 'allowed', agent };
    },
    sample() {
      const byKey = {};
      for (const [id, k] of keys) byKey[id] = { ...k.rpm.sample(), ...k.conc.sample() };
      return { ...appRpm.sample(), ...appConc.sample(), byKey };
    },
  };
}

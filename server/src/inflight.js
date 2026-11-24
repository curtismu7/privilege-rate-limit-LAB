// An in-flight cap for LLM calls on the lab clock. A call holds a slot for its duration; the slot is released when the lab
// clock reaches the end of the call. So a slow call can refuse the next one although the request RATE is low.
import { BOUNDS } from './bounds.js';
import { invalidRequest } from './errors.js';
import { noUnknown, num, objectOf } from './validate.js';

export function validateInflightConfig(config, what = 'config') {
  const c = objectOf(config, what);
  noUnknown(c, ['maxInFlight'], what);
  return { maxInFlight: num(c, 'maxInFlight', what, { positive: true, int: true, max: BOUNDS.maxInFlight }) };
}

export function createInflight(config, clock) {
  const cfg = validateInflightConfig(config);
  let ends = []; // end time (lab ms) of each call that holds a slot
  const release = () => { const now = clock.now(); ends = ends.filter((e) => e > now); }; // a call ending exactly now is done
  const decide = () => {
    release();
    if (ends.length < cfg.maxInFlight) return { allowed: true, outcome: 'allowed' };
    return { allowed: false, outcome: 'refused', reason: 'in_flight_cap', retryAfterMs: Math.min(...ends) - clock.now() };
  };
  return {
    kind: 'inflight',
    config: cfg,
    inFlight: () => { release(); return ends.length; },
    peek: () => decide(),
    take(req = {}) {
      const callMs = req.callMs ?? 0;
      if (!Number.isFinite(callMs) || callMs < 0 || callMs > BOUNDS.maxCallMs) throw invalidRequest('callMs must be between 0 and ' + BOUNDS.maxCallMs);
      const d = decide();
      if (d.allowed && callMs > 0) ends.push(clock.now() + callMs);
      return d;
    },
    sample() { release(); return { inFlight: ends.length }; },
  };
}

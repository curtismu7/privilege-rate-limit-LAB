// A continuously refilling token bucket on the lab clock. Units (tokens, tokens per second) are THIS LAB'S MODEL, UNVERIFIED
// against the product; the release notes say only "continuously refilling bucket".
import { BOUNDS } from './bounds.js';
import { LabError } from './errors.js';
import { noUnknown, num, objectOf } from './validate.js';

const EPS = 1e-9;

export function validateBucketConfig(config, what = 'config') {
  const c = objectOf(config, what);
  noUnknown(c, ['capacity', 'refillPerSec', 'initialTokens'], what);
  const capacity = num(c, 'capacity', what, { positive: true, max: BOUNDS.maxLimit });
  const refillPerSec = num(c, 'refillPerSec', what, { positive: true, max: BOUNDS.maxLimit });
  const wanted = num(c, 'initialTokens', what, { min: 0, optional: true, max: Number.MAX_SAFE_INTEGER });
  // A start balance above capacity is clamped, never trusted: the bucket cannot hold more than its capacity.
  const initialTokens = wanted === undefined ? capacity : Math.min(wanted, capacity);
  return { capacity, refillPerSec, initialTokens, initialClamped: wanted !== undefined && wanted > capacity };
}

// Pure: tokens in the bucket at time t (ms), given its state { capacity, refillPerSec, tokens, atMs }.
// Linear refill since atMs, capped at capacity. Time never goes backwards.
export function tokensAt(state, t) {
  if (!Number.isFinite(t)) throw new LabError('clock_backwards', 'time must be a finite number of ms');
  if (t < state.atMs) throw new LabError('clock_backwards', `time ${t} is before the bucket's last update at ${state.atMs}: the clock never goes backwards`);
  return Math.min(state.capacity, state.tokens + ((t - state.atMs) / 1000) * state.refillPerSec);
}

export function createBucket(config, clock) {
  const cfg = validateBucketConfig(config);
  const s = { capacity: cfg.capacity, refillPerSec: cfg.refillPerSec, tokens: cfg.initialTokens, atMs: clock.now() };
  const refresh = () => { const t = clock.now(); s.tokens = tokensAt(s, t); s.atMs = t; };

  const decide = (cost) => {
    refresh();
    if (cost > s.capacity) return { allowed: false, outcome: 'refused', reason: 'cost_exceeds_capacity', retryAfterMs: null };
    if (s.tokens + EPS >= cost) return { allowed: true, outcome: 'allowed' };
    // Time to refill the missing tokens, rounded up so that waiting this long always works.
    const retryAfterMs = Math.ceil(((cost - s.tokens) / s.refillPerSec) * 1000 - EPS);
    return { allowed: false, outcome: 'refused', reason: 'bucket_empty', retryAfterMs };
  };

  return {
    kind: 'bucket',
    config: cfg,
    state: () => ({ ...s }),
    tokens: () => tokensAt(s, clock.now()),
    // Look without taking (used by the app caps, which must not spend one layer when another refuses).
    peek: (cost = 1) => decide(cost),
    take(req = {}) {
      const cost = req.cost ?? 1;
      const d = decide(cost);
      if (d.allowed) s.tokens = Math.max(0, s.tokens - cost);
      return d;
    },
    sample: () => ({ tokens: Math.round(tokensAt(s, clock.now()) * 1e6) / 1e6 }),
  };
}

// A fixed window counter on the lab clock, for the side-by-side contrast with the bucket: it forgets everything at the window edge.
import { BOUNDS } from './bounds.js';
import { noUnknown, num, objectOf } from './validate.js';

export function validateWindowConfig(config, what = 'config') {
  const c = objectOf(config, what);
  noUnknown(c, ['limit', 'windowMs'], what);
  return {
    limit: num(c, 'limit', what, { positive: true, int: true, max: BOUNDS.maxLimit }),
    windowMs: num(c, 'windowMs', what, { positive: true, int: true, max: BOUNDS.maxWindowMs }),
  };
}

// Pure: the start of the window that contains t (windows are aligned to lab time 0).
export const windowStartAt = (windowMs, t) => Math.floor(t / windowMs) * windowMs;

export function createFixedWindow(config, clock) {
  const cfg = validateWindowConfig(config);
  let start = windowStartAt(cfg.windowMs, clock.now());
  let used = 0;
  const roll = () => {
    const s = windowStartAt(cfg.windowMs, clock.now());
    if (s !== start) { start = s; used = 0; } // the whole counter resets at once, at the edge
  };
  const decide = () => {
    roll();
    if (used < cfg.limit) return { allowed: true, outcome: 'allowed' };
    return { allowed: false, outcome: 'refused', reason: 'window_full', retryAfterMs: start + cfg.windowMs - clock.now() };
  };
  return {
    kind: 'fixedWindow',
    config: cfg,
    peek: () => decide(),
    take() {
      const d = decide();
      if (d.allowed) used += 1;
      return d;
    },
    // `tokens` = requests left in this window, so the chart can draw it beside the bucket.
    sample() { roll(); return { tokens: cfg.limit - used, used, windowStartMs: start }; },
  };
}

// One factory for the three single-limiter kinds, so a cluster can share or repeat any of them.
import { createBucket, validateBucketConfig } from './bucket.js';
import { createFixedWindow, validateWindowConfig } from './fixedWindow.js';
import { createInflight, validateInflightConfig } from './inflight.js';
import { invalidConfig } from './errors.js';
import { objectOf, oneOf } from './validate.js';

export const LIMITER_KINDS = ['bucket', 'fixedWindow', 'inflight'];
const VALIDATE = { bucket: validateBucketConfig, fixedWindow: validateWindowConfig, inflight: validateInflightConfig };
const CREATE = { bucket: createBucket, fixedWindow: createFixedWindow, inflight: createInflight };

const split = (spec, what) => {
  const s = objectOf(spec, what);
  const kind = oneOf(s, 'kind', what, LIMITER_KINDS);
  const { kind: _k, ...params } = s;
  return { kind, params };
};

// Returns the normalized spec ({ kind, ...normalized params }).
export function validateLimiterSpec(spec, what = 'config.limit') {
  const { kind, params } = split(spec, what);
  return { kind, ...VALIDATE[kind](params, what) };
}

export function createLimiter(spec, clock) {
  const { kind, params } = split(spec, 'limit');
  if (!CREATE[kind]) throw invalidConfig('unknown limiter kind');
  return CREATE[kind](params, clock);
}

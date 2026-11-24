// The five engines by name, with config validation.
import { createBucket, validateBucketConfig } from './bucket.js';
import { createFixedWindow, validateWindowConfig } from './fixedWindow.js';
import { createInflight, validateInflightConfig } from './inflight.js';
import { createCluster, validateClusterConfig } from './cluster.js';
import { createAppCaps, validateAppCapsConfig } from './appCaps.js';
import { invalidConfig } from './errors.js';

export const ENGINES = Object.freeze({
  bucket: { create: createBucket, validate: validateBucketConfig },
  fixedWindow: { create: createFixedWindow, validate: validateWindowConfig },
  inflight: { create: createInflight, validate: validateInflightConfig },
  cluster: { create: createCluster, validate: validateClusterConfig },
  appCaps: { create: createAppCaps, validate: validateAppCapsConfig },
});
export const ENGINE_NAMES = Object.keys(ENGINES);

const engineOf = (name) => {
  if (typeof name !== 'string' || !Object.hasOwn(ENGINES, name)) throw invalidConfig(`engine must be one of ${ENGINE_NAMES.join(', ')}`);
  return ENGINES[name];
};
export const validateEngineConfig = (name, config) => engineOf(name).validate(config);
export const createEngine = (name, config, clock) => engineOf(name).create(config, clock);

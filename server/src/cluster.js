// Two (or more) gateway nodes with and without a shared store. The shared store is a stand-in for Redis: an object that holds ONE
// limiter that every node uses, and that can be made unavailable. Without sharing, each node keeps its own limiter, so each allows the
// full limit and the cluster as a whole allows nodes x limit.
// UNVERIFIED (lab model): how the product shares a limit, whether it is exact under load, and what it does when Redis is down.
import { BOUNDS } from './bounds.js';
import { LabError, invalidConfig, invalidRequest } from './errors.js';
import { createLimiter, validateLimiterSpec } from './limiter.js';
import { bool, noUnknown, num, objectOf } from './validate.js';

export function validateClusterConfig(config, what = 'config') {
  const c = objectOf(config, what);
  noUnknown(c, ['nodes', 'shared', 'storeAvailable', 'limit'], what);
  const nodes = num(c, 'nodes', what, { min: 1, max: BOUNDS.maxNodes, int: true });
  const shared = bool(c, 'shared', what, { def: false });
  const storeAvailable = bool(c, 'storeAvailable', what, { def: true });
  if (c.limit === undefined) throw invalidConfig(`${what}.limit is required`);
  return { nodes, shared, storeAvailable, limit: validateLimiterSpec(c.limit, `${what}.limit`) };
}

// The Redis stand-in: holds the shared limiter and an availability switch. Nothing here touches a network.
export function createSharedStore(limitSpec, clock, { available = true } = {}) {
  let up = available;
  const limiter = createLimiter(limitSpec, clock);
  return {
    kind: 'redis-stand-in',
    isAvailable: () => up,
    setAvailable(v) { up = Boolean(v); },
    limiter() {
      if (!up) throw new LabError('shared_store_unavailable', 'the shared store (Redis stand-in) is not available', 503);
      return limiter;
    },
    // A read for the chart; it does not need the store to be up (the lab can still look at its own object).
    peekSample: () => limiter.sample(),
  };
}

export function createCluster(config, clock) {
  const cfg = validateClusterConfig(config);
  const limitSpec = config.limit;
  const store = cfg.shared ? createSharedStore(limitSpec, clock, { available: cfg.storeAvailable }) : null;
  const locals = cfg.shared ? [] : Array.from({ length: cfg.nodes }, () => createLimiter(limitSpec, clock));
  let next = 0;

  return {
    kind: 'cluster',
    config: cfg,
    store,
    take(req = {}) {
      let node = req.node;
      if (node === undefined) { node = next % cfg.nodes; next += 1; }
      if (!Number.isInteger(node) || node < 0 || node >= cfg.nodes) throw invalidRequest(`node must be a whole number from 0 to ${cfg.nodes - 1}`);
      let limiter;
      try {
        limiter = store ? store.limiter() : locals[node];
      } catch (e) {
        if (e instanceof LabError && e.code === 'shared_store_unavailable') {
          return {
            allowed: false, outcome: 'error', error: e.code, node, retryAfterMs: null,
            unverified: 'what the product does when the shared store is down (fail open or fail closed) is not known; the lab serves no request and names the error',
          };
        }
        throw e;
      }
      return { ...limiter.take(req), node };
    },
    sample() {
      if (store) {
        const s = store.peekSample();
        return { ...s, shared: true, storeAvailable: store.isAvailable() };
      }
      const per = locals.map((l) => l.sample());
      const sum = (k) => per.reduce((a, s) => a + (s[k] ?? 0), 0);
      const out = { shared: false, perNode: per };
      if (per[0] && 'tokens' in per[0]) out.tokens = sum('tokens');
      if (per[0] && 'inFlight' in per[0]) out.inFlight = sum('inFlight');
      return out;
    },
  };
}

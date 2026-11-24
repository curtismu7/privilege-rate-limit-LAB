// Every hostile-input bound in one place. The spec lists them; tests pin them.
export const BOUNDS = Object.freeze({
  maxPhases: 50,
  maxDurationMs: 600_000,        // a whole run, 10 minutes of lab time
  maxRatePerSec: 1000,
  maxBurst: 5000,
  maxRequests: 20_000,           // per run, counted before any request is generated
  minTickMs: 100,
  maxTickMs: 60_000,
  defaultTickMs: 1000,
  maxTicks: 2000,
  maxNodes: 8,
  maxAgents: 16,
  maxLimit: 1_000_000,           // capacity, window limit, rpm
  maxInFlight: 1000,
  maxWindowMs: 3_600_000,
  maxCallMs: 600_000,
  maxRefusalsKept: 50,
  maxBodyBytes: 64 * 1024,
});
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/i;

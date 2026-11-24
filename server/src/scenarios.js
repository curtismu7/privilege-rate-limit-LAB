// Scenarios as DATA, each with its expected result. A scenario is one or more labelled runs (side by side) plus `expect`: checks over the
// runs' results, `{ path, op, value }` or `{ path, op, than: <path> }` where a path is dot-separated from the runs (`bucket.totals.allowed`).
// Every number here is the lab's model, UNVERIFIED against the product.
import { runLoad } from './load.js';
import { callDurationMs } from './slowCall.js';

// A slow call as the shared provider stub models it (10x its latency): 4000 ms.
const SLOW_CALL_MS = callDurationMs('slow', 400);

const BUCKET_10 = { capacity: 10, refillPerSec: 1 };

export const SCENARIOS = [
  {
    id: 'burst-drains-and-refills',
    title: 'A burst drains the bucket and it refills continuously',
    story: 'A bucket of 10 refilling 2 tokens a second. 15 requests arrive at once: 10 are served, 5 refused. Tokens climb back second by second, not all at once; a second burst finds it full again.',
    runs: {
      bucket: {
        engine: 'bucket', config: { capacity: 10, refillPerSec: 2 },
        profile: { phases: [{ type: 'burst', count: 15, durationMs: 1000 }, { type: 'idle', durationMs: 4000 }, { type: 'burst', count: 15, durationMs: 1000 }] },
      },
    },
    expect: [
      { path: 'bucket.totals.allowed', op: 'eq', value: 20 },
      { path: 'bucket.totals.refused', op: 'eq', value: 10 },
      { path: 'bucket.series.0.tokens', op: 'eq', value: 2 },
      { path: 'bucket.series.1.tokens', op: 'eq', value: 4 },
      { path: 'bucket.series.4.tokens', op: 'eq', value: 10 },
    ],
  },
  {
    id: 'bucket-vs-fixed-window',
    title: 'The same load against a bucket and a fixed window',
    story: '10 requests just before a window edge and 10 just after it. A fixed window of 10 per 10 s resets all at once and serves all 20 within a second; the bucket (10, refilling 1 a second) has had one second to refill and serves 11.',
    runs: {
      bucket: {
        engine: 'bucket', config: BUCKET_10,
        profile: { tickMs: 500, phases: [{ type: 'idle', durationMs: 9000 }, { type: 'burst', count: 10, durationMs: 1000 }, { type: 'burst', count: 10, durationMs: 1000 }] },
      },
      window: {
        engine: 'fixedWindow', config: { limit: 10, windowMs: 10000 },
        profile: { tickMs: 500, phases: [{ type: 'idle', durationMs: 9000 }, { type: 'burst', count: 10, durationMs: 1000 }, { type: 'burst', count: 10, durationMs: 1000 }] },
      },
    },
    expect: [
      { path: 'bucket.totals.allowed', op: 'eq', value: 11 },
      { path: 'window.totals.allowed', op: 'eq', value: 20 },
      { path: 'window.totals.allowed', op: 'gt', than: 'bucket.totals.allowed' },
      { path: 'window.series.18.tokens', op: 'eq', value: 0 },
      { path: 'window.series.19.tokens', op: 'eq', value: 10 },
      { path: 'bucket.series.18.tokens', op: 'eq', value: 0.5 },
      { path: 'bucket.series.19.tokens', op: 'eq', value: 1 },
    ],
  },
  {
    id: 'inflight-refuses-at-low-rate',
    title: 'Slow calls hold slots: the next call is refused at a low request rate',
    story: 'An in-flight cap of 2, one request a second, each call taking 4 s (a slow provider). The third and fourth are refused although the rate is low and a bucket would serve every one; slots free up on the lab clock.',
    runs: {
      inflight: {
        engine: 'inflight', config: { maxInFlight: 2 },
        profile: { phases: [{ type: 'steady', ratePerSec: 1, durationMs: 6000, callMs: SLOW_CALL_MS }] },
      },
      bucket: {
        engine: 'bucket', config: { capacity: 10, refillPerSec: 10 },
        profile: { phases: [{ type: 'steady', ratePerSec: 1, durationMs: 6000, callMs: SLOW_CALL_MS }] },
      },
    },
    expect: [
      { path: 'inflight.totals.allowed', op: 'eq', value: 4 },
      { path: 'inflight.totals.refused', op: 'eq', value: 2 },
      { path: 'bucket.totals.refused', op: 'eq', value: 0 },
      { path: 'inflight.refusals.0.reason', op: 'eq', value: 'in_flight_cap' },
      { path: 'inflight.refusals.0.t', op: 'eq', value: 2000 },
      { path: 'inflight.refusals.0.retryAfterMs', op: 'eq', value: 2000 },
      { path: 'inflight.series.2.inFlight', op: 'eq', value: 2 },
      { path: 'inflight.series.3.inFlight', op: 'eq', value: 1 },
    ],
  },
  {
    id: 'cluster-without-shared-limit',
    title: 'Two nodes without a shared limit: each allows the full limit',
    story: 'Two gateway nodes, each with its own bucket of 10. A burst of 20 is split between them and every request is served: the client got double the limit.',
    runs: {
      cluster: {
        engine: 'cluster', config: { nodes: 2, shared: false, limit: { kind: 'bucket', ...BUCKET_10 } },
        profile: { phases: [{ type: 'burst', count: 20, durationMs: 1000 }] },
      },
    },
    expect: [
      { path: 'cluster.totals.allowed', op: 'eq', value: 20 },
      { path: 'cluster.totals.refused', op: 'eq', value: 0 },
    ],
  },
  {
    id: 'cluster-with-shared-limit',
    title: 'Two nodes with a shared store: the limit is counted once',
    story: 'The same two nodes and burst, but the bucket lives in a shared store (a Redis stand-in). 10 are served and 10 refused, whichever node took them.',
    runs: {
      cluster: {
        engine: 'cluster', config: { nodes: 2, shared: true, limit: { kind: 'bucket', ...BUCKET_10 } },
        profile: { phases: [{ type: 'burst', count: 20, durationMs: 1000 }] },
      },
    },
    expect: [
      { path: 'cluster.totals.allowed', op: 'eq', value: 10 },
      { path: 'cluster.totals.refused', op: 'eq', value: 10 },
    ],
  },
  {
    id: 'app-cap-exhausted-by-one-agent',
    title: 'One agent exhausts the app-wide cap for the others',
    story: 'An MCP app with an app-wide cap of 12 requests a minute and a per-key cap of 30. agent-a sends 12 and drains the app cap, far below its own key cap. agent-b has used nothing, yet is refused at the app layer.',
    runs: {
      app: {
        engine: 'appCaps', config: { kind: 'mcp', appRpm: 12, appMaxConcurrent: 50, keyRpm: 30, keyMaxConcurrent: 50 },
        profile: { phases: [{ type: 'burst', count: 12, durationMs: 1000, agents: ['agent-a'] }, { type: 'burst', count: 3, durationMs: 1000, agents: ['agent-b'] }] },
      },
    },
    expect: [
      { path: 'app.byAgent.agent-a.allowed', op: 'eq', value: 12 },
      { path: 'app.byAgent.agent-b.allowed', op: 'eq', value: 0 },
      { path: 'app.byAgent.agent-b.refused', op: 'eq', value: 3 },
      { path: 'app.refusals.0.layer', op: 'eq', value: 'app' },
      { path: 'app.refusals.0.reason', op: 'eq', value: 'app_rpm' },
      { path: 'app.refusals.0.agent', op: 'eq', value: 'agent-b' },
    ],
  },
  {
    id: 'refusal-recorded',
    title: 'A refusal records what the client sees',
    story: 'A bucket of 3 and a burst of 5. The two refused requests are recorded with the status, the Retry-After header and the body a client would get. That shape is the lab\'s model, UNVERIFIED.',
    runs: {
      bucket: {
        engine: 'bucket', config: { capacity: 3, refillPerSec: 1 },
        profile: { phases: [{ type: 'burst', count: 5, durationMs: 1000 }] },
      },
    },
    expect: [
      { path: 'bucket.totals.refused', op: 'eq', value: 2 },
      { path: 'bucket.refusals.0.retryAfterMs', op: 'eq', value: 1000 },
      { path: 'bucket.refusals.0.client.status', op: 'eq', value: 429 },
      { path: 'bucket.refusals.0.client.headers.Retry-After', op: 'eq', value: '1' },
      { path: 'bucket.refusals.0.client.body.error', op: 'eq', value: 'rate_limited' },
      { path: 'bucket.refusals.0.client.unverified', op: 'eq', value: true },
    ],
  },
];

export const scenarioIds = () => SCENARIOS.map((s) => s.id);
export const findScenario = (id) => SCENARIOS.find((s) => s.id === id);

// Dot path through plain data; array indexes are numbers. Own properties only.
export function getPath(obj, path) {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const OPS = {
  eq: (a, b) => a === b,
  gt: (a, b) => typeof a === 'number' && typeof b === 'number' && a > b,
  gte: (a, b) => typeof a === 'number' && typeof b === 'number' && a >= b,
  lt: (a, b) => typeof a === 'number' && typeof b === 'number' && a < b,
};

export function evaluate(expect, runs) {
  return expect.map((e) => {
    const actual = getPath(runs, e.path);
    const wanted = e.than !== undefined ? getPath(runs, e.than) : e.value;
    return { ...e, actual, wanted, pass: OPS[e.op](actual, wanted) };
  });
}

export function runScenario(id) {
  const sc = findScenario(id);
  if (!sc) return null;
  const runs = {};
  for (const [label, r] of Object.entries(sc.runs)) runs[label] = runLoad(r);
  const checks = evaluate(sc.expect, runs);
  return { id: sc.id, title: sc.title, story: sc.story, ok: checks.every((c) => c.pass), checks, runs };
}

// The list for the UI and GET /api/scenarios: the data, without results.
export const describeScenarios = () => SCENARIOS.map(({ id, title, story, runs, expect }) => ({ id, title, story, runs, expect }));

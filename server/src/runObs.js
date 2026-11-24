// Rule 27: this lab's side of the shared run-observability panel. Pure functions around the vendored collector (runObservability.js, never edited here).
// Mock only: every row is `simulated` (this lab's own engine computed it on the lab clock); a layer the lab never touched says so. Nothing is invented and no
// claim is made that the product logs these decisions. Times are lab time on a fixed lab date, from integer arithmetic (the server never reads a real clock).
import { createRunObservability, LAYERS } from './runObservability.js';

export const MAX_EVENTS_PER_RUN = 60;
const SERVICE = 'privilege-rate-limit-lab';
const ID = /[^A-Za-z0-9._:@-]/g;
const idText = (v) => String(v == null || v === '' ? '-' : v).replace(ID, '_').slice(0, 64);
const pad = (n, w) => String(n).padStart(w, '0');

// Lab time 0 is 2026-11-02 09:00:00.000 UTC (a lab date, not today). One hour is the most a lab run can span (bounded to 10 minutes plus a tick).
export function labIso(t) {
  const ms = Math.min(Math.max(0, Math.floor(Number(t) || 0)), 3_599_999);
  return `2026-11-02T09:${pad(Math.floor(ms / 60000), 2)}:${pad(Math.floor((ms % 60000) / 1000), 2)}.${pad(ms % 1000, 3)}Z`;
}

// One stdout line per decision: actor and outcome, never a token. The words avoid the ones the shared matchers read as a product decision.
// The outcome is written as passed, limited or info (not allowed / refused), so no shared matcher reads the line as a product decision.
const LINE_OUTCOME = { allowed: 'passed', refused: 'limited', info: 'info' };
export function decisionLine(e) {
  return `${e.at} ${SERVICE} decision actor=${idText(e.actor)} outcome=${LINE_OUTCOME[e.outcome] || 'info'} code=${idText(e.code)} run=${idText(e.runId)}`;
}

const WHY = {
  person: 'This lab has no sign-in: the callers are the plain ids agent-a, agent-b and agent-c.',
  agent: 'This lab has no token exchange.',
  authorize: 'This lab has no Authorize decision.',
  privilege: 'The lab models the rate-limit decision at the gateway; it makes no claim about what Privilege logs.',
  gateway: 'No request reached the gateway in this run.',
  resource: 'This lab has no MCP or A2A server behind the gateway.',
};

// The events one run (one scenario or one custom run, possibly several labelled engine runs) left behind: the first served call and every kept refusal.
export function eventsForRun(runId, runs) {
  const events = [];
  for (const [label, run] of Object.entries(runs)) {
    if (run.firstAllowed) events.push({ at: labIso(run.firstAllowed.t), t: run.firstAllowed.t, layer: 'gateway', actor: run.firstAllowed.agent || label, outcome: 'allowed', code: 'served', runId, message: `${label}: the first request was served (lab model, ${run.engine})` });
    for (const r of run.refusals) {
      events.push({
        at: labIso(r.t), t: r.t, layer: 'gateway', actor: r.agent || label, outcome: r.outcome === 'error' ? 'info' : 'refused', code: r.reason || r.error, runId,
        message: r.outcome === 'error'
          ? `${label}: shared store unavailable: ${r.error} (the lab names the error; no claim about fail-open or fail-closed)`
          : `${label}: refused ${r.reason}${r.layer ? ` at the ${r.layer} layer` : ''}${r.retryAfterMs != null ? `; retry in ${r.retryAfterMs} ms` : ''}`,
        detail: { client: { status: r.client.status, retryAfter: r.client.headers['Retry-After'] ?? null }, unverified: 'the lab\'s model of the client\'s view' },
      });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return events.slice(0, MAX_EVENTS_PER_RUN);
}

const PRODUCT = { gateway: 'lab mock gateway (rate limits)' };

export function mockLayers(events) {
  return LAYERS.map((layer) => ({
    layer, products: [], reason: WHY[layer],
    simulated: events.filter((e) => e.layer === layer).map((e) => ({ at: e.at, product: PRODUCT[layer], outcome: e.outcome, message: e.message, detail: e.detail })),
  }));
}

export async function buildRunRecord({ runId, events }) {
  if (!events.length) return null;
  return createRunObservability({ clock: () => 0 }).collectRun({
    runId, startedAt: events[0].at, endedAt: events[events.length - 1].at, source: 'mock', layers: mockLayers(events),
  });
}

// Where the lab's own decision lines live, passed to the panel's "where these logs live" block and said in the README.
export const STREAMS = [
  { product: 'This lab (stdout)', lives: 'the container or process stdout: one line per decision, no token', streams: 'a collector can ship container stdout to a SIEM; this lab configures none' },
  { product: 'The product\'s own log', lives: 'not claimed: where Privilege logs rate-limit decisions is not in the release notes', streams: 'not claimed' },
];

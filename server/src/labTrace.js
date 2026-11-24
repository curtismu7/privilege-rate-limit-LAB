// "What Privilege did" for a run: gateway traces built by the vendored shared builder (gatewayTrace.js, never edited). The gateway is this lab's own
// simulation, so every decision is `checked` (the lab computed it). The host is a reserved .invalid one, the credential is a labelled mock, and no JSON-RPC
// message is shown because the lab sends none. A trace says what the LAB'S MODEL decided; the refusal's status, headers and body are the lab's model, UNVERIFIED.
import { mockTrace } from './gatewayTrace.js';

const MOCK_AUTH = 'Bearer MOCK-lab-key (a mock value, not a credential)';
const MAX_REFUSAL_TRACES = 3;

const path = (config, engine) => (engine === 'appCaps' ? `/${config.kind}/lab-app` : '/llm/v1/chat');
const urlFor = (run) => `https://gateway.lab.invalid${path(run.config, run.engine)}`;

const REASON_TEXT = {
  bucket_empty: (r) => `the bucket had too few tokens (${r.reason})`,
  cost_exceeds_capacity: () => 'the request costs more than the whole bucket, so waiting cannot help (no retry hint)',
  window_full: () => 'the fixed window had used its whole limit',
  in_flight_cap: () => 'every in-flight slot was held by a call that had not ended',
  key_rpm: () => 'the key\'s own requests-per-minute cap was used up',
  key_concurrent: () => 'the key\'s own max-concurrent cap was reached',
  app_rpm: () => 'the app-wide requests-per-minute cap was used up (by all of the app\'s agents together)',
  app_concurrent: () => 'the app-wide max-concurrent cap was reached',
  shared_store_unavailable: () => 'the shared store (Redis stand-in) was not available; the lab serves nothing and names the error',
};

const where = (run, who) => [
  run.engine === 'cluster' ? `${run.config.shared ? 'shared store' : 'its own bucket'}${who.node !== undefined ? `, node ${who.node}` : ''}` : null,
  who.agent ? `agent ${who.agent}` : null,
].filter(Boolean).join(', ');

export function allowedExchange(label, run, step) {
  const f = run.firstAllowed;
  if (!f) return null;
  const decisions = run.engine === 'appCaps'
    ? [{ id: 'key-cap', label: 'Key caps', outcome: 'pass', evidence: 'the key had room in its requests-per-minute and max-concurrent caps (lab model)' },
      { id: 'app-cap', label: 'App-wide caps', outcome: 'pass', evidence: 'the app had room in its requests-per-minute and max-concurrent caps (lab model)' }]
    : [{ id: 'rate-limit', label: 'Rate limit', outcome: 'pass', evidence: `the limiter had room (lab model; ${run.engine}${where(run, f) ? `; ${where(run, f)}` : ''})` }];
  return {
    step, title: `${label}: first served call, lab t=${f.t} ms`, status: 200,
    trace: mockTrace({ url: urlFor(run), authorization: MOCK_AUTH, rpc: null, status: 200, body: { note: 'the lab models no response body' }, decisions, record: 'none claimed: the lab does not know what the product logs for a served call (see What this run left behind).' }),
  };
}

export function refusalExchange(label, run, r, step) {
  const text = (REASON_TEXT[r.reason] || (() => `refused (${r.reason || r.error})`))(r);
  const isErr = r.outcome === 'error';
  const decisions = [{
    id: isErr ? 'shared-store' : (r.layer ? `${r.layer}-cap` : 'rate-limit'),
    label: isErr ? 'Shared store' : r.layer ? `${r.layer === 'app' ? 'App-wide' : 'Key'} caps` : 'Rate limit',
    outcome: 'fail', evidence: `${text}${r.retryAfterMs != null ? `; retry in ${r.retryAfterMs} ms` : ''}`,
  }];
  if (r.layer === 'key') decisions.push({ id: 'app-cap', label: 'App-wide caps', outcome: 'skipped', evidence: 'not reached: the key\'s own cap answered first (lab model)' });
  return {
    step, title: `${label}: refused ${r.reason || r.error}, lab t=${r.t} ms${r.agent ? ` (${r.agent})` : ''}`, status: r.client.status,
    trace: mockTrace({
      url: urlFor(run), authorization: MOCK_AUTH, rpc: null, status: r.client.status,
      headers: { 'content-type': 'application/json', ...r.client.headers }, body: { ...r.client.body, unverified: 'the lab\'s model of the client\'s view' },
      decisions, record: 'none claimed: the refusal\'s shape above is the lab\'s model, UNVERIFIED. No fallback is called.',
    }),
  };
}

// One served call, then the first refusal of each distinct reason (up to three), so the page shows the decision that mattered.
export function tracesFor(label, run) {
  const out = [];
  const ok = allowedExchange(label, run, 1);
  if (ok) out.push(ok);
  const seen = new Set();
  for (const r of run.refusals) {
    const key = r.reason || r.error;
    if (seen.has(key) || seen.size >= MAX_REFUSAL_TRACES) continue;
    seen.add(key);
    out.push(refusalExchange(label, run, r, out.length + 1));
  }
  return out;
}

export const tracesForRuns = (runs) => Object.fromEntries(Object.entries(runs).map(([label, run]) => [label, tracesFor(label, run)]));

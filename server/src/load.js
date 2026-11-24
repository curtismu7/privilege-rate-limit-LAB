// The load generator: replays a scripted profile (steady, burst, spike, idle) against any engine on the lab clock and returns a time
// series for the chart. No real time, no timers: the clock is moved only by this loop.
//
// profile = { tickMs?, phases: [ { type, durationMs, ... } ] }, phases run one after another:
//   steady { ratePerSec, durationMs }   evenly spaced requests
//   spike  { ratePerSec, durationMs }   the same shape at a high rate (named so the chart can label it; there is NO baseline-jump detector)
//   burst  { count, durationMs }        `count` requests at the phase's first instant, then quiet until the phase ends
//   idle   { durationMs }               nothing; lets a bucket refill
// Any request phase may also set callMs (how long each call holds an in-flight slot), agents: [ids] (taken in turn) and node.
import { BOUNDS, ID_PATTERN } from './bounds.js';
import { invalidProfile } from './errors.js';
import { createEngine, validateEngineConfig } from './engines.js';
import { clientView } from './clientView.js';
import { createClock } from './model-gateway-sim/labClock.js';
import { noUnknown, num, objectOf, oneOf } from './validate.js';

const PHASE_TYPES = ['steady', 'spike', 'burst', 'idle'];

export function validateProfile(profile) {
  const p = objectOf(profile, 'profile', invalidProfile);
  noUnknown(p, ['tickMs', 'phases'], 'profile', invalidProfile);
  const tickMs = num(p, 'tickMs', 'profile', { optional: true, def: BOUNDS.defaultTickMs, min: BOUNDS.minTickMs, max: BOUNDS.maxTickMs, int: true, make: invalidProfile });
  if (!Array.isArray(p.phases) || p.phases.length === 0) throw invalidProfile('profile.phases must be a non-empty list');
  if (p.phases.length > BOUNDS.maxPhases) throw invalidProfile(`profile.phases is limited to ${BOUNDS.maxPhases} phases`);
  let total = 0;
  let requests = 0;
  const phases = p.phases.map((raw, i) => {
    const w = `profile.phases[${i}]`;
    const ph = objectOf(raw, w, invalidProfile);
    const type = oneOf(ph, 'type', w, PHASE_TYPES, { make: invalidProfile });
    const allowed = type === 'idle' ? ['type', 'durationMs'] : ['type', 'durationMs', 'callMs', 'agents', 'node', type === 'burst' ? 'count' : 'ratePerSec'];
    noUnknown(ph, allowed, w, invalidProfile);
    const durationMs = num(ph, 'durationMs', w, { min: 1, max: BOUNDS.maxDurationMs, int: true, make: invalidProfile });
    total += durationMs;
    if (total > BOUNDS.maxDurationMs) throw invalidProfile(`profile is longer than ${BOUNDS.maxDurationMs} ms of lab time`);
    const out = { type, durationMs };
    if (type === 'idle') return out;
    if (type === 'burst') {
      out.count = num(ph, 'count', w, { positive: true, int: true, max: BOUNDS.maxBurst, make: invalidProfile });
      requests += out.count;
    } else {
      out.ratePerSec = num(ph, 'ratePerSec', w, { positive: true, max: BOUNDS.maxRatePerSec, make: invalidProfile });
      requests += Math.floor((out.ratePerSec * durationMs) / 1000);
    }
    if (requests > BOUNDS.maxRequests) throw invalidProfile(`profile makes more than ${BOUNDS.maxRequests} requests`);
    out.callMs = num(ph, 'callMs', w, { optional: true, def: 0, min: 0, max: BOUNDS.maxCallMs, int: true, make: invalidProfile });
    if (ph.agents !== undefined) {
      if (!Array.isArray(ph.agents) || ph.agents.length === 0 || ph.agents.length > BOUNDS.maxAgents) throw invalidProfile(`${w}.agents must be 1 to ${BOUNDS.maxAgents} ids`);
      if (!ph.agents.every((a) => typeof a === 'string' && ID_PATTERN.test(a))) throw invalidProfile(`${w}.agents: ids are 1 to 40 characters of letters, digits and dashes`);
      out.agents = [...ph.agents];
    }
    if (ph.node !== undefined) out.node = num(ph, 'node', w, { min: 0, max: BOUNDS.maxNodes - 1, int: true, make: invalidProfile });
    return out;
  });
  const ticks = Math.ceil(total / tickMs);
  if (ticks > BOUNDS.maxTicks) throw invalidProfile(`${ticks} chart ticks is over the limit of ${BOUNDS.maxTicks}: raise profile.tickMs`);
  return { tickMs, phases, durationMs: total, requests };
}

// Phases run back to back, so the requests come out already sorted by time.
function expand(profile) {
  const reqs = [];
  let start = 0;
  for (const ph of profile.phases) {
    if (ph.type !== 'idle') {
      const n = ph.type === 'burst' ? ph.count : Math.floor((ph.ratePerSec * ph.durationMs) / 1000);
      for (let k = 0; k < n; k++) {
        const t = ph.type === 'burst' ? start : start + Math.floor((k * 1000) / ph.ratePerSec);
        const r = { t, callMs: ph.callMs };
        if (ph.agents) r.agent = ph.agents[k % ph.agents.length];
        if (ph.node !== undefined) r.node = ph.node;
        reqs.push(r);
      }
    }
    start += ph.durationMs;
  }
  return reqs;
}

const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

export function runLoad({ engine, config, profile }) {
  const normalized = validateEngineConfig(engine, config);
  const prof = validateProfile(profile);
  const clock = createClock(0);
  const eng = createEngine(engine, config, clock);
  const reqs = expand(prof);

  const series = [];
  const totals = { requests: 0, allowed: 0, refused: 0, errors: 0 };
  const byReason = Object.create(null);
  const byAgent = Object.create(null);
  const refusals = [];
  let firstAllowed = null; // the first request served: the trace page shows one served call too
  const start = { t: 0, ...eng.sample() };
  const nTicks = Math.ceil(prof.durationMs / prof.tickMs);
  let idx = 0;
  for (let i = 0; i < nTicks; i++) {
    const end = (i + 1) * prof.tickMs;
    const tick = { allowed: 0, refused: 0, errors: 0 };
    while (idx < reqs.length && reqs[idx].t < end) {
      const r = reqs[idx++];
      clock.set(r.t); // forward only: the kit's clock refuses to go back
      const d = eng.take(r);
      totals.requests += 1;
      const who = r.agent === undefined ? null : (byAgent[r.agent] ??= { allowed: 0, refused: 0, errors: 0 });
      if (d.outcome === 'allowed') { if (!firstAllowed) firstAllowed = { t: r.t, ...(r.agent ? { agent: r.agent } : {}), ...(d.node !== undefined ? { node: d.node } : {}) }; tick.allowed++; totals.allowed++; if (who) who.allowed++; continue; }
      const isErr = d.outcome === 'error';
      if (isErr) { tick.errors++; totals.errors++; if (who) who.errors++; } else { tick.refused++; totals.refused++; if (who) who.refused++; }
      bump(byReason, d.reason ?? d.error);
      if (refusals.length < BOUNDS.maxRefusalsKept) refusals.push({ t: r.t, ...(r.agent ? { agent: r.agent } : {}), ...d, client: clientView(d) });
    }
    clock.set(end);
    series.push({ t: end, ...tick, ...eng.sample() });
  }
  return {
    engine, config: normalized, profile: prof, start, series, totals,
    byReason: { ...byReason },
    ...(Object.keys(byAgent).length ? { byAgent: { ...byAgent } } : {}),
    firstAllowed, refusals, refusalsTruncated: totals.refused + totals.errors > refusals.length,
    model: 'UNVERIFIED (lab model): units, parameters and the client refusal shape are this lab\'s own',
  };
}

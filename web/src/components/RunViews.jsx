import { useEffect, useState } from "react";
import GatewayTrace from "../gateway-trace/GatewayTrace.jsx";
import { postRun } from "../api";
import { visible } from "../safeText";
import { Card, Chip, HOT, Json } from "./Bits.jsx";
import RateChart from "./RateChart.jsx";

const TRACE_NOTE = "Simulated gateway: this lab's own rate-limit engine computed every decision on the lab clock (checked). Nothing here was read from a Privilege gateway, and the status, headers and body of a refusal are the lab's model, UNVERIFIED.";
const ENGINE_TITLE = { bucket: "Refilling bucket", fixedWindow: "Fixed window", inflight: "In-flight cap", cluster: "Cluster of gateway nodes", appCaps: "App-wide caps" };
const num = (v) => (typeof v === "number" ? v : 0);
const pct = (v, max) => `${Math.max(0, Math.min(100, max > 0 ? (v / max) * 100 : 0))}%`;

// A measure: a bar with the number as text, so the value never rests on the bar's colour or length alone.
export function Meter({ label, value, max, testId, state = "info" }) {
  return (
    <div className="meter" data-testid={testId}>
      <div className="meter__row"><span className="meter__label">{visible(label)}</span><span className="meter__value">{Math.round(value * 100) / 100} of {max}</span></div>
      <div className="meter__track" aria-hidden="true"><div className="meter__fill" data-state={state} style={{ width: pct(value, max) }} /></div>
    </div>
  );
}

// What the client sees on a refusal: the lab's MODEL of it (status, Retry-After, body), UNVERIFIED.
export function ClientView({ run }) {
  const r = run.refusals[0];
  return (
    <Card tone="warn" kicker="What the client sees (lab model)" title="A refusal, from the caller's side" testId="client-view">
      <p><Chip state="warn">UNVERIFIED</Chip> The status, the retry hint and the body are this lab's own model. The release notes do not say what a refused caller receives.</p>
      {!r && <p className="muted" data-testid="client-view-empty">No call was refused in this run, so there is no refusal to show. Lower a limit or raise the load.</p>}
      {r && (
        <>
          <dl className="kv">
            <dt>Status</dt><dd data-testid="client-status">{r.client.status}</dd>
            <dt>Retry hint</dt><dd data-testid="client-retry">{r.client.headers["Retry-After"] ? `Retry-After: ${r.client.headers["Retry-After"]} s (the lab waits ${r.retryAfterMs} ms)` : "none: waiting cannot help"}</dd>
            <dt>Why</dt><dd>{visible(r.reason || r.error)}{r.layer ? `, at the ${r.layer} layer` : ""}{r.agent ? `, agent ${visible(r.agent)}` : ""}, at lab time {r.t} ms</dd>
          </dl>
          <Json value={r.client} label="What the client receives" testId="client-json" hot={HOT} />
        </>
      )}
    </Card>
  );
}

const cfgOfLimit = (l) => (l.kind === "bucket" ? { kind: l.kind, capacity: l.capacity, refillPerSec: l.refillPerSec } : l.kind === "fixedWindow" ? { kind: l.kind, limit: l.limit, windowMs: l.windowMs } : { kind: l.kind, maxInFlight: l.maxInFlight });

// Two nodes, with and without a shared store. The compare button runs the same request the other way and sets the two side by side.
export function ClusterView({ run, request }) {
  const [other, setOther] = useState(null);
  const [err, setErr] = useState(null);
  const last = run.series[run.series.length - 1] || {};
  // A different run replaces this one: the other-way result and its error belong to the run before, so they go.
  useEffect(() => { setOther(null); setErr(null); }, [run]);
  const flipped = { ...request, config: { ...request.config, shared: !request.config.shared, limit: request.config.limit ? cfgOfLimit(run.config.limit) : request.config.limit } };
  const compare = async () => {
    setErr(null);
    const r = await postRun(flipped.engine, flipped.config, flipped.profile, { record: false }); // a look-aside run: not the workspace's latest run, not counted
    if (r.ok) setOther(r.body); else setErr(r.body?.message || `HTTP ${r.status}`);
  };
  const side = (rn, shared) => (
    <div className="cluster__side" data-testid={`cluster-${shared ? "shared" : "own"}`}>
      <p className="kicker">{shared ? "With a shared store" : "Without sharing"}</p>
      <p><strong>{rn.totals.allowed}</strong> allowed, <strong>{rn.totals.refused}</strong> refused{rn.totals.errors ? <>, <strong>{rn.totals.errors}</strong> errors</> : null}</p>
      <p className="muted">{shared ? "One bucket in the store; every node counts against it." : "Each node keeps its own bucket, so the limit is multiplied by the node count."}</p>
    </div>
  );
  const cfg = run.config;
  const perNode = !cfg.shared && Array.isArray(last.perNode) ? last.perNode : null;
  return (
    <Card kicker="Cluster" title={`${cfg.nodes} gateway nodes, ${cfg.shared ? "one shared store" : "no sharing"}`} testId="cluster-view">
      <div className="cluster" role="img" aria-label={cfg.shared ? "Nodes all draw on one shared store" : "Each node has its own bucket"}>
        <div className="cluster__nodes">
          {Array.from({ length: cfg.nodes }, (_, i) => (
            <div className="cluster__node" key={i} data-testid={`node-${i}`}>
              <p className="kicker">Node {i + 1}</p>
              {perNode ? <Meter label="its own bucket" value={num(perNode[i]?.tokens)} max={cfg.limit.capacity ?? cfg.limit.limit ?? 0} testId={`node-${i}-meter`} /> : <p className="muted">asks the store</p>}
            </div>
          ))}
        </div>
        {cfg.shared && (
          <div className="cluster__store" data-testid="store-box">
            <p className="kicker">Shared store (a Redis stand-in){cfg.storeAvailable === false ? ", unavailable" : ""}</p>
            <Meter label="the one shared bucket" value={num(last.tokens)} max={cfg.limit.capacity ?? cfg.limit.limit ?? 0} testId="store-meter" />
          </div>
        )}
      </div>
      <div className="seg"><button type="button" onClick={compare} data-testid="cluster-compare">Run it {cfg.shared ? "without sharing" : "with a shared store"} too</button></div>
      {err && <p className="field-error" role="alert" data-testid="cluster-compare-error">{visible(err)}</p>}
      {other && (
        <div className="cols" data-testid="cluster-compare-result">
          {side(cfg.shared ? other : run, false)}
          {side(cfg.shared ? run : other, true)}
        </div>
      )}
    </Card>
  );
}

// The app-wide caps view: the app's own cap, kept apart from each key's cap, and who used it up.
export function AppCapsView({ run, labels }) {
  const cfg = run.config;
  const last = run.series[run.series.length - 1] || {};
  const agents = Object.entries(run.byAgent || {});
  return (
    <Card kicker={`${cfg.kind.toUpperCase()} app-wide caps`} title="The app's cap is shared by all of its agents" testId="appcaps-view">
      <div className="appcaps">
        <div className="appcaps__app">
          <p className="kicker">The app (all agents together)</p>
          <Meter label="requests a minute left" value={num(last.tokens)} max={cfg.appRpm} testId="app-rpm-meter" state={num(last.tokens) < 1 ? "bad" : "info"} />
          <Meter label="calls in flight" value={num(last.inFlight)} max={cfg.appMaxConcurrent} testId="app-conc-meter" />
        </div>
        <div className="appcaps__keys">
          {agents.map(([id, a]) => {
            const k = last.byKey?.[id];
            return (
              <div className="appcaps__key" key={id} data-testid={`agent-${id}`}>
                <p className="kicker">{visible(labels?.[id] || id)} <span className="muted mono">({visible(id)})</span></p>
                <p><strong>{a.allowed}</strong> allowed, <strong>{a.refused}</strong> refused</p>
                <Meter label="its own key cap left" value={num(k?.tokens)} max={cfg.keyRpm} testId={`agent-${id}-meter`} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted">Check order is the lab's model, UNVERIFIED: the key's caps first, then the app's. A refusal says which layer answered.</p>
    </Card>
  );
}

const sumLine = (label, run) => `${label ? `${label}: ` : ""}${run.totals.allowed} of ${run.totals.requests} allowed, ${run.totals.refused} refused${run.totals.errors ? `, ${run.totals.errors} errors` : ""}`;
export const reasonsOf = (run) => Object.entries(run.byReason).map(([k, n]) => `${k} x${n}`).join(", ");

// The verdict, first: PASS or FAIL against the scenario's expected results (computed by the engine), or the plain totals for a custom run. Then the numbers.
export function Verdict({ scenario, result }) {
  const runs = Object.entries(result.runs);
  const ok = scenario ? result.ok : null;
  return (
    <section className={`card card--${scenario ? (ok ? "ok" : "danger") : "neutral"} verdict`} data-testid="verdict" data-state={scenario ? (ok ? "ok" : "bad") : "info"} aria-live="polite">
      <p className="kicker">Verdict</p>
      <h2 className="card__title">
        {scenario ? <Chip state={ok ? "ok" : "bad"} testId="verdict-chip">{ok ? "PASS" : "FAIL"}</Chip> : <Chip state="info" testId="verdict-chip">RESULT</Chip>}{" "}
        <span data-testid="verdict-text">{runs.map(([l, r]) => sumLine(runs.length > 1 ? l : "", r)).join(". ")}.</span>
      </h2>
      {scenario && <p data-testid="verdict-story">{visible(scenario.story)}</p>}
      {runs.map(([l, r]) => Object.keys(r.byReason).length > 0 && <p className="muted" key={l} data-testid={`verdict-reasons-${l}`}>Refused for: {reasonsOf(r)}{runs.length > 1 ? ` (${l})` : ""}</p>)}
      {scenario && (
        <details open>
          <summary data-testid="expected-summary">{result.checks.filter((c) => c.pass).length} of {result.checks.length} expected results hold</summary>
          <div className="scroll">
            <table className="tbl" data-testid="expected-table">
              <thead><tr><th>Expected</th><th>Actual</th><th>Holds</th></tr></thead>
              <tbody>
                {result.checks.map((c) => (
                  <tr key={c.path + c.op + String(c.value ?? c.than)} data-testid="expected-row">
                    <td><code>{c.path}</code> {c.op} {c.than !== undefined ? <code>{c.than}</code> : <code>{String(c.value)}</code>}{c.than !== undefined ? ` (${String(c.wanted)})` : ""}</td>
                    <td data-testid="expected-actual">{String(c.actual)}</td>
                    <td><Chip state={c.pass ? "ok" : "bad"}>{c.pass ? "yes" : "no"}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

// One run: chips, the chart, the engine's own view, what the client sees, the request and the gateway trace.
export function RunPanel({ label, run, request, traces, labels, shared }) {
  return (
    <section className="runpanel stack" data-testid={`run-${label}`} aria-label={`Run ${label}`}>
      <Card kicker={label === run.engine || label === "run" ? "Run" : `Run: ${label}`} title={ENGINE_TITLE[run.engine] || run.engine} testId={`runcard-${label}`}>
        <p>
          <Chip state="ok" testId={`allowed-${label}`}>{run.totals.allowed} allowed</Chip>
          <Chip state={run.totals.refused ? "warn" : "none"} testId={`refused-${label}`}>{run.totals.refused} refused</Chip>
          {run.totals.errors > 0 && <Chip state="bad" testId={`errors-${label}`}>{run.totals.errors} errors</Chip>}
          <span className="muted"> of {run.totals.requests} requests, {run.profile.durationMs / 1000} s of lab time</span>
        </p>
        <RateChart run={run} title={ENGINE_TITLE[run.engine] || run.engine} yMaxRequests={shared?.reqMax} yMaxLevel={shared?.lvlMax} testId={`chart-${label}`} />
      </Card>
      {run.engine === "cluster" && <ClusterView run={run} request={request} />}
      {run.engine === "appCaps" && <AppCapsView run={run} labels={labels} />}
      <ClientView run={run} />
      <details className="reqjson">
        <summary>The request that made this run</summary>
        <Json value={request} label="request to /api/run" testId={`request-${label}`} hot={["engine", "capacity", "refillPerSec", "maxInFlight", "nodes", "shared"]} />
        <Json value={{ firstAllowed: run.firstAllowed, totals: run.totals, byReason: run.byReason, ...(run.byAgent ? { byAgent: run.byAgent } : {}), refusals: run.refusals, refusalsTruncated: run.refusalsTruncated, model: run.model }} label="what the engine recorded" testId={`result-${label}`} hot={HOT} />
      </details>
      <GatewayTrace exchanges={traces || []} source="mock" basisNote={TRACE_NOTE} hot={["error", "message", "unverified"]} title={`What Privilege did (simulated), ${label}`} />
    </section>
  );
}

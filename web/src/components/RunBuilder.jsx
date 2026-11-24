import { useState } from "react";
import { visible } from "../safeText";
import { Card } from "./Bits.jsx";

// The controls and the load generator. Values go to the server as typed (a number when it reads as one, else the raw text), so a zero, a negative or a word
// reaches the server's own validation and its 400 is shown plainly, not hidden by a clever input.
const asValue = (s) => { const t = String(s).trim(); if (t === "") return ""; const n = Number(t); return Number.isFinite(n) ? n : t; };

const ENGINES = [
  ["bucket", "Refilling bucket"], ["fixedWindow", "Fixed window"], ["inflight", "In-flight cap"], ["cluster", "Cluster of nodes (bucket)"], ["appCaps", "App-wide caps (MCP or A2A)"],
];
const PHASE_TYPES = [["steady", "Steady"], ["burst", "Burst"], ["spike", "Spike"], ["idle", "Idle"]];
const PRESETS = {
  steady: [{ type: "steady", amount: "5", durationMs: "10000", callMs: "0", agents: "" }],
  burst: [{ type: "burst", amount: "30", durationMs: "1000", callMs: "0", agents: "" }, { type: "idle", amount: "", durationMs: "6000", callMs: "0", agents: "" }],
  spike: [{ type: "steady", amount: "2", durationMs: "5000", callMs: "0", agents: "" }, { type: "spike", amount: "40", durationMs: "3000", callMs: "0", agents: "" }, { type: "steady", amount: "2", durationMs: "5000", callMs: "0", agents: "" }],
};
const DEFAULTS = {
  engine: "bucket", capacity: "10", refillPerSec: "2", limit: "10", windowMs: "10000", maxInFlight: "2", nodes: "2", shared: false, storeAvailable: true,
  kind: "mcp", appRpm: "12", appMaxConcurrent: "50", keyRpm: "30", keyMaxConcurrent: "50", tickMs: "1000",
};

export const buildRequest = (f, phases) => {
  const bucket = { capacity: asValue(f.capacity), refillPerSec: asValue(f.refillPerSec) };
  const config = {
    bucket,
    fixedWindow: { limit: asValue(f.limit), windowMs: asValue(f.windowMs) },
    inflight: { maxInFlight: asValue(f.maxInFlight) },
    cluster: { nodes: asValue(f.nodes), shared: f.shared, storeAvailable: f.storeAvailable, limit: { kind: "bucket", ...bucket } },
    appCaps: { kind: f.kind, appRpm: asValue(f.appRpm), appMaxConcurrent: asValue(f.appMaxConcurrent), keyRpm: asValue(f.keyRpm), keyMaxConcurrent: asValue(f.keyMaxConcurrent) },
  }[f.engine];
  const profile = {
    tickMs: asValue(f.tickMs),
    phases: phases.map((p) => {
      if (p.type === "idle") return { type: "idle", durationMs: asValue(p.durationMs) };
      const o = { type: p.type, durationMs: asValue(p.durationMs), [p.type === "burst" ? "count" : "ratePerSec"]: asValue(p.amount) };
      if (String(p.callMs).trim() !== "" && String(p.callMs).trim() !== "0") o.callMs = asValue(p.callMs);
      if (f.engine === "appCaps" && p.agents.trim()) o.agents = p.agents.split(",").map((a) => a.trim()).filter(Boolean);
      return o;
    }),
  };
  return { engine: f.engine, config, profile };
};

function Field({ label, id, value, onChange, hint, type = "text", testId }) {
  return (
    <label htmlFor={id}>{label}
      <input id={id} type={type} inputMode={type === "text" ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId || id} aria-describedby={hint ? `${id}-hint` : undefined} autoComplete="off" />
      {hint && <span className="muted" id={`${id}-hint`}>{hint}</span>}
    </label>
  );
}

export default function RunBuilder({ onRun, busy, error }) {
  const [f, setF] = useState(DEFAULTS);
  const [phases, setPhases] = useState(PRESETS.burst);
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));
  const setPhase = (i, k, v) => setPhases((cur) => cur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const e = f.engine;
  return (
    <Card kicker="Build your own run" title="Controls and load generator" testId="run-builder">
      <p className="muted">Every value goes to the server as typed. A zero, a negative number or a word is refused there, and the refusal is shown as the server worded it.</p>
      <form className="builder" onSubmit={(ev) => { ev.preventDefault(); onRun(buildRequest(f, phases)); }} aria-label="Run builder">
        <fieldset className="fieldset">
          <legend>Limiter</legend>
          <label htmlFor="run-engine">Engine
            <select id="run-engine" value={e} onChange={(ev) => set("engine")(ev.target.value)} data-testid="run-engine">{ENGINES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </label>
          {(e === "bucket" || e === "cluster") && (
            <div className="filters">
              <Field label="Capacity (tokens)" id="cfg-capacity" value={f.capacity} onChange={set("capacity")} hint="the most the bucket holds" />
              <Field label="Refill per second" id="cfg-refill" value={f.refillPerSec} onChange={set("refillPerSec")} hint="tokens added every second, continuously" />
            </div>
          )}
          {e === "fixedWindow" && (
            <div className="filters">
              <Field label="Limit per window" id="cfg-limit" value={f.limit} onChange={set("limit")} />
              <Field label="Window (ms)" id="cfg-window-ms" value={f.windowMs} onChange={set("windowMs")} />
            </div>
          )}
          {e === "inflight" && <div className="filters"><Field label="In-flight cap (calls at once)" id="cfg-max-inflight" value={f.maxInFlight} onChange={set("maxInFlight")} /></div>}
          {e === "cluster" && (
            <div className="filters">
              <Field label="Node count" id="cfg-nodes" value={f.nodes} onChange={set("nodes")} />
              <label className="check" htmlFor="cfg-shared"><input id="cfg-shared" type="checkbox" checked={f.shared} onChange={(ev) => set("shared")(ev.target.checked)} data-testid="cfg-shared" /> Shared store on (a Redis stand-in)</label>
              <label className="check" htmlFor="cfg-store-up"><input id="cfg-store-up" type="checkbox" checked={f.storeAvailable} onChange={(ev) => set("storeAvailable")(ev.target.checked)} data-testid="cfg-store-up" /> Shared store is available</label>
            </div>
          )}
          {e === "appCaps" && (
            <div className="filters">
              <label htmlFor="cfg-kind">App kind
                <select id="cfg-kind" value={f.kind} onChange={(ev) => set("kind")(ev.target.value)} data-testid="cfg-kind"><option value="mcp">MCP</option><option value="a2a">A2A</option></select>
              </label>
              <Field label="App-wide requests a minute" id="cfg-app-rpm" value={f.appRpm} onChange={set("appRpm")} />
              <Field label="App-wide max concurrent" id="cfg-app-conc" value={f.appMaxConcurrent} onChange={set("appMaxConcurrent")} />
              <Field label="Per-key requests a minute" id="cfg-key-rpm" value={f.keyRpm} onChange={set("keyRpm")} />
              <Field label="Per-key max concurrent" id="cfg-key-conc" value={f.keyMaxConcurrent} onChange={set("keyMaxConcurrent")} />
            </div>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Load generator</legend>
          <div className="seg" role="group" aria-label="Load presets">
            {[["steady", "Steady"], ["burst", "Burst"], ["spike", "Spike"]].map(([id, label]) => <button key={id} type="button" onClick={() => setPhases(PRESETS[id])} data-testid={`preset-${id}`}>{label}</button>)}
          </div>
          <ol className="phases">
            {phases.map((p, i) => (
              <li key={i} data-testid={`phase-${i}`}>
                <div className="filters">
                  <label htmlFor={`ph-type-${i}`}>Phase {i + 1}
                    <select id={`ph-type-${i}`} value={p.type} onChange={(ev) => setPhase(i, "type", ev.target.value)} data-testid={`ph-type-${i}`}>{PHASE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  </label>
                  {p.type !== "idle" && <Field label={p.type === "burst" ? "Requests at once" : "Requests a second"} id={`ph-amount-${i}`} value={p.amount} onChange={(v) => setPhase(i, "amount", v)} />}
                  <Field label="Duration (ms)" id={`ph-dur-${i}`} value={p.durationMs} onChange={(v) => setPhase(i, "durationMs", v)} />
                  {p.type !== "idle" && <Field label="Call length (ms)" id={`ph-call-${i}`} value={p.callMs} onChange={(v) => setPhase(i, "callMs", v)} hint="how long a call holds an in-flight slot" />}
                  {p.type !== "idle" && e === "appCaps" && <Field label="Agents (ids, comma separated)" id={`ph-agents-${i}`} value={p.agents} onChange={(v) => setPhase(i, "agents", v)} hint="letters, digits and dashes, up to 40 each" />}
                </div>
                {phases.length > 1 && <button type="button" onClick={() => setPhases((cur) => cur.filter((_, j) => j !== i))} data-testid={`ph-remove-${i}`}>Remove phase {i + 1}</button>}
              </li>
            ))}
          </ol>
          <div className="seg">
            <button type="button" disabled={phases.length >= 8} onClick={() => setPhases((cur) => [...cur, { type: "steady", amount: "5", durationMs: "5000", callMs: "0", agents: "" }])} data-testid="ph-add">Add a phase</button>
            <Field label="Chart tick (ms)" id="cfg-tick" value={f.tickMs} onChange={set("tickMs")} />
          </div>
        </fieldset>

        <div className="seg"><button type="submit" className="primary" disabled={busy} data-testid="run-custom">{busy ? "Running..." : "Run it"}</button></div>
        {error && <p className="field-error" role="alert" data-testid="run-error"><strong>{visible(error.code || "error")}:</strong> {visible(error.message)}</p>}
      </form>
    </Card>
  );
}

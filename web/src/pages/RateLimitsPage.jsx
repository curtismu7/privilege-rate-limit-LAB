import { useCallback, useEffect, useRef, useState } from "react";
import { getScenarios, postRun, postScenario } from "../api";
import { Card, Chip, Loading } from "../components/Bits.jsx";
import RunBuilder from "../components/RunBuilder.jsx";
import { RunPanel, Verdict } from "../components/RunViews.jsx";
import { scenarioFromHash } from "../hashNav.js";
import { visible } from "../safeText";

// Both runs of a side-by-side get one scale, so a bucket and a fixed window can be compared by eye.
export const scalesOf = (runs) => ({
  reqMax: Math.max(0, ...runs.flatMap((r) => r.series.map((s) => s.allowed + s.refused + s.errors))),
  lvlMax: Math.max(0, ...runs.flatMap((r) => r.series.flatMap((s) => [s.tokens ?? 0, s.inFlight ?? 0]))),
});

export default function RateLimitsPage({ lab }) {
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [current, setCurrent] = useState(null); // { scenario, result, requests, traces }
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState(null);
  const seq = useRef(0);
  const runNo = useRef(0); // one number per run on screen: a panel is keyed by it, so no panel keeps state (a cluster compare) from the run before

  useEffect(() => { getScenarios().then((r) => (r.ok ? setList(r.body.scenarios) : setListError(r.body?.message || `HTTP ${r.status}`))); }, []);

  const pick = useCallback(async (sc) => {
    const mine = ++seq.current; // a late answer for a scenario the visitor has left is dropped
    setBusy(true); setRunError(null);
    const r = await postScenario(sc.id);
    if (mine !== seq.current) return;
    setBusy(false);
    // A failed run leaves no result of an earlier run beside its error, and no scenario button pressed.
    if (!r.ok) { setCurrent(null); setRunError({ code: r.body?.error, message: r.body?.message || `HTTP ${r.status}` }); return; }
    setCurrent({ n: (runNo.current += 1), scenario: sc, result: r.body, requests: sc.runs, traces: r.body.traces });
  }, []);

  const custom = useCallback(async (req) => {
    const mine = ++seq.current;
    setBusy(true); setRunError(null);
    const r = await postRun(req.engine, req.config, req.profile);
    if (mine !== seq.current) return;
    setBusy(false);
    if (!r.ok) { setCurrent(null); setRunError({ code: r.body?.error, message: r.body?.message || `HTTP ${r.status}` }); return; }
    const { traces, ...run } = r.body;
    setCurrent({ n: (runNo.current += 1), scenario: null, result: { runs: { run } }, requests: { run: req }, traces: { run: traces } });
  }, []);

  // "#limits/<scenario id>" is a deliberate navigation: the page runs that scenario when it is navigated to (a first load, a link such as the Stories page's
  // "Run this beat", the back button). Reset, a new industry and a real mode change clear the id from the hash first (App.jsx), so a remount never replays it.
  const listRef = useRef(null); listRef.current = list;
  const pickRef = useRef(pick); pickRef.current = pick;
  const startedFor = useRef(null);
  useEffect(() => {
    if (!list || startedFor.current === list) return;
    startedFor.current = list;
    const sc = list.find((s) => s.id === scenarioFromHash());
    if (sc) pick(sc);
  }, [list, pick]);
  useEffect(() => {
    const on = () => { const sc = listRef.current?.find((s) => s.id === scenarioFromHash()); if (sc) pickRef.current(sc); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // On a narrow screen the verdict is a long way below the scenario buttons: bring it into view when a run finishes.
  const verdictRef = useRef(null);
  useEffect(() => { if (current && window.matchMedia?.("(max-width: 900px)").matches) verdictRef.current?.scrollIntoView?.({ block: "start" }); }, [current]);
  const labels = lab.story?.agentLabels;
  const runs = current ? Object.entries(current.result.runs) : [];
  const shared = runs.length > 1 ? scalesOf(runs.map(([, r]) => r)) : undefined;

  return (
    <div className="stack">
      <Card kicker="Seven scenarios" title="Pick one: each is a short run on the lab clock with an expected result" testId="scenarios-card">
        {listError && <p className="field-error" role="alert" data-testid="scenarios-error">{visible(listError)}</p>}
        {!list && !listError && <Loading />}
        {list && (
          <div className="card-grid card-grid--scen" role="group" aria-label="Scenarios">
            {list.map((sc, i) => (
              <button key={sc.id} type="button" className="card card--pick" aria-pressed={current?.scenario?.id === sc.id} disabled={busy} onClick={() => pick(sc)} data-testid={`scenario-${sc.id}`}>
                <span className="kicker">Scenario {i + 1}</span>
                <span className="card__title">{visible(sc.title)}</span>
              </button>
            ))}
          </div>
        )}
        {runError && !current && <p className="field-error" role="alert" data-testid="scenario-error">{visible(runError.message)}</p>}
      </Card>

      {!current && !busy && (
        <Card kicker="Verdict" title="No run yet" tone="neutral" testId="empty-state">
          <p>Pick a scenario above, or build a run below. The verdict (PASS or FAIL against what the lab expects) comes first, then the chart, then the detail. Everything is simulated; nothing leaves this machine.</p>
        </Card>
      )}
      {busy && <p className="muted" role="status" data-testid="running">Running on the lab clock...</p>}

      {current && (
        <>
          <div ref={verdictRef} className="verdict-anchor"><Verdict scenario={current.scenario} result={current.result} /></div>
          <div className={runs.length > 1 ? "cols" : ""} data-testid="runs">
            {runs.map(([label, run]) => (
              <RunPanel key={`${current.n}-${label}`} label={label} run={run} request={current.requests[label]} traces={current.traces?.[label]} labels={labels} shared={shared} />
            ))}
          </div>
          {runs.length > 1 && <Chip state="info" testId="same-scale">Both charts use one scale so they can be compared. <span className="muted">Lab model, UNVERIFIED against the product.</span></Chip>}
        </>
      )}

      <RunBuilder onRun={custom} busy={busy} error={runError} />
    </div>
  );
}

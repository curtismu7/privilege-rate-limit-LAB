import { useCallback, useEffect, useState } from "react";
import RunObservability from "../run-observability/RunObservability.jsx";
import { Card, Chip, Loading } from "../components/Bits.jsx";
import { getObservability } from "../api";
import { visible } from "../safeText";

// Rule 27: what the latest run in this workspace left behind. Every row is simulated (this lab's own engine computed it) and tagged so; a layer the lab never
// touched says "not logged". The only real log the lab writes is one stdout line per decision, with no token in it.
export default function ObservabilityPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    const r = await getObservability();
    if (r.ok) { setData(r.body); setError(null); } else setError(r.body?.message || `HTTP ${r.status}`);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="stack">
      <Card kicker="What this run left behind" title="The log and audit rows of the latest run, by layer" testId="obs-intro">
        <p>These rows were computed by this lab's own mock on the lab clock, so every one is tagged <Chip state="info">simulated</Chip>. Where the product logs a rate-limit decision is not in the release notes, so the lab claims nothing about it; a layer it never touched says <em>not logged</em>. Times are lab time on a fixed lab date, not today.</p>
        <p className="muted">The lab itself writes one stdout line per decision (actor and outcome, never a token). In Docker that is the container's stdout; a collector can ship it to a SIEM, and this lab configures none.</p>
        <div className="seg"><button type="button" className="primary" onClick={load} data-testid="obs-refresh">Refresh</button></div>
      </Card>
      {error && <p className="field-error" role="alert" data-testid="obs-error">{visible(error)}</p>}
      {!data && !error && <Loading />}
      {data && !data.run && (
        <Card tone="neutral" kicker="Empty" title="Nothing has run in this workspace yet" testId="obs-empty">
          <p>Run a scenario on the <a href="#limits">Rate limits</a> page, then come back: the first served call and every refusal of that run appear here, in time order.</p>
        </Card>
      )}
      {data?.run && !data.record && (
        <Card tone="neutral" kicker="No decisions" title="This run made no decisions" testId="obs-no-decisions">
          <p data-testid="obs-run">Run {visible(data.run.runId)}: {visible(data.run.kind)} {visible(data.run.id)}. It sent no request (an idle profile, say), so there is nothing to log. That is different from nothing having run.</p>
        </Card>
      )}
      {data?.record && (
        <>
          <p className="muted" data-testid="obs-run">Run {visible(data.run.runId)}: {visible(data.run.kind)} {visible(data.run.id)}</p>
          {data.run.truncated && <p className="field-error" role="status" data-testid="obs-truncated">Showing {data.run.shown} of {data.run.decisions} rows (the first served call and every refusal of this run). The engine keeps the first 50 refusals of each run and this page lists at most 60 rows, so the rest are not shown, and the absence of a row is not proof that nothing happened.</p>}
          <RunObservability record={data.record} source="mock" streams={data.streams} title="What each layer logged for this run" />
        </>
      )}
    </div>
  );
}

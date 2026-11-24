import { useEffect, useState } from "react";
import { Card, Chip, Loading } from "../components/Bits.jsx";
import { getLimits } from "../api";
import { visible } from "../safeText";

// What the release notes say, against what this lab models. The left is the only sourced part; the right is the lab's own model and UNVERIFIED.
// The open question carries no result and no opinion on purpose (owner decision 2026-11-24).
export default function UnverifiedPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getLimits().then((r) => (r.ok ? setData(r.body) : setError(r.body?.message || `HTTP ${r.status}`))); }, []);
  if (error) return <p className="field-error" role="alert" data-testid="limits-error">{visible(error)}</p>;
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="cols">
        <Card tone="ok" kicker="Sourced" title="What the release notes say" testId="says">
          <p className="muted">{visible(data.releaseNotes.source)}. This is everything the lab takes from them.</p>
          <ul className="plain">{data.releaseNotes.says.map((x) => <li key={x.id} data-testid={`says-${x.id}`}><Chip state="ok">release notes</Chip> {visible(x.text)}</li>)}</ul>
        </Card>
        <Card tone="warn" kicker="Not built" title="What this lab does not do" testId="not-built">
          <ul className="plain">{data.notBuilt.map((x) => <li key={x.id} data-testid={`notbuilt-${x.id}`}>{visible(x.text)}</li>)}</ul>
        </Card>
      </div>

      <Card tone="neutral" kicker="Open question" title={visible(data.openQuestions[0].question)} testId="open-question">
        <p><Chip state="info" testId="open-chip">Open: no result shown</Chip></p>
        <p>{visible(data.openQuestions[0].note)} It is listed here because it is an interaction people ask about, not because the lab knows the answer.</p>
        <div className="seg"><button type="button" className="primary" onClick={() => { window.location.hash = "#limits"; }} data-testid="to-scenarios">Back to the scenarios</button></div>
      </Card>

      <Card tone="warn" kicker="UNVERIFIED" title="What the lab models, beyond the release notes" testId="model">
        <div className="scroll">
          <table className="tbl tbl--wide" data-testid="model-table">
            <thead><tr><th>Feature</th><th>The lab's model</th><th>Why it is UNVERIFIED</th></tr></thead>
            <tbody>
              {data.labModel.map((m) => (
                <tr key={m.id} data-testid={`model-${m.id}`}>
                  <td><Chip state="info">{visible(m.feature)}</Chip></td>
                  <td>{visible(m.model)}</td>
                  <td><Chip state="warn">UNVERIFIED</Chip> {visible(m.unverified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

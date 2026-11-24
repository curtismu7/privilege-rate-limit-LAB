import { Card, Chip } from "../components/Bits.jsx";
import { visible } from "../safeText";

// Stories are data with {{cast}} tokens (server/src/data.js), filled from the vertical pack the header picks. Each beat runs one scenario.
export default function StoriesPage({ lab }) {
  const s = lab.story;
  return (
    <div className="stack">
      <Card kicker="Story" title={visible(s.title)} testId="story-intro">
        <p data-testid="story-text">{visible(s.intro)}</p>
        <p className="muted">Cast for {visible(s.vertical)} (the industry in the header). These names are labels on this page; the engines use the plain ids agent-a, agent-b and agent-c.</p>
        <dl className="kv" data-testid="cast">
          <dt>Agent A</dt><dd>{visible(s.agentLabels["agent-a"])}</dd>
          <dt>Agent B</dt><dd>{visible(s.agentLabels["agent-b"])}</dd>
          <dt>Agent C</dt><dd>{visible(s.agentLabels["agent-c"])}</dd>
        </dl>
        <div className="seg"><button type="button" className="primary" onClick={() => { window.location.hash = `#limits/${s.beats[0].id}`; }} data-testid="story-start">Start with beat 1</button></div>
      </Card>
      <ol className="beats-list" data-testid="beats">
        {s.beats.map((b, i) => (
          <li key={b.id} data-testid={`beat-${b.id}`}>
            <Card kicker={`Beat ${i + 1} of ${s.beats.length}`} title={visible(b.title)}>
              <p>{visible(b.say)}</p>
              <p className="muted"><Chip state="info">Watch</Chip> {visible(b.watch)}</p>
              <div className="seg"><a className="beat-link" href={`#limits/${b.id}`} data-testid={`beat-run-${b.id}`}>Run this beat</a></div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

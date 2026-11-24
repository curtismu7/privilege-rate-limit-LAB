import { useEffect, useMemo, useRef, useState } from "react";

// The live chart of a run's series[] (t, allowed, refused, errors, tokens, inFlight), built to the dataviz method:
//  - ONE axis per panel, no dual axis: the top panel counts requests per tick (stacked columns: allowed, refused, errors), the bottom panel the bucket's tokens
//    and the in-flight calls over the same time axis (lines; a fixed window is drawn as steps, because it resets all at once);
//  - categorical colours in fixed order (blue, orange, aqua; green for in-flight) from validated tokens in app.css, with a 2px surface gap between stacked
//    segments and a 2px surface ring on end markers; text wears text tokens, never the series colour;
//  - a legend (two or more series) and direct labels at the line ends, a hover and keyboard readout, and a table view, so colour is never the only cue.
const PAD = { l: 38, r: 96, t: 8, b: 40 };
const GAP = 2;

const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};
// max is already a nice number (1, 2 or 5 times a power of ten), so these counts give whole or half steps.
const ticksOf = (max) => {
  const f = max / 10 ** Math.floor(Math.log10(max));
  const n = Math.round(f) === 2 ? 4 : Math.round(f) === 5 ? 5 : 2;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(((max * i) / n) * 1000) / 1000);
};
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const secs = (ms) => `${fmt(ms / 1000)} s`;

function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => { const n = el.getBoundingClientRect().width; if (n > 0) setW(Math.floor(n)); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function RateChart({ run, title, yMaxRequests, yMaxLevel, testId = "chart" }) {
  const wrap = useRef(null);
  const width = Math.max(260, useWidth(wrap));
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const series = run.series;
  const stepped = run.engine === "fixedWindow" || run.config?.limit?.kind === "fixedWindow";
  const hasTokens = series.some((s) => typeof s.tokens === "number");
  const hasInFlight = series.some((s) => typeof s.inFlight === "number");
  const hasErrors = series.some((s) => s.errors > 0);
  // What the "tokens" series is, by engine: the bucket's tokens, the window's remaining requests, the app-wide requests a minute left.
  const tokensName = stepped ? "left in window" : run.engine === "appCaps" ? "app requests left" : "tokens";

  const g = useMemo(() => {
    const w = width - PAD.l - PAD.r;
    const tEnd = series.length ? series[series.length - 1].t : 1;
    const tickMs = run.profile?.tickMs || 1000;
    const reqMax = niceMax(Math.max(yMaxRequests || 0, ...series.map((s) => s.allowed + s.refused + s.errors)));
    const levels = series.flatMap((s) => [s.tokens ?? 0, s.inFlight ?? 0]).concat([run.start?.tokens ?? 0]);
    const lvlMax = niceMax(Math.max(yMaxLevel || 0, ...levels));
    return { w, tEnd, tickMs, reqMax, lvlMax, x: (t) => PAD.l + (t / tEnd) * w, colW: Math.max(1, w / series.length) };
  }, [series, width, run.profile, run.start, yMaxRequests, yMaxLevel]);

  const H1 = 130; const H2 = hasTokens || hasInFlight ? 110 : 0; const GAP_PANELS = H2 ? 22 : 0;
  const y1 = (v) => PAD.t + H1 - (v / g.reqMax) * H1;
  const top2 = PAD.t + H1 + GAP_PANELS;
  const y2 = (v) => top2 + H2 - (v / g.lvlMax) * H2;
  const height = top2 + H2 + PAD.b;

  const path = (key) => {
    const pts = [{ t: 0, v: run.start?.[key] ?? series[0]?.[key] ?? 0 }, ...series.filter((s) => typeof s[key] === "number").map((s) => ({ t: s.t, v: s[key] }))];
    if (!series.some((s) => typeof s[key] === "number")) return "";
    let d = `M${g.x(pts[0].t)},${y2(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) d += stepped ? `H${g.x(pts[i].t)}V${y2(pts[i].v)}` : `L${g.x(pts[i].t)},${y2(pts[i].v)}`;
    return d;
  };
  const lastOf = (key) => { for (let i = series.length - 1; i >= 0; i--) if (typeof series[i][key] === "number") return series[i]; return null; };

  const xTickStep = niceMax(g.tEnd / 1000 / Math.max(2, Math.floor(g.w / 90))) * 1000;
  const xTicks = []; for (let t = 0; t <= g.tEnd + 1; t += xTickStep) xTicks.push(t);

  const indexAt = (clientX, el) => {
    const r = el.getBoundingClientRect();
    return Math.min(series.length - 1, Math.max(0, Math.floor(((clientX - r.left - PAD.l) / g.w) * series.length)));
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(series.length - 1, (h ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? series.length) - 1)); }
    else if (e.key === "Escape") setHover(null);
  };
  const h = hover !== null ? series[hover] : null;
  const legend = [["allowed", "Allowed"], ["refused", "Refused"], ...(hasErrors ? [["error", "Error (store down)"]] : []), ...(hasTokens ? [["tokens", tokensName === "tokens" ? "Tokens in the bucket" : stepped ? "Left in the window" : "App requests a minute left"]] : []), ...(hasInFlight ? [["inflight", run.engine === "appCaps" ? "App calls in flight" : "In-flight calls"]] : [])];
  const tokLast = lastOf("tokens"); const infLast = lastOf("inFlight");

  return (
    <figure className="chart" data-testid={testId} ref={wrap}>
      {title && <figcaption className="chart__title">{title}</figcaption>}
      <ul className="chart__legend" aria-label="Legend">
        {legend.map(([k, label]) => <li key={k}><span className={`chart__swatch chart__swatch--${k}`} aria-hidden="true" />{label}</li>)}
      </ul>
      <div className="chart__plot">
        <svg width={width} height={height} role="group" aria-label={`${title || "Run"}: requests per ${secs(g.tickMs)} tick${H2 ? " and tokens or in-flight calls" : ""} over ${secs(g.tEnd)} of lab time. ${run.totals.allowed} allowed, ${run.totals.refused} refused.`}>
          {ticksOf(g.reqMax).map((v) => (
            <g key={`a${v}`}><line className="chart__grid" x1={PAD.l} x2={PAD.l + g.w} y1={y1(v)} y2={y1(v)} /><text className="chart__axis" x={PAD.l - 6} y={y1(v)} dy="0.32em" textAnchor="end">{fmt(v)}</text></g>
          ))}
          <text className="chart__axis chart__axis--unit" x={PAD.l + g.w + 6} y={y1(g.reqMax)} dy="0.9em">requests</text>
          <text className="chart__axis chart__axis--unit" x={PAD.l + g.w + 6} y={y1(g.reqMax)} dy="2.2em">per tick</text>
          {series.map((s, i) => {
            const x = g.x(s.t - g.tickMs) + (g.colW > 4 ? 1 : 0);
            const cw = Math.max(1, g.colW - (g.colW > 4 ? 2 : 0));
            let base = 0; const segs = [];
            for (const [k, n] of [["allowed", s.allowed], ["refused", s.refused], ["error", s.errors]]) {
              if (!n) continue;
              const hgt = ((n / g.reqMax) * H1);
              const gap = base > 0 ? GAP : 0;
              segs.push(<rect key={k} className={`chart__bar chart__bar--${k}`} x={x} width={cw} y={y1(base + n)} height={Math.max(1, hgt - gap)} rx={cw > 6 ? 2 : 0} />);
              base += n;
            }
            return <g key={s.t} data-tick={i}>{segs}</g>;
          })}
          {xTicks.map((t) => <g key={`x${t}`}><text className="chart__axis" x={g.x(t)} y={height - 22} textAnchor="middle">{fmt(t / 1000)}</text></g>)}
          <text className="chart__axis chart__axis--unit" x={PAD.l + g.w / 2} y={height - 5} textAnchor="middle">lab time, seconds</text>
          {H2 > 0 && (
            <g>
              {ticksOf(g.lvlMax).map((v) => (
                <g key={`b${v}`}><line className="chart__grid" x1={PAD.l} x2={PAD.l + g.w} y1={y2(v)} y2={y2(v)} /><text className="chart__axis" x={PAD.l - 6} y={y2(v)} dy="0.32em" textAnchor="end">{fmt(v)}</text></g>
              ))}
              {hasTokens && <path className="chart__line chart__line--tokens" d={path("tokens")} />}
              {hasInFlight && <path className="chart__line chart__line--inflight" d={path("inFlight")} />}
              {hasTokens && tokLast && <g><circle className="chart__dot chart__dot--tokens" cx={g.x(tokLast.t)} cy={y2(tokLast.tokens)} r="4" /><text className="chart__label" x={g.x(tokLast.t) + 8} y={y2(tokLast.tokens) - (hasInFlight && infLast && Math.abs(y2(tokLast.tokens) - y2(infLast.inFlight)) < 14 ? 7 : 0)} dy="0.32em">{`${stepped ? "left" : run.engine === "appCaps" ? "requests left" : "tokens"} ${fmt(tokLast.tokens)}`}</text></g>}
              {hasInFlight && infLast && <g><circle className="chart__dot chart__dot--inflight" cx={g.x(infLast.t)} cy={y2(infLast.inFlight)} r="4" /><text className="chart__label" x={g.x(infLast.t) + 8} y={y2(infLast.inFlight) + (hasTokens && tokLast && Math.abs(y2(tokLast.tokens) - y2(infLast.inFlight)) < 14 ? 7 : 0)} dy="0.32em">{`in flight ${fmt(infLast.inFlight)}`}</text></g>}
            </g>
          )}
          {h && <line className="chart__cross" x1={g.x(h.t - g.tickMs / 2)} x2={g.x(h.t - g.tickMs / 2)} y1={PAD.t} y2={top2 + H2} />}
          <rect className="chart__hit" x={PAD.l} y={PAD.t} width={g.w} height={top2 + H2 - PAD.t} fill="transparent" tabIndex={0} role="group" aria-label="Chart readout: arrow keys move through the ticks"
            onPointerMove={(e) => setHover(indexAt(e.clientX, e.currentTarget.ownerSVGElement))} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)} data-testid={`${testId}-hit`} />
        </svg>
        {h && (
          <div className="chart__tip" role="status" data-testid={`${testId}-tip`} style={{ left: Math.min(Math.max(g.x(h.t - g.tickMs / 2), 80), width - 80) }}>
            <strong>{secs(h.t)}</strong>
            <span>allowed {h.allowed}, refused {h.refused}{hasErrors ? `, errors ${h.errors}` : ""}</span>
            {typeof h.tokens === "number" && <span>{tokensName} {fmt(h.tokens)}</span>}
            {typeof h.inFlight === "number" && <span>in flight {h.inFlight}</span>}
          </div>
        )}
      </div>
      <button type="button" className="chart__toggle" aria-pressed={table} onClick={() => setTable((v) => !v)} data-testid={`${testId}-table-toggle`}>{table ? "Hide the table" : "Show as a table"}</button>
      {table && (
        <div className="scroll">
          <table className="tbl" data-testid={`${testId}-table`}>
            <caption>Series per {secs(g.tickMs)} tick (lab time at the end of the tick)</caption>
            <thead><tr><th>t</th><th>Allowed</th><th>Refused</th>{hasErrors && <th>Errors</th>}{hasTokens && <th>{tokensName === "tokens" ? "Tokens" : "Left"}</th>}{hasInFlight && <th>In flight</th>}</tr></thead>
            <tbody>{series.map((s) => <tr key={s.t}><td>{secs(s.t)}</td><td>{s.allowed}</td><td>{s.refused}</td>{hasErrors && <td>{s.errors}</td>}{hasTokens && <td>{typeof s.tokens === "number" ? fmt(s.tokens) : "-"}</td>}{hasInFlight && <td>{typeof s.inFlight === "number" ? s.inFlight : "-"}</td>}</tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

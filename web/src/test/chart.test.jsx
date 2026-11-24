import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RateChart from "../components/RateChart.jsx";
import chartSource from "../components/RateChart.jsx?raw";
import { runLoad } from "../../../server/src/load.js";

afterEach(cleanup);
const bucket = () => runLoad({ engine: "bucket", config: { capacity: 10, refillPerSec: 2 }, profile: { phases: [{ type: "burst", count: 15, durationMs: 1000 }, { type: "idle", durationMs: 4000 }] } });

describe("RateChart (the live chart of series[])", () => {
  it("draws one stack per tick, allowed and refused as columns, tokens as a line, a legend and direct labels", () => {
    const run = bucket();
    render(<RateChart run={run} title="Refilling bucket" />);
    const svg = screen.getByTestId("chart").querySelector("svg");
    expect(svg.getAttribute("aria-label")).toMatch(/10 allowed, 5 refused/);
    expect(svg.querySelectorAll("[data-tick]")).toHaveLength(run.series.length);
    expect(svg.querySelectorAll(".chart__bar--allowed")).toHaveLength(1);
    expect(svg.querySelectorAll(".chart__bar--refused")).toHaveLength(1);
    expect(svg.querySelectorAll(".chart__line--tokens")).toHaveLength(1);
    expect(svg.querySelector(".chart__label").textContent).toBe("tokens 10"); // the last tick: the bucket is full again
    const legend = screen.getByLabelText("Legend");
    expect(legend).toHaveTextContent("Allowed"); expect(legend).toHaveTextContent("Refused"); expect(legend).toHaveTextContent("Tokens in the bucket");
    expect(legend).not.toHaveTextContent("Error"); // no errors in this run, so no error entry
  });

  it("the readout is inside a group, not an image: an svg role=img would make its focusable child presentational", () => {
    render(<RateChart run={bucket()} title="Refilling bucket" />);
    const svg = screen.getByTestId("chart").querySelector("svg");
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toMatch(/10 allowed, 5 refused/);
    expect(svg.contains(screen.getByTestId("chart-hit"))).toBe(true);
    expect(screen.getByTestId("chart-hit").getAttribute("tabindex")).toBe("0");
  });

  it("a stacked column's segments never overlap: refused sits above allowed with a gap", () => {
    render(<RateChart run={bucket()} />);
    const a = screen.getByTestId("chart").querySelector(".chart__bar--allowed");
    const r = screen.getByTestId("chart").querySelector(".chart__bar--refused");
    const aTop = Number(a.getAttribute("y")); const rBottom = Number(r.getAttribute("y")) + Number(r.getAttribute("height"));
    expect(rBottom).toBeLessThanOrEqual(aTop - 1);
  });

  it("a fixed window is drawn as steps (it resets all at once), and the line is named for what it is", () => {
    const run = runLoad({ engine: "fixedWindow", config: { limit: 10, windowMs: 10000 }, profile: { tickMs: 500, phases: [{ type: "idle", durationMs: 9000 }, { type: "burst", count: 10, durationMs: 1000 }, { type: "burst", count: 10, durationMs: 1000 }] } });
    render(<RateChart run={run} />);
    const d = screen.getByTestId("chart").querySelector(".chart__line--tokens").getAttribute("d");
    expect(d).toMatch(/H[\d.]+V[\d.]+/); expect(d).not.toMatch(/L/);
    expect(screen.getByLabelText("Legend")).toHaveTextContent("Left in the window");
  });

  it("in-flight calls get their own line and label; with both lines the labels do not sit on each other", () => {
    const run = runLoad({ engine: "appCaps", config: { kind: "mcp", appRpm: 12, appMaxConcurrent: 50, keyRpm: 30, keyMaxConcurrent: 50 }, profile: { phases: [{ type: "burst", count: 12, durationMs: 1000, agents: ["agent-a"] }] } });
    render(<RateChart run={run} />);
    const labels = [...screen.getByTestId("chart").querySelectorAll(".chart__label")];
    expect(labels).toHaveLength(2);
    const ys = labels.map((l) => Number(l.getAttribute("y")));
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(12);
    expect(screen.getByLabelText("Legend")).toHaveTextContent("App calls in flight");
  });

  it("errors get an entry in the legend only when there are errors", () => {
    const run = runLoad({ engine: "cluster", config: { nodes: 2, shared: true, storeAvailable: false, limit: { kind: "bucket", capacity: 5, refillPerSec: 1 } }, profile: { phases: [{ type: "burst", count: 4, durationMs: 1000 }] } });
    render(<RateChart run={run} />);
    expect(screen.getByLabelText("Legend")).toHaveTextContent("Error (store down)");
    expect(screen.getByTestId("chart").querySelectorAll(".chart__bar--error").length).toBe(1);
  });

  it("the readout works from the keyboard: arrow keys move through the ticks and show the values, Escape clears it", () => {
    const run = bucket();
    render(<RateChart run={run} />);
    const hit = screen.getByTestId("chart-hit");
    hit.focus();
    fireEvent.keyDown(hit, { key: "ArrowRight" });
    const tip = screen.getByTestId("chart-tip");
    expect(tip).toHaveTextContent("1 s"); expect(tip).toHaveTextContent("allowed 10, refused 5"); expect(tip).toHaveTextContent("tokens 2");
    fireEvent.keyDown(hit, { key: "ArrowRight" });
    expect(screen.getByTestId("chart-tip")).toHaveTextContent("2 s");
    fireEvent.keyDown(hit, { key: "Escape" });
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });

  it("the table view lists every tick", () => {
    const run = bucket();
    render(<RateChart run={run} />);
    fireEvent.click(screen.getByTestId("chart-table-toggle"));
    expect(screen.getByTestId("chart-table").querySelectorAll("tbody tr")).toHaveLength(run.series.length);
  });

  it("an empty-looking run (nothing requested) still draws without error", () => {
    const run = runLoad({ engine: "bucket", config: { capacity: 3, refillPerSec: 1 }, profile: { phases: [{ type: "idle", durationMs: 3000 }] } });
    render(<RateChart run={run} />);
    expect(screen.getByTestId("chart").querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("chart").querySelectorAll(".chart__bar--allowed")).toHaveLength(0);
  });

  it("colours come from tokens only: no colour literal in the chart component", () => {
    expect(chartSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { SCENARIOS, getPath } from "../../../server/src/scenarios.js";
import { jsonResponse } from "./harness.js";
import { screen, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const ids = SCENARIOS.map((s) => s.id);

describe("Rate limits page", () => {
  it("shows seven scenario buttons from GET /api/scenarios, no run yet, an empty state and the builder", async () => {
    await h.mount({ page: "limits" });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Scenario \d/ })).toHaveLength(7));
    expect(h.lab.calls.some((c) => c.path === "/api/scenarios")).toBe(true);
    for (const id of ids) expect(screen.getByTestId(`scenario-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No run yet");
    expect(screen.queryByTestId("verdict")).toBeNull();
    expect(screen.getByTestId("run-builder")).toBeInTheDocument();
  });

  // The verdict on the page must equal the engine's own: PASS for a scenario whose expected results all hold, and the numbers shown are the expected ones.
  for (const sc of SCENARIOS) {
    it(`scenario ${sc.id}: the verdict is PASS, every expected result is listed as holding, and the totals shown equal the expected ones`, async () => {
      const user = await h.mount({ page: "limits" });
      await screen.findByTestId(`scenario-${sc.id}`);
      await user.click(screen.getByTestId(`scenario-${sc.id}`));
      const verdict = await screen.findByTestId("verdict");
      expect(screen.getByTestId("verdict-chip")).toHaveTextContent("PASS");
      expect(verdict).toHaveAttribute("data-state", "ok");
      expect(screen.getByTestId("expected-summary")).toHaveTextContent(`${sc.expect.length} of ${sc.expect.length} expected results hold`);
      expect(screen.getAllByTestId("expected-row")).toHaveLength(sc.expect.length);
      // an `eq` expectation on a total is on the page as a chip
      for (const e of sc.expect.filter((x) => x.op === "eq" && /\.totals\.(allowed|refused)$/.test(x.path))) {
        const [label, , kind] = e.path.split(".");
        expect(screen.getByTestId(`${kind}-${label}`), e.path).toHaveTextContent(`${e.value} ${kind}`);
      }
      // verdict first: it comes before every run panel in the page
      const runs = screen.getByTestId("runs");
      expect(verdict.compareDocumentPosition(runs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // the chart is drawn for every run
      for (const label of Object.keys(sc.runs)) expect(screen.getByTestId(`chart-${label}`).querySelector("svg")).not.toBeNull();
    });
  }

  it("a run the engine does not meet is shown as FAIL, not hidden (the verdict is the engine's, not the page's)", async () => {
    const user = await h.mount({ page: "limits", overrides: { "/api/scenario/refusal-recorded": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.ok = false; j.checks[0].pass = false; return jsonResponse(200, j); }) } });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("FAIL");
    expect(screen.getByTestId("verdict")).toHaveAttribute("data-state", "bad");
  });

  it("bucket against a fixed window: two runs side by side, window 20 against bucket 11, one shared scale", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-bucket-vs-fixed-window"));
    await screen.findByTestId("run-bucket");
    expect(screen.getByTestId("allowed-bucket")).toHaveTextContent("11 allowed");
    expect(screen.getByTestId("allowed-window")).toHaveTextContent("20 allowed");
    expect(screen.getByTestId("same-scale")).toBeInTheDocument();
    expect(screen.getByTestId("verdict-text")).toHaveTextContent(/bucket: 11 of 20 allowed.*window: 20 of 20 allowed/);
  });

  it("a refusal shows what the client sees (status, retry hint, body) labelled UNVERIFIED, and the simulated gateway trace", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("client-view");
    expect(screen.getByTestId("client-status")).toHaveTextContent("429");
    expect(screen.getByTestId("client-retry")).toHaveTextContent("Retry-After: 1 s");
    expect(screen.getByTestId("client-view")).toHaveTextContent("UNVERIFIED");
    expect(screen.getByTestId("client-json")).toHaveTextContent("rate_limited");
    expect(screen.getAllByTestId("gateway-trace")[0]).toHaveTextContent(/Simulated gateway/);
    expect(screen.getByTestId("gateway-trace-basis")).toHaveTextContent(/Nothing here was read from a Privilege gateway/);
  });

  it("a run with no refusal says so instead of showing an empty box", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-cluster-without-shared-limit"));
    expect(await screen.findByTestId("client-view-empty")).toHaveTextContent(/No call was refused/);
  });

  it("cluster: two nodes, each with its own bucket, and 'Run it with a shared store too' sets the two ways side by side", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-cluster-without-shared-limit"));
    await screen.findByTestId("cluster-view");
    expect(screen.getByTestId("node-0")).toBeInTheDocument(); expect(screen.getByTestId("node-1")).toBeInTheDocument();
    expect(screen.queryByTestId("store-box")).toBeNull();
    await user.click(screen.getByTestId("cluster-compare"));
    await screen.findByTestId("cluster-compare-result");
    expect(screen.getByTestId("cluster-own")).toHaveTextContent("20 allowed");
    expect(screen.getByTestId("cluster-shared")).toHaveTextContent("10 allowed");
    expect(screen.getByTestId("cluster-shared")).toHaveTextContent("10 refused");
  });

  it("cluster with a shared store shows the one store between the nodes", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-cluster-with-shared-limit"));
    await screen.findByTestId("store-box");
    expect(screen.getByTestId("store-box")).toHaveTextContent("Redis stand-in");
    expect(screen.getByTestId("verdict-text")).toHaveTextContent("10 of 20 allowed, 10 refused");
  });

  it("app-wide caps: the app cap is spent by one agent, the other agent's own key cap is untouched, and the refusal names the layer", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-app-cap-exhausted-by-one-agent"));
    await screen.findByTestId("appcaps-view");
    expect(screen.getByTestId("agent-agent-a")).toHaveTextContent("12 allowed, 0 refused");
    expect(screen.getByTestId("agent-agent-b")).toHaveTextContent("0 allowed, 3 refused");
    expect(screen.getByTestId("agent-agent-b-meter")).toHaveTextContent("30 of 30");
    expect(screen.getByTestId("agent-agent-a")).toHaveTextContent("Statement export agent"); // the cast label of agent-a
    expect(screen.getByTestId("client-view")).toHaveTextContent("at the app layer");
  });

  it("the chart can be read as a table", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-burst-drains-and-refills"));
    await user.click(await screen.findByTestId("chart-bucket-table-toggle"));
    const table = screen.getByTestId("chart-bucket-table");
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 6); // header and six ticks
    expect(table).toHaveTextContent("Tokens");
  });

  it("deep link: #limits/<scenario> opens that scenario", async () => {
    window.location.hash = "#limits/inflight-refuses-at-low-rate";
    await h.mount({});
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("verdict-text")).toHaveTextContent(/inflight: 4 of 6 allowed, 2 refused/);
  });

  it("a scenario the server cannot run says so in words and keeps the buttons usable", async () => {
    const user = await h.mount({ page: "limits", overrides: { "/api/scenario/refusal-recorded": () => jsonResponse(500, { error: "internal_error", message: "something went wrong in the lab" }) } });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    expect(await screen.findByTestId("scenario-error")).toHaveTextContent("something went wrong in the lab");
    expect(screen.getByTestId("scenario-burst-drains-and-refills")).not.toBeDisabled();
  });
});

describe("Controls and load generator", () => {
  const setNum = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });

  it("a valid custom run shows a RESULT verdict and the chart", async () => {
    const user = await h.mount({ page: "limits" });
    await screen.findByTestId("run-builder");
    setNum("cfg-capacity", "4"); setNum("cfg-refill", "1");
    await user.click(screen.getByTestId("preset-burst"));
    await user.click(screen.getByTestId("run-custom"));
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("RESULT");
    const call = h.lab.calls.filter((c) => c.path === "/api/run").at(-1);
    expect(call.body.engine).toBe("bucket");
    expect(call.body.config).toEqual({ capacity: 4, refillPerSec: 1 });
    expect(screen.getByTestId("allowed-run")).toHaveTextContent("4 allowed");
  });

  it("a zero, a negative number and a word each reach the server and come back as its own 400, shown plainly", async () => {
    const user = await h.mount({ page: "limits" });
    await screen.findByTestId("run-builder");
    for (const bad of ["0", "-3", "ten", ""]) {
      setNum("cfg-capacity", bad);
      await user.click(screen.getByTestId("run-custom"));
      const err = await screen.findByTestId("run-error");
      await waitFor(() => expect(err).toHaveTextContent(/invalid_config/));
      expect(err).toHaveTextContent(/capacity/i);
      expect(screen.queryByTestId("verdict")).toBeNull();
    }
    const reply = await h.lab.post("/api/run", { engine: "bucket", config: { capacity: 0, refillPerSec: 1 }, profile: { phases: [{ type: "idle", durationMs: 10 }] } });
    expect(reply.error).toBe("invalid_config");
  });

  it("a bad load profile (too many requests) is refused with the server's own message", async () => {
    const user = await h.mount({ page: "limits" });
    await screen.findByTestId("run-builder");
    await user.click(screen.getByTestId("preset-burst"));
    setNum("ph-amount-0", "999999");
    await user.click(screen.getByTestId("run-custom"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent(/invalid_profile/);
  });

  it("changing the engine changes the controls: window, in-flight, cluster (node count, shared store) and app-wide caps", async () => {
    const user = await h.mount({ page: "limits" });
    const engine = await screen.findByTestId("run-engine");
    await user.selectOptions(engine, "fixedWindow"); expect(screen.getByTestId("cfg-limit")).toBeInTheDocument(); expect(screen.queryByTestId("cfg-capacity")).toBeNull();
    await user.selectOptions(engine, "inflight"); expect(screen.getByTestId("cfg-max-inflight")).toBeInTheDocument();
    await user.selectOptions(engine, "cluster"); expect(screen.getByTestId("cfg-nodes")).toBeInTheDocument(); expect(screen.getByTestId("cfg-shared")).toBeInTheDocument(); expect(screen.getByTestId("cfg-store-up")).toBeInTheDocument();
    await user.selectOptions(engine, "appCaps"); expect(screen.getByTestId("cfg-app-rpm")).toBeInTheDocument(); expect(screen.getByTestId("cfg-kind")).toBeInTheDocument();
  });

  it("cluster with the shared store switched off as unavailable: the error is shown as errors, not refusals", async () => {
    const user = await h.mount({ page: "limits" });
    await user.selectOptions(await screen.findByTestId("run-engine"), "cluster");
    await user.click(screen.getByTestId("cfg-shared")); await user.click(screen.getByTestId("cfg-store-up"));
    await user.click(screen.getByTestId("preset-burst"));
    await user.click(screen.getByTestId("run-custom"));
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("errors-run")).toHaveTextContent(/30 errors/);
    expect(screen.getByTestId("allowed-run")).toHaveTextContent("0 allowed");
    expect(screen.getByTestId("client-status")).toHaveTextContent("503");
  });

  it("app-wide caps with long agent names: they wrap, and an id over 40 characters is refused by the server", async () => {
    const user = await h.mount({ page: "limits" });
    await user.selectOptions(await screen.findByTestId("run-engine"), "appCaps");
    await user.click(screen.getByTestId("preset-burst"));
    const long = `agent-${"x".repeat(34)}`; // 40 characters
    setNum("ph-agents-0", `${long}, agent-b`);
    await user.click(screen.getByTestId("run-custom"));
    await screen.findByTestId("appcaps-view");
    expect(screen.getByTestId(`agent-${long}`)).toHaveTextContent(long);
    setNum("ph-agents-0", `${long}y`);
    await user.click(screen.getByTestId("run-custom"));
    await waitFor(() => expect(screen.getByTestId("run-error")).toHaveTextContent(/invalid_profile/));
  });

  it("phases can be added and removed, and every phase is sent", async () => {
    const user = await h.mount({ page: "limits" });
    await screen.findByTestId("run-builder");
    await user.click(screen.getByTestId("preset-spike"));
    expect(screen.getByTestId("phase-2")).toBeInTheDocument();
    await user.click(screen.getByTestId("ph-remove-2"));
    expect(screen.queryByTestId("phase-2")).toBeNull();
    await user.click(screen.getByTestId("ph-add"));
    expect(screen.getByTestId("phase-2")).toBeInTheDocument();
    await user.click(screen.getByTestId("run-custom"));
    await screen.findByTestId("verdict");
    expect(h.lab.calls.filter((c) => c.path === "/api/run").at(-1).body.profile.phases).toHaveLength(3);
  });
});

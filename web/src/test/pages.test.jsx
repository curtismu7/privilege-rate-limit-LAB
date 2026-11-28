import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { jsonResponse } from "./harness.js";
import { nav, screen, useLabHarness, waitFor, within } from "./util.jsx";
import { buildDiagram } from "../../../server/src/diagramData.js";
import { VERTICALS } from "../../../server/src/cast.js";
import { assertRunObservability } from "../../../server/src/runObservability.js";

const h = useLabHarness();
const DATA = buildDiagram(VERTICALS.airlines, "rate-limit-bucket");
const N = DATA.steps.length;

describe("Diagram page (rules 5 and 17)", () => {
  it("loads rate-limit-bucket BY NAME from the server and draws exactly the boxes the data lists", async () => {
    await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    const call = h.lab.calls.find((c) => c.path === "/api/diagram");
    expect(call.search).toMatch(/name=rate-limit-bucket/); expect(call.search).toMatch(/vertical=airlines/);
    for (const n of DATA.nodes) expect(screen.getByTestId(`pat-node-${n.id}`)).toHaveTextContent(n.label);
    expect(document.querySelectorAll(".react-flow__node").length).toBe(DATA.nodes.length);
    expect(N).toBe(7);
  });

  it("Simulate walks the arrows, Pause holds, Next and Prev step, speed has three settings, Reset stops the walkthrough", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("simulate"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 1 of ${N}`);
    await user.click(screen.getByTestId("pause"));
    await user.click(screen.getByTestId("next"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 2 of ${N}`);
    await user.click(screen.getByTestId("prev"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 1 of ${N}`);
    expect([...screen.getByTestId("speed").options].map((o) => o.textContent)).toEqual(["Slow", "Normal", "Fast"]);
    await user.click(screen.getByTestId("pattern-reset"));
    expect(screen.queryByTestId("pattern-now")).toBeNull();
  });

  it("the page's Reset restores the diagram too (a new epoch remounts it at its start)", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("simulate"));
    expect(screen.getByTestId("pattern-now")).toBeInTheDocument();
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("pattern-now")).toBeNull());
  });

  it("a key pressed on a button INSIDE an expanded box acts on that button, not on the box: Enter on a neighbour row opens the neighbour", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    const box = screen.getByTestId("pat-node-bucket");
    box.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("pat-node-bucket")).toHaveAttribute("aria-expanded", "true"));
    const go = document.querySelector("[data-testid='pat-node-bucket'] .dk-passport-go");
    expect(go).not.toBeNull();
    go.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(document.querySelectorAll("[aria-expanded='true']")).toHaveLength(1));
    expect(screen.getByTestId("pat-node-bucket")).toHaveAttribute("aria-expanded", "false"); // the neighbour opened (the open box moved); the wrapper did not swallow the key
    const open = document.querySelector("[aria-expanded='true']");
    expect(open.getAttribute("data-testid")).not.toBe("pat-node-bucket");
    // Space on the box itself still toggles it
    box.focus(); await user.keyboard(" ");
    await waitFor(() => expect(screen.getByTestId("pat-node-bucket")).toHaveAttribute("aria-expanded", "true"));
  });

  it("when the server says there is no such diagram the page says so and draws nothing by hand", async () => {
    await h.mount({ overrides: { "/api/diagram": () => jsonResponse(404, { error: "unknown_diagram", message: "no such diagram; the lab has: rate-limit-bucket" }) }, page: "diagram" });
    expect(await screen.findByTestId("diagram-error")).toHaveTextContent("This diagram could not be loaded");
    expect(screen.getByTestId("diagram-error-text")).toHaveTextContent("no such diagram");
    expect(document.querySelector(".react-flow")).toBeNull();
  });
});

describe("What this run left behind (rule 27)", () => {
  it("is empty before a run and says so", async () => {
    await h.mount({ page: "observability" });
    expect(await screen.findByTestId("obs-empty")).toHaveTextContent("Nothing has run in this workspace yet");
    expect(screen.queryByTestId("run-observability")).toBeNull();
  });

  it("after a scenario it shows the latest run through the shared panel, every row simulated, and the source is Mock", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-app-cap-exhausted-by-one-agent"));
    await screen.findByTestId("verdict");
    await nav(user, "Left behind");
    await screen.findByTestId("obs-run");
    expect(screen.getByTestId("obs-run")).toHaveTextContent("app-cap-exhausted-by-one-agent");
    const rec = (await h.lab.get("/api/observability")).record;
    expect(assertRunObservability(rec)).toEqual([]);
    expect(document.body.textContent).toMatch(/simulated/i);
    expect(document.body.textContent).toMatch(/Not logged/i);
    expect(document.body.textContent).toMatch(/refused app_rpm at the app layer/);
  });

  it("an error from the server is shown in words", async () => {
    await h.mount({ page: "observability", overrides: { "/api/observability": () => jsonResponse(500, { error: "internal_error", message: "the record could not be built" }) } });
    expect(await screen.findByTestId("obs-error")).toHaveTextContent("the record could not be built");
  });
});

describe("Stories and the Limits page", () => {
  it("Stories: one beat per scenario, every token filled, each beat links to its scenario", async () => {
    await h.mount({ page: "stories" });
    const beats = await screen.findByTestId("beats");
    expect(within(beats).getAllByRole("listitem")).toHaveLength(7);
    expect(document.body.textContent).not.toContain("{{");
    expect(screen.getByTestId("beat-run-bucket-vs-fixed-window")).toHaveAttribute("href", "#limits/bucket-vs-fixed-window");
    expect(screen.getByTestId("story-text")).toHaveTextContent("AirGuard Airlines");
  });

  it("Limits: what the release notes say against what the lab models, the open question has NO result and the page claims nothing about fallback", async () => {
    await h.mount({ page: "unverified" });
    await screen.findByTestId("open-question");
    for (const id of ["bucket", "inflight", "redis", "appcaps"]) expect(screen.getByTestId(`says-${id}`)).toBeInTheDocument();
    const q = screen.getByTestId("open-question");
    expect(q).toHaveTextContent("Can a rate-limit refusal trigger model fallback?");
    expect(screen.getByTestId("open-chip")).toHaveTextContent("Open: no result shown");
    expect(q).toHaveTextContent(/No opinion is shown/);
    expect(q.textContent.replace("No opinion is shown", "").replace("no result shown", "")).not.toMatch(/\b(yes|no|supported|unsupported|can trigger|cannot trigger|does trigger|does not trigger)\b/i);
    expect(within(screen.getByTestId("model-table")).getAllByText("UNVERIFIED").length).toBeGreaterThanOrEqual(9);
    expect(screen.getByTestId("notbuilt-baseline-jump-detector")).toHaveTextContent(/not built/);
  });

  it("Limits: a server failure is shown in words", async () => {
    await h.mount({ page: "unverified", overrides: { "/api/limits": () => jsonResponse(500, { error: "internal_error", message: "no limits data" }) } });
    expect(await screen.findByTestId("limits-error")).toHaveTextContent("no limits data");
  });
});

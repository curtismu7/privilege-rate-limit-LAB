import { describe, expect, it } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { forgetWorkspace, freshId, validWorkspaceId } from "../workspace.js";
import { jsonResponse } from "./harness.js";
import { nav, screen, useLabHarness, waitFor } from "./util.jsx";

const h = useLabHarness();
const press = (target, init) => act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
const presenterOn = () => document.querySelector(".app--presenter") !== null;

describe("the scenario hash is a deliberate navigation, not state to replay", () => {
  it("a scenario run from the Stories page's 'Run this beat' is not run again by Reset: the page starts over with 'No run yet' and the hash is cleared", async () => {
    const user = await h.mount({ page: "stories" });
    await user.click(await screen.findByTestId("beat-run-bucket-vs-fixed-window"));
    await screen.findByTestId("verdict");
    expect(window.location.hash).toBe("#limits/bucket-vs-fixed-window");
    const runsBefore = h.lab.calls.filter((c) => c.method === "POST" && c.path.startsWith("/api/scenario/")).length;
    await user.click(screen.getByTestId("reset"));
    await screen.findByTestId("empty-state");
    expect(screen.queryByTestId("verdict")).toBeNull();
    expect(window.location.hash).toBe("#limits");
    expect(h.lab.calls.filter((c) => c.method === "POST" && c.path.startsWith("/api/scenario/")).length).toBe(runsBefore); // nothing ran again
    expect((await h.lab.get("/api/info")).runsSinceReset).toBe(0);
  });

  it("a new industry starts the page over and does not replay the scenario in the hash", async () => {
    const user = await h.mount({ page: "limits" });
    window.location.hash = "#limits/refusal-recorded";
    await screen.findByTestId("verdict");
    const n = h.lab.calls.filter((c) => c.path === "/api/scenario/refusal-recorded").length;
    await user.selectOptions(screen.getByTestId("vertical-select"), "retail");
    await screen.findByTestId("empty-state");
    expect(window.location.hash).toBe("#limits");
    expect(h.lab.calls.filter((c) => c.path === "/api/scenario/refusal-recorded").length).toBe(n);
  });

  it("a real change of mode clears it too, and pressing the mode already in force does not", async () => {
    const overrides = { "/api/info": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.realAvailable = true; return jsonResponse(200, j); }), "/api/mode": () => jsonResponse(200, { source: "real" }) };
    const user = await h.mount({ page: "limits", overrides });
    window.location.hash = "#limits/refusal-recorded";
    await screen.findByTestId("verdict");
    await user.click(screen.getByTestId("mode-mock")); // already pressed: nothing
    expect(window.location.hash).toBe("#limits/refusal-recorded");
    await waitFor(() => expect(screen.getByTestId("mode-real")).not.toBeDisabled());
    await user.click(screen.getByTestId("mode-real"));
    await waitFor(() => expect(window.location.hash).toBe("#limits"));
    await screen.findByTestId("empty-state");
  });

  it("while the page is open, a new #limits/<scenario> (a link or the back button) runs that scenario", async () => {
    await h.mount({ page: "limits" });
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    window.location.hash = "#limits/inflight-refuses-at-low-rate";
    await waitFor(() => expect(screen.getByTestId("verdict-text")).toHaveTextContent(/inflight: 4 of 6 allowed/));
    window.location.hash = "#limits/refusal-recorded";
    await waitFor(() => expect(screen.getByTestId("verdict-text")).toHaveTextContent(/3 of 5 allowed, 2 refused/));
  });
});

describe("a run on screen owns its panels", () => {
  const setNum = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });

  it("the cluster compare of one run is gone when a new run replaces it, and an error from it is cleared too", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-cluster-without-shared-limit"));
    await user.click(await screen.findByTestId("cluster-compare"));
    await screen.findByTestId("cluster-compare-result");
    await user.click(screen.getByTestId("scenario-cluster-with-shared-limit"));
    await waitFor(() => expect(screen.getByTestId("verdict-text")).toHaveTextContent("10 of 20 allowed, 10 refused"));
    expect(screen.queryByTestId("cluster-compare-result")).toBeNull();
    // a custom run replaces it as well
    await user.click(screen.getByTestId("cluster-compare")); await screen.findByTestId("cluster-compare-result");
    await user.selectOptions(screen.getByTestId("run-engine"), "cluster");
    await user.click(screen.getByTestId("preset-burst"));
    await user.click(screen.getByTestId("run-custom"));
    await waitFor(() => expect(screen.getByTestId("verdict-chip")).toHaveTextContent("RESULT"));
    expect(screen.queryByTestId("cluster-compare-result")).toBeNull();
  });

  it("a failed compare shows its error, and the next run does not keep it", async () => {
    const user = await h.mount({ page: "limits", overrides: { "/api/run": (init, u, pass) => (u.search.includes("record=0") ? jsonResponse(500, { error: "internal_error", message: "the other way failed" }) : pass()) } });
    await user.click(await screen.findByTestId("scenario-cluster-without-shared-limit"));
    await user.click(await screen.findByTestId("cluster-compare"));
    expect(await screen.findByTestId("cluster-compare-error")).toHaveTextContent("the other way failed");
    await user.click(screen.getByTestId("scenario-cluster-with-shared-limit"));
    await waitFor(() => expect(screen.getByTestId("verdict-text")).toHaveTextContent("10 of 20 allowed"));
    expect(screen.queryByTestId("cluster-compare-error")).toBeNull();
  });

  it("the compare is a look-aside run: it is not counted and does not become the latest run in 'What this run left behind'", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-cluster-without-shared-limit"));
    await screen.findByTestId("verdict");
    await user.click(screen.getByTestId("cluster-compare"));
    await screen.findByTestId("cluster-compare-result");
    const call = h.lab.calls.filter((c) => c.path === "/api/run").at(-1);
    expect(call.search).toBe("?record=0");
    expect((await h.lab.get("/api/info")).runsSinceReset).toBe(1);
    expect((await h.lab.get("/api/observability")).run.id).toBe("cluster-without-shared-limit");
  });
});

describe("the presenter shortcut", () => {
  it("P toggles presenter mode, and Ctrl, Cmd or Alt with P do not (Cmd+P is the browser's print)", async () => {
    await h.mount({ page: "limits" });
    press(document.body, { key: "p", metaKey: true }); expect(presenterOn()).toBe(false);
    press(document.body, { key: "p", ctrlKey: true }); expect(presenterOn()).toBe(false);
    press(document.body, { key: "p", altKey: true }); expect(presenterOn()).toBe(false);
    press(document.body, { key: "p" }); await waitFor(() => expect(presenterOn()).toBe(true));
    press(document.body, { key: "P", metaKey: true }); expect(presenterOn()).toBe(true); // Cmd+Shift+P does not turn it off either
    press(document.body, { key: "Escape" }); await waitFor(() => expect(presenterOn()).toBe(false));
  });

  it("a held key (repeat) does not flip it back and forth", async () => {
    await h.mount({ page: "limits" });
    press(document.body, { key: "p" }); await waitFor(() => expect(presenterOn()).toBe(true));
    press(document.body, { key: "p", repeat: true }); press(document.body, { key: "p", repeat: true });
    expect(presenterOn()).toBe(true);
  });

  it("not while focus is in a field, a select, a button, a link or editable text", async () => {
    await h.mount({ page: "limits" });
    const field = screen.getByTestId("cfg-capacity"); const select = screen.getByTestId("run-engine"); const button = screen.getByTestId("scenario-refusal-recorded");
    const link = document.querySelector("nav a"); const editable = document.body.appendChild(document.createElement("div")); editable.setAttribute("contenteditable", "true");
    for (const el of [field, select, button, link, editable]) { press(el, { key: "p" }); expect(presenterOn(), el.tagName).toBe(false); }
    editable.remove();
  });
});

describe("a failed reload is not silent", () => {
  it("when Reset's reload fails with a story already loaded, the page says so and offers Try again; the old data stays", async () => {
    const flag = { fail: false };
    const user = await h.mount({ page: "stories", overrides: { "/api/info": (init, u, pass) => (flag.fail ? jsonResponse(500, { error: "internal_error", message: "the lab said no" }) : pass()) } });
    await screen.findByTestId("beats");
    flag.fail = true;
    await user.click(screen.getByTestId("reset"));
    const banner = await screen.findByTestId("reload-error");
    expect(banner).toHaveTextContent("the lab said no");
    expect(screen.getByTestId("beats")).toBeInTheDocument(); // the last data is still shown
    flag.fail = false;
    await user.click(screen.getByTestId("retry-reload"));
    await waitFor(() => expect(screen.queryByTestId("reload-error")).toBeNull());
  });
});

describe("the workspace id", () => {
  it("the random fallback (no window.crypto) fills the array in place: the id is not all zeros and is a valid workspace id", () => {
    const real = window.crypto;
    Object.defineProperty(window, "crypto", { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 8 }, () => freshId()));
      for (const id of ids) { expect(id).toMatch(/^w-[0-9a-f]{16}$/); expect(id).not.toBe("w-0000000000000000"); expect(validWorkspaceId(id)).toBe(true); }
      expect(ids.size).toBeGreaterThan(1);
    } finally { Object.defineProperty(window, "crypto", { value: real, configurable: true }); forgetWorkspace(); }
  });

  it("with window.crypto the id is random too", () => {
    expect(freshId()).toMatch(/^w-[0-9a-f]{16}$/);
    expect(freshId()).not.toBe(freshId());
  });
});

describe("What this run left behind: no decisions, and a cut list", () => {
  it("an idle run says it made no decisions (not 'nothing has run')", async () => {
    const user = await h.mount({ page: "limits" });
    await screen.findByTestId("run-builder");
    await user.selectOptions(screen.getByTestId("ph-type-0"), "idle");
    await user.click(screen.getByTestId("run-custom"));
    await screen.findByTestId("verdict");
    await nav(user, "Left behind");
    expect(await screen.findByTestId("obs-no-decisions")).toHaveTextContent("This run made no decisions");
    expect(screen.queryByTestId("obs-empty")).toBeNull();
  });

  it("a run with more rows than the page lists says how many were cut", async () => {
    const user = await h.mount({ page: "limits" });
    await h.lab.post("/api/run", { engine: "bucket", config: { capacity: 1, refillPerSec: 1 }, profile: { phases: [{ type: "burst", count: 500, durationMs: 1000 }] } });
    await nav(user, "Left behind");
    expect(await screen.findByTestId("obs-truncated")).toHaveTextContent("Showing 51 of 500 rows");
  });
});

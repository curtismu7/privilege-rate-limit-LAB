import { describe, expect, it } from "vitest";
import { createWorkspaces } from "../../../server/src/workspaces.js";
import { workspaceFetch } from "../workspace.js";
import { nav, screen, useLabHarness, waitFor } from "./util.jsx";

const h = useLabHarness();

describe("the forgotten-workspace banner, end to end", () => {
  it("Reset after the server dropped the workspace leaves no banner (it is the server dropping it on purpose)", async () => {
    const workspaces = createWorkspaces({ max: 5 });
    const user = await h.mount({ page: "limits", workspaces });
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    workspaces.reset(h.lab.ws()); // evicted
    await user.click(screen.getByTestId("reset"));
    await screen.findByTestId("empty-state");
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent(/Reset:/));
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
    const resetCall = h.lab.calls.filter((c) => c.path === "/api/reset").at(-1);
    expect(resetCall.headers["x-workspace-used"]).toBeUndefined();
    // and a banner that was already up is taken down by Reset and does not return
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    workspaces.reset(h.lab.ws());
    await nav(user, "Left behind"); await screen.findByTestId("workspace-forgotten");
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("workspace-forgotten")).toBeNull());
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
  });

  it("the run that FOUND OUT keeps its own result: the banner does not remount the page or throw the answer away", async () => {
    const workspaces = createWorkspaces({ max: 5 });
    const user = await h.mount({ page: "limits", workspaces });
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    workspaces.reset(h.lab.ws());
    await user.click(screen.getByTestId("scenario-inflight-refuses-at-low-rate"));
    await screen.findByTestId("workspace-forgotten");
    await waitFor(() => expect(screen.getByTestId("verdict-text")).toHaveTextContent(/inflight: 4 of 6 allowed/));
    expect(screen.getByTestId("scenario-inflight-refuses-at-low-rate")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(workspaces.has(h.lab.ws())).toBe(true); // and the run did re-create the workspace
  });

  it("the handler clears the scenario hash, so nothing can replay a scenario because of it", async () => {
    const workspaces = createWorkspaces({ max: 5 });
    const user = await h.mount({ page: "limits", workspaces });
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    window.location.hash = "#limits/refusal-recorded";
    const runs = () => h.lab.calls.filter((c) => c.method === "POST" && c.path.startsWith("/api/scenario/")).length;
    await waitFor(() => expect(runs()).toBe(2)); // the deliberate navigation ran it
    workspaces.reset(h.lab.ws());
    await workspaceFetch("/api/info"); // any claimed call finds out
    await screen.findByTestId("workspace-forgotten");
    expect(window.location.hash).toBe("#limits");
    await new Promise((r) => setTimeout(r, 200));
    expect(runs()).toBe(2);
  });

  it("what the Left behind page showed is dropped and read again (the server holds no run any more)", async () => {
    const workspaces = createWorkspaces({ max: 5 });
    const user = await h.mount({ page: "limits", workspaces });
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    await nav(user, "Left behind");
    await screen.findByTestId("obs-run");
    workspaces.reset(h.lab.ws());
    await workspaceFetch("/api/info"); // found out by a call that is not the page's own
    await screen.findByTestId("workspace-forgotten");
    await screen.findByTestId("obs-empty");
    expect(screen.queryByTestId("obs-run")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkspaces } from "../../../server/src/workspaces.js";
import { jsonResponse } from "./harness.js";
import { fireEvent } from "@testing-library/react";
import { nav, screen, useLabHarness, userEvent, waitFor } from "./util.jsx";

const h = useLabHarness();

describe("a customer brand reaches every name on the Stories page", () => {
  it("with a brand override no other company name is left (in any industry)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prl-brand-ui-"));
    const cfg = path.join(dir, "c.json"); fs.writeFileSync(cfg, JSON.stringify({ cast: { brand: "Acme Test Co" } }));
    const user = await h.mount({ page: "stories", env: { CUSTOMER_CONFIG: cfg } });
    await screen.findByTestId("beats");
    for (const v of ["airlines", "finance", "health", "retail"]) {
      await user.selectOptions(screen.getByTestId("vertical-select"), v);
      await waitFor(() => expect(screen.getByTestId("story-text")).toHaveTextContent(/^Acme Test Co puts Acme Test Co .+ \(MCP app\)/));
      const text = document.querySelector("main").textContent;
      for (const other of ["Fabrikam", "Contoso", "Northwind", "Meridian Air"]) expect(text, `${v}: ${other}`).not.toContain(other);
    }
  });
});

describe("a failed run does not sit beside an older result", () => {
  it("after a good run, a failing scenario clears the verdict, shows the error and presses no scenario button", async () => {
    const flag = { fail: false };
    const user = await h.mount({ page: "limits", overrides: { "/api/scenario/refusal-recorded": (init, u, pass) => (flag.fail ? jsonResponse(500, { error: "internal_error", message: "the run failed in the lab" }) : pass()) } });
    await user.click(await screen.findByTestId("scenario-burst-drains-and-refills"));
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("scenario-burst-drains-and-refills")).toHaveAttribute("aria-pressed", "true");
    flag.fail = true;
    await user.click(screen.getByTestId("scenario-refusal-recorded"));
    expect(await screen.findByTestId("scenario-error")).toHaveTextContent("the run failed in the lab");
    expect(screen.queryByTestId("verdict")).toBeNull(); expect(screen.queryByTestId("runs")).toBeNull();
    for (const b of screen.getAllByRole("button", { name: /Scenario \d/ })) expect(b).toHaveAttribute("aria-pressed", "false");
  });

  it("a failing custom run clears the earlier result too", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-burst-drains-and-refills")); await screen.findByTestId("verdict");
    const cap = screen.getByTestId("cfg-capacity"); await user.clear(cap); await user.type(cap, "0");
    await user.click(screen.getByTestId("run-custom"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent(/invalid_config/);
    expect(screen.queryByTestId("verdict")).toBeNull();
  });
});

describe("the mode switch and the navigation", () => {
  const forcedReal = (status) => ({
    "/api/info": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.realAvailable = true; return jsonResponse(200, j); }),
    "/api/mode": () => (status === 200 ? jsonResponse(200, { source: "real" }) : jsonResponse(409, { error: "real_not_available", message: "Real is not here, plainly." })),
  });

  it("a refused mode switch (409) leaves the scenario hash and the result alone", async () => {
    const user = await h.mount({ page: "limits", overrides: forcedReal(409) });
    window.location.hash = "#limits/refusal-recorded";
    await screen.findByTestId("verdict");
    await waitFor(() => expect(screen.getByTestId("mode-real")).not.toBeDisabled());
    await user.click(screen.getByTestId("mode-real"));
    await screen.findByTestId("mode-error-banner");
    expect(window.location.hash).toBe("#limits/refusal-recorded");
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
  });

  it("a switch that happened clears the hash before the page restarts, so the scenario is not replayed", async () => {
    const user = await h.mount({ page: "limits", overrides: forcedReal(200) });
    window.location.hash = "#limits/refusal-recorded";
    await screen.findByTestId("verdict");
    const n = h.lab.calls.filter((c) => c.method === "POST" && c.path === "/api/scenario/refusal-recorded").length;
    await waitFor(() => expect(screen.getByTestId("mode-real")).not.toBeDisabled());
    await user.click(screen.getByTestId("mode-real"));
    await screen.findByTestId("empty-state");
    expect(h.lab.calls.filter((c) => c.method === "POST" && c.path === "/api/scenario/refusal-recorded").length).toBe(n);
  });

  it("nav links keep their default (a real href and a history entry) and the page follows the hash", async () => {
    const user = await h.mount({ page: "limits" });
    const link = (name) => document.querySelector(`nav a[href="#${name}"]`);
    expect(link("diagram").getAttribute("href")).toBe("#diagram");
    // no click on a nav link is ever default-prevented (so a Ctrl or Cmd click or a middle click can open a new tab; the browser check proves that part)
    for (const init of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) expect(fireEvent.click(link("stories"), init), JSON.stringify(init)).toBe(true);
    await user.click(link("diagram"));
    await waitFor(() => expect(link("diagram")).toHaveAttribute("aria-current", "page"));
    expect(window.location.hash).toBe("#diagram"); // the browser's own navigation made the history entry
    await user.click(link("unverified"));
    await waitFor(() => expect(link("unverified")).toHaveAttribute("aria-current", "page"));
    // a hash change from outside the page (what Back does) switches the page too; Back itself is proved in the browser check
    window.location.hash = "#diagram";
    await waitFor(() => expect(link("diagram")).toHaveAttribute("aria-current", "page"));
  });
});

describe("the talk track dialog gets escaped strings", () => {
  it("control and bidi characters from the server show as escapes (the shared dialog renders what it is given)", async () => {
    const user = await h.mount({ page: "limits", overrides: { "/api/story": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.talkTrack[0].title = "Open‮ing"; j.talkTrack[0].say = "Say\u0007this"; return jsonResponse(200, j); }) } });
    await user.click(screen.getByTestId("talk-track-toggle"));
    const dlg = await screen.findByTestId("talk-track-dialog");
    expect(dlg.textContent).toContain("Open\\u202eing"); expect(dlg.textContent).toContain("Say\\u0007this");
    expect(dlg.textContent).not.toContain("‮");
  });
});

describe("a forgotten workspace is shown", () => {
  it("when the server has dropped this tab's workspace the page says so, loads the state again and does not repeat the claim", async () => {
    const workspaces = createWorkspaces({ max: 5 });
    const user = await h.mount({ page: "limits", workspaces });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("verdict");
    expect(workspaces.has(h.lab.ws())).toBe(true);
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
    workspaces.reset(h.lab.ws()); // the server forgot it (an eviction or a restart looks the same)
    const infos = h.lab.calls.filter((c) => c.path === "/api/info").length;
    await nav(user, "Left behind");
    const banner = await screen.findByTestId("workspace-forgotten");
    expect(banner).toHaveTextContent("The server forgot this workspace; the lab was reset to its defaults.");
    await waitFor(() => expect(h.lab.calls.filter((c) => c.path === "/api/info").length).toBeGreaterThan(infos)); // the state was loaded again
    const claimed = h.lab.calls.filter((c) => c.headers?.["x-workspace-used"] === "1").length;
    expect(claimed).toBeGreaterThan(0);
    await user.click(screen.getByTestId("obs-refresh"));
    await waitFor(() => expect(h.lab.calls.filter((c) => c.path === "/api/observability").length).toBeGreaterThan(1));
    expect(h.lab.calls.filter((c) => c.headers?.["x-workspace-used"] === "1").length).toBe(claimed); // acknowledged: no more claims until the tab runs again
    await user.click(screen.getByTestId("workspace-forgotten-dismiss"));
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
  });

  it("a tab's own Reset is not 'forgotten': the claim is dropped with it", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-refusal-recorded")); await screen.findByTestId("verdict");
    await user.click(screen.getByTestId("reset"));
    await screen.findByTestId("empty-state");
    await nav(user, "Left behind");
    await screen.findByTestId("obs-empty");
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
  });
});

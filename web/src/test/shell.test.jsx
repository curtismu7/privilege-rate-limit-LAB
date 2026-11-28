import { describe, expect, it } from "vitest";
import { MODE_LINES, PAGES } from "../App.jsx";
import { jsonResponse } from "./harness.js";
import { nav, screen, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("the shell: mode modal, Mock/Real, presenter, talk track, Reset, themes", () => {
  it("opens on the MOCK modal that says what is simulated and what is UNVERIFIED, and no simulation banner is left on any page", async () => {
    const user = await h.mount({ page: "limits", modal: true });
    const modal = screen.getByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "mock");
    expect(modal.textContent).toContain(MODE_LINES.mock);
    expect(modal).toHaveTextContent(/simulated/); expect(modal).toHaveTextContent(/UNVERIFIED/); expect(modal).toHaveTextContent(/2026-11-21 release notes/);
    await user.click(screen.getByTestId("mode-modal-ok"));
    for (const p of PAGES) {
      await nav(user, p.label);
      expect(screen.queryByTestId("banner")).toBeNull();
      expect(document.querySelector("main.page > p.banner")).toBeNull();
      expect(screen.queryByTestId("mode-modal")).toBeNull();
    }
  });

  it("the modal is there even before the server answers, and when it cannot (an unreachable server reads MOCK)", async () => {
    h.lab = await (await import("./harness.js")).startLab({ overrides: { "/api/info": () => jsonResponse(500, { error: "internal_error", message: "boom" }) } });
    const { render } = await import("@testing-library/react");
    const App = (await import("../App.jsx")).default;
    render(<App />);
    expect(await screen.findByTestId("mode-modal")).toHaveAttribute("data-mode", "mock");
    expect(await screen.findByTestId("load-error")).toHaveTextContent(/Could not load the lab/);
    expect(screen.getByTestId("retry")).toBeInTheDocument();
  });

  it("the header shows the mode, the Mock/Real toggle has Real DISABLED with the server's plain reason, and Mock is pressed", async () => {
    await h.mount({ page: "limits" });
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
    const real = screen.getByTestId("mode-real");
    expect(real).toBeDisabled(); expect(real).toHaveAttribute("aria-pressed", "false");
    const info = await h.lab.get("/api/info");
    expect(real).toHaveAttribute("title", info.realReason);
    expect(screen.getByTestId("real-reason")).toHaveTextContent(info.realReason);
  });

  it("pressing the Mock button that is already pressed changes nothing: no request, no reload, and a result on screen stays", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("verdict");
    const before = h.lab.calls.length;
    await user.click(screen.getByTestId("mode-mock"));
    expect(h.lab.calls.length).toBe(before); // not even a GET
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
    expect(h.lab.calls.some((c) => c.path === "/api/mode")).toBe(false);
    expect((await h.lab.post("/api/mode", { source: "real" })).error).toBe("real_not_available"); // the server still refuses Real
  });

  it("a forced 409 on the toggle shows the server's message in the page", async () => {
    // Real is disabled in the real page; this forces the server to say Real is available, then answer 409, to prove the message is shown.
    const user = await h.mount({ page: "limits", overrides: { "/api/info": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.realAvailable = true; return jsonResponse(200, j); }), "/api/mode": (init, u, pass) => (JSON.parse(init.body).source === "real" ? jsonResponse(409, { error: "real_not_available", message: "Real is not here, plainly." }) : pass()) } });
    await waitFor(() => expect(screen.getByTestId("mode-real")).not.toBeDisabled());
    await user.click(screen.getByTestId("mode-real"));
    expect(await screen.findByTestId("mode-error-banner")).toHaveTextContent("Real is not here, plainly.");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
  });

  it("presenter mode (P) shows the talk-track lines for the page, and Escape leaves it", async () => {
    const user = await h.mount({ page: "limits" });
    await user.keyboard("p");
    const say = await screen.findByTestId("presenter-say");
    expect(say).toHaveTextContent("Opening");
    expect(document.querySelector(".app--presenter")).not.toBeNull();
    await nav(user, "Limits and UNVERIFIED");
    expect(screen.getByTestId("presenter-say")).toHaveTextContent("The open question");
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/never calls a fallback/);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector(".app--presenter")).toBeNull());
  });

  it("the talk track opens from the header with every item of the script", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(screen.getByTestId("talk-track-toggle"));
    const dlg = await screen.findByTestId("talk-track-dialog");
    const story = await h.lab.get("/api/story?vertical=airlines");
    expect(within(dlg).getAllByRole("listitem")).toHaveLength(story.talkTrack.length);
  });

  it("the industry (vertical) selector reloads the story with the other cast, and the diagram and stories follow it", async () => {
    const user = await h.mount({ page: "stories" });
    expect(screen.getByTestId("cast")).toHaveTextContent("Fare quote agent");
    await user.selectOptions(screen.getByTestId("vertical-select"), "retail");
    await waitFor(() => expect(screen.getByTestId("cast")).toHaveTextContent("Order status agent"));
    expect(h.lab.calls.some((c) => c.path === "/api/story" && /vertical=retail/.test(c.search))).toBe(true);
  });

  it("the first story load sends the vertical, like every later one (the server falls back for a missing one, which would hide a lost parameter)", async () => {
    await h.mount({ page: "limits" });
    const first = h.lab.calls.find((c) => c.path === "/api/story");
    expect(first.search).toBe("?vertical=airlines");
  });

  it("every call carries the workspace id (rule 13), the same one for the whole visit", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("verdict");
    const ids = new Set(h.lab.calls.filter((c) => c.path.startsWith("/api/")).map((c) => c.headers["x-workspace"]));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^w-[0-9a-f]{16}$/);
  });

  it("Reset clears the run log and the latest run, and says so", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(await screen.findByTestId("scenario-refusal-recorded"));
    await screen.findByTestId("verdict");
    expect((await h.lab.get("/api/info")).runsSinceReset).toBe(1);
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent(/Reset:/));
    expect((await h.lab.get("/api/info")).runsSinceReset).toBe(0);
    await waitFor(() => expect(screen.queryByTestId("verdict")).toBeNull()); // the page starts over
  });

  it("the theme control sets data-theme and remembers it", async () => {
    const user = await h.mount({ page: "limits" });
    await user.selectOptions(screen.getByTestId("theme-select"), "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("prl.theme")).toBe("dark");
  });
});

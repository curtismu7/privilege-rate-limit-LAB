import { describe, expect, it } from "vitest";
import { PAGES } from "../App.jsx";
import { jsonResponse } from "./harness.js";
import { nav, screen, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("the shell: banner, Mock/Real, presenter, talk track, Reset, themes", () => {
  it("the simulation banner is first on every page and says what is simulated and what is UNVERIFIED", async () => {
    const user = await h.mount({ page: "limits" });
    for (const p of PAGES) {
      await nav(user, p.label);
      const banner = await screen.findByTestId("banner");
      expect(banner).toHaveTextContent(/SIMULATED/); expect(banner).toHaveTextContent(/UNVERIFIED/); expect(banner).toHaveTextContent(/2026-11-21 release notes/);
      const main = document.querySelector("main.page");
      expect(main.firstElementChild).toBe(banner); // before everything else on the page
    }
  });

  it("the banner is there even before the server answers, and when it cannot", async () => {
    h.lab = await (await import("./harness.js")).startLab({ overrides: { "/api/info": () => jsonResponse(500, { error: "internal_error", message: "boom" }) } });
    const { render } = await import("@testing-library/react");
    const App = (await import("../App.jsx")).default;
    render(<App />);
    expect(await screen.findByTestId("banner")).toHaveTextContent(/SIMULATED/);
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

  it("switching to Mock calls POST /api/mode with exactly { source } and reloads; a 409 for Real is shown as the server worded it", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(h.lab.calls.filter((c) => c.method === "POST" && c.path === "/api/mode")).toHaveLength(1));
    expect(h.lab.calls.find((c) => c.path === "/api/mode").body).toEqual({ source: "mock" });
    const reloads = h.lab.calls.filter((c) => c.path === "/api/info").length;
    expect(reloads).toBeGreaterThanOrEqual(2); // the data was loaded again
    expect((await h.lab.post("/api/mode", { source: "real" })).error).toBe("real_not_available");
  });

  it("a forced 409 on the toggle shows the server's message in the page", async () => {
    // Real is disabled in the real page; this forces the server to say Real is available, then answer 409, to prove the message is shown.
    const user = await h.mount({ page: "limits", overrides: { "/api/info": (init, u, pass) => pass().then(async (r) => { const j = await r.json(); j.realAvailable = true; return jsonResponse(200, j); }), "/api/mode": (init, u, pass) => (JSON.parse(init.body).source === "real" ? jsonResponse(409, { error: "real_not_available", message: "Real is not here, plainly." }) : pass()) } });
    await waitFor(() => expect(screen.getByTestId("mode-real")).not.toBeDisabled());
    await user.click(screen.getByTestId("mode-real"));
    expect(await screen.findByTestId("mode-error-banner")).toHaveTextContent("Real is not here, plainly.");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
  });

  it("presenter mode (P) keeps the banner, shows the talk-track lines for the page, and Escape leaves it", async () => {
    const user = await h.mount({ page: "limits" });
    await user.keyboard("p");
    const say = await screen.findByTestId("presenter-say");
    expect(say).toHaveTextContent("Opening");
    expect(screen.getByTestId("banner")).toBeInTheDocument();
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
    const story = await h.lab.get("/api/story?vertical=finance");
    expect(within(dlg).getAllByRole("listitem")).toHaveLength(story.talkTrack.length);
  });

  it("the industry (vertical) selector reloads the story with the other cast, and the diagram and stories follow it", async () => {
    const user = await h.mount({ page: "stories" });
    expect(screen.getByTestId("cast")).toHaveTextContent("Statement export agent");
    await user.selectOptions(screen.getByTestId("vertical-select"), "retail");
    await waitFor(() => expect(screen.getByTestId("cast")).toHaveTextContent("Order status agent"));
    expect(h.lab.calls.some((c) => c.path === "/api/story" && /vertical=retail/.test(c.search))).toBe(true);
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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearWorkspaceUsed, forgetWorkspace, markWorkspaceUsed, onWorkspaceForgotten, suspendWorkspaceClaim, workspaceFetch, workspaceId } from "../workspace.js";
import { postReset } from "../api.js";

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
let real;
beforeEach(() => { real = globalThis.fetch; try { window.sessionStorage.clear(); } catch { /* ignore */ } forgetWorkspace(); clearWorkspaceUsed(); });
afterEach(() => { globalThis.fetch = real; });

describe("workspaceFetch", () => {
  it("parallel calls refused for the same id mint ONE new id between them", async () => {
    window.sessionStorage.setItem("prl.workspace", "w-refused-one");
    forgetWorkspace();
    const sent = [];
    globalThis.fetch = async (url, init) => {
      const id = init.headers["x-workspace"]; sent.push(id);
      await new Promise((r) => setTimeout(r, 5)); // both first calls are in flight before either answer arrives
      return id === "w-refused-one" ? json(400, { error: "bad_workspace", message: "no" }) : json(200, { ok: true });
    };
    const [a, b] = await Promise.all([workspaceFetch("/api/info"), workspaceFetch("/api/story")]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    const retried = sent.filter((id) => id !== "w-refused-one");
    expect(sent.filter((id) => id === "w-refused-one")).toHaveLength(2);
    expect(retried).toHaveLength(2);
    expect(new Set(retried).size).toBe(1); // one new id, not two
    expect(workspaceId()).toBe(retried[0]);
    expect(window.sessionStorage.getItem("prl.workspace")).toBe(retried[0]);
  });

  it("a second refusal is returned as it is (never a loop), and a 400 that is not bad_workspace is not retried", async () => {
    let n = 0;
    globalThis.fetch = async () => { n += 1; return json(400, { error: "bad_workspace" }); };
    expect((await workspaceFetch("/api/info")).status).toBe(400); expect(n).toBe(2);
    n = 0; globalThis.fetch = async () => { n += 1; return json(400, { error: "invalid_config" }); };
    expect((await workspaceFetch("/api/run")).status).toBe(400); expect(n).toBe(1);
  });

  it("X-Workspace-Used is sent only once this id has run something, and X-Workspace-Fresh from the server fires the forgotten handler once", async () => {
    const calls = []; let fresh = false;
    globalThis.fetch = async (url, init) => { calls.push(init.headers); return json(200, {}, fresh ? { "x-workspace-fresh": "1" } : {}); };
    let told = 0; const off = onWorkspaceForgotten(() => { told += 1; });
    await workspaceFetch("/api/info");
    expect(calls[0]["x-workspace-used"]).toBeUndefined();
    markWorkspaceUsed();
    await workspaceFetch("/api/info");
    expect(calls[1]["x-workspace-used"]).toBe("1");
    fresh = true;
    await workspaceFetch("/api/info"); expect(told).toBe(1);
    await workspaceFetch("/api/info"); expect(told).toBe(1); // acknowledged: the claim is dropped, so the signal does not repeat
    expect(calls[3]["x-workspace-used"]).toBeUndefined();
    // a tab that never claimed it gets no banner even if the header is there
    clearWorkspaceUsed(); await workspaceFetch("/api/info"); expect(told).toBe(1);
    off();
  });
});

describe("the forgotten-workspace signal: what may and may not fire it", () => {
  const fresh = { "x-workspace-fresh": "1" };
  const watch = () => { const n = { told: 0 }; const off = onWorkspaceForgotten(() => { n.told += 1; }); return { n, off }; };

  it("Reset after the server dropped the workspace does not bring the banner back: the reset call carries no claim, and a Fresh answer to it is ignored", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url, headers: init.headers }); return json(200, { reset: "ok" }, fresh); }; // the server holds nothing and says so
    const { n, off } = watch();
    markWorkspaceUsed();
    const r = await postReset();
    expect(r.ok).toBe(true);
    expect(calls[0].headers["x-workspace-used"]).toBeUndefined(); // cleared BEFORE it was sent
    expect(n.told).toBe(0);
    await workspaceFetch("/api/info"); // and the claim is gone after a successful reset
    expect(calls[1].headers["x-workspace-used"]).toBeUndefined();
    off();
  });

  it("a Reset that FAILED puts the claim back (the server still holds the workspace, so a later eviction must still be noticed)", async () => {
    globalThis.fetch = async () => json(500, { error: "internal_error", message: "no" });
    markWorkspaceUsed();
    expect((await postReset()).ok).toBe(false);
    const seen = [];
    globalThis.fetch = async (url, init) => { seen.push(init.headers["x-workspace-used"]); return json(200, {}); };
    await workspaceFetch("/api/info");
    expect(seen[0]).toBe("1");
    const restore = suspendWorkspaceClaim(); restore(); restore(); // restoring twice is harmless
    await workspaceFetch("/api/info"); expect(seen[1]).toBe("1");
  });

  it("parallel info and story calls on a brand-new tab never show it, whichever answer arrives first (no claim, so no signal is read)", async () => {
    globalThis.fetch = async (url) => { await new Promise((r) => setTimeout(r, url.includes("story") ? 1 : 8)); return json(200, {}, fresh); };
    const { n, off } = watch();
    await Promise.all([workspaceFetch("/api/info"), workspaceFetch("/api/story"), workspaceFetch("/api/scenarios")]);
    expect(n.told).toBe(0);
    off();
  });

  it("an answer to a request sent before a Reset cannot fire it after the tab has run again (it is judged by the claim it was sent under, not by when it arrives)", async () => {
    let release; const slow = new Promise((r) => { release = r; });
    globalThis.fetch = async (url) => { if (url.includes("slow")) { await slow; return json(200, {}, fresh); } return json(200, { reset: "ok" }); };
    const { n, off } = watch();
    markWorkspaceUsed();
    const pending = workspaceFetch("/api/slow"); // sent with the claim
    await postReset(); // the claim is given up on purpose
    markWorkspaceUsed(); // the tab runs again: a NEW claim
    release();
    await pending;
    expect(n.told).toBe(0);
    off();
  });

  it("a 400 that carries X-Workspace-Fresh (a bad config on a tab whose workspace was forgotten) is still seen, once", async () => {
    globalThis.fetch = async () => json(400, { error: "invalid_config", message: "capacity" }, fresh);
    const { n, off } = watch();
    markWorkspaceUsed();
    expect((await workspaceFetch("/api/run", { method: "POST", body: "{}" })).status).toBe(400);
    expect(n.told).toBe(1);
    await workspaceFetch("/api/run", { method: "POST", body: "{}" }); expect(n.told).toBe(1);
    off();
  });
});

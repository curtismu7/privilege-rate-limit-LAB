import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearWorkspaceUsed, forgetWorkspace, markWorkspaceUsed, onWorkspaceForgotten, workspaceFetch, workspaceId } from "../workspace.js";

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

// A real lab server (the repo's own Express app, in process, on a loopback port) for the UI tests: the page talks to the genuine engines, so a test that clicks a
// scenario sees the genuine result. Nothing leaves the machine: the lab makes no outbound call.
import { createApp, startHttpServer } from "../../../server/src/app.js";
import { forgetWorkspace, workspaceId } from "../workspace.js";

// Starts the lab and points the page's fetch at it. `overrides` maps a path (no query) to a function (init, url, pass) => Response, to force a 4xx or 5xx.
export async function startLab({ overrides = {}, env = {} } = {}) {
  const logged = [];
  const { server, url } = await startHttpServer({ port: 0, host: "127.0.0.1", app: createApp({ env: { WEB_DIST: "/nonexistent", ...env }, log: (l) => logged.push(l) }) });
  const base = url.replace(/\/$/, "");
  const nativeFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, base);
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : undefined;
    calls.push({ method: init.method || "GET", path: u.pathname, search: u.search, body, headers: init.headers });
    const pass = () => nativeFetch(u, { ...init, headers: { origin: base, ...(init.headers || {}) } });
    if (overrides[u.pathname]) { const r = overrides[u.pathname](init, u, pass); if (r) return Promise.resolve(r); }
    return pass();
  };
  forgetWorkspace();
  return {
    base, calls, logged,
    ws: () => workspaceId(),
    // A request outside the page, in the page's own workspace.
    post: (path, payload) => nativeFetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-workspace": workspaceId() }, body: JSON.stringify(payload) }).then((r) => r.json()),
    get: (path) => nativeFetch(`${base}${path}`, { headers: { "x-workspace": workspaceId() } }).then((r) => r.json()),
    stop: async () => { globalThis.fetch = nativeFetch; await new Promise((res) => server.close(res)); },
  };
}

export const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

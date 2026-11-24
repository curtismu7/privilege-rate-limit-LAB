import { clearWorkspaceUsed, markWorkspaceUsed, suspendWorkspaceClaim, workspaceFetch } from "./workspace";

// Every call returns { ok, status, body } and never throws: a refusal (400, 409) is data with a plain message, and a body that is not JSON (a proxy's
// 502 page) becomes { error, message } so the page always has a sentence to show (rule 23).
const UNREACHABLE = { ok: false, status: 0, body: { error: "unreachable", message: "The lab server did not answer. Is it running?" } };
const asBody = (r, body) => (body && typeof body === "object" ? body : { error: "bad_response", message: `The lab answered HTTP ${r.status} without a JSON body` });
async function call(method, url, payload) {
  let r;
  try { r = await workspaceFetch(url, { method, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }); } catch { return UNREACHABLE; }
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body: asBody(r, body) };
}

export const getInfo = () => call("GET", "/api/info");
export const getStory = (vertical) => call("GET", `/api/story?vertical=${encodeURIComponent(vertical)}`);
export const getScenarios = () => call("GET", "/api/scenarios");
export const getLimits = () => call("GET", "/api/limits");
export const getDiagram = (name, vertical) => call("GET", `/api/diagram?name=${encodeURIComponent(name)}&vertical=${encodeURIComponent(vertical)}`);
export const getObservability = () => call("GET", "/api/observability");
// Rule 19: exactly { source }; a 409 (Real is not available) is data, shown as the server worded it.
export const setMode = (source) => call("POST", "/api/mode", { source });
// A run is what creates state in the lab, so after one the tab can say "I already used this id" (see workspace.js).
const ran = (r) => { if (r.ok) markWorkspaceUsed(); return r; };
export const postScenario = (id) => call("POST", `/api/scenario/${encodeURIComponent(id)}`, {}).then(ran);
// record: false is a look-aside run (the cluster compare): the server answers it but does not count it or keep it as the latest run.
export const postRun = (engine, config, profile, { record = true } = {}) => call("POST", record ? "/api/run" : "/api/run?record=0", { engine, config, profile }).then((r) => (record ? ran(r) : r));
// Reset is the server dropping this workspace on purpose: the call is sent without the claim (so it is not answered "forgotten"), and the claim is only given up
// once the reset really succeeded.
export const postReset = async () => {
  const restore = suspendWorkspaceClaim();
  const r = await call("POST", "/api/reset", {});
  if (r.ok) clearWorkspaceUsed(); else restore();
  return r;
};

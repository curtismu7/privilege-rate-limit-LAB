// Rule 13: each browser tab gets its own workspace id, kept in sessionStorage, and sends it as X-Workspace on every API call
// that touches server state. Storage can be blocked, so a failure falls back to a per-load id.
const KEY = "prl.workspace";
let memo = null;

// Tests only: forget the id held in memory so the next call picks a new one.
export const forgetWorkspace = () => { memo = null; };

// The server's rule (server/src/workspaces.js validWorkspaceId): lowercase letters, digits and hyphens, 1 to 40; not 24 or more hex characters in a row;
// no hyphen-separated part that names a credential or starts a token (sk-, pw-, ghp-, token-, password-, ...). The server also refuses anything its
// masker would change; the page cannot run that, so it is the server's 400 bad_workspace that settles the rest (see workspaceFetch). A test compares
// this copy with the server's own check on a table of ids.
const CREDENTIAL_PARTS = new Set(["sk", "pk", "rk", "pw", "pwd", "pass", "passwd", "password", "passphrase", "secret", "token", "apikey", "bearer", "glpat", "ghp", "gho", "ghu", "ghs", "xoxa", "xoxb", "xoxp", "xoxr", "xoxs", "akia", "asia"]);
export function validWorkspaceId(s) {
  if (typeof s !== "string" || !/^[a-z0-9-]{1,40}$/.test(s) || /[0-9a-f]{24,}/.test(s) || s.startsWith("eyj")) return false;
  return !s.split("-").some((part) => CREDENTIAL_PARTS.has(part));
}

// "w-" and 16 hex characters: always holds a letter (the w), never 24 hex in a row, never a credential part.
export function freshId() {
  const bytes = new Uint8Array(8);
  // A typed array's map() makes a NEW array and leaves this one all zeros, so the fallback fills it in place.
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `w-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function workspaceId({ renew = false } = {}) {
  if (memo && !renew) return memo;
  if (!renew) { try { const saved = window.sessionStorage.getItem(KEY); if (saved && validWorkspaceId(saved)) return (memo = saved); } catch { /* blocked */ } }
  memo = freshId();
  try { window.sessionStorage.setItem(KEY, memo); } catch { /* blocked */ }
  return memo;
}

// The id this tab has already RUN something under. It is sent as X-Workspace-Used so the server can tell "a new tab" from "a tab whose workspace I no longer
// hold" (evicted, or the server restarted): only the second is told X-Workspace-Fresh, and the page then says so instead of silently showing defaults.
let usedId = null;
export const markWorkspaceUsed = () => { usedId = workspaceId(); };
export const clearWorkspaceUsed = () => { usedId = null; };
let onForgotten = null;
export function onWorkspaceForgotten(fn) { onForgotten = fn; return () => { if (onForgotten === fn) onForgotten = null; }; }

// One call to the lab. If the server refuses the id (400 bad_workspace: an id saved by an older page, or edited by hand), the page makes a new id and asks
// once more: the refusal happens before anything runs, so asking again is safe. Never a loop: a second refusal is returned as it is. Parallel calls that are
// refused for the same id mint ONE new id between them: a call renews only if the id is still the one it sent.
export async function workspaceFetch(url, opts = {}) {
  const send = () => {
    const id = workspaceId();
    return fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}), "x-workspace": id, ...(usedId === id ? { "x-workspace-used": "1" } : {}) } }).then((r) => ({ r, id }));
  };
  const seen = (r, id) => {
    if (r.headers?.get?.("x-workspace-fresh") === "1" && usedId === id) { usedId = null; try { onForgotten?.(); } catch { /* the banner is best effort */ } }
    return r;
  };
  const first = await send();
  const r = first.r;
  if (r.status !== 400) return seen(r, first.id);
  let refused = false;
  try { refused = (await r.clone().json())?.error === "bad_workspace"; } catch { /* not JSON */ }
  if (!refused) return r;
  if (workspaceId() === first.id) workspaceId({ renew: true });
  const second = await send();
  return seen(second.r, second.id);
}

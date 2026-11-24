// Rule 13: a workspace id keeps one visitor's state apart from another's. The browser sends its id in X-Workspace (default "default"); the state per
// workspace is a short run log (what Reset clears) and the events of the latest run (what "What this run left behind" reads). Bounded in count and age
// by insertion order; the server never reads a real clock, so there is no age, only a cap. Reset clears the current workspace only.
import { createRunLog } from './state.js';

export const WORKSPACE_RE = /^[a-z0-9-]{1,40}$/;
export const DEFAULT_WORKSPACE = 'default';
// An id is echoed back, so one that looks like a credential is refused (400 bad_workspace), never echoed: a JWT start, 24 or more hex characters in a row,
// or a hyphen-separated part that names a credential. The page keeps a copy of this rule (web/src/workspace.js); a test compares the two on a table of ids.
export const CREDENTIAL_PARTS = new Set(['sk', 'pk', 'rk', 'pw', 'pwd', 'pass', 'passwd', 'password', 'passphrase', 'secret', 'token', 'apikey', 'bearer', 'glpat', 'ghp', 'gho', 'ghu', 'ghs', 'xoxa', 'xoxb', 'xoxp', 'xoxr', 'xoxs', 'akia', 'asia']);
export function validWorkspaceId(s) {
  if (typeof s !== 'string' || !WORKSPACE_RE.test(s) || s.startsWith('eyj') || /[0-9a-f]{24,}/.test(s)) return false;
  return !s.split('-').some((part) => CREDENTIAL_PARTS.has(part));
}

export function workspaceFrom(req) {
  const raw = req.headers['x-workspace'];
  if (raw === undefined) return DEFAULT_WORKSPACE;
  return validWorkspaceId(raw) ? raw : null;
}

export function createWorkspaces({ max = 200 } = {}) {
  const map = new Map(); // insertion order = oldest first
  const get = (id) => {
    let w = map.get(id);
    if (!w) { w = { runs: createRunLog(), last: null, seq: 0 }; map.set(id, w); while (map.size > max) map.delete(map.keys().next().value); }
    return w;
  };
  return {
    get,
    reset(id) { const w = map.get(id); const n = w ? w.runs.count() : 0; map.delete(id); return n; },
    size: () => map.size,
  };
}

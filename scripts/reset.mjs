#!/usr/bin/env node
// Reset a running lab for ONE workspace (rule 13): clears that workspace's run log and its latest run ("What this run left behind"). Other workspaces
// (other browser tabs) are untouched.
//   node scripts/reset.mjs [base-url] [workspace-id]     (default http://localhost:${PORT:-7837}; workspace: PRL_WORKSPACE, else "default")
// The page's Reset button resets the workspace of its own tab (an id like w-0123456789abcdef): pass that id to reset a tab from here, or leave it
// for the "default" workspace (what curl and this script use with no id). Loopback only: refuses any other host. Needs the server running; sends the
// same-origin header the server requires.
import { pathToFileURL } from 'node:url';
import { isLoopbackHost } from '../server/src/safety.js';
import { DEFAULT_WORKSPACE, validWorkspaceId } from '../server/src/workspaces.js';

export async function reset(base = `http://localhost:${process.env.PORT || 7837}`, workspace = process.env.PRL_WORKSPACE || DEFAULT_WORKSPACE) {
  const u = new URL(base);
  if (!isLoopbackHost(u.hostname)) throw new Error(`refusing ${u.hostname}: loopback only`);
  if (!validWorkspaceId(workspace)) throw new Error('the workspace id must be 1 to 40 lowercase letters, digits or hyphens and must not look like a credential');
  const r = await fetch(new URL('/api/reset', u), { method: 'POST', headers: { 'content-type': 'application/json', origin: u.origin, 'x-workspace': workspace }, body: '{}' });
  if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`);
  return { ...(await r.json()), workspace };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reset(process.argv[2], process.argv[3]).then((j) => console.log(`reset: ${j.reset} (workspace ${j.workspace}, cleared ${j.cleared} runs)`), (e) => { console.error(e.message); process.exit(1); });
}

# privilege-rate-limit-LAB

Demo-tier standalone lab. Steps 1 (engines, API) and 2 (web UI, presenter mode, talk track, content pack, Docker) are built. **No claim on the board, no shelf registry entry, no proxy route, no submodule pin, port 7837 and catalog id D000 are PROVISIONAL (step 3 is owner-gated).** Spec: `docs/spec.md`.

- Run `npm run build` then `npm start` (127.0.0.1:7837, serves web/dist; the API and server tests need no build). Test `npm test` (server glob `node --test test/*.test.js`, web vitest, `node --test scripts/*.test.mjs`). Preflight `npm run doctor`. Reset `npm run reset`. Node 26. Heavy work on the Air: `air-test . -- npm test`.
- Layout: `server/src/` has one file per engine (`bucket.js`, `fixedWindow.js`, `inflight.js`, `cluster.js`, `appCaps.js`), `load.js` (profile replay and time series), `scenarios.js` (7 scenarios as data with expected results), `app.js` (API), `checks.js` (doctor checks, one per scenario), `safety.js`, `netguard.js`.
- Web: `web/` workspace (React + Vite). Vendored shared files (never hand-edited, each pinned and tested in `scripts/vendored.test.mjs`): `top-menu`, `components/JsonPane.*`, `gateway-trace` (+ `server/src/gatewayTrace.js`), `run-observability` (+ `server/src/runObservability.js`, `scripts/run-observability-checkPin.mjs`), `floating-dialog`, `diagram-kit`, `styles/standalone-ui.css` (`scripts/check-ui-standard.sh`). Re-vendor from `AI-DEMO-Standalone/shared/`, then re-pin. The chart (`components/RateChart.jsx`) follows the dataviz method: tokens only, no colour literal, a legend, direct labels, a table view.
- Stories and the talk track are data (`server/src/data.js`, `{{cast}}` tokens in `cast.js`, three verticals); `docs/talk-track.md` and `content-pack.json` are generated (`npm run talk-track`, `npm run content-pack`) and a test fails on drift or an undefined token. The diagram is `server/diagrams/rate-limit-bucket.json`, exported from diagram-studio-LAB (pinned by `rate-limit-bucket.sha256`).
- Rules that bite: all time is the kit's lab clock (`model-gateway-sim/labClock.js`); no timers, no `Date.now`, no randomness in `server/src` (a test enforces it). The three files in `server/src/model-gateway-sim/` are vendored byte-for-byte from `AI-DEMO-Standalone/shared/model-gateway-sim/` and pinned (`server/test/model-gateway-sim.sha256`): re-vendor, never edit. `health.js` and `doctor.js` are copies of `shared/health` and `shared/doctor`.
- The open question (can a rate-limit refusal trigger model fallback?) is shown with NO result on the Limits page; tests fail if a result field or a claim appears.
- Everything beyond the 2026-11-21 release notes is UNVERIFIED (lab model) and says so (banner, client refusal shape, Redis outage). **Never claim** anything about rate-limit refusals and model fallback (owner decision 2026-11-24: no opinion; the lab never calls a fallback). **Never build** a baseline-jump detector. Spike protection is the bucket's burst only.
- Every scenario needs a test and a doctor check (`checks.js` loops over `SCENARIOS`). Hostile input is bounded in `bounds.js`; config is validated strictly (unknown fields refused, zero or negative limits refused).
- Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text (a test scans).
- No AI attribution in commits or files. Never push, never create a repo from here; the GitHub account is `curtismu7`.

## Recorded decisions
- `web/src/app.css` is tokens only (no colour literals, no dark-mode media queries, breakpoints 600 and 900) EXCEPT the chart block's `--series-*` custom properties: the dataviz palette has its own validated light and dark steps, defined under the shared stylesheet's two dark selectors. The file header says so.
- The host-scan test (`server/test/repo.test.js`) exempts exactly one non-reserved host: `github.com/curtismu7/privilege-rate-limit-LAB` (this lab's own public repo: the Help link, the content pack's source URL, the shelf entry). The Learning Hub's validator requires a real URI for a source, so `.invalid` would not pass it. Any other host in shipped text still fails. Vendored shared files and the CI workflow are exempt because they are pinned or not shipped text.

## Never-repeat lessons
- Every Dockerfile `COPY` source must survive `.dockerignore` (a compose test checks it; a real OrbStack `docker compose up --build` proves it).
- The first story and talk-track load sends `vertical=finance` like every later one (the server falls back for a missing one, so a lost parameter would not show as an error); a test pins it.
- Reset, a change of industry and a real mode change clear the scenario part of the hash (`#limits/<id>`); a page runs a hash scenario only on a deliberate navigation (first load, a link, the back button), never on a remount.
- The workspace-id rule is the same on the client and the server (a test compares them), and the random fallback fills its array in place (`TypedArray.map` makes a new one and leaves zeros).
- Pressing the mode button that is already active changes nothing: no request, no reload, no new epoch.
- `npm run reset` takes a workspace id (arg or `PRL_WORKSPACE`) and sends `X-Workspace`; with none it resets only `default`.
- Netguard allows a literal IP in `dns.lookup` (it needs no DNS, and an opted-in `PRL_BIND` on a LAN address listens through it); connecting to it is still refused.
- Shortcut keys ignore Ctrl, Cmd and Alt, key repeats and focus in a field, select, button, link or editable text; Escape always leaves presenter mode.
- Static scans skip `.github/` and the shared attribution script (they name the very strings they search for).
- Before claiming a port, check running containers and compose files (`docker ps`; the `ap-*` labs use 7839 to 7843), not only the registry.
- A box or button wrapper only handles keys when `e.target === e.currentTarget` (else a button inside an expanded box is toggled and prevented by the wrapper); a test presses Enter on a button inside a box.
- A `customer.config` brand override must reach every brand-bearing string: build them all from the one brand (`cast.js`), and test with another brand in every vertical that no other company name is left.
- A brand of only control or bidi characters is empty once cleaned: check non-empty after sanitising, keep the default.
- Parallel calls refused for the same workspace id must mint one new id (renew only if the id is still the one the failed call sent).
- A read never creates workspace state; the least recently USED workspace is evicted; a tab that says it already ran something (`X-Workspace-Used`) under an id the server no longer holds is told (`X-Workspace-Fresh`, `info.fresh`) and the page shows a banner.
- The mode-switch clears the scenario hash only after the switch succeeded, before the page restarts (`useLab({ onRestart })`); nav links keep their default (Back, Cmd and middle click work).
- A failed run clears the earlier result from the screen and presses no scenario button.

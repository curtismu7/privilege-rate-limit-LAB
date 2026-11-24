# privilege-rate-limit-LAB

Demo-tier standalone lab. Step 1 (core) only: engines, API, tests. **No claim on the board, no repo, no shelf entry, port 7837 is PROVISIONAL.** Spec: `docs/spec.md`.

- Run `npm start` (127.0.0.1:7837). Test `npm test` (glob `node --test test/*.test.js`). Preflight `npm run doctor`. Reset `npm run reset`. Node 26. Heavy work on the Air: `air-test . -- npm test`.
- Layout: `server/src/` has one file per engine (`bucket.js`, `fixedWindow.js`, `inflight.js`, `cluster.js`, `appCaps.js`), `load.js` (profile replay and time series), `scenarios.js` (7 scenarios as data with expected results), `app.js` (API), `checks.js` (doctor checks, one per scenario), `safety.js`, `netguard.js`.
- Rules that bite: all time is the kit's lab clock (`model-gateway-sim/labClock.js`); no timers, no `Date.now`, no randomness in `server/src` (a test enforces it). The three files in `server/src/model-gateway-sim/` are vendored byte-for-byte from `AI-DEMO-Standalone/shared/model-gateway-sim/` and pinned (`server/test/model-gateway-sim.sha256`): re-vendor, never edit. `health.js` and `doctor.js` are copies of `shared/health` and `shared/doctor`.
- Everything beyond the 2026-11-21 release notes is UNVERIFIED (lab model) and says so (banner, client refusal shape, Redis outage). **Never claim** anything about rate-limit refusals and model fallback (owner decision 2026-11-24: no opinion; the lab never calls a fallback). **Never build** a baseline-jump detector. Spike protection is the bucket's burst only.
- Every scenario needs a test and a doctor check (`checks.js` loops over `SCENARIOS`). Hostile input is bounded in `bounds.js`; config is validated strictly (unknown fields refused, zero or negative limits refused).
- Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text (a test scans).
- No AI attribution in commits or files. Never push, never create a repo from here; the GitHub account is `curtismu7`.

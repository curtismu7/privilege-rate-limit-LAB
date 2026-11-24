# privilege-rate-limit-LAB

**Tier: Demo.** Status: step 2 of 3 (core engines and API, the web UI, presenter mode, talk track, content pack, Docker). Step 3 (shelf registry entry, proxy route, submodule pin, release, port claim) is owner-gated and not done.

A lab for the rate-limit features in the 2026-11-21 Privilege release notes: a **continuously refilling request bucket**, an **in-flight cap for LLM calls**, limits **shared across the gateway cluster through Redis**, and **app-wide RPM and max-concurrent caps for MCP and A2A apps**. Everything runs on a lab clock (virtual milliseconds, no timers, no real traffic), so every scenario gives the same answer every time.

## What is simulated
Everything. There is no gateway, no Redis, no LLM provider and no network call (a netguard with a self-test refuses any outbound attempt). Only the four features above are sourced, and only from the release notes. Everything else is **UNVERIFIED (lab model)**: units and parameters, RPM as "a bucket of N refilling N per minute", the order in which key and app caps are checked, what a client receives when refused (status, Retry-After, body), and what happens when Redis is down.

Two things this lab deliberately does **not** do: it shows **no opinion** on whether a rate-limit refusal can trigger model fallback (an open question, never a fallback call), and it has **no baseline-jump detector** (spike protection is shown only as the bucket's burst behaviour; a detector is not in the release notes).

## Scenarios (data, each with an expected result, each tested and checked by `npm run doctor`)
`burst-drains-and-refills`, `bucket-vs-fixed-window`, `inflight-refuses-at-low-rate`, `cluster-without-shared-limit`, `cluster-with-shared-limit`, `app-cap-exhausted-by-one-agent`, `refusal-recorded`. The in-flight scenario uses the shared provider stub's slow call (4 s) as its call length.

## Run
```sh
npm install
npm run build        # builds web/dist (React + Vite); the server serves it, the API and its tests need no build
npm start            # http://127.0.0.1:7837/ (the page) and /api/ (loopback only)
npm test             # server (node --test test/*.test.js), web (vitest), scripts (node --test scripts/*.test.mjs)
npm run doctor       # preflight: every scenario, story tokens, diagram data, netguard self-test, an HTTP pass, port free
npm run reset                    # POST /api/reset for the "default" workspace; `npm run reset -- <base-url> <workspace-id>` (or PRL_WORKSPACE) for one tab. Clears that workspace's run log and latest run only
docker compose up --build -d   # OrbStack; published on 127.0.0.1:7837 only, non-root, read-only, restart: unless-stopped
```
Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first).

## The page
Five pages, the simulation banner first on every one, a Mock / Real toggle in the header (Real is disabled with the server's plain reason) and presenter mode (press P; the banner stays) with a talk track (`docs/talk-track.md`, generated from the same data the page reads).
- **Rate limits**: seven scenario buttons, controls (capacity, refill, in-flight cap, node count, shared store, app-wide caps) and a load generator (steady, burst, spike), the verdict first, then a chart of allowed, refused, errors, tokens and in-flight calls over lab time; the bucket against a fixed window side by side; the two-node cluster view with and without sharing; the app-wide caps view; what the client sees on a refusal (the lab's model, UNVERIFIED); and the simulated gateway trace (shared `GatewayTrace`).
- **Diagram**: `rate-limit-bucket`, loaded by name from diagram-studio data (`server/diagrams/`, exported from diagram-studio-LAB branch `feat/model-gateway-diagrams`, PR #35; re-export after it merges). Movable boxes, Simulate, speed, Reset restores the positions.
- **Left behind** (rule 27): the latest run's rows by layer through the shared `RunObservability`, every row `simulated`; a layer the lab never touched says `not logged`.
- **Stories**: seven beats as data with `{{cast}}` tokens and three vertical packs (finance, health, retail).
- **Limits and UNVERIFIED**: what the release notes say against what the lab models, and an open-question card (no result) for "can a rate-limit refusal trigger model fallback?".

## Observability (rule 27)
Nothing here is logged by a product. The lab writes one stdout line per decision (`<lab time> privilege-rate-limit-lab decision actor=... outcome=passed|limited|info code=... run=...`, no token); in Docker that is the container's stdout, and a collector could ship it to a SIEM (this lab configures none). Where Privilege logs rate-limit decisions is not in the release notes, so the lab claims nothing about it: every row on the page is `simulated` or `not logged`. Times are lab time on a fixed lab date, not the real clock. The run log and the latest run are in memory per workspace and cleared by Reset.

## Customer config and workspaces
`customer.config.json` (git-ignored; see `customer.config.example.json`) may override only the brand. Each browser tab sends its own `X-Workspace` id (rule 13); Reset clears the current workspace only.

API (all under `/api/`, each call in the workspace of its `X-Workspace` header): `GET health` (demo-health/1), `GET info`, `POST mode` (`{source}`), `GET scenarios`, `POST scenario/:id`, `POST run` (`{engine, config, profile}`; both answer with `traces`), `GET story?vertical=`, `GET limits`, `GET diagram?name=&vertical=`, `GET observability`, `POST reset`. Engines: `bucket`, `fixedWindow`, `inflight`, `cluster`, `appCaps`. Profiles: `steady`, `spike`, `burst`, `idle` phases (see `server/src/load.js`).

## Port
**7837 is PROVISIONAL and not claimed yet** (the board, the shelf registry and the lab proxy do not know this lab). `PORT` overrides it for local use. The real port comes from `npm run ports -- --next` in demo-shelf-LAB when the owner claims it.

## Mock and Real
Mock only. `GET /api/info` reports `source: "mock"`, `realAvailable: false` with the reason; `POST /api/mode` to `real` or `live` is answered 409 with that reason. A Real read (owner-run, read-only, needs a tenant running the 2026-11-21 release) is not built. The header toggle has Real disabled with that reason.

## What step 3 adds (owner-gated, not done)
The shelf registry entry (`docs/shelf-entry.json` is ready, with a provisional port and catalog id), the lab-proxy route, the submodule pin, the release and the port claim. See `docs/spec.md`.

## Observability
Nothing here is logged by a product. The run log is in memory and cleared by Reset; the later step shows what a run would leave behind and tags each row as simulated.

# privilege-rate-limit-LAB

**Tier: Demo.** Status: step 1 of 3 (core engines and API; no web UI, no Docker yet).

A lab for the rate-limit features in the 2026-11-21 Privilege release notes: a **continuously refilling request bucket**, an **in-flight cap for LLM calls**, limits **shared across the gateway cluster through Redis**, and **app-wide RPM and max-concurrent caps for MCP and A2A apps**. Everything runs on a lab clock (virtual milliseconds, no timers, no real traffic), so every scenario gives the same answer every time.

## What is simulated
Everything. There is no gateway, no Redis, no LLM provider and no network call (a netguard with a self-test refuses any outbound attempt). Only the four features above are sourced, and only from the release notes. Everything else is **UNVERIFIED (lab model)**: units and parameters, RPM as "a bucket of N refilling N per minute", the order in which key and app caps are checked, what a client receives when refused (status, Retry-After, body), and what happens when Redis is down.

Two things this lab deliberately does **not** do: it shows **no opinion** on whether a rate-limit refusal can trigger model fallback (an open question, never a fallback call), and it has **no baseline-jump detector** (spike protection is shown only as the bucket's burst behaviour; a detector is not in the release notes).

## Scenarios (data, each with an expected result, each tested and checked by `npm run doctor`)
`burst-drains-and-refills`, `bucket-vs-fixed-window`, `inflight-refuses-at-low-rate`, `cluster-without-shared-limit`, `cluster-with-shared-limit`, `app-cap-exhausted-by-one-agent`, `refusal-recorded`. The in-flight scenario uses the shared provider stub's slow call (4 s) as its call length.

## Run
```sh
npm install
npm start            # API at http://127.0.0.1:7837/api/ (loopback only)
npm test             # node --test test/*.test.js (a glob)
npm run doctor       # preflight: every scenario, netguard self-test, an HTTP pass, port free
npm run reset        # POST /api/reset on a running lab
```
Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first).

API (all under `/api/`): `GET health` (demo-health/1), `GET info`, `POST mode` (`{source}`), `GET scenarios`, `POST scenario/:id`, `POST run` (`{engine, config, profile}`), `POST reset`. Engines: `bucket`, `fixedWindow`, `inflight`, `cluster`, `appCaps`. Profiles: `steady`, `spike`, `burst`, `idle` phases (see `server/src/load.js`).

## Port
**7837 is PROVISIONAL and not claimed yet** (the board, the shelf registry and the lab proxy do not know this lab). `PORT` overrides it for local use. The real port comes from `npm run ports -- --next` in demo-shelf-LAB when the owner claims it.

## Mock and Real
Mock only. `GET /api/info` reports `source: "mock"`, `realAvailable: false` with the reason; `POST /api/mode` to `real` or `live` is answered 409 with that reason. A Real read (owner-run, read-only, needs a tenant running the 2026-11-21 release) comes after Mock, as the Mock/Real toggle in the later web step.

## What the later steps add
Step 2: the web UI (banner, scenario picker, chart of the time series, Mock/Real toggle, presenter mode, JsonPane, GatewayTrace, diagram loaded by name). Step 3: Docker and `ci.yml`, shelf entry, content pack, stories, talk track, repo and ports. See `docs/spec.md`.

## Observability
Nothing here is logged by a product. The run log is in memory and cleared by Reset; the later step shows what a run would leave behind and tags each row as simulated.

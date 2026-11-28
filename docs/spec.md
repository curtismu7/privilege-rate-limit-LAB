# privilege-rate-limit-LAB spec (one page)

**Status:** draft, step 1 (core: engines, API, tests; no web UI)   **Owner:** Curtis Muir (decides)   **Tier:** Demo   **Source:** the 2026-11-21 vendor release notes, the only source so far. Everything they do not say is **UNVERIFIED (lab model)** and the lab says so. Derived from "Lab 5" of `AI-DEMO-Standalone/docs/specs/2026-11-24-model-gateway-labs.md`.

## Goal
Show, on a lab clock, a continuously refilling request bucket, an in-flight cap for LLM calls, limits shared across a gateway cluster through a Redis stand-in, and the app-wide MCP and A2A caps that sit apart from the per-key caps. A refusal records what the client sees.

## What the release notes say (the only verified part)
Request-rate caps run on a continuously refilling bucket; an in-flight cap for LLM calls; limits can be shared across the gateway cluster through Redis; MCP and A2A applications get their own app-wide RPM and max-concurrent caps.

## Acceptance criteria (each is a test and a `npm run doctor` check)
1. **burst-drains-and-refills**: bucket capacity 10, refill 2 per second, a burst of 15 allows 10 and refuses 5; tokens at time t is the tested pure function `tokensAt` (refill is linear, capped at capacity); after 5 s idle it is full again and a second burst allows 10 again.
2. **bucket-vs-fixed-window**: the same load (10 at 9.0 s, 10 at 10.0 s) against a bucket (10, 1 per second) and a fixed window (10 per 10 s) side by side: the window allows 20 because it resets all at once at the edge, the bucket 11.
3. **inflight-refuses-at-low-rate**: cap 2, one request per second, each call holds a slot 4 s (the stub's slow latency): the third and fourth are refused although a bucket would allow every one; slots are released on the lab clock (the fifth is allowed at the instant the first ends).
4. **cluster-without-shared-limit**: two nodes, each keeps its own limit: a burst of 20 against a limit of 10 allows 20.
5. **cluster-with-shared-limit**: the same two nodes with a shared store count the limit once: 10 allowed, 10 refused.
6. **app-cap-exhausted-by-one-agent**: an app-wide cap (MCP) is separate from the per-key caps: agent-a drains the app cap with its own key far from its own cap, and agent-b, untouched at key level, is refused at the app layer.
7. **refusal-recorded**: a refusal records what the client sees (status, Retry-After, body). That shape is the lab's model, **UNVERIFIED**.

## Unhappy paths (each has a test)
- Zero or negative limits, NaN, strings, unknown fields: refused at config with a named `invalid_config`.
- Burst larger than capacity: only capacity is served; a start balance above capacity is clamped and flagged; a request costing more than capacity is refused with no retry hint.
- Clock set backwards: refused (the kit's clock; `tokensAt` also refuses an earlier t).
- Shared store unavailable: named error `shared_store_unavailable`, counted as an error, not a refusal. **UNVERIFIED** whether the product fails open or closed; the lab claims neither.
- Hostile input is bounded: at most 50 phases, 10 minutes, 1000 requests per second, 5000 per burst, 20000 requests per run, 8 nodes, 16 agents, 2000 chart ticks; ids restricted to `[a-z0-9-]`; body 64 KB; `__proto__` refused as an unknown field.
- API: bad Host is 421, cross-origin write is 403, non-JSON write is 415, `POST /api/mode` to anything but mock is refused with a plain message.

## UNVERIFIED (lab model)
Bucket units and parameters, RPM as a bucket of size N refilling N per minute, the check order (key first, then app), the client's refusal shape (429, Retry-After, body), Redis outage behaviour, whether a shared bucket is exact under load.

## Out of scope
- Real traffic, a real Redis or gateway; any outbound call.
- **No claim about rate-limit refusals and model fallback** (owner decision 2026-11-24: no opinion). The lab only records the refusal and never calls a fallback; the later page lists the interaction as an open question.
- **No baseline-jump detector.** Spike protection is shown only as the bucket's burst behaviour (not in the release notes).
- Later steps: web UI and chart, Docker, `ci.yml`, shelf entry, content pack, stories, port claim (7837 is provisional).

## Protected / must not break
Loopback-only bind, Host check, same-origin writes, netguard (zero outbound), the vendored kit byte-for-byte (pin test), the Mock or Real modal (shared `mode-modal`, replaces the banner).

## Verification plan
`air-test . -- npm test` (Node 26); one test per scenario; mutation check of each core rule; `npm run doctor`; pin test. No deploy or publish in this step.

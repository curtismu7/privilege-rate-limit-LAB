// The simulation banner: what is simulated, and what is and is not sourced. Shown on every page later (rule 2) and returned by /api/info.
export const BANNER = 'SIMULATED. Rate limits run on a lab clock in this app: no gateway, no Redis, no LLM provider, no real traffic and no network call. '
  + 'Only what the 2026-11-21 release notes say is sourced: a continuously refilling bucket, an in-flight cap for LLM calls, limits shared across the gateway cluster through Redis, '
  + 'and app-wide RPM and max-concurrent caps for MCP and A2A apps. Everything else (units, parameters, what a client receives, Redis outage behaviour) is UNVERIFIED: this lab\'s own model.';

export const OPEN_QUESTION = 'Open question, no opinion shown: whether a rate-limit refusal can trigger model fallback. This lab only records the refusal and never calls a fallback.';

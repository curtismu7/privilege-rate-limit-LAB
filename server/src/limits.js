// What the release notes say, against what this lab models. The left column is the ONLY sourced part; everything on the right is the lab's own model
// and UNVERIFIED. The open question carries no result and no opinion (owner decision 2026-11-24).
export const RELEASE_NOTES = {
  source: 'Vendor release notes of 2026-11-21 (the only source so far)',
  says: [
    { id: 'bucket', text: 'Request-rate caps run on a continuously refilling bucket.' },
    { id: 'inflight', text: 'An in-flight cap applies to LLM calls.' },
    { id: 'redis', text: 'Limits can be shared across the gateway cluster through Redis.' },
    { id: 'appcaps', text: 'MCP and A2A applications get their own app-wide RPM and max-concurrent caps.' },
  ],
};

export const LAB_MODEL = [
  { id: 'units', feature: 'bucket', model: 'A bucket of N tokens refilling R tokens a second; one request costs one token.', unverified: 'The product\'s units and parameters are not in the release notes.' },
  { id: 'rpm', feature: 'appcaps', model: 'RPM modelled as a bucket of N refilling N per minute.', unverified: 'Whether the product counts requests per minute this way (or in a window) is not known.' },
  { id: 'fixed-window', feature: 'bucket', model: 'A fixed window as the comparison: it resets all at once at its edge.', unverified: 'The product has no fixed window as far as the release notes say; it is only the lab\'s contrast.' },
  { id: 'slot-hold', feature: 'inflight', model: 'A call holds one in-flight slot for as long as it takes (the shared provider stub\'s slow call is 4 s) and frees it the instant it ends.', unverified: 'How the product measures a call\'s length and releases slots is not known.' },
  { id: 'check-order', feature: 'appcaps', model: 'The key\'s caps are checked first, then the app\'s; a refusal at one layer spends nothing at another.', unverified: 'The product\'s check order is not known.' },
  { id: 'shared-exact', feature: 'redis', model: 'A shared limit is counted exactly once across nodes.', unverified: 'Whether a shared bucket is exact under load is not known.' },
  { id: 'redis-outage', feature: 'redis', model: 'With the shared store unavailable the lab serves nothing and names the error (shared_store_unavailable).', unverified: 'Whether the product fails open or closed is not known; the lab claims neither.' },
  { id: 'client-shape', feature: 'refusal', model: 'A refused client receives HTTP 429, a Retry-After header in whole seconds and a small JSON body (503 for a shared-store error).', unverified: 'The product\'s status, headers and body are not in the release notes.' },
  { id: 'spike', feature: 'bucket', model: 'Spike protection is only the bucket\'s burst behaviour: a burst larger than the capacity is served up to the capacity.', unverified: 'The lab has no baseline-jump detector; none is in the release notes.' },
];

// An open question has NO result field on purpose.
export const OPEN_QUESTIONS = [
  { id: 'rate-limit-fallback', question: 'Can a rate-limit refusal trigger model fallback?', status: 'open', note: 'No opinion is shown. The lab only records the refusal and never calls a fallback.' },
];

export const NOT_BUILT = [
  { id: 'baseline-jump-detector', text: 'A baseline-jump (spike) detector is not built: it is not in the release notes.' },
  { id: 'real-mode', text: 'Real mode is not built: it needs a tenant running the 2026-11-21 release and an owner-run, read-only read.' },
];

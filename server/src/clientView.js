// What a client sees when it is refused: status, Retry-After and a body. THE SHAPE IS THIS LAB'S MODEL, UNVERIFIED against the product
// (the release notes do not say). It is recorded with every refusal and marked as such.
export const CLIENT_VIEW_NOTE = 'The status, header and body are the lab\'s model of a refusal, UNVERIFIED against the product.';

export function clientView(decision) {
  const ms = decision.retryAfterMs;
  const retryAfterSeconds = typeof ms === 'number' ? Math.max(1, Math.ceil(ms / 1000)) : null;
  const isError = decision.outcome === 'error';
  return {
    status: isError ? 503 : 429,
    headers: retryAfterSeconds === null ? {} : { 'Retry-After': String(retryAfterSeconds) },
    retryAfterSeconds,
    body: isError
      ? { error: 'rate_limit_store_unavailable', message: 'The shared rate-limit store is not available.' }
      : { error: 'rate_limited', message: retryAfterSeconds === null ? 'Request refused by a rate limit.' : `Request refused by a rate limit. Retry after ${retryAfterSeconds} s.` },
    unverified: true,
    note: CLIENT_VIEW_NOTE,
  };
}

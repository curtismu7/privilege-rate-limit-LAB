// How long a call to the (mock) provider takes in a given state, read from the shared provider stub on a throwaway clock,
// so the in-flight scenario's "slow call" is the kit's own slow call and not a number made up here.
import { createClock } from './model-gateway-sim/labClock.js';
import { createProvider } from './model-gateway-sim/providerStub.js';

export function callDurationMs(state = 'healthy', latencyMs = 400) {
  const clock = createClock(0);
  const provider = createProvider({ id: 'stub', model: 'stub-model', latencyMs, timeoutMs: 600_000 }, clock);
  provider.setState(state);
  return provider.call({ prompt: 'x' }).latencyMs;
}

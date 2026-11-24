// {{token}} templating for the stories, the talk track and the diagram. Tokens are filled from one of three vertical packs
// (finance, health, retail). A test fails on any token a pack does not define. Everything in a pack is synthetic: no real company, tenant,
// account or person, and no host. customer.config.json (optional, git-ignored) may override only the brand.
// The cast names are LABELS on this page. The engines always use the plain ids agent-a, agent-b and agent-c; no cast name is a Privilege object name.
import fs from 'node:fs';

const TOKEN = /\{\{(\w+)\}\}/g;
const MAX_CAST = 40;

const pack = (o) => ({
  castBrand: o.brand,
  castAgentA: o.agentA, castAgentB: o.agentB, castAgentC: o.agentC,
  castLlmKey: o.llmKey, castLlmUse: o.llmUse,
  castMcpApp: o.mcpApp, castA2aApp: o.a2aApp,
  castBurstWhy: o.burstWhy, castSlowWhy: o.slowWhy,
});

export const VERTICALS = {
  finance: pack({
    brand: 'Fabrikam Bank', agentA: 'Statement export agent', agentB: 'Fraud review agent', agentC: 'Branch hours agent',
    llmKey: 'Fabrikam customer chat key', llmUse: 'customer chat', mcpApp: 'Fabrikam ledger tools (MCP app)', a2aApp: 'Fabrikam payments desk (A2A app)',
    burstWhy: 'Month-end statement requests all arrive in the same second', slowWhy: 'A long fraud-review answer keeps the call open for seconds',
  }),
  health: pack({
    brand: 'Contoso Health', agentA: 'Appointment reminder agent', agentB: 'Referral triage agent', agentC: 'Clinic hours agent',
    llmKey: 'Contoso patient assistant key', llmUse: 'patient questions', mcpApp: 'Contoso scheduling tools (MCP app)', a2aApp: 'Contoso referral desk (A2A app)',
    burstWhy: 'Every clinic opens its schedule at 08:00 and the reminders go out together', slowWhy: 'A long referral summary keeps the call open for seconds',
  }),
  retail: pack({
    brand: 'Northwind Retail', agentA: 'Order status agent', agentB: 'Returns desk agent', agentC: 'Store hours agent',
    llmKey: 'Northwind shopper assistant key', llmUse: 'shopper questions', mcpApp: 'Northwind catalog tools (MCP app)', a2aApp: 'Northwind fulfilment desk (A2A app)',
    burstWhy: 'A flash sale sends every shopper to the assistant at once', slowWhy: 'A long product comparison keeps the call open for seconds',
  }),
};
export const DEFAULT_VERTICAL = 'finance';
export const DEFAULT_CAST = VERTICALS[DEFAULT_VERTICAL];

export const unfilled = (text, cast) => [...String(text).matchAll(TOKEN)].map((m) => m[1]).filter((k) => !Object.hasOwn(cast, k));
export const fill = (text, cast) => String(text).replace(TOKEN, (m, k) => (Object.hasOwn(cast, k) ? cast[k] : m));

// Iterative, so a deep structure cannot overflow the stack.
export function fillDeep(value, cast) {
  const clone = (x) => (Array.isArray(x) ? [] : x && typeof x === 'object' ? {} : x);
  const outRoot = { v: clone(value) };
  const work = [[value, outRoot, 'v']];
  while (work.length) {
    const [src, dst, key] = work.pop();
    if (typeof src === 'string') { dst[key] = fill(src, cast); continue; }
    if (src === null || typeof src !== 'object') { dst[key] = src; continue; }
    const copy = clone(src);
    dst[key] = copy;
    for (const k of Object.keys(src).reverse()) work.push([src[k], copy, k]);
  }
  return outRoot.v;
}

export const verticalFrom = (id) => (typeof id === 'string' && Object.hasOwn(VERTICALS, id) ? id : DEFAULT_VERTICAL);

// Only the brand, as a short plain string; anything else in the file is ignored. A value with a URL or an email is ignored too.
const CONTROL = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;
export function loadCast(file, vertical = DEFAULT_VERTICAL) {
  const cast = { ...VERTICALS[verticalFrom(vertical)] };
  if (!file) return cast;
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))?.cast?.brand;
    if (typeof v === 'string' && v.trim()) {
      const clean = v.replace(CONTROL, ' ').trim().slice(0, MAX_CAST);
      if (!/:\/\/|@/.test(clean)) { cast.castBrand = clean; cast.castLlmKey = `${clean} assistant key`; }
    }
  } catch { /* no file or not JSON: the defaults */ }
  return cast;
}

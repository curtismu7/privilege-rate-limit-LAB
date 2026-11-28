// {{token}} templating for the stories, the talk track and the diagram. Tokens are filled from one of four vertical packs
// (airlines, finance, health, retail). A test fails on any token a pack does not define. Everything in a pack is synthetic: no real company, tenant,
// account or person, and no host. customer.config.json (optional, git-ignored) may override only the brand.
// The cast names are LABELS on this page. The engines always use the plain ids agent-a, agent-b and agent-c; no cast name is a Privilege object name.
import fs from 'node:fs';

const TOKEN = /\{\{(\w+)\}\}/g;
const MAX_CAST = 40;

// Every string that carries a company name is built from the ONE brand, so a customer.config brand override reaches all of them (the key, the MCP app, the A2A
// app). The pack parts below are generic nouns; nothing in them names a company. The agents' labels are roles, not brands.
const pack = (o, brand = o.brand) => ({
  castBrand: brand,
  castAgentA: o.agentA, castAgentB: o.agentB, castAgentC: o.agentC,
  castLlmKey: `${brand} ${o.llmKey}`, castLlmUse: o.llmUse,
  castMcpApp: `${brand} ${o.mcpApp} (MCP app)`, castA2aApp: `${brand} ${o.a2aApp} (A2A app)`,
  castBurstWhy: o.burstWhy, castSlowWhy: o.slowWhy,
});

const PARAMS = {
  airlines: {
    brand: 'AirGuard Airlines', agentA: 'Fare quote agent', agentB: 'Rebooking agent', agentC: 'Flight status agent',
    llmKey: 'passenger chat key', llmUse: 'passenger chat', mcpApp: 'itinerary tools', a2aApp: 'rebooking desk',
    burstWhy: 'A fare sale sends every traveller to the assistant for a fare quote in the same second', slowWhy: 'A long rebooking answer keeps the call open for seconds',
  },
  finance: {
    brand: 'Fabrikam Bank', agentA: 'Statement export agent', agentB: 'Fraud review agent', agentC: 'Branch hours agent',
    llmKey: 'customer chat key', llmUse: 'customer chat', mcpApp: 'ledger tools', a2aApp: 'payments desk',
    burstWhy: 'Month-end statement requests all arrive in the same second', slowWhy: 'A long fraud-review answer keeps the call open for seconds',
  },
  health: {
    brand: 'Contoso Health', agentA: 'Appointment reminder agent', agentB: 'Referral triage agent', agentC: 'Clinic hours agent',
    llmKey: 'patient assistant key', llmUse: 'patient questions', mcpApp: 'scheduling tools', a2aApp: 'referral desk',
    burstWhy: 'Every clinic opens its schedule at 08:00 and the reminders go out together', slowWhy: 'A long referral summary keeps the call open for seconds',
  },
  retail: {
    brand: 'Northwind Retail', agentA: 'Order status agent', agentB: 'Returns desk agent', agentC: 'Store hours agent',
    llmKey: 'shopper assistant key', llmUse: 'shopper questions', mcpApp: 'catalog tools', a2aApp: 'fulfilment desk',
    burstWhy: 'A flash sale sends every shopper to the assistant at once', slowWhy: 'A long product comparison keeps the call open for seconds',
  },
};
export const VERTICALS = Object.fromEntries(Object.entries(PARAMS).map(([v, o]) => [v, pack(o)]));
export const DEFAULT_VERTICAL = 'airlines';
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
  const v = verticalFrom(vertical);
  if (!file) return { ...VERTICALS[v] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))?.cast?.brand;
    if (typeof raw === 'string') {
      const clean = raw.replace(CONTROL, ' ').trim().slice(0, MAX_CAST).trim(); // checked again after cleaning: a brand of only control characters is empty, so the default stays
      if (clean && !/:\/\/|@/.test(clean)) return pack(PARAMS[v], clean);
    }
  } catch { /* no file or not JSON: the defaults */ }
  return { ...VERTICALS[v] };
}

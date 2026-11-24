// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
// The pack uses .invalid placeholders and no documentation URLs. Catalog id D000 is a PLACEHOLDER: the owner assigns the real one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const TERMS = {
  'burst-drains-and-refills': ['bucket'], 'bucket-vs-fixed-window': ['bucket', 'fixed-window'], 'inflight-refuses-at-low-rate': ['inflight'],
  'cluster-without-shared-limit': ['shared-limit'], 'cluster-with-shared-limit': ['shared-limit'], 'app-cap-exhausted-by-one-agent': ['app-caps'], 'refusal-recorded': ['refusal-shape'],
};

export function buildPack() {
  const story = buildStory(DEFAULT_CAST, 'finance');
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  return {
    schema: 'demo-content-pack/1',
    id: 'privilege-rate-limit-lab',
    title: 'Privilege Rate Limit LAB',
    version,
    demo: { id: 'privilege-rate-limit-lab', name: 'Privilege Rate Limit LAB', catalog: 'D000', baseUrl: 'http://localhost:7837', doctor: '/api/health', tags: ['privilege', 'rate-limit', 'ai-gateway', 'simulated'] },
    glossary: [
      { id: 'bucket', term: 'Refilling bucket', definition: 'The release notes say request-rate caps run on a continuously refilling bucket. In the lab\'s model it holds N tokens and refills R a second, one request costs one token, so a burst drains it and capacity returns gradually. The units are the lab\'s own and UNVERIFIED.', aliases: ['token bucket'] },
      { id: 'fixed-window', term: 'Fixed window (the comparison)', definition: 'A limiter that counts requests in a window and resets all at once at its edge. It is only the lab\'s contrast to the bucket; the release notes do not describe one.', aliases: [] },
      { id: 'inflight', term: 'In-flight cap', definition: 'The release notes say LLM calls have an in-flight cap. In the lab\'s model a slow call holds a slot until it ends, so the next call can be refused at a low request rate.', aliases: ['max concurrent'] },
      { id: 'shared-limit', term: 'Shared limit through Redis', definition: 'The release notes say limits can be shared across the gateway cluster through Redis. In the lab\'s model, without sharing each node allows the full limit; with a shared store (a Redis stand-in) the limit is counted once. Redis outage behaviour is UNVERIFIED and not claimed.', aliases: ['cluster sharing'] },
      { id: 'app-caps', term: 'App-wide MCP and A2A caps', definition: 'The release notes say MCP and A2A applications get their own app-wide RPM and max-concurrent caps. In the lab\'s model they are separate from each key\'s caps, so one agent can use up the app\'s cap for the others. The check order is UNVERIFIED.', aliases: ['app-wide cap'] },
      { id: 'refusal-shape', term: 'What the client sees', definition: 'The lab records a refusal as HTTP 429, a Retry-After in whole seconds and a small JSON body. That shape is the lab\'s model and UNVERIFIED; the release notes do not say what a refused caller receives.', aliases: ['Retry-After'] },
      { id: 'open-question', term: 'Open question: refusal and fallback', definition: 'Whether a rate-limit refusal can trigger model fallback is not known and the lab shows no opinion. It only records the refusal and never calls a fallback.', aliases: [] },
    ],
    sources: [
      { id: 'release-notes', title: 'Vendor release notes of 2026-11-21 (the only source; not linked here)', url: 'https://github.com/curtismu7/privilege-rate-limit-LAB/blob/main/docs/spec.md', kind: 'release-notes', use: 'The four sourced features. The spec file in this lab\'s own public repository lists what they say and what is the lab\'s model.', status: 'read', checked: '2026-11-24' },
    ],
    cards: [
      ...story.beats.map((b, i) => ({ id: `try-${b.id}`, label: `Scenario ${i + 1}: ${b.title}`, description: b.say, group: 'try-it', action: { type: 'route', href: `/#limits/${b.id}` }, terms: TERMS[b.id], story: sid(i + 1) })),
      { id: 'page-limits', label: 'Rate limits: the scenarios, the chart and your own run', description: 'Seven scenario buttons, controls and a load generator (steady, burst, spike), a chart of allowed, refused and tokens over lab time, the bucket against a fixed window side by side, the two-node cluster view, the app-wide caps view and what the client sees on a refusal. The verdict comes first.', group: 'try-it', action: { type: 'route', href: '/#limits' }, terms: ['bucket', 'inflight', 'shared-limit', 'app-caps'] },
      { id: 'page-diagram', label: 'Diagram', description: 'The rate-limit path, loaded by name from diagram-studio data: movable boxes, Simulate, speed and Reset.', group: 'concept', action: { type: 'route', href: '/#diagram' }, terms: ['bucket', 'shared-limit'] },
      { id: 'page-observability', label: 'What this run left behind', description: 'The log and audit rows of the latest run by layer, every one tagged simulated; a layer the lab never touched says not logged.', group: 'concept', action: { type: 'route', href: '/#observability' }, terms: ['refusal-shape'] },
      { id: 'page-stories', label: 'Stories', description: 'Seven beats with the words to say, in three industries.', group: 'concept', action: { type: 'route', href: '/#stories' }, terms: ['bucket'] },
      { id: 'page-unverified', label: 'Limits and UNVERIFIED', description: 'What the release notes say, what the lab only models, and the open question the lab does not answer.', group: 'reference', action: { type: 'route', href: '/#unverified' }, terms: ['refusal-shape', 'open-question'] },
      { id: 'concept-presenter', label: 'Presenter mode and the talk track', description: 'Press P for presenter mode (the simulation banner stays) and open the talk track.', group: 'concept', action: { type: 'route', href: '/#limits' }, terms: ['bucket'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks (one per scenario) and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    diagrams: [{ id: 'rate-limit-bucket', label: 'Rate limits: a refilling bucket, in-flight cap and shared limit', href: '/#diagram' }],
    stories: story.beats.map((b, i) => ({ id: sid(i + 1), title: b.title, say: b.say })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}

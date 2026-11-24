import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPack } from './build-content-pack.mjs';
import { validatePack } from './validate-content-pack.mjs';
import { SCENARIOS } from '../server/src/scenarios.js';
import { DIAGRAM_NAMES } from '../server/src/diagramData.js';

const root = new URL('..', import.meta.url);
const committed = JSON.parse(fs.readFileSync(new URL('content-pack.json', root), 'utf8'));

test('the pack validates against the schema and its cross-references hold', () => {
  assert.deepEqual(validatePack(buildPack()), []);
  assert.equal(buildPack().schema, 'demo-content-pack/1');
  assert.equal(buildPack().id, 'privilege-rate-limit-lab');
});

test('the committed content-pack.json is exactly what the builder makes (no drift)', () => {
  assert.deepEqual(committed, buildPack());
});

test('every scenario has a story and a try-it card', () => {
  const pack = buildPack();
  assert.equal(pack.stories.length, SCENARIOS.length);
  for (const s of pack.stories) assert.ok(pack.cards.find((c) => c.story === s.id), s.id);
  for (const sc of SCENARIOS) assert.ok(pack.cards.some((c) => c.id === `try-${sc.id}`), sc.id);
});

test('the pack describes the real pages: a route card for every page of the web shell, and the diagram by name', () => {
  const app = fs.readFileSync(new URL('web/src/App.jsx', root), 'utf8');
  const ids = [...app.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", View:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['limits', 'diagram', 'observability', 'stories', 'unverified']);
  const hrefs = new Set(buildPack().cards.filter((c) => c.action.type === 'route').map((c) => c.action.href));
  for (const id of ids) assert.ok(hrefs.has(`/#${id}`), `a card routes to /#${id}`);
  assert.deepEqual(buildPack().diagrams.map((d) => d.id), DIAGRAM_NAMES);
});

test('a broken pack is caught: unknown term and unknown story', () => {
  const pack = buildPack();
  pack.cards[0].terms = ['nope'];
  pack.cards[1].story = 'ghost';
  const errors = validatePack(pack).join('\n');
  assert.match(errors, /unknown term nope/);
  assert.match(errors, /unknown story ghost/);
});

test('the pack carries no real link, credential or fallback claim; the open question is a glossary entry with no answer', () => {
  const t = JSON.stringify(buildPack());
  assert.ok(!/https?:\/\/(?!(localhost|example\.invalid|github\.com\/curtismu7\/privilege-rate-limit-LAB))/.test(t), 'only localhost and this lab\'s own repo');
  const q = buildPack().glossary.find((g) => g.id === 'open-question');
  assert.match(q.definition, /not known and the lab shows no opinion/);
  assert.ok(!/(will|does|can|cannot) trigger (a )?(model )?fallback/i.test(t.replace('Whether a rate-limit refusal can trigger model fallback is not known', '')), 'the only mention of fallback is the open question itself');
});

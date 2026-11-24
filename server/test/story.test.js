// Rule 10: stories are DATA with {{cast}} tokens and three vertical packs; a test fails on an undefined token. Also the talk track, the limits data and the open question.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/pin.js';
import { DEFAULT_CAST, VERTICALS, fill, fillDeep, loadCast, unfilled, verticalFrom } from '../src/cast.js';
import { BEATS, PAGE_TALK, TALK_TRACK } from '../src/data.js';
import { buildLimits, buildStory, rawStory, renderTalkTrackMarkdown } from '../src/story.js';
import { LAB_MODEL, OPEN_QUESTIONS } from '../src/limits.js';
import { SCENARIOS } from '../src/scenarios.js';
import { scanHosts, scanKeys } from '../src/safety.js';

test('three vertical packs, and they define the same tokens', () => {
  assert.deepEqual(Object.keys(VERTICALS), ['finance', 'health', 'retail']);
  const keys = Object.keys(DEFAULT_CAST).sort();
  for (const [v, cast] of Object.entries(VERTICALS)) assert.deepEqual(Object.keys(cast).sort(), keys, v);
});

test('every token in the story data is defined by every pack (a missing token fails here)', () => {
  const raw = JSON.stringify(rawStory());
  assert.ok(/\{\{cast/.test(raw), 'the story really uses {{cast}} tokens');
  for (const [v, cast] of Object.entries(VERTICALS)) assert.deepEqual(unfilled(raw, cast), [], v);
});

test('the check itself works: an undefined token is reported, a defined one is not', () => {
  assert.deepEqual(unfilled('hello {{castNope}} and {{castBrand}}', DEFAULT_CAST), ['castNope']);
  assert.equal(fill('{{castBrand}} {{castNope}}', DEFAULT_CAST), `${DEFAULT_CAST.castBrand} {{castNope}}`, 'an unknown token is left as it is, not guessed');
  assert.deepEqual(fillDeep({ a: ['{{castBrand}}', { b: '{{castBrand}}' }] }, DEFAULT_CAST), { a: [DEFAULT_CAST.castBrand, { b: DEFAULT_CAST.castBrand }] });
});

test('every built story is fully filled, differs per vertical, and has only reserved hosts and no key', () => {
  const texts = {};
  for (const v of Object.keys(VERTICALS)) {
    const s = buildStory(VERTICALS[v], v);
    const text = JSON.stringify(s);
    assert.ok(!text.includes('{{'), v);
    assert.deepEqual(scanHosts(text), []); assert.deepEqual(scanKeys(text), []);
    assert.ok(text.includes(VERTICALS[v].castBrand));
    assert.deepEqual(s.agentLabels, { 'agent-a': VERTICALS[v].castAgentA, 'agent-b': VERTICALS[v].castAgentB, 'agent-c': VERTICALS[v].castAgentC });
    texts[v] = text;
  }
  assert.notEqual(texts.finance, texts.health); assert.notEqual(texts.health, texts.retail);
});

test('one beat per scenario, in the scenario order, and every talk-track page id exists', () => {
  assert.deepEqual(BEATS.map((b) => b.id), SCENARIOS.map((s) => s.id));
  const ids = new Set(TALK_TRACK.map((t) => t.id));
  for (const [page, list] of Object.entries(PAGE_TALK)) for (const id of list) assert.ok(ids.has(id), `${page}: ${id}`);
  for (const t of TALK_TRACK) assert.ok(t.title && t.say, t.id);
});

test('the verticals fall back to the default; the brand override is only a short plain string', () => {
  assert.equal(verticalFrom('zzz'), 'finance'); assert.equal(verticalFrom(undefined), 'finance'); assert.equal(verticalFrom('__proto__'), 'finance'); assert.equal(verticalFrom('retail'), 'retail');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'prl-cc-'));
  const good = path.join(dir, 'g.json'); fs.writeFileSync(good, JSON.stringify({ cast: { brand: 'Acme Test Co' }, other: 'ignored' }));
  assert.equal(loadCast(good).castBrand, 'Acme Test Co');
  for (const bad of ['http://evil.example', 'a@b.example', '   ', 5]) {
    const f = path.join(dir, 'b.json'); fs.writeFileSync(f, JSON.stringify({ cast: { brand: bad } }));
    assert.equal(loadCast(f).castBrand, DEFAULT_CAST.castBrand, String(bad));
  }
  assert.equal(loadCast(path.join(dir, 'missing.json')).castBrand, DEFAULT_CAST.castBrand);
  assert.equal(loadCast('').castBrand, DEFAULT_CAST.castBrand);
});

test('docs/talk-track.md is generated from the same data the page reads (no drift)', () => {
  const file = fs.readFileSync(path.join(REPO_ROOT, 'docs/talk-track.md'), 'utf8');
  assert.equal(file, renderTalkTrackMarkdown(DEFAULT_CAST));
});

test('the Limits data: exactly the four sourced features, an open question with NO result, and no fallback claim', () => {
  const l = buildLimits();
  assert.deepEqual(l.releaseNotes.says.map((x) => x.id), ['bucket', 'inflight', 'redis', 'appcaps']);
  assert.equal(OPEN_QUESTIONS.length, 1);
  const q = OPEN_QUESTIONS[0];
  assert.equal(q.question, 'Can a rate-limit refusal trigger model fallback?');
  assert.equal(q.status, 'open');
  for (const k of Object.keys(q)) assert.ok(!/^(result|answer|verdict|outcome|yes|no)$/i.test(k), `an open question has no ${k} field`);
  for (const m of LAB_MODEL) assert.ok(m.unverified && m.model, m.id);
  assert.ok(l.notBuilt.some((n) => n.id === 'baseline-jump-detector'));
});

test('nothing the lab shows claims that a rate-limit refusal does or does not trigger fallback, and no baseline-jump detector is claimed', () => {
  const all = JSON.stringify([rawStory(), buildLimits()]);
  assert.equal(/(triggers?|causes?|cannot trigger|can trigger|does not trigger|will trigger|never triggers?) (a )?(model )?fallback/i.test(all.replace(/Can a rate-limit refusal trigger model fallback\?/g, '').replace(/whether a rate-limit refusal can trigger model fallback/gi, '')), false);
  assert.equal(/baseline[- ]jump detector (is|works|catches|flags)/i.test(all), false);
});

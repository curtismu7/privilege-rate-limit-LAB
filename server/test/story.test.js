// Rule 10: stories are DATA with {{cast}} tokens and four vertical packs; a test fails on an undefined token. Also the talk track, the limits data and the open question.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/pin.js';
import { DEFAULT_CAST, DEFAULT_VERTICAL, VERTICALS, fill, fillDeep, loadCast, unfilled, verticalFrom } from '../src/cast.js';
import { BEATS, PAGE_TALK, TALK_TRACK } from '../src/data.js';
import { buildLimits, buildStory, rawStory, renderTalkTrackMarkdown } from '../src/story.js';
import { LAB_MODEL, OPEN_QUESTIONS } from '../src/limits.js';
import { SCENARIOS } from '../src/scenarios.js';
import { scanHosts, scanKeys } from '../src/safety.js';

test('four vertical packs (airlines first, the default), and they define the same tokens', () => {
  assert.deepEqual(Object.keys(VERTICALS), ['airlines', 'finance', 'health', 'retail']);
  assert.equal(DEFAULT_VERTICAL, 'airlines'); assert.equal(DEFAULT_CAST.castBrand, 'AirGuard Airlines');
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
  assert.notEqual(texts.airlines, texts.finance); assert.notEqual(texts.finance, texts.health); assert.notEqual(texts.health, texts.retail);
});

test('one beat per scenario, in the scenario order, and every talk-track page id exists', () => {
  assert.deepEqual(BEATS.map((b) => b.id), SCENARIOS.map((s) => s.id));
  const ids = new Set(TALK_TRACK.map((t) => t.id));
  for (const [page, list] of Object.entries(PAGE_TALK)) for (const id of list) assert.ok(ids.has(id), `${page}: ${id}`);
  for (const t of TALK_TRACK) assert.ok(t.title && t.say, t.id);
});

test('the verticals fall back to the default; the brand override is only a short plain string', () => {
  assert.equal(verticalFrom('zzz'), 'airlines'); assert.equal(verticalFrom(undefined), 'airlines'); assert.equal(verticalFrom('__proto__'), 'airlines'); assert.equal(verticalFrom('retail'), 'retail'); assert.equal(verticalFrom('finance'), 'finance'); assert.equal(verticalFrom('airlines'), 'airlines');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'prl-cc-'));
  const good = path.join(dir, 'g.json'); fs.writeFileSync(good, JSON.stringify({ cast: { brand: 'Acme Test Co' }, other: 'ignored' }));
  assert.equal(loadCast(good).castBrand, 'Acme Test Co');
  for (const bad of ['http://evil.example', 'a@b.example', '   ', 5]) {
    const f = path.join(dir, 'b.json'); fs.writeFileSync(f, JSON.stringify({ cast: { brand: bad } }));
    assert.equal(loadCast(f).castBrand, DEFAULT_CAST.castBrand, String(bad));
  }
  // a brand that is only control or bidi characters is empty once cleaned: the default stays (it is checked again after cleaning)
  for (const empty of ['\u0007\u0008', '\u202e\u202c', '  \u0000  ', '\u2066\u2069']) {
    const f = path.join(dir, 'e.json'); fs.writeFileSync(f, JSON.stringify({ cast: { brand: empty } }));
    assert.equal(loadCast(f).castBrand, DEFAULT_CAST.castBrand, JSON.stringify(empty));
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

test('a customer.config brand reaches every brand-bearing string: no other company name is left in the intro, the beats, the talk track or the labels, in any vertical', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'prl-brand-'));
  const f = path.join(dir, 'c.json'); fs.writeFileSync(f, JSON.stringify({ cast: { brand: 'Acme Test Co' } }));
  const others = ['Fabrikam', 'Contoso', 'Northwind', 'AirGuard', 'Meridian Air'];
  for (const v of Object.keys(VERTICALS)) {
    const cast = loadCast(f, v);
    assert.equal(cast.castBrand, 'Acme Test Co');
    const story = buildStory(cast, v);
    assert.match(story.intro, /^Acme Test Co puts Acme Test Co [a-z ]+ key \(/, story.intro);
    assert.match(story.intro, /Acme Test Co [a-z ]+ \(MCP app\)/); assert.match(story.intro, /Acme Test Co [a-z ]+ \(A2A app\)/);
    const text = JSON.stringify({ intro: story.intro, beats: story.beats, talkTrack: story.talkTrack, labels: story.agentLabels, cast: story.cast });
    for (const name of others) assert.ok(!text.includes(name), `${v}: ${name} is still in the story`);
    assert.ok(!text.includes('{{'));
    // and every cast string that names a company is built from the brand: the defaults name only their own
    for (const [k, val] of Object.entries(cast)) for (const name of others) assert.ok(!String(val).includes(name), `${v}.${k} still names ${name}`);
  }
});

// The default is the airline: every old brand and the finance wording that came with it are retired from the airline run (the default story, the talk track, the diagram, the
// generated files and the doctor), and the three older packs still render their own brand.
const RETIRED = ['Fabrikam', 'Contoso', 'Northwind', 'Meridian Air', 'Skyline Air', 'Harbor', 'Vellum', 'Statement export', 'statement request', 'Fraud review', 'Branch hours', 'ledger'];

test('the default story is AirGuard Airlines and no old brand or finance wording is in it (retired names)', () => {
  const s = buildStory(loadCast(undefined), undefined);
  assert.equal(s.vertical, 'airlines'); assert.equal(s.cast.castBrand, 'AirGuard Airlines');
  const text = JSON.stringify(s) + renderTalkTrackMarkdown(DEFAULT_CAST);
  assert.ok(text.includes('AirGuard Airlines') && text.includes('Fare quote agent'));
  for (const name of RETIRED) assert.ok(!text.includes(name), `retired name in the airline run: ${name}`);
  for (const file of ['content-pack.json', 'docs/talk-track.md', 'customer.config.example.json']) {
    const t = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    for (const name of RETIRED) assert.ok(!t.includes(name), `${file}: ${name}`);
  }
});

test('the older packs still render their own brand, and a saved finance choice keeps working', () => {
  for (const [v, brand] of [['finance', 'Fabrikam Bank'], ['health', 'Contoso Health'], ['retail', 'Northwind Retail']]) {
    assert.equal(verticalFrom(v), v);
    const text = JSON.stringify(buildStory(VERTICALS[v], v));
    assert.ok(text.includes(brand), v); assert.ok(!text.includes('AirGuard'), `${v}: the airline brand leaked`);
  }
});

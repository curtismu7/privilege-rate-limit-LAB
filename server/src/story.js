import { DEFAULT_VERTICAL, fillDeep, VERTICALS } from './cast.js';
import { BANNER, OPEN_QUESTION } from './banner.js';
import { BEATS, INTRO, PAGE_TALK, TALK_TRACK, TITLE } from './data.js';
import { LAB_MODEL, NOT_BUILT, OPEN_QUESTIONS, RELEASE_NOTES } from './limits.js';
import { SCENARIOS } from './scenarios.js';

export const rawStory = () => ({ title: TITLE, intro: INTRO, banner: BANNER, openQuestionText: OPEN_QUESTION, beats: BEATS, talkTrack: TALK_TRACK, pageTalk: PAGE_TALK });

// The story with the cast filled in. The agents' display labels (the engines use agent-a, agent-b, agent-c) come from the cast.
export function buildStory(cast, vertical = DEFAULT_VERTICAL) {
  const s = fillDeep(rawStory(), cast);
  return {
    ...s, cast, vertical, verticals: Object.keys(VERTICALS),
    agentLabels: { 'agent-a': cast.castAgentA, 'agent-b': cast.castAgentB, 'agent-c': cast.castAgentC },
    scenarios: SCENARIOS.map((sc) => ({ id: sc.id, title: sc.title })),
  };
}

export const buildLimits = () => ({ releaseNotes: RELEASE_NOTES, labModel: LAB_MODEL, openQuestions: OPEN_QUESTIONS, notBuilt: NOT_BUILT });

// docs/talk-track.md is generated from the same data the UI reads (`npm run talk-track`); a test fails if they drift.
export function renderTalkTrackMarkdown(cast) {
  const s = buildStory(cast, DEFAULT_VERTICAL);
  const parts = ['# Talk track', '', '<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->', '', `> ${s.banner}`, ''];
  for (const t of s.talkTrack) parts.push(`## ${t.title}`, '', t.say, '');
  return `${parts.join('\n')}\n`;
}

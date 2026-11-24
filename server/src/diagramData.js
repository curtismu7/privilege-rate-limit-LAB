// The diagram is diagram-studio/1 DATA (server/diagrams/<name>.json), loaded BY NAME and checked with the studio's own validator copy
// (diagramStudioValidate.js). Nothing here builds a node or an edge by hand. The loader pattern is the family's (copied from a sibling lab, never imported).
// The data was exported from diagram-studio-LAB branch feat/model-gateway-diagrams (PR #35, not merged when this was written); see diagrams/rate-limit-bucket.sha256.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDeep } from './cast.js';
import { validateDiagram } from './diagramStudioValidate.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');
export const DIAGRAM_NAMES = ['rate-limit-bucket'];
export const diagramProblems = (doc) => validateDiagram(doc);

export function loadDiagram(name) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  const problems = diagramProblems(doc);
  if (problems.length) throw new Error(`diagram ${name} is not valid diagram-studio/1: ${problems.join('; ')}`);
  return doc;
}
const DOCS = Object.fromEntries(DIAGRAM_NAMES.map((n) => [n, loadDiagram(n)]));
export const rawDiagram = (name) => (Object.hasOwn(DOCS, name) ? DOCS[name] : null);
export const hasDiagram = (name) => typeof name === 'string' && Object.hasOwn(DOCS, name);

// The shape the page reads: { name, title, intro, nodes: [{id, label, kind, x, y}], steps: [{from, to, label, title, say}] }.
// One step per arrow: a studio step that lists several edges becomes one step each, with the studio step's words.
export function buildDiagram(cast, name) {
  const d = fillDeep(DOCS[name], cast);
  const steps = [];
  for (const s of d.steps) {
    for (const ei of s.edges) {
      const e = d.edges[ei];
      // The studio numbers its edge labels ('5a bucket empty'); the page numbers the arrows itself, so the studio's own number is dropped from the text.
      steps.push({ from: e.source, to: e.target, label: (e.label || s.title).replace(/^\d+[a-z]?\s+/, ''), title: s.title, say: [s.what, s.why].filter(Boolean).join(' ') });
    }
  }
  return {
    name: d.id, title: d.title, intro: d.lede,
    nodes: d.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.group, x: n.x, y: n.y })),
    steps,
  };
}

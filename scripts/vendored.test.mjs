// Every vendored shared file must stay byte for byte what its pin says (rules 22, 24, 25, 27 and the shared UI standard). A changed copy fails here.
// To update one: copy the canonical file from AI-DEMO-Standalone shared/ again, then re-pin. Never hand-edit a vendored file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { checkPin } from './run-observability-checkPin.mjs';

const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root));
const sha = (rel) => createHash('sha256').update(read(rel)).digest('hex');
const pins = (rel) => read(rel).toString('utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [h, ...f] = l.trim().split(/\s+/); return [h, f.join(' ')]; });

// A pin file with `<hash>  <name>` lines, where `where(name)` says which path in this repo holds that name.
function pinned(pinFile, where, expectedNames) {
  const list = pins(pinFile);
  if (expectedNames) assert.deepEqual(list.map(([, f]) => f).sort(), [...expectedNames].sort(), `${pinFile} pins exactly the vendored files`);
  for (const [h, f] of list) assert.equal(sha(where(f)), h, `${where(f)} differs from ${pinFile}`);
}

test('rule 22: the shared TopMenu (with ReleaseNotes, which it imports) matches top-menu.sha256 and names the commit', () => {
  assert.match(read('web/src/top-menu/top-menu.sha256').toString().split('\n')[0], /^# vendored byte for byte from curtismu7\/AI-DEMO-Standalone shared\/top-menu at [0-9a-f]{7,40}/);
  pinned('web/src/top-menu/top-menu.sha256', (f) => `web/src/top-menu/${f}`, ['ReleaseNotes.jsx', 'TopMenu.jsx', 'top-menu.css']);
  assert.deepEqual(fs.readdirSync(new URL('web/src/top-menu/', root)).sort(), ['ReleaseNotes.jsx', 'TopMenu.jsx', 'top-menu.css', 'top-menu.sha256']);
});

test('rule 24: JsonPane.jsx and JsonPane.css match their pins', () => {
  assert.equal(sha('web/src/components/JsonPane.jsx'), pins('web/src/components/JsonPane.sha256')[0][0]);
  assert.equal(sha('web/src/components/JsonPane.css'), read('web/src/components/JsonPane.css.sha256').toString().trim().split(/\s+/)[0]);
});

test('rule 25: the shared GatewayTrace files match gateway-trace.sha256 (the server file is gatewayTrace.js beside the web files in the pin)', () => {
  pinned('web/src/gateway-trace/gateway-trace.sha256', (f) => (f === 'gatewayTrace.js' ? 'server/src/gatewayTrace.js' : `web/src/gateway-trace/${f}`), ['GatewayTrace.jsx', 'gateway-trace.css', 'gatewayTrace.js', 'gateway-trace.test.jsx']);
});

test('rule 27: the shared run-observability files match their pin (the shared checkPin, as the rulebook says)', () => {
  assert.deepEqual(checkPin(new URL('.', root).pathname), []);
});

test('the shared FloatingDialog and diagram-kit match their pins and name the commit', () => {
  for (const [dir, files] of [['floating-dialog', ['FloatingDialog.jsx', 'floating-dialog.css', 'floating-dialog.test.jsx', 'geometry.js', 'useFloatingPanel.js']], ['diagram-kit', ['DiagramKit.jsx', 'DiagramKit.test.jsx', 'diagram-kit.css', 'diagramKit.js', 'diagramKit.test.js']]]) {
    const pin = `web/src/${dir}/${dir}.sha256`;
    assert.match(read(pin).toString().split('\n')[0], new RegExp(`^# vendored byte for byte from curtismu7/AI-DEMO-Standalone shared/${dir} at [0-9a-f]{7,40}`));
    pinned(pin, (f) => `web/src/${dir}/${f}`, files);
    assert.deepEqual(fs.readdirSync(new URL(`web/src/${dir}/`, root)).sort(), [...files, `${dir}.sha256`].sort());
  }
});

test('the shared mode-modal (ModeModal.jsx, mode-modal.css) matches mode-modal.sha256, and nothing else is in the folder', () => {
  pinned('web/src/mode-modal/mode-modal.sha256', (f) => `web/src/mode-modal/${f}`, ['ModeModal.jsx', 'mode-modal.css']);
  assert.deepEqual(fs.readdirSync(new URL('web/src/mode-modal/', root)).sort(), ['ModeModal.jsx', 'mode-modal.css', 'mode-modal.sha256']);
});

test('the shared UI stylesheet matches scripts/standalone-ui.sha256 and the check script points at where it lives', () => {
  assert.equal(sha('web/src/styles/standalone-ui.css'), read('scripts/standalone-ui.sha256').toString().trim());
  assert.match(read('scripts/check-ui-standard.sh').toString(), /^copy_rel="web\/src\/styles\/standalone-ui\.css"/m);
});

test('the TalkTrackDialog is the shared one: it imports the vendored FloatingDialog and nothing else', () => {
  const t = read('web/src/talk-track/TalkTrackDialog.jsx').toString();
  assert.match(t, /import FloatingDialog from "\.\.\/floating-dialog\/FloatingDialog";/);
});

test('main.jsx loads the shared stylesheet before the lab stylesheet', () => {
  const main = read('web/src/main.jsx').toString();
  assert.ok(main.indexOf('standalone-ui.css') > 0 && main.indexOf('standalone-ui.css') < main.indexOf('app.css'));
  for (const css of ['top-menu.css', 'JsonPane.css', 'gateway-trace.css', 'run-observability.css']) assert.ok(main.includes(css), `main.jsx imports ${css}`);
});

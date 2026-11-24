import { useEffect, useState } from "react";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import PresenterSay from "./components/PresenterSay.jsx";
import useLab from "./hooks/useLab";
import { clearScenarioHash } from "./hashNav.js";
import RateLimitsPage from "./pages/RateLimitsPage.jsx";
import DiagramPage from "./pages/DiagramPage.jsx";
import ObservabilityPage from "./pages/ObservabilityPage.jsx";
import StoriesPage from "./pages/StoriesPage.jsx";
import UnverifiedPage from "./pages/UnverifiedPage.jsx";

export const PAGES = [
  { id: "limits", label: "Rate limits", View: RateLimitsPage },
  { id: "diagram", label: "Diagram", View: DiagramPage },
  { id: "observability", label: "Left behind", View: ObservabilityPage },
  { id: "stories", label: "Stories", View: StoriesPage },
  { id: "unverified", label: "Limits and UNVERIFIED", View: UnverifiedPage },
];
// The banner never waits for the server to be known as simulated: until /api/info answers, it already says so.
export const BANNER_UNKNOWN = "SIMULATED. Rate limits run on a lab clock in this app: no gateway, no Redis, no provider, no real traffic.";
const PAGE_INTRO = {
  limits: "A refilling bucket, an in-flight cap, a shared limit and the app-wide caps, on a lab clock. Pick a scenario or build a run; the verdict comes first.",
  diagram: "The rate-limit path as a diagram loaded by name from diagram-studio data. Drag a box, press Simulate, then Reset.",
  observability: "What the latest run left behind, layer by layer. Every row is simulated and tagged so.",
  stories: "Seven beats, one per scenario, with the words to say.",
  unverified: "What the release notes say, what the lab only models, and one question the lab does not answer.",
};
const THEME_KEY = "prl.theme";
const FONT_KEY = "prl.font";
const THEMES = ["auto", "light", "dark"];
function initialTheme() { try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(v)) return v; } catch { /* storage blocked */ } return "auto"; }
function initialFont() { try { const f = localStorage.getItem(FONT_KEY); return ["S", "M", "L"].includes(f) ? f : "M"; } catch { return "M"; } }
// "#limits/<scenario id>" opens that scenario: the page is the part before the slash.
const pageFromHash = () => { const h = window.location.hash.replace("#", "").split("/")[0]; return PAGES.some((p) => p.id === h) ? h : "limits"; };

export default function App() {
  const lab = useLab();
  const [page, setPage] = useState(pageFromHash());
  const [presenter, setPresenter] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [fontStep, setFontStep] = useState(initialFont);
  const [resetMsg, setResetMsg] = useState("");

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { applyFontSize(fontStep); try { localStorage.setItem(FONT_KEY, fontStep); } catch { /* not remembered */ } }, [fontStep]);
  useEffect(() => { const on = () => setPage(pageFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => {
    // P toggles presenter mode, Escape leaves it. Not with Ctrl, Cmd or Alt (Cmd+P is the browser's print), not on a key repeat, and not while focus is in
    // a control or editable text (typing a "p" in a field, or Space and Enter on a button, must never flip the mode).
    const typing = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.isContentEditable === true || t.getAttribute?.("contenteditable") === "" || t.getAttribute?.("contenteditable") === "true" || t.getAttribute?.("role") === "textbox");
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") setPresenter(false); // leaving presenter mode works wherever focus is
      else if ((e.key === "p" || e.key === "P") && !e.repeat && !typing(e.target)) setPresenter((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pickTheme = (next) => { try { if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ } setTheme(next); };
  const select = (id) => { setPage(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* ignore */ } };
  const reset = async () => {
    clearScenarioHash();
    const ok = await lab.reset();
    setResetMsg(ok ? "Reset: the run log, the latest run and the diagram's box positions are back to the start." : "Reset failed on the server; the view was reloaded.");
  };

  const { source, story, info } = lab;
  const banner = info?.banner || BANNER_UNKNOWN;
  const View = PAGES.find((p) => p.id === page).View;
  const say = !story ? [] : story.talkTrack.filter((x) => (story.pageTalk[page] || []).includes(x.id));

  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo" aria-hidden="true">PRL</span>
          <h1>Privilege Rate Limit LAB</h1>
          <span className="shell-badge" data-testid="mode" title="Mock: a simulation on a lab clock, nothing leaves this machine">{source === "real" ? "Real" : "Mock"}</span>
        </span>
        <nav className="shell-nav" aria-label="Lab sections">
          {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} aria-current={page === p.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); select(p.id); }}>{p.label}</a>)}
        </nav>
        <TopMenu
          vertical={{ value: lab.vertical, onChange: (v) => { clearScenarioHash(); lab.setVertical(v); }, options: story ? story.verticals : ["finance"] }}
          theme={{ value: theme, onChange: pickTheme }}
          fontSize={{ value: fontStep, onChange: setFontStep }}
          present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (P)" }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
          help={{ href: "https://github.com/curtismu7/privilege-rate-limit-LAB#readme" }}
          version={info?.version ? `v${info.version}` : null}
          onReset={reset}
          extra={<ModeToggle source={source || "mock"} info={info} onSwitch={(next) => { if (next !== source) clearScenarioHash(); return lab.switchMode(next); }} />}
        />
      </header>
      <main className="page">
        <p className="banner" role="note" data-state="mock" data-testid="banner">{banner}</p>
        {info && info.realAvailable === false && <p className="muted" data-testid="real-reason">Real is off: {info.realReason}</p>}
        {lab.modeError && <p className="field-error" role="alert" data-testid="mode-error-banner">{lab.modeError}</p>}
        {lab.error && story && (
          <div className="field-error" role="alert" data-testid="reload-error">
            <p>The lab could not be reloaded ({lab.error}). What is on screen is the last data it loaded.</p>
            <button type="button" onClick={lab.reload} data-testid="retry-reload">Try again</button>
          </div>
        )}
        <p className={resetMsg ? "reset-note" : "sr-only"} role="status" aria-live="polite" data-testid="reset-note">{resetMsg}</p>
        {!presenter && <div className="page-head"><p className="head__intro" data-testid="head-intro">{PAGE_INTRO[page]}</p></div>}
        {presenter && <PresenterSay say={say} />}
        <div id={`panel-${page}`}>
          {lab.error && !story ? (
            <div className="field-error" role="alert" data-testid="load-error">
              <p>Could not load the lab ({lab.error}). Is the server running?</p>
              <button type="button" onClick={lab.reload} data-testid="retry">Try again</button>
            </div>
          ) : !story || !info ? <p className="muted" role="status">Loading...</p> : <View key={`${page}-${lab.epoch}`} lab={lab} />}
        </div>
      </main>
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={story?.talkTrack ?? []} />
    </div>
  );
}

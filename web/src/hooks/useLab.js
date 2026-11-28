import { useCallback, useEffect, useRef, useState } from "react";
import { getInfo, getStory, postReset, setMode } from "../api";

const say = (r, what) => r.body?.message || `${what} failed (HTTP ${r.status})`;

/**
 * The lab's one data hook: the info (source, realAvailable, the banner), the story for the picked vertical and the mode switch. `switchMode` is the rule 19
 * toggle: POST /api/mode with exactly { source }, then every piece of data is loaded again. `epoch` goes up on a switch or a Reset so a page can start over.
 */
export default function useLab({ onRestart } = {}) {
  const restartRef = useRef(onRestart); restartRef.current = onRestart; // called after a mode change that really happened, before the page restarts
  const [vertical, setVerticalState] = useState("airlines");
  const [info, setInfo] = useState(null);
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [modeError, setModeError] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async (v = vertical) => {
    const mine = ++seq.current; // a late answer for a vertical the visitor has left is dropped
    const [i, s] = await Promise.all([getInfo(), getStory(v)]);
    if (mine !== seq.current) return;
    const bad = [i, s].find((r) => !r.ok);
    if (bad) { setError(say(bad, "Loading the lab")); return; }
    setError(null); setInfo(i.body); setStory(s.body);
  }, [vertical]);

  useEffect(() => { load(vertical); }, [vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVertical = useCallback((v) => { setVerticalState(v); setEpoch((n) => n + 1); }, []);

  // The server decides. A 409 (Real is not available) is shown as the server worded it; nothing else changes.
  const switchMode = useCallback(async (source) => {
    // Pressing the mode the page is already in changes nothing: no request, no reload, no new epoch (so a result on screen is not thrown away).
    if (source === info?.source) return { ok: true, unchanged: true };
    const r = await setMode(source);
    if (!r.ok) { setModeError(r.body?.message || `The mode did not change (HTTP ${r.status})`); return { ok: false, message: r.body?.message }; }
    restartRef.current?.();
    setModeError(null); setEpoch((n) => n + 1);
    await load(vertical);
    return { ok: true };
  }, [load, vertical, info?.source]);

  const reset = useCallback(async () => {
    const r = await postReset();
    setEpoch((n) => n + 1);
    await load(vertical);
    return r.ok;
  }, [load, vertical]);

  return { vertical, setVertical, info, story, source: info?.source || null, error, modeError, epoch, reload: () => load(vertical), switchMode, reset };
}

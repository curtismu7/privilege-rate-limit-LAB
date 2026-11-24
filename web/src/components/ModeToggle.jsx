// Rule 19: the Mock / Real toggle in the header of every page. Two buttons, the current mode pressed (aria-pressed). A press asks the server
// (POST /api/mode with exactly { source }) and the lab reloads all its data after it. Real is DISABLED, with the server's plain reason as its tooltip and
// as visible text under the toggle on a narrow screen, while the server says Real is not available (it answers 409 to a switch).
export default function ModeToggle({ source, info, onSwitch }) {
  const realOff = info ? info.realAvailable === false : false;
  const how = info?.realReason || "Real is not available. Mock keeps working.";
  return (
    <span className="mode-toggle" role="group" aria-label="Mock or Real" data-testid="mode-toggle">
      <button type="button" aria-pressed={source === "mock"} onClick={() => onSwitch("mock")} data-testid="mode-mock" title="Mock: a simulation on a lab clock, nothing leaves the machine">Mock</button>
      <button type="button" aria-pressed={source === "real"} disabled={realOff} onClick={() => onSwitch("real")} data-testid="mode-real"
        title={realOff ? how : "Real: a read-only look at a tenant (owner-run)"}>Real</button>
    </span>
  );
}

// "#limits/<scenario id>" is a deliberate navigation (a link, a back button, a pasted URL): the page runs that scenario when it is navigated TO. It is not
// state to replay: Reset, a change of industry and a real change of mode start the page over, so each clears the scenario part of the hash first (else the
// page would remount and run the scenario again).
export const scenarioFromHash = () => {
  const [page, id] = window.location.hash.replace("#", "").split("/");
  return page === "limits" && id ? id : null;
};
export function clearScenarioHash() {
  if (!scenarioFromHash()) return;
  try { window.history.replaceState(null, "", "#limits"); } catch { /* the hash stays; the page still starts over */ }
}

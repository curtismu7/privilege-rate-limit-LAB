// The only server state: a short log of runs, so Reset has something to clear. Bounded.
const MAX_RUNS = 20;

export function createRunLog() {
  let runs = [];
  return {
    add(entry) { runs.push(entry); if (runs.length > MAX_RUNS) runs = runs.slice(-MAX_RUNS); },
    count: () => runs.length,
    list: () => runs.slice(),
    reset() { const n = runs.length; runs = []; return n; },
  };
}

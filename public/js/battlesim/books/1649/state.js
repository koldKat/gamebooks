// Access this simulator's run-local state without replacing existing fights or other run data.
export function createState(getContext) {
  return function data() {
    const { currentBookId, currentPlaythrough } = getContext();
    if (Number(currentBookId) !== 1649) return null;
    const run = currentPlaythrough();
    return run ? run.sim1649 ??= { fight: null, history: [], setup: null } : null;
  };
}

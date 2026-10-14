// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, createDenCharacter, currentBookId, currentPlaythrough } = getContext();

  if (Number(currentBookId) !== 527) return null;
  const run = currentPlaythrough();
  return run ? run[ID] ||= { player: createDenCharacter(), fight: null, history: [], log: [] } : null;
}
// END EXTRACTED RULES
  return { data };
}

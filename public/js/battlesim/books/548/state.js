// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, log, rollInnsmouthCharacter } = getContext();

  if (Number(currentBookId) !== 548) return null;
  const pt = currentPlaythrough();
  return pt ? pt[ID] ||= { player: rollInnsmouthCharacter(), fight: null, history: [], log: [] } : null;
}
// END EXTRACTED RULES
  return { data };
}

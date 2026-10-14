// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, createArkhamCharacter, currentBookId, currentPlaythrough, initialStats } = getContext();

  if (Number(currentBookId) !== 555) return null;
  const pt = currentPlaythrough();
  return pt ? pt[ID] ||= { player: createArkhamCharacter('agnes', initialStats), fight: null, history: [], log: [] } : null;
}
// END EXTRACTED RULES
  return { data };
}

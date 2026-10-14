// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, rollAncientEvilCharacter } = getContext();

  if (Number(currentBookId) !== 537) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { ...rollAncientEvilCharacter(), weapon: 'doombringer', armour: 'none' }, fight: null, history: [], log: [] };
}
// END EXTRACTED RULES
  return { data };
}

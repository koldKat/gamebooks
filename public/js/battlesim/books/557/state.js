// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, createKingsportCharacter, currentBookId, currentPlaythrough } = getContext();

  if (Number(currentBookId) !== 557) return null;
  const pt = currentPlaythrough();
  return pt ? pt[ID] ||= { player: createKingsportCharacter('jacqueline'), fight: null, history: [], log: [] } : null;
}
// END EXTRACTED RULES
  return { data };
}

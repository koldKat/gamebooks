// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, rollFireWolfCharacter } = getContext();

  if (Number(currentBookId) !== 534) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { ...rollFireWolfCharacter(), power: 0, maxPower: 0,
    healingStone: 0, bluePowder: 0, armour: 'none', shield: false }, fight: null,
    prepared: null, opponent: 0, nextOptions: {}, magic: null, history: [], log: [] };
}
// END EXTRACTED RULES
  return { data };
}

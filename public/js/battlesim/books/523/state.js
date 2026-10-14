// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, initialFortune } = getContext();

  if (Number(currentBookId) !== 523) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { expertise: 12, vitality: 20, fortune: initialFortune().fortune, weaponDamage: 2 },
    potions: 3, provisions: 3, fight: null, history: [], log: [] };
}
// END EXTRACTED RULES
  return { data };
}

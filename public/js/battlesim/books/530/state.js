// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, character, currentBookId, currentPlaythrough, rules } = getContext();

  if (Number(currentBookId) !== 530) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player: rules.createKingdomCharacter(), fight: null, history: [], log: [] };
  const path = run.path ?? [];
  const from = Math.min(d.observedPathLength ?? path.length, path.length);
  for (const section of path.slice(from)) {
    const number = Number(section);
    if (Number.isInteger(number) && number >= 1 && number <= 181) {
      const p = rules.kingdomVisit(character(d), number);
      if (d.fight) {
        d.fight.player = p;
        rules.settleKingdomFight(d.fight);
      } else d.player = p;
      if (d.merlin) d.merlin.player = p;
      if (d.dream) d.dream.player = p;
    }
  }
  d.observedPathLength = path.length;
  return d;
}
// END EXTRACTED RULES
  return { data };
}

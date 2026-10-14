// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, p, rules } = getContext();

  if (Number(currentBookId) !== 533) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player:rules.createLegionCharacter(),fight:null,history:[],log:[] };
  const path = run.path ?? [];
  const sections = d.observedPathLength === undefined ? path.slice(-1)
    : path.slice(Math.min(d.observedPathLength,path.length));
  for (const section of sections) {
    rules.legionVisit(p(d),section);
    if (d.fight) rules.settleLegionFight(d.fight);
  }
  d.observedPathLength = path.length;
  return d;
}
// END EXTRACTED RULES
  return { data };
}

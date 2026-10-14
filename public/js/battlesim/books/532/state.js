// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, character, currentBookId, currentPlaythrough, log, rules } = getContext();

  if (Number(currentBookId) !== 532) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player: rules.createTombCharacter(), fight: null, history: [], log: [] };
  const path = run.path ?? [];
  if (d.observedPathLength === undefined && path.length) rules.tombVisit(character(d), path.at(-1));
  else for (const section of path.slice(Math.min(d.observedPathLength ?? 0, path.length))) {
    rules.tombVisit(character(d), section);
    if (d.fight) rules.settleTombFight(d.fight);
  }
  d.observedPathLength = path.length;
  return d;
}
// END EXTRACTED RULES
  return { data };
}

// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, character, currentBookId, currentPlaythrough, rules } = getContext();

  if (Number(currentBookId) !== 529) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player: rules.createVoyageCharacter(), fight: null, history: [], log: [] };
  const path = run.path ?? [], from = Math.min(d.observedPathLength ?? path.length, path.length);
  for (const section of path.slice(from)) rules.visitVoyageSection(character(d), section);
  d.observedPathLength = path.length;
  return d;
}
// END EXTRACTED RULES
  return { data };
}

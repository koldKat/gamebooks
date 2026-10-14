// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, character, currentBookId, currentPlaythrough, rules } = getContext();

  if (Number(currentBookId) !== 528) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player: rules.createGatewayCharacter(), fight: null, history: [], log: [] };
  const path = run.path ?? [];
  const from = d.observedPathLength ?? path.length;
  for (const section of path.slice(Math.min(from, path.length))) rules.visitGatewaySection(character(d), section);
  d.observedPathLength = path.length;
  return d;
}
// END EXTRACTED RULES
  return { data };
}

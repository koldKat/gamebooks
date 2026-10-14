// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, log, player, rules } = getContext();

  if (Number(currentBookId) !== 539) return null;
  const run = currentPlaythrough();
  return run ? run[ID] ||= { player:rules.createShadowsCharacter(),fight:null,history:[],log:[] } : null;
}
// END EXTRACTED RULES
  return { data };
}

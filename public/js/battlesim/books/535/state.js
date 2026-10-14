// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function data() {
  const { ID, currentBookId, currentPlaythrough, rollCryptsCharacter } = getContext();

  if (Number(currentBookId)!==535) return null;
  const pt=currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= {player:{...rollCryptsCharacter(),weapon:'doombringer',armour:'none',wandCharges:0},
    fight:null,magic:null,nextOptions:{},log:[],history:[]};
}
// END EXTRACTED RULES
  return { data };
}

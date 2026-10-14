// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _encounter(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER[0]; }




// END EXTRACTED RULES
  return { _roll1d6, _encounter };
}

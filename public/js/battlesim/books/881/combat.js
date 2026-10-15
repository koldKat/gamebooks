// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _encounter(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _sword(id) {
  const { SWORDS } = getContext();
 return SWORDS.find(s => s.id === id) || SWORDS[0]; }

function _pickSword(id) {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || d.pendingFight) return;
  d.swordId = id;
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll1d6, _encounter, _sword, _pickSword };
}

// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { ID, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt[ID]) pt[ID] = {};
  const d = pt[ID];
  if (!d.player || typeof d.player.sila !== 'number') d.player = { sila: 16, energy: 16 };
  if (typeof d.player.energy !== 'number') d.player.energy = 16;
  if (!d.enemy) d.enemy = { name: '', sila: 0, energy: 0, curEnergy: 0, hasStats: false };
  if (typeof d.enemy.curEnergy !== 'number') d.enemy.curEnergy = d.enemy.energy;
  if (!d.fight) d.fight = { ready: false, pStr: 0, eStr: 0 };
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}
// END EXTRACTED RULES
  return { _data };
}

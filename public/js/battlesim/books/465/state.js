// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim465) {
    pt.sim465 = {
      player: { field: 50, fieldInitial: 50, woundDamage: 1 },
      enemy: { name: '', woundDamage: 1, stamina: 0, staminaMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim465;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.woundDamage === undefined) d.player.woundDamage = 1;
  if (d.enemy.woundDamage === undefined) d.enemy.woundDamage = 1;
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerField: d.player.field, playerFieldMax: d.player.fieldInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

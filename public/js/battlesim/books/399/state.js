// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _emptySide, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim399) {
    pt.sim399 = {
      player: { ..._emptySide(), speed: 2, str: 2, acc: 2, reflex: 2, resil: 2, endurance: 15, enduranceInitial: 15, enduranceCritical: 6 },
      enemy: { ..._emptySide(), name: '' },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim399;
  for (const side of [d.player, d.enemy]) {
    const blank = _emptySide();
    for (const k of Object.keys(blank)) {
      if (side[k] === undefined) side[k] = blank[k];
    }
  }
  if (d.enemy.name === undefined) d.enemy.name = '';
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _enemyDefeated, _playerDefeated } = getContext();
 return _playerDefeated(d) || _enemyDefeated(d); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

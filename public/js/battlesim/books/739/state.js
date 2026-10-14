// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim739) {
    pt.sim739 = {
      player: { life: 0, lifeInitial: 0, skillDelta: 0 },
      enemy: { name: '', life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim739;
  if (!d.player) d.player = { life: 0, lifeInitial: 0, skillDelta: 0 };
  if (d.player.skillDelta === undefined) d.player.skillDelta = 0;
  if (!d.enemy) d.enemy = { name: '', life: 0, lifeMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _notReady(d) {
 return d.player.lifeInitial <= 0; }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerLife: d.player.life, playerLifeMax: d.player.lifeInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _notReady, _recordOutcome };
}

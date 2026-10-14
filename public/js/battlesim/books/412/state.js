// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _enemy, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim412) {
    pt.sim412 = {
      enemyId: 'e1',
      player: { lp: 58, startLp: 58 },
      enemy: { str: 14, hp: 12, startHp: 12 },
      over: false, winner: null, started: false,
      log: [], history: [],
    };
  }
  const d = pt.sim412;
  if (!d.enemyId) d.enemyId = 'e1';
  if (!d.player) d.player = { lp: 58, startLp: 58 };
  if (typeof d.player.lp !== 'number') d.player.lp = 58;
  if (typeof d.player.startLp !== 'number') d.player.startLp = d.player.lp;
  if (!d.enemy) d.enemy = { ..._enemy(d.enemyId), startHp: _enemy(d.enemyId).hp };
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  return d;
}

function _appendLog(d, line) {
 d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();
 d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() }); }
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

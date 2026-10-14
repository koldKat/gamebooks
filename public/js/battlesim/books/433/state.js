// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim433) {
    pt.sim433 = {
      player: {
        csBase: 0, epInitial: 0, ep: 0,
        weaponBonus: false, mindBlast: false,
        laumspurUsed: false,
      },
      enemy: { name: '', cs: 0, ep: 0, epMax: 0 },
      rolled: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
      printedRules: 1,
      combatEffects: {},
    };
  }
  const d = pt.sim433;
  if (d.rolled === undefined) d.rolled = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.player.weaponBonus === undefined) d.player.weaponBonus = false;
  if (d.player.mindBlast === undefined) d.player.mindBlast = false;
  if (d.player.laumspurUsed === undefined) d.player.laumspurUsed = false;
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _notReady, _playerLost, _playerWon } = getContext();
 return _notReady(d) || _playerLost(d) || _playerWon(d) || !!d.combatEffects?.finished; }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEp: d.player.ep, playerEpMax: d.player.epInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _battleOver, _recordOutcome };
}

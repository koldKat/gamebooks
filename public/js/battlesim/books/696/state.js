// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim696) {
    pt.sim696 = {
      player: {
        sila: 0, refleks: 0, izdrazhlivost: 0,
        life: 0, lifeInitial: 0,
        ataka: 0, zashtita: 0,
      },
      enemy: { name: '', sila: 0, refleks: 0, izdrazhlivost: 0, life: 0, lifeMax: 0, ataka: 0, zashtita: 0 },
      attackerIsPlayer: true,
      roundsThisBattle: 0,
      exchangeRulesVersion: 2,
      log: [],
      history: [],
    };
  }
  const d = pt.sim696;
  if (d.attackerIsPlayer === undefined) d.attackerIsPlayer = true;
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
  const { _enemyDefeated, _hasEnemy, _playerDefeated } = getContext();
 return d.player.lifeInitial <= 0 || _playerDefeated(d) || (_hasEnemy(d) && _enemyDefeated(d)); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, playerLife: d.player.life, playerLifeMax: d.player.lifeInitial, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

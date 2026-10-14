// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim541) {
    pt.sim541 = {
      player: {
        strength: 0, dexterity: 0, mentality: 0,
        stamina: 0, staminaInitial: 0,
        endurance: 0, enduranceInitial: 0,
        weaponSta: 2, weaponEnd: 0,
      },
      attribute: 'strength',
      combatRulesVersion: 2,
      enemy: { name: '', value: 0, sta: 0, staMax: 0, end: 0, endMax: 0, weaponSta: 2, weaponEnd: 0 },
      rolled: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim541;
  if (d.rolled === undefined) d.rolled = false;
  if (!d.attribute) d.attribute = 'strength';
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.player.weaponSta === undefined) d.player.weaponSta = 2;
  if (d.player.weaponEnd === undefined) d.player.weaponEnd = 0;
  if (!d.enemy) d.enemy = { name: '', value: 0, sta: 0, staMax: 0, end: 0, endMax: 0, weaponSta: 2, weaponEnd: 0 };
  if (d.enemy.weaponSta === undefined) d.enemy.weaponSta = 2;
  if (d.enemy.weaponEnd === undefined) d.enemy.weaponEnd = 0;
  if (d.enemy.end === undefined) d.enemy.end = 0;
  if (d.enemy.endMax === undefined) d.enemy.endMax = 0;
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _enemyDefeated, _hasEnemy, _notReady, _playerDefeated } = getContext();
 return _notReady(d) || _playerDefeated(d) || (_hasEnemy(d) && _enemyDefeated(d)); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _battleOver, _recordOutcome };
}

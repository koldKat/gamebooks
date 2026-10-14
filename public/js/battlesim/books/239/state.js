// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim239) {
    pt.sim239 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        yourDamage: 2,
        enemyDamage: 2,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      secondEnemy: { active: false, name: '', skill: 0, stamina: 0, staminaMax: 0, target: 'enemy' },
      rolled: false,
      correctedCombatRules: true,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim239;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.yourDamage === undefined) d.player.yourDamage = 2;
  if (d.player.enemyDamage === undefined) d.player.enemyDamage = 2;
  if (!d.secondEnemy) d.secondEnemy = { active: false, name: '', skill: 0, stamina: 0, staminaMax: 0, target: 'enemy' };
  if (d.secondEnemy.target === undefined) d.secondEnemy.target = 'enemy';
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName, _secondName } = getContext();

  d.history.push({
    enemy: d.secondEnemy.active ? `${_enemyName(d)} & ${_secondName(d)}` : _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

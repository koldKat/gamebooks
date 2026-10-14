// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim734) {
    pt.sim734 = {
      combatRulesVersion: 2,
      mode: 'personal',
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        armour: 0, armourInitial: 0,
        robotCombatBonus: 0, robotSpeed: 1,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        hitsLandedThisFight: 0,
      },
      enemy: { name: '', skill: 0, life: 0, lifeMax: 0, speed: 1 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, lifeMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim734;
  if (!d.mode) d.mode = 'personal';
  if (d.player.armour === undefined) d.player.armour = 0;
  if (d.player.armourInitial === undefined) d.player.armourInitial = 0;
  if (d.player.robotCombatBonus === undefined) d.player.robotCombatBonus = 0;
  if (d.player.robotSpeed === undefined) d.player.robotSpeed = 1;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (!d.enemy) d.enemy = { name: '', skill: 0, life: 0, lifeMax: 0, speed: 1 };
  if (d.enemy.speed === undefined) d.enemy.speed = 1;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _activeLife, _activeLifeInitial, _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome, mode: d.mode,
    playerLife: _activeLife(d), playerLifeMax: _activeLifeInitial(d),
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim204) {
    pt.sim204 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        hasRangerHelmet: false,
        hasGiftSword: false,
        hasJaggedSword: false,
        hasHealingPowder: false,
        healingPowderUsed: false,
        hasMistressPotion: false,
        mistressPotionUsed: false,
        mistressPotionScore: 'stamina',
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, staminaMax: 0 },
      tripleFight: false,
      sideEnemy2: { name: '', skill: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim204;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.hasRangerHelmet === undefined) d.player.hasRangerHelmet = false;
  if (d.player.hasGiftSword === undefined) d.player.hasGiftSword = false;
  if (d.player.hasJaggedSword === undefined) d.player.hasJaggedSword = false;
  if (d.player.hasHealingPowder === undefined) d.player.hasHealingPowder = false;
  if (d.player.healingPowderUsed === undefined) d.player.healingPowderUsed = false;
  if (d.player.hasMistressPotion === undefined) d.player.hasMistressPotion = false;
  if (d.player.mistressPotionUsed === undefined) d.player.mistressPotionUsed = false;
  if (d.player.mistressPotionScore === undefined) d.player.mistressPotionScore = 'stamina';
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  if (d.tripleFight === undefined) d.tripleFight = false;
  if (!d.sideEnemy2) d.sideEnemy2 = { name: '', skill: 0, staminaMax: 0 };
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

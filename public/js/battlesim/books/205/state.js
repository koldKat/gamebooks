// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { MAX_PROVISIONS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim205) {
    pt.sim205 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        bansheeFearCheck: false,
        iceDemonGas: false,
        whiteDragonBreath: false,
        hasGoldRing: false,
        hasSwordOfSpeed: false,
        hasTrollSword: false,
        hasCopperArmband: false,
        hasAmuletOfCourage: false,
        hasHornedHelmet: false,
        hasShield: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim205;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.bansheeFearCheck === undefined) d.player.bansheeFearCheck = false;
  if (d.player.iceDemonGas === undefined) d.player.iceDemonGas = false;
  if (d.player.whiteDragonBreath === undefined) d.player.whiteDragonBreath = false;
  if (d.player.hasGoldRing === undefined) d.player.hasGoldRing = false;
  if (d.player.hasSwordOfSpeed === undefined) d.player.hasSwordOfSpeed = false;
  if (d.player.hasTrollSword === undefined) d.player.hasTrollSword = false;
  if (d.player.hasCopperArmband === undefined) d.player.hasCopperArmband = false;
  if (d.player.hasAmuletOfCourage === undefined) d.player.hasAmuletOfCourage = false;
  if (d.player.hasHornedHelmet === undefined) d.player.hasHornedHelmet = false;
  if (d.player.hasShield === undefined) d.player.hasShield = false;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
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

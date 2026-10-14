// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { MAX_PROVISIONS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim201) {
    pt.sim201 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        lizardineBreath: false,
        hasHealingBrooch: false,
        hasChainmail: false,
        hasMagicShield: false,
        hasUnicornShield: false,
        hasMagicHelmet: false,
        hasCursedShield: false,
        hasCursedBrooch: false,
        hasElvenBoots: false,
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
  const d = pt.sim201;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.lizardineBreath === undefined) d.player.lizardineBreath = false;
  if (d.player.hasHealingBrooch === undefined) d.player.hasHealingBrooch = false;
  if (d.player.hasChainmail === undefined) d.player.hasChainmail = false;
  if (d.player.hasMagicShield === undefined) d.player.hasMagicShield = false;
  if (d.player.hasUnicornShield === undefined) d.player.hasUnicornShield = false;
  if (d.player.hasMagicHelmet === undefined) d.player.hasMagicHelmet = false;
  if (d.player.hasCursedShield === undefined) d.player.hasCursedShield = false;
  if (d.player.hasCursedBrooch === undefined) d.player.hasCursedBrooch = false;
  if (d.player.hasElvenBoots === undefined) d.player.hasElvenBoots = false;
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
  const { HEALING_BROOCH_HEAL, _appendLog, _enemyName, t } = getContext();

  // Healing Brooch (sec 13/132) restores 1 STAMINA after survival, never after defeat.
  if (d.player.hasHealingBrooch && d.player.stamina > 0) {
    const before = d.player.stamina;
    d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + HEALING_BROOCH_HEAL);
    if (d.player.stamina !== before) _appendLog(d, t('battlesim201.log.brooch_heal', { n: HEALING_BROOCH_HEAL, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  }
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

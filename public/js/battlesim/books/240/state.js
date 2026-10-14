// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { MAX_PROVISIONS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim240) {
    pt.sim240 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        provisionsLeft: 0,
        weapon: 'sword', armour: 'none', armourHitsLeft: 0,
        hasSpear: false, spearLifeForce: 0, spearRolled: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      correctedCombatRules: true,
      groupFight: false,
      sideEnemies: [],
      disarmMode: false,
      immuneToWounds: false,
      voivodThrives: false,
      voivodDefensive: false,
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim240;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.weapon === undefined) d.player.weapon = 'sword';
  if (d.player.armour === undefined) d.player.armour = 'none';
  if (d.player.armourHitsLeft === undefined) d.player.armourHitsLeft = 0;
  if (d.player.hasSpear === undefined) d.player.hasSpear = false;
  if (d.player.spearLifeForce === undefined) d.player.spearLifeForce = 0;
  if (d.player.spearRolled === undefined) d.player.spearRolled = false;
  if (d.groupFight === undefined) d.groupFight = false;
  if (!Array.isArray(d.sideEnemies)) d.sideEnemies = [];
  if (d.disarmMode === undefined) d.disarmMode = false;
  if (d.immuneToWounds === undefined) d.immuneToWounds = false;
  if (d.voivodThrives === undefined) d.voivodThrives = false;
  if (d.voivodDefensive === undefined) d.voivodDefensive = false;
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

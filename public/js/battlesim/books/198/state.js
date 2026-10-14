// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { MAX_PROVISIONS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim198) {
    pt.sim198 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 2,
        provisionsLeft: MAX_PROVISIONS,
        hasMagicSword: false, hasRiverSword: false, hasMagicHelmet: false,
        invisibilityHave: false, invisibilityUsed: false, invisibilityActive: false,
        holyWaterHave: false, holyWaterUsed: false,
        rumHave: false, rumUsed: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuck: null, // 'player-hit' | 'enemy-hit' | null - set right after a round lands a hit
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim198;
  if (d.rolled === undefined) d.rolled = false;
  if (d.pendingLuck === undefined) d.pendingLuck = null;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 2;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.hasMagicSword === undefined) d.player.hasMagicSword = false;
  if (d.player.hasRiverSword === undefined) d.player.hasRiverSword = false;
  if (d.player.hasMagicHelmet === undefined) d.player.hasMagicHelmet = false;
  if (d.player.invisibilityHave === undefined) d.player.invisibilityHave = false;
  if (d.player.invisibilityUsed === undefined) d.player.invisibilityUsed = false;
  if (d.player.invisibilityActive === undefined) d.player.invisibilityActive = false;
  if (d.player.holyWaterHave === undefined) d.player.holyWaterHave = false;
  if (d.player.holyWaterUsed === undefined) d.player.holyWaterUsed = false;
  if (d.player.rumHave === undefined) d.player.rumHave = false;
  if (d.player.rumUsed === undefined) d.player.rumUsed = false;
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
  // Clear invisibility on victory; retain it after loss so Reset retries the same encounter.
  if (outcome === 'win') d.player.invisibilityActive = false;
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim206) {
    pt.sim206 = {
      player: {
        skill: 0, skillInitial: 0, skillStarting: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        fear: 0, fearMax: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        fireSpriteWound: false,
        ghoulWoundCounter: false,
        woundEventsThisFight: 0,
        hasWoodenBranch: false,
        hasLetterOpener: false,
        hasMeatKnife: false,
        hasSilverDagger: false,
        hasKrisKnife: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim206;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.skillStarting === undefined) d.player.skillStarting = 0;
  if (d.player.fear === undefined) d.player.fear = 0;
  if (d.player.fearMax === undefined) d.player.fearMax = 0;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.fireSpriteWound === undefined) d.player.fireSpriteWound = false;
  if (d.player.ghoulWoundCounter === undefined) d.player.ghoulWoundCounter = false;
  if (d.player.woundEventsThisFight === undefined) d.player.woundEventsThisFight = 0;
  if (d.player.hasWoodenBranch === undefined) d.player.hasWoodenBranch = false;
  if (d.player.hasLetterOpener === undefined) d.player.hasLetterOpener = false;
  if (d.player.hasMeatKnife === undefined) d.player.hasMeatKnife = false;
  if (d.player.hasSilverDagger === undefined) d.player.hasSilverDagger = false;
  if (d.player.hasKrisKnife === undefined) d.player.hasKrisKnife = false;
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

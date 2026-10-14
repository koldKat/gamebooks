// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim236) {
    pt.sim236 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        thickArmour: false,
        demonSlayingSword: false,
        myurrFight: false,
        heroismUsedThisFight: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      temporaryHeroism: true,
      heroismSkillBonus: 0,
      consecutiveServantHits: true,
      lastServantHit: null,
      log: [],
      history: [],
    };
  }
  const d = pt.sim236;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.thickArmour === undefined) d.player.thickArmour = false;
  if (d.player.demonSlayingSword === undefined) d.player.demonSlayingSword = false;
  if (d.player.myurrFight === undefined) d.player.myurrFight = false;
  if (d.player.heroismUsedThisFight === undefined) d.player.heroismUsedThisFight = false;
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

  if (d.temporaryHeroism) d.heroismSkillBonus = 0;
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

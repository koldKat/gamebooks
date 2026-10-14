// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { SPELLS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim199) {
    pt.sim199 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        magic: 0, magicInitial: 0,
        spells: Object.fromEntries(SPELLS.map(([key]) => [key, { have: 0, used: 0 }])),
        hasSunSword: false, hasEnchantedSword: false,
        magikHave: false, magikUsed: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuck: null, // 'player-hit' | 'enemy-hit' | null - set right after a round lands a hit
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim199;
  if (d.rolled === undefined) d.rolled = false;
  if (d.pendingLuck === undefined) d.pendingLuck = null;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.magic === undefined) d.player.magic = 0;
  if (d.player.magicInitial === undefined) d.player.magicInitial = 0;
  if (!d.player.spells) d.player.spells = {};
  for (const [key] of SPELLS) {
    if (!d.player.spells[key]) d.player.spells[key] = { have: 0, used: 0 };
    if (d.player.spells[key].have === undefined) d.player.spells[key].have = 0;
    if (d.player.spells[key].used === undefined) d.player.spells[key].used = 0;
  }
  if (d.player.hasSunSword === undefined) d.player.hasSunSword = false;
  if (d.player.hasEnchantedSword === undefined) d.player.hasEnchantedSword = false;
  if (d.player.magikHave === undefined) d.player.magikHave = false;
  if (d.player.magikUsed === undefined) d.player.magikUsed = 0;
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

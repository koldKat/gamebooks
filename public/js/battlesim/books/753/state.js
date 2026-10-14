// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough, tetivaEncounter } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim753) {
    pt.sim753 = {
      player: { attack: 0, defense: 0, damage: 0 },
      enemy: { name: '', attack: 0, defense: 0, hitsNeeded: 1, hitsLanded: 0, strikesPerRound: 1 },
      kobaldiMode: false,
      printedRules: 1,
      encounterSection: 0,
      combatEffects: tetivaEncounter(0),
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim753;
  if (!d.player) d.player = { attack: 0, defense: 0, damage: 0 };
  if (d.player.damage === undefined) d.player.damage = 0;
  if (!d.enemy) d.enemy = { name: '', attack: 0, defense: 0, hitsNeeded: 1, hitsLanded: 0, strikesPerRound: 1 };
  if (d.enemy.hitsNeeded === undefined) d.enemy.hitsNeeded = 1;
  if (d.enemy.hitsLanded === undefined) d.enemy.hitsLanded = 0;
  if (d.enemy.strikesPerRound === undefined) d.enemy.strikesPerRound = 1;
  if (d.kobaldiMode === undefined) d.kobaldiMode = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _playerLost, _playerWon } = getContext();
 return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  const { DAMAGE_CAP, _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerDamage: d.player.damage, damageCap: DAMAGE_CAP,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

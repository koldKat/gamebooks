// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _emptyEnemy, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim414) {
    pt.sim414 = {
      player: { skill: 10, endurance: 50, enduranceInitial: 50, unarmed: false },
      enemy: _emptyEnemy(),
      log: [],
      history: [],
      printedCombatRules: 1,
      chanceRollRange: 12,
    };
  }
  const d = pt.sim414;
  const p = d.player;
  if (p.skill === undefined) p.skill = 10;
  if (p.endurance === undefined) p.endurance = 50;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 50;
  if (p.unarmed === undefined) p.unarmed = false;
  if (!d.enemy) d.enemy = _emptyEnemy();
  const e = d.enemy;
  if (e.skill === undefined) e.skill = 0;
  if (e.unarmed === undefined) e.unarmed = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
 return d.player.endurance <= 0 || (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

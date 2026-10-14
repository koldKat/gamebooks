// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim716) {
    pt.sim716 = {
      player: {
        sila: 8, barzina: 8, lovkost: 8, reflekt: 4, bm: 2,
        atakaStat: 'barzina',
        izdr: 36, izdrMax: 36,
      },
      enemy: { name: '', ataka: 0, zashtita: 0, bm: 1, izdr: 10, izdrMax: 10, nonlethal: true },
      roundsThisBattle: 0,
      combatRulesVersion: 2,
      battleOutcome: null,
      log: [],
      history: [],
    };
  }
  const d = pt.sim716;
  if (!d.player) d.player = { sila: 8, barzina: 8, lovkost: 8, reflekt: 4, bm: 2, atakaStat: 'barzina', izdr: 36, izdrMax: 36 };
  if (!d.enemy) d.enemy = { name: '', ataka: 0, zashtita: 0, bm: 1, izdr: 10, izdrMax: 10, nonlethal: true };
  if (d.enemy.nonlethal === undefined) d.enemy.nonlethal = d.enemy.izdrMax <= 10;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

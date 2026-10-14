// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim82) {
    pt.sim82 = {
      life: 50, lifeInitial: 50,
      skill: 'unarmed',
      enemy: { name: '', strength: 0, hp: 0, hpMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim82;
  if (d.life === undefined) d.life = 50;
  if (d.lifeInitial === undefined) d.lifeInitial = 50;
  if (!d.skill) d.skill = 'unarmed';
  if (!d.enemy) d.enemy = { name: '', strength: 0, hp: 0, hpMax: 0 };
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

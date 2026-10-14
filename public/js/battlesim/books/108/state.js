// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim108) {
    pt.sim108 = {
      skills: { rk: 0, kinj: 0, mech: 0 },
      life: 30, lifeInitial: 30,
      weapon: 'mech',
      enemy: { name: '', skill: 0, life: 0, lifeMax: 0, tier: 2 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim108;
  if (!d.skills) d.skills = { rk: 0, kinj: 0, mech: 0 };
  if (d.life === undefined) d.life = 30;
  if (d.lifeInitial === undefined) d.lifeInitial = 30;
  if (!d.weapon) d.weapon = 'mech';
  if (!d.enemy) d.enemy = { name: '', skill: 0, life: 0, lifeMax: 0, tier: 2 };
  if (d.enemy.tier === undefined) d.enemy.tier = 2;
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

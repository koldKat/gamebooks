// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim92) {
    pt.sim92 = {
      strength: 0, strengthInitial: 0,
      life: 0, lifeInitial: 0,
      rolled: false,
      ratio: 0,
      enemy: { name: '', strength: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim92;
  if (d.strength === undefined) d.strength = 0;
  if (d.strengthInitial === undefined) d.strengthInitial = 0;
  if (d.life === undefined) d.life = 0;
  if (d.lifeInitial === undefined) d.lifeInitial = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (d.ratio === undefined) d.ratio = 0;
  if (!d.enemy) d.enemy = { name: '', strength: 0, life: 0, lifeMax: 0 };
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

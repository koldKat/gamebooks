// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim83) {
    pt.sim83 = {
      strength: 5, strengthInitial: 5,
      weapon: 0,
      endurance: 50, enduranceInitial: 50,
      enemy: { name: '', attack: 0, defense: 0, endurance: 0, enduranceMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim83;
  if (d.strength === undefined) d.strength = 5;
  if (d.strengthInitial === undefined) d.strengthInitial = 5;
  if (d.weapon === undefined) d.weapon = 0;
  if (d.endurance === undefined) d.endurance = 50;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 50;
  if (!d.enemy) d.enemy = { name: '', attack: 0, defense: 0, endurance: 0, enduranceMax: 0 };
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

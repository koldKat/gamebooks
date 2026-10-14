// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim122) {
    pt.sim122 = {
      battleCode: 0, battleCodeInitial: 0,
      endurance: 0, enduranceInitial: 0,
      system: 2,
      enemy: { name: '', battleQualities: 0, endurance: 0, enduranceMax: 0, threshold: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim122;
  if (d.battleCode === undefined) d.battleCode = 0;
  if (d.battleCodeInitial === undefined) d.battleCodeInitial = 0;
  if (d.endurance === undefined) d.endurance = 0;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 0;
  if (d.system === undefined) d.system = 2;
  if (!d.enemy) d.enemy = { name: '', battleQualities: 0, endurance: 0, enduranceMax: 0, threshold: 0 };
  if (d.enemy.threshold === undefined) d.enemy.threshold = 0;
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

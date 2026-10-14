// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim661) {
    pt.sim661 = {
      player: {
        sila: 0, lovkost: 0, barzina: 0, umenie: 0,
        formType: 'rock', formSila: 0, formLovkost: 0, formBarzina: 0,
      },
      enemy: {
        name: '', sila: 0, lovkost: 0, barzina: 0, umenie: 0,
        formType: 'rock', formSila: 0, formLovkost: 0, formBarzina: 0,
      },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim661;
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

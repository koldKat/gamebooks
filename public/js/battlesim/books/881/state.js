// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim881) {
    pt.sim881 = {
      encounterId: 'guard_unarmed',
      swordId: 'firfeld',
      player: { sila: 5, izd: 30 },
      log: [],
      history: [],
    };
  }
  return pt.sim881;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 300) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _encounter, t } = getContext();

  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

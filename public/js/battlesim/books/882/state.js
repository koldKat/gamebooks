// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { PLAYER_DEFAULTS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim882) {
    pt.sim882 = {
      encounterId: 'rosario',
      player: { ...PLAYER_DEFAULTS },
      log: [],
      history: [],
    };
  }
  return pt.sim882;
}

function _appendLog(d, line) {

  d.log ||= [];
  d.log.push(line);
  if (d.log.length > 400) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _encounter, t } = getContext();

  d.history ||= [];
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

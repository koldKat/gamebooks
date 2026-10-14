// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim877) {
    pt.sim877 = {
      encounterId: 'robotrak',
      player: { sila: 8, zhivot: 15, esper: 10 },
      log: [],
      history: [],
    };
  }
  const d = pt.sim877;
  if (!d.encounterId) d.encounterId = 'robotrak';
  if (!d.player) d.player = { sila: 8, zhivot: 15, esper: 10 };
  if (typeof d.player.sila !== 'number') d.player.sila = 8;
  if (typeof d.player.zhivot !== 'number') d.player.zhivot = 15;
  if (typeof d.player.esper !== 'number') d.player.esper = 10;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _encounter, t } = getContext();

  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

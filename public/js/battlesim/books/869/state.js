// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _freshEntity, _rival, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim869) {
    pt.sim869 = { rivalId: 'dalgren', player: null, opp: null, phase: 1, turn: 'opp', pendingDefense: null, special: null, over: false, winner: null, started: false, log: [], history: [] };
  }
  const d = pt.sim869;
  if (!d.rivalId) d.rivalId = 'dalgren';
  if (!d.player) d.player = _freshEntity({ s: 12, e: 15, m: 2, b: 12, sword: 3, shield: 'none' });
  if (!d.opp) d.opp = _freshEntity(_rival(d.rivalId));
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (!d.phase) d.phase = 1;
  if (!d.turn) d.turn = 'opp';
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  return d;
}

function _appendLog(d, line) {
 d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _recordOutcome(d, outcome) {
 d.history.push({ enemyId: d.rivalId, outcome, ts: Date.now() }); }
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}

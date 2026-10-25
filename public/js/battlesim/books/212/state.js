// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim212) {
    pt.sim212 = {
      rolled: false,
      player: { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, luck: 0, luckInitial: 0, gold: 20, hasStaff: false },
      crew:   { strike: 0, strikeInitial: 0, strength: 0, strengthInitial: 0 },
      mode: 'person',
      enemyPerson: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyCrew:   { name: '', strike: 0, strength: 0, strengthMax: 0 },
      roundsPerson: 0,
      roundsCrew: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim212;
  // Defaults for anyone whose save predates a field added later.
  if (d.player.gold === undefined) d.player.gold = 20;
  if (d.player.hasStaff === undefined) d.player.hasStaff = false;
  if (!d.mode) d.mode = 'person';
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, msg) {

  d.log.push(msg);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, side, outcome) {
  const { MODES, _foeName, _selfMaxHp, t } = getContext();

  d.history.push({
    enemy: `${_foeName(d)} (${t(MODES.find(m => m[0] === d.mode)[1])})`,
    outcome,
    statLabel: side.label,
    statValue: side.self[side.selfHp], statMax: _selfMaxHp(d, side),
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}

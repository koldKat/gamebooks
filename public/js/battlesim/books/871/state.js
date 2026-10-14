// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _rival, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim871) {
    pt.sim871 = {
      enemyId: 'bandit', playerTarget: 6, playerStamina: 25, enemyTarget: 8, enemyStamina: 10,
      multi: false, playerBonus: 0, enemyPenalty: 0, over: false, winner: null, started: false, log: [], history: [],
    };
  }
  const d = pt.sim871;
  if (!d.enemyId) d.enemyId = 'bandit';
  if (typeof d.playerTarget !== 'number') d.playerTarget = 6;
  if (typeof d.playerStamina !== 'number') d.playerStamina = 25;
  if (typeof d.enemyTarget !== 'number') d.enemyTarget = _rival(d.enemyId).target;
  if (typeof d.enemyStamina !== 'number') d.enemyStamina = _rival(d.enemyId).stamina;
  if (typeof d.multi !== 'boolean') d.multi = !!_rival(d.enemyId).multi;
  if (typeof d.playerBonus !== 'number') d.playerBonus = 0;
  if (typeof d.enemyPenalty !== 'number') d.enemyPenalty = 0;
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
 d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _battleOver(d) {
  const { _enemyDead, _playerDead } = getContext();
 return _playerDead(d) || _enemyDead(d); }

function _recordOutcome(d, outcome) {
 d.history.push({ enemyId: d.enemyId, outcome, ts: Date.now() }); }
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

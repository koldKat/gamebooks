// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { PLAYER_STAT_KEYS, _defaultPlayerStats, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim772) {
    pt.sim772 = {
      enemyId: 'li_xiao',
      rulesVersion: 2,
      player: _defaultPlayerStats(),
      started: false,
      roundIdx: 0,          // rounds fought so far (for enemy pattern index)
      playerPassiveUsed: false,
      playerResults: [],    // array of 'win' | 'loss' | 'draw', most recent last
      enemyResults: [],
      log: [],
      history: [],
    };
  }
  const d = pt.sim772;
  if (!d.enemyId) d.enemyId = 'li_xiao';
  if (!d.player) d.player = _defaultPlayerStats();
  PLAYER_STAT_KEYS.forEach(([k]) => { if (typeof d.player[k] !== 'number') d.player[k] = 0; });
  if (d.started === undefined) d.started = false;
  if (typeof d.roundIdx !== 'number') d.roundIdx = 0;
  if (d.playerPassiveUsed === undefined) d.playerPassiveUsed = false;
  if (!d.playerResults) d.playerResults = [];
  if (!d.enemyResults) d.enemyResults = [];
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _playerLost, _playerWon } = getContext();
 return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

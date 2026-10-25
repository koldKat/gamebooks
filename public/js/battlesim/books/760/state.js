// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _fighter, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim760) {
    const player = _fighter('chameleon'), enemy = _fighter('666');
    pt.sim760 = {
      playerId: 'chameleon',
      enemyId: '666',
      player: { attack: player.attack, defense: player.defense, interactive: player.interactive, life: player.life },
      enemy:  { attack: enemy.attack, defense: enemy.defense, interactive: enemy.interactive, life: enemy.life },
      turn: null,        // 'player' | 'enemy' - whose turn is next
      started: false,
      log: [],
      history: [],
    };
  }
  const d = pt.sim760;
  if (!d.playerId) d.playerId = 'chameleon';
  if (!d.enemyId) d.enemyId = '666';
  if (!d.player) d.player = { ..._fighter(d.playerId) };
  if (!d.enemy) d.enemy = { ..._fighter(d.enemyId) };
  if (d.turn === undefined) d.turn = null;
  if (d.started === undefined) d.started = false;
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
  const { _enemyName, _playerName } = getContext();

  d.history.push({
    player: _playerName(d), enemy: _enemyName(d), outcome,
    playerLife: d.player.life, enemyLife: d.enemy.life,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}

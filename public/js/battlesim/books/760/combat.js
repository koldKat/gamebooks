// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _fighter(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(f => f.id === id) || ROSTER[0]; }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _playerName(d) {
  const { _fighter } = getContext();
 return _fighter(d.playerId).name; }

function _enemyName(d) {
  const { _fighter } = getContext();
 return _fighter(d.enemyId).name; }

function _playerWon(d) {
 return d.enemy.life <= 0; }

function _playerLost(d) {
 return d.player.life <= 0; }

function _startBattle(d) {
  const { _appendLog, _battleOver, _enemyName, _playerName, _roll1d6, _strike, t } = getContext();

  const pChance = _roll1d6();
  const eChance = _roll1d6();
  const pInit = d.player.interactive + pChance;
  const eInit = d.enemy.interactive + eChance;
  d.started = true;
  if (pInit >= eInit) {
    d.turn = 'player';
    _appendLog(d, t('battlesim760.log.initiative', { name: _playerName(d), score: pInit, oname: _enemyName(d), oscore: eInit }));
    if (pInit - eInit >= 3) {
      _appendLog(d, t('battlesim760.log.double_hit', { name: _playerName(d) }));
      _strike(d, 'player');
      if (!_battleOver(d)) _strike(d, 'player');
      if (!_battleOver(d)) d.turn = 'enemy';
    }
  } else {
    d.turn = 'enemy';
    _appendLog(d, t('battlesim760.log.initiative', { name: _enemyName(d), score: eInit, oname: _playerName(d), oscore: pInit }));
    if (eInit - pInit >= 3) {
      _appendLog(d, t('battlesim760.log.double_hit', { name: _enemyName(d) }));
      _strike(d, 'enemy');
      if (!_battleOver(d)) _strike(d, 'enemy');
      if (!_battleOver(d)) d.turn = 'player';
    }
  }
}

function _strike(d, who) {
  const { _appendLog, _enemyName, _playerName, _roll1d6, t } = getContext();

  const attacker = who === 'player' ? d.player : d.enemy;
  const defender = who === 'player' ? d.enemy  : d.player;
  const attackerName = who === 'player' ? _playerName(d) : _enemyName(d);
  const defenderName = who === 'player' ? _enemyName(d)  : _playerName(d);
  const chance = _roll1d6();
  const hitPower = attacker.attack + chance;
  const dmg = Math.max(0, hitPower - defender.defense);
  defender.life = Math.max(0, defender.life - dmg);
  if (dmg > 0) {
    _appendLog(d, t('battlesim760.log.hit', { attacker: attackerName, hitPower, defender: defenderName, dmg, life: defender.life }));
  } else {
    _appendLog(d, t('battlesim760.log.miss', { attacker: attackerName, hitPower, defender: defenderName }));
  }
}

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _data, _enemyName, _playerLost, _playerName, _playerWon, _recordOutcome, _renderAll, _startBattle, _strike, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;

  if (!d.started) {
    _startBattle(d);
  } else {
    _strike(d, d.turn);
    if (!_battleOver(d)) d.turn = d.turn === 'player' ? 'enemy' : 'player';
  }

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim760.log.defeated', { trophy: SVG_TROPHY, name: _playerName(d), enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim760.log.fallen', { skull: SVG_SKULL, name: _playerName(d), enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyName, _fighter, _playerName, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.player = { ..._fighter(d.playerId) };
  d.enemy = { ..._fighter(d.enemyId) };
  d.turn = null;
  d.started = false;
  if (d.log.length) _appendLog(d, t('battlesim760.log.reset_sep'));
  _appendLog(d, t('battlesim760.log.reset', { name: _playerName(d), enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickPlayer(id) {
  const { ROSTER, _data, _resetBattle } = getContext();

  const d = _data();
  if (!d) return;
  d.playerId = id;
  if (d.enemyId === id) d.enemyId = ROSTER.find(f => f.id !== id)?.id || '666';
  _resetBattle();
}

function _pickEnemy(id) {
  const { ROSTER, _data, _resetBattle } = getContext();

  const d = _data();
  if (!d) return;
  d.enemyId = id;
  if (d.playerId === id) d.playerId = ROSTER.find(f => f.id !== id)?.id || 'chameleon';
  _resetBattle();
}




// END EXTRACTED RULES
  return { _fighter, _roll1d6, _playerName, _enemyName, _playerWon, _playerLost, _startBattle, _strike, _runRound, _resetBattle, _pickPlayer, _pickEnemy };
}

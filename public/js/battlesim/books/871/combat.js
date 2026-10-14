// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rival(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(r => r.id === id) || ROSTER[0]; }

function _rivalNameById(id) {
  const { _rival, t } = getContext();
 return t(_rival(id).nameKey); }

function _d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _d2() {
  const { _d6 } = getContext();
 return _d6() + _d6(); }

function _enemyName(d) {
  const { _rivalNameById } = getContext();
 return _rivalNameById(d.enemyId); }

function _playerDead(d) {
 return d.playerStamina <= 0; }

function _enemyDead(d) {
 return d.enemyStamina <= 0; }

function _checkEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyDead, _enemyName, _playerDead, _recordOutcome, t } = getContext();

  if (_enemyDead(d)) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim871.log.defeated', { trophy: SVG_TROPHY, name: _enemyName(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (_playerDead(d)) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim871.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _round() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _checkEnd, _d2, _data, _enemyDead, _enemyName, _recordOutcome, _renderAll, ringlasRound, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over) return;
  if (d.rulesVersion === 1) {
    if (!d.started || d.pausedSection) return;
    const events = ringlasRound(d, _d2);
    const lines = events.map(event => {
      const key = event.actor === 'horse' ? 'horse_' : event.actor === 'ally' ? 'ally_' : event.actor === 'allyEnemy' ? 'ally_enemy_' : event.actor + '_';
      return t('battlesim871.log.' + key + (event.hit ? 'hit' : 'miss'), event);
    });
    if (lines.length) _appendLog(d, lines.join(' '));
    if (d.over) {
      _appendLog(d, d.winner === 'player' ? t('battlesim871.log.defeated', { trophy: SVG_TROPHY, name: _enemyName(d) }) : t('battlesim871.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, d.winner === 'player' ? 'win' : 'loss');
    } else if (d.pausedSection) {
      _appendLog(d, t('battlesim871.status.paused', { section: d.pausedSection }));
    }
    saveState();
    _renderAll();
    return;
  }
  d.started = true;
  let msg = '';

  const playerRoll = _d2() + d.playerBonus;
  if (playerRoll > d.enemyTarget) {
    d.enemyStamina = Math.max(0, d.enemyStamina - 1);
    msg += t('battlesim871.log.player_hit', { roll: playerRoll, target: d.enemyTarget, stamina: d.enemyStamina });
  } else {
    msg += t('battlesim871.log.player_miss', { roll: playerRoll, target: d.enemyTarget });
  }

  if (d.multi && !_enemyDead(d)) {
    const horseRoll = _d2();
    if (horseRoll < d.enemyTarget) {
      d.enemyStamina = Math.max(0, d.enemyStamina - 2);
      msg += ' ' + t('battlesim871.log.horse_hit', { roll: horseRoll, stamina: d.enemyStamina });
    }
  }

  if (!_enemyDead(d)) {
    const enemyRoll = _d2() - d.enemyPenalty;
    if (enemyRoll < d.playerTarget) {
      d.playerStamina = Math.max(0, d.playerStamina - 1);
      msg += ' ' + t('battlesim871.log.enemy_hit', { roll: enemyRoll, target: d.playerTarget, stamina: d.playerStamina });
    } else {
      msg += ' ' + t('battlesim871.log.enemy_miss', { roll: enemyRoll, target: d.playerTarget });
    }
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _startBattle() {
  const { _appendLog, _data, _enemyName, _renderAll, _rival, saveState, startRinglasFight, t } = getContext();

  const d = _data();
  if (!d) return;
  const r = _rival(d.enemyId);
  if (!startRinglasFight(d, d.enemySetup || r)) {
    saveState();
    _renderAll();
    return;
  }
  if (d.log.length) _appendLog(d, t('battlesim871.log.reset_sep'));
  _appendLog(d, t('battlesim871.log.start', { name: _enemyName(d) }));
  if (d.fightMulti || r.playerBonus && d.simautBonus !== false) _appendLog(d, t('battlesim871.log.player_bonus', { n: 5 }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const { _data, _renderAll, _rival, saveState } = getContext();

  const d = _data();
  if (!d) return;
  d.enemyId = id;
  const r = _rival(id);
  d.enemyTarget = r.target;
  d.enemyStamina = r.stamina;
  d.multi = !!r.multi;
  d.enemySetup = { target: r.target, stamina: r.stamina, multi: !!r.multi };
  d.started = false;
  d.over = false;
  d.winner = null;
  d.pausedSection = null;
  saveState();
  _renderAll();
}




// END EXTRACTED RULES
  return { _rival, _rivalNameById, _d6, _d2, _enemyName, _playerDead, _enemyDead, _checkEnd, _round, _startBattle, _pickEnemy };
}

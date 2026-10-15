// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _statusOf(life) {
  const { UNCONSCIOUS_AT } = getContext();

  if (life <= 0) return 'dead';
  if (life <= UNCONSCIOUS_AT) return 'unconscious';
  return 'ok';
}

function _resolveAttack(roll, hitReq, damageBonus, targetArmour) {

  if (roll < hitReq) return 0;
  return Math.max(0, roll - 6 + damageBonus - targetArmour);
}

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _renderAll, _resolveAttack, _roll2d6, _statusOf, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.rolled) return;
  if (_statusOf(d.life) !== 'ok' || _statusOf(d.enemy.life) !== 'ok') return;
  d.roundsThisBattle++;

  const playerRoll = _roll2d6();
  const playerDmg = _resolveAttack(playerRoll, d.hitReq, d.damageBonus, d.enemy.armour);
  if (playerDmg > 0) {
    d.enemy.life = Math.max(0, d.enemy.life - playerDmg);
    _appendLog(d, t('battlesim526.log.you_hit', { roll: playerRoll, enemy: _enemyNameSafe(d), n: playerDmg, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else {
    _appendLog(d, t('battlesim526.log.you_miss', { roll: playerRoll }));
  }

  if (_statusOf(d.enemy.life) === 'ok') {
    const enemyRoll = _roll2d6();
    const enemyDmg = _resolveAttack(enemyRoll, d.enemy.hitReq, d.enemy.damageBonus, d.armour);
    if (enemyDmg > 0) {
      d.life = Math.max(0, d.life - enemyDmg);
      _appendLog(d, t('battlesim526.log.enemy_hits', { roll: enemyRoll, enemy: _enemyNameSafe(d), n: enemyDmg, life: d.life, lifeMax: d.lifeInitial }));
    } else {
      _appendLog(d, t('battlesim526.log.enemy_miss', { enemy: _enemyNameSafe(d), roll: enemyRoll }));
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _statusOf, t } = getContext();

  const enemyStatus = _statusOf(d.enemy.life);
  const playerStatus = _statusOf(d.life);
  if (enemyStatus === 'dead') {
    _appendLog(d, t('battlesim526.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (enemyStatus === 'unconscious') {
    _appendLog(d, t('battlesim526.log.enemy_unconscious', { enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (playerStatus === 'dead') {
    _appendLog(d, t('battlesim526.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (playerStatus === 'unconscious') {
    _appendLog(d, t('battlesim526.log.you_unconscious'));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim526.log.reset_sep'));
  _appendLog(d, t('battlesim526.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _enemyName, _enemyNameSafe, _statusOf, _resolveAttack, _runRound, _checkBattleEnd, _resetBattle };
}

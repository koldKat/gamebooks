// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _conflictTarget(attacker, defender) {

  const raw = 7 + attacker - defender - (attacker > defender ? 1 : 0);
  if (raw < 2) return '-';
  if (raw > 11) return 'A';
  return raw;
}

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _roll2d6pair() {
  const { _roll1d6 } = getContext();
 return [_roll1d6(), _roll1d6()]; }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _playerAttr(d) {
 return d.player[d.attribute]; }

function _enemyDefeated(d) {

  if (d.combatRulesVersion === 2) {
    return (d.enemy.staMax > 0 && d.enemy.sta <= 0) || (d.enemy.endMax > 0 && d.enemy.end <= 0);
  }
  return (d.enemy.staMax > 0 || d.enemy.endMax > 0) && (d.enemy.sta <= 0 || d.enemy.end <= 0);
}

function _playerDefeated(d) {
 return d.rolled && (d.player.stamina <= 0 || d.player.endurance <= 0); }

function _hasEnemy(d) {
 return d.enemy.staMax > 0 || d.enemy.endMax > 0; }

function _applyDamage(target, staKey, staMaxKey, endKey, endMaxKey, staDmg, endDmg, doubled) {

  const mult = doubled ? 2 : 1;
  if (staDmg) target[staKey] = Math.max(0, target[staKey] - staDmg * mult);
  if (endDmg) target[endKey] = Math.max(0, target[endKey] - endDmg * mult);
}

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _applyDamage, _battleOver, _conflictTarget, _data, _enemyDefeated, _enemyNameSafe, _hasEnemy, _playerAttr, _playerDefeated, _recordOutcome, _renderAll, _roll2d6pair, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  // Player attacks.
  const pTarget = _conflictTarget(_playerAttr(d), d.enemy.value);
  const [pd1, pd2] = _roll2d6pair();
  const pRoll = pd1 + pd2;
  const pDouble1 = pd1 === 1 && pd2 === 1;
  const pSuccess = pTarget === 'A' || (pTarget !== '-' && pRoll <= pTarget);
  if (pSuccess) {
    _applyDamage(d.enemy, 'sta', 'staMax', 'end', 'endMax', d.player.weaponSta, d.player.weaponEnd, pDouble1);
    _appendLog(d, t('battlesim541.log.you_hit', {
      round: d.roundsThisBattle, target: pTarget, roll: pRoll, enemy: _enemyNameSafe(d),
      sta: d.enemy.sta, staMax: d.enemy.staMax, end: d.enemy.end, endMax: d.enemy.endMax,
    }));
  } else {
    _appendLog(d, t('battlesim541.log.you_miss', { round: d.roundsThisBattle, target: pTarget, roll: pRoll, enemy: _enemyNameSafe(d) }));
  }

  if (_hasEnemy(d) && _enemyDefeated(d)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim541.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
    saveState();
    _renderAll();
    return;
  }

  // Enemy attacks back (Conflict Table is symmetric - swap attacker/defender).
  const eTarget = _conflictTarget(d.enemy.value, _playerAttr(d));
  const [ed1, ed2] = _roll2d6pair();
  const eRoll = ed1 + ed2;
  const eDouble1 = ed1 === 1 && ed2 === 1;
  const eSuccess = eTarget === 'A' || (eTarget !== '-' && eRoll <= eTarget);
  if (eSuccess) {
    _applyDamage(d.player, 'stamina', 'staminaInitial', 'endurance', 'enduranceInitial', d.enemy.weaponSta, d.enemy.weaponEnd, eDouble1);
    _appendLog(d, t('battlesim541.log.enemy_hits', {
      enemy: _enemyNameSafe(d), target: eTarget, roll: eRoll,
      stamina: d.player.stamina, staminaMax: d.player.staminaInitial,
      endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial,
    }));
  } else {
    _appendLog(d, t('battlesim541.log.enemy_miss', { enemy: _enemyNameSafe(d), target: eTarget, roll: eRoll }));
  }

  if (_playerDefeated(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim541.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.combatRulesVersion = 2;
  d.enemy.sta = d.enemy.staMax;
  d.enemy.end = d.enemy.endMax;
  d.player.stamina = d.player.staminaInitial;
  d.player.endurance = d.player.enduranceInitial;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim541.log.reset_sep'));
  _appendLog(d, t('battlesim541.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _conflictTarget, _roll1d6, _roll2d6pair, _enemyName, _enemyNameSafe, _playerAttr, _enemyDefeated, _playerDefeated, _hasEnemy, _applyDamage, _runRound, _resetBattle };
}

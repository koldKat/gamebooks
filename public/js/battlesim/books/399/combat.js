// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _captureStopRule(d) {

  d.stopBelowEndurance = d.enemy.name === 'Неизвестен корпоративен служител' ? 10 : 0;
  if (d.stopBelowEndurance) d.enemy.enduranceCritical = 0;
}

function _applyEnemy(d, enemy) {
  const { ENEMY_MODE, ENEMY_STATS, _appendLog, _captureStopRule, _emptySide, t } = getContext();

  const { manual, ...stats } = Object.hasOwn(ENEMY_STATS, enemy.name) ? ENEMY_STATS[enemy.name] : {};
  d.enemy = {
    ..._emptySide(), ...stats,
    name: enemy.name,
    mode: Object.hasOwn(ENEMY_MODE, enemy.name) ? ENEMY_MODE[enemy.name] : 'unarmed',
    skill: enemy.attack ?? 0,
    resil: enemy.defense ?? 0,
    endurance: enemy.hp ?? 0,
    enduranceInitial: enemy.hp ?? 0,
    enduranceCritical: enemy.pb ?? 0,
  };
  _captureStopRule(d);
  d.roundsThisBattle = 0;
  if (manual) _appendLog(d, t('battlesim399.log.manual_stats'));
}

function _emptySide() {

  return {
    mode: 'unarmed',
    speed: 0, str: 0, acc: 0, reflex: 0, resil: 0,
    skill: 0, power: 0, eqspeed: 0, weapon: 0, maneuver: 0,
    endurance: 0, enduranceInitial: 0, enduranceCritical: 0,
    critApplied: false,
  };
}

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _orderVal(side) {
  const { _roll1d6 } = getContext();

  const eq = side.mode === 'unarmed' ? 0 : side.eqspeed;
  return _roll1d6() + side.speed + eq;
}

function _attackSum(side) {
  const { _roll1d6 } = getContext();

  switch (side.mode) {
    case 'unarmed':  return _roll1d6() + side.str;
    case 'melee':    return _roll1d6() + side.str + side.skill + side.power;
    case 'gunfight': return _roll1d6() + side.acc + side.skill + side.power;
    case 'cyber':    return _roll1d6() + side.acc + side.skill + side.power;
    case 'vehicle':  return _roll1d6() + side.acc + side.skill + side.power + side.weapon;
    default:         return _roll1d6();
  }
}

function _defenceSum(attackerMode, defenderSide) {

  switch (attackerMode) {
    case 'unarmed':  return defenderSide.resil + defenderSide.reflex;
    case 'melee':    return defenderSide.resil + defenderSide.reflex + defenderSide.skill;
    case 'gunfight': return defenderSide.resil + defenderSide.reflex;
    case 'cyber':    return defenderSide.resil + defenderSide.reflex;
    case 'vehicle':  return defenderSide.resil + defenderSide.reflex + defenderSide.maneuver;
    default:         return defenderSide.resil + defenderSide.reflex;
  }
}

function _applyCritCheck(side) {

  if (!side.critApplied && side.enduranceCritical > 0 && side.endurance <= side.enduranceCritical) {
    side.critApplied = true;
    for (const k of ['speed', 'str', 'acc', 'reflex', 'resil', 'skill', 'power', 'eqspeed', 'weapon', 'maneuver']) {
      side[k] = Math.max(0, side[k] - 1);
    }
    return true;
  }
  return false;
}

function _belowStopRule(d, side) {

  return d.stopBelowEndurance > 0 && side.endurance < d.stopBelowEndurance;
}

function _playerDefeated(d) {
  const { _belowStopRule } = getContext();
 return d.player.endurance <= 0 || _belowStopRule(d, d.player); }

function _enemyDefeated(d) {
  const { _belowStopRule } = getContext();
 return d.enemy.enduranceInitial > 0 && (d.enemy.endurance <= 0 || _belowStopRule(d, d.enemy)); }

function _applyEnemyDefeat(d) {
  const { SVG_TROPHY, _appendLog, _enemyDefeated, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim399.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  const { SVG_SKULL, _appendLog, _playerDefeated, _recordOutcome, t } = getContext();

  if (_playerDefeated(d)) {
    const key = d.player.endurance > 0 ? 'battlesim399.log.stopped_loss' : 'battlesim399.log.fallen';
    _appendLog(d, t(key, { skull: SVG_SKULL, n: d.stopBelowEndurance }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _strike(d, attackerKey) {
  const { _appendLog, _applyCritCheck, _attackSum, _defenceSum, _enemyNameSafe, t } = getContext();

  const attacker = d[attackerKey];
  const defender = attackerKey === 'player' ? d.enemy : d.player;
  const attackerName = attackerKey === 'player' ? t('battlesim399.ui.you') : _enemyNameSafe(d);
  const defenderName = attackerKey === 'player' ? _enemyNameSafe(d) : t('battlesim399.ui.you');

  const atk = _attackSum(attacker);
  const def = _defenceSum(attacker.mode, defender);
  const raw = atk - def;

  if (raw >= 0) {
    defender.endurance = Math.max(0, defender.endurance - raw);
    _appendLog(d, t('battlesim399.log.hit', { attacker: attackerName, defender: defenderName, atk, def, n: raw, endurance: defender.endurance, enduranceMax: defender.enduranceInitial }));
    if (_applyCritCheck(defender)) {
      _appendLog(d, t('battlesim399.log.critical', { name: defenderName }));
    }
  } else {
    const back = -raw;
    attacker.endurance = Math.max(0, attacker.endurance - back);
    _appendLog(d, t('battlesim399.log.backlash', { attacker: attackerName, defender: defenderName, atk, def, n: back, endurance: attacker.endurance, enduranceMax: attacker.enduranceInitial }));
    if (_applyCritCheck(attacker)) {
      _appendLog(d, t('battlesim399.log.critical', { name: attackerName }));
    }
  }
}

function _attack() {
  const { _appendLog, _applyEnemyDefeat, _applyPlayerFall, _battleOver, _data, _enemyNameSafe, _orderVal, _renderAll, _strike, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  let playerOrder = _orderVal(d.player);
  let enemyOrder = _orderVal(d.enemy);
  let tieRerolls = 0;
  while (playerOrder === enemyOrder && tieRerolls < 20) {
    // Reroll tied initiative; do not choose a fixed winner.
    playerOrder = _orderVal(d.player);
    enemyOrder = _orderVal(d.enemy);
    tieRerolls++;
  }
  const first = playerOrder > enemyOrder ? 'player' : 'enemy';
  const second = first === 'player' ? 'enemy' : 'player';
  _appendLog(d, t('battlesim399.log.order', {
    first: first === 'player' ? t('battlesim399.ui.you') : _enemyNameSafe(d),
  }));

  _strike(d, first);
  let over = _applyEnemyDefeat(d) || _applyPlayerFall(d);
  if (!over) {
    _strike(d, second);
    over = _applyEnemyDefeat(d) || _applyPlayerFall(d);
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _captureStopRule, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  _captureStopRule(d);
  d.enemy.endurance = d.enemy.enduranceInitial;
  d.enemy.critApplied = false;
  d.player.endurance = d.player.enduranceInitial;
  d.player.critApplied = false;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim399.log.reset_sep'));
  _appendLog(d, t('battlesim399.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}





function _sideFields(prefix) {
  const { _modeSelect, _numField, t } = getContext();

  return `
    ${_modeSelect(prefix)}
    ${_numField(t('battlesim399.ui.speed'), `${prefix}-speed`)}
    ${_numField(t('battlesim399.ui.str'), `${prefix}-str`)}
    ${_numField(t('battlesim399.ui.acc'), `${prefix}-acc`)}
    ${_numField(t('battlesim399.ui.reflex'), `${prefix}-reflex`)}
    ${_numField(t('battlesim399.ui.resil'), `${prefix}-resil`)}
    ${_numField(t('battlesim399.ui.skill'), `${prefix}-skill`)}
    ${_numField(t('battlesim399.ui.power'), `${prefix}-power`)}
    ${_numField(t('battlesim399.ui.eqspeed'), `${prefix}-eqspeed`)}
    ${_numField(t('battlesim399.ui.weapon'), `${prefix}-weapon`)}
    ${_numField(t('battlesim399.ui.maneuver'), `${prefix}-maneuver`)}
    ${_numField(t('battlesim399.ui.endurance'), `${prefix}-endurance`)}
    ${_numField(t('battlesim399.ui.endurance_initial'), `${prefix}-endurancemax`)}
    ${_numField(t('battlesim399.ui.endurance_crit'), `${prefix}-endurancecrit`)}`;
}
// END EXTRACTED RULES
  return { _captureStopRule, _applyEnemy, _emptySide, _roll1d6, _enemyName, _enemyNameSafe, _orderVal, _attackSum, _defenceSum, _applyCritCheck, _belowStopRule, _playerDefeated, _enemyDefeated, _applyEnemyDefeat, _applyPlayerFall, _strike, _attack, _resetBattle, _sideFields };
}

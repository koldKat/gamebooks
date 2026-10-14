// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _secondName(d) {
  const { t } = getContext();
 return d.secondEnemy.name.trim() || t('battlesim237.ui.second_default'); }

function _secondNameSafe(d) {
  const { _secondName, escapeHtml } = getContext();
 return escapeHtml(_secondName(d)); }

function _resetEncounterKnobs(d) {

  // New encounters opt in; loading or resetting a saved fight does not.
  d.correctedCombatRules = true;
  d.player.attackModifier = 0;
  d.player.yourDamage = 2;
  d.player.enemyDamage = 2;
  d.secondEnemy.active = false;
  d.secondEnemy.name = '';
  d.secondEnemy.skill = 0;
  d.secondEnemy.stamina = 0;
  d.secondEnemy.staminaMax = 0;
  d.secondEnemy.target = 'enemy';
}

function _bothAlive(d) {

  return d.player.stamina > 0 && (d.enemy.stamina > 0 || (d.secondEnemy.active && d.secondEnemy.stamina > 0));
}

function _runRound() {
  const { _appendLog, _bothAlive, _checkBattleEnd, _data, _enemyNameSafe, _notReady, _renderAll, _roll2d6, _runThreeWayRound, _secondNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !_bothAlive(d) || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  if (d.secondEnemy.active && d.secondEnemy.stamina > 0 && d.enemy.stamina > 0) {
    _runThreeWayRound(d);
  } else {
    // Use single-enemy combat after one paired enemy falls or for sequential fights.
    const target = d.enemy.stamina > 0 ? d.enemy : d.secondEnemy;
    const targetName = d.enemy.stamina > 0 ? _enemyNameSafe(d) : _secondNameSafe(d);
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + target.skill;
    _appendLog(d, t('battlesim237.log.round', { round: d.roundsThisBattle, playerAS, enemy: targetName, enemyAS }));
    if (playerAS === enemyAS) {
      _appendLog(d, t('battlesim237.log.both_avoided'));
    } else if (playerAS > enemyAS) {
      const dmg = d.player.yourDamage;
      target.stamina = Math.max(0, target.stamina - dmg);
      _appendLog(d, t('battlesim237.log.you_wound', { enemy: targetName, n: dmg, stamina: target.stamina, staminaMax: target.staminaMax }));
      if (target.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', on: target === d.enemy ? 'enemy' : 'second' });
    } else {
      const dmg = d.player.enemyDamage;
      d.player.stamina = Math.max(0, d.player.stamina - dmg);
      _appendLog(d, t('battlesim237.log.enemy_wounds', { enemy: targetName, n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _runThreeWayRound(d) {
  const { _appendLog, _enemyNameSafe, _roll2d6, _secondNameSafe, t } = getContext();

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemy1AS = _roll2d6() + d.enemy.skill;
  const enemy2AS = _roll2d6() + d.secondEnemy.skill;
  _appendLog(d, t('battlesim237.log.round_three', {
    round: d.roundsThisBattle, playerAS,
    e1: _enemyNameSafe(d), e1AS: enemy1AS,
    e2: _secondNameSafe(d), e2AS: enemy2AS,
  }));

  const highest = Math.max(playerAS, enemy1AS, enemy2AS);
  if (d.correctedCombatRules && [playerAS, enemy1AS, enemy2AS].filter(as => as === highest).length > 1) {
    _appendLog(d, t('battlesim237.log.highest_tied'));
    return;
  }
  if (playerAS >= enemy1AS && playerAS >= enemy2AS) {
    const target = d.secondEnemy.target === 'second' ? d.secondEnemy : d.enemy;
    const targetName = d.secondEnemy.target === 'second' ? _secondNameSafe(d) : _enemyNameSafe(d);
    const dmg = d.player.yourDamage;
    target.stamina = Math.max(0, target.stamina - dmg);
    _appendLog(d, t('battlesim237.log.you_wound', { enemy: targetName, n: dmg, stamina: target.stamina, staminaMax: target.staminaMax }));
    if (target.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', on: d.secondEnemy.target === 'second' ? 'second' : 'enemy' });
  } else if (enemy1AS > enemy2AS) {
    const dmg = d.player.enemyDamage;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim237.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  } else {
    const dmg = d.player.enemyDamage;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim237.log.enemy_wounds', { enemy: _secondNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _secondNameSafe, t } = getContext();

  if (d.enemy.stamina <= 0 && (!d.secondEnemy.active || d.secondEnemy.stamina <= 0)) {
    _appendLog(d, t('battlesim237.log.defeated', { trophy: SVG_TROPHY, enemy: d.secondEnemy.active ? `${_enemyNameSafe(d)} & ${_secondNameSafe(d)}` : _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim237.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }
}

function _testLuck() {
  const { SVG_SKULL, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, _secondNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const target = event.on === 'second' ? d.secondEnemy : d.enemy;
    const targetName = event.on === 'second' ? _secondNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      target.stamina = Math.max(0, target.stamina - (d.correctedCombatRules ? 2 : 1));
      _appendLog(d, t('battlesim237.log.luck_player_hit_lucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    } else {
      target.stamina = Math.min(target.staminaMax, target.stamina + 1);
      _appendLog(d, t('battlesim237.log.luck_player_hit_unlucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim237.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim237.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim237.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  if (d.secondEnemy.active) d.secondEnemy.stamina = d.secondEnemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim237.log.reset_sep'));
  _appendLog(d, t('battlesim237.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _secondName, _secondNameSafe, _resetEncounterKnobs, _bothAlive, _runRound, _runThreeWayRound, _checkBattleEnd, _testLuck, _skipLuck, _resetBattle };
}

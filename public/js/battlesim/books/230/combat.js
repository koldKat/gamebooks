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

function _sideEnemyNameSafe(d) {
  const { escapeHtml, t } = getContext();
 return escapeHtml(d.sideEnemy.name.trim() || t('battlesim.default_side_enemy')); }

function _resetEncounterKnobs(d) {

  d.combatRulesVersion = 2;
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyAutoWinFirstRound = false;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
}

function _hasSide(d) {

  return d.combatRulesVersion === 2 && d.pairedFight && d.sideEnemy.stamina > 0;
}

function _finishOpponent(d) {
  const { SVG_TROPHY, _appendLog, _enemyNameSafe, _hasSide, _recordOutcome, t } = getContext();

  _appendLog(d, t('battlesim230.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
  if (_hasSide(d)) {
    [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
  } else {
    _recordOutcome(d, 'win');
  }
}

function _switchTarget() {
  const { _data, _hasSide, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !_hasSide(d) || d.enemy.stamina <= 0 || d.player.stamina <= 0 || d.pendingLuckQueue.length) return;
  [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
  saveState();
  _renderAll();
}

function _firstRoundOverride(d) {
  const { _appendLog, _enemyNameSafe, t } = getContext();

  if (d.player.enemyAutoWinFirstRound) {
    _appendLog(d, t('battlesim230.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
    return 'enemy';
  }
  return null;
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _finishOpponent, _firstRoundOverride, _hasSide, _notReady, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const override = isFirstRound ? _firstRoundOverride(d) : null;

  let playerWins = false, tie = false;
  let sideWins = false;
  if (override === 'enemy') {
    playerWins = false;
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim230.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (_hasSide(d)) {
      const sideAS = _roll2d6() + d.sideEnemy.skill;
      _appendLog(d, t('battlesim230.log.shared_round', { enemy: _sideEnemyNameSafe(d), playerAS, enemyAS: sideAS }));
      playerWins = playerAS > enemyAS && playerAS > sideAS;
      sideWins = sideAS > playerAS && sideAS > enemyAS;
      tie = !playerWins && !sideWins && !(enemyAS > playerAS && enemyAS > sideAS);
    } else {
      if (playerAS === enemyAS) tie = true;
      else playerWins = playerAS > enemyAS;
    }
  }

  if (tie) {
    _appendLog(d, t('battlesim230.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim230.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
      d.enemy.stamina = 0;
      _appendLog(d, t('battlesim230.log.press_advantage'));
    }
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    const damage = sideWins ? SIDE_WOUND_DMG : woundDmg;
    d.player.stamina = Math.max(0, d.player.stamina - damage);
    _appendLog(d, t('battlesim230.log.enemy_wounds', { enemy: sideWins ? _sideEnemyNameSafe(d) : _enemyNameSafe(d), n: damage, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: sideWins ? 'side-hit' : 'enemy-hit' });
  }

  // Retain the old rules for saved encounters until a new main enemy is selected.
  if (d.combatRulesVersion !== 2 && d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim230.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim230.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim230.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.combatRulesVersion === 2 && d.player.stamina <= 0) {
    _appendLog(d, t('battlesim230.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  } else if (d.enemy.stamina <= 0 && d.combatRulesVersion === 2) {
    _finishOpponent(d);
  } else if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim230.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim230.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, _appendLog, _data, _enemyNameSafe, _finishOpponent, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim230.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim230.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) _finishOpponent(d);
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim230.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim230.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim230.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
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
  if (d.combatRulesVersion === 2) d.sideEnemy.stamina = d.sideEnemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim230.log.reset_sep'));
  _appendLog(d, t('battlesim230.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _resetEncounterKnobs, _hasSide, _finishOpponent, _switchTarget, _firstRoundOverride, _runRound, _testLuck, _skipLuck, _resetBattle };
}

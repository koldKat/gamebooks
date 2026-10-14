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

function _enemyDefeated(d) {
 return d.enemy.staminaMax > 0 && d.enemy.stamina <= (d.player.enemyDefeatThreshold || 0); }

function _resetEncounterKnobs(d) {
  const { _enemyList } = getContext();

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.playerWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.player.enemyDefeatThreshold = 0;
  d.combatRulesVersion = 2;
  d.encounter = { shield: d.encounter?.shield || false, silver: d.encounter?.silver || false, fire: false, invisible: false, paralyzeAfter: 0, wounds: 0, wight: false, paired: false };
  d.sideEnemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
  const section = Number(d.enemy.name.match(/§(\d+)$/)?.[1]);
  if (section === 116) d.player.attackModifier = 1;
  if (section === 394) d.player.attackModifier = -2;
  if (section === 39) { d.player.attackModifier = 2; d.player.playerWoundDamage = 3; d.encounter.invisible = true; }
  d.encounter.fire = section === 249;
  d.encounter.paralyzeAfter = section === 230 ? 4 : 0;
  d.encounter.wight = section === 41;
  if (section === 140 && d.enemy.name.includes('двойка')) {
    const prefix = d.enemy.name.split('СКЕЛЕТ')[0];
    const other = (_enemyList || []).find(enemy => enemy.name !== d.enemy.name && enemy.name.startsWith(prefix) && enemy.name.endsWith('§140'));
    if (other) {
      d.encounter.paired = true;
      d.sideEnemy = { name: other.name, skill: other.attack, stamina: other.hp, staminaMax: other.hp };
    }
  }
}

function _runRound() {
  const { _data, _runLegacyRound, _runSourceRound } = getContext();

  const d = _data();
  if (d?.combatRulesVersion === 2) return _runSourceRound(d);
  return _runLegacyRound();
}

function _runLegacyRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyDefeated, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || _enemyDefeated(d) || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const enemyWoundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerWoundDmg = Math.max(1, d.player.playerWoundDamage || 2);

  let playerWins = false, tie = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    playerWins = false;
    _appendLog(d, t('battlesim464.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim464.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim464.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim464.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim464.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim464.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim464.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _sideAlive(d) {

  return d.encounter.paired && d.sideEnemy.staminaMax > 0 && d.sideEnemy.stamina > 0;
}

function _sourceFightOver(d) {
  const { _enemyDefeated, _sideAlive } = getContext();

  return _enemyDefeated(d) && !_sideAlive(d);
}

function _finishSourceRound(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyDefeated, _enemyNameSafe, _recordOutcome, _sideAlive, _sourceFightOver, t } = getContext();

  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim464.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  } else if (!d.pendingLuckQueue.length && _sourceFightOver(d)) {
    _appendLog(d, t('battlesim464.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (!d.pendingLuckQueue.length && _enemyDefeated(d) && _sideAlive(d)) {
    d.enemy.stamina = 0;
    [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
    d.player.enemyDefeatThreshold = 0;
  }
}

function _receiveSourceHit(d, kind, source, damage) {
  const { _appendLog, _roll1d6, t } = getContext();

  const before = d.player.stamina;
  if (d.encounter.invisible && kind !== 'fire-hit') {
    const roll = _roll1d6();
    damage = roll === 6 ? 0 : roll % 2 === 0 ? 1 : 2;
    _appendLog(d, t('battlesim464.log.protection', { roll, damage }));
  }
  if (d.encounter.shield && kind !== 'fire-hit') {
    const roll = _roll1d6();
    if (roll === 6) damage = Math.max(0, damage - 1);
    _appendLog(d, t('battlesim464.log.protection', { roll, damage }));
  }
  d.player.stamina = Math.max(0, before - damage);
  d.encounter.wounds++;
  _appendLog(d, t('battlesim464.log.enemy_wounds', { enemy: source, n: damage, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  if (d.encounter.wight && d.encounter.wounds % 3 === 0) {
    d.player.skill = Math.max(0, d.player.skill - 1);
    _appendLog(d, t('battlesim464.log.skill_loss'));
  }
  if (d.encounter.paralyzeAfter > 0 && d.encounter.wounds >= d.encounter.paralyzeAfter) {
    d.player.stamina = 0;
    _appendLog(d, t('battlesim464.log.paralysed'));
  }
  if (d.player.stamina > 0 && damage > 0) d.pendingLuckQueue.push({ kind, source, before, damage });
}

function _runSourceRound(d) {
  const { _appendLog, _enemyDefeated, _enemyNameSafe, _finishSourceRound, _notReady, _receiveSourceHit, _renderAll, _roll1d6, _roll2d6, _sideAlive, _sourceFightOver, escapeHtml, saveState, t } = getContext();

  if (_notReady(d) || d.player.stamina <= 0 || _sourceFightOver(d) || d.enemy.staminaMax <= 0 || d.pendingLuckQueue.length) return;
  const forced = d.roundsThisBattle++ === 0 && d.player.enemyAutoWinFirstRound;
  const playerAS = forced ? 0 : _roll2d6() + d.player.skill + d.player.attackModifier;
  const enemyAS = forced ? 1 : _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim464.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS > enemyAS) {
    if (d.encounter.wight && !d.encounter.silver) {
      _appendLog(d, t('battlesim464.log.immune'));
    } else {
      const damage = Math.max(1, d.player.playerWoundDamage || 2);
      d.enemy.stamina = Math.max(0, d.enemy.stamina - damage);
      _appendLog(d, t('battlesim464.log.you_wound', { enemy: _enemyNameSafe(d), n: damage, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else if (enemyAS > playerAS) {
    _receiveSourceHit(d, 'enemy-hit', _enemyNameSafe(d), Math.max(1, d.player.enemyWoundDamage || 2));
  } else _appendLog(d, t('battlesim464.log.both_avoided'));
  if (_sideAlive(d) && d.player.stamina > 0) {
    const playerSideAS = _roll2d6() + d.player.skill + d.player.attackModifier;
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    const sideName = escapeHtml(d.sideEnemy.name || t('battlesim.default_enemy'));
    _appendLog(d, t('battlesim464.log.round', { round: d.roundsThisBattle, playerAS: playerSideAS, enemy: sideName, enemyAS: sideAS }));
    if (sideAS > playerSideAS) _receiveSourceHit(d, 'side-hit', sideName, Math.max(1, d.player.enemyWoundDamage || 2));
    else _appendLog(d, t('battlesim464.log.both_avoided'));
  }
  if (d.encounter.fire && d.player.stamina > 0) {
    const roll = _roll1d6();
    _appendLog(d, t('battlesim464.log.fire', { roll }));
    if (roll <= 2) _receiveSourceHit(d, 'fire-hit', t('battlesim464.ui.fire'), 1);
  }
  _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _switchSourceTarget() {
  const { _data, _renderAll, _sideAlive, saveState } = getContext();

  const d = _data();
  if (d?.combatRulesVersion !== 2 || !_sideAlive(d) || d.pendingLuckQueue.length || d.player.stamina <= 0) return;
  [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
  d.player.enemyDefeatThreshold = 0;
  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyDefeated, _enemyNameSafe, _finishSourceRound, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const extra = d.combatRulesVersion === 2 ? 2 : Math.max(1, d.player.playerWoundDamage || 2);
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
      _appendLog(d, t('battlesim464.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim464.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.combatRulesVersion !== 2 && _enemyDefeated(d)) { _appendLog(d, t('battlesim464.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.source || _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + Math.min(1, event.damage ?? 1));
      _appendLog(d, t('battlesim464.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim464.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.combatRulesVersion !== 2 && d.player.stamina <= 0) {
      _appendLog(d, t('battlesim464.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  if (d.combatRulesVersion === 2) _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _finishSourceRound, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  if (d.combatRulesVersion === 2) _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  if (d.combatRulesVersion === 2) {
    d.sideEnemy.stamina = d.sideEnemy.staminaMax;
    d.encounter.wounds = 0;
  }
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim464.log.reset_sep'));
  _appendLog(d, t('battlesim464.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _enemyDefeated, _resetEncounterKnobs, _runRound, _runLegacyRound, _sideAlive, _sourceFightOver, _finishSourceRound, _receiveSourceHit, _runSourceRound, _switchSourceTarget, _testLuck, _skipLuck, _resetBattle };
}

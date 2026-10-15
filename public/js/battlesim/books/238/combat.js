// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _paired(d) {
 return d.pairedCombat && d.secondEnemy.active; }

function _allDefeated(d) {
  const { _paired } = getContext();
 return d.enemy.stamina <= 0 && (!_paired(d) || d.secondEnemy.stamina <= 0); }

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
 return d.secondEnemy.name.trim() || t('battlesim238.ui.second_default'); }

function _secondNameSafe(d) {
  const { _secondName, escapeHtml } = getContext();
 return escapeHtml(_secondName(d)); }

function _resetEncounterKnobs(d) {

  // Preserve legacy fights until a new encounter is selected.
  d.correctedLuckDamage = true;
  d.pairedCombat = true;
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

function _finishPairedRound(d) {
  const { SVG_SKULL, SVG_TROPHY, _allDefeated, _appendLog, _enemyNameSafe, _recordOutcome, _secondNameSafe, t } = getContext();

  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim238.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  } else if (_allDefeated(d)) {
    _appendLog(d, t('battlesim238.log.defeated', { trophy: SVG_TROPHY, enemy: `${_enemyNameSafe(d)} & ${_secondNameSafe(d)}` }));
    _recordOutcome(d, 'win');
    d.pendingLuckQueue = [];
  }
}

function _runPairedRound(d) {
  const { _allDefeated, _appendLog, _enemyNameSafe, _finishPairedRound, _notReady, _renderAll, _roll2d6, _secondNameSafe, saveState, t } = getContext();

  if (_notReady(d) || d.player.stamina <= 0 || _allDefeated(d) || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;
  let target = d.secondEnemy.target === 'secondEnemy' ? 'secondEnemy' : 'enemy';
  if (d[target].stamina <= 0) target = target === 'enemy' ? 'secondEnemy' : 'enemy';
  d.secondEnemy.target = target;
  const other = target === 'enemy' ? 'secondEnemy' : 'enemy';
  for (const key of [target, other]) {
    const enemy = d[key];
    if (enemy.stamina <= 0 || d.player.stamina <= 0) continue;
    const name = key === 'enemy' ? _enemyNameSafe(d) : _secondNameSafe(d);
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS = _roll2d6() + enemy.skill;
    _appendLog(d, t(key === target ? 'battlesim238.log.round' : 'battlesim238.log.second_attack', { round: d.roundsThisBattle, playerAS, enemy: name, enemyAS }));
    if (enemyAS > playerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - d.player.enemyDamage);
      _appendLog(d, t('battlesim238.log.enemy_wounds', { enemy: name, n: d.player.enemyDamage, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    } else if (playerAS > enemyAS && key === target) {
      enemy.stamina = Math.max(0, enemy.stamina - d.player.yourDamage);
      _appendLog(d, t('battlesim238.log.you_wound', { enemy: name, n: d.player.yourDamage, stamina: enemy.stamina, staminaMax: enemy.staminaMax }));
      if (enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', target });
    } else {
      _appendLog(d, t(key === target ? 'battlesim238.log.both_avoided' : 'battlesim238.log.parried', { enemy: name }));
    }
  }
  _finishPairedRound(d);
  saveState();
  _renderAll();
}

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _paired, _recordOutcome, _renderAll, _roll2d6, _runPairedRound, _secondNameSafe, saveState, t } = getContext();

  const d = _data();
  if (d && _paired(d)) return _runPairedRound(d);
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim238.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim238.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    const dmg = d.player.yourDamage;
    d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg);
    _appendLog(d, t('battlesim238.log.you_wound', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    const dmg = d.player.enemyDamage;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim238.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Parry uses a fresh opposed roll; the unchosen opponent may wound but cannot be wounded back.
  if (d.secondEnemy.active && d.player.stamina > 0 && d.enemy.stamina > 0) {
    const playerAS2 = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const secondAS  = _roll2d6() + d.secondEnemy.skill;
    _appendLog(d, t('battlesim238.log.second_attack', { enemy: _secondNameSafe(d), playerAS: playerAS2, enemyAS: secondAS }));
    if (secondAS > playerAS2) {
      const dmg = d.player.enemyDamage;
      d.player.stamina = Math.max(0, d.player.stamina - dmg);
      _appendLog(d, t('battlesim238.log.enemy_wounds', { enemy: _secondNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    } else {
      _appendLog(d, t('battlesim238.log.parried', { enemy: _secondNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim238.log.defeated', { trophy: SVG_TROPHY, enemy: d.secondEnemy.active ? `${_enemyNameSafe(d)} & ${_secondNameSafe(d)}` : _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim238.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _allDefeated, _appendLog, _data, _enemyNameSafe, _paired, _recordOutcome, _renderAll, _roll2d6, _secondNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const enemy = _paired(d) && event.target === 'secondEnemy' ? d.secondEnemy : d.enemy;
    const name = enemy === d.secondEnemy ? _secondNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      enemy.stamina = Math.max(0, enemy.stamina - (d.correctedLuckDamage ? 2 : 1));
      _appendLog(d, t('battlesim238.log.luck_player_hit_lucky', { roll, enemy: name, stamina: enemy.stamina, staminaMax: enemy.staminaMax }));
    } else {
      enemy.stamina = Math.min(enemy.staminaMax, enemy.stamina + 1);
      _appendLog(d, t('battlesim238.log.luck_player_hit_unlucky', { roll, enemy: name, stamina: enemy.stamina, staminaMax: enemy.staminaMax }));
    }
    if (_allDefeated(d)) { _appendLog(d, t('battlesim238.log.defeated', { trophy: SVG_TROPHY, enemy: d.secondEnemy.active ? `${_enemyNameSafe(d)} & ${_secondNameSafe(d)}` : _enemyNameSafe(d) })); _recordOutcome(d, 'win'); d.pendingLuckQueue = []; }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim238.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim238.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim238.log.fallen', { skull: SVG_SKULL }));
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
  const { _appendLog, _data, _enemyNameSafe, _paired, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  if (_paired(d)) { d.secondEnemy.stamina = d.secondEnemy.staminaMax; d.secondEnemy.target = 'enemy'; }
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim238.log.reset_sep'));
  _appendLog(d, t('battlesim238.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _paired, _allDefeated, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _secondName, _secondNameSafe, _resetEncounterKnobs, _finishPairedRound, _runPairedRound, _runRound, _testLuck, _skipLuck, _resetBattle };
}

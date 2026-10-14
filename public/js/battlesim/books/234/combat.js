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
  const { escapeHtml } = getContext();
 return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }

function _effectiveSkill(d) {

  let skill = d.player.skill;
  if (d.player.hasNightstar) skill += d.player.vsVampire ? 2 : 1;
  return skill;
}

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.drainEffect = false;
  d.pairedFight = false;
  d.randomTarget = false;
  d.sideEnemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
}

function _allEnemiesDown(d) {

  if (d.pairedFight && d.sideEnemy.staminaMax > 0) return d.enemy.stamina <= 0 && d.sideEnemy.stamina <= 0;
  return d.enemy.stamina <= 0;
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _allEnemiesDown, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll1d6, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || _allEnemiesDown(d) || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;

  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.sideEnemy.stamina > 0) {
    // Three-way roll-off (sec 121/237/295): one shared swing, whoever rolls
    // highest of the three lands the only blow this round.
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim234.log.threeway_round', { playerAS, enemy: _enemyNameSafe(d), enemyAS, side: _sideEnemyNameSafe(d), sideAS }));
    const top = Math.max(playerAS, enemyAS, sideAS);
    const tiedForTop = [playerAS, enemyAS, sideAS].filter(v => v === top).length > 1;
    if (tiedForTop) {
      _appendLog(d, t('battlesim234.log.both_avoided'));
    } else if (playerAS === top) {
      // Hit the main target while it shields the side target; random-target encounters may redirect a blow.
      let hitSide = d.enemy.stamina <= 0;
      if (!hitSide && d.randomTarget && d.enemy.stamina > 0) hitSide = _roll1d6() >= 4;
      if (hitSide) {
        d.sideEnemy.stamina = Math.max(0, d.sideEnemy.stamina - 2);
        _appendLog(d, t('battlesim234.log.you_wound', { enemy: _sideEnemyNameSafe(d), n: 2, stamina: d.sideEnemy.stamina, staminaMax: d.sideEnemy.staminaMax }));
      } else {
        d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
        _appendLog(d, t('battlesim234.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      }
      if (d.enemy.stamina > 0 || d.sideEnemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', hitSide });
    } else if (enemyAS === top) {
      d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
      _appendLog(d, t('battlesim234.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim234.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    }
  } else {
    _appendLog(d, t('battlesim234.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) {
      _appendLog(d, t('battlesim234.log.both_avoided'));
    } else if (playerAS > enemyAS) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim234.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
      _appendLog(d, t('battlesim234.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    }
  }

  // Continuous drain is either a 1-3-on-1d6 hit or an unconditional fixed loss.
  if (d.player.drainEffect && d.player.stamina > 0) {
    const roll = _roll1d6();
    if (roll <= 3) {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim234.log.drain_hit', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'drain-hit' });
    } else {
      _appendLog(d, t('battlesim234.log.drain_miss', { roll }));
    }
  }

  if (_allEnemiesDown(d)) {
    _appendLog(d, t('battlesim234.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim234.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _allEnemiesDown, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const target = event.hitSide ? d.sideEnemy : d.enemy;
    const targetName = event.hitSide ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      target.stamina = Math.max(0, target.stamina - 2);
      _appendLog(d, t('battlesim234.log.luck_player_hit_lucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    } else {
      target.stamina = Math.min(target.staminaMax, target.stamina + 1);
      _appendLog(d, t('battlesim234.log.luck_player_hit_unlucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    }
    if (_allEnemiesDown(d)) { _appendLog(d, t('battlesim234.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'drain-hit' ? t('battlesim234.log.source_drain') : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim234.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim234.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim234.log.fallen', { skull: SVG_SKULL }));
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
  if (d.sideEnemy.staminaMax > 0) d.sideEnemy.stamina = d.sideEnemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim234.log.reset_sep'));
  _appendLog(d, t('battlesim234.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _resetEncounterKnobs, _allEnemiesDown, _runRound, _testLuck, _skipLuck, _resetBattle };
}

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

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.fireBreath = false;
  d.player.electricShock = false;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

function _runRound() {
  const { TEMPLE_RULES, ELECTRIC_SHOCK_DMG, FIRE_BREATH_DMG, SVG_SKULL, SVG_TROPHY, WOUND_DAMAGE, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll1d6, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim210.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  let enemyWonExchange = false;
  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim210.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - WOUND_DAMAGE);
    _appendLog(d, t('battlesim210.log.you_wound', { enemy: _enemyNameSafe(d), n: WOUND_DAMAGE, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    enemyWonExchange = true;
    d.player.stamina = Math.max(0, d.player.stamina - WOUND_DAMAGE);
    _appendLog(d, t('battlesim210.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: WOUND_DAMAGE, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Side attackers roll independently each round and cannot be wounded.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim210.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - WOUND_DAMAGE);
      _appendLog(d, t('battlesim210.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: WOUND_DAMAGE, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim210.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  // Fiend breath: each round, 1-2 on 1d6 costs 1 Luck-eligible STAMINA (sec 216).
  if (d.player.fireBreath && d.player.stamina > 0) {
    const fireRoll = _roll1d6();
    if (fireRoll <= TEMPLE_RULES.fireHitMax) {
      d.player.stamina = Math.max(0, d.player.stamina - FIRE_BREATH_DMG);
      _appendLog(d, t('battlesim210.log.fire_hit', { roll: fireRoll, n: FIRE_BREATH_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'fire-hit' });
    } else {
      _appendLog(d, t('battlesim210.log.fire_miss', { roll: fireRoll }));
    }
  }

  // After a Firefly win (sec 339), 1d6 on 1-3 deals 2 extra, Luck-eligible STAMINA damage.
  if (d.player.electricShock && enemyWonExchange && d.player.stamina > 0) {
    const shockRoll = _roll1d6();
    if (shockRoll <= TEMPLE_RULES.shockHitMax) {
      d.player.stamina = Math.max(0, d.player.stamina - ELECTRIC_SHOCK_DMG);
      _appendLog(d, t('battlesim210.log.shock_hit', { roll: shockRoll, n: ELECTRIC_SHOCK_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'shock-hit' });
    } else {
      _appendLog(d, t('battlesim210.log.shock_miss', { roll: shockRoll }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim210.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim210.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    // Clear queued Luck tests on defeat.
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim210.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim210.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim210.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'fire-hit' ? t('battlesim210.log.source_fire') : event.kind === 'shock-hit' ? t('battlesim210.log.source_shock') : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim210.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim210.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim210.log.fallen', { skull: SVG_SKULL }));
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
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim210.log.reset_sep'));
  _appendLog(d, t('battlesim210.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle };
}

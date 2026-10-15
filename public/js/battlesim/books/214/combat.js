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

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.forceLossAfterRounds = 0;
  d.player.hasTailAttack = false;
  d.player.escalatingDamage = false;
  d.enemyHitStreak = 0;
}

function _runRound() {
  const { _appendLog, _data, _enemyNameSafe, _notReady, _renderAll, _resolveRoundEnd, _roll1d6, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim214.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim214.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim214.log.you_wound', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    const woundDmg = d.player.escalatingDamage
      ? 2 + d.enemyHitStreak
      : Math.max(1, d.player.enemyWoundDamage || 2);
    if (d.player.escalatingDamage) d.enemyHitStreak++;
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim214.log.enemy_wounds', { enemy: _enemyNameSafe(d), dmg: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Roll tail attacks independently, regardless of the main exchange's result.
  if (d.player.hasTailAttack && d.player.stamina > 0) {
    const tailRoll = _roll1d6();
    if (tailRoll >= 5) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, t('battlesim214.log.tail_hit', { roll: tailRoll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      _appendLog(d, t('battlesim214.log.tail_miss', { roll: tailRoll }));
    }
  }

  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _resolveRoundEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.pendingLuckQueue.length) return; // wait for the Luck test to resolve first

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim214.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return;
  }
  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim214.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  // Warn once at the threshold; later rounds remain playable.
  if (d.player.forceLossAfterRounds > 0 && d.roundsThisBattle === d.player.forceLossAfterRounds) {
    _appendLog(d, t('battlesim214.log.round_limit'));
  }
}

function _testLuck() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, _resolveRoundEnd, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim214.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim214.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim214.log.luck_enemy_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim214.log.luck_enemy_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
  }
  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _renderAll, _resolveRoundEnd, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _resolveRoundEnd(d);
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
  d.enemyHitStreak = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim214.log.reset_sep'));
  _appendLog(d, t('battlesim214.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _resetEncounterKnobs, _runRound, _resolveRoundEnd, _testLuck, _skipLuck, _resetBattle };
}

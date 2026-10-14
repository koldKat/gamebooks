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
}

function _runRound() {
  const { _appendLog, _data, _enemyNameSafe, _notReady, _renderAll, _resolveRoundEnd, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length || d.pendingSurrender) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim213.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim213.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim213.log.you_wound', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim213.log.enemy_wounds', { enemy: _enemyNameSafe(d), dmg: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _captureEnemy() {
  const { SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  // Set surrendered enemies to zero STAMINA so battle-complete checks disable further rounds.
  d.enemy.stamina = 0;
  _appendLog(d, t('battlesim213.log.captured', { enemy: _enemyNameSafe(d) }));
  _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _finishEnemy() {
  const { HERO_POINT_PENALTY, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  d.enemy.stamina = 0;
  d.player.heroPoints -= HERO_POINT_PENALTY;
  _appendLog(d, t('battlesim213.log.finished_off', { enemy: _enemyNameSafe(d), n: HERO_POINT_PENALTY }));
  _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _continueAttacking() {
  const { _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  _appendLog(d, t('battlesim213.log.kept_attacking'));
  saveState();
  _renderAll();
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
      _appendLog(d, t('battlesim213.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim213.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim213.log.luck_enemy_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim213.log.luck_enemy_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
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
  d.pendingLuckQueue = [];
  d.pendingSurrender = false;
  if (d.log.length) _appendLog(d, t('battlesim213.log.reset_sep'));
  _appendLog(d, t('battlesim213.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _attemptEnergyBlast() {
  const { SUPER_POWER_STAMINA_COST, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.roundsThisBattle > 0) return;
  if (!d.enemy.staminaMax) { showAlert(t('battlesim213.alert.pick_enemy')); return; }
  d.player.stamina = Math.max(0, d.player.stamina - SUPER_POWER_STAMINA_COST);
  const roll = _roll2d6();
  const hit  = roll <= d.player.skill;
  _appendLog(d, t('battlesim213.log.eblast_roll', { n: SUPER_POWER_STAMINA_COST, roll, skill: d.player.skill, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  if (hit) {
    d.enemy.stamina = 0;
    _appendLog(d, t('battlesim213.log.eblast_hit', { enemy: _enemyNameSafe(d) }));
    _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim213.log.eblast_miss'));
  }
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _resetEncounterKnobs, _runRound, _captureEnemy, _finishEnemy, _continueAttacking, _testLuck, _skipLuck, _resetBattle, _attemptEnergyBlast };
}

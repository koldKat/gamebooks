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
  d.player.enemyWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  delete d.encounterRules;
  delete d.encounterStopped;
  delete d.encounterName;
  delete d.encounterStart;
}

function _selectEncounter(d, enemy, roster) {
  _resetEncounterKnobs(d);
  d.enemy = { name: enemy.name, skill: enemy.attack ?? 0, stamina: enemy.hp ?? 0, staminaMax: enemy.hp ?? 0 };
  d.encounterRules = { ...enemy.stats?.rules };
  const other = roster.find(row => row.id === d.encounterRules.pairedOpponentId);
  if (other) {
    d.pairedFight = true;
    d.sideEnemy = { name: other.name, skill: other.attack, stamina: other.hp, staminaMax: other.hp };
    d.encounterName = `${enemy.name} / ${other.name}`;
  }
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (other) d.encounterStart = structuredClone({ enemy: d.enemy, sideEnemy: d.sideEnemy, pairedFight: d.pairedFight });
}

function _swapTarget(d) {
  if (!d.encounterRules?.defeatableSide || !d.pairedFight || d.pendingLuckQueue.length || d.encounterStopped
      || !(d.sideEnemy.stamina > 0)) return;
  [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
}

function _settleCombat(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();
  if (d.encounterStopped) return;
  if (d.player.stamina <= 0) {
    d.encounterStopped = 'loss';
    d.pendingLuckQueue = [];
    _appendLog(d, t('battlesim233.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  if (d.pendingLuckQueue.length) return;
  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim233.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    if (d.encounterRules?.defeatableSide && d.pairedFight && d.sideEnemy.stamina > 0) {
      d.enemy = { ...d.sideEnemy };
      d.sideEnemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
      d.pairedFight = false;
    } else {
      d.encounterStopped = 'win';
      _recordOutcome(d, 'win');
      return;
    }
  }
  const limit = d.encounterRules?.roundLimit;
  if (limit && d.roundsThisBattle >= limit) {
    d.encounterStopped = 'paused';
    _appendLog(d, t('battlesim233.status.continue', { section: d.encounterRules.limitDestination }));
  }
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.encounterStopped || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const enemyWoundDmg = Math.max(1, d.player.enemyWoundDamage || 2);

  let playerWins = false, tie = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    playerWins = false;
    _appendLog(d, t('battlesim233.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim233.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim233.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim233.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim233.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // The untargeted enemy attacks independently, including the round its partner falls.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0
      && (!d.encounterRules?.defeatableSide || d.sideEnemy.stamina > 0)) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim233.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim233.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim233.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  _settleCombat(d);

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
      _appendLog(d, t('battlesim233.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim233.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim233.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim233.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
  }
  _settleCombat(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _settleCombat(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  if (d.encounterStart) {
    Object.assign(d, structuredClone(d.encounterStart));
  }
  delete d.encounterStopped;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim233.log.reset_sep'));
  _appendLog(d, t('battlesim233.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _resetEncounterKnobs, _selectEncounter, _swapTarget, _settleCombat, _runRound, _testLuck, _skipLuck, _resetBattle };
}

// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _roll2d6Detailed() {
  const { _roll1d6 } = getContext();

  const a = _roll1d6(), b = _roll1d6();
  return { total: a + b, isDouble1: a === 1 && b === 1 };
}

function _roll2d6() {
  const { _roll2d6Detailed } = getContext();
 return _roll2d6Detailed().total; }

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

  let skill = d.player.useNecromancerLevel ? d.player.necromancerLevel : d.player.skill;
  if (d.player.darknessFight && !d.player.hasDarkfight) skill -= 2;
  return skill;
}

function _threshold(d) {
 return Math.max(0, d.player.drawThreshold || 0); }

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyAutoWinFirstRound = false;
  d.player.hitsLandedThisFight = 0;
  d.player.drawThreshold = 0;
  d.player.darknessFight = false;
  d.player.useNecromancerLevel = false;
  d.player.doubleOneDrowns = false;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _roll2d6Detailed, _sideEnemyNameSafe, _threshold, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= _threshold(d) || d.enemy.stamina <= _threshold(d) || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const threshold = _threshold(d);

  let playerWins = false, tie = false, drowned = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    _appendLog(d, t('battlesim231.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
    playerWins = false;
  } else {
    const playerRoll = _roll2d6Detailed();
    const playerAS = playerRoll.total + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim231.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (d.player.doubleOneDrowns && playerRoll.isDouble1) {
      _appendLog(d, t('battlesim231.log.drowned'));
      d.player.stamina = 0;
      drowned = true;
    } else if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (drowned) {
    // handled below by the stamina<=threshold check
  } else if (tie) {
    _appendLog(d, t('battlesim231.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(threshold, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim231.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > threshold) {
      d.enemy.stamina = threshold;
      _appendLog(d, t('battlesim231.log.press_advantage'));
    }
    if (d.enemy.stamina > threshold) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(threshold, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim231.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > threshold) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Roll independently against the side attacker, which cannot be wounded.
  if (!drowned && d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > threshold) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim231.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(threshold, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim231.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > threshold) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim231.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= threshold) {
    _appendLog(d, t('battlesim231.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= threshold) {
    _appendLog(d, t('battlesim231.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, _threshold, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  const threshold = _threshold(d);
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(threshold, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim231.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim231.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= threshold) { _appendLog(d, t('battlesim231.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim231.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(threshold, d.player.stamina - 1);
      _appendLog(d, t('battlesim231.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= threshold) {
      _appendLog(d, t('battlesim231.log.fallen', { skull: SVG_SKULL }));
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
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim231.log.reset_sep'));
  _appendLog(d, t('battlesim231.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll1d6, _roll2d6Detailed, _roll2d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _threshold, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle };
}

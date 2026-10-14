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

function _krisBonus(d) {
  const { _enemyName } = getContext();

  if (!d.player.hasKrisKnife) return 0;
  const name = _enemyName(d).toLowerCase();
  if (name.includes('hell demon')) return 6;
  if (name.includes('earl of drumer') || name.includes('franklins')) return 3;
  return 0;
}

function _effectiveSkill(d) {
  const { _krisBonus } = getContext();

  // The ornate letter-opener sets SKILL to Initial, replacing other weapon bonuses.
  const base = d.player.hasLetterOpener ? d.player.skillInitial : d.player.skill;
  let skill = base;
  if (d.player.hasWoodenBranch)  skill += 3;
  if (d.player.hasMeatKnife)     skill += 3;
  if (d.player.hasSilverDagger)  skill += 2;
  skill += _krisBonus(d);
  return skill + (d.player.attackModifier || 0);
}

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyStaminaFloor = 0;
  d.player.hitsLandedThisFight = 0;
  d.player.fireSpriteWound = false;
  d.player.ghoulWoundCounter = false;
  d.player.woundEventsThisFight = 0;
}

function _enemyFloor(d) {
 return Math.max(0, d.player.enemyStaminaFloor || 0); }

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _checkGhoulParalysis, _data, _effectiveSkill, _enemyFloor, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const floor    = _enemyFloor(d);

  const playerAS = _roll2d6() + _effectiveSkill(d);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim206.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  let playerWins = false, tie = false;
  if (playerAS === enemyAS) tie = true;
  else playerWins = playerAS > enemyAS;

  if (tie) {
    _appendLog(d, t('battlesim206.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim206.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
      d.enemy.stamina = floor;
      _appendLog(d, t('battlesim206.log.press_advantage'));
    }
    if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else if (d.player.fireSpriteWound) {
    // Fire Sprite damage is deferred: lucky 0, unlucky 4, skipped 3 STAMINA.
    _appendLog(d, t('battlesim206.log.firesprite_ready', { enemy: _enemyNameSafe(d) }));
    d.pendingLuckQueue.push({ kind: 'fire-sprite-wound' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim206.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.ghoulWoundCounter) d.player.woundEventsThisFight++;
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  const paralysed = _checkGhoulParalysis(d);

  if (d.enemy.stamina <= floor) {
    _appendLog(d, t('battlesim206.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (!paralysed && d.player.stamina <= 0) {
    _appendLog(d, t('battlesim206.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _checkGhoulParalysis(d) {
  const { SVG_SKULL, _appendLog, _recordOutcome, t } = getContext();

  if (d.player.ghoulWoundCounter && d.player.woundEventsThisFight >= 4 && d.player.stamina > 0) {
    _appendLog(d, t('battlesim206.log.ghoul_paralysis', { skull: SVG_SKULL }));
    d.player.stamina = 0;
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
    return true;
  }
  return false;
}

function _testLuck() {
  const { FIRESPRITE_LUCKY_DMG, FIRESPRITE_UNLUCKY_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _checkGhoulParalysis, _data, _enemyFloor, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  const floor = _enemyFloor(d);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim206.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim206.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= floor) { _appendLog(d, t('battlesim206.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else if (event.kind === 'fire-sprite-wound') {
    const dmg = lucky ? FIRESPRITE_LUCKY_DMG : FIRESPRITE_UNLUCKY_DMG;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim206.log.firesprite_result', { roll, outcome: lucky ? t('battlesim206.log.lucky') : t('battlesim206.log.unlucky'), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.ghoulWoundCounter) d.player.woundEventsThisFight++;
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim206.log.luck_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim206.log.luck_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
  }
  const paralysed = _checkGhoulParalysis(d);
  if (!paralysed && d.player.stamina <= 0) {
    _appendLog(d, t('battlesim206.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { FIRESPRITE_BASELINE_DMG, SVG_SKULL, _appendLog, _checkGhoulParalysis, _data, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  const event = d.pendingLuckQueue.shift();
  if (event.kind === 'fire-sprite-wound') {
    // Declining the optional test keeps the flat 3 STAMINA baseline.
    d.player.stamina = Math.max(0, d.player.stamina - FIRESPRITE_BASELINE_DMG);
    _appendLog(d, t('battlesim206.log.firesprite_baseline', { n: FIRESPRITE_BASELINE_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.ghoulWoundCounter) d.player.woundEventsThisFight++;
    const paralysed = _checkGhoulParalysis(d);
    if (!paralysed && d.player.stamina <= 0) {
      _appendLog(d, t('battlesim206.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
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
  d.player.woundEventsThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim206.log.reset_sep'));
  _appendLog(d, t('battlesim206.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _krisBonus, _effectiveSkill, _resetEncounterKnobs, _enemyFloor, _runRound, _checkGhoulParalysis, _testLuck, _skipLuck, _resetBattle };
}

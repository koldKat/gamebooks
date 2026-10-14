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
  if (d.player.hasChainmail)    skill += 1;
  if (d.player.hasIronShield)   skill += 1;
  if (d.player.hasNinjaSword)   skill += 4;
  if (d.player.hasWingedHelmet) skill += 1;
  return skill;
}

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.instaKillEnemyAS = 0;
  d.player.instaKillOnEnemyWin = false;
  d.player.winAfterHits = 0;
  d.player.luckyKillOnWin = false;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim202.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  const enemyInstaKill = d.player.instaKillEnemyAS > 0 && enemyAS === d.player.instaKillEnemyAS;
  if (enemyInstaKill) {
    _appendLog(d, t('battlesim202.log.insta_fatal', { enemy: _enemyNameSafe(d), n: enemyAS }));
    d.player.stamina = 0;
    _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
    saveState();
    _renderAll();
    return;
  }

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim202.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    if (d.player.luckyKillOnWin) {
      // Mandatory Test Your Luck instead of a normal wound: Lucky finds the
      // weak point and ends the fight, Unlucky means this hit did nothing.
      d.pendingLuckQueue.push({ kind: 'weakpoint-hit' });
      _appendLog(d, t('battlesim202.log.weakpoint_hit', { enemy: _enemyNameSafe(d) }));
    } else {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      d.player.hitsLandedThisFight++;
      _appendLog(d, t('battlesim202.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
        d.enemy.stamina = 0;
        _appendLog(d, t('battlesim202.log.weakpoint_found'));
      }
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else if (d.player.instaKillOnEnemyWin) {
    _appendLog(d, t('battlesim202.log.enemy_insta_win', { enemy: _enemyNameSafe(d) }));
    d.player.stamina = 0;
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim202.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Side attackers roll independently each round and cannot be wounded.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim202.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    const sideInstaKill = d.player.instaKillEnemyAS > 0 && sideAS === d.player.instaKillEnemyAS;
    if (sideInstaKill) {
      _appendLog(d, t('battlesim202.log.side_insta_fatal', { enemy: _sideEnemyNameSafe(d), n: sideAS }));
      d.player.stamina = 0;
    } else if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim202.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim202.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
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
  if (event.kind === 'weakpoint-hit') {
    if (lucky) {
      d.enemy.stamina = 0;
      _appendLog(d, t('battlesim202.log.weakpoint_lucky', { roll, enemy: _enemyNameSafe(d) }));
      _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
      _recordOutcome(d, 'win');
    } else {
      _appendLog(d, t('battlesim202.log.weakpoint_unlucky', { roll, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim202.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim202.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim202.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim202.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  const event = d.pendingLuckQueue.shift();
  // Skipping a mandatory weak-point check declines the hit, matching failure.
  if (event.kind === 'weakpoint-hit') {
    _appendLog(d, t('battlesim202.log.weakpoint_decline', { stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
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
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim202.log.reset_sep'));
  _appendLog(d, t('battlesim202.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle };
}

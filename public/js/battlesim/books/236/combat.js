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

function _effectiveSkill(d) {

  let skill = d.player.skill;
  if (d.temporaryHeroism) skill += d.heroismSkillBonus || 0;
  if (d.player.demonSlayingSword) skill += 4;
  return skill;
}

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.thickArmour = false;
  d.player.myurrFight = false;
  d.player.heroismUsedThisFight = false;
  // Adopt the corrected rule only when starting a new encounter.
  d.temporaryHeroism = true;
  d.heroismSkillBonus = 0;
  d.consecutiveServantHits = true;
  d.lastServantHit = null;
}

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim236.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim236.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    // Myurr can only be wounded by a magical weapon (the Demon-Slaying sword).
    if (d.player.myurrFight && !d.player.demonSlayingSword) {
      _appendLog(d, t('battlesim236.log.no_effect', { enemy: _enemyNameSafe(d) }));
    } else {
      const dmg = d.player.thickArmour ? 1 : 2;
      d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg);
      _appendLog(d, t('battlesim236.log.you_wound', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.consecutiveServantHits && /\bdemonic servant\b/i.test(d.enemy.name)) {
        if (d.lastServantHit?.enemy === d.enemy.name && d.lastServantHit.round === d.roundsThisBattle - 1) {
          d.enemy.stamina = 0;
          _appendLog(d, t('battlesim236.log.servant_destroyed', { enemy: _enemyNameSafe(d) }));
        }
        d.lastServantHit = { enemy: d.enemy.name, round: d.roundsThisBattle };
      }
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, t('battlesim236.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Myurr's four arms let him attack twice per round; only the player's own
  // single attack (handled above) can ever wound him back.
  if (d.player.myurrFight && d.player.stamina > 0 && d.enemy.stamina > 0) {
    const playerAS2 = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS2  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim236.log.myurr_second', { playerAS: playerAS2, enemyAS: enemyAS2 }));
    if (enemyAS2 > playerAS2) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, t('battlesim236.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    } else {
      _appendLog(d, t('battlesim236.log.both_avoided'));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim236.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim236.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const bonus = d.player.thickArmour ? 1 : 2;
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - bonus);
      _appendLog(d, t('battlesim236.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim236.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim236.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim236.log.luck_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim236.log.luck_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim236.log.fallen', { skull: SVG_SKULL }));
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
  d.consecutiveServantHits = true;
  d.lastServantHit = null;
  if (d.log.length) _appendLog(d, t('battlesim236.log.reset_sep'));
  _appendLog(d, t('battlesim236.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _effectiveSkill, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle };
}

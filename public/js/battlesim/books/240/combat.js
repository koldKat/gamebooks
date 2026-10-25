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

function _sideEnemyNameSafe(s, i) {
  const { escapeHtml, t } = getContext();
 return escapeHtml(s.name.trim() || t('battlesim240.ui.side_default', { n: i + 1 })); }

function _effectiveSkill(d) {
  const { WEAPONS } = getContext();

  return d.player.skill - WEAPONS[d.player.weapon].atkPenalty;
}

function _woundValues() {
  const { WEAPONS } = getContext();

  return WEAPONS.sword; // dealt-damage table is weapon-based, applied where enemy is wounded
}

function _absorbHit(d, rawDmg, isLucky, isUnlucky) {
  const { ARMOURS, _appendLog, t } = getContext();

  const a = ARMOURS[d.player.armour];
  if (d.player.armour === 'none' || d.player.armourHitsLeft <= 0) return rawDmg;
  d.player.armourHitsLeft--;
  const dmg = isLucky ? a.lucky : isUnlucky ? a.unlucky : a.normal;
  if (d.player.armourHitsLeft <= 0) {
    _appendLog(d, t('battlesim240.log.armour_broke', { armour: t(`battlesim240.armour.${d.player.armour}`) }));
    d.player.armour = 'none';
  }
  return dmg;
}

function _runRound() {
  const { ARMOURS, DISARM_MARGIN, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, WEAPONS, _absorbHit, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;
  d.pendingLuckQueue = [];

  const w = WEAPONS[d.player.weapon];

  // Primary exchange
  const playerRoll = _roll2d6() + _effectiveSkill(d);
  const enemyRoll   = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim240.log.round', { round: d.roundsThisBattle, playerAS: playerRoll, enemy: _enemyNameSafe(d), enemyAS: enemyRoll }));
  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim240.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    if (d.disarmMode) {
      if (playerRoll - enemyRoll >= DISARM_MARGIN) {
        _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.disarmed', { enemy: _enemyNameSafe(d) })}`);
        d.enemy.stamina = 0;
      } else {
        _appendLog(d, t('battlesim240.log.disarm_no_margin', { enemy: _enemyNameSafe(d) }));
      }
    } else if (d.immuneToWounds) {
      _appendLog(d, t('battlesim240.log.no_effect', { enemy: _enemyNameSafe(d) }));
    } else {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - w.normal);
      _appendLog(d, t('battlesim240.log.you_wound', { enemy: _enemyNameSafe(d), n: w.normal, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else {
    const armour = d.player.armourHitsLeft > 0 ? ARMOURS[d.player.armour] : null;
    const dmg = _absorbHit(d, d.correctedCombatRules ? 2 : w.normal, false, false);
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    if (d.voivodThrives && dmg > 0) d.enemy.stamina += dmg;
    _appendLog(d, t('battlesim240.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.voivodThrives && dmg > 0) _appendLog(d, t('battlesim240.log.voivod_thrives', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina }));
    if (d.player.stamina > 0 && dmg > 0) d.pendingLuckQueue.push(d.correctedCombatRules
      ? { kind: 'enemy-hit', damage: dmg, luckyDamage: armour ? armour.lucky : 1, unluckyDamage: armour ? armour.unlucky : 3 }
      : { kind: 'enemy-hit' });
  }

  // Side-enemy exchanges (group fights)
  if (d.groupFight) {
    for (let i = 0; i < d.sideEnemies.length; i++) {
      const s = d.sideEnemies[i];
      if (d.player.stamina <= 0) break;
      const sPlayerRoll = _roll2d6() + _effectiveSkill(d);
      const sRoll = _roll2d6() + s.skill;
      _appendLog(d, t('battlesim240.log.side_round', { enemy: _sideEnemyNameSafe(s, i), playerAS: sPlayerRoll, enemyAS: sRoll }));
      if (sPlayerRoll > sRoll) {
        _appendLog(d, t('battlesim240.log.side_fend', { enemy: _sideEnemyNameSafe(s, i) }));
      } else if (sPlayerRoll < sRoll) {
        // Only the chosen target can be disarmed; side attackers are merely parried.
        const dmg = _absorbHit(d, SIDE_WOUND_DMG, false, false);
        d.player.stamina = Math.max(0, d.player.stamina - dmg);
        _appendLog(d, t('battlesim240.log.side_wounds', { enemy: _sideEnemyNameSafe(s, i), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      } else {
        _appendLog(d, t('battlesim240.log.both_avoided'));
      }
    }
  }

  if (d.correctedCombatRules && d.player.stamina <= 0) {
    d.pendingLuckQueue = [];
    _appendLog(d, `${SVG_SKULL} ${t('battlesim240.log.fallen')}`);
    _recordOutcome(d, 'loss');
  } else if (d.enemy.stamina <= 0) {
    if (d.correctedCombatRules) d.pendingLuckQueue = [];
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    d.pendingLuckQueue = [];
    _appendLog(d, `${SVG_SKULL} ${t('battlesim240.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, WEAPONS, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  if (d.player.stamina <= 0 || d.enemy.stamina <= 0) {
    d.pendingLuckQueue = [];
    saveState();
    _renderAll();
    return;
  }
  if (d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  const w = WEAPONS[d.player.weapon];
  if (event.kind === 'player-hit') {
    const extra = lucky ? (w.lucky - w.normal) : -(w.normal - w.unlucky);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
    const key = lucky ? 'battlesim240.log.luck_player_hit_lucky' : 'battlesim240.log.luck_player_hit_unlucky';
    _appendLog(d, t(key, { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
  } else {
    // Adjust incoming hits to 1/3 total STAMINA loss for lucky/unlucky results, without further armour reduction.
    if (d.correctedCombatRules && event.damage !== undefined) {
      const adjustment = event.damage - (lucky ? event.luckyDamage : event.unluckyDamage);
      d.player.stamina = Math.max(0, Math.min(d.player.staminaInitial, d.player.stamina + adjustment));
      if (d.voivodThrives) d.enemy.stamina = Math.max(0, d.enemy.stamina - adjustment);
    } else if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      if (d.voivodThrives) d.enemy.stamina += 1;
    }
    const key = lucky ? 'battlesim240.log.luck_hit_lucky' : 'battlesim240.log.luck_hit_unlucky';
    _appendLog(d, t(key, { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (!lucky && d.voivodThrives) _appendLog(d, t('battlesim240.log.voivod_thrives', { enemy: _enemyNameSafe(d), n: 1, stamina: d.enemy.stamina }));
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} ${t('battlesim240.log.fallen')}`); _recordOutcome(d, 'loss'); }
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
  if (d.log.length) _appendLog(d, t('battlesim240.log.reset_sep'));
  _appendLog(d, t('battlesim240.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _rollForSkull() {
  const { SHADOW_RULES, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll1d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !d.immuneToWounds || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const roll = _roll1d6();
  if (roll === SHADOW_RULES.skullWinFace) {
    _appendLog(d, t('battlesim240.log.skull_hit', { roll }));
    d.enemy.stamina = 0;
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim240.log.skull_miss', { roll }));
  }
  saveState();
  _renderAll();
}

function _rollSpearLifeForce() {
  const { _appendLog, _data, _renderAll, _roll1d6, saveState, t } = getContext();

  const d = _data();
  if (!d || d.player.spearRolled) return;
  d.player.spearLifeForce = _roll1d6() + 5;
  d.player.spearRolled = true;
  d.player.hasSpear = true;
  _appendLog(d, t('battlesim240.log.spear_rolled', { n: d.player.spearLifeForce }));
  saveState();
  _renderAll();
}

function _empowerSpear() {
  const { SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !d.voivodDefensive || !d.player.hasSpear || d.player.spearLifeForce <= 0) return;
  if (d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const roll = _roll2d6();
  if (roll <= d.player.spearLifeForce) {
    _appendLog(d, t('battlesim240.log.spear_empower_success', { roll, n: d.player.spearLifeForce }));
    d.enemy.stamina = 0;
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    d.player.spearLifeForce--;
    _appendLog(d, t('battlesim240.log.spear_empower_fail', { roll, n: d.player.spearLifeForce }));
    if (d.player.spearLifeForce <= 0) _appendLog(d, t('battlesim240.log.spear_spent'));
  }
  saveState();
  _renderAll();
}

function _addSideEnemy() {
  const { MAX_SIDE_ENEMIES, _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || d.sideEnemies.length >= MAX_SIDE_ENEMIES) return;
  d.sideEnemies.push({ name: '', skill: 6 });
  saveState();
  _renderAll();
}

function _removeSideEnemy(idx) {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d) return;
  d.sideEnemies.splice(idx, 1);
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _woundValues, _absorbHit, _runRound, _testLuck, _skipLuck, _resetBattle, _rollForSkull, _rollSpearLifeForce, _empowerSpear, _addSideEnemy, _removeSideEnemy };
}

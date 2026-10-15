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

function _runHandToHandRound() {
  const { HAND_WOUND_DMG, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _notReady, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.skill;
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim208.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - HAND_WOUND_DMG);
    _appendLog(d, t('battlesim208.log.you_wound', { enemy: _enemyNameSafe(d), n: HAND_WOUND_DMG, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else if (playerAS < enemyAS) {
    d.stamina = Math.max(0, d.stamina - HAND_WOUND_DMG);
    _appendLog(d, t('battlesim208.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: HAND_WOUND_DMG, stamina: d.stamina, staminaMax: d.staminaInitial }));
  } else {
    _appendLog(d, t('battlesim208.log.both_avoided'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _weaponDamage(weapon) {
  const { LASH_DMG, UNARMED_DMG, _roll1d6 } = getContext();

  if (weapon === 'lash')    return { amount: LASH_DMG, note: '' };
  if (weapon === 'unarmed') return { amount: UNARMED_DMG, note: '' };
  const r = _roll1d6();
  return { amount: r, note: ` (1d6 roll ${r})` }; // assault blaster
}

function _resolvePlayerHit(d, dmg) {
  const { _appendLog, _roll2d6, t } = getContext();

  const before = d.armour;
  const roll = _roll2d6();
  d.armour = Math.max(0, d.armour - 1);
  if (roll <= before) {
    _appendLog(d, t('battlesim208.log.armour_absorb', { roll, before, armour: d.armour }));
    return;
  }
  d.stamina = Math.max(0, d.stamina - dmg.amount);
  const dmgText = Number.isFinite(dmg.amount) ? t('battlesim208.log.dmg_amount', { n: dmg.amount, note: dmg.note }) : t('battlesim208.log.dmg_fatal', { note: dmg.note });
  _appendLog(d, t('battlesim208.log.armour_penetrate', { roll, before, dmgText, armour: d.armour, stamina: d.stamina, staminaMax: d.staminaInitial }));
}

function _runGunfireRound() {
  const { DEITY_WEAPONS, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _notReady, _renderAll, _resolvePlayerHit, _roll2d6, _weaponDamage, escapeHtml, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim208.log.gunfire_round', { round: d.roundsThisBattle }));

  const shots = d.enemyExtraAttack ? 2 : 1;

  const playerRoll = _roll2d6();
  _appendLog(d, t('battlesim208.log.you_fire', { roll: playerRoll, skill: d.skill }));
  if (playerRoll < d.skill) {
    const dmg = _weaponDamage(d.weapon);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg.amount);
    _appendLog(d, t('battlesim208.log.you_hit', { enemy: _enemyNameSafe(d), n: dmg.amount, note: dmg.note, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else {
    _appendLog(d, t('battlesim208.log.miss'));
  }

  if (d.enemy.stamina > 0) {
    for (let i = 0; i < shots && d.stamina > 0; i++) {
      let enemySkill = d.enemy.skill, weaponLabel = null, dmg;
      if (d.deityMode) {
        // Even disintegrator damage uses the ARMOUR test (sec 308).
        const w = DEITY_WEAPONS[Math.floor(Math.random() * DEITY_WEAPONS.length)];
        enemySkill  = w.skill;
        weaponLabel = w.name;
        dmg = w.instant ? { amount: Infinity, note: ' - instant destruction' } : (w.dmg != null ? { amount: w.dmg, note: '' } : _weaponDamage('blaster'));
      } else {
        dmg = _weaponDamage(d.enemyWeapon);
      }
      const enemyRoll = _roll2d6();
      _appendLog(d, t('battlesim208.log.enemy_fires', { enemy: _enemyNameSafe(d), weapon: weaponLabel ? t('battlesim208.log.enemy_fires_weapon_suffix', { weapon: escapeHtml(t(weaponLabel)) }) : '', roll: enemyRoll, skill: enemySkill }));
      if (enemyRoll < enemySkill) {
        _resolvePlayerHit(d, dmg);
      } else {
        _appendLog(d, t('battlesim208.log.miss'));
      }
      if (d.stamina <= 0) break;
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim208.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.stamina <= 0) {
    _appendLog(d, t('battlesim208.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const { _data, _runGunfireRound, _runHandToHandRound } = getContext();

  const d = _data();
  if (!d) return;
  if (d.mode === 'handtohand') _runHandToHandRound();
  else _runGunfireRound();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.stamina = d.enemy.staminaMax;
  d.stamina = d.staminaInitial;
  if (d.log.length) _appendLog(d, t('battlesim208.log.reset_sep'));
  _appendLog(d, t('battlesim208.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _runHandToHandRound, _weaponDamage, _resolvePlayerHit, _runGunfireRound, _checkBattleEnd, _runRound, _resetBattle };
}

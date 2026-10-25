// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _freshCrewMember() {

  return { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, alive: true, replaced: false };
}

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

function _enemyShipNameSafe(d) {
  const { escapeHtml } = getContext();
 return escapeHtml(d.enemyShip.name.trim() || 'the alien ship'); }

function _fighterLabel(d) {
  const { t } = getContext();
 return t(`battlesim186.crew.${d.fighterKey}`) || t('battlesim186.crew.captain'); }

function _fighter(d) {
 return d.crew[d.fighterKey] || d.crew.captain; }

function _isOfficer(key) {
  const { CREW } = getContext();
 const spec = CREW.find(c => c[0] === key); return spec ? spec[2] : false; }

function _effectiveSkill(d) {
  const { HELMET_SKILL_BONUS, OFFICER_PENALTY, _fighter, _isOfficer } = getContext();

  const f = _fighter(d);
  let skill = f.skill;
  if (_isOfficer(d.fighterKey) && !d.waiveOfficerPenalty) skill -= OFFICER_PENALTY;
  if (d.hasHelmet) skill += HELMET_SKILL_BONUS;
  skill += (d.attackModifier || 0);
  return skill;
}

function _rollDamage(variant) {
  const { NORMAL_DMG, STARSHIP_DAMAGE_RULES, _roll1d6 } = getContext();

  if (variant === 'nerve') {
    const r = _roll1d6();
    const rule = STARSHIP_DAMAGE_RULES.nerve;
    return { amount: r >= rule.threshold ? rule.damage : rule.ordinaryDamage, note: ` (nerve-stick roll ${r})` };
  }
  if (variant === 'armor') {
    const r = _roll1d6();
    const rule = STARSHIP_DAMAGE_RULES.armor;
    return { amount: r >= rule.threshold ? rule.damage : rule.blockedDamage, note: ` (armor roll ${r})` };
  }
  return { amount: NORMAL_DMG, note: '' };
}

function _runHandToHandRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _fighter, _fighterLabel, _notReady, _recordOutcome, _renderAll, _roll2d6, _rollDamage, escapeHtml, saveState, t } = getContext();

  const d = _data();
  const f = _fighter(d);
  if (!d || _notReady(d) || f.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + _effectiveSkill(d);
  let enemyAS = _roll2d6() + d.enemy.skill;
  let enemyAS2 = null;
  if (d.enemyExtraAttack) enemyAS2 = _roll2d6() + d.enemy.skill;
  const enemyBest = enemyAS2 !== null ? Math.max(enemyAS, enemyAS2) : enemyAS;

  _appendLog(d, t('battlesim186.log.round', { round: d.roundsThisBattle, fighter: escapeHtml(_fighterLabel(d)), playerAS, enemy: _enemyNameSafe(d), enemyAS, enemyAS2: enemyAS2 !== null ? `/${enemyAS2}` : '' }));

  if (playerAS > enemyBest) {
    const dmg = _rollDamage(d.playerDamageVariant);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg.amount);
    _appendLog(d, t('battlesim186.log.fighter_wounds', { fighter: escapeHtml(_fighterLabel(d)), enemy: _enemyNameSafe(d), n: dmg.amount, note: dmg.note, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else if (playerAS < enemyBest) {
    const hits = enemyAS2 !== null ? [enemyAS, enemyAS2].filter(r => r > playerAS).length : 1;
    for (let i = 0; i < hits; i++) {
      if (f.stamina <= 0) break;
      const dmg = _rollDamage(d.enemyDamageVariant);
      f.stamina = Math.max(0, f.stamina - dmg.amount);
      _appendLog(d, t('battlesim186.log.enemy_wounds_fighter', { enemy: _enemyNameSafe(d), fighter: escapeHtml(_fighterLabel(d)), n: dmg.amount, note: dmg.note, stamina: f.stamina, staminaMax: f.staminaInitial }));
    }
  } else {
    _appendLog(d, t('battlesim186.log.both_avoided'));
  }

  // Extra attackers roll independently and can deal damage but cannot receive it.
  if (d.extraAttacker && d.extraSkill > 0 && f.stamina > 0 && d.enemy.stamina > 0) {
    const extraAS = _roll2d6() + d.extraSkill;
    const defenderAS = d.extraTarget === 'enemy' ? playerAS : enemyBest;
    const defenderLabel = d.extraTarget === 'enemy' ? _enemyNameSafe(d) : escapeHtml(_fighterLabel(d));
    _appendLog(d, t('battlesim186.log.extra_attacker_roll', { extraAS, defender: defenderLabel, defenderAS }));
    if (extraAS > defenderAS) {
      if (d.extraTarget === 'enemy') {
        const dmg = _rollDamage(d.playerDamageVariant);
        d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg.amount);
        _appendLog(d, t('battlesim186.log.extra_wounds_enemy', { enemy: _enemyNameSafe(d), n: dmg.amount, note: dmg.note, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      } else {
        const dmg = _rollDamage(d.enemyDamageVariant);
        f.stamina = Math.max(0, f.stamina - dmg.amount);
        _appendLog(d, t('battlesim186.log.extra_wounds_fighter', { fighter: escapeHtml(_fighterLabel(d)), n: dmg.amount, note: dmg.note, stamina: f.stamina, staminaMax: f.staminaInitial }));
      }
    } else {
      _appendLog(d, t('battlesim186.log.extra_fended_off'));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim186.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (f.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim186.log.fighter_fallen', { fighter: escapeHtml(_fighterLabel(d)) })}`);
    f.alive = false;
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _playerPhaserShot(d, f) {
  const { SVG_TROPHY, _appendLog, _effectiveSkill, _enemyNameSafe, _fighterLabel, _recordOutcome, _roll2d6, escapeHtml, t } = getContext();

  const skill = _effectiveSkill(d);
  const roll = _roll2d6();
  _appendLog(d, t('battlesim186.log.fighter_fires', { fighter: escapeHtml(_fighterLabel(d)), roll, skill }));
  if (roll < skill) {
    d.enemy.stamina = 0;
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim186.log.phaser_hit', { enemy: _enemyNameSafe(d), result: d.phaserSetting === 'stun' ? t('battlesim186.log.phaser_stunned') : t('battlesim186.log.phaser_killed') })}`);
    _recordOutcome(d, 'win');
    return true;
  }
  _appendLog(d, t('battlesim186.log.miss'));
  return false;
}

function _enemyPhaserShot(d, f) {
  const { SVG_SKULL, _appendLog, _enemyNameSafe, _fighterLabel, _recordOutcome, _roll2d6, escapeHtml, t } = getContext();

  const enemyRoll = _roll2d6();
  _appendLog(d, t('battlesim186.log.enemy_fires', { enemy: _enemyNameSafe(d), roll: enemyRoll, skill: d.enemy.skill }));
  if (enemyRoll < d.enemy.skill) {
    f.stamina = 0;
    f.alive = false;
    _appendLog(d, `${SVG_SKULL} ${t('battlesim186.log.phaser_enemy_hit', { fighter: escapeHtml(_fighterLabel(d)) })}`);
    _recordOutcome(d, 'loss');
    return true;
  }
  _appendLog(d, t('battlesim186.log.miss'));
  return false;
}

function _runPhaserRound() {
  const { _appendLog, _data, _enemyPhaserShot, _fighter, _notReady, _playerPhaserShot, _renderAll, saveState, t } = getContext();

  const d = _data();
  const f = _fighter(d);
  if (!d || _notReady(d) || f.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim186.log.round_no_as', { round: d.roundsThisBattle }));

  if (d.enemyFiresFirst) {
    if (_enemyPhaserShot(d, f)) { saveState(); _renderAll(); return; }
    _playerPhaserShot(d, f);
  } else {
    if (_playerPhaserShot(d, f)) { saveState(); _renderAll(); return; }
    _enemyPhaserShot(d, f);
  }

  saveState();
  _renderAll();
}

function _shipIsDestroyed(d, ship) {

  return d.shipCombatRulesVersion === 2 ? ship.destroyed === true : ship.shields <= 0;
}

function _startShipFight(d, enemy) {

  d.enemyShip.name = enemy.name;
  if (enemy.attack != null) d.enemyShip.weapons = enemy.attack;
  if (enemy.hp != null) {
    d.enemyShip.shields = enemy.hp;
    d.enemyShip.shieldsMax = enemy.hp;
  }
  d.shipCombatRulesVersion = 2;
  d.ship.destroyed = false;
  d.enemyShip.destroyed = false;
  d.roundsThisBattle = 0;
}

function _playerShipShot(d) {
  const { SVG_TROPHY, _appendLog, _enemyShipNameSafe, _recordOutcome, _roll2d6, _shipIsDestroyed, t } = getContext();

  const toHit = _roll2d6();
  _appendLog(d, t('battlesim186.log.ship_fire', { roll: toHit, weapons: d.ship.weapons }));
  if (toHit < d.ship.weapons) {
    const dmgRoll = _roll2d6();
    const dmg = dmgRoll === 12 ? 6 : (dmgRoll <= d.enemyShip.shields ? 2 : 4);
    if (d.shipCombatRulesVersion === 2 && d.enemyShip.shields <= 0) d.enemyShip.destroyed = true;
    d.enemyShip.shields = Math.max(0, d.enemyShip.shields - dmg);
    _appendLog(d, t('battlesim186.log.ship_direct_hit', { dmgRoll, dmg, enemy: _enemyShipNameSafe(d), shields: d.enemyShip.shields }));
  } else {
    _appendLog(d, t('battlesim186.log.miss'));
  }
  if (_shipIsDestroyed(d, d.enemyShip)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim186.log.ship_explodes', { enemy: _enemyShipNameSafe(d) })}`);
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _enemyShipShot(d) {
  const { SVG_SKULL, _appendLog, _enemyShipNameSafe, _recordOutcome, _roll2d6, _shipIsDestroyed, t } = getContext();

  const toHit = _roll2d6();
  _appendLog(d, t('battlesim186.log.enemyship_fire', { enemy: _enemyShipNameSafe(d), roll: toHit, weapons: d.enemyShip.weapons }));
  if (toHit < d.enemyShip.weapons) {
    const dmgRoll = _roll2d6();
    const dmg = dmgRoll === 12 ? 6 : (dmgRoll <= d.ship.shields ? 2 : 4);
    if (d.shipCombatRulesVersion === 2 && d.ship.shields <= 0) d.ship.destroyed = true;
    d.ship.shields = Math.max(0, d.ship.shields - dmg);
    _appendLog(d, t('battlesim186.log.ship_direct_hit_you', { dmgRoll, dmg, shields: d.ship.shields }));
  } else {
    _appendLog(d, t('battlesim186.log.miss'));
  }
  if (_shipIsDestroyed(d, d.ship)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim186.log.ship_destroyed')}`);
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _runShipRound() {
  const { _appendLog, _data, _enemyShipShot, _notReady, _playerShipShot, _renderAll, _shipIsDestroyed, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.enemyShip.shieldsMax <= 0 || _shipIsDestroyed(d, d.ship) || _shipIsDestroyed(d, d.enemyShip)) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim186.log.round_no_as', { round: d.roundsThisBattle }));

  if (d.enemyFiresFirst) {
    if (_enemyShipShot(d)) { saveState(); _renderAll(); return; }
    _playerShipShot(d);
  } else {
    if (_playerShipShot(d)) { saveState(); _renderAll(); return; }
    _enemyShipShot(d);
  }

  saveState();
  _renderAll();
}

function _runRound() {
  const { _data, _runHandToHandRound, _runPhaserRound, _runShipRound } = getContext();

  const d = _data();
  if (!d) return;
  if (d.mode === 'handtohand') _runHandToHandRound();
  else if (d.mode === 'phaser') _runPhaserRound();
  else _runShipRound();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _enemyShipNameSafe, _fighter, _fighterLabel, _renderAll, escapeHtml, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  if (d.mode === 'ship') {
    d.enemyShip.shields = d.enemyShip.shieldsMax;
    d.ship.shields = d.ship.shieldsInitial;
    if (d.shipCombatRulesVersion === 2) {
      d.ship.destroyed = false;
      d.enemyShip.destroyed = false;
    }
    if (d.log.length) _appendLog(d, t('battlesim186.log.reset_sep'));
    _appendLog(d, t('battlesim186.log.reset_ship', { enemy: _enemyShipNameSafe(d) }));
  } else {
    const f = _fighter(d);
    d.enemy.stamina = d.enemy.staminaMax;
    f.stamina = f.staminaInitial;
    f.alive = true;
    if (d.log.length) _appendLog(d, t('battlesim186.log.reset_sep'));
    _appendLog(d, t('battlesim186.log.reset_crew', { enemy: _enemyNameSafe(d), fighter: escapeHtml(_fighterLabel(d)) }));
  }
  saveState();
  _renderAll();
}

function _replaceCrewMember(key) {
  const { _appendLog, _data, _renderAll, _roll2d6, escapeHtml, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const c = d.crew[key];
  if (!c || key === 'captain') return;
  const oldSkill = c.skillInitial;
  c.skillInitial = Math.max(0, oldSkill - 2);
  c.skill = c.skillInitial;
  c.staminaInitial = _roll2d6() + 12;
  c.stamina = c.staminaInitial;
  c.alive = true;
  c.replaced = true;
  _appendLog(d, t('battlesim186.log.crew_replaced', { name: escapeHtml(t(`battlesim186.crew.${key}`)), skill: c.skillInitial, stamina: c.staminaInitial }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _freshCrewMember, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _enemyShipNameSafe, _fighterLabel, _fighter, _isOfficer, _effectiveSkill, _rollDamage, _runHandToHandRound, _playerPhaserShot, _enemyPhaserShot, _runPhaserRound, _shipIsDestroyed, _startShipFight, _playerShipShot, _enemyShipShot, _runShipRound, _runRound, _resetBattle, _replaceCrewMember };
}

// Resolve Magnakai table encounters; character setup, story choices and travel stay outside this engine.
export function createMagnakaiCombat(getContext, prefix) {
  const tk = (key, values) => getContext().t(prefix + '.' + key, values);
// BEGIN EXTRACTED RULES
function _rulesFor(section) {
  const { ENCOUNTER_RULES } = getContext();
  return ENCOUNTER_RULES[section] || {};
}

function _ratioCol(ratio) {

  if (ratio <= -11) return 0;
  if (ratio <= -9) return 1;
  if (ratio <= -7) return 2;
  if (ratio <= -5) return 3;
  if (ratio <= -3) return 4;
  if (ratio <= -1) return 5;
  if (ratio === 0) return 6;
  if (ratio <= 2) return 7;
  if (ratio <= 4) return 8;
  if (ratio <= 6) return 9;
  if (ratio <= 8) return 10;
  if (ratio <= 10) return 11;
  return 12;
}

function _pickRow(pick) {
 return pick === 0 ? 9 : pick - 1; }

function _pick10() {
 return Math.floor(Math.random() * 10); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _captureFightEffects(d) {
  const { _effectiveSkill, _rulesFor, effectControls = [], numericEffectControls = [] } = getContext();

  d.printedRules = 1;
  const section = Number(d.nextSection) || 0;
  d.recordedThisBattle = false;
  const ruleKey = d.nextEncounterKey || section;
  const rules = _rulesFor(ruleKey);
  d.combatEffects = {
    captured: true, section, ruleKey,
    psychic: d.nextPsychic || 'none',
    usedPsychicPowers: {},
    animal: !!d.nextAnimal, tracking: !!d.nextTracking, nexus: !!d.nextNexus,
    sommerwerd: !!d.nextSommerwerd,
    curing: !!d.nextCuring, circleLight: !!d.nextCircleLight,
    cloth: !!d.nextCloth, invisibility: !!d.nextInvisibility,
    bowMastery: !!d.nextBowMastery, jackan: !!d.nextJackan,
    bowModifier: Number(d.nextBowModifier) || 0,
    ...Object.fromEntries(effectControls.map(([key, field]) => [key, !!d[field]])),
    ...Object.fromEntries(numericEffectControls.map(([key, field]) => [key, Number(d[field]) || 0])),
    ...(rules.archery ? { targetPoints: rules.archery.targetPoints } : {}),
  };
  if (rules.archery) d.enemy.endurance = d.enemy.enduranceMax = rules.archery.targetPoints;
  const boost = rules.temporaryBoost;
  if (boost && d.combatEffects[boost.whenTrue]) {
    d.combatEffects.temporaryBoost = {skill: boost.skill, endurance: boost.endurance, active: true};
    d.endurance += boost.endurance;
    d.enduranceInitial += boost.endurance;
    getContext()._appendLog(d, tk('log.temporary_boost_started', boost));
  }
  const mirror = rules.mirrorPlayerEndurance;
  if (mirror) {
    const deduction = d.combatEffects[mirror.minusIf] ? mirror.amount : 0;
    d.enemy.endurance = d.enemy.enduranceMax = Math.max(0, d.endurance - deduction);
  }
  d.ratio = _combatRatio(d);
  if (mirror && rules.stop && d.enemy.endurance <= rules.stop.endurance) _setRoute(d, rules.stop.route);
  if (rules.entryRoute && d.combatEffects[rules.entryRoute.whenTrue]) _setRoute(d, rules.entryRoute.route);
}

function _finishCombatEffects(d) {
  const boost = d.combatEffects?.temporaryBoost;
  if (!boost?.active) return;
  boost.active = false;
  d.enduranceInitial = Math.max(0, d.enduranceInitial - boost.endurance);
  if (d.endurance > 0) d.endurance = Math.max(1, d.endurance - boost.endurance);
  getContext()._appendLog(d, tk('log.temporary_boost_ended', boost));
}

function _health(d) {
  const { _rulesFor } = getContext();
 return _rulesFor(d.combatEffects?.ruleKey ?? d.combatEffects?.section).archery ? d.combatEffects.targetPoints : d.endurance; }

function _psychicProfile(d) {
  const profile = getContext().combatOptions?.psychicProfile;
  return profile && (!profile.whenTrue || d.combatEffects?.[profile.whenTrue]) ? profile
    : {blast: 2, surge: 4, cost: 2, minimumEndurance: 6};
}

function _equipmentAvailable(d) {
  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (Number.isFinite(rules.fixedRatio)) return false;
  return !((rules.ignoreEquipment || d.roundsThisBattle < (rules.ignoreEquipmentRounds || 0))
    && !(rules.ignoreEquipmentUnless && effects[rules.ignoreEquipmentUnless]));
}

function _permanentLoss(d, amount) {
  if (!(amount > 0)) return;
  d.enduranceInitial = Math.max(0, d.enduranceInitial - amount);
  d.endurance = Math.min(d.endurance, d.enduranceInitial);
  const boost = d.combatEffects?.temporaryBoost;
  if (d.enduranceInitial <= (d.combatEffects?.armorEndurance || 0) + (boost?.active ? boost.endurance : 0)) d.endurance = 0;
  getContext()._appendLog(d, tk('log.permanent_loss', {n: amount}));
}

function _healingAvailable(d) {
  const rule = getContext().combatOptions?.healing;
  return !!(rule && d.combatEffects?.[rule.whenTrue] && d.combatEffects?.[rule.available]
    && d.rolled && !d.combatEffects.finished && d.enemy.endurance > 0
    && d.endurance > 0 && d.endurance <= rule.threshold && d.endurance < d.enduranceInitial);
}

function _heal(d) {
  if (!_healingAvailable(d)) throw new RangeError('Combat healing unavailable');
  const rule = getContext().combatOptions.healing;
  const restored = Math.min(rule.amount, d.enduranceInitial - d.endurance);
  d.endurance += restored;
  d.combatEffects[rule.available] = false;
  d[rule.setupField] = false;
  getContext()._appendLog(d, tk('log.combat_healed', {restored}));
}

function _psychic(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects?.captured) return 'none';
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (rules.psychicImmune || Number.isFinite(rules.fixedSkill) || Number.isFinite(rules.fixedRatio)) return 'none';
  if (effects.psychic === 'blast' && !rules.blastImmune) return 'blast';
  if (effects.psychic === 'surge' && !rules.surgeImmune && d.endurance > _psychicProfile(d).minimumEndurance) return 'surge';
  const power = getContext().combatOptions?.psychicModes?.[effects.psychic];
  if (power && !rules[power.immunityFlag] && d.endurance > power.minimumEndurance
      && !(power.oncePerCombat && effects.usedPsychicPowers?.[effects.psychic])) return effects.psychic;
  return 'none';
}

function _effectiveSkill(d) {

  const effects = d.combatEffects;
  if (!effects?.captured) return d.combatSkill + (d.attackModifier || 0);
  const { _rulesFor, _psychic } = getContext();
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (Number.isFinite(rules.fixedRatio)) return d.combatSkill;
  if (Number.isFinite(rules.fixedSkill)) return rules.fixedSkill;
  if (rules.archery) return d.combatSkill + effects.bowModifier + (effects.bowMastery ? rules.archery.masteryBonus : 0) - (effects.jackan ? rules.archery.jackanPenalty : 0);
  const opening = rules.openingEquipment;
  const equipment = opening && d.roundsThisBattle < opening.rounds
    ? (effects[opening.modifierControl] || 0) + (effects[opening.bonusWhen] ? opening.bonus : 0)
    : (d.attackModifier || 0);
  let skill = d.combatSkill + (_equipmentAvailable(d) ? equipment : 0) + (effects.temporaryBoost?.active ? effects.temporaryBoost.skill : 0);
  const psychic = _psychic(d);
  const conditionalMultiplier = rules.psychicSkillMultiplierWhen;
  const psychicMultiplier = conditionalMultiplier && effects[conditionalMultiplier.whenTrue]
    ? conditionalMultiplier.multiplier : (rules.psychicSkillMultiplier || 1);
  const profile = _psychicProfile(d);
  if (psychic === 'blast') skill += profile.blast * psychicMultiplier;
  if (psychic === 'surge') skill += profile.surge * psychicMultiplier;
  const power = getContext().combatOptions?.psychicModes?.[psychic];
  if (power) skill += (rules.psychicBonuses?.[psychic] ?? power.bonus) * psychicMultiplier;
  for (const adjustment of rules.skillAdjustments || []) {
    if (d.roundsThisBattle >= adjustment.maxRounds || adjustment.unlessAny?.some(flag => effects[flag]) || adjustment.whenFalse && effects[adjustment.whenFalse]
        || adjustment.whenTrue && !effects[adjustment.whenTrue]) continue;
    skill += adjustment.amount;
  }
  for (const adjustment of rules.numericSkillAdjustments || []) {
    skill += (effects[adjustment.control] || 0) * adjustment.amount;
  }
  if (effects.animal) skill += rules.animalBonus || 0;
  return skill;
}

function _combatRatio(d) {
  const { _rulesFor, _effectiveSkill } = getContext();
  const rules = _rulesFor(d.combatEffects?.ruleKey ?? d.combatEffects?.section);
  return Number.isFinite(rules.fixedRatio) ? rules.fixedRatio : _effectiveSkill(d) - d.enemy.skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _finishCombatEffects(d);
  _appendLog(d, tk('log.continue', { section }));
}

function _escapeRule(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects || {};
  const escape = _rulesFor(effects.ruleKey ?? effects.section).escape;
  return (Array.isArray(escape) ? escape : escape ? [escape] : []).find(rule =>
    d.roundsThisBattle >= (rule.minRounds || 0)
    && (rule.maxRounds === undefined || d.roundsThisBattle <= rule.maxRounds)
    && (rule.maximumEnemyEndurance === undefined || d.enemy.endurance <= rule.maximumEnemyEndurance)
    && (!rule.whenTrue || effects[rule.whenTrue]) && (!rule.whenFalse || !effects[rule.whenFalse]));
}

function _escapeRoute(d) {
  const { _escapeRule } = getContext();
  return _escapeRule(d)?.route || 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRule, _health, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const rule = _escapeRule(d);
  if (!rule) return;
  if (!rule.immediate && !rule.skipRound) _runRound(true);
  if (_health(d) > 0 && !d.combatEffects?.finished) _setRoute(d, rule.route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _health, _psychic, _pick10, _pickRow, _ratioCol, _renderAll, _rulesFor, _setRoute, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (rules.roundLimit && d.roundsThisBattle >= rules.roundLimit.rounds) {
    _setRoute(d, rules.roundLimit.route); saveState(); _renderAll(); return;
  }
  const startingEndurance = d.endurance;
  const startingEnemyEndurance = d.enemy.endurance;
  // Click handlers pass an Event, not the explicit escape flag.
  escaping = escaping === true;
  const pick = _pick10();
  if (!Number.isInteger(pick) || pick < 0 || pick > 9) throw new RangeError('Invalid random number');
  if (rules.preRoundLoss && !effects[rules.preRoundLoss.unless]) {
    d.endurance = Math.max(0, d.endurance - rules.preRoundLoss.amount);
    _appendLog(d, tk('log.extra_loss', {n: rules.preRoundLoss.amount}));
    if (d.endurance <= 0) { _checkBattleEnd(d); saveState(); _renderAll(); return; }
  }
  const psychic = _psychic(d);
  const power = getContext().combatOptions?.psychicModes?.[psychic];
  let psychicDamage = 0;
  if (!escaping && power?.damageDice) {
    for (let i = 0; i < power.damageDice; i++) {
      const draw = _pick10();
      if (!Number.isInteger(draw) || draw < 0 || draw > 9) throw new RangeError('Invalid random number');
      psychicDamage += draw === 0 ? power.zeroValue : draw;
    }
  }
  if (!escaping && power?.fixedDamage) psychicDamage += power.fixedDamage;
  psychicDamage *= rules.psychicDamageMultiplier ?? 1;
  const equipped = _equipmentAvailable(d);
  const ratio = effects.captured ? _combatRatio(d) : d.ratio;
  if (!escaping && power?.oncePerCombat) {
    (effects.usedPsychicPowers ??= {})[psychic] = true;
  }
  d.roundsThisBattle++;
  if (rules.archery && effects.jackan && pick === rules.archery.breakPick) {
    _setRoute(d, rules.archery.breakRoute); saveState(); _renderAll(); return;
  }
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping || d.roundsThisBattle === rules.noEnemyDamageRound
      || d.roundsThisBattle <= (rules.noEnemyDamageRounds || 0)
        && !(rules.noEnemyDamageUnless && effects[rules.noEnemyDamageUnless])) enemyLoss = 0;
  const ignorePlayerLoss = d.roundsThisBattle <= (rules.ignorePlayerLossRounds || 0);
  if (ignorePlayerLoss || d.roundsThisBattle <= (rules.protectedRounds || 0)) lwLoss = 0;
  if (rules.sommerwerdMultiplier && effects.sommerwerd && enemyLoss !== 'K') enemyLoss *= rules.sommerwerdMultiplier;
  const weaponMultiplier = rules.weaponLossMultiplier
    ?? (effects.section === 0 && effects.enemyUndead ? getContext().combatOptions?.weaponLossMultiplier : null);
  if (weaponMultiplier && equipped && enemyLoss !== 'K'
      && weaponMultiplier.whenAny.some(flag => effects[flag])) enemyLoss *= weaponMultiplier.amount;
  if (rules.enemyLossMultiplier && (!rules.enemyMultiplierRequiresPsychic || psychic !== 'none') && enemyLoss !== 'K') enemyLoss *= rules.enemyLossMultiplier;
  if (rules.playerLossMultiplier && (!rules.playerMultiplierUnless || !effects[rules.playerMultiplierUnless]) && lwLoss !== 'K') lwLoss *= rules.playerLossMultiplier;
  const flame = getContext().combatOptions?.weaponFlame;
  if (!escaping && enemyLoss !== 'K' && enemyLoss > 0 && flame && effects[flame.whenTrue] && equipped) enemyLoss += flame.amount;
  if (enemyLoss !== 'K') enemyLoss += psychicDamage;
  _appendLog(d, tk('log.round', { round: d.roundsThisBattle, ratio, pick }));
  if (psychicDamage) _appendLog(d, tk('log.psychic_damage', {n: psychicDamage}));

  effects.enemyAutomaticallyKilled = enemyLoss === 'K';
  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (rules.archery) effects.targetPoints = lwLoss === 'K' ? 0 : Math.max(0, effects.targetPoints - lwLoss);
  else {
    const lastingWounds = effects.lastingWounds;
    if (rules.permanentWoundsAfterUnfavorableOpening && d.roundsThisBattle === 1) {
      effects.lastingWounds = lwLoss === 'K' || enemyLoss !== 'K' && lwLoss > enemyLoss;
    }
    if (lwLoss === 'K') d.endurance = 0;
    else d.endurance = Math.max(0, d.endurance - lwLoss);
    if (lastingWounds && rules.permanentWoundsAfterUnfavorableOpening && lwLoss !== 'K') _permanentLoss(d, lwLoss);
    const wound = rules.woundLoss;
    const cost = rules.permanentRoundCost === null ? null
      : rules.permanentRoundCost || getContext().combatOptions?.permanentRoundCost;
    const permanentCost = !ignorePlayerLoss && cost && equipped && d.roundsThisBattle >= cost.minRound
      && (!cost.whenTrue || effects[cost.whenTrue]) ? cost.amount : 0;
    const extra = ignorePlayerLoss ? 0 : (!effects.nexus ? (rules.nexusLoss || 0) : 0) +
      (psychic === 'surge' ? _psychicProfile(d).cost : 0) +
      (power?.oncePerCombat && escaping ? 0 : (power?.cost || 0)) +
      (rules.extraPlayerLossUnless && effects[rules.extraPlayerLossUnless] ? 0 : (rules.extraPlayerLoss || 0)) +
      (wound && lwLoss > 0 && !(wound.unless && effects[wound.unless]) ? wound.amount : 0) + permanentCost;
    if (extra && d.endurance > 0) {
      d.endurance = Math.max(0, d.endurance - extra);
      _appendLog(d, tk('log.extra_loss', { n: extra }));
    }
    if (permanentCost) _permanentLoss(d, permanentCost);
  }

  if (rules.roundLimit?.compareLosses) {
    effects.lastRoundLoss = {
      player: startingEndurance - d.endurance,
      enemy: startingEnemyEndurance - d.enemy.endurance,
    };
  }
  _appendLog(d, tk('log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? tk('log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? tk('log.k_word') : lwLoss,
    endurance: _health(d), enduranceMax: rules.archery ? rules.archery.targetPoints : d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _health, _recordOutcome, _rulesFor, _setRoute, t } = getContext();

  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  const recordOutcome = outcome => {
    if (!rules.noncombatChallenge) _recordOutcome(d, outcome);
  };
  if (d.printedRules && _health(d) <= 0) {
    _appendLog(d, tk('log.fallen', { skull: SVG_SKULL }));
    recordOutcome('loss');
    if (rules.archery) _setRoute(d, rules.archery.lossRoute);
  } else if (rules.playerStop && d.endurance < rules.playerStop.belowEndurance) {
    _setRoute(d, rules.playerStop.route);
  } else if (rules.stop && d.enemy.endurance <= rules.stop.endurance) {
    if (effects.enemyAutomaticallyKilled && rules.stop.killRoute) {
      _appendLog(d, tk('log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
      recordOutcome('win');
      _setRoute(d, rules.stop.killRoute);
    } else _setRoute(d, rules.stop.route);
  } else if (d.enemy.endurance <= 0 && rules.nextEnemy && !effects.followupUsed) {
    if (rules.roundLimit && d.roundsThisBattle >= rules.roundLimit.rounds) {
      _setRoute(d, rules.roundLimit.route);
      return;
    }
    effects.followupUsed = true;
    const next = rules.nextEnemy;
    d.enemy = {name: next.name, skill: next.skill, endurance: next.endurance, enduranceMax: next.endurance};
    if (next.ruleKey) {
      effects.ruleKey = next.ruleKey;
      effects.followupUsed = false;
    }
    _appendLog(d, tk('log.next_enemy', {enemy: next.name}));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, tk('log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    recordOutcome('win');
    if (effects.captured) {
      const victory = rules.victory;
      const route = victory?.whenTrue && effects[victory.whenTrue] ? victory.trueRoute
        : victory?.exactRoundsUnspecified && d.roundsThisBattle === victory.rounds ? null
        : victory?.rounds !== undefined ? (d.roundsThisBattle <= victory.rounds ? victory.early : victory.late) : victory?.route;
      if (route) _setRoute(d, route);
    }
  } else if (rules.roundLimit && d.roundsThisBattle >= rules.roundLimit.rounds) {
    const comparison = rules.roundLimit.compareLosses;
    const losses = effects.lastRoundLoss;
    _setRoute(d, comparison && losses
      ? (losses.player > losses.enemy ? comparison.playerMore : comparison.otherwise)
      : rules.roundLimit.route);
  } else if (d.endurance <= 0) {
    _appendLog(d, tk('log.fallen', { skull: SVG_SKULL }));
    recordOutcome('loss');
  }
  if (d.recordedThisBattle || d.combatEffects?.finished) _finishCombatEffects(d);
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _finishCombatEffects, _health, _psychicProfile, _equipmentAvailable, _permanentLoss, _healingAvailable, _heal, _psychic, _effectiveSkill, _combatRatio, _setRoute, _escapeRule, _escapeRoute, _escape, _runRound, _checkBattleEnd };
}

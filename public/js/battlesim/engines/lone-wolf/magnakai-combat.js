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
  const { _effectiveSkill, _rulesFor, effectControls = [] } = getContext();

  d.printedRules = 1;
  const section = Number(d.nextSection) || 0;
  d.recordedThisBattle = false;
  const ruleKey = d.nextEncounterKey || section;
  const rules = _rulesFor(ruleKey);
  d.combatEffects = {
    captured: true, section, ruleKey,
    psychic: d.nextPsychic || 'none',
    animal: !!d.nextAnimal, tracking: !!d.nextTracking, nexus: !!d.nextNexus,
    sommerwerd: !!d.nextSommerwerd,
    curing: !!d.nextCuring, circleLight: !!d.nextCircleLight,
    cloth: !!d.nextCloth, invisibility: !!d.nextInvisibility,
    bowMastery: !!d.nextBowMastery, jackan: !!d.nextJackan,
    bowModifier: Number(d.nextBowModifier) || 0,
    ...Object.fromEntries(effectControls.map(([key, field]) => [key, !!d[field]])),
    ...(rules.archery ? { targetPoints: rules.archery.targetPoints } : {}),
  };
  if (rules.archery) d.enemy.endurance = d.enemy.enduranceMax = rules.archery.targetPoints;
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _health(d) {
  const { _rulesFor } = getContext();
 return _rulesFor(d.combatEffects?.ruleKey ?? d.combatEffects?.section).archery ? d.combatEffects.targetPoints : d.endurance; }

function _psychic(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects?.captured) return 'none';
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (rules.psychicImmune || Number.isFinite(rules.fixedSkill)) return 'none';
  if (effects.psychic === 'blast' && !rules.blastImmune) return 'blast';
  if (effects.psychic === 'surge' && !rules.surgeImmune && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {

  const effects = d.combatEffects;
  if (!effects?.captured) return d.combatSkill + (d.attackModifier || 0);
  const { _rulesFor, _psychic } = getContext();
  const rules = _rulesFor(effects.ruleKey ?? effects.section);
  if (Number.isFinite(rules.fixedSkill)) return rules.fixedSkill;
  if (rules.archery) return d.combatSkill + effects.bowModifier + (effects.bowMastery ? rules.archery.masteryBonus : 0) - (effects.jackan ? rules.archery.jackanPenalty : 0);
  let skill = d.combatSkill + (d.attackModifier || 0);
  const psychic = _psychic(d);
  if (psychic === 'blast') skill += 2 * (rules.psychicSkillMultiplier || 1);
  if (psychic === 'surge') skill += 4 * (rules.psychicSkillMultiplier || 1);
  for (const adjustment of rules.skillAdjustments || []) {
    if (d.roundsThisBattle >= adjustment.maxRounds || adjustment.whenFalse && effects[adjustment.whenFalse]
        || adjustment.whenTrue && !effects[adjustment.whenTrue]) continue;
    skill += adjustment.amount;
  }
  if (effects.animal) skill += rules.animalBonus || 0;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, tk('log.continue', { section }));
}

function _escapeRule(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects || {};
  const escape = _rulesFor(effects.ruleKey ?? effects.section).escape;
  return (Array.isArray(escape) ? escape : escape ? [escape] : []).find(rule =>
    d.roundsThisBattle >= (rule.minRounds || 0)
    && (rule.maxRounds === undefined || d.roundsThisBattle <= rule.maxRounds)
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
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;
  if (rules.archery && effects.jackan && pick === rules.archery.breakPick) {
    _setRoute(d, rules.archery.breakRoute); saveState(); _renderAll(); return;
  }
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping || d.roundsThisBattle === rules.noEnemyDamageRound) enemyLoss = 0;
  if (d.roundsThisBattle <= (rules.protectedRounds || 0)) lwLoss = 0;
  if (rules.sommerwerdMultiplier && effects.sommerwerd && enemyLoss !== 'K') enemyLoss *= rules.sommerwerdMultiplier;
  if (rules.enemyLossMultiplier && (!rules.enemyMultiplierRequiresPsychic || psychic !== 'none') && enemyLoss !== 'K') enemyLoss *= rules.enemyLossMultiplier;
  if (rules.playerLossMultiplier && (!rules.playerMultiplierUnless || !effects[rules.playerMultiplierUnless]) && lwLoss !== 'K') lwLoss *= rules.playerLossMultiplier;
  _appendLog(d, tk('log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (rules.archery) effects.targetPoints = lwLoss === 'K' ? 0 : Math.max(0, effects.targetPoints - lwLoss);
  else {
    if (lwLoss === 'K') d.endurance = 0;
    else d.endurance = Math.max(0, d.endurance - lwLoss);
    const extra = (!effects.nexus ? (rules.nexusLoss || 0) : 0) +
      (psychic === 'surge' ? 2 : 0) + (rules.extraPlayerLoss || 0);
    if (extra && d.endurance > 0) {
      d.endurance = Math.max(0, d.endurance - extra);
      _appendLog(d, tk('log.extra_loss', { n: extra }));
    }
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
  if (d.printedRules && _health(d) <= 0) {
    _appendLog(d, tk('log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    if (rules.archery) _setRoute(d, rules.archery.lossRoute);
  } else if (rules.stop && d.enemy.endurance <= rules.stop.endurance) {
    _setRoute(d, rules.stop.route);
  } else if (d.enemy.endurance <= 0 && rules.nextEnemy && !effects.followupUsed) {
    if (rules.roundLimit && d.roundsThisBattle >= rules.roundLimit.rounds) {
      _setRoute(d, rules.roundLimit.route);
      return;
    }
    effects.followupUsed = true;
    const next = rules.nextEnemy;
    d.enemy = {name: next.name, skill: next.skill, endurance: next.endurance, enduranceMax: next.endurance};
    _appendLog(d, tk('log.next_enemy', {enemy: next.name}));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, tk('log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const victory = rules.victory;
      const route = victory?.rounds !== undefined ? (d.roundsThisBattle <= victory.rounds ? victory.early : victory.late) : victory?.route;
      if (route) _setRoute(d, route);
    }
  } else if (rules.roundLimit && d.roundsThisBattle >= rules.roundLimit.rounds) {
    _setRoute(d, rules.roundLimit.route);
  } else if (d.endurance <= 0) {
    _appendLog(d, tk('log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _health, _psychic, _effectiveSkill, _setRoute, _escapeRule, _escapeRoute, _escape, _runRound, _checkBattleEnd };
}

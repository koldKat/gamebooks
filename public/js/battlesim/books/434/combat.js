// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
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
  const { _effectiveSkill, _rulesFor } = getContext();

  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  const rules = _rulesFor(section);
  d.combatEffects = {
    captured: true, section,
    psychic: d.nextPsychic || 'none',
    animal: !!d.nextAnimal, tracking: !!d.nextTracking, nexus: !!d.nextNexus,
    sommerwerd: !!d.nextSommerwerd,
    bowMastery: !!d.nextBowMastery, jackan: !!d.nextJackan,
    bowModifier: Number(d.nextBowModifier) || 0,
    ...(rules.archery ? { targetPoints: rules.archery.targetPoints } : {}),
  };
  if (rules.archery) d.enemy.endurance = d.enemy.enduranceMax = rules.archery.targetPoints;
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _health(d) {
  const { _rulesFor } = getContext();
 return _rulesFor(d.combatEffects?.section).archery ? d.combatEffects.targetPoints : d.endurance; }

function _effectiveSkill(d) {

  const effects = d.combatEffects;
  if (!effects?.captured) return d.combatSkill + (d.attackModifier || 0);
  const { _rulesFor } = getContext();
  const rules = _rulesFor(effects.section);
  if (rules.archery) return d.combatSkill + effects.bowModifier + (effects.bowMastery ? rules.archery.masteryBonus : 0) - (effects.jackan ? rules.archery.jackanPenalty : 0);
  let skill = d.combatSkill + (d.attackModifier || 0);
  if (effects.psychic === 'blast' && !rules.blastImmune) skill += 2;
  if (effects.psychic === 'surge' && d.endurance > 6 && !rules.surgeImmune) skill += 4;
  for (const adjustment of rules.skillAdjustments || []) {
    if (d.roundsThisBattle >= adjustment.maxRounds || adjustment.whenFalse && effects[adjustment.whenFalse]) continue;
    skill += adjustment.amount;
  }
  if (effects.animal) skill += rules.animalBonus || 0;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim434.log.continue', { section }));
}

function _escapeRoute(d) {

  const { _rulesFor } = getContext();
  const rule = _rulesFor(d.combatEffects?.section).escape;
  if (rule && !rule.immediate && d.roundsThisBattle >= (rule.minRounds || 0) && (rule.maxRounds === undefined || d.roundsThisBattle <= rule.maxRounds)) return rule.route;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _health, _renderAll, _rulesFor, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const immediate = _rulesFor(d.combatEffects?.section).escape;
  if (immediate?.immediate) { _setRoute(d, immediate.route); saveState(); _renderAll(); return; }
  const route = _escapeRoute(d);
  if (!route) return;
  _runRound(true);
  if (_health(d) > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _health, _pick10, _pickRow, _ratioCol, _renderAll, _rulesFor, _setRoute, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.section);
  // Click handlers pass an Event, not the explicit escape flag.
  escaping = escaping === true;
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  if (rules.archery && effects.jackan && pick === rules.archery.breakPick) {
    _setRoute(d, rules.archery.breakRoute); saveState(); _renderAll(); return;
  }
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (d.roundsThisBattle <= (rules.protectedRounds || 0)) lwLoss = 0;
  if (rules.sommerwerdMultiplier && effects.sommerwerd && enemyLoss !== 'K') enemyLoss *= rules.sommerwerdMultiplier;
  _appendLog(d, t('battlesim434.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (rules.archery) effects.targetPoints = lwLoss === 'K' ? 0 : Math.max(0, effects.targetPoints - lwLoss);
  else {
    if (lwLoss === 'K') d.endurance = 0;
    else d.endurance = Math.max(0, d.endurance - lwLoss);
    const extra = (!effects.nexus ? (rules.nexusLoss || 0) : 0) +
      (effects.captured && effects.psychic === 'surge' && !rules.surgeImmune && d.endurance + (lwLoss === 'K' ? 0 : lwLoss) > 6 ? 2 : 0);
    if (extra && d.endurance > 0) {
      d.endurance = Math.max(0, d.endurance - extra);
      _appendLog(d, t('battlesim434.log.extra_loss', { n: extra }));
    }
  }

  _appendLog(d, t('battlesim434.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim434.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim434.log.k_word') : lwLoss,
    endurance: _health(d), enduranceMax: rules.archery ? rules.archery.targetPoints : d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _health, _recordOutcome, _rulesFor, _setRoute, t } = getContext();

  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.section);
  if (d.printedRules && _health(d) <= 0) {
    _appendLog(d, t('battlesim434.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    if (rules.archery) _setRoute(d, rules.archery.lossRoute);
  } else if (rules.stop && d.enemy.endurance <= rules.stop.endurance) {
    _setRoute(d, rules.stop.route);
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim434.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const victory = rules.victory;
      const route = victory?.rounds !== undefined ? (d.roundsThisBattle <= victory.rounds ? victory.early : victory.late) : victory?.route;
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim434.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim434.log.reset_sep'));
  _appendLog(d, t('battlesim434.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _health, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

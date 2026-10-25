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

  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  const secondEnemy = _rulesFor(section).secondEnemy;
  d.printedRules = 1;
  d.combatEffects = {
    captured: true,
    section,
    psychic: d.nextPsychic || 'none',
    tracking: !!d.nextTracking, nexus: !!d.nextNexus, curing: !!d.nextCuring,
    circleLight: !!d.nextCircleLight, mace: !!d.nextMace,
    cloth: !!d.nextCloth, invisibility: !!d.nextInvisibility,
    ...(secondEnemy && new RegExp(secondEnemy.namePattern).test(d.enemy.name) ? { secondJailer: true } : {}),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const { _rulesFor } = getContext();

  const effects = d.combatEffects;
  if (!effects?.captured || _rulesFor(effects.section).psychicImmune) return 'none';
  if (effects.psychic === 'blast' && !_rulesFor(effects.section).blastImmune) return 'blast';
  if (effects.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic, _rulesFor } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects?.captured) return skill;
  const rules = _rulesFor(effects.section);
  const psychic = _psychic(d);
  skill += psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  for (const adjustment of rules.skillAdjustments || []) {
    if (adjustment.maxRounds !== undefined && d.roundsThisBattle >= adjustment.maxRounds || adjustment.whenFalse && effects[adjustment.whenFalse] || adjustment.whenTrue && !effects[adjustment.whenTrue]) continue;
    skill += adjustment.amount;
  }
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim435.log.continue', { section }));
}

function _escapeRule(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects?.captured) return null;
  return (_rulesFor(effects.section).escape || []).find(rule =>
    d.roundsThisBattle >= (rule.minRounds || 0) && (!rule.whenTrue || effects[rule.whenTrue])) || null;
}

function _escapeRoute(d) {
  const { _escapeRule } = getContext();
  return _escapeRule(d)?.route || 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _escapeRule, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if (!_escapeRule(d)?.skipRound) _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _pick10, _pickRow, _psychic, _ratioCol, _renderAll, _rulesFor, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const effects = d.combatEffects || {};
  const psychic = _psychic(d);
  const rules = _rulesFor(effects.section);
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.ratio = ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (rules.enemyLossMultiplier && (!rules.enemyMultiplierRequiresPsychic || psychic !== 'none')) {
    if (enemyLoss !== 'K') enemyLoss *= rules.enemyLossMultiplier;
  }
  if (lwLoss !== 'K' && rules.playerLossMultiplier && (!rules.playerMultiplierUnless || !effects[rules.playerMultiplierUnless])) lwLoss *= rules.playerLossMultiplier;
  _appendLog(d, t('battlesim435.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  const extra = (psychic === 'surge' ? 2 : 0) + (rules.extraPlayerLoss || 0);
  if (extra && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - extra);
    _appendLog(d, t('battlesim435.log.extra_loss', { n: extra }));
  }

  _appendLog(d, t('battlesim435.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim435.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim435.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _rulesFor, _setRoute, t } = getContext();

  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.section);
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && effects.secondJailer) {
    effects.secondJailer = false;
    const next = rules.secondEnemy;
    d.enemy = { name: t(next.nameKey), skill: next.skill, endurance: next.endurance, enduranceMax: next.endurance };
    _appendLog(d, t('battlesim435.log.second_jailer'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const victory = rules.victory;
      const route = victory?.rounds !== undefined ? (d.roundsThisBattle <= victory.rounds ? victory.early : victory.late) : victory?.route;
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim435.log.reset_sep'));
  _appendLog(d, t('battlesim435.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _escapeRule, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

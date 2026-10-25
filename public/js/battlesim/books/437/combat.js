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
  const { FIGHT_OPTIONS, _effectiveSkill, _rulesFor } = getContext();

  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  const name = d.enemy.name;
  const sequence = _rulesFor(section).sequence;
  const phase = sequence?.phaseMatchers.find(matcher => new RegExp(matcher.pattern, matcher.flags).test(name))?.phase || 0;
  d.combatEffects = { captured: true, section, phase, initialEnemy: { ...d.enemy }, psychic: d.nextPsychic || 'none' };
  for (const option of FIGHT_OPTIONS) d.combatEffects[option] = !!d['next' + option[0].toUpperCase() + option.slice(1)];
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const { _rulesFor } = getContext();

  const e = d.combatEffects;
  if (!e?.captured || _rulesFor(e.section).psychicImmune) return 'none';
  if (e.psychic === 'blast' && !_rulesFor(e.section).blastImmune) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic, _rulesFor } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  const rules = _rulesFor(e.section);
  const psychic = _psychic(d);
  skill += psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  for (const adjustment of rules.skillAdjustments || []) {
    if (adjustment.maxRounds !== undefined && d.roundsThisBattle >= adjustment.maxRounds || adjustment.minPhase !== undefined && !(e.phase >= adjustment.minPhase) || adjustment.whenFalse && e[adjustment.whenFalse] || adjustment.whenTrue && !e[adjustment.whenTrue] || adjustment.unlessAny?.some(key => e[key])) continue;
    skill += adjustment.amount;
  }
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim437.log.continue', { section }));
}

function _escapeRoute(d) {
  const { _rulesFor } = getContext();
  const e = d.combatEffects;
  if (!e?.captured) return 0;
  const rule = _rulesFor(e.section).escape;
  return rule && d.roundsThisBattle >= rule.minRounds ? rule.route : 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _renderAll, _rulesFor, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if (!_rulesFor(d.combatEffects.section).escape.skipRound) _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _pick10, _pickRow, _psychic, _ratioCol, _renderAll, _rulesFor, _setRoute, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const e = d.combatEffects || {};
  const rules = _rulesFor(e.section);
  if (e.captured && rules.stop && d.roundsThisBattle >= rules.stop.completedRounds) {
    _setRoute(d, rules.stop.route);
    saveState();
    _renderAll();
    return;
  }
  const psychic = _psychic(d);
  if (e.captured) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (e.captured) {
    if (e.sommerwerd && rules.sommerwerdMultiplier && enemyLoss !== 'K') enemyLoss *= rules.sommerwerdMultiplier;
    if (d.roundsThisBattle <= (rules.protectedRounds || 0)) lwLoss = 0;
    if (rules.playerLossMultiplier && lwLoss !== 'K') lwLoss *= rules.playerLossMultiplier;
  }
  _appendLog(d, t('battlesim437.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (psychic === 'surge' && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim437.log.extra_loss', { n: 2 }));
  }

  _appendLog(d, t('battlesim437.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim437.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim437.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (e.captured && rules.stop && !_battleOver(d) && d.roundsThisBattle >= rules.stop.completedRounds) _setRoute(d, rules.stop.route);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _rulesFor, _setRoute, t } = getContext();

  const e = d.combatEffects || {};
  const rules = _rulesFor(e.section);
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim437.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && e.captured && rules.sequence && e.phase < rules.sequence.profiles.length - 1) {
    e.phase++;
    const pair = rules.sequence.profiles[e.phase];
    d.enemy = { name: t(rules.sequence.nameKey, { pair: e.phase + 1, section: e.section }), skill: pair.skill, endurance: pair.endurance, enduranceMax: pair.endurance };
    _appendLog(d, t('battlesim437.log.next_pair'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim437.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      const victory = rules.victory;
      const route = victory?.rounds !== undefined ? (d.roundsThisBattle <= victory.rounds ? victory.early : victory.late) : victory?.route;
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim437.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  if (d.combatEffects?.initialEnemy) d.enemy = { ...d.combatEffects.initialEnemy };
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim437.log.reset_sep'));
  _appendLog(d, t('battlesim437.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

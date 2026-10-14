// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
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
  const { _effectiveSkill } = getContext();

  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  d.combatEffects = {
    captured: true, section, initialEnemy: { ...d.enemy },
    psychic: d.nextPsychic || 'none',
    tracking: !!d.nextTracking, animal: !!d.nextAnimal,
    shield: !!d.nextShield, spirit: !!d.nextSpirit,
    curing: !!d.nextCuring, nexus: !!d.nextNexus,
    primate: !!d.nextPrimate, tutelary: !!d.nextTutelary,
    secondVordak: [13,287].includes(section) && /1\s*§/.test(d.enemy.name),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {

  const e = d.combatEffects;
  if (!e?.captured || [74,159,199,339].includes(e.section)) return 'none';
  if (e.psychic === 'blast' && ![8,13,30,47,101,110,169,183,257,287,308,323,333].includes(e.section)) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  if (e.section === 74) return 15;
  const psychic = _psychic(d);
  skill += (psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0) * (e.section === 52 ? 3 : 1);
  if ([8,101].includes(e.section) && !e.animal) skill -= 3;
  if ([13,169,287,333].includes(e.section) && !e.shield) skill -= 2;
  if ([30,47,183,308].includes(e.section) && e.spirit) skill += 2;
  if (e.section === 41) skill += 5;
  if ([88,106,162].includes(e.section) && e.animal) skill += 2;
  if (e.section === 169 || [252,323].includes(e.section) && d.roundsThisBattle < 2) skill -= e.tutelary ? 2 : 4;
  if (e.section === 298 && d.roundsThisBattle < 2 && !e.tracking) skill -= 3;
  if (e.section === 313 && !e.tracking) skill -= 4;
  if (e.section === 339 && !(e.nexus && e.primate)) skill -= 8;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim436.log.continue', { section }));
}

function _escapeRoute(d) {

  const e = d.combatEffects;
  if (!e?.captured || d.roundsThisBattle < 3) return 0;
  if ([38,205,346].includes(e.section)) return 309;
  if ([110,323].includes(e.section)) return 191;
  if (e.section === 339) return 48;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _pick10, _pickRow, _psychic, _ratioCol, _renderAll, _setRoute, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const e = d.combatEffects || {};
  if (e.captured && e.section === 13 && d.roundsThisBattle >= 6) {
    _setRoute(d, 158);
    saveState();
    _renderAll();
    return;
  }
  if (e.captured && [30,47,183,308].includes(e.section) && !e.shield) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim436.log.extra_loss', { n: 2 }));
    if (d.endurance <= 0) {
      _checkBattleEnd(d);
      saveState();
      _renderAll();
      return;
    }
  }
  const psychic = _psychic(d);
  d.ratio = e.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping || e.captured && e.section === 183 && d.roundsThisBattle === 1) enemyLoss = 0;
  if (e.captured) {
    if ([8,13,30,287,308].includes(e.section) && enemyLoss !== 'K') enemyLoss *= 2;
    if (e.section === 251 && d.roundsThisBattle === 1) lwLoss = 0;
    if (lwLoss !== 'K') {
      if (e.section === 52 || e.section === 155 && !(e.curing && e.primate)) lwLoss *= 2;
      if ([159,199].includes(e.section)) lwLoss /= 2;
    }
  }
  _appendLog(d, t('battlesim436.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (psychic === 'surge' && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim436.log.extra_loss', { n: 2 }));
  }

  _appendLog(d, t('battlesim436.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim436.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim436.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (e.captured && !_battleOver(d) && e.section === 257 && d.roundsThisBattle >= 2) _setRoute(d, 163);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _setRoute, t } = getContext();

  const e = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && e.secondVordak) {
    e.secondVordak = false;
    d.enemy = { name: t('battlesim436.ui.second_vordak', { section: e.section }), skill: 21, endurance: 26, enduranceMax: 26 };
    _appendLog(d, t('battlesim436.log.second_vordak'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      const route = { 8:202,13:79,30:268,38:9,40:87,41:106,47:195,52:129,74:254,
        88:144,101:202,106:247,110:293,155:62,159:46,162:144,164:328,169:337,
        183:268,199:46,205:9,231:328,233:321,241:231,251:87,252:313,257:12,
        265:313,287:79,298:321,305:231,308:195,313:160,323:293,333:197,339:344,346:9 }[e.section];
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim436.log.reset_sep'));
  _appendLog(d, t('battlesim436.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

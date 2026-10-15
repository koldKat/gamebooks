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
  const { FIGHT_OPTIONS, _effectiveSkill } = getContext();

  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  const name = d.enemy.name;
  const phase = section === 238 ? (/5\s*и\s*6/.test(name) ? 2 : /3\s*и\s*4/.test(name) ? 1 : 0)
    : section === 309 ? (/сержант/i.test(name) ? 2 : /3\s*и\s*4/.test(name) ? 1 : 0) : 0;
  d.combatEffects = { captured: true, section, phase, initialEnemy: { ...d.enemy }, psychic: d.nextPsychic || 'none' };
  for (const option of FIGHT_OPTIONS) d.combatEffects[option] = !!d['next' + option[0].toUpperCase() + option.slice(1)];
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {

  const e = d.combatEffects;
  if (!e?.captured || [10,32,82,128,327].includes(e.section)) return 'none';
  if (e.psychic === 'blast' && ![46,116,129,220,249,277,336].includes(e.section)) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  const psychic = _psychic(d);
  skill += psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  if (e.section === 32) skill -= 2;
  if (e.section === 327) skill -= 4;
  if (e.section === 82 && !e.tracking) skill -= 2;
  if (e.section === 97 && !e.tracking) skill -= 3;
  if (e.section === 104 && !e.tracking && !e.divination) skill -= 3;
  if (e.section === 129 && !e.animal) skill -= 2;
  if ([85,244].includes(e.section) && e.animal) skill += 2;
  if (e.section === 148 && d.roundsThisBattle < 2) skill -= 2;
  if (e.section === 166) skill += 2;
  if (e.section === 191) skill -= 4;
  if (e.section === 214) skill += 8;
  if (e.section === 238 || e.section === 309 && e.phase > 0) skill += 2;
  if (e.section === 316 || e.section === 182 && d.roundsThisBattle < 4) skill -= e.tutelary ? 2 : 4;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim437.log.continue', { section }));
}

function _escapeRoute(d) {

  const e = d.combatEffects;
  if (!e?.captured) return 0;
  if ([36,86,260].includes(e.section)) return 328;
  if (e.section === 119) return 49;
  if (e.section === 217) return 334;
  if ([98,127,308].includes(e.section) && d.roundsThisBattle >= 1) return 223;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if ([98,127,308].includes(d.combatEffects.section)) _runRound(true);
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
  if (e.captured && e.section === 82 && d.roundsThisBattle >= 4) {
    _setRoute(d, 151);
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
    if (e.sommerwerd && [97,104,166,191,254,301,322].includes(e.section) && enemyLoss !== 'K') enemyLoss *= 2;
    if ([46,116,285].includes(e.section) && d.roundsThisBattle <= 2) lwLoss = 0;
    if (e.section === 82 && lwLoss !== 'K') lwLoss *= 2;
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
  if (e.captured && e.section === 82 && !_battleOver(d) && d.roundsThisBattle >= 4) _setRoute(d, 151);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _setRoute, t } = getContext();

  const e = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim437.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && e.captured && [238,309].includes(e.section) && e.phase < 2) {
    e.phase++;
    const pair = (e.section === 238 ? [[20,32],[18,32],[17,29]] : [[17,29],[18,32],[20,32]])[e.phase];
    d.enemy = { name: t('battlesim437.ui.next_pair', { pair: e.phase + 1, section: e.section }), skill: pair[0], endurance: pair[1], enduranceMax: pair[1] };
    _appendLog(d, t('battlesim437.log.next_pair'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim437.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      let route = { 10:350,32:139,36:170,46:241,82:247,85:176,86:170,97:338,98:174,
        116:241,119:170,127:174,128:350,129:169,148:66,166:87,182:90,188:350,
        191:87,214:93,217:155,220:30,238:177,249:303,254:147,260:170,277:93,
        285:21,301:87,308:174,309:177,316:259,322:147,327:139,336:93 }[e.section];
      if (e.section === 3) route = d.roundsThisBattle <= 3 ? 117 : 276;
      if (e.section === 104) route = d.roundsThisBattle <= 3 ? 228 : 322;
      if (e.section === 244) route = d.roundsThisBattle <= 3 ? 306 : 148;
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
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

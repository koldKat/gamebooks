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
  d.combatEffects = {
    captured: true,
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    psychic: d.nextPsychic || 'none',
    tracking: !!d.nextTracking, nexus: !!d.nextNexus, curing: !!d.nextCuring,
    circleLight: !!d.nextCircleLight, mace: !!d.nextMace,
    cloth: !!d.nextCloth, invisibility: !!d.nextInvisibility,
    ...( /1\s*§212/.test(d.enemy.name) ? { secondJailer: true } : {}),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {

  const effects = d.combatEffects;
  if (!effects?.captured || [93,174].includes(effects.section)) return 'none';
  if (effects.psychic === 'blast' && ![8,78,118,126,198,202,235,245].includes(effects.section)) return 'blast';
  if (effects.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects?.captured) return skill;
  const section = effects.section;
  const psychic = _psychic(d);
  skill += psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  if (section === 19 && d.roundsThisBattle < 2 && !effects.tracking) skill -= 3;
  if (section === 27 && d.roundsThisBattle < 3 && !effects.tracking) skill -= 3;
  if (section === 27 && effects.mace) skill += 5;
  if (section === 45 && effects.circleLight) skill += 2;
  if (section === 93 || section === 219 && d.roundsThisBattle < 2) skill -= 4;
  if (section === 118 && effects.tracking) skill += 2;
  if (section === 214 && !effects.nexus) skill -= 4;
  if (section === 257) skill += (effects.tracking ? 0 : -2) + (effects.cloth ? 1 : 0);
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim435.log.continue', { section }));
}

function _escapeRoute(d) {

  const effects = d.combatEffects;
  if (!effects?.captured) return 0;
  const section = effects.section;
  if ([19,249].includes(section) && d.roundsThisBattle >= 3) return 241;
  if (section === 45 && d.roundsThisBattle >= 3) return 336;
  if ([253,314,214].includes(section)) return 277;
  if (section === 221) return effects.invisibility ? 70 : d.roundsThisBattle >= 2 ? 229 : 0;
  if (section === 257 && d.roundsThisBattle >= 3) return 64;
  if (section === 301 && d.roundsThisBattle >= 4) return 91;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if (d.combatEffects.section !== 214 && route !== 70) _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _pick10, _pickRow, _psychic, _ratioCol, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const effects = d.combatEffects || {};
  const psychic = _psychic(d);
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.ratio = ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (effects.section === 290 || effects.section === 233 && psychic !== 'none') {
    if (enemyLoss !== 'K') enemyLoss *= 2;
  }
  if (lwLoss !== 'K') {
    if (effects.section === 76) lwLoss *= 3;
    if (effects.section === 126 && !effects.nexus || [178,219,285,301].includes(effects.section) && !effects.curing) lwLoss *= 2;
  }
  _appendLog(d, t('battlesim435.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  const extra = (psychic === 'surge' ? 2 : 0) + (effects.section === 325 ? 2 : 0);
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
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _setRoute, t } = getContext();

  const effects = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && effects.secondJailer) {
    effects.secondJailer = false;
    d.enemy = { name: t('battlesim435.ui.second_jailer'), skill: 16, endurance: 21, enduranceMax: 21 };
    _appendLog(d, t('battlesim435.log.second_jailer'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const timed = { 40: [248,160], 50: [248,160], 75: [248,160], 142: [238,212], 206: [17,160], 280: [291,156], 316: [248,160] }[effects.section];
      const route = timed ? timed[d.roundsThisBattle <= 3 ? 0 : 1] : {
        8:194,19:141,27:5,45:283,62:282,76:296,78:341,81:105,93:131,
        118:200,126:147,174:149,178:346,198:22,202:149,212:80,214:114,
        219:21,221:271,233:209,235:22,245:259,249:141,253:141,257:186,
        285:161,290:220,299:339,301:21,314:141,319:56,325:158,
      }[effects.section];
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
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

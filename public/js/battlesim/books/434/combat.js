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
    captured: true, section,
    psychic: d.nextPsychic || 'none',
    animal: !!d.nextAnimal, tracking: !!d.nextTracking, nexus: !!d.nextNexus,
    sommerwerd: !!d.nextSommerwerd,
    bowMastery: !!d.nextBowMastery, jackan: !!d.nextJackan,
    bowModifier: Number(d.nextBowModifier) || 0,
    ...(section === 26 ? { targetPoints: 50 } : {}),
  };
  if (section === 26) d.enemy.endurance = d.enemy.enduranceMax = 50;
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _health(d) {
 return d.combatEffects?.section === 26 ? d.combatEffects.targetPoints : d.endurance; }

function _effectiveSkill(d) {

  const effects = d.combatEffects;
  if (!effects?.captured) return d.combatSkill + (d.attackModifier || 0);
  const section = effects.section;
  if (section === 26) return d.combatSkill + effects.bowModifier + (effects.bowMastery ? 3 : 0) - (effects.jackan ? 2 : 0);
  let skill = d.combatSkill + (d.attackModifier || 0);
  if (effects.psychic === 'blast' && ![77,270,344].includes(section)) skill += 2;
  if (effects.psychic === 'surge' && d.endurance > 6 && ![270,344].includes(section)) skill += 4;
  if (section === 114 && d.roundsThisBattle === 0) skill += 2;
  if (section === 155 && d.roundsThisBattle === 0) skill -= 4;
  if (section === 254 && d.roundsThisBattle === 0 && !effects.tracking) skill -= 2;
  if (section === 270 && d.roundsThisBattle < 2 && !effects.tracking) skill -= 2;
  if (effects.animal && [71,194].includes(section)) skill += 2;
  if (effects.animal && [164,283].includes(section)) skill++;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim434.log.continue', { section }));
}

function _escapeRoute(d) {

  const section = d.combatEffects?.section;
  if ([12,343].includes(section)) return section === 12 || d.roundsThisBattle >= 3 ? 305 : 0;
  if (section === 155) return d.roundsThisBattle >= 4 ? 305 : 0;
  if ([37,71,208].includes(section)) return 279;
  if (section === 42) return 70;
  if (section === 92) return 286;
  if (section === 215) return d.roundsThisBattle >= 2 ? 286 : 0;
  if (section === 194) return 289;
  if (section === 116 && d.roundsThisBattle === 0) return 105;
  if (section === 337 && d.roundsThisBattle === 0) return 191;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _health, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  if (d.combatEffects?.section === 156) { _setRoute(d, 339); saveState(); _renderAll(); return; }
  const route = _escapeRoute(d);
  if (!route) return;
  _runRound(true);
  if (_health(d) > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const { COMBAT_TABLE, _appendLog, _battleOver, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _health, _pick10, _pickRow, _ratioCol, _renderAll, _setRoute, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  // Click handlers pass an Event, not the explicit escape flag.
  escaping = escaping === true;
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  if (effects.section === 26 && effects.jackan && pick === 0) {
    _setRoute(d, 335); saveState(); _renderAll(); return;
  }
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (effects.section === 12 && d.roundsThisBattle <= 2) lwLoss = 0;
  if (effects.section === 270 && effects.sommerwerd && enemyLoss !== 'K') enemyLoss *= 2;
  _appendLog(d, t('battlesim434.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (effects.section === 26) effects.targetPoints = lwLoss === 'K' ? 0 : Math.max(0, effects.targetPoints - lwLoss);
  else {
    if (lwLoss === 'K') d.endurance = 0;
    else d.endurance = Math.max(0, d.endurance - lwLoss);
    const extra = (effects.section === 270 && !effects.nexus ? 2 : 0) +
      (effects.captured && effects.psychic === 'surge' && ![270,344].includes(effects.section) && d.endurance + (lwLoss === 'K' ? 0 : lwLoss) > 6 ? 2 : 0);
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
    endurance: _health(d), enduranceMax: effects.section === 26 ? 50 : d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _health, _recordOutcome, _setRoute, t } = getContext();

  const effects = d.combatEffects || {};
  if (d.printedRules && _health(d) <= 0) {
    _appendLog(d, t('battlesim434.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    if (effects.section === 26) _setRoute(d, 183);
  } else if (effects.section === 78 && d.enemy.endurance <= 11) {
    _setRoute(d, 180);
  } else if (effects.section === 344 && d.enemy.endurance <= 25) {
    _setRoute(d, 310);
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim434.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const timed = { 92: [77,215], 201: [15,87] }[effects.section];
      const route = timed ? timed[d.roundsThisBattle <= 3 ? 0 : 1] : {26:252,78:180,156:200,344:310}[effects.section];
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
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _health, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

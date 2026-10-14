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
  d.combatEffects = { captured: true, section, phase: section === 274 && d.enemy.skill === 17 ? 1 : 0,
    initialEnemy: { ...d.enemy }, psychic: d.nextPsychic || 'none' };
  for (const option of FIGHT_OPTIONS) d.combatEffects[option] = !!d['next' + option[0].toUpperCase() + option.slice(1)];
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const { BLAST_IMMUNE } = getContext();

  const e = d.combatEffects;
  if (!e?.captured) return 'none';
  if (e.psychic === 'blast' && !BLAST_IMMUNE.includes(e.section)) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  const { _psychic } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  const psychic = _psychic(d);
  let bonus = psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  if ([81,254].includes(e.section)) bonus *= e.spirit ? 3 : 2;
  skill += bonus;
  if (e.section === 28 && d.roundsThisBattle === 0 && !e.tracking) skill -= 3;
  if ([54,304].includes(e.section)) skill -= 3;
  if (e.section === 54 && !e.weapon || e.section === 336 && d.roundsThisBattle === 0) skill -= e.tutelary ? 2 : 4;
  if (e.section === 118 && e.animal || [168,245,288].includes(e.section)) skill += 2;
  if (e.section === 251 && d.roundsThisBattle === 0) skill += 2;
  if (e.section === 304 && e.shield) skill -= 2;
  return skill;
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim438.log.continue', { section }));
}

function _escapeRoute(d) {

  const e = d.combatEffects;
  if (!e?.captured) return 0;
  if (e.section === 81) return 340;
  if ([132,216].includes(e.section)) return 23;
  if (e.section === 113 && d.roundsThisBattle >= 3) return 229;
  if (e.section === 118 && d.roundsThisBattle >= 2) return 39;
  return 0;
}

function _escape() {
  const { _battleOver, _data, _escapeRoute, _renderAll, _runRound, _setRoute, saveState } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if ([113,118].includes(d.combatEffects.section)) _runRound(true);
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
  if (e.captured && (e.section === 41 && d.roundsThisBattle >= 3 || [187,336,349].includes(e.section) && d.roundsThisBattle >= 4)) {
    _setRoute(d, e.section === 41 ? 10 : 234);
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
  if (e.captured && e.section === 133 && enemyLoss !== 'K') enemyLoss *= 2;
  if (e.captured && e.section === 172 && lwLoss !== 'K') lwLoss /= 2;
  _appendLog(d, t('battlesim438.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (psychic === 'surge' && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim438.log.extra_loss', { n: 2 }));
  }

  _appendLog(d, t('battlesim438.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim438.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim438.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (e.captured && !_battleOver(d)) {
    if (e.section === 41 && d.roundsThisBattle >= 3) _setRoute(d, 10);
    if ([187,336,349].includes(e.section) && d.roundsThisBattle >= 4) _setRoute(d, 234);
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _setRoute, t } = getContext();

  const e = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (e.captured && e.section === 286 && d.enemy.endurance <= 20) {
    _setRoute(d, 20);
  } else if (e.captured && e.section === 274 && e.phase === 0 && d.enemy.endurance <= 0) {
    e.phase = 1;
    d.enemy = { name: t('battlesim438.ui.second_enemy'), skill: 17, endurance: 29, enduranceMax: 29 };
    _appendLog(d, t('battlesim438.log.next_enemy'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      let route = { 2:332,23:239,33:145,41:326,54:237,76:34,81:268,109:162,113:300,
        115:297,118:239,119:84,132:170,133:156,143:56,148:206,168:156,170:239,
        172:217,208:145,211:87,216:170,251:271,252:305,254:220,274:68,288:44,
        304:72,311:34,312:178,315:84,318:332,320:162,344:271,348:177 }[e.section];
      if ([28,245].includes(e.section)) route = d.roundsThisBattle <= 4 ? 169 : 309;
      if (e.section === 126) route = d.roundsThisBattle <= 4 ? 11 : 321;
      if (e.section === 180) route = d.roundsThisBattle <= 2 ? 316 : 261;
      if ([187,336,349].includes(e.section)) route = 202;
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim438.log.reset_sep'));
  _appendLog(d, t('battlesim438.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle };
}

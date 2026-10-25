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

function _rulesFor(section) {
  const { ENCOUNTER_RULES } = getContext();
  return ENCOUNTER_RULES[section] ?? {};
}

function _captureFightEffects(d) {
  const { _effectiveSkill } = getContext();

  d.printedRules = 1;
  d.combatEffects = {
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    weapon: ['staff','other','none'].includes(d.nextWeapon) ? d.nextWeapon : 'staff',
    dagger: d.nextDagger === true, tanith: d.nextTanith === true,
    willSpend: Math.max(1, Math.floor(Number(d.nextWillSpend) || 1)),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _effectiveSkill(d) {
  const { _rulesFor } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects) return skill;
  const rules = _rulesFor(effects.section), penalty = rules.weaponPenalty;
  if (penalty && (!penalty.unlessStaff || effects.weapon !== 'staff')) skill -= effects.dagger ? penalty.dagger : penalty.none;
  else if (effects.weapon === 'none') skill -= 8;
  else if (effects.weapon !== 'staff' || !(d.willpower >= 1)) skill -= 6;
  if (rules.companionBonus && effects[rules.companionBonus.option]) skill += rules.companionBonus.amount;
  return skill;
}

function _stopFight(d, routes) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.routes = routes;
  if (routes.length) _appendLog(d, t('battlesim441.log.continue', { sections: routes.join(' / ') }));
}

function _escapeRoute(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects || effects.finished) return null;
  const escape = _rulesFor(effects.section).escape;
  return escape && d.roundsThisBattle >= escape.afterRounds
    && (!escape.requireEnduranceAdvantage || d.endurance > d.enemy.endurance) ? escape.route : null;
}

function _runRound() {
  const { COMBAT_TABLE, DEADLINES, _appendLog, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _pick10, _pickRow, _ratioCol, _renderAll, _stopFight, _rulesFor, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || d.combatEffects?.finished) return;
  if (d.printedRules === 1 && !d.combatEffects) _captureFightEffects(d);
  const effects = d.combatEffects;
  const rules = effects ? _rulesFor(effects.section) : {};
  if (effects) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  const [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  _appendLog(d, t('battlesim441.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  let spent = 0;
  if (effects?.weapon === 'staff' && !rules.disableStaffCost && d.willpower >= 1) {
    spent = Math.min(effects.willSpend, Math.floor(d.willpower));
    d.willpower -= spent;
    _appendLog(d, t('battlesim441.log.will', { spent, will: d.willpower }));
  }
  const damage = enemyLoss === 'K' ? enemyLoss : enemyLoss * Math.max(1, spent);
  if (damage === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - damage);
  const playerLoss = rules.noPlayerLoss ? 0 : lwLoss;
  if (playerLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - playerLoss);

  _appendLog(d, t('battlesim441.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: damage === 'K' ? t('battlesim441.log.k_word') : damage,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: playerLoss === 'K' ? t('battlesim441.log.k_word') : playerLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (effects && !effects.finished) {
    const deadline = DEADLINES[effects.section];
    if (deadline && d.roundsThisBattle >= deadline[0]) _stopFight(d, [deadline[1]]);
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, VICTORY_ROUTES, _appendLog, _enemyNameSafe, _recordOutcome, _stopFight, _rulesFor, t } = getContext();

  const rules = d.combatEffects ? _rulesFor(d.combatEffects.section) : {};
  if (d.combatEffects && d.endurance <= 0) {
    _recordOutcome(d, 'loss');
    if (rules.rescue) {
      _appendLog(d, t(rules.rescue.logKey));
      _stopFight(d, [rules.rescue.route]);
    } else {
      d.combatEffects.finished = true;
      _appendLog(d, t('battlesim441.log.fallen', { skull: SVG_SKULL }));
    }
    return;
  }
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim441.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (d.combatEffects) {
      if (rules.victoryWarning) _appendLog(d, t(rules.victoryWarning));
      _stopFight(d, VICTORY_ROUTES[d.combatEffects.section] || []);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim441.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _stopByChoice() {
  const { _data, _escapeRoute, _renderAll, _stopFight, saveState } = getContext();

  const d = _data();
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0) return;
  const route = _escapeRoute(d);
  if (!route) return;
  _stopFight(d, [route]);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim441.log.reset_sep'));
  _appendLog(d, t('battlesim441.log.reset_future', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _runRound, _checkBattleEnd, _stopByChoice, _resetBattle };
}

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

  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  d.printedRules = 1;
  d.combatEffects = {
    section, weapon: ['staff','other','none'].includes(d.nextWeapon) ? d.nextWeapon : 'staff',
    dagger: d.nextDagger === true, spareWeapon: d.nextSpareWeapon === true,
    shield: d.nextShield === true, willSpend: Math.max(1, Math.floor(Number(d.nextWillSpend) || 1)),
    mentalSkill: (Number(d.willpower) || 0) + d.endurance,
    initialEnemy: { ...d.enemy },
  };
  if (section === 101) d.combatEffects.sequence = Math.max(0, Math.min(8, Number(d.enemy.name.match(/Нейджин\s+(\d+)/)?.[1] || 1) - 1));
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _effectiveSkill(d) {

  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects) return skill;
  if (effects.section === 259) return effects.mentalSkill + (d.attackModifier || 0);
  if (effects.weapon === 'none') skill -= 8;
  else if (effects.weapon !== 'staff' || !(d.willpower >= 1)) skill -= 6;
  if (effects.dagger && effects.weapon !== 'none') skill++;
  skill += ({ 99: 4, 120: 3, 189: 3, 203: 4, 205: 5, 231: -2, 243: 4, 281: -1, 308: 4 })[effects.section] || 0;
  if (effects.section === 101 && effects.spareWeapon) skill += 2;
  if (effects.section === 309 && d.roundsThisBattle < 2) skill += 4;
  return skill;
}

function _stopFight(d, routes) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.routes = routes;
  _appendLog(d, t('battlesim439.log.continue', { sections: routes.join(' / ') }));
}

function _escapeRoute(d) {

  const effects = d.combatEffects;
  if (!effects || effects.finished) return null;
  if (effects.section === 133 && d.roundsThisBattle >= 2) return 27;
  if (effects.section === 154 && d.roundsThisBattle >= 1) return 4;
  return ({ 205: 163, 309: 137, 321: 137 })[effects.section] || null;
}

function _runRound(escape = false) {
  const { COMBAT_TABLE, DEADLINES, _appendLog, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _escapeRoute, _pick10, _pickRow, _ratioCol, _renderAll, _stopFight, saveState, t } = getContext();

  const d = _data();
  escape = escape === true;
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || d.combatEffects?.finished) return;
  if (d.printedRules === 1 && !d.combatEffects) _captureFightEffects(d);
  const route = escape ? _escapeRoute(d) : null;
  if (escape && !route) return;
  const effects = d.combatEffects;
  if (effects) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  const [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  _appendLog(d, t('battlesim439.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));
  let spent = 0;
  if (effects && effects.section !== 259 && effects.weapon === 'staff' && d.willpower > 0) {
    spent = Math.min(effects.willSpend, Math.floor(d.willpower));
    d.willpower -= spent;
    _appendLog(d, t('battlesim439.log.will', { spent, will: d.willpower }));
  }
  const damage = enemyLoss === 'K' ? enemyLoss : enemyLoss * Math.max(1, spent);
  if (!escape) {
    if (damage === 'K') d.enemy.endurance = 0;
    else d.enemy.endurance = Math.max(0, d.enemy.endurance - damage);
  }
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (effects?.section === 149) {
    d.willpower = (Number(d.willpower) || 0) - 1;
    d.endurance = Math.max(0, d.endurance - (effects.shield ? 1 : 2));
    _appendLog(d, t('battlesim439.log.soul', { loss: effects.shield ? 1 : 2, will: d.willpower }));
  }

  _appendLog(d, t('battlesim439.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: escape ? 0 : damage === 'K' ? t('battlesim439.log.k_word') : damage,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim439.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  if (escape && d.endurance > 0) _stopFight(d, [route]);
  else _checkBattleEnd(d);
  if (effects && !effects.finished) {
    const deadline = DEADLINES[effects.section];
    if (deadline && d.roundsThisBattle >= deadline[0]) _stopFight(d, [deadline[1] || (d.willpower >= 10 ? 331 : 32)]);
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { NEIJJIN, SVG_SKULL, SVG_TROPHY, VICTORY_ROUTES, _appendLog, _enemyNameSafe, _recordOutcome, _stopFight, t } = getContext();

  if (d.combatEffects && d.endurance <= 0) {
    d.combatEffects.finished = true;
    _appendLog(d, t('battlesim439.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  if (d.enemy.endurance <= 0) {
    const effects = d.combatEffects;
    if (effects?.section === 101 && effects.sequence < 8) {
      effects.sequence++;
      const [skill, endurance] = NEIJJIN[effects.sequence];
      d.enemy = { name: t('battlesim439.ui.neijjin', { n: effects.sequence + 1 }), skill, endurance, enduranceMax: endurance };
      _appendLog(d, t('battlesim439.log.next', { enemy: _enemyNameSafe(d) }));
      return;
    }
    if (effects?.section === 281) {
      _stopFight(d, [d.willpower >= 10 ? 331 : 32]);
      return;
    }
    _appendLog(d, t('battlesim439.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects) _stopFight(d, VICTORY_ROUTES[effects.section] || []);
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim439.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const future = d.printedRules === 1;
  if (future && d.combatEffects?.initialEnemy) d.enemy = { ...d.combatEffects.initialEnemy };
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim439.log.reset_sep'));
  _appendLog(d, t('battlesim439.log.reset_future', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _runRound, _checkBattleEnd, _resetBattle };
}

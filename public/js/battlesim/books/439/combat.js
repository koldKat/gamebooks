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
  const { _effectiveSkill, _rulesFor } = getContext();

  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  d.printedRules = 1;
  d.combatEffects = {
    section, weapon: ['staff','other','none'].includes(d.nextWeapon) ? d.nextWeapon : 'staff',
    dagger: d.nextDagger === true, spareWeapon: d.nextSpareWeapon === true,
    shield: d.nextShield === true, willSpend: Math.max(1, Math.floor(Number(d.nextWillSpend) || 1)),
    mentalSkill: (Number(d.willpower) || 0) + d.endurance,
    initialEnemy: { ...d.enemy },
  };
  const sequence = _rulesFor(section).sequence;
  if (sequence) d.combatEffects.sequence = Math.max(0, Math.min(sequence.profiles.length - 1, Number(d.enemy.name.match(new RegExp(sequence.namePattern))?.[1] || 1) - 1));
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _effectiveSkill(d) {
  const { _rulesFor } = getContext();

  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects) return skill;
  const rules = _rulesFor(effects.section);
  if (rules.mentalCombat) return effects.mentalSkill + (d.attackModifier || 0);
  if (effects.weapon === 'none') skill -= 8;
  else if (effects.weapon !== 'staff' || !(d.willpower >= 1)) skill -= 6;
  if (effects.dagger && effects.weapon !== 'none') skill++;
  skill += rules.skillBonus || 0;
  if (effects.spareWeapon) skill += rules.spareWeaponBonus || 0;
  if (rules.openingBonus && d.roundsThisBattle < rules.openingBonus.rounds) skill += rules.openingBonus.amount;
  return skill;
}

function _stopFight(d, routes) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.routes = routes;
  _appendLog(d, t('battlesim439.log.continue', { sections: routes.join(' / ') }));
}

function _escapeRoute(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects || effects.finished) return null;
  const escape = _rulesFor(effects.section).escape;
  return escape && d.roundsThisBattle >= escape.afterRounds ? escape.route : null;
}

function _runRound(escape = false) {
  const { COMBAT_TABLE, DEADLINES, _appendLog, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _escapeRoute, _pick10, _pickRow, _ratioCol, _renderAll, _stopFight, _rulesFor, saveState, t } = getContext();

  const d = _data();
  escape = escape === true;
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || d.combatEffects?.finished) return;
  if (d.printedRules === 1 && !d.combatEffects) _captureFightEffects(d);
  const route = escape ? _escapeRoute(d) : null;
  if (escape && !route) return;
  const effects = d.combatEffects;
  const rules = effects ? _rulesFor(effects.section) : {};
  if (effects) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  const [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  _appendLog(d, t('battlesim439.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));
  let spent = 0;
  if (effects && !rules.mentalCombat && effects.weapon === 'staff' && d.willpower > 0) {
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
  if (rules.drain) {
    const loss = effects.shield ? rules.drain.withShield : rules.drain.withoutShield;
    d.willpower = (Number(d.willpower) || 0) - rules.drain.will;
    d.endurance = Math.max(0, d.endurance - loss);
    _appendLog(d, t('battlesim439.log.soul', { loss, will: d.willpower }));
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
    if (deadline && d.roundsThisBattle >= deadline[0]) _stopFight(d, [deadline[1] || (d.willpower >= rules.willOutcome.threshold ? rules.willOutcome.atLeast : rules.willOutcome.below)]);
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _stopFight, _rulesFor, t } = getContext();

  if (d.combatEffects && d.endurance <= 0) {
    d.combatEffects.finished = true;
    _appendLog(d, t('battlesim439.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  if (d.enemy.endurance <= 0) {
    const effects = d.combatEffects;
    const rules = effects ? _rulesFor(effects.section) : {};
    if (rules.sequence && effects.sequence < rules.sequence.profiles.length - 1) {
      effects.sequence++;
      const [skill, endurance] = rules.sequence.profiles[effects.sequence];
      d.enemy = { name: t(rules.sequence.nameKey, { n: effects.sequence + 1 }), skill, endurance, enduranceMax: endurance };
      _appendLog(d, t('battlesim439.log.next', { enemy: _enemyNameSafe(d) }));
      return;
    }
    if (rules.willOutcome) {
      _stopFight(d, [d.willpower >= rules.willOutcome.threshold ? rules.willOutcome.atLeast : rules.willOutcome.below]);
      return;
    }
    _appendLog(d, t('battlesim439.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects) _stopFight(d, rules.victoryRoutes || []);
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
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _runRound, _checkBattleEnd, _resetBattle };
}

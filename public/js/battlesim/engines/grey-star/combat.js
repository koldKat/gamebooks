// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
  const key = suffix => getContext().definition.i18nPrefix + suffix;
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
  const { _effectiveSkill, _rulesFor, definition } = getContext();

  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  const rules = _rulesFor(section);
  d.printedRules = 1;
  d.combatEffects = {
    section, weapon: rules.forceWeapon || (['staff','other','none'].includes(d.nextWeapon) ? d.nextWeapon : 'staff'),
    dagger: d.nextDagger === true, spareWeapon: d.nextSpareWeapon === true,
    daggerBonus: definition.daggerBonus ?? 1, companion: d.nextCompanion === true,
    invulnerable: d.nextInvulnerable === true,
    shield: d.nextShield === true, willSpend: Math.max(1, Math.floor(Number(d.nextWillSpend) || 1)),
    mentalSkill: (Number(d.willpower) || 0) + d.endurance,
    perRoundStaffSpend: definition.roundWillpowerChoice === true,
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
  if (effects.weapon !== 'staff' && effects.dagger && rules.daggerPenalty != null) skill -= rules.daggerPenalty;
  else if (effects.weapon !== 'staff' && rules.noStaffPenalty != null) skill -= rules.noStaffPenalty;
  else if (effects.weapon === 'none') skill -= 8;
  else if (effects.weapon !== 'staff' || !(d.willpower >= 1)) skill -= 6;
  if (effects.dagger && effects.weapon !== 'none' && rules.daggerPenalty == null) skill += effects.daggerBonus ?? 1;
  skill += rules.skillBonus || 0;
  if (effects.companion) skill += rules.companionBonus || 0;
  if (effects.spareWeapon) skill += rules.spareWeaponBonus || 0;
  if (rules.openingBonus && d.roundsThisBattle < rules.openingBonus.rounds) skill += rules.openingBonus.amount;
  return skill;
}

function _stopFight(d, routes) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.routes = routes;
  if (routes.length) _appendLog(d, t(key('.log.continue'), { sections: routes.join(' / ') }));
}

function _willRoutes(d, rules) {
  const { _appendLog, t } = getContext();
  const outcome = rules.willOutcome;
  if (outcome.strict && d.willpower === outcome.threshold) {
    _appendLog(d, t(key('.log.source_gap')));
    return [];
  }
  return [d.willpower >= outcome.threshold ? outcome.atLeast : outcome.below];
}

function _escapeRoute(d) {
  const { _rulesFor } = getContext();
  const effects = d.combatEffects;
  if (!effects || effects.finished) return null;
  const escape = _rulesFor(effects.section).escape;
  if (!escape || d.roundsThisBattle < escape.afterRounds
      || (escape.beforeRounds != null && d.roundsThisBattle >= escape.beforeRounds)) return null;
  if (escape.firstRoundPlayerLossLessThanEnemy) {
    const losses = effects.firstRoundLosses;
    if (!losses || !((losses.player === 'K' ? Infinity : losses.player)
        < (losses.enemy === 'K' ? Infinity : losses.enemy))) return null;
  }
  return escape.route;
}

function _ceaseRoute(d) {
  const { _rulesFor } = getContext();
  if (!d?.rolled || !d.combatEffects || d.combatEffects.finished || d.endurance <= 0 || d.enemy.endurance <= 0) return null;
  const rules = _rulesFor(d.combatEffects.section);
  if (rules.stopRoute) return rules.stopRoute;
  const stop = rules.conditionalStop;
  return stop && d.roundsThisBattle >= stop.afterRounds
    && (!stop.playerEnduranceGreaterThanEnemy || d.endurance > d.enemy.endurance) ? stop.route : null;
}

function _ceaseFight() {
  const { _data, _stopFight, saveState, _renderAll } = getContext();
  const d = _data(), route = _ceaseRoute(d);
  if (!route) return;
  _stopFight(d, [route]);
  saveState();
  _renderAll();
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
  const [enemyLoss, printedPlayerLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  let lwLoss = rules.playerImmune || (rules.allowInvulnerability && effects?.invulnerable)
    || d.roundsThisBattle <= (rules.ignorePlayerLossRounds || 0) ? 0 : printedPlayerLoss;
  _appendLog(d, t(key('.log.round'), { round: d.roundsThisBattle, ratio: d.ratio, pick }));
  let spent = 0;
  if (effects && !rules.mentalCombat && effects.weapon === 'staff' && d.willpower > 0) {
    const requested = effects.perRoundStaffSpend ? Math.max(1, Math.floor(Number(d.nextWillSpend) || 1)) : effects.willSpend;
    spent = Math.min(requested, Math.floor(d.willpower));
    d.willpower -= spent;
    _appendLog(d, t(key('.log.will'), { spent, will: d.willpower }));
  }
  const damage = enemyLoss === 'K' ? enemyLoss : enemyLoss * Math.max(1, spent);
  if (!escape && rules.ignorePlayerLossWhenEnemyLosesMore
      && (damage === 'K' ? Infinity : damage) > (lwLoss === 'K' ? Infinity : lwLoss)) lwLoss = 0;
  if (effects && d.roundsThisBattle === 1) effects.firstRoundLosses = {player: lwLoss, enemy: escape ? 0 : damage};
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
    _appendLog(d, t(key('.log.soul'), { loss, will: d.willpower }));
  }

  _appendLog(d, t(key('.log.result'), {
    enemy: _enemyNameSafe(d),
    enemyLoss: escape ? 0 : damage === 'K' ? t(key('.log.k_word')) : damage,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t(key('.log.k_word')) : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  const deadline = effects ? DEADLINES[effects.section] : null;
  if (escape && d.endurance > 0) _stopFight(d, [route]);
  else if (rules.deadlineBeforeVictory && deadline && d.roundsThisBattle >= deadline[0] && d.endurance > 0) {
    _stopFight(d, [deadline[1]]);
  }
  else _checkBattleEnd(d);
  if (effects && !effects.finished) {
    if (deadline && d.roundsThisBattle >= deadline[0]) _stopFight(d, deadline[1] ? [deadline[1]] : _willRoutes(d, rules));
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, _stopFight, _rulesFor, t } = getContext();

  if (d.combatEffects && d.endurance <= 0) {
    d.combatEffects.finished = true;
    _appendLog(d, t(key('.log.fallen'), { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    const routes = _rulesFor(d.combatEffects.section).deathRoutes;
    if (routes?.length) _stopFight(d, routes);
    return;
  }
  if (d.enemy.endurance <= 0) {
    const effects = d.combatEffects;
    const rules = effects ? _rulesFor(effects.section) : {};
    if (rules.sequence && effects.sequence < rules.sequence.profiles.length - 1) {
      effects.sequence++;
      const [skill, endurance] = rules.sequence.profiles[effects.sequence];
      d.enemy = { name: t(rules.sequence.nameKey, { n: effects.sequence + 1 }), skill, endurance, enduranceMax: endurance };
      _appendLog(d, t(key('.log.next'), { enemy: _enemyNameSafe(d) }));
      return;
    }
    if (rules.willOutcome) {
      _stopFight(d, _willRoutes(d, rules));
      return;
    }
    _appendLog(d, t(key('.log.defeated'), { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    const byRound = rules.victoryByRound;
    if (effects) _stopFight(d, byRound
      ? [d.roundsThisBattle <= byRound.through ? byRound.within : byRound.after]
      : rules.victoryRoutes || []);
  } else if (d.endurance <= 0) {
    _appendLog(d, t(key('.log.fallen'), { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t(key('.log.reset_sep')));
  _appendLog(d, t(key('.log.reset_future'), { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _ceaseRoute, _ceaseFight, _runRound, _checkBattleEnd, _resetBattle };
}

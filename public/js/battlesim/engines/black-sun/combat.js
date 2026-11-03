// Resolve encounter rounds using the printed page's shared base die, without story automation.
import {blackSunTargetAllowed, applyBlackSunDamage, blackSunHitEffect,
  blackSunIncomingAttacks, blackSunDefenseEffect} from './special.js';
import {applyBlackSunEffect} from './effects.js';
const copy = value => structuredClone(value);
const integer = (value, min = 0, max = 1000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const vitalityNames = Object.freeze(['fit', 'normal', 'battered', 'hurt', 'critical', 'dead']);

function validatePlayer(player) {
  for (const key of ['strength', 'dexterity', 'weaponBonus', 'protection', 'karma', 'fighterBonus']) integer(player[key]);
  integer(player.vitality, 0, player.kesrani ? 6 : 5);
  for (const key of ['expert', 'kesrani', 'fullMoonPower']) {
    if (typeof player[key] !== 'boolean') throw new RangeError('Invalid combat option');
  }
  if (player.kyrnaVitality != null) integer(player.kyrnaVitality, 0, 5);
  if (player.riderRank != null) integer(player.riderRank, 1, 5);
  if (player.fatePoints != null) integer(player.fatePoints, 0, 13);
  return player;
}

export function blackSunPlayer(values = {}) {
  return validatePlayer({strength: 6, dexterity: 6, weaponBonus: 0, protection: 0, fighterBonus: 0,
    vitality: 1, karma: 0, expert: false, kesrani: false, fullMoonPower: false, ...copy(values)});
}

export function blackSunStart(player, encounter) {
  player = {...player, ...copy(encounter?.playerOverrides ?? {})};
  validatePlayer(player);
  if (player.vitality >= (player.kesrani ? 6 : 5)) throw new RangeError('Player cannot start while dead');
  if (player.mounted && player.kyrnaVitality === 5) throw new RangeError('Cannot ride a dead dragon');
  if (!encounter || !Array.isArray(encounter.opponents) || !encounter.opponents.length
      || encounter.opponents.length > 100) throw new RangeError('Invalid encounter');
  const fight = {rulesVersion: 1, player: copy(player), encounter: copy(encounter),
    opponents: copy(encounter.opponents), round: integer(encounter.startRound ?? 0), roundStarted: false,
    status: 'fighting', events: [], acknowledged: [], log: []};
  if (encounter.ally) {
    fight.ally = copy(encounter.ally); integer(fight.ally.vitality, 1); integer(fight.ally.lowBaseMax, 1, 6);
  }
  integer(encounter.attack);
  if (!encounter.defenseOnly) integer(encounter.defense);
  integer(encounter.weaponDivisor ?? 1, 1);
  for (const enemy of fight.opponents) {
    if (encounter.defenseOnly) {
      if (enemy.resistance != null) throw new RangeError('Survival opponents have no resistance');
    } else integer(enemy.resistance, 1);
    if (enemy.attack != null) integer(enemy.attack);
    if (enemy.track && (!Array.isArray(enemy.track) || enemy.track.length !== enemy.resistance
        || enemy.track.some(value => !['normal', 'shield'].includes(value)))) throw new RangeError('Invalid resistance track');
    enemy.initialResistance = enemy.resistance;
    enemy.attackBonus = integer(enemy.attackBonus ?? 0);
    enemy.defenseBonus = integer(enemy.defenseBonus ?? 0);
  }
  if (encounter.openingDamage) applyBlackSunDamage(fight, fight.opponents[0], integer(encounter.openingDamage));
  if (encounter.entryEvent) pause(fight, encounter.entryEvent, 'before-encounter');
  else if (encounter.criticalOnEntry && criticalEventFor(fight)) pause(fight, criticalEventFor(fight), 'before-encounter');
  else finish(fight);
  return fight;
}

export function validateBlackSunFight(fight) {
  if (fight?.rulesVersion !== 1 || !['fighting', 'paused', 'win', 'loss', 'cancelled', 'ended'].includes(fight.status)
      || typeof fight.roundStarted !== 'boolean' || !Array.isArray(fight.log) || fight.log.length > 100
      || !Array.isArray(fight.acknowledged) || !Array.isArray(fight.events)
      || !Array.isArray(fight.opponents) || !fight.opponents.length || fight.opponents.length > 100) throw new RangeError('Invalid saved encounter');
  validatePlayer(fight.player); integer(fight.round, 0, 1000000);
  integer(fight.encounter?.attack); integer(fight.encounter.weaponDivisor ?? 1, 1);
  if (!fight.encounter.defenseOnly) integer(fight.encounter.defense);
  if ((fight.status === 'paused') !== Boolean(fight.pending)) throw new RangeError('Invalid pending instruction');
  for (const enemy of fight.opponents) {
    integer(enemy.attackBonus); integer(enemy.defenseBonus);
    if (enemy.attack != null) integer(enemy.attack);
    if (enemy.track && (!Array.isArray(enemy.track) || enemy.track.length !== enemy.initialResistance
        || enemy.track.some(value => !['normal', 'shield'].includes(value)))) throw new RangeError('Invalid saved resistance track');
    if (fight.encounter.defenseOnly) {
      if (enemy.resistance !== null || enemy.initialResistance !== null) throw new RangeError('Invalid survival opponent');
    } else { integer(enemy.initialResistance, 1); integer(enemy.resistance, 0, enemy.initialResistance); }
  }
  if (fight.ally) { integer(fight.ally.vitality); integer(fight.ally.lowBaseMax, 1, 6); }
  return fight;
}

export function blackSunCombatValues(fight) {
  const p = validatePlayer(fight.player), e = fight.encounter;
  const penalty = p.expert && !p.ignoreWoundPenalty ? (p.vitality >= 4 ? 2 : p.vitality === 3 ? 1 : 0) : 0;
  const weapon = e.noEquipment ? 0 : Math.floor(p.weaponBonus / (e.weaponDivisor ?? 1));
  return {
    attack: p.strength - penalty + weapon + p.fighterBonus + (e.playerAttackModifier ?? 0)
      + (fight.attackBoosts ?? []).filter(boost => fight.round <= boost.expires).reduce((n, boost) => n + boost.amount, 0),
    defense: (e.defendWithStrength ? p.strength : p.dexterity) - penalty
      + (e.noEquipment || e.defendWithStrength ? 0 : p.protection) + (e.playerDefenseModifier ?? 0)
      + (fight.defenseBoosts ?? []).filter(boost => fight.round <= boost.expires).reduce((n, boost) => n + boost.amount, 0),
  };
}

function living(fight) {
  return fight.opponents.filter(enemy => fight.encounter.defenseOnly || enemy.resistance > 0);
}

export function blackSunEnemyValues(fight) {
  const e = fight.encounter;
  let attack = e.attack, defense = e.defense;
  if (e.relativeAttack != null || e.relativeDefense != null) {
    const player = blackSunCombatValues(fight);
    if (e.relativeAttack != null) attack = player.attack + e.relativeAttack;
    if (e.relativeDefense != null) defense = player.defense + e.relativeDefense;
  }
  for (const phase of e.phases ?? []) {
    const lost = fight.opponents.reduce((n, enemy) => n + (enemy.initialResistance - enemy.resistance), 0);
    if ((phase.round == null || fight.round >= phase.round) && (phase.lost == null || lost >= phase.lost)) {
      attack = phase.attack ?? attack; defense = phase.defense ?? defense;
    }
  }
  const enemies = living(fight);
  return {attack: attack + enemies.reduce((n, enemy) => n + enemy.attackBonus, 0) - (fight.enemyAttackPenalty ?? 0),
    defense: e.defenseOnly ? null : defense + enemies.reduce((n, enemy) => n + enemy.defenseBonus, 0)};
}

function pause(fight, event, phase) {
  fight.status = 'paused'; fight.pending = {...copy(event), phase};
  if (event.requiresEffect) fight.pending.effectUsesAtPause = fight.effectUses?.[event.requiresEffect] ?? 0;
  fight.events.push(copy(fight.pending));
}

function eventAt(fight, phase) {
  return fight.encounter.events?.find(event => event.phase === phase && event.round === fight.round
    && (event.minKarma == null || fight.player.karma >= event.minKarma)
    && (!event.withoutTalisman || !fight.encounter.raminTalisman)
    && !fight.acknowledged.includes(event.id));
}

function playerDead(fight) { return fight.player.vitality >= (fight.player.kesrani ? 6 : 5); }

function criticalEventFor(fight) {
  const event = fight.encounter.criticalEvent;
  return fight.player.vitality === 4 && event && (!event.requiresDragonAlive || fight.player.kyrnaVitality !== 5)
    && Object.entries(event.requiresPlayer ?? {}).every(([key, value]) => fight.player[key] === value)
    && (event.repeatable || !fight.acknowledged.includes(event.id)) ? event : null;
}

function lostCount(fight) {
  return fight.opponents.filter(enemy => enemy.resistance === 0).length;
}

function finish(fight) {
  if (playerDead(fight)) {
    if (fight.encounter.deathEvent && (fight.encounter.deathEvent.repeatable
        || !fight.acknowledged.includes(fight.encounter.deathEvent.id))) pause(fight, fight.encounter.deathEvent, 'on-death');
    else { fight.status = 'loss'; delete fight.pending; }
    return;
  }
  if (!fight.encounter.defenseOnly && (!living(fight).length
      || (fight.encounter.stopAfterKills && lostCount(fight) >= fight.encounter.stopAfterKills))) {
    delete fight.pending;
    if (fight.encounter.victoryEvent) pause(fight, fight.encounter.victoryEvent, 'victory');
    else {
      fight.status = 'win';
      fight.continuation = fight.ally && fight.ally.vitality === 0
        ? fight.encounter.allyLostWinTarget : fight.encounter.winTarget;
    }
  }
}

// A paused printed instruction is acknowledged explicitly, never visited automatically.
export function blackSunAcknowledge(current, changes = {}) {
  validateBlackSunFight(current);
  if (current.status !== 'paused' || !current.pending) throw new RangeError('No pending instruction');
  if (current.pending.requiresUnusedMoonAttack) throw new RangeError('Draw the printed special attack first');
  if (current.pending.transitionTarget) throw new RangeError('Apply the printed combat transition first');
  if (current.pending.requiresEffect && (current.effectUses?.[current.pending.requiresEffect] ?? 0)
      <= (current.pending.effectUsesAtPause ?? 0)) throw new RangeError('Resolve the printed combat effect first');
  const fight = copy(current), event = fight.pending;
  if (changes.player) fight.player = validatePlayer({...fight.player, ...copy(changes.player)});
  if (event.id && !fight.acknowledged.includes(event.id)) fight.acknowledged.push(event.id);
  delete fight.pending;
  if (playerDead(fight)) fight.status = 'loss';
  else if (event.endEncounter) fight.status = 'ended';
  else if (event.phase === 'victory') fight.status = 'win';
  else {
    fight.status = 'fighting'; finish(fight);
    const critical = criticalEventFor(fight);
    if (fight.status === 'fighting' && event.phase === 'after-round' && critical && critical.id !== event.id) pause(fight, critical, 'after-round');
  }
  return fight;
}

// Values are read from one original page; independent attack/defense base rerolls are impossible.
export function blackSunRound(current, page, action = {}) {
  validateBlackSunFight(current);
  if (current.status !== 'fighting') throw new RangeError('No active encounter');
  if (action.expectedRound !== undefined && action.expectedRound !== current.round) throw new RangeError('Stale combat round');
  const fight = copy(current), p = fight.player, e = fight.encounter;
  validatePlayer(p);
  const dice = {base: integer(page?.base, 1, 6), attack: integer(page?.attack, 1, 6),
    defense: integer(page?.defense, 1, 6), moon: page?.moon};
  if (!['new', 'crescent', 'half', 'gibbous', 'full'].includes(dice.moon)) throw new RangeError('Invalid page moon');
  if (!fight.roundStarted) {
    fight.round++; fight.roundStarted = true;
    delete fight.availableEscapes;
    for (const reinforcement of e.reinforcements ?? []) if (reinforcement.round === fight.round) {
      const enemy = copy(reinforcement.opponent);
      integer(enemy.resistance, 1); integer(enemy.attackBonus ?? 0); integer(enemy.defenseBonus ?? 0);
      enemy.initialResistance = enemy.resistance;
      enemy.attackBonus ??= 0; enemy.defenseBonus ??= 0; fight.opponents.push(enemy);
    }
    for (const periodic of [...(e.periodicEffects ?? []), ...(e.periodicDamage ? [e.periodicDamage] : [])]) {
      if (periodic.rounds?.includes(fight.round) || periodic.every && fight.round % periodic.every === 0) {
        const index = periodic.target === 'selected' ? action.target ?? fight.opponents.findIndex(enemy => enemy.resistance > 0) : 0;
        const target = fight.opponents[integer(index, 0, fight.opponents.length - 1)];
        if (!blackSunTargetAllowed(fight, target) || e.defenseOnly) throw new RangeError('Invalid ongoing effect target');
        applyBlackSunDamage(fight, target, integer(periodic.amount, 1)); finish(fight);
        if (fight.status !== 'fighting') return fight;
      }
    }
    const before = eventAt(fight, 'before-round');
    if (before) { pause(fight, before, 'before-round'); return fight; }
  }
  const kind = action.type ?? 'attack';
  if (!['attack', 'defend', 'change-weapon', 'pull-harpoon', 'release-harpoon', 'tactic'].includes(kind)) throw new RangeError('Invalid combat action');
  if (fight.round <= (fight.skipActionsUntil ?? 0) && (!['attack', 'defend'].includes(kind)
      || action.autoAttack || action.autoDefense)) throw new RangeError('This round is spent without actions');
  if (kind === 'pull-harpoon' && (!fight.harpooned || !e.harpoonPull)) throw new RangeError('No lodged harpoon');
  if (kind === 'release-harpoon' && !fight.harpooned) throw new RangeError('No lodged harpoon');
  const spine = action.spine ?? 'none';
  if (!['none', 'combined', 'separate'].includes(spine) || spine !== 'none' && (!e.spineBonus || p.twoHandedWeapon || e.noEquipment)) throw new RangeError('Second weapon unavailable');
  if (action.autoAttack && !e.allowKarmaAttack) throw new RangeError('Automatic attack unavailable');
  if (action.autoDefense && !e.allowKarmaDefense) throw new RangeError('Automatic defense unavailable');
  if (action.enhancedAttack && (!action.autoAttack || !e.karmaDamage)) throw new RangeError('Enhanced attack unavailable');
  if (action.enhancedDefense && (!action.autoDefense || !e.karmaHeal)) throw new RangeError('Enhanced defense unavailable');
  const karmaCost = (action.autoAttack ? e.karmaAttackCost ?? 1 : 0) + (action.autoDefense ? e.karmaDefenseCost ?? 1 : 0)
    + Number(Boolean(action.enhancedAttack)) + Number(Boolean(action.enhancedDefense));
  if (p.karma < karmaCost) throw new RangeError('Not enough Karma');
  p.karma -= karmaCost;
  if (action.enhancedDefense) p.vitality = Math.max(0, p.vitality - 1);
  const values = blackSunCombatValues(fight), fullMoon = p.fullMoonPower && dice.moon === 'full';
  const report = {round: fight.round, page: copy(dice), action: kind, playerHit: false, playerLoss: 0,
    attackTotal: values.attack + dice.base + dice.attack, defenseTotal: values.defense + dice.base + dice.defense};
  if (kind === 'change-weapon') {
    p.weaponBonus = integer(action.weaponBonus); p.weaponName = String(action.weaponName ?? '');
    p.twoHandedWeapon = Boolean(action.twoHandedWeapon);
    fight.harpooned = false; delete fight.harpoonTarget;
  }
  if (kind === 'release-harpoon') { fight.harpooned = false; delete fight.harpoonTarget; }
  if (kind === 'pull-harpoon') {
    const target = fight.opponents[integer(fight.harpoonTarget, 0, fight.opponents.length - 1)];
    const penalty = p.expert && !p.ignoreWoundPenalty ? (p.vitality >= 4 ? 2 : p.vitality === 3 ? 1 : 0) : 0;
    report.strengthTotal = p.strength - penalty + dice.base + dice.attack;
    report.playerHit = report.strengthTotal >= integer(e.harpoonPull.threshold, 1);
    report.enemyLoss = report.playerHit ? applyBlackSunDamage(fight, target, integer(e.harpoonPull.damage, 1)) : 0;
  }
  if (kind === 'tactic') {
    const rule = Object.hasOwn(e.tactics ?? {}, action.tactic) ? e.tactics[action.tactic] : null;
    if (!rule || !['skip', 'trade'].includes(action.tactic)
        || !e.warfare && report.defenseTotal < e.tactics.defenseThreshold
        || fight.usedTactics?.includes(action.tactic)) throw new RangeError('Tactic unavailable');
    (fight.usedTactics ??= []).push(action.tactic);
    report.tactic = rule.section;
    if (rule.rounds) fight.skipActionsUntil = fight.round + integer(rule.rounds, 1) - 1;
    if (rule.playerLoss) {
      p.vitality = Math.min(p.kesrani ? 6 : 5, p.vitality + integer(rule.playerLoss, 1)); report.playerLoss = rule.playerLoss;
      fight.woundsTaken = (fight.woundsTaken ?? 0) + rule.playerLoss;
    }
    if (rule.enemyDamage) { report.enemyLoss = applyBlackSunDamage(fight, fight.opponents[0], integer(rule.enemyDamage, 1)); report.playerHit = true; }
  }
  const skipActions = kind === 'tactic' || fight.skipActionsRound === fight.round || fight.round <= (fight.skipActionsUntil ?? 0);
  if (kind === 'attack' && !skipActions && !e.defenseOnly && !(e.noAttackRounds ?? []).includes(fight.round)) {
    const target = fight.opponents[integer(action.target ?? 0, 0, fight.opponents.length - 1)];
    if (!target.resistance) throw new RangeError('Target already defeated');
    if (!blackSunTargetAllowed(fight, target)) throw new RangeError('Target protected by active body parts');
    report.target = action.target ?? 0;
    if (spine === 'combined') report.attackTotal += integer(e.spineBonus, 1);
    if (fullMoon || action.autoAttack || fight.forcedAttackRound === fight.round || report.attackTotal >= blackSunEnemyValues(fight).defense) {
      report.playerHit = true;
      const damage = integer(e.damagePerHit ?? 1, 1) + Number(Boolean(action.enhancedAttack))
        + (!fight.firstWeaponHit && e.firstHitExtraDamage && (!e.firstHitWeapon || p.weaponName === e.firstHitWeapon)
          ? integer(e.firstHitExtraDamage, 1) : 0);
      const allowed = !e.weaponRequirement || e.weaponRequirement.names.includes(p.weaponName)
        || p.weaponBonus === e.weaponRequirement.exactBonus;
      const split = allowed && e.splitHitDamage && (!e.splitHitWeapon || p.weaponName === e.splitHitWeapon) && living(fight).length > 1;
      report.enemyLoss = allowed ? applyBlackSunDamage(fight, target, damage) : 0;
      if (allowed) {
        fight.firstWeaponHit = true;
        if (split) {
          const second = fight.opponents[integer(action.secondaryTarget, 0, fight.opponents.length - 1)];
          if (second === target || !second.resistance || !blackSunTargetAllowed(fight, second)) throw new RangeError('Choose a different living opponent');
          report.secondaryTarget = action.secondaryTarget;
          report.enemyLoss += applyBlackSunDamage(fight, second, integer(e.splitHitDamage, 1));
        }
      }
      if (e.firstHitInstruction && !fight.weaponInstructionShown) {
        report.instruction = e.firstHitInstruction; fight.weaponInstructionShown = true;
      }
      if (allowed && e.qikSpittle && !fight.qikApplied) {
        fight.enemyAttackPenalty = (fight.enemyAttackPenalty ?? 0) + 2; fight.qikApplied = true;
      }
      const effect = blackSunHitEffect(fight, report);
      if (effect) pause(fight, effect, 'after-player-attack');
    }
    if (spine === 'separate' && fight.status === 'fighting' && target.resistance > 0) {
      report.spineAttackTotal = values.attack - Math.floor(p.weaponBonus / (e.weaponDivisor ?? 1))
        + integer(e.spineBonus, 1) + dice.base + dice.attack;
      if (fullMoon || report.spineAttackTotal >= blackSunEnemyValues(fight).defense) {
        report.spineLoss = applyBlackSunDamage(fight, target, 1);
        report.enemyLoss = (report.enemyLoss ?? 0) + report.spineLoss;
      }
    }
  }
  if (fight.status === 'fighting') finish(fight);
  // A defeated opponent cannot strike back; group bonuses change as soon as a member falls.
  if (fight.status === 'fighting' && !skipActions) {
    const incoming = blackSunEnemyValues(fight).attack;
    report.enemyAttack = incoming;
    report.incomingAttacks = [];
    const strikes = blackSunIncomingAttacks(fight, incoming);
    if (fight.extraIncomingRound === fight.round) {
      const extra = action.extraDefensePage;
      const total = values.defense + integer(extra?.base, 1, 6) + integer(extra?.defense, 1, 6);
      if (!['new', 'crescent', 'half', 'gibbous', 'full'].includes(extra?.moon)) throw new RangeError('Missing second defense page');
      strikes.push({attack: incoming, defenseTotal: total, page: copy(extra)});
    }
    for (const strike of strikes) {
      const protectedByMoon = strike.page ? p.fullMoonPower && strike.page.moon === 'full' : fullMoon;
      const hit = !protectedByMoon && !action.autoDefense && !(e.raminTalisman && fight.round === 1)
        && (strike.defenseTotal ?? report.defenseTotal) < strike.attack;
      report.incomingAttacks.push({...strike, hit});
      if (hit) {
        const effect = blackSunDefenseEffect(fight, report);
        if (!effect.ignore) { p.vitality++; report.playerLoss++; fight.woundsTaken = (fight.woundsTaken ?? 0) + 1; }
        if (effect.event) { pause(fight, effect.event, 'after-round'); break; }
        if (playerDead(fight)) break;
      }
    }
    if (e.defenseDoubleOneEvent && dice.base === 1 && dice.defense === 1) pause(fight, e.defenseDoubleOneEvent, 'after-round');
    if (fight.status === 'fighting' && report.playerLoss && e.afterWoundsEvent
        && fight.woundsTaken >= e.afterWoundsEvent.losses && !fight.acknowledged.includes(e.afterWoundsEvent.id)) pause(fight, e.afterWoundsEvent, 'after-round');
    if (fight.status === 'fighting' && report.playerLoss && e.firstWoundEvent
        && !fight.acknowledged.includes(e.firstWoundEvent.id)) pause(fight, e.firstWoundEvent, 'after-round');
    if (fight.status === 'fighting' && report.playerLoss && criticalEventFor(fight)) pause(fight, criticalEventFor(fight), 'after-round');
    if (fight.status === 'fighting') finish(fight);
  }
  fight.log.push(report); fight.log = fight.log.slice(-100);
  fight.roundStarted = false;
  if (fight.status === 'fighting') {
    const threshold = e.defenseThresholdEvent;
    if (threshold && report.incomingAttacks?.length && !report.playerLoss && report.defenseTotal >= threshold.threshold) {
      pause(fight, {...threshold, id: 'defense-threshold'}, 'after-round'); return fight;
    }
    if (e.escapeAfterHitWithoutWound && report.playerHit && !report.playerLoss) fight.availableEscapes = copy(e.escapeAfterHitWithoutWound);
    const after = eventAt(fight, 'after-round');
    if (after) pause(fight, after, 'after-round');
  }
  return fight;
}

// Mind over Body is a combat-only conversion; no inventory or story state is changed.
export function blackSunMindOverBody(current, strengthPoints) {
  validateBlackSunFight(current);
  if (current.status !== 'fighting') throw new RangeError('No active encounter');
  const fight = copy(current); integer(strengthPoints, 0, 2);
  if (fight.player.vitality >= 3) throw new RangeError('Too wounded for Mind over Body');
  fight.player.vitality++;
  fight.player.strength += strengthPoints; fight.player.dexterity += 2 - strengthPoints;
  fight.temporaryStrength = (fight.temporaryStrength ?? 0) + strengthPoints;
  fight.temporaryDexterity = (fight.temporaryDexterity ?? 0) + 2 - strengthPoints;
  return fight;
}

export function blackSunRecoveredPlayer(fight) {
  validateBlackSunFight(fight);
  const player = copy(fight.player);
  player.strength -= fight.temporaryStrength ?? 0; player.dexterity -= fight.temporaryDexterity ?? 0;
  return validatePlayer(player);
}

export function blackSunCancel(current) {
  validateBlackSunFight(current);
  if (!['fighting', 'paused'].includes(current.status)) throw new RangeError('No active encounter');
  const fight = copy(current); fight.status = 'cancelled'; delete fight.pending;
  return fight;
}

export function blackSunUseEffect(current, id, options = {}) {
  validateBlackSunFight(current);
  if (!['fighting', 'paused'].includes(current.status)) throw new RangeError('No active encounter');
  const effect = current.encounter.effects?.find(effect => effect.id === id);
  if (!effect) throw new RangeError('Combat effect not enabled');
  const fight = applyBlackSunEffect(copy(current), effect, options);
  if (playerDead(fight) || !fight.encounter.defenseOnly && !living(fight).length) finish(fight);
  return validateBlackSunFight(fight);
}

// Select only an unused printed special attack; its local test changes combat alone.
export function blackSunSelectSpecial(current, draw, testPage) {
  validateBlackSunFight(current);
  if (current.status !== 'paused' || !current.pending.requiresUnusedMoonAttack) throw new RangeError('No special attack pending');
  const rule = current.encounter.specialAttacks?.find(rule => rule.section === draw?.section);
  if (!rule || current.encounter.specialMoonRoutes?.[draw.page?.moon] !== rule.section
      || current.specialAttacksUsed?.includes(rule.section)) throw new RangeError('Special attack unavailable');
  let fight = copy(current);
  (fight.specialAttacksUsed ??= []).push(rule.section);
  if (!fight.acknowledged.includes(fight.pending.id)) fight.acknowledged.push(fight.pending.id);
  fight.pending = {...fight.pending, id: 'special-' + rule.section, section: rule.section, requiresUnusedMoonAttack: false};
  const result = {section: rule.section, moonPage: copy(draw.page)};
  if (rule.test) {
    const stat = rule.test.stat;
    if (!['strength', 'dexterity'].includes(stat)) throw new RangeError('Invalid combat test');
    const p = fight.player, penalty = p.expert && !p.ignoreWoundPenalty ? (p.vitality >= 4 ? 2 : p.vitality === 3 ? 1 : 0) : 0;
    result.total = p[stat] - penalty + integer(testPage?.base, 1, 6) + integer(testPage?.attack, 1, 6)
      + (rule.test.addRage ? integer(fight.encounter.rage ?? 0) : 0);
    result.success = result.total >= integer(rule.test.threshold, 1);
    result.testPage = copy(testPage);
    const effect = result.success ? rule.onSuccess : rule.onFailure;
    if (effect) fight = applyBlackSunEffect(fight, effect);
  }
  if (rule.extraIncoming) fight.extraIncomingRound = fight.round + Number(!fight.roundStarted);
  fight.lastSpecialAttack = result;
  if (playerDead(fight)) finish(fight);
  return validateBlackSunFight(fight);
}

// A printed change of combat conditions starts a new round track, preserving the same combatant.
export function blackSunTransition(current, encounter) {
  validateBlackSunFight(current);
  if (current.status !== 'paused' || !current.pending.transitionTarget
      || current.pending.transitionTarget !== encounter.section) throw new RangeError('No combat transition pending');
  const damage = current.opponents.reduce((n, enemy) => n + (enemy.track
    ? enemy.trueResistanceDamage ?? 0 : enemy.initialResistance - enemy.resistance), 0);
  const fight = blackSunStart(current.player, encounter);
  if (current.pending.carryResistanceDamage) applyBlackSunDamage(fight, fight.opponents[0], damage);
  for (const key of ['temporaryStrength', 'temporaryDexterity', 'effectUses', 'woundsTaken']) {
    if (current[key] != null) fight[key] = copy(current[key]);
  }
  for (const [before, after] of Object.entries(current.pending.selectionMap?.effects ?? {})) {
    if (fight.effectUses?.[before] != null) fight.effectUses[after] = fight.effectUses[before];
  }
  fight.phaseHistory = [...(current.phaseHistory ?? []), {section: current.encounter.section, rounds: current.round - Number(current.roundStarted),
    log: copy(current.log)}].slice(-20);
  if (fight.status === 'fighting') finish(fight);
  return validateBlackSunFight(fight);
}

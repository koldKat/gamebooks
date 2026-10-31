// Resolve single Fatemaster encounters while retaining every unfinished combat choice.
import {combatant, conscious, damageOpponent, enemyAttack, enemyDefence, integer, playerAttack, playerDefence, rollDice} from './rules.js';
import {applyPlayerDamage, beginAction, enemyTurnTasks, event, outcome, pump, queueEnemyTurn} from './flow.js';
import {applyFatemasterAutomaticHit, applyFatemasterWeaponSwap, disarmQualifies, validateFatemasterAttackEffects} from './attack-effects.js';
import {queueFatemasterFlameRound, settleFatemasterFlameRound, validateFatemasterHazards} from './hazards.js';
import {validateFatemasterSpellConsequences} from './spell-effects.js';

export function startFatemasterFight(player, opponents, rules = {}, options = {}) {
  if (!Array.isArray(opponents) || !opponents.length || opponents.length > 50) throw new Error('Invalid opponents');
  const fight = {
    rulesVersion: 1, player: combatant(player, true),
    opponents: opponents.map((enemy, index) => ({...combatant(enemy), id: `enemy-${index}`, group: String(enemy.group ?? index)})),
    rules: structuredClone(rules), round: 1, status: 'fighting', phase: 'player', pending: null, queue: [], events: [], invisibleTo: []
  };
  validateFatemasterAttackEffects(fight.rules, fight.opponents);
  validateFatemasterSpellConsequences(fight.rules);
  if (options.roofOpen !== undefined) {
    if (typeof options.roofOpen !== 'boolean') throw new Error('Invalid cage roof state');
    fight.rules.roofOpen = options.roofOpen;
  }
  if (!['normal', 'drain', 'miss-bolt', 'flame'].includes(rules.response ?? 'normal')) throw new Error('Invalid enemy response');
  validateFatemasterHazards(fight.rules);
  if (rules.response === 'miss-bolt') integer(rules.counterBoltDice, 'explicit counter-bolt dice', 1, 3);
  if (rules.stopBelow !== undefined) integer(rules.stopBelow, 'opponent threshold', 1);
  if (options.invisible) fight.invisibleTo = fight.opponents.map(enemy => enemy.id);
  if (options.sleeping) {
    if (!rules.sleepingAllowed) throw new Error('No sleeping opponent setup');
    for (const enemy of fight.opponents) enemy.condition = 'dormant';
  }
  if (rules.openingDamage && !options.openingAlreadyApplied) {
    fight.queue.push({kind: 'damage', amount: integer(rules.openingDamage, 'opening damage', 1), source: 'opening'});
  }
  const initiative = options.initiative ?? rules.initiative ?? 'player';
  if (!['player', 'enemy'].includes(initiative)) throw new Error('Invalid initiative');
  if (rules.openingAutomaticHit && !options.openingAlreadyApplied) {
    if (initiative !== 'player') throw new Error('An automatic opening cannot also be a surprise enemy turn');
    fight.queue.push({kind: 'opening-hit'});
  }
  if (initiative === 'enemy') queueEnemyTurn(fight);
  event(fight, 'start');
  return pump(fight);
}

export function attackFatemaster(original, targetId, die) {
  const fight = beginAction(original), enemy = fight.opponents.find(enemy => enemy.id === targetId && conscious(enemy));
  if (!enemy) throw new Error('Choose a conscious opponent');
  if (['asleep', 'helpless'].includes(enemy.condition)) throw new Error('Use the helpless-opponent action');
  const roll = rollDice(2, die), score = roll.total + playerAttack(fight.player) - enemyDefence(enemy);
  fight.rules.unseen = false;
  const swap = disarmQualifies(fight, enemy, roll, score);
  const hit = score >= 7 || swap, immune = fight.rules.requiresSpecialWeapon && fight.player.weaponKind === 'normal';
  const damage = hit && !immune ? fight.player.damage : 0;
  enemy.condition = 'active';
  if (hit) {
    damageOpponent(enemy, damage);
  }
  event(fight, 'player-attack', {enemyId: enemy.id, ...roll, score, hit, damage});
  if (swap) applyFatemasterWeaponSwap(fight, enemy);
  if (hit && fight.rules.weaponBreak) fight.queue.push({kind: 'check', check: 'weapon-break'});
  if (fight.rules.response === 'flame' && (score < 9 || fight.opponents.every(enemy => !conscious(enemy)))) {
    queueFatemasterFlameRound(fight, !hit);
    return pump(fight);
  }
  // Crossing the printed threshold pauses even if one pool was reduced to zero.
  if (outcome(fight) !== 'fighting') return fight;
  if (!hit && fight.rules.response === 'miss-bolt') {
    fight.queue.push({kind: 'hostile-save', dice: fight.rules.counterBoltDice}, {kind: 'round-end'});
  } else if (score < 9 && !swap) {
    queueEnemyTurn(fight);
  }
  return pump(fight);
}

export function resolveFatemasterOpeningHit(original, targetId) {
  const fight = beginAction(original, 'opening-hit');
  const enemy = fight.opponents.find(enemy => enemy.id === targetId && conscious(enemy));
  if (!enemy || ['asleep', 'helpless'].includes(enemy.condition)) throw new Error('Choose an opening attack target');
  fight.pending = null;
  applyFatemasterAutomaticHit(fight, enemy);
  return pump(fight);
}

export function resolveFatemasterFlameRound(original, apply) {
  return settleFatemasterFlameRound(beginAction(original, 'flame-round'), apply);
}

export function resolveFatemasterEnemy(original, die) {
  const fight = beginAction(original, 'enemy'), enemy = fight.opponents.find(enemy => enemy.id === fight.pending.enemyId);
  if (!enemy || !conscious(enemy) || enemy.condition !== 'active') throw new Error('Opponent cannot attack');
  const roll = rollDice(2, die), score = roll.total + enemyAttack(enemy) - playerDefence(fight, enemy), hit = score >= 7;
  fight.pending = null;
  event(fight, 'enemy-attack', {enemyId: enemy.id, ...roll, score, hit});
  if (hit && enemy.damage > 0) fight.queue.unshift({kind: 'damage', source: 'attack', enemyId: enemy.id,
    amount: enemy.damage, ...(fight.rules.poison ? {poison: structuredClone(fight.rules.poison)} : {})});
  return pump(fight);
}

export function assignFatemasterDamage(original, pool) {
  return applyPlayerDamage(beginAction(original, 'damage'), pool);
}

export function resolveFatemasterCheck(original, die) {
  const fight = beginAction(original, 'check'), pending = fight.pending, roll = rollDice(2, die);
  if (pending.check === 'weapon-break') {
    const score = roll.total + (fight.player.weaponKind === 'magic' ? 1 : 0), broken = score < 7;
    event(fight, 'weapon-check', {...roll, score, broken});
    if (broken) {
      fight.player.damage = 1;
      fight.player.weaponKind = 'normal';
      fight.player.weaponAttack = 0;
      fight.player.weaponBroken = true;
    }
  } else if (pending.check === 'poison') {
    if (!['strength', 'agility'].includes(pending.pool)) throw new Error('Invalid poison check');
    const score = fight.player[pending.pool], success = pending.strict ? roll.total < score : roll.total <= score;
    event(fight, 'poison-check', {...roll, pool: pending.pool, score, success});
    if (!success) { fight.status = 'loss'; fight.lossReason = 'poison'; fight.queue = []; fight.phase = 'finished'; }
  } else if (pending.check === 'escape') {
    const escape = fight.chosenEscape ?? fight.rules.escape;
    if (!['strength', 'agility'].includes(escape.pool)) throw new Error('Invalid escape check');
    const success = escape.parity ? (roll.total % 2 === (escape.successEven === false ? 1 : 0)) : roll.total <= fight.player[escape.pool];
    event(fight, 'escape-check', {...roll, success});
    if (escape.mode === 'damage-check' && !success && escape.failureOutcome === 'continue') {
      const damage = integer(escape.failureDamage, 'failed escape damage', 0);
      if (damage) fight.queue.push({kind:'damage', source:'escape', amount:damage});
      fight.queue.push({kind:'round-end'});
    } else if (escape.mode === 'damage-check') queueEscapeCompletion(fight, {...escape,damage:success ? escape.successDamage : escape.failureDamage});
    else if (success) queueEscapeCompletion(fight, escape);
    else if (escape.failureOutcome === 'paused') fight.queue.push({kind:'finish',status:'paused',reason:'failed-escape-check'});
    else queueEnemyTurn(fight);
  } else throw new Error('Unknown combat check');
  fight.pending = null;
  return pump(fight);
}

export function resolveFatemasterHostileSave(original, die) {
  const fight = beginAction(original, 'hostile-save'), pending = fight.pending, roll = rollDice(1, die);
  const score = roll.total + 1, resisted = score <= fight.player.power;
  if (score === fight.player.power) fight.player.power = Math.max(0, fight.player.power - 1);
  event(fight, 'hostile-save', {...roll, score, resisted});
  fight.pending = null;
  if (pending.effect === 'paralysis') {
    if (!resisted) {
      fight.status = 'loss';
      fight.lossReason = 'paralysis';
    } else if (pending.withdraw) fight.status = 'withdrawn';
  } else if (!resisted) fight.queue.unshift({kind: 'hostile-damage', dice: pending.dice});
  return pump(fight);
}

export function resolveFatemasterHostileDamage(original, die) {
  const fight = beginAction(original, 'hostile-damage'), roll = rollDice(fight.pending.dice, die);
  fight.pending = null;
  event(fight, 'hostile-bolt', roll);
  fight.queue.unshift({kind: 'damage', source: 'power-bolt', amount: roll.total, pool: 'strength'});
  return pump(fight);
}

function queueEscapeCompletion(fight, escape) {
  if (escape.damage) fight.queue.push({kind: 'damage', amount: integer(escape.damage, 'escape damage', 1), source: 'escape'});
  fight.queue.push({kind: 'finish', status: escape.mode === 'climb' ? 'paused' : 'withdrawn', reason: escape.mode === 'climb' ? 'reader-check' : null});
}

export function withdrawFatemaster(original, optionKey) {
  const fight = beginAction(original);
  let escape = fight.rules.escape;
  if (optionKey !== undefined) {
    const selected = fight.rules.escapeOptions?.find(option => option.key === optionKey);
    if (!selected) throw new Error('Choose a printed escape option');
    escape = selected;
  }
  if (!escape || !['free', 'blocked', 'check', 'damage-check', 'damage', 'enemy-turns', 'climb', 'reader', 'magic-save'].includes(escape.mode)) throw new Error('No ordinary escape in this encounter');
  fight.chosenEscape = structuredClone(escape);
  event(fight, 'escape-attempt', {mode: escape.mode});
  const invisible = fight.opponents.filter(conscious).every(enemy => fight.invisibleTo.includes(enemy.id));
  const unavailable = (escape.requiresInvisible && !invisible)
    || (escape.requiresInvisibleOrUnseen && !invisible && !fight.rules.unseen);
  if (escape.mode === 'reader') fight.queue.push({kind:'finish',status:'paused',reason:escape.resumable === false ? 'story-consequence' : 'reader-consequence'});
  else if (escape.mode === 'blocked' || unavailable) queueEnemyTurn(fight);
  else if (escape.mode === 'magic-save') fight.queue.push({kind:'hostile-save', effect:'paralysis', withdraw:true});
  else if (['check','damage-check'].includes(escape.mode)) fight.queue.push({kind: 'check', check: 'escape'});
  else {
    if ((escape.mode === 'enemy-turns' || escape.mode === 'climb') && !(escape.skipTurnsWhenInvisible && invisible)) {
      const turns = integer(escape.turns ?? 1, 'escape turns', 1, 10);
      for (let i = 0; i < turns; i++) fight.queue.push(...enemyTurnTasks(fight), {kind: 'round-end'});
    }
    queueEscapeCompletion(fight, escape);
  }
  return pump(fight);
}

export function disengageFatemaster(original) {
  const fight = beginAction(original);
  if (!fight.opponents.filter(conscious).every(enemy => enemy.condition === 'repelled'
      || (fight.rules.ignoreInvisible && fight.invisibleTo.includes(enemy.id)))) throw new Error('Opponents are still fighting');
  fight.status = 'withdrawn';
  event(fight, 'disengaged');
  return pump(fight);
}

export function equipFatemasterWeapon(original, {damage, weaponKind, weaponAttack}) {
  const fight = beginAction(original);
  if (!['normal', 'silver', 'magic'].includes(weaponKind)) throw new Error('Invalid weapon kind');
  fight.player.damage = integer(damage, 'weapon damage', 1);
  fight.player.weaponAttack = integer(weaponAttack, 'weapon attack modifier', -100, 100);
  fight.player.weaponKind = weaponKind;
  fight.player.weaponBroken = false;
  event(fight, 'weapon-equipped', {damage, weaponKind, weaponAttack});
  return fight;
}

export function finishFatemasterHelplessOpponent(original, targetId) {
  const fight = beginAction(original), enemy = fight.opponents.find(enemy => enemy.id === targetId);
  if (!enemy || !conscious(enemy) || !['asleep', 'helpless'].includes(enemy.condition)) throw new Error('Opponent is not helpless');
  enemy.strength = 0;
  enemy.condition = 'unconscious';
  event(fight, 'helpless-opponent-defeated', {enemyId:enemy.id});
  queueEnemyTurn(fight);
  return pump(fight);
}

export function cancelFatemasterFight(original) {
  if (!original || !['fighting', 'paused'].includes(original.status)) throw new Error('No unfinished encounter');
  const fight = structuredClone(original);
  fight.status = 'cancelled';
  event(fight, 'cancelled');
  return pump(fight);
}

export function resumeFatemasterFight(original) {
  if (original?.status !== 'paused' || !['reader-consequence','reader-check','failed-escape-check'].includes(original.pauseReason)) throw new Error('This encounter cannot resume');
  const fight = structuredClone(original);
  fight.status = 'fighting';
  fight.pauseReason = null;
  event(fight, 'resumed');
  return pump(fight);
}

// Resolve Fatemaster combat spells, paid interruptions and saved magical-defence choices.
import {conscious, damageOpponent, integer, participating, rollDice} from './rules.js';
import {beginAction, enemyTurnTasks, event, pump} from './flow.js';

const COSTS = Object.freeze({healing:1,light:1,invisibility:2,footsteps:1,bolt:1,slumber:2,repel:2});

function nextPending(fight, pending) {
  fight.pending = pending;
  fight.phase = 'pending';
  return fight;
}

export function castFatemaster(original, spell, options = {}) {
  const fight = beginAction(original);
  if (!Object.hasOwn(COSTS, spell)) throw new Error('Unknown combat spell');
  const power = spell === 'bolt' ? integer(options.power, 'Power Bolt cost', 1, 3) : COSTS[spell];
  const source = options.source ?? 'power';
  if (!['power', 'scroll'].includes(source)) throw new Error('Invalid spell resource');
  if (source === 'scroll') {
    if (!['healing', 'invisibility'].includes(spell) || fight.player.scrolls?.[spell] !== 1) throw new Error('No unused scroll spell');
    fight.player.scrolls[spell] = 0;
  } else if (!fight.player.renewPower) {
    if (fight.player.power < power) throw new Error('Insufficient Power');
    fight.player.power -= power;
  }
  const target = fight.opponents.find(enemy => enemy.id === options.targetId && conscious(enemy));
  if (spell === 'bolt' && !target) throw new Error('Choose one Power Bolt target');
  if (spell === 'healing' && !['strength', 'agility'].includes(options.pool)) throw new Error('Choose the Healing pool');
  if (spell === 'footsteps' && options.action === 'hit'
      && (!fight.rules.footstepsAutomaticHit || !target)) throw new Error('No automatic Footsteps hit');
  if (spell === 'footsteps' && !['escape', 'hit'].includes(options.action)) throw new Error('Choose the Footsteps action');
  fight.casting = {spell, power, source, targetId: target?.id, pool: options.pool, action: options.action,
    interrupted:false, effects:[], fooled:[],
    alreadyUnseen:Boolean(fight.rules.unseen),
    alreadyInvisible:fight.opponents.filter(participating).every(enemy => fight.invisibleTo.includes(enemy.id))};
  fight.rules.unseen = false;
  event(fight, 'spell-start', {spell, power, source, paid:source === 'power' && !fight.player.renewPower ? power : 0});
  if (fight.rules.castDamage) {
    fight.queue.push({kind:'damage', source:'failed-cast', amount:integer(fight.rules.castDamage, 'casting damage', 1)});
  } else if (fight.rules.castingBoltDice) {
    fight.queue.push({kind:'hostile-save', dice:integer(fight.rules.castingBoltDice, 'casting counter-bolt dice', 1, 3)});
  } else fight.queue.push(...enemyTurnTasks(fight));
  fight.queue.push({kind:'spell-resolve'}, {kind:'round-end'});
  return pump(fight);
}

function finishEffects(fight) {
  const casting = fight.casting;
  if (casting.spell === 'footsteps' && !casting.failed) {
    const fooled = fight.opponents.filter(participating).every(enemy => casting.fooled.includes(enemy.id));
    if (fooled && casting.action === 'escape') {
      fight.status = 'withdrawn';
      event(fight, 'footsteps-escape');
    } else if (fooled && casting.action === 'hit') {
      const enemy = fight.opponents.find(enemy => enemy.id === casting.targetId);
      const damage = fight.rules.requiresSpecialWeapon && fight.player.weaponKind === 'normal' ? 0 : fight.player.damage;
      damageOpponent(enemy, damage);
      event(fight, 'footsteps-hit', {enemyId:enemy.id, damage});
    }
  }
  if (fight.rules.survivingCastAttackBonus) {
    const bonus = integer(fight.rules.survivingCastAttackBonus, 'casting frenzy bonus', 1, 10);
    for (const enemy of fight.opponents.filter(conscious)) enemy.attackBase += bonus;
    event(fight, 'casting-frenzy', {bonus});
  }
  const awakened = fight.opponents.filter(enemy => conscious(enemy) && enemy.condition === 'dormant');
  for (const enemy of awakened) enemy.condition = 'active';
  if (awakened.length) {
    fight.queue.unshift(...awakened.slice(0,2).map(enemy => ({kind:'enemy',enemyId:enemy.id})));
    event(fight, 'opponents-awakened', {enemyIds:awakened.map(enemy => enemy.id)});
  }
  event(fight, 'spell-finish', {spell:casting.spell});
  fight.casting = null;
  fight.pending = null;
  return pump(fight);
}

function advanceEffects(fight) {
  const effect = fight.casting.effects.shift();
  return effect ? nextPending(fight, {kind:'spell-save', effect}) : finishEffects(fight);
}

export function resolveFatemasterSpell(original) {
  const fight = beginAction(original, 'spell-resolve'), casting = fight.casting, spell = casting.spell;
  fight.pending = null;
  const blocked = fight.rules.noMagic || fight.rules.castingFails || fight.rules.failedSpells?.includes(spell)
    || (spell === 'footsteps' && fight.rules.footstepsRequiresInvisible && !casting.alreadyInvisible
      && !(fight.rules.footstepsWhenUnseen && casting.alreadyUnseen));
  if (casting.interrupted || blocked) {
    casting.failed = true;
    event(fight, 'spell-failed', {spell, interrupted:casting.interrupted});
    return finishEffects(fight);
  }
  if (spell === 'healing') {
    const max = casting.pool === 'strength' ? fight.player.maxStrength : fight.player.maxAgility;
    const before = fight.player[casting.pool];
    fight.player[casting.pool] = Math.min(max, before + 6);
    event(fight, 'healing', {pool:casting.pool, amount:fight.player[casting.pool] - before});
    return finishEffects(fight);
  }
  if (fight.rules.disablingSpells?.includes(spell)) {
    for (const enemy of fight.opponents.filter(conscious)) enemy.condition = 'helpless';
    event(fight, 'opponents-helpless', {spell});
    return finishEffects(fight);
  }
  if (spell === 'light') {
    event(fight, 'spell-no-combat-effect', {spell});
    return finishEffects(fight);
  }
  if (['bolt', 'slumber', 'repel'].includes(spell)) {
    return nextPending(fight, {kind:'spell-dice', dice:spell === 'bolt' ? casting.power : 3});
  }
  casting.effects = fight.opponents.filter(participating).map(enemy => ({spell, enemyId:enemy.id}));
  return advanceEffects(fight);
}

export function resolveFatemasterSpellDice(original, die) {
  const fight = beginAction(original, 'spell-dice'), casting = fight.casting;
  const roll = rollDice(fight.pending.dice, die), multiplier = integer(fight.rules.attackMagicMultiplier ?? 1, 'attack spell multiplier', 1, 10);
  event(fight, 'spell-dice', {spell:casting.spell, ...roll, multiplier});
  if (casting.spell === 'bolt') {
    casting.effects = [{spell:'bolt', enemyId:casting.targetId, amount:roll.total * multiplier}];
    return advanceEffects(fight);
  }
  const eligible = fight.opponents.filter(enemy => participating(enemy) && (casting.spell !== 'repel' || enemy.undead)).map(enemy => enemy.id);
  if (!eligible.length) return finishEffects(fight);
  return nextPending(fight, {kind:'spell-allocation', budget:roll.total * multiplier, eligible});
}

export function allocateFatemasterSpell(original, targetIds) {
  const fight = beginAction(original, 'spell-allocation'), pending = fight.pending;
  if (!Array.isArray(targetIds) || new Set(targetIds).size !== targetIds.length
      || targetIds.some(id => !pending.eligible.includes(id))) throw new Error('Invalid spell allocation');
  const total = targetIds.reduce((sum,id) => sum + fight.opponents.find(enemy => enemy.id === id).agility, 0);
  if (total > pending.budget) throw new Error('Insufficient spell points for all selected opponents');
  // Partial suppression never reduces an opponent's actual Agility.
  event(fight, 'spell-allocation', {spell:fight.casting.spell, budget:pending.budget, used:total, targetIds:[...targetIds]});
  fight.casting.effects = targetIds.map(enemyId => ({spell:fight.casting.spell, enemyId}));
  return advanceEffects(fight);
}

export function resolveFatemasterSpellSave(original, die) {
  const fight = beginAction(original, 'spell-save'), effect = fight.pending.effect;
  const enemy = fight.opponents.find(enemy => enemy.id === effect.enemyId), roll = rollDice(1, die), score = roll.total + 1;
  const resisted = score <= enemy.power;
  if (score === enemy.power) enemy.power = Math.max(0, enemy.power - 1);
  event(fight, 'opponent-spell-save', {enemyId:enemy.id, spell:effect.spell, ...roll, score, resisted});
  if (!resisted) {
    if (effect.spell === 'bolt') damageOpponent(enemy, effect.amount, 'strength');
    else if (effect.spell === 'slumber') enemy.condition = 'asleep';
    else if (effect.spell === 'repel') enemy.condition = 'repelled';
    else if (effect.spell === 'invisibility') {
      if (!fight.invisibleTo.includes(enemy.id)) fight.invisibleTo.push(enemy.id);
    } else if (effect.spell === 'footsteps') fight.casting.fooled.push(enemy.id);
    event(fight, 'spell-effect', {enemyId:enemy.id, ...effect});
  }
  return advanceEffects(fight);
}

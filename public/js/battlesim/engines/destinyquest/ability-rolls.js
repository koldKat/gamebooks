import { damageDestinyHero, destinyStat, destinyStrike, addDestinyStatEffect, isDestinyOpponentActive,healDestinyHero,applyDestinyAcceptedHeroRoll } from './effects.js';
import {destinyHeroRecipient,healDestinyRecipient} from './allies.js';
import { destinyDie, prepareDestinyDamage, applyDestinyDamage } from './damage.js';
import {prepareDestinyCancellation} from './damage-cancellation.js';
import { settleDestinyFight,resolveDestinyDamage } from './core.js';
import { resolveDestinyEncounterEvent, resumeDestinyEncounterQueue } from './encounter-events.js';
import { applyDestinyAbilityInterception,useDestinyAbility } from './abilities.js';
import {resolveDestinyAbilityCheck} from './ability-checks.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import {resolveDestinyStanceDefense} from './sustained.js';
import {resolveDestinyAutomaticModifier} from './automatic-modifiers.js';

export function prepareDestinyAbilityRoll(fight, name, options, roll) {
  const target = options.target ?? fight.target;
  if (!Number.isInteger(target) || !isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living opponent');
  const count = name === 'take-the-bait' ? 3 : 1;
  fight.turn.pendingAbility = { type: 'test', name, target, options: structuredClone(options),
    dice: Array.from({ length: count }, () => destinyDie(roll)) };
  fight.phase = 'ability-rolled';
}

export function finishDestinyAbilityAction(fight, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (['speed-rolled', 'damage', 'damage-rolled'].includes(fight.phase) && !isDestinyOpponentActive(fight, fight.target)) fight.phase = 'end';
  if (destinyDeathMovesEnabled(fight) && fight.phase === 'end' && !fight.turn.pendingPassiveDeath && !fight.turn.used.dm &&
      fight.turn.deaths.length > fight.turn.deathMoveDeathsSeen) {
    fight.phase = 'death-move';
    fight.turn.afterDeathMove = 'end';
  }
  settleDestinyFight(fight, roll);
  resumeDestinyEncounterQueue(fight, roll);
  return fight;
}

export function resolveDestinyAbilityRoll(fight, roll = () => Math.floor(Math.random() * 6) + 1, { roster, targets, target } = {}) {
  if (fight?.status !== 'active' || fight.phase !== 'ability-rolled' || !fight.turn.pendingAbility) throw new RangeError('No pending ability roll');
  const next = structuredClone(fight);
  const pending = next.turn.pendingAbility;
  delete next.turn.pendingAbility;
  if(pending.type==='automatic-modifier')return finishDestinyAbilityAction(resolveDestinyAutomaticModifier(next,pending,roll),roll);
  if(pending.type==='ability-check')return finishDestinyAbilityAction(resolveDestinyAbilityCheck(next,pending,roll,useDestinyAbility),roll);
  if(pending.type==='stance-defense')return finishDestinyAbilityAction(resolveDestinyStanceDefense(next,pending,roll),roll);
  if(pending.type==='mirage-defense') {
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    const avoided=pending.dice[0]===6;
    if(avoided)next.turn.avoidDamage=true;
    next.phase=pending.returnPhase;
    next.history.push({type:'mirage-defense',round:next.round,recipient:pending.recipient,dice:[...pending.dice],avoided});
    if(next.hero.health<=0||next.encounter?.forcedLoss||next.encounter?.forcedVictory) {settleDestinyFight(next,roll,pending.returnPhase);return next;}
    return resolveDestinyDamage(next,roll);
  }
  if(pending.type==='hero-revival') {
    const chosen=target??pending.target;
    if(!Number.isInteger(chosen)||!isDestinyOpponentActive(next,chosen))throw new RangeError('Choose a living opponent');
    applyDestinyDamage(next,{name:pending.name,spec:{category:'pa',passive:true,passiveAttack:true,damageKind:'passive'},options:{},
      groups:[{targets:[chosen],dice:pending.dice,bonuses:pending.bonuses||{}}],selfDamage:[]});
    next.hero.health=Math.min(next.hero.maxHealth,pending.health);
    next.phase=pending.returnPhase;
    if(pending.suspendedAbility) next.turn.pendingAbility=pending.suspendedAbility;
    next.history.push({type:'revival',source:pending.name,round:next.round,health:next.hero.health});
    return finishDestinyAbilityAction(next,roll);
  }
  if(pending.type==='magic-payment') {
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    next.phase=pending.returnPhase;
    if(pending.suspendedAbility) next.turn.pendingAbility=pending.suspendedAbility;
    if(next.hero.health<=0||next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    next.turn.passedMagicPayment={name:pending.ability,free:pending.dice[0]>=pending.minimum};
    next.history.push({type:'ability-roll',name:pending.name,round:next.round,dice:[...pending.dice],free:next.turn.passedMagicPayment.free});
    return useDestinyAbility(next,pending.ability,pending.abilityOptions,roll);
  }
  if(pending.type==='allocated-damage') {
    const assigned=targets??pending.options.targets;
    if(!Array.isArray(assigned)||assigned.length!==pending.dice.length||assigned.some(target=>!Number.isInteger(target)||!isDestinyOpponentActive(next,target)))
      throw new RangeError('Assign each damage die to a living opponent');
    const groups=[];
    for(let i=0;i<assigned.length;i++) {
      let group=groups.find(group=>group.targets[0]===assigned[i]);
      if(!group) {group={targets:[assigned[i]],dice:[],bonuses:{}};groups.push(group);}
      group.bonuses[group.dice.length]=pending.bonuses?.[i]||0;group.dice.push(pending.dice[i]);
    }
    for(const group of groups) for(const target of group.targets) prepareDestinyCancellation(next,target,group,roll);
    applyDestinyDamage(next,{...pending,type:'damage',groups,selfDamage:[]});
    next.phase=pending.spec.replacement?'end':pending.returnPhase;
    return finishDestinyAbilityAction(next,roll);
  }
  if(pending.type==='target-table') {
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    if(next.hero.health<=0||next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    const groups=[];
    for(let i=0;i<pending.targets.length;i++) {
      const target=pending.targets[i],outcome=pending.spec.rollTargetTable.find(row=>pending.dice[i]<=row.maximum);
      if(!outcome) throw new RangeError('Unknown target roll outcome');
      if(!outcome.dice||!isDestinyOpponentActive(next,target)) continue;
      next.phase=pending.returnPhase;
      prepareDestinyDamage(next,pending.name,{category:pending.spec.category,hit:'one',dice:outcome.dice},
        {...pending.options,target,deferDamage:true},roll);
      groups.push(...next.turn.pendingAbility.groups);
    }
    next.history.push({type:'ability-roll',name:pending.name,round:next.round,dice:[...pending.dice],targets:[...pending.targets]});
    if(groups.length) {
      next.turn.pendingAbility={type:'damage',name:pending.name,spec:{category:pending.spec.category,replacement:pending.spec.replacement},
        options:pending.options,groups,selfDamage:[],returnPhase:pending.returnPhase};
      next.phase='ability-rolled';
    } else {delete next.turn.pendingAbility;next.phase=pending.spec.replacement?'end':pending.returnPhase;}
    return finishDestinyAbilityAction(next,roll);
  }
  if(pending.type==='face-effects') {
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    if(next.hero.health<=0||next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    for(const face of pending.dice) {
      const outcome=pending.outcomes[face];
      if(!outcome) throw new RangeError('Unknown die outcome');
      for(const change of outcome.stats||[]) addDestinyStatEffect(next,'hero',change.attribute,change.amount,change.duration,pending.name);
      if(outcome.healthCost) next.hero.health=Math.max(0,next.hero.health-outcome.healthCost);
      if(outcome.heal) healDestinyHero(next,outcome.heal);
    }
    next.history.push({type:'ability-roll',name:pending.name,round:next.round,dice:[...pending.dice]});
    next.phase=pending.returnPhase;
    return finishDestinyAbilityAction(next,roll);
  }
  if(pending.type==='catalog-table'){
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    if(next.hero.health<=0||next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    const result=Math.min(pending.spec.rollTable.maximum,pending.dice.reduce((sum,face)=>sum+face,0)+(pending.resultBonus||0));
    const outcome=pending.spec.rollTable.outcomes.find(outcome=>result<=outcome.maximum);
    if(!outcome)throw new RangeError('Unknown ability outcome');
    next.history.push({type:'ability-roll',name:pending.name,round:next.round,dice:[...pending.dice],result});
    if(outcome.heal)healDestinyHero(next,outcome.heal);
    if(outcome.allyHeal){
      const ally=pending.options.ally??next.allies?.findIndex(ally=>ally.hero.health>0);
      if(ally!==undefined&&ally>=0)healDestinyRecipient(next,destinyHeroRecipient(next,{ally}),outcome.allyHeal);
    }
    next.phase=pending.returnPhase;
    prepareDestinyDamage(next,pending.name,{category:pending.spec.category,replacement:pending.spec.replacement,hit:'one',dice:outcome.dice,selfDamageDice:outcome.selfDamageDice}, {...pending.options,target:pending.target},roll);
    if(next.phase!=='ability-rolled'&&pending.spec.replacement)next.phase='end';
    return finishDestinyAbilityAction(next,roll);
  }
  if (pending.type === 'ability-interception') return applyDestinyAbilityInterception(next, pending, roll);
  if (pending.type === 'encounter') {
    resolveDestinyEncounterEvent(next, pending, roll, { roster });
    if (pending.suspendedAbility && next.hero.health > 0) {
      next.turn.pendingAbility = pending.suspendedAbility;
      next.phase = pending.returnPhase;
    }
  }
  else if (pending.type === 'resource') {
    applyDestinyAcceptedHeroRoll(next,pending.dice,'ability');
    if(next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    const before = next.encounter.resources[pending.resource];
    next.encounter.resources[pending.resource] = Math.max(0, before - pending.dice.reduce((sum, value) => sum + value, 0));
    if (before > 0 && next.encounter.resources[pending.resource] === 0) {
      for (const change of pending.onZeroStats) for (const [attribute, amount] of Object.entries(change.changes)) {
        addDestinyStatEffect(next, change.target, attribute, amount, null, pending.name);
      }
    }
    next.phase = pending.returnPhase;
  } else if (pending.type === 'damage') {
    if(pending.spec.selectTarget&&target!==undefined) {
      if(!Number.isInteger(target)||!isDestinyOpponentActive(next,target))throw new RangeError('Choose a living opponent');
      for(const group of pending.groups)group.targets=[target];
    }
    for(const group of pending.groups)for(const target of group.targets)prepareDestinyCancellation(next,target,group,roll);
    applyDestinyDamage(next, pending);
    next.phase = pending.spec.replacement ? 'end' : pending.returnPhase;
    if (pending.spec.category === 'dm') next.phase = next.turn.afterDeathMove;
  } else {
    const { name, target, dice, options } = pending;
    applyDestinyAcceptedHeroRoll(next,dice,'ability');
    if(next.encounter?.forcedLoss||next.encounter?.forcedVictory)return finishDestinyAbilityAction(next,roll);
    const result = dice.reduce((total, value) => total + value, 0);
    next.phase = 'end';
    next.history.push({ type: 'ability-roll', name, round: next.round, dice: [...dice], result });
    if (name === 'take-the-bait') {
      const total = result + (next.equipment?.leftHand?.speed || 0);
      if (total >= destinyStat(next, target, 'speed')) {
        destinyStrike(next, target, total, name);
        next.turn.combatAbilityDamage = true;
        addDestinyStatEffect(next, target, 'speed', -2, 1, name, 1);
        next.takeBaitSucceededRound = next.round;
      }
    } else if (name === 'warg-strike') {
      prepareDestinyDamage(next, name, { category: 'co', replacement: true, hit: 'one', dice: result <= 2 ? 2 : 3,
        ongoing: result >= 5 ? 1 : 0 }, { ...options, target }, roll);
    } else if (name === 'chaotic-catalyst') {
      if (result <= 2) next.opponents[target].health = Math.min(next.opponents[target].maxHealth, next.opponents[target].health + 6);
      else if (result <= 4) next.effects.push({ kind: 'ongoing-damage', target, amount: 2,
        from: next.round, until: Number.MAX_SAFE_INTEGER, source: name });
      else {
        const groups = [];
        for (const index of [target - 1, target, target + 1]) {
          if (!isDestinyOpponentActive(next, index)) continue;
          groups.push({ targets: [index], dice: Array.from({ length: index === target ? 4 : 1 }, () => destinyDie(roll)), bonuses: {} });
        }
        const damage = { type: 'damage', name, spec: { category: 'co', replacement: true }, options, groups, returnPhase: 'end' };
        if (options.deferDamage) { next.turn.pendingAbility = damage; next.phase = 'ability-rolled'; }
        else applyDestinyDamage(next, damage);
      }
    } else if (name === 'head-blow') {
      if (result <= 2) next.turn.used.sp = true;
      else {
        next.turn.passedSpeedAbility = options.ability;
        next.turn.passedSpeedOptions = options.abilityOptions;
      }
      next.phase = pending.returnPhase;
    } else if (name === 'gambit') {
      if (result === 6) {
        next.turn.pendingAbility = { ...pending, type: 'choice', name: 'gambit-restore' };
        next.phase = 'ability-choice';
      } else if (pending.suspendedAbility) {
        next.turn.pendingAbility = pending.suspendedAbility;
        next.phase = 'ability-rolled';
      } else next.phase = pending.returnPhase;
    } else if (name === 'crystal-armour') {
      if (result <= 4) {
        next.crystalArmour = false;
        next.effects = next.effects.filter(effect => effect.source !== 'crystal-armour');
        if (result <= 2) damageDestinyHero(next,4);
      }
      next.phase = pending.returnPhase;
    } else if (name === 'pick-n-mix') {
      if (next.hero.health > 0) next.hero.health = Math.min(next.hero.maxHealth, next.hero.health + Math.ceil(result / 2) * 2);
      next.phase = pending.returnPhase;
    } else throw new RangeError('Unknown ability roll');
  }
  return finishDestinyAbilityAction(next, roll);
}

import { createDestinyOpponent } from './core.js';
import { spawnDestinyOpponents, applyDestinyOpponentForm } from './round-events.js';
import { destinyDie } from './damage.js';
import { destinyEncounterEventSettings } from './encounter-settings.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import { damageDestinyHero, destinyStat, addDestinyStatEffect, observeDestinyHealth, hasDestinyAbility, destinyStrike, isDestinyOpponentActive, isDestinyOpponentDead, recordDestinyDefeat, destinyAttackerTarget, destinyImmuneToAbility, destinyOpponentDamageTotal } from './effects.js';

export function queueDestinyEncounterEvent(fight, event, returnPhase, roll) {
  if(destinyImmuneToAbility(fight,event.ability))return;
  const suspended = ['ability-rolled', 'ability-choice'].includes(fight.phase) ? fight.turn.pendingAbility : null;
  if (suspended && !event.interruptsPending) {
    (fight.turn.afterAbilityEvents ??= []).push({ event: structuredClone(event), returnPhase });
    return;
  }
  if (['ability-sacrifice', 'defeat-choice', 'damage-choice'].includes(event.kind)) {
    fight.turn.pendingAbility = { type: event.kind, name: event.name, event: structuredClone(event), returnPhase };
    fight.phase = 'ability-choice';
    return;
  }
  const boosted = event.boostFromPreviousStep && fight.encounter?.[event.boostFromPreviousStep] === fight.encounter?.hazardStep - 1;
  fight.turn.pendingAbility = { type: 'encounter', name: event.name, event: structuredClone(event), returnPhase,
    dice: Array.from({ length: boosted ? event.boostDice : event.dice ?? 1 }, () => destinyDie(roll)), bonuses: {}, options: {} };
  if (suspended) fight.turn.pendingAbility.suspendedAbility = structuredClone(suspended);
  fight.phase = 'ability-rolled';
}

export function resumeDestinyEncounterQueue(fight, roll) {
  if (fight.status !== 'active' || ['ability-rolled', 'ability-choice'].includes(fight.phase)) return;
  const queued = fight.turn.afterAbilityEvents?.shift();
  if (queued) queueDestinyEncounterEvent(fight, queued.event, queued.returnPhase, roll);
}

function heroDamage(fight, amount, enemyDice = false, attacker = destinyAttackerTarget(fight)) {
  const lost = damageDestinyHero(fight,amount);
  if (enemyDice && lost && hasDestinyAbility(fight, 'lightning') && isDestinyOpponentActive(fight, attacker)) {
    destinyStrike(fight, attacker, 2, 'lightning', 'passive');
  }
}

export function resolveDestinyEncounterEvent(fight, pending, roll, { roster } = {}) {
  const { event, dice } = pending;
  const total = event.owner==='opponent'&&event.damageDice ? destinyOpponentDamageTotal(fight,dice,pending.bonuses) : dice.reduce((sum, value, index) => sum + value + (pending.bonuses?.[index] || 0), 0);
  fight.phase = pending.returnPhase;
  fight.history.push({ type: 'encounter-roll', name: pending.name, round: fight.round, dice: [...dice], total });
  const stageDamage = amount => {
    if (event.atEnd) (fight.turn.encounterEndEffects ??= []).push({ target: 'hero', amount, ignoreArmour: true, source: event.name });
    else heroDamage(fight, amount);
  };
  let eventSettings;
  const settings = () => eventSettings ??= destinyEncounterEventSettings(fight, roster, event.kind);
  switch (event.kind) {
    case 'opponent-form': {
      const form=fight.encounter.roundForms.profiles.find(profile=>profile.faces.includes(total));
      if(!form)throw new RangeError('Missing opponent form for this roll');
      applyDestinyOpponentForm(fight,form);
      break;
    }
    case 'absorb-stat':
      if(total>=event.minimum)addDestinyStatEffect(fight,event.target,event.attribute,-event.amount,null,event.name);
      if(destinyStat(fight,event.target,event.attribute)===0)fight.encounter.forcedVictory=true;
      fight.turn.normalDamageReplaced=true;fight.phase='end';
      break;
    case 'skip-attack-if-low':
      if(total<=event.limit){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'damage-if-roll-above-stat':
      if(total>destinyStat(fight,'hero',event.attribute))stageDamage(Math.max(0,event.amount-(event.armourDivisor?Math.ceil((fight.hero.armour===null?0:destinyStat(fight,'hero','armour'))/event.armourDivisor):0)));
      break;
    case 'change-end-target':
      if(event.faces.includes(total)){
        const effect=fight.encounter.endEffects.find(effect=>effect.source===event.effectSource);
        if(!effect)throw new RangeError('Missing controlled effect');
        effect.target=event.target;fight.encounter[event.flag]=true;
      }
      break;
    case 'damage-if-high':
      if(total>event.limit)stageDamage(event.amount);
      break;
    case 'victory-after-faces':
      if (event.faces.includes(total)) {
        fight.encounter.victorySuccesses = (fight.encounter.victorySuccesses || 0) + 1;
        if (fight.encounter.victorySuccesses >= event.required) fight.encounter.forcedVictory = true;
      }
      break;
    case 'attack-variation': {
      const outcome=event.outcomes.find(item=>item.faces.includes(total));
      if(!outcome)throw new RangeError('No attack variation for this roll');
      for(const change of outcome.stats||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
      if(outcome.extraDamageDice)fight.turn.extraDamageDice=(fight.turn.extraDamageDice||0)+outcome.extraDamageDice;
      if(outcome.skipAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    }
    case 'next-round-speed-dice':
      if(event.faces.includes(total))fight.nextHeroSpeedDice={round:fight.round+1,count:event.count};
      break;
    case 'opponent-dodge':
      if(event.limit===undefined||total<=event.limit){fight.turn.opponentDodged=event.name;fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'opponent-ability':
      if(event.limit===undefined||total<=event.limit){
        if(event.ignoreArmour){fight.turn.ignoreArmour=true;fight.turn.opponentArmourAbility=event.ability;}
        if(event.heroSpeedCount)fight.turn.heroSpeedCount=event.heroSpeedCount;
      }
      break;
    case 'loss-if-low':
      if(total<=event.limit)fight.encounter.forcedLoss=true;
      break;
    case 'schedule-end-effect':
      (fight.encounter.scheduledEndEffects ??= []).push({ ...structuredClone(event.effect), round: total + event.delay });
      break;
    case 'spawn':
      if (event.source === undefined || isDestinyOpponentActive(fight, event.source)) {
        spawnDestinyOpponents(fight, { ...event, count: total <= event.limit ? event.lowCount : event.highCount }, fight.round, createDestinyOpponent);
      }
      break;
    case 'revival': {
      if (isDestinyOpponentDead(fight, event.target) && total >= event.minimum) {
        fight.opponents[event.target].health = event.health;
        fight.turn.deaths = fight.turn.deaths.filter(target => target !== event.target);
        if (!fight.turn.deaths.length) fight.turn.pendingPassiveDeath = false;
        if (fight.phase === 'death-move' && fight.turn.deaths.length <= fight.turn.deathMoveDeathsSeen) fight.phase = fight.turn.afterDeathMove;
        fight.history.push({ type: 'revival', round: fight.round, target: event.target, health: event.health });
      } else recordDestinyDefeat(fight, event.target);
      if (destinyDeathMovesEnabled(fight) && ['start', 'encounter-start'].includes(fight.phase) && fight.turn.deaths.length > fight.turn.deathMoveDeathsSeen && !fight.turn.used.dm) {
        fight.turn.afterDeathMove = fight.phase;
        fight.phase = 'death-move';
      }
      break;
    }
    case 'damage-if-low': {
      const limit = event.limit === 'round' ? Math.min(6, fight.round) : event.limit;
      const score = total + (event.attribute ? destinyStat(fight, 'hero', event.attribute) : 0);
      if (score <= limit) {
        stageDamage(event.amount);
        for (const change of event.changes || []) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      }
      break;
    }
    case 'faces-damage':
      stageDamage(dice.filter(value => event.faces.includes(value)).reduce((sum, value) => sum + value, 0));
      break;
    case 'transport-damage': {
      const rule = settings();
      stageDamage(total);
      const transport = fight.equipment?.transport;
      if (!transport) throw new RangeError('Choose the transport used in this encounter');
      for (const [attribute, amount] of Object.entries(rule.wear)) transport[attribute] = Math.max(0, transport[attribute] - amount);
      for (const effect of fight.effects) if (effect.source === 'armour-plating') effect.amount = Math.floor(transport.toughness / 2);
      break;
    }
    case 'stat-if-low':
      if (total <= event.limit) {
        if (event.attribute) addDestinyStatEffect(fight, 'hero', event.attribute, event.amount, settings().duration, event.name, event.delay || 0);
        for (const change of event.changes || []) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      }
      break;
    case 'spirit-link': {
      const rule = settings();
      if (total <= rule.limit) {
        stageDamage(rule.damage);
        (fight.turn.encounterEndOpponentHealing ??= []).push({ ...rule.healing });
      }
      break;
    }
    case 'distracted': if (total <= settings().limit) fight.phase = 'end'; break;
    case 'weak-venom': {
      const rule = settings();
      if (total === rule.face) (fight.encounter.heroStatuses ??= {})[rule.status] = rule.amount;
      break;
    }
    case 'yield':
      if (total >= settings().minimum) fight.encounter.forcedVictory = true;
      break;
    case 'roc-attack': {
      const rule = settings();
      if (total <= rule.limit) {
        heroDamage(fight, rule.damage);
        for (const change of rule.changes) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
        fight.phase = 'end';
      }
      break;
    }
    case 'sable-attack': {
      const rule = settings();
      if (total <= rule.healingLimit) {
        const opponent = fight.opponents[fight.target];
        opponent.health = Math.min(opponent.maxHealth, opponent.health + rule.healing);
        fight.phase = 'end';
      } else if (total >= rule.curseMinimum) {
        const from = fight.round + rule.blockDelay;
        fight.encounter.blockedRounds = { from, until: from + rule.blockDuration - 1, categories: [...rule.blockedCategories] };
        queueDestinyEncounterEvent(fight, rule.curse, 'end', roll);
      }
      break;
    }
    case 'enemy-dice-damage':
      heroDamage(fight, total, true, event.attacker ?? destinyAttackerTarget(fight));
      if (event.markStep) fight.encounter[event.markStep] = fight.encounter.hazardStep;
      if (event.nextStepStats) (fight.encounter.nextStepStats ??= []).push(...structuredClone(event.nextStepStats));
      if (fight.hero.health > 0 && event.followUp) queueDestinyEncounterEvent(fight, event.followUp, pending.returnPhase, roll);
      break;
    case 'sequence-challenge':
      fight.encounter.sequenceRemaining--;
      if (total + destinyStat(fight, 'hero', event.attribute) + (event.attributeModifier || 0) < event.minimum) {
        queueDestinyEncounterEvent(fight, event.onFailure, pending.returnPhase, roll);
      }
      break;
    case 'actor-strike': {
      const outcome = event.outcomes.find(item => item.faces.includes(total));
      if (!outcome) throw new RangeError('No encounter outcome for this roll');
      if (isDestinyOpponentActive(fight, outcome.target)) {
        queueDestinyEncounterEvent(fight, { ...outcome.event, attacker: outcome.target }, pending.returnPhase, roll);
      }
      break;
    }
    case 'armour-corrosion': {
      const current = destinyStat(fight, 'hero', event.attribute);
      if (current > 0) addDestinyStatEffect(fight, 'hero', event.attribute, -Math.min(current, event.amount), null, event.name);
      else queueDestinyEncounterEvent(fight, { ...event.overflow, attacker: event.attacker }, pending.returnPhase, roll);
      break;
    }
    case 'restart-sequence':
      if (total <= event.limit) fight.encounter.sequenceRemaining = event.count;
      break;
    case 'sasquatch-attack':
      if (total >= settings().minimum) queueDestinyEncounterEvent(fight, settings().followUp, 'end', roll);
      break;
    case 'sasquatch-challenge':
      if (total + destinyStat(fight, 'hero', settings().attribute) <= settings().limit) queueDestinyEncounterEvent(fight,
        settings().followUp, 'end', roll);
      break;
    case 'splinters':
      if (!event.avoided) heroDamage(fight, dice.filter(face => face <= settings().faceMaximum).length * settings().damagePerFace);
      break;
    case 'ice-prison': {
      const rule = settings();
      if (!fight.encounter.skollFreed && total === rule.face) {
        fight.encounter.prisonSixes = (fight.encounter.prisonSixes || 0) + 1;
        if (fight.encounter.prisonSixes === rule.requiredSuccesses) {
          fight.encounter.skollFreed = true;
          fight.turn.encounterEndHealing = rule.healing;
          fight.encounter.heroScoreBonus = (fight.encounter.heroScoreBonus || 0) + rule.scoreBonus;
        }
      }
      break;
    }
    case 'birdman-attack': if (total <= settings().limit) fight.phase = 'end'; break;
    case 'remove-acorn': {
      const rule = settings();
      if (total >= rule.minimum) {
        fight.encounter.acornsRemoved = (fight.encounter.acornsRemoved || 0) + 1;
        for (const change of rule.changes) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      } else heroDamage(fight, rule.failureDamage);
      break;
    }
    default: throw new RangeError('Unknown encounter event');
  }
}

export function prepareDestinyEndEvents(fight, roll) {
  if (fight.turn.encounterEndPrepared) return false;
  fight.turn.encounterEndPrepared = true;
  for (const event of fight.encounter?.endTests || []) {
    if (event.every && fight.round % event.every !== 0) continue;
    if (event.requiresAnyAlive && !event.requiresAnyAlive.some(target => isDestinyOpponentActive(fight, target))) continue;
    if (event.kind === 'ice-prison' && fight.encounter.skollFreed) continue;
    if (event.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    queueDestinyEncounterEvent(fight, { ...event, atEnd: true }, 'end', roll);
  }
  return fight.phase === 'ability-rolled';
}

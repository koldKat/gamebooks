// Shared DestinyQuest combat sequence. Book abilities and encounter exceptions
// are applied between these explicit stages, rather than hidden inside a roll.
import { damageDestinyHero, beginDestinyCombatBoosts, destinyStat, destinyDamageScore, destinyOnHeroHit, destinyPassiveEffects,
  destinyPassiveProtection, hasDestinyAbility, healDestinyHero, recordDestinyDefeat, destinyStrike, observeDestinyHealth, destinyRollOpponentDice, addDestinyStatEffect,
  isDestinyOpponentActive, isDestinyOpponentDead, destinyDamageAllowed, destinyAttackerTarget, reflectDestinyDamage, destinyScoreExtraDice, onDestinyHeroDice, destinyImmuneToAbility, applyDestinyHeroRoll, destinyArmour, applyDestinyAcceptedHeroRoll,recordDestinyRollFaces,onDestinyOpponentHealthHit,destinyHeroHasStatus } from './effects.js';
import { applyDestinyRoundEvents, spawnDestinyRoundOpponents, reformDestinyOpponent, advanceDestinyAspectCycle,applyDestinyScheduledTransitions,prepareDestinyGridRound } from './round-events.js';
import { queueDestinyEncounterEvent, prepareDestinyEndEvents } from './encounter-events.js';
import { destinyPathEndEffects } from './path-challenge.js';
import { onDestinyHeroSpeedRoll } from './roll-events.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import { restoreDestinyPrimaryHero } from './hero-relay.js';
import {prepareDestinyStanceDefense} from './sustained.js';
import {prepareDestinyAutomaticModifiers} from './automatic-modifiers.js';
import {destinyScoreContext,markDestinyScoreDice} from './score-immunity.js';
import {resetDestinyCombatActor} from './combat-reset.js';
import {destinyOpponentSpeedResult} from './effects.js';
import {recordDestinyOpponentDamage,destinyRoundMatches,applyDestinyDamageSourceRules,absorbDestinyShieldDamage} from './effects.js';
import {prepareDestinyScoreCancellation,destinyCancellationScoreContext} from './damage-cancellation.js';
import {updateDestinyPairOutcome} from './team-pairs.js';
import {destinyEnemyTurn,createDestinyEnemyContext} from './enemy-context.js';
import {prepareDestinyPetRound,routeDestinyPetAttack,finishDestinyPetRound,restoreDestinyPet,applyDestinyPetSpeedLoss,prepareDestinyPetDeath,prepareDestinyMirageDefense} from './pets.js';
import {applyDestinyRoundAbilityEffects} from './ability-reactions.js';
const attributes = ['speed', 'brawn', 'magic', 'armour'];
const clone = value => structuredClone(value);

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) {
    throw new RangeError(`Invalid ${label}`);
  }
  return value;
}

function actor(input, enemy = false) {
  if (!input || typeof input !== 'object') throw new RangeError('Missing combatant');
  if (enemy && input.role === 'indestructible') {
    if (!['brawn', 'magic'].includes(input.damageStat) || input.health !== null || input.armour !== null) throw new RangeError('Invalid indestructible component');
    const result = { name: String(input.name || 'Component'), role: 'indestructible', speed: integer(input.speed, 'component speed'),
      brawn: input.brawn === null ? null : input.brawn === undefined ? 0 : integer(input.brawn, 'component brawn'),
      magic: input.magic === null ? null : input.magic === undefined ? 0 : integer(input.magic, 'component magic'),
      armour: null, health: null, maxHealth: null, damageStat: input.damageStat };
    result.normal = Object.fromEntries(attributes.map(attribute => [attribute, result[attribute]]));
    return result;
  }
  if (enemy && input.role === 'resource') return { name: String(input.name || 'Component'), role: 'resource',
    speed: null, brawn: null, magic: null, damageStat: null, armour: input.armour===null?null:integer(input.armour, 'component armour'),
    health: integer(input.health, 'component health', 1), maxHealth: integer(input.health, 'component health', 1),
    normal: { speed: null, brawn: null, magic: null, armour: input.armour } };
  const result = { name: String(input.name || (enemy ? 'Opponent' : 'Hero')) };
  for (const key of attributes) result[key] = enemy&&['brawn','magic'].includes(key)&&input[key]===null?null:integer(input[key] ?? 0, key);
  result.health = integer(input.health, 'health', 1);
  result.maxHealth = integer(input.maxHealth ?? input.health, 'maximum health', 1);
  if (result.health > result.maxHealth) throw new RangeError('Health exceeds maximum');
  result.normal = {};
  for (const key of attributes) result.normal[key] = result[key]===null?null:integer(input.normal?.[key] ?? result[key], key);
  if (enemy) {
    if (input.damageStat !== undefined && !['brawn', 'magic'].includes(input.damageStat)) {
      throw new RangeError('Invalid opponent damage attribute');
    }
    if (result.brawn && result.magic && !input.damageStat) {
      throw new RangeError('Choose the opponent damage attribute explicitly');
    }
    result.damageStat = input.damageStat ?? (result.magic ? 'magic' : 'brawn');
  }
  return result;
}

export const createDestinyOpponent = input => actor(input, true);

// Keep the random source injectable, including invalid-roll rejection, without
// retaining functions in the serializable saved fight.
function dice(roll, count) {
  return Array.from({ length: count }, () => {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    return value;
  });
}
const randomDie = () => Math.floor(Math.random() * 6) + 1;
const sum = values => values.reduce((total, value) => total + value, 0);
function commitEnemyCharge(fight){
  if(fight.turn.pendingEnemyCharge&&fight.turn.winner==='opponent')fight.encounter.enemyWinCharge.count=(fight.encounter.enemyWinCharge.count||0)+1;
  delete fight.turn.pendingEnemyCharge;
}

function stage(fight, expected) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'active' || !expected.includes(fight.phase)) {
    throw new RangeError('Action unavailable at this combat stage');
  }
  return clone(fight);
}

export function reviveDestinyHero(fight){
  if (fight.status==='active' && fight.hero.health<=0 && !fight.encounter?.forcedLoss) for (const [name,spec] of Object.entries(fight.abilityCatalog||{})) {
    if (!spec.reviveHealth || spec.reviveDamageDice || fight.used[name] || !hasDestinyAbility(fight,name)) continue;
    fight.used[name]=1;
    fight.hero.health=Math.min(fight.hero.maxHealth,spec.reviveHealth);
    if (spec.cleanseOnRevive) {
      fight.effects=fight.effects.filter(effect=>effect.target!=='hero'||!['bleed','venom','disease','burn','ongoing-damage','delayed-dice'].includes(effect.status||effect.kind));
      if(fight.encounter){delete fight.encounter.heroStatuses;delete fight.encounter.growingStatus;}
    }
    fight.history.push({type:'revival',round:fight.round,source:name,health:fight.hero.health});
    break;
  }
}

export function settleDestinyFight(fight, roll = randomDie, revivalReturnPhase) {
  for(const rule of fight.encounter?.healthLossGroupDamage||[]){
    const triggers=rule.pending||0;rule.pending=0;
    for(let i=0;i<triggers;i++)for(const target of rule.attackers)if(isDestinyOpponentActive(fight,target)){
      const damage=damageDestinyHero(fight,Math.max(0,rule.amount-(rule.ignoreArmour?0:destinyArmour(fight,'hero'))));
      fight.history.push({type:'encounter-retaliation',round:fight.round,target,damage,source:rule.name});
    }
  }
  const objective=fight.encounter?.scoreHitsObjective;
  if(objective&&!fight.encounter?.forcedLoss&&((objective.count||0)>=objective.required||fight.hero.health<=0)) {
    fight.encounter.forcedVictory=true;fight.encounter.winSection=objective.section;
    fight.encounter.allowZeroHealthVictory=!!objective.allowZeroHealth;
  }
  if(fight.encounter?.lossAtOpponentHealth?.some(rule=>fight.opponents[rule.target].health>=rule.minimum))fight.encounter.forcedLoss=true;
  if(fight.encounter?.friendlyObjective&&fight.opponents[fight.encounter.friendlyObjective.target].health<=0)fight.encounter.forcedLoss=true;
  if (fight.encounter?.heroRelay?.active && fight.hero.health <= 0) {
    fight.phase = 'between-combats';
    return true;
  }
  if(fight.turn?.pendingAbility?.type==='hero-revival'&&!fight.encounter?.forcedLoss)return true;
  if(fight.hero.health<=0&&!fight.encounter?.forcedLoss) for(const name of Object.keys(fight.abilities||{})) {
    const spec=fight.abilityCatalog?.[name];
    if(!spec?.reviveDamageDice||fight.used[name]||!hasDestinyAbility(fight,name))continue;
    const target=fight.opponents.findIndex((_,i)=>isDestinyOpponentActive(fight,i));
    fight.used[name]=1;
    if(target<0){fight.hero.health=Math.min(fight.hero.maxHealth,spec.reviveHealth);break;}
    const suspendedAbility=fight.turn.pendingAbility?structuredClone(fight.turn.pendingAbility):null;
    fight.turn.pendingAbility={type:'hero-revival',name,target,health:spec.reviveHealth,
      dice:applyDestinyHeroRoll(fight,dice(roll,spec.reviveDamageDice),'damage'),suspendedAbility,
      returnPhase:revivalReturnPhase??(['damage-rolled','speed-rolled'].includes(fight.phase)?'end':fight.phase)};
    fight.phase='ability-rolled';return true;
  }
  reviveDestinyHero(fight);
  if(prepareDestinyPetDeath(fight,roll))return true;
  observeDestinyHealth(fight);
  updateDestinyPairOutcome(fight);
  if(revivalReturnPhase&&fight.turn?.afterHealthDamageEvents?.length)fight.turn.afterHealthDamageReturnPhase=revivalReturnPhase;
  if(prepareDestinyAutomaticModifiers(fight,roll))return true;
  if(fight.hero.health>0&&fight.turn?.afterHealthDamageEvents?.length&&fight.turn.pendingAbility?.type!=='encounter'){
    const event=fight.turn.afterHealthDamageEvents.shift();
    const resume=fight.turn.afterHealthDamageReturnPhase??(['damage-rolled','speed-rolled'].includes(fight.phase)?'end':fight.phase);
    if(!fight.turn.afterHealthDamageEvents.length)delete fight.turn.afterHealthDamageReturnPhase;
    queueDestinyEncounterEvent(fight,event,resume,roll);
    return true;
  }
  const alternative=fight.encounter?.alternativeVictory;
  if (fight.hero.health>0 && alternative && alternative.targets.every(target=>isDestinyOpponentDead(fight,target)) &&
      (!alternative.requiresAlive||alternative.requiresAlive.every(target=>isDestinyOpponentActive(fight,target)))) {
    fight.encounter.forcedVictory=true;
    fight.encounter.winSection=alternative.section;
  }
  const sequence=fight.encounter?.consecutiveCombats;
  const livingHero=fight.hero.health>0||fight.team&&fight.allies.some(ally=>ally.hero.health>0);
  if(livingHero&&!fight.encounter?.forcedLoss&&sequence&&sequence.index<sequence.targets.length-1&&isDestinyOpponentDead(fight,sequence.targets[sequence.index])){
    fight.phase='between-combats';
    return true;
  }
  if ((!livingHero&&!(fight.encounter?.allowZeroHealthVictory&&fight.encounter?.forcedVictory)) || fight.encounter?.forcedLoss) fight.status = 'loss';
  else if (fight.encounter?.revivalChecks?.some(rule => !rule.used && isDestinyOpponentDead(fight, rule.target))) {
    // Return true when the action pauses too: callers must not overwrite the
    // saved encounter-roll phase or declare victory before this check resolves.
    if (fight.turn.pendingAbility) return false;
    const rule = fight.encounter.revivalChecks.find(rule => !rule.used && isDestinyOpponentDead(fight, rule.target));
    rule.used = true;
    if (!fight.turn.deaths.includes(rule.target)) fight.turn.deaths.push(rule.target);
    const resume = revivalReturnPhase ?? (['speed-rolled', 'damage', 'damage-rolled'].includes(fight.phase) ? 'end' : fight.phase);
    queueDestinyEncounterEvent(fight, { ...rule, kind: 'revival' }, resume, roll);
    return true;
  }
  else if (fight.phase === 'ability-rolled' && fight.turn?.pendingAbility?.type === 'encounter') return false;
  else if (fight.encounter?.forcedVictory || (!fight.encounter?.victoryOnlyByEvent && !fight.encounter?.defeatCounter && (fight.encounter?.victoryTargets || fight.opponents.map((_, index) => index))
    .every(index => fight.encounter?.victoryByHealth ? isDestinyOpponentDead(fight, index) : !isDestinyOpponentActive(fight, index) || fight.opponents[index].health <= (fight.encounter?.fleeAtHealth?.[index] || 0)))) fight.status = 'win';
  if (fight.status !== 'active') {
    if(fight.team&&fight.status==='win')fight.team.winners=[...fight.team.order];
    if(fight.encounter?.persistHeroArmour)fight.encounter.remainingHeroArmour=destinyArmour({...fight,status:'active'},'hero');
    if (fight.status === 'win') restoreDestinyPrimaryHero(fight);
    fight.phase = 'finished';
    if(fight.status==='win'){
      for(const [resource,counter] of Object.entries(fight.encounter?.persistResources||{})){
        fight.character??={};(fight.character.sourceCounters??={})[counter]=fight.encounter.resources[resource];
      }
      if(fight.encounter?.carryLostAbilitiesToSection){
        fight.character??={};fight.character.pendingAbilityLosses={fromSection:fight.encounter.sourceSection,section:fight.encounter.carryLostAbilitiesToSection,
          abilities:Object.fromEntries(Object.entries(fight.encounter.soulStolenAbilities||{}).filter(([,count])=>count>0))};
      }
      if(fight.encounter?.recordRoundsAs) {
        fight.character??={};(fight.character.sourceCounters??={})[fight.encounter.recordRoundsAs]=fight.round;
      }
      const alternative=fight.encounter?.winSectionWhenNoActions;
      const section=alternative&&!alternative.actions.some(name=>fight.usedBookActions?.[name])?alternative.section:fight.encounter?.winSection;
      if(section)fight.encounter.outcomeSection=section;
      const record=fight.encounter?.winSectionFromDamageRecord;
      if(record&&(fight.encounter[record.key]||0)>=record.minimum)fight.encounter.outcomeSection=record.section;
      const surviving=fight.encounter?.winSectionWhenTargetsAlive;
      if(surviving&&surviving.targets.every(target=>!isDestinyOpponentDead(fight,target)))fight.encounter.outcomeSection=surviving.section;
      const defeated=fight.encounter?.winSectionWhenTargetsDead;
      if(defeated&&defeated.targets.every(target=>isDestinyOpponentDead(fight,target)))fight.encounter.outcomeSection=defeated.section;
      const early=fight.encounter?.winSectionBeforeRound;
      if(early&&fight.round<early.round&&(!early.requiresDead||early.requiresDead.every(target=>isDestinyOpponentDead(fight,target))))fight.encounter.outcomeSection=early.section;
    }
    if(fight.status==='loss'&&fight.encounter?.lossSection)fight.encounter.outcomeSection=fight.encounter.lossSection;
    if(fight.status==='loss'&&fight.encounter?.lossKeywords) {
      fight.character??={};const current=fight.character.keywords;
      const keywords=Array.isArray(current)?current:typeof current==='string'?current.split(',').map(word=>word.trim()).filter(Boolean):[];
      fight.character.keywords=[...new Set([...keywords,...fight.encounter.lossKeywords])];
    }
    if (fight.status === 'win' && fight.encounter?.pathProgress && !fight.encounter.pathProgress.reachedExit) fight.encounter.pathProgress.achievementSection = fight.encounter.pathChallenge.earlyVictorySection;
    if (fight.status === 'win' && fight.encounter?.surrenderRemainingOnVictory) {
      const targets = fight.opponents.map((_, target) => target).filter(target => isDestinyOpponentActive(fight, target));
      fight.encounter.surrenderedTargets = targets;
      fight.history.push({ type: 'surrender', round: fight.round, targets });
    }
    if(fight.status==='win')for(const resource of fight.encounter?.clearResourcesOnVictory||[])fight.encounter.resources[resource]=0;
    if(fight.status==='win')for(const rule of fight.encounter?.countDestroyedOnVictory||[]){
      (fight.encounter.resources??={})[rule.resource]=rule.targets.filter(target=>isDestinyOpponentDead(fight,target)).length;
    }
    if (fight.status === 'win' && (fight.encounter?.defeatRemainingOnVictory||fight.encounter?.defeatTargetsOnVictory)) fight.opponents.forEach((opponent, target) => {
      if(fight.encounter.defeatTargetsOnVictory&&!fight.encounter.defeatTargetsOnVictory.includes(target))return;
      if (isDestinyOpponentActive(fight, target)) {
        opponent.health = 0;
        recordDestinyDefeat(fight, target);
      }
    });
    if (fight.status === 'win' && fight.restoreOnVictory) {
      fight.hero.health = fight.hero.maxHealth;
      Object.assign(fight.hero, fight.hero.normal);
      restoreDestinyPet(fight);
      if(fight.team)for(const ally of fight.allies){ally.hero.health=ally.hero.maxHealth;Object.assign(ally.hero,ally.hero.normal);}
    }
    fight.history.push({ type: 'outcome', round: fight.round, status: fight.status });
    return true;
  }
  return false;
}

export function createDestinyFight(hero, opponents, { restoreOnVictory = true } = {}) {
  if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100) {
    throw new RangeError('Choose 1-100 opponents');
  }
  if (typeof restoreOnVictory !== 'boolean') throw new RangeError('Invalid recovery rule');
  return {
    rulesVersion: 1, status: 'active', phase: 'start', round: 0,
    hero: actor(hero), opponents: opponents.map(value => actor(value, true)),
    restoreOnVictory, target: null, turn: null, history: [],
    used: {}, effects: [],
  };
}

export function createDestinyTurn() {
  return {
    used: { sp: false, co: false, dm: false, backpack: false },
    deaths: [], deathMoveDeathsSeen: 0, heroSpeedDice: null, opponentSpeedDice: null,
    winner: null, damageDice: null, damageScore: null,
  };
}

export function continueDestinyCombat(fight){
  const next=stage(fight,['between-combats']),sequence=next.encounter?.consecutiveCombats;
  if (next.encounter?.heroRelay?.active && next.hero.health <= 0) {
    restoreDestinyPrimaryHero(next, {fallen:true});
    next.round=0;next.phase='start';next.target=0;next.turn=null;
    return next;
  }
  if(!sequence||sequence.index>=sequence.targets.length-1)throw new RangeError('No following combat remains');
  if(next.encounter.lossAfterTotalRounds&&(sequence.completedRounds||0)+next.round>=next.encounter.lossAfterTotalRounds){next.encounter.forcedLoss=true;settleDestinyFight(next);return next;}
  sequence.completedRounds=(sequence.completedRounds||0)+next.round;
  const target=sequence.targets[++sequence.index];
  next.encounter.inactiveTargets=(next.encounter.inactiveTargets||[]).filter(index=>index!==target);
  next.round=0;next.target=target;resetDestinyCombatActor(next,sequence);
  const nextStage=sequence.stages?.[sequence.index];
  if(nextStage){Object.assign(next.encounter,structuredClone(nextStage.rules||{}));if(nextStage.section)next.encounter.sourceSection=nextStage.section;}
  next.history.push({type:'combat-start',combat:sequence.index+1,target,health:next.hero.health,section:next.encounter.sourceSection});
  return next;
}

export function rollDestinyOpeningTest(fight, roll = randomDie) {
  const next = stage(fight, ['encounter-start']);
  if (!next.encounter?.openingTest || next.encounter.openingTestRolled) throw new RangeError('No opening encounter roll remains');
  next.turn = createDestinyTurn();
  next.encounter.openingTestRolled = true;
  queueDestinyEncounterEvent(next, next.encounter.openingTest, 'start', roll);
  return next;
}

export function rollDestinySequenceTest(fight, roll = randomDie) {
  const next = stage(fight, ['encounter-start']);
  const sequence = next.encounter?.sequence;
  if (!sequence || !(next.encounter.sequenceRemaining > 0) || next.hero.health <= 0) throw new RangeError('No active encounter challenge remains');
  next.encounter.hazardStep++;
  next.turn = createDestinyTurn();
  const event = structuredClone(sequence.event);
  event.attributeModifier = (next.encounter.nextStepStats || []).filter(change => change.attribute === event.attribute)
    .reduce((total, change) => total + change.amount, 0);
  delete next.encounter.nextStepStats;
  queueDestinyEncounterEvent(next, event, next.encounter.sequenceRemaining > 1 ? 'encounter-start' : 'start', roll);
  return next;
}

export function rollDestinyApproachTest(fight,roll=randomDie){
  const next=stage(fight,['encounter-start']);
  const rule=next.encounter?.approachChallenge;
  if(!rule||!next.turn||!isDestinyOpponentActive(next,next.target))throw new RangeError('No approach challenge is active');
  queueDestinyEncounterEvent(next,{...rule,kind:'approach-challenge',heroRoll:'challenge'},'encounter-start',roll);
  settleDestinyFight(next,roll);
  return next;
}

export function startDestinyRound(fight, target, roll = randomDie, options = {}) {
  const next = stage(fight, ['start']);
  if(next.encounter?.requiresTeam&&!next.team)throw new RangeError('Configure the source team battle before combat');
  const regrowing=next.encounter?.regrowingTargets;
  if(regrowing?.length&&regrowing.every(target=>next.encounter.inactiveTargets?.includes(target))){next.encounter.forcedVictory=true;settleDestinyFight(next,roll);return next;}
  advanceDestinyAspectCycle(next, next.round + 1);
  reformDestinyOpponent(next, next.round + 1);
  spawnDestinyRoundOpponents(next, next.round + 1, value => actor(value, true));
  target=applyDestinyScheduledTransitions(next,next.round+1,target);
  if(next.encounter?.autoTargetAfterSpawning&&!isDestinyOpponentActive(next,target))target=next.opponents.findIndex((_,i)=>isDestinyOpponentActive(next,i));
  if(next.encounter?.nextTarget!==undefined){
    if(target===next.target&&!isDestinyOpponentActive(next,target))target=next.encounter.nextTarget;
    delete next.encounter.nextTarget;
  }
  const oneRound=next.encounter?.oneRoundSequence;
  if(oneRound&&target!==oneRound.targets[oneRound.index||0])throw new RangeError('Fight the current opponent in sequence');
  integer(target, 'target');
  if (!isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
  if (next.encounter?.unselectableTargets?.includes(target)) throw new RangeError('Choose the exposed combat component');
  if(next.encounter?.winningOnlyTargets?.includes(target))throw new RangeError('Win against an opponent before striking this component');
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  if (next.encounter?.pathProgress?.roundPrepared) next.encounter.pathProgress.roundPrepared = false;
  else { next.round++; next.turn = createDestinyTurn(); }
  next.target = target;
  next.phase = 'speed';
  for(const [name,rule] of Object.entries(next.encounter?.roundChoices||{})){
    const choice=options[rule.option];
    if(!rule.values.includes(choice))throw new RangeError('Choose a valid encounter position before rolling');
    (next.encounter.chosenPositions??={})[name]=choice;
  }
  if(next.encounter?.disableAbilitiesThroughRound!==undefined)next.encounter.disableHeroAbilities=next.round<=next.encounter.disableAbilitiesThroughRound;
  if(!next.encounter?.disableHeroAbilities)beginDestinyCombatBoosts(next);
  prepareDestinyPetRound(next,options);
  for(const rule of next.encounter?.startLossRules||[])if(next.round>=rule.round&&(!rule.requiresAlive||rule.requiresAlive.every(index=>isDestinyOpponentActive(next,index)))){
    next.encounter.forcedLoss=true;settleDestinyFight(next,roll);return next;
  }
  if(next.encounter?.startVictoryAtRound&&next.round>=next.encounter.startVictoryAtRound){
    next.encounter.forcedVictory=true;settleDestinyFight(next,roll);return next;
  }
  if(applyDestinyRoundAbilityEffects(next,options)&&settleDestinyFight(next,roll)) return next;
  if(next.nextHeroSpeedDice?.round===next.round){next.turn.heroSpeedCount=next.nextHeroSpeedDice.count;next.turn.heroSpeedDiceLocked=!!next.nextHeroSpeedDice.locked;delete next.nextHeroSpeedDice;}
  for(const rule of next.encounter?.heroSpeedDiceWhileAlive||[])if(isDestinyOpponentActive(next,rule.target))next.turn.heroSpeedCount=Math.min(next.turn.heroSpeedCount||2,rule.count);
  if(next.encounter?.iceLake){
    const lake=next.encounter.iceLake;lake.cracked=Math.min(lake.columns,lake.cracked+lake.crackStep);
    next.history.push({type:'ice-cracks',round:next.round,position:lake.position,cracked:lake.cracked});
  }
  if (next.encounter?.pathProgress) next.encounter.pathProgress.combatStarted = true;
  if (next.encounter?.sequence) {
    next.encounter.hazardStep++;
    for (const change of next.encounter.nextStepStats || []) {
      addDestinyStatEffect(next, 'hero', change.attribute, change.amount, 1, 'encounter-step');
    }
    delete next.encounter.nextStepStats;
  }
  if (next.autoWinRound === next.round) next.turn.autoWin = true;
  if (next.encounter?.automaticHitTargets?.includes(target)) next.turn.autoWin = true;
  if (next.encounter?.automaticHitsRemaining > 0) next.turn.autoWin = true;
  applyDestinyRoundEvents(next, options, roll);
  prepareDestinyGridRound(next,options,roll);
  if(next.encounter?.pursuit)queueDestinyEncounterEvent(next,{kind:'pursuit',name:next.encounter.pursuit.name,dice:2,heroRoll:'challenge'},'damage',roll);
  const drain=next.encounter?.startAbilityDrain;
  if(drain&&next.round===(drain.round??1))for(const [name,count] of Object.entries(next.abilities||{})){
    if(next.abilityCatalog?.[name]?.category!==drain.category||!hasDestinyAbility(next,name))continue;
    for(let i=0;i<count;i++)queueDestinyEncounterEvent(next,{kind:'ability-drain',name:drain.name,abilityName:name,dice:1,limit:drain.limit,amount:drain.damage,heroRoll:'ability'},'speed',roll);
  }
  for (const event of next.encounter?.startTests || []) {
    if(!destinyRoundMatches(next,event)||event.whenTargets&&!event.whenTargets.includes(next.target))continue;
    if(event.skipWhenFlag&&next.encounter[event.skipWhenFlag])continue;
    if (event.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) continue;
    if (event.every && next.round % event.every !== 0) continue;
    if (event.maxHealth !== undefined && next.opponents[event.target || 0].health > event.maxHealth) continue;
    queueDestinyEncounterEvent(next, event, 'speed', roll);
  }
  if(next.encounter?.approachChallenge){
    next.encounter.approachSuccesses=0;
    next.phase='encounter-start';
  }
  if(next.encounter?.automaticEnemyWinRounds?.includes(next.round)){
    next.turn.winner='opponent';next.turn.heroSpeedDice=[];next.turn.opponentSpeedDice=[];next.phase='damage';
  }
  settleDestinyFight(next, roll);
  return next;
}

export function rollDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed']);
  if (!isDestinyOpponentActive(next, next.target)) throw new RangeError('Choose a living opponent');
  if (next.turn.autoWin) {
    next.turn.heroSpeedDice = [];
    next.turn.opponentSpeedDice = [];
    next.phase = 'speed-rolled';
    return next;
  }
  const savedHero = next.savedHeroDie?.round === next.round;
  const enemyTurn=destinyEnemyTurn(next);
  const heroCount=Math.max(1,(next.turn.heroSpeedCount||2)-(enemyTurn?.opponentSpeedReduction||0));
  next.turn.heroSpeedDice = savedHero ? [next.savedHeroDie.value, ...dice(roll, heroCount - 1)] : dice(roll, heroCount);
  if (savedHero) next.turn.lockedHeroDice = [0];
  const attacker = destinyAttackerTarget(next);
  const controlled = next.turn.controlledOpponent === undefined || next.turn.controlledOpponent === attacker;
  const savedOpponent = next.savedOpponentDice?.round === next.round && next.savedOpponentDice.target === attacker;
  const opponentDice = next.encounter?.speedDiceByTarget?.[attacker] ?? enemyTurn?.heroSpeedCount ?? 2;
  const count = controlled ? next.turn.opponentSpeedCount || Math.max(1, opponentDice - (next.turn.opponentSpeedReduction || 0)) : opponentDice;
  next.turn.opponentSpeedDice = savedOpponent ? [...next.savedOpponentDice.dice] : destinyRollOpponentDice(next, count, roll, 'speed');
  if (savedOpponent) next.turn.lockedOpponentDice = true;
  if(next.encounter?.immutableOpponentDiceTargets?.includes(attacker))next.turn.lockedOpponentDice=true;
  next.phase = 'speed-rolled';
  onDestinyHeroSpeedRoll(next, next.turn.heroSpeedDice.map((_, index) => index).filter(index => !savedHero || index !== 0), roll);
  if (!isDestinyOpponentActive(next, next.target) && !['ability-rolled','ability-choice'].includes(next.phase)) next.phase = 'end';
  settleDestinyFight(next, roll);
  return next;
}

export function retargetDestinyRound(fight, target) {
  const afterWin=fight?.phase==='damage'&&fight.turn?.winner==='hero'&&fight.encounter?.retargetAfterWinning;
  const next = stage(fight, afterWin?['damage']:['speed']);
  integer(target, 'target');
  if (!isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
  if (next.encounter?.unselectableTargets?.includes(target)) throw new RangeError('Choose the exposed combat component');
  if(!afterWin&&next.encounter?.winningOnlyTargets?.includes(target))throw new RangeError('Win against an opponent before striking this component');
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  const attacker=destinyAttackerTarget(next);
  const choices=afterWin&&next.encounter?.retargetOptionsByAttacker?.[attacker];
  if(choices){
    if(!choices.includes(target))throw new RangeError('Choose the defeated initiative opponent or its exposed component');
    next.turn.enemyAttackTarget=attacker;
  }
  next.target = target;
  if(afterWin&&destinyAttackerTarget(next)!==attacker)throw new RangeError('The chosen target has a different attacker');
  if(!afterWin)next.turn.autoWin = next.autoWinRound === next.round || Boolean(next.encounter?.automaticHitTargets?.includes(target)) || next.encounter?.automaticHitsRemaining > 0;
  return next;
}

export function onDestinyHeroRoundWon(fight,roll){
  if(fight.encounter?.heroWinNextSpeedDice)fight.nextHeroSpeedDice={...fight.encounter.heroWinNextSpeedDice,round:fight.round+1};
  const test=fight.encounter?.heroWinTest;
  if(test&&(!test.whenTargets||test.whenTargets.includes(fight.target))&&!test.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target))&&(!test.whenHeroStatus||Object.hasOwn(fight.encounter.heroStatuses||{},test.whenHeroStatus))&&(!test.whenOpponentHealthAtMost||fight.opponents[test.whenOpponentHealthAtMost.target].health<=test.whenOpponentHealthAtMost.health)&&!fight.turn.heroWinTestQueued){fight.turn.heroWinTestQueued=true;queueDestinyEncounterEvent(fight,test,'damage',roll);}
}

export function acceptDestinySpeedRoll(next,roll=randomDie){
  if(next.turn.speedAccepted)return;
  next.turn.speedAccepted=true;
  if(next.encounter?.copyLowestHeroSpeedDie?.includes(destinyAttackerTarget(next))) {
    const hero=next.turn.heroSpeedDice,enemy=next.turn.opponentSpeedDice;
    if(hero.length&&enemy.length&&new Set(hero).size===hero.length&&new Set(enemy).size===enemy.length)
      enemy[enemy.indexOf(Math.min(...enemy))]=Math.min(...hero);
  }
  applyDestinyAcceptedHeroRoll(next,next.turn.heroSpeedDice,'speed');reviveDestinyHero(next);
  if(next.savedOpponentDice?.round!==next.round||next.savedOpponentDice.target!==destinyAttackerTarget(next))recordDestinyRollFaces(next,next.turn.opponentSpeedDice,'opponent','speed');
  for(const rule of next.encounter?.opponentLowestSpeedDamage||[]) {
    const values=next.turn.opponentSpeedDice,opponent=next.opponents[rule.target];
    if(rule.target!==destinyAttackerTarget(next)||opponent.health<=rule.aboveHealth||values.length<2||new Set(values).size<values.length)continue;
    const damage=damageDestinyHero(next,Math.min(...values));
    next.history.push({type:'roll-hazard',name:rule.name,round:next.round,damage});
  }
  if(next.encounter?.forcedLoss||next.encounter?.forcedVictory){settleDestinyFight(next,roll);return;}
  if(next.encounter?.heroSpeedLossFaces&&next.turn.heroSpeedDice.some(face=>next.encounter.heroSpeedLossFaces.includes(face))){next.encounter.forcedLoss=true;settleDestinyFight(next,roll);return next;}
  for(const rule of next.encounter?.acceptedHeroSpeedFaces||[]){
    const hits=next.turn.heroSpeedDice.filter(face=>rule.faces.includes(face)).length;
    if(!hits)continue;
    const damage=damageDestinyHero(next,rule.amount*(rule.perDie?hits:1));
    next.history.push({type:'roll-hazard',round:next.round,name:rule.name,damage});
  }
  for(const rule of next.encounter?.acceptedSpeedEffects||[])if(rule.doubles?next.turn.heroSpeedDice.length>1&&new Set(next.turn.heroSpeedDice).size<next.turn.heroSpeedDice.length:next.turn.heroSpeedDice.some(face=>rule.faces.includes(face))){
    if(rule.forceOpponentWin)next.turn.forcedOpponentWin=true;
    if(rule.blockCategories)next.encounter.blockedRounds={from:next.round,until:next.round,categories:[...rule.blockCategories]};
  }
}

export function resolveDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed-rolled']);
  acceptDestinySpeedRoll(next,roll);
  if(next.status!=='active')return next;
  if(next.hero.health<=0){settleDestinyFight(next,roll,'speed-rolled');return next;}
  const hero = sum(next.turn.heroSpeedDice) + destinyStat(next, 'hero', 'speed')+(next.turn.heroSpeedResultBonus||0);
  const opponent = next.turn.autoWin?0:destinyOpponentSpeedResult(next);
  const losesDoubles=next.turn.opponentSpeedDice.length>1&&new Set(next.turn.opponentSpeedDice).size<next.turn.opponentSpeedDice.length&&next.effects.some(effect=>effect.kind==='lose-speed-doubles'&&effect.target===destinyAttackerTarget(next)&&effect.from<=next.round&&effect.until>=next.round);
  next.turn.winner = next.turn.forcedOpponentWin ? 'opponent' : next.turn.autoWin||losesDoubles ? 'hero' : hero === opponent ? 'standoff' : hero > opponent ? 'hero' : 'opponent';
  if(next.turn.winner==='hero') for(const change of next.turn.speedWinChanges||[]) addDestinyStatEffect(next,'hero',change.attribute,change.amount,change.duration,change.source);
  if(next.turn.winner!=='hero'||next.sustainedDamage?.target!==next.target)delete next.sustainedDamage;
  if (next.turn.winner === 'hero' && !next.turn.autoWin && next.encounter?.automaticHitsAfterWin) next.encounter.automaticHitsRemaining = next.encounter.automaticHitsAfterWin;
  next.phase = next.turn.winner === 'standoff' ? 'end' : 'damage';
  if (next.turn.winner === 'opponent' && next.encounter?.allOpponentsAttackOnLoss) {
    const first=destinyAttackerTarget(next);
    next.turn.enemyAttackTarget=first;
    next.turn.remainingEnemyAttacks=next.opponents.map((_,index)=>index).filter(index=>index!==first&&isDestinyOpponentActive(next,index));
  }
  next.history.push({ type: 'speed', round: next.round, target: next.target,
    heroDice: [...next.turn.heroSpeedDice], opponentDice: [...next.turn.opponentSpeedDice],
    hero, opponent, winner: next.turn.winner });
  if(next.turn.winner==='opponent') {
    const attacker=destinyAttackerTarget(next),petAttack=applyDestinyPetSpeedLoss(next,attacker,roll);
    if(petAttack&&!isDestinyOpponentActive(next,attacker)) {next.phase='end';settleDestinyFight(next,roll);return next;}
    const drain=next.encounter?.enemyWinStatDrain;
    if(drain) {
      const current=destinyStat(next,'hero',drain.attribute);
      const damage=current>0?0:damageDestinyHero(next,drain.overflowDamage);
      if(current>0)addDestinyStatEffect(next,'hero',drain.attribute,-Math.min(current,drain.amount),null,drain.name);
      next.history.push({type:'encounter-drain',name:drain.name,round:next.round,damage});
      next.phase='end';settleDestinyFight(next,roll);return next;
    }
  }
  if(next.turn.winner==='opponent')for(const rule of next.encounter?.enemyWinResourceIncrement||[]) {
    next.encounter.resources[rule.resource]=(next.encounter.resources[rule.resource]||0)+rule.amount;
  }
  const charged=next.encounter?.enemyWinCharge;
  if(charged&&next.turn.winner==='opponent'){
    next.turn.pendingEnemyCharge=true;
    next.turn.enemyFixedDamage=((charged.count||0)+1)%charged.wins===0?charged.damage:0;
    next.turn.blockedAbilities=[...(charged.blockedAbilities||[])];
  }
  if (next.encounter?.heroDamageWithoutSpeedAbility && !next.turn.playedSpeedAbility) {
    const damage = damageDestinyHero(next,next.encounter.heroDamageWithoutSpeedAbility);
    next.history.push({ type: 'encounter-damage', name: 'Head rush', round: next.round, damage });
    if (settleDestinyFight(next, roll)) return next;
  }
  const ranged = next.encounter?.rangedCombat;
  if (ranged && next.round <= ranged.throughRound) {
    if (next.turn.winner === 'hero') {
      next.turn.rangedShot = true;
      next.turn.rangedDamageDice = ranged.damageDice;
      next.turn.ignoreArmour = ranged.ignoreArmour;
    } else next.phase = 'end';
    return next;
  }
  if(next.turn.winner==='hero')onDestinyHeroRoundWon(next,roll);
  if(next.turn.winner==='opponent'&&next.encounter?.enemyWinBlockCategories)next.encounter.blockedRounds={from:next.round,until:next.round,categories:[...next.encounter.enemyWinBlockCategories]};
  const event = next.turn.winner === 'opponent' ? next.encounter?.enemyWinTest : null;
  if(!event?.unavoidable&&prepareDestinyStanceDefense(next,event,roll))return next;
  if (event) queueDestinyEncounterEvent(next, event, 'damage', roll);
  for(const test of next.encounter?.speedResultTests||[])if(test.winners.includes(next.turn.winner)&&!test.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target)))queueDestinyEncounterEvent(next,test,next.phase,roll);
  return next;
}

export function rollDestinyDamage(fight, roll = randomDie, { soundCharge = true } = {}) {
  const next = stage(fight, ['damage']);
  delete next.sustainedDamage;
  if(next.turn.enemyFixedDamage!==undefined)throw new RangeError('This opponent attack does not roll for damage');
  if (typeof soundCharge !== 'boolean') throw new RangeError('Choose whether to use the charge damage bonus');
  if (soundCharge && next.turn.winner === 'hero' && next.turn.soundCharge && !next.turn.used.co&&!next.encounter?.abilityCategoryImmunityByTarget?.[next.target]?.includes('co')) {
    next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
    next.turn.used.co = true;
    if (hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  }
  const enemyTurn=destinyEnemyTurn(next);
  const extra = next.turn.winner==='opponent'&&enemyTurn?(enemyTurn.extraDamageDice||0):(next.turn.extraDamageDice||0);
  const damageRule = next.turn.winner === 'opponent' && next.encounter?.opponentDamageRollRules?.find(rule=>rule.target===destinyAttackerTarget(next)&&
    (!rule.requiresAlive||rule.requiresAlive.every(target=>isDestinyOpponentActive(next,target))));
  if(damageRule?.keepHighest)next.turn.damageKeepHighest=damageRule.keepHighest;
  else delete next.turn.damageKeepHighest;
  next.turn.keepAllDamageDoubles=!!damageRule?.keepAllOnDoubles;
  const count = (next.turn.winner === 'opponent' ? damageRule?.dice || next.encounter?.damageDiceByTarget?.[destinyAttackerTarget(next)] || 1 : next.turn.rangedDamageDice || 1) + extra + (next.turn.winner === 'opponent' && next.turn.reckless || next.turn.winner==='hero'&&enemyTurn?.reckless ? 1 : 0);
  next.turn.damageDice = next.turn.winner === 'hero' ? dice(roll, count) : destinyRollOpponentDice(next, count, roll, 'damage');
  if(next.turn.winner==='hero')markDestinyScoreDice(next,count);
  if(next.turn.winner==='hero'){
    applyDestinyHeroRoll(next,next.turn.damageDice,'damage');
    next.turn.damageDice.push(...destinyScoreExtraDice(next,next.turn.damageDice,roll));
    onDestinyHeroDice(next,next.turn.damageDice);
    prepareDestinyScoreCancellation(next,roll);
  }
  if (next.turn.winner === 'opponent') {
    const attacker = destinyAttackerTarget(next);
    if (hasDestinyAbility(next, 'brittle-edge') && isDestinyOpponentActive(next, attacker)) destinyStrike(next, attacker, 2, 'brittle-edge', 'passive');
  }
  if (next.turn.winner === 'opponent' && hasDestinyAbility(next, 'siphon')&&!next.abilityCatalog?.siphon?.opponentDamageFaceMap) {
    next.turn.damageDice = next.turn.damageDice.map(face => face === 6 ? 1 : face);
  }
  next.phase = 'damage-rolled';
  if (!isDestinyOpponentActive(next, next.turn.winner==='opponent'?destinyAttackerTarget(next):next.target)) next.phase = 'end';
  settleDestinyFight(next, roll);
  return next;
}

export function resolveDestinyDamage(fight, roll = randomDie) {
  const fixed=fight?.phase==='damage'&&fight.turn?.winner==='opponent'&&fight.turn.enemyFixedDamage!==undefined;
  const next = stage(fight, fixed?['damage']:['damage-rolled']);
  if(fixed)next.turn.damageDice=[];
  const heroWon = next.turn.winner === 'hero';
  if(heroWon&&!next.turn.heroScoreAccepted){
    applyDestinyAcceptedHeroRoll(next,next.turn.damageFromSpeedDiceCount?next.turn.damageDice.slice(next.turn.damageFromSpeedDiceCount):next.turn.damageDice,'damage');
    next.turn.heroScoreAccepted=true;reviveDestinyHero(next);
    if(next.hero.health<=0){settleDestinyFight(next,roll,'damage-rolled');return next;}
  }
  else if(!fixed&&!next.turn.enemyScoreAccepted){recordDestinyRollFaces(next,next.turn.damageDice,'opponent','damage');next.turn.enemyScoreAccepted=true;}
  if(next.encounter?.forcedLoss||next.encounter?.forcedVictory){settleDestinyFight(next,roll);return next;}
  const attacker = destinyAttackerTarget(next);
  const itemLoss=next.encounter?.enemyScoreItemLoss;
  if(!heroWon&&itemLoss&&itemLoss.target===attacker&&next.turn.damageDice.includes(itemLoss.face)&&!next.turn.sharedItemLossResolved){
    queueDestinyEncounterEvent(next,{kind:'shared-item-loss',name:itemLoss.name},'damage-rolled',roll);return next;
  }
  const defender = heroWon ? next.opponents[next.target] : next.hero;
  if(heroWon)prepareDestinyScoreCancellation(next,roll);
  const scoring=heroWon?destinyCancellationScoreContext(destinyScoreContext(next)):next;
  const enemyTurn=destinyEnemyTurn(next);
  const score = fixed?next.turn.enemyFixedDamage:next.turn.rangedShot ? sum(scoring.turn.damageDice) : !heroWon&&enemyTurn?destinyDamageScore(createDestinyEnemyContext(next)):destinyDamageScore(scoring);
  if(fixed)commitEnemyCharge(next);
  if (heroWon) {
    const sixes = next.turn.damageDice.filter(face => face === 6).length;
    for (const effect of next.effects) if (effect.source === 'creeping-cold') effect.amount += sixes;
  }
  let armour = destinyArmour(scoring, heroWon ? next.target : 'hero');
  if(fixed)armour=0;
  const piercingRule=!heroWon&&next.encounter?.opponentIgnoreArmourByTarget?.[attacker];
  const piercing=typeof piercingRule==='object'?piercingRule.ability:piercingRule;
  const facePiercing=!heroWon&&next.encounter?.opponentArmourIgnoringFacesByTarget?.[attacker];
  const activeFacePiercing=facePiercing&&next.turn.damageDice.some(face=>facePiercing.faces.includes(face))&&!destinyImmuneToAbility(next,facePiercing.ability);
  if(activeFacePiercing)armour=0;
  if(piercing&&!piercingRule.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target))&&!destinyImmuneToAbility(next,piercing)){
    const protection=next.encounter?.armourThroughPiercing;
    armour=protection&&hasDestinyAbility(next,protection.ability)?Math.ceil(armour/protection.divisor):0;
  }
  if (scoring.turn.ignoreArmour && (heroWon ? !next.encounter?.abilityImmunityByTarget?.[next.target]?.includes(next.turn.ignoreArmourAbility) : !destinyImmuneToAbility(next,next.turn.opponentArmourAbility))) armour = 0;
  // Fatal blow ignores half the armour, rounding the ignored half UP.
  else if (scoring.turn.halfArmour) armour -= Math.ceil(armour / 2);
  if(!heroWon&&enemyTurn?.ignoreArmour&&!destinyImmuneToAbility(next,enemyTurn.ignoreArmourAbility))armour=0;
  else if(!heroWon&&enemyTurn?.halfArmour)armour-=Math.ceil(armour/2);
  const faceBonus=heroWon?0:(next.encounter?.opponentDamageFaceBonus||[]).filter(rule=>rule.target===attacker).reduce((total,rule)=>total+next.turn.damageDice.filter(face=>rule.faces.includes(face)).length*rule.amount,0);
  const damage = next.turn.avoidDamage || heroWon && (enemyTurn?.avoidDamage||!destinyDamageAllowed(next, next.target)) ? 0 :
    !heroWon && next.turn.replaceIncomingDamage !== undefined ? next.turn.replaceIncomingDamage : Math.max(0, score - armour)+faceBonus;
  if(!heroWon&&prepareDestinyMirageDefense(next,{score,heroDamage:damage,
    ignorePetArmour:!!next.encounter?.opponentIgnorePetArmourByTarget?.[attacker]||!!(activeFacePiercing&&facePiercing.includePets),returnPhase:fixed?'damage':'damage-rolled'},roll))return next;
  if(!heroWon)for(const change of next.encounter?.onEnemyDamageFaceStats||[]){
    if(change.target!==attacker||!next.turn.damageDice.some(face=>change.faces.includes(face)))continue;
    const current=destinyStat(next,attacker,change.attribute),amount=change.maximum===undefined?change.amount:Math.max(0,Math.min(change.amount,change.maximum-current));
    if(amount)addDestinyStatEffect(next,attacker,change.attribute,amount,null,change.name||'encounter-roll');
  }
  const petIntercept = !heroWon && routeDestinyPetAttack(next,{attacker,score,heroDamage:damage,
    ignoreArmour:!!next.encounter?.opponentIgnorePetArmourByTarget?.[attacker]||!!(activeFacePiercing&&facePiercing.includePets)},roll);
  let healthLost = heroWon ? absorbDestinyShieldDamage(next,next.target,damage)?0:Math.min(defender.health, damage) : petIntercept ? 0 : damageDestinyHero(next,damage);
  if (heroWon) reflectDestinyDamage(next, next.target, healthLost, 'score');
  if(heroWon){defender.health -= healthLost;recordDestinyOpponentDamage(next,next.target,healthLost,'score');applyDestinyDamageSourceRules(next,next.target,healthLost,'score');}
  if(!heroWon&&healthLost&&next.encounter?.extraHeroDamagePerArmour){
    const extra=damageDestinyHero(next,Math.ceil(destinyArmour(next,'hero')/next.encounter.extraHeroDamagePerArmour));
    healthLost+=extra;
  }
  if (heroWon && isDestinyOpponentDead(next, next.target)) recordDestinyDefeat(next, next.target);
  next.turn.damageScore = score;
  next.turn.healthDamage = healthLost;
  if(!heroWon&&healthLost&&next.encounter?.scoreHitsObjective)next.encounter.scoreHitsObjective.count=(next.encounter.scoreHitsObjective.count||0)+1;
  if(!heroWon&&healthLost){
    onDestinyOpponentHealthHit(next,attacker,healthLost,'score');
    if(next.turn.faceTriggeredHealing&&isDestinyOpponentActive(next,attacker)){
      const opponent=next.opponents[attacker];opponent.health=Math.min(opponent.maxHealth,opponent.health+next.turn.faceTriggeredHealing);
    }
    for(const rule of next.encounter?.onEnemyHitHealing||[])if(rule.target===attacker&&isDestinyOpponentActive(next,attacker)){
      const opponent=next.opponents[attacker];opponent.health=Math.min(opponent.maxHealth,opponent.health+(rule.amountFromHealthDamage?healthLost:rule.amount));
    }
    const rage=next.encounter?.enemyConsecutiveHitBoost;
    if(rage&&rage.target===attacker&&!rage.triggered){
      rage.count=rage.lastRound===next.round-1?(rage.count||0)+1:1;rage.lastRound=next.round;
      if(rage.count>=rage.rounds){rage.triggered=true;for(const[attribute,amount]of Object.entries(rage.changes))addDestinyStatEffect(next,attacker,attribute,amount,null,rage.name,1);}
    }
  }
  if(!heroWon&&healthLost&&next.encounter?.iceLake?.opponent===attacker){
    const lake=next.encounter.iceLake;lake.position=Math.max(lake.minimum,lake.position-lake.retreatStep);
    next.history.push({type:'ice-retreat',round:next.round,position:lake.position});
  }
  next.history.push({ type: 'damage', round: next.round, target: next.target,
    attacker: next.turn.winner, dice: [...next.turn.damageDice], score, armour, damage: healthLost });
  if (heroWon) destinyOnHeroHit(next, next.target, healthLost);
  else if (healthLost && hasDestinyAbility(next, 'lightning')) {
    if (isDestinyOpponentActive(next, attacker)) destinyStrike(next, attacker, 2, 'lightning', 'passive');
  }
  if (heroWon && healthLost) {
    next.turn.lastHeroDamage = { [next.target]: healthLost };
    if (next.turn.used.co) next.turn.combatAbilityDamage = true;
    for (const change of next.encounter?.onHeroScoreHealthHit || []) {
      addDestinyStatEffect(next, change.target, change.attribute, change.amount ?? 0, change.duration, 'encounter-hit', change.delay || 0);
      if (change.set !== undefined) next.effects[next.effects.length - 1].set = change.set;
    }
  }
  if (!settleDestinyFight(next, roll)) {
    if (heroWon && isDestinyOpponentDead(next, next.target)) {
      next.turn.deaths.push(next.target);
      next.phase = next.turn.pendingPassiveDeath || next.turn.rangedShot || !destinyDeathMovesEnabled(next) ? 'end' : 'death-move';
      if (next.phase === 'death-move') next.turn.afterDeathMove = 'end';
    } else next.phase = 'end';
    if (!heroWon && next.crystalArmour && !next.turn.avoidDamage) {
      next.turn.pendingAbility = { type: 'test', name: 'crystal-armour', dice: dice(roll, 1), returnPhase: next.phase };
      next.phase = 'ability-rolled';
    }
    if (!heroWon && healthLost) {
      for (const change of next.encounter?.onEnemyScoreHealthHit || []) {
        if (change.attacker !== undefined && change.attacker !== attacker) continue;
        if(destinyImmuneToAbility(next,change.ability))continue;
        const attribute=change.highestOf?change.highestOf.reduce((best,name)=>destinyStat(next,change.target,name)>destinyStat(next,change.target,best)?name:best):change.attribute;
        addDestinyStatEffect(next, change.target, attribute, change.amount, change.duration, 'encounter-hit', change.delay || 0);
        if(change.set!==undefined)next.effects[next.effects.length-1].set=change.set;
      }
      if (next.encounter?.heroStatusOnHit&&(next.encounter.heroStatusOnHit.attacker===undefined||next.encounter.heroStatusOnHit.attacker===attacker)&&!next.encounter.heroStatusOnHit.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target))&&!destinyImmuneToAbility(next,next.encounter.heroStatusOnHit.name)&&!next.turn.suppressHitStatuses?.includes(next.encounter.heroStatusOnHit.name)) (next.encounter.heroStatuses ??= {})[next.encounter.heroStatusOnHit.name] = next.encounter.heroStatusOnHit.amount;
      if (next.encounter?.growingStatusOnHit && !next.encounter.growingStatus&&!destinyImmuneToAbility(next,next.encounter.growingStatusOnHit.status||next.encounter.growingStatusOnHit.name)) next.encounter.growingStatus = { ...next.encounter.growingStatusOnHit, from: next.round };
      if (next.encounter?.blockCategoriesOnHit) next.encounter.blockedRounds = {
        from: next.round + 1, until: next.round + 1, categories: [...next.encounter.blockCategoriesOnHit],
      };
      if (next.encounter?.healthDamageTest && !next.encounter.heroStatuses?.venom) queueDestinyEncounterEvent(next, next.encounter.healthDamageTest, 'end', roll);
      const hitTest = next.encounter?.healthHitTestsByTarget?.[attacker];
      if (hitTest) queueDestinyEncounterEvent(next, { ...hitTest, attacker }, 'end', roll);
    }
  }
  return next;
}

export function skipDestinyDeathMove(fight) {
  const next = stage(fight, ['death-move']);
  next.turn.deathMoveDeathsSeen = next.turn.deaths.length;
  next.phase = next.turn.afterDeathMove;
  return next;
}

// All end-of-round effects are evaluated from the same living-combatant
// snapshot. A death in the first effect must not suppress another due effect.
// Ability/encounter modules supply the applicable effects for this round.
export function endDestinyRound(fight, effects = [], roll = randomDie, {advanceOnIce=true} = {}) {
  const next = stage(fight, ['end']);
  if (!Array.isArray(effects)) throw new RangeError('Invalid end-of-round effects');
  if (next.turn.winner==='opponent' && next.turn.remainingEnemyAttacks?.length) {
    const target=next.turn.remainingEnemyAttacks.find(index=>isDestinyOpponentActive(next,index));
    next.turn.remainingEnemyAttacks=next.turn.remainingEnemyAttacks.filter(index=>index!==target&&isDestinyOpponentActive(next,index));
    if (target!==undefined) {
      next.turn.enemyAttackTarget=target;
      for (const key of ['damageDice','damageScore','damageScoreBonus','healthDamage','avoidDamage','replaceIncomingDamage','ignoreArmour','halfArmour','damageKeepHighest','faceTriggeredHealing','extraDamageDice','damagePerDie','damageDieBonuses','normalDamageReplaced']) delete next.turn[key];
      next.phase='damage';
      return next;
    }
  }
  for(const rule of next.encounter?.consumeGroupAfterCombat||[]){
    if(rule.used||next.round!==rule.round||!isDestinyOpponentActive(next,rule.target))continue;
    rule.used=true;const targets=(next.encounter.opponentGroups?.[rule.group]||[]).filter(target=>isDestinyOpponentActive(next,target));
    for(const target of targets){next.opponents[target].health=0;recordDestinyDefeat(next,target);}
    const recipient=next.opponents[rule.target];recipient.health=Math.min(recipient.maxHealth,recipient.health+targets.length*rule.healPer);
    next.history.push({type:'consume-group',name:rule.name,round:next.round,targets,health:recipient.health});
  }
  commitEnemyCharge(next);
  if (prepareDestinyEndEvents(next, roll)) return next;
  if(!next.team||next.team.endAppliedRound!==next.round){
  if(next.encounter?.healingBeforePassives&&!next.turn.healingBeforePassivesApplied) {
    next.turn.healingBeforePassivesApplied=true;
    for(const rule of next.encounter.healingBeforePassives)if(destinyRoundMatches(next,rule)&&isDestinyOpponentActive(next,rule.target)&&!rule.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target))) {
      const recipient=next.opponents[rule.target];recipient.health=Math.min(recipient.maxHealth,recipient.health+rule.amount);
    }
  }
  const alive = next.opponents.map((opponent, target) => isDestinyOpponentActive(next, target));
  const pending = new Map();
  const trackSources=[next,...(next.allies||[])].some(actor=>Object.keys(actor.abilities||{}).some(name=>actor.abilityCatalog?.[name]?.passiveRecoverySources));
  for (const effect of [...destinyPassiveEffects(next, roll), ...(next.turn.encounterEndEffects || []), ...destinyPathEndEffects(next), ...effects]) {
    const target = effect?.target;
    if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || !next.opponents[target])) {
      throw new RangeError('Invalid effect target');
    }
    const amount = Math.max(0,integer(effect.amount, 'passive damage')+(target==='hero'?0:next.encounter?.abilityDamageBonusByTarget?.[target]?.[effect.source]||0));
    if (target !== 'hero' && !effect.allowInactive && (!alive[target] || !destinyDamageAllowed(next, target, 'passive'))) continue;
    const defender = target === 'hero' ? next.hero : next.opponents[target];
    if (typeof effect.ignoreArmour !== 'boolean') throw new RangeError('Specify passive armour handling');
    let damage = Math.max(0, amount - (effect.ignoreArmour ? 0 : destinyArmour(next, target)));
    if (target === 'hero') damage = destinyPassiveProtection(next, damage);
    else applyDestinyDamageSourceRules(next,target,Math.min(damage,defender.health),'passive',effect.source);
    if(effect.recordMaximum)next.encounter[effect.recordMaximum]=Math.max(next.encounter[effect.recordMaximum]||0,Math.min(damage,next.hero.health));
    pending.set(target, (pending.get(target) || 0) + damage);
    if(trackSources&&target!=='hero'){
      const sources=((next.turn.passiveSourcesByTarget??={})[target]??={}),source=String(effect.source||'');
      sources[source]=(sources[source]||0)+damage;
    }
    next.history.push({ type: 'passive', round: next.round, target, damage, source: String(effect.source || '') });
  }
  for (const [target, damage] of pending) {
    const defender = target === 'hero' ? next.hero : next.opponents[target];
    let applied = damage;
    if (target === 'hero' && next.phantomHealth > 0) {
      const absorbed = Math.min(next.phantomHealth, applied);
      next.phantomHealth -= absorbed;
      applied -= absorbed;
    }
    const actual = target==='hero' ? damageDestinyHero(next,applied) : Math.min(defender.health, applied);
    if(target!=='hero')reflectDestinyDamage(next,target,actual,'passive');
    next.turn.passiveDamageByTarget ??= {};
    next.turn.passiveDamageByTarget[target] = actual;
    if(target!=='hero'){defender.health = Math.max(0, defender.health - applied);recordDestinyOpponentDamage(next,target,actual,'passive');}
    if (target !== 'hero' && isDestinyOpponentDead(next, target)) {
      recordDestinyDefeat(next, target);
      next.turn.deaths.push(target);
    }
  }
  finishDestinyPetRound(next);
  const healing = next.effects.filter(effect => effect.kind === 'end-heal' &&
    effect.from <= next.round && effect.until >= next.round).reduce((total, effect) => total + effect.amount, 0) +
    Object.entries(next.abilityCatalog || {}).reduce((total, [name, spec]) =>
      total + (spec.endHeal && hasDestinyAbility(next, name) ? spec.endHeal : 0), 0);
  if (healing || next.turn.encounterEndHealing) healDestinyHero(next, healing + (next.turn.encounterEndHealing || 0));
  for (const effect of next.turn.encounterEndOpponentHealing || []) {
    if (isDestinyOpponentActive(next, effect.target)) next.opponents[effect.target].health = Math.min(effect.uncapped?Number.MAX_SAFE_INTEGER:next.opponents[effect.target].maxHealth, next.opponents[effect.target].health + effect.amount);
  }
  }
  for (const effect of next.encounter?.regeneration || []) {
    const opponent = next.opponents[effect.target];
    if ((isDestinyOpponentActive(next, effect.target)||effect.allowInactive&&opponent.health>0||effect.revive&&opponent.health===0) && !effect.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) {
      opponent.health = Math.min(effect.uncapped ? Number.MAX_SAFE_INTEGER : opponent.maxHealth, opponent.health + effect.amount);
    }
  }
  const periodic=next.encounter?.periodicObjectiveStrike;
  if(periodic&&next.round%periodic.every===0)next.opponents[periodic.source].health=periodic.resetHealth;
  for(const rule of next.encounter?.periodicResourceReset||[])if(next.round%rule.every===0&&!rule.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target))){
    const target=next.opponents[rule.target];
    if(target.health<=0){next.effects=next.effects.filter(effect=>effect.target!==rule.target);next.turn.deaths=next.turn.deaths.filter(index=>index!==rule.target);}
    if(target.health>0&&rule.ifAliveHeroDamage){
      const damage=damageDestinyHero(next,Math.max(0,rule.ifAliveHeroDamage-(rule.ignoreArmour?0:destinyArmour(next,'hero'))));
      next.history.push({type:'encounter-damage',round:next.round,name:rule.name,damage});
    }
    target.health=rule.health;next.defeated=(next.defeated||[]).filter(index=>index!==rule.target);
  }
  for (const effect of next.encounter?.endArmourGrowth || []) {
    const opponent = next.opponents[effect.target];
    if (isDestinyOpponentActive(next, effect.target) && opponent.armour < effect.maximum) opponent.armour = Math.min(effect.maximum, opponent.armour + effect.amount);
  }
  for(const rule of next.encounter?.endAttributeGrowth||[]){
    const opponent=next.opponents[rule.target];
    if(isDestinyOpponentActive(next,rule.target))opponent[rule.attribute]=Math.min(rule.maximum??Number.MAX_SAFE_INTEGER,opponent[rule.attribute]+rule.amount);
  }
  for(const rule of next.encounter?.endUnhitStatGrowth||[])if(isDestinyOpponentActive(next,rule.target)&&!next.turn.activeDamageByTarget?.[rule.target]) {
    const opponent=next.opponents[rule.target];opponent[rule.attribute]=Math.min(rule.maximum,opponent[rule.attribute]+rule.amount);
  }
  for(const target of next.encounter?.regrowingTargets||[])if(next.opponents[target].health===next.opponents[target].maxHealth&&next.encounter.inactiveTargets?.includes(target)){
    next.encounter.inactiveTargets=next.encounter.inactiveTargets.filter(index=>index!==target);
    next.defeated=(next.defeated||[]).filter(index=>index!==target);
    next.history.push({type:'regrown',round:next.round,target});
  }
  for(const rule of next.encounter?.endResourceIncrement||[]){
    if(rule.requiresAlive?.some(target=>!isDestinyOpponentActive(next,target)))continue;
    next.encounter.resources[rule.resource]=(next.encounter.resources[rule.resource]||0)+rule.amount;
  }
  for(const cycle of next.encounter?.endStatCycles||[])if(isDestinyOpponentActive(next,cycle.target)){
    const actor=next.opponents[cycle.target],direction=cycle.direction??1;
    for(const [attribute,amount] of Object.entries(cycle.changes))actor[attribute]+=amount*direction;
    const value=actor[cycle.boundAttribute];
    if(value<=cycle.minimum||value>=cycle.maximum)cycle.direction=-direction;
  }
  for(const rule of next.encounter?.endAttributeDrains||[])if(isDestinyOpponentActive(next,rule.target)){
    const current=destinyStat(next,rule.target,rule.attribute);
    if(current>0)addDestinyStatEffect(next,rule.target,rule.attribute,-Math.min(current,rule.amount),null,rule.name);
    else if(rule.damageAtZero)destinyStrike(next,rule.target,rule.damageAtZero,rule.name,'companion');
  }
  for (const effect of next.encounter?.endStats || []) {
    if(effect.requiresHeroStatus&&!destinyHeroHasStatus(next,effect.requiresHeroStatus))continue;
    if (effect.round !== undefined && effect.round !== next.round || effect.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(next, effect.target, attribute, amount, null, effect.source||'encounter-end');
  }
  for (const effect of next.encounter?.scheduledEndEffects || []) {
    if (effect.applied || effect.round !== next.round) continue;
    effect.applied = true;
    if (!isDestinyOpponentActive(next, effect.target)) continue;
    for (const [attribute, amount] of Object.entries(effect.changes || {})) addDestinyStatEffect(next, effect.target, attribute, amount, null, effect.name);
    if (effect.healthLoss) destinyStrike(next, effect.target, effect.healthLoss, effect.name);
    next.history.push({ type: 'scheduled-end-effect', name: effect.name, round: next.round, target: effect.target });
  }
  for(const rule of next.encounter?.escapeAtRoundEnd||[]){
    if(next.round>=rule.round&&isDestinyOpponentActive(next,rule.target)){
      (next.encounter.escapedTargets??=[]).push(rule.target);
      next.history.push({type:'escape',round:next.round,target:rule.target});
    }
  }
  if (next.encounter?.lossAfterRound && next.round >= next.encounter.lossAfterRound && (next.encounter.lossAfterRoundEvenIfDead||next.opponents.some(opponent => opponent.health > 0))) next.encounter.forcedLoss = true;
  if(next.encounter?.lossAfterTotalRounds&&(next.encounter.consecutiveCombats?.completedRounds||0)+next.round>=next.encounter.lossAfterTotalRounds)next.encounter.forcedLoss=true;
  if(next.encounter?.victoryAfterRound&&next.round>=next.encounter.victoryAfterRound)next.encounter.forcedVictory=true;
  for (const rule of next.encounter?.lossAtGroupCount || []) {
    if (!next.encounter.forcedVictory && (next.encounter.opponentGroups?.[rule.group] || []).filter(target => isDestinyOpponentActive(next, target)).length >= rule.minimum) next.encounter.forcedLoss = true;
  }
  if (next.encounter?.automaticHitsRemaining > 0) next.encounter.automaticHitsRemaining--;
  const lake=next.encounter?.iceLake;
  if(lake){
    if(typeof advanceOnIce!=='boolean')throw new RangeError('Choose whether to advance on the ice');
    if(next.turn.winner==='hero'&&advanceOnIce){
      lake.position=Math.min(lake.columns,lake.position+lake.advanceStep);
      next.history.push({type:'ice-advance',round:next.round,position:lake.position});
    }
  }
  const oneRound=next.encounter?.oneRoundSequence;
  if(oneRound&&next.hero.health>0){
    const index=oneRound.index||0,target=oneRound.targets[index],defeated=isDestinyOpponentDead(next,target);
    next.history.push({type:'sequence-result',round:next.round,index,target,defeated});
    if(index===oneRound.targets.length-1)next.encounter[defeated?'forcedVictory':'forcedLoss']=true;
    else{
      const following=oneRound.targets.slice(index+1);
      if(!defeated)for(const target of following){next.opponents[target].health+=oneRound.failureHealthBonus;next.opponents[target].maxHealth+=oneRound.failureHealthBonus;}
      oneRound.index=index+1;next.encounter.inactiveTargets=next.opponents.map((_,i)=>i).filter(i=>i!==following[0]);
      next.target=following[0];next.round=0;resetDestinyCombatActor(next,{restoreAbilities:true});return next;
    }
  }
  const resume = next.encounter?.pathProgress || next.encounter?.sequenceRemaining > 0 ? 'encounter-start' : 'start';
  if(next.turn.afterHealthDamageEvents?.length)next.turn.afterHealthDamageReturnPhase=resume;
  if (!settleDestinyFight(next, roll, resume)) {
    if (resume === 'encounter-start') {
      next.effects = next.effects.filter(effect => effect.kind !== 'stat' || effect.until > next.round);
    }
    if (destinyDeathMovesEnabled(next) && next.turn.deaths.length > next.turn.deathMoveDeathsSeen && !next.turn.used.dm && !next.turn.rangedShot &&
        (!next.encounter?.pathProgress || next.encounter.pathProgress.roundHadCombat)) {
      next.phase = 'death-move';
      next.turn.afterDeathMove = resume;
    } else next.phase = resume;
    if(lake&&lake.position<=lake.cracked)queueDestinyEncounterEvent(next,lake.endCheck,next.phase,roll);
  }
  return next;
}

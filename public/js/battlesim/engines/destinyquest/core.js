// Shared DestinyQuest combat sequence. Book abilities and encounter exceptions
// are applied between these explicit stages, rather than hidden inside a roll.
import { damageDestinyHero, beginDestinyCombatBoosts, destinyStat, destinyDamageScore, destinyOnHeroHit, destinyPassiveEffects,
  destinyPassiveProtection, hasDestinyAbility, healDestinyHero, recordDestinyDefeat, destinyStrike, observeDestinyHealth, destinyRollOpponentDice, addDestinyStatEffect,
  isDestinyOpponentActive, isDestinyOpponentDead, destinyDamageAllowed, destinyAttackerTarget, reflectDestinyDamage, destinyScoreExtraDice, onDestinyHeroDice, destinyImmuneToAbility, applyDestinyHeroRoll, destinyArmour, applyDestinyAcceptedHeroRoll } from './effects.js';
import { applyDestinyRoundEvents, spawnDestinyRoundOpponents, reformDestinyOpponent, advanceDestinyAspectCycle } from './round-events.js';
import { queueDestinyEncounterEvent, prepareDestinyEndEvents } from './encounter-events.js';
import { destinyPathEndEffects } from './path-challenge.js';
import { onDestinyHeroSpeedRoll } from './roll-events.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import { restoreDestinyPrimaryHero } from './hero-relay.js';
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
      brawn: input.brawn === undefined ? 0 : integer(input.brawn, 'component brawn'),
      magic: input.magic === undefined ? 0 : integer(input.magic, 'component magic'),
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
    if (!spec.reviveHealth || fight.used[name] || !hasDestinyAbility(fight,name)) continue;
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
  if(fight.encounter?.lossAtOpponentHealth?.some(rule=>fight.opponents[rule.target].health>=rule.minimum))fight.encounter.forcedLoss=true;
  if(fight.encounter?.friendlyObjective&&fight.opponents[fight.encounter.friendlyObjective.target].health<=0)fight.encounter.forcedLoss=true;
  if (fight.encounter?.heroRelay?.active && fight.hero.health <= 0) {
    fight.phase = 'between-combats';
    return true;
  }
  reviveDestinyHero(fight);
  observeDestinyHealth(fight);
  if(fight.hero.health>0&&fight.turn?.afterHealthDamageEvents?.length&&fight.turn.pendingAbility?.type!=='encounter'){
    const event=fight.turn.afterHealthDamageEvents.shift();
    queueDestinyEncounterEvent(fight,event,['damage-rolled','speed-rolled'].includes(fight.phase)?'end':fight.phase,roll);
    return true;
  }
  const alternative=fight.encounter?.alternativeVictory;
  if (fight.hero.health>0 && alternative && alternative.targets.every(target=>isDestinyOpponentDead(fight,target)) &&
      (!alternative.requiresAlive||alternative.requiresAlive.every(target=>isDestinyOpponentActive(fight,target)))) {
    fight.encounter.forcedVictory=true;
    fight.encounter.winSection=alternative.section;
  }
  const sequence=fight.encounter?.consecutiveCombats;
  if(fight.hero.health>0&&!fight.encounter?.forcedLoss&&sequence&&sequence.index<sequence.targets.length-1&&isDestinyOpponentDead(fight,sequence.targets[sequence.index])){
    fight.phase='between-combats';
    return true;
  }
  if (fight.hero.health <= 0 || fight.encounter?.forcedLoss) fight.status = 'loss';
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
    if(fight.encounter?.persistHeroArmour)fight.encounter.remainingHeroArmour=destinyArmour({...fight,status:'active'},'hero');
    if (fight.status === 'win') restoreDestinyPrimaryHero(fight);
    fight.phase = 'finished';
    if(fight.status==='win'){
      const alternative=fight.encounter?.winSectionWhenNoActions;
      const section=alternative&&!alternative.actions.some(name=>fight.usedBookActions?.[name])?alternative.section:fight.encounter?.winSection;
      if(section)fight.encounter.outcomeSection=section;
      const early=fight.encounter?.winSectionBeforeRound;
      if(early&&fight.round<early.round)fight.encounter.outcomeSection=early.section;
    }
    if (fight.status === 'win' && fight.encounter?.pathProgress && !fight.encounter.pathProgress.reachedExit) fight.encounter.pathProgress.achievementSection = fight.encounter.pathChallenge.earlyVictorySection;
    if (fight.status === 'win' && fight.encounter?.surrenderRemainingOnVictory) {
      const targets = fight.opponents.map((_, target) => target).filter(target => isDestinyOpponentActive(fight, target));
      fight.encounter.surrenderedTargets = targets;
      fight.history.push({ type: 'surrender', round: fight.round, targets });
    }
    if (fight.status === 'win' && fight.encounter?.defeatRemainingOnVictory) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target)) {
        opponent.health = 0;
        recordDestinyDefeat(fight, target);
      }
    });
    if (fight.status === 'win' && fight.restoreOnVictory) {
      fight.hero.health = fight.hero.maxHealth;
      Object.assign(fight.hero, fight.hero.normal);
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
  const target=sequence.targets[++sequence.index];
  next.encounter.inactiveTargets=(next.encounter.inactiveTargets||[]).filter(index=>index!==target);
  next.round=0;next.phase='start';next.target=target;next.turn=null;next.used={};next.effects=[];
  delete next.combatBoostsApplied;
  delete next.portableShieldHealth;
  Object.assign(next.hero,next.hero.normal);
  for(const key of ['chargedAttacks','sacrificedSummons','lastHealthHitRound','nextHeroSpeedDice'])delete next[key];
  delete next.encounter.heroStatuses;delete next.encounter.growingStatus;
  next.history.push({type:'combat-start',combat:sequence.index+1,target,health:next.hero.health});
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

export function startDestinyRound(fight, target, roll = randomDie, options = {}) {
  const next = stage(fight, ['start']);
  advanceDestinyAspectCycle(next, next.round + 1);
  reformDestinyOpponent(next, next.round + 1);
  spawnDestinyRoundOpponents(next, next.round + 1, value => actor(value, true));
  integer(target, 'target');
  if (!isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
  if (next.encounter?.unselectableTargets?.includes(target)) throw new RangeError('Choose the exposed combat component');
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  if (next.encounter?.pathProgress?.roundPrepared) next.encounter.pathProgress.roundPrepared = false;
  else { next.round++; next.turn = createDestinyTurn(); }
  next.target = target;
  next.phase = 'speed';
  beginDestinyCombatBoosts(next);
  if(next.encounter?.startVictoryAtRound&&next.round>=next.encounter.startVictoryAtRound){
    next.encounter.forcedVictory=true;settleDestinyFight(next,roll);return next;
  }
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
  for (const event of next.encounter?.startTests || []) {
    if(event.skipWhenFlag&&next.encounter[event.skipWhenFlag])continue;
    if (event.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) continue;
    if (event.every && next.round % event.every !== 0) continue;
    if (event.maxHealth !== undefined && next.opponents[event.target || 0].health > event.maxHealth) continue;
    queueDestinyEncounterEvent(next, event, 'speed', roll);
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
  next.turn.heroSpeedDice = savedHero ? [next.savedHeroDie.value, ...dice(roll, (next.turn.heroSpeedCount || 2) - 1)] : dice(roll, next.turn.heroSpeedCount || 2);
  if (savedHero) next.turn.lockedHeroDice = [0];
  const attacker = destinyAttackerTarget(next);
  const controlled = next.turn.controlledOpponent === undefined || next.turn.controlledOpponent === attacker;
  const savedOpponent = next.savedOpponentDice?.round === next.round && next.savedOpponentDice.target === attacker;
  const opponentDice = next.encounter?.speedDiceByTarget?.[attacker] ?? 2;
  const count = controlled ? next.turn.opponentSpeedCount || Math.max(1, opponentDice - (next.turn.opponentSpeedReduction || 0)) : opponentDice;
  next.turn.opponentSpeedDice = savedOpponent ? [...next.savedOpponentDice.dice] : destinyRollOpponentDice(next, count, roll, 'speed');
  if (savedOpponent) next.turn.lockedOpponentDice = true;
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
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  const attacker=destinyAttackerTarget(next);next.target = target;
  if(afterWin&&destinyAttackerTarget(next)!==attacker)throw new RangeError('The chosen target has a different attacker');
  if(!afterWin)next.turn.autoWin = next.autoWinRound === next.round || Boolean(next.encounter?.automaticHitTargets?.includes(target)) || next.encounter?.automaticHitsRemaining > 0;
  return next;
}

export function onDestinyHeroRoundWon(fight,roll){
  if(fight.encounter?.heroWinNextSpeedDice)fight.nextHeroSpeedDice={...fight.encounter.heroWinNextSpeedDice,round:fight.round+1};
  if(fight.encounter?.heroWinTest&&!fight.turn.heroWinTestQueued){fight.turn.heroWinTestQueued=true;queueDestinyEncounterEvent(fight,fight.encounter.heroWinTest,'damage',roll);}
}

export function resolveDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed-rolled']);
  applyDestinyAcceptedHeroRoll(next,next.turn.heroSpeedDice,'speed');reviveDestinyHero(next);
  if(next.encounter?.heroSpeedLossFaces&&next.turn.heroSpeedDice.some(face=>next.encounter.heroSpeedLossFaces.includes(face))){next.encounter.forcedLoss=true;settleDestinyFight(next,roll);return next;}
  for(const rule of next.encounter?.acceptedHeroSpeedFaces||[]){
    const hits=next.turn.heroSpeedDice.filter(face=>rule.faces.includes(face)).length;
    if(!hits)continue;
    const damage=damageDestinyHero(next,rule.amount*(rule.perDie?hits:1));
    next.history.push({type:'roll-hazard',round:next.round,name:rule.name,damage});
  }
  for(const rule of next.encounter?.acceptedSpeedEffects||[])if(next.turn.heroSpeedDice.some(face=>rule.faces.includes(face))){
    if(rule.forceOpponentWin)next.turn.forcedOpponentWin=true;
    if(rule.blockCategories)next.encounter.blockedRounds={from:next.round,until:next.round,categories:[...rule.blockCategories]};
  }
  if(next.hero.health<=0){settleDestinyFight(next,roll);return next;}
  const hero = sum(next.turn.heroSpeedDice) + destinyStat(next, 'hero', 'speed');
  const opponent = sum(next.turn.opponentSpeedDice) + destinyStat(next, destinyAttackerTarget(next), 'speed');
  next.turn.winner = next.turn.forcedOpponentWin ? 'opponent' : next.turn.autoWin ? 'hero' : hero === opponent ? 'standoff' : hero > opponent ? 'hero' : 'opponent';
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
  const event = next.turn.winner === 'opponent' ? next.encounter?.enemyWinTest : null;
  if (event) queueDestinyEncounterEvent(next, event, 'damage', roll);
  return next;
}

export function rollDestinyDamage(fight, roll = randomDie, { soundCharge = true } = {}) {
  const next = stage(fight, ['damage']);
  if(next.turn.enemyFixedDamage!==undefined)throw new RangeError('This opponent attack does not roll for damage');
  if (typeof soundCharge !== 'boolean') throw new RangeError('Choose whether to use the charge damage bonus');
  if (soundCharge && next.turn.winner === 'hero' && next.turn.soundCharge && !next.turn.used.co) {
    next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
    next.turn.used.co = true;
    if (hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  }
  const extra = next.turn.extraDamageDice || 0;
  const damageRule = next.turn.winner === 'opponent' && next.encounter?.opponentDamageRollRules?.find(rule=>rule.target===destinyAttackerTarget(next)&&
    (!rule.requiresAlive||rule.requiresAlive.every(target=>isDestinyOpponentActive(next,target))));
  if(damageRule?.keepHighest)next.turn.damageKeepHighest=damageRule.keepHighest;
  else delete next.turn.damageKeepHighest;
  const count = (next.turn.winner === 'opponent' ? damageRule?.dice || next.encounter?.damageDiceByTarget?.[destinyAttackerTarget(next)] || 1 : next.turn.rangedDamageDice || 1) + extra + (next.turn.winner === 'opponent' && next.turn.reckless ? 1 : 0);
  next.turn.damageDice = next.turn.winner === 'hero' ? dice(roll, count) : destinyRollOpponentDice(next, count, roll, 'damage');
  if(next.turn.winner==='hero'){
    applyDestinyHeroRoll(next,next.turn.damageDice,'damage');
    next.turn.damageDice.push(...destinyScoreExtraDice(next,next.turn.damageDice,roll));
    onDestinyHeroDice(next,next.turn.damageDice);
  }
  if (next.turn.winner === 'opponent') {
    const attacker = destinyAttackerTarget(next);
    if (hasDestinyAbility(next, 'brittle-edge') && isDestinyOpponentActive(next, attacker)) destinyStrike(next, attacker, 2, 'brittle-edge', 'passive');
  }
  if (next.turn.winner === 'opponent' && hasDestinyAbility(next, 'siphon')) {
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
  if(heroWon){applyDestinyAcceptedHeroRoll(next,next.turn.damageDice,'damage');reviveDestinyHero(next);if(next.hero.health<=0){settleDestinyFight(next,roll);return next;}}
  const attacker = destinyAttackerTarget(next);
  const defender = heroWon ? next.opponents[next.target] : next.hero;
  const score = fixed?next.turn.enemyFixedDamage:next.turn.rangedShot ? sum(next.turn.damageDice) : destinyDamageScore(next);
  if(fixed)commitEnemyCharge(next);
  if (heroWon) {
    const sixes = next.turn.damageDice.filter(face => face === 6).length;
    for (const effect of next.effects) if (effect.source === 'creeping-cold') effect.amount += sixes;
  }
  let armour = destinyArmour(next, heroWon ? next.target : 'hero');
  if(fixed)armour=0;
  const piercing=!heroWon&&next.encounter?.opponentIgnoreArmourByTarget?.[attacker];
  if(piercing&&!destinyImmuneToAbility(next,piercing)){
    const protection=next.encounter?.armourThroughPiercing;
    armour=protection&&hasDestinyAbility(next,protection.ability)?Math.ceil(armour/protection.divisor):0;
  }
  if (next.turn.ignoreArmour && (heroWon || !destinyImmuneToAbility(next,next.turn.opponentArmourAbility))) armour = 0;
  // Fatal blow ignores half the armour, rounding the ignored half UP.
  else if (next.turn.halfArmour) armour -= Math.ceil(armour / 2);
  const faceBonus=heroWon?0:(next.encounter?.opponentDamageFaceBonus||[]).filter(rule=>rule.target===attacker).reduce((total,rule)=>total+next.turn.damageDice.filter(face=>rule.faces.includes(face)).length*rule.amount,0);
  const damage = next.turn.avoidDamage || heroWon && !destinyDamageAllowed(next, next.target) ? 0 :
    !heroWon && next.turn.replaceIncomingDamage !== undefined ? next.turn.replaceIncomingDamage : Math.max(0, score - armour)+faceBonus;
  let healthLost = heroWon ? Math.min(defender.health, damage) : damageDestinyHero(next,damage);
  if (heroWon) reflectDestinyDamage(next, next.target, healthLost, 'score');
  if(heroWon)defender.health -= healthLost;
  if(!heroWon&&healthLost&&next.encounter?.extraHeroDamagePerArmour){
    const extra=damageDestinyHero(next,Math.ceil(destinyArmour(next,'hero')/next.encounter.extraHeroDamagePerArmour));
    healthLost+=extra;
  }
  if (heroWon && isDestinyOpponentDead(next, next.target)) recordDestinyDefeat(next, next.target);
  next.turn.damageScore = score;
  next.turn.healthDamage = healthLost;
  if(!heroWon&&healthLost){
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
      }
      if (next.encounter?.heroStatusOnHit) (next.encounter.heroStatuses ??= {})[next.encounter.heroStatusOnHit.name] = next.encounter.heroStatusOnHit.amount;
      if (next.encounter?.growingStatusOnHit && !next.encounter.growingStatus) next.encounter.growingStatus = { ...next.encounter.growingStatusOnHit, from: next.round };
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
  commitEnemyCharge(next);
  if (prepareDestinyEndEvents(next, roll)) return next;
  const alive = next.opponents.map((opponent, target) => isDestinyOpponentActive(next, target));
  const pending = new Map();
  for (const effect of [...destinyPassiveEffects(next, roll), ...(next.turn.encounterEndEffects || []), ...destinyPathEndEffects(next), ...effects]) {
    const target = effect?.target;
    if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || !next.opponents[target])) {
      throw new RangeError('Invalid effect target');
    }
    const amount = integer(effect.amount, 'passive damage');
    if (target !== 'hero' && !effect.allowInactive && (!alive[target] || !destinyDamageAllowed(next, target, 'passive'))) continue;
    const defender = target === 'hero' ? next.hero : next.opponents[target];
    if (typeof effect.ignoreArmour !== 'boolean') throw new RangeError('Specify passive armour handling');
    let damage = Math.max(0, amount - (effect.ignoreArmour ? 0 : destinyArmour(next, target)));
    if (target === 'hero') damage = destinyPassiveProtection(next, damage);
    pending.set(target, (pending.get(target) || 0) + damage);
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
    if(target!=='hero')defender.health = Math.max(0, defender.health - applied);
    if (target !== 'hero' && isDestinyOpponentDead(next, target)) {
      recordDestinyDefeat(next, target);
      next.turn.deaths.push(target);
    }
  }
  const healing = next.effects.filter(effect => effect.kind === 'end-heal' &&
    effect.from <= next.round && effect.until >= next.round).reduce((total, effect) => total + effect.amount, 0) +
    Object.entries(next.abilityCatalog || {}).reduce((total, [name, spec]) =>
      total + (spec.endHeal && hasDestinyAbility(next, name) ? spec.endHeal : 0), 0);
  if (healing || next.turn.encounterEndHealing) healDestinyHero(next, healing + (next.turn.encounterEndHealing || 0));
  for (const effect of next.turn.encounterEndOpponentHealing || []) {
    if (isDestinyOpponentActive(next, effect.target)) next.opponents[effect.target].health = Math.min(next.opponents[effect.target].maxHealth, next.opponents[effect.target].health + effect.amount);
  }
  for (const effect of next.encounter?.regeneration || []) {
    const opponent = next.opponents[effect.target];
    if ((isDestinyOpponentActive(next, effect.target)||effect.revive&&opponent.health===0) && !effect.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) {
      opponent.health = Math.min(effect.uncapped ? Number.MAX_SAFE_INTEGER : opponent.maxHealth, opponent.health + effect.amount);
    }
  }
  const periodic=next.encounter?.periodicObjectiveStrike;
  if(periodic&&next.round%periodic.every===0)next.opponents[periodic.source].health=periodic.resetHealth;
  for (const effect of next.encounter?.endArmourGrowth || []) {
    const opponent = next.opponents[effect.target];
    if (isDestinyOpponentActive(next, effect.target) && opponent.armour < effect.maximum) opponent.armour = Math.min(effect.maximum, opponent.armour + effect.amount);
  }
  for(const rule of next.encounter?.endAttributeGrowth||[]){
    const opponent=next.opponents[rule.target];
    if(isDestinyOpponentActive(next,rule.target))opponent[rule.attribute]=Math.min(rule.maximum??Number.MAX_SAFE_INTEGER,opponent[rule.attribute]+rule.amount);
  }
  for (const effect of next.encounter?.endStats || []) {
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
  if (next.encounter?.lossAfterRound && next.round >= next.encounter.lossAfterRound && next.opponents.some(opponent => opponent.health > 0)) next.encounter.forcedLoss = true;
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
  const resume = next.encounter?.pathProgress || next.encounter?.sequenceRemaining > 0 ? 'encounter-start' : 'start';
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

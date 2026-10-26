// Atomic simulator state updates shared by desktop and mobile panels. Rendering
// never calls these operations to migrate or restart a saved fight.
import * as combat from './core.js';
import * as abilities from './abilities.js';
import * as path from './path-challenge.js';
import {resolveDestinyAbilityRoll,finishDestinyAbilityAction} from './ability-rolls.js';
import {rerollDestinyScoreDice} from './catalog-dice.js';
import {continueDestinySustainedDamage,removeDestinyCombatStance} from './sustained.js';
import {applyDestinyChallengeAction} from './challenges.js';
import {createWinterFight, useWinterAction} from './winters-fury.js';
import {createDestinyCharacter, attachDestinyCharacter, recordDestinyOutcome, resolveDestinyRingLoss} from './character.js';
import {applyDestinyTravelAction} from './travel-rules.js';
import {setDestinyPassiveActivation} from './ability-quota.js';
import {attachDestinyAlly} from './allies.js';
import {enableDestinyTeam,destinyTeamHero,switchDestinyTeamHero} from './team-state.js';
import {startDestinyTeamRound,rollDestinyTeamSpeed,resolveDestinyTeamSpeed,useDestinyTeamAbility,rollDestinyTeamDamage,resolveDestinyTeamDamage,resolveDestinyTeamAbilityRoll,continueDestinyTeamCombat} from './team-combat.js';
import {endDestinyTeamRound} from './team-end.js';
import {chooseDestinyAutomaticModifier} from './automatic-modifiers.js';
import {resolveDestinyItemLoss,applyDestinyItemLossToSetup} from './shared-item-loss.js';
import {advanceDestinyEnemyAbilities,resolveAndAdvanceDestinyEnemy} from './enemy-execution.js';
import {respondToDestinyEnemy,resumeDestinyEnemyResponse} from './enemy-response.js';

export function createDestinySession(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid simulator session');
  const next = structuredClone(input);
  next.character ??= createDestinyCharacter();
  next.setup ??= {};
  next.fight ??= null;
  next.history ??= [];
  return next;
}

export function beginDestinySession(session, setup, {roster, outcomeId, catalog, bookRules, createFight = createWinterFight} = {}) {
  if(setup.teamEnabled!==undefined&&typeof setup.teamEnabled!=='boolean')throw new RangeError('Choose solo or two-hero combat');
  if (session.challenge?.status === 'active') throw new RangeError('Finish the active challenge first');
  if (session.fight?.status === 'active') throw new RangeError('Finish the active fight before changing setup');
  if (session.fight && !session.character?.outcomeIds?.includes(session.fightId)) throw new RangeError('Record the finished outcome before starting again');
  if (typeof outcomeId !== 'string' || !outcomeId || outcomeId.length > 128 || session.character?.outcomeIds?.includes(outcomeId)) throw new RangeError('Choose a new outcome identifier');
  const next = createDestinySession(session);
  next.setup = structuredClone(setup);
  const inventory = setup.abilities ?? next.character.abilities ?? {};
  const owned = Object.fromEntries(Object.entries(inventory).filter(([, count]) => count !== 0));
  const equipment = setup.equipment ?? next.character.equipment ?? {};
  next.character = createDestinyCharacter({...next.character, attributes: setup.hero, abilities: owned, equipment});
  const options = {abilities: owned, equipment, character: next.character,
    roster, catalog, bookRules, encounterOptions:structuredClone(setup.encounterOptions||{}), fimbulwinter: !!setup.fimbulwinter, bannerLit: !!setup.bannerLit, roughRide: !!setup.roughRide};
  if (setup.section) next.fight = createFight(setup.hero, setup.section, options);
  else next.fight = attachDestinyCharacter(abilities.configureDestinyAbilities(
    combat.createDestinyFight(setup.hero, setup.opponents), options.abilities, options.equipment, { catalog, bookRules }), next.character);
  if(setup.teamEnabled){
    if(!setup.ally?.hero)throw new RangeError('Configure the second hero before starting team combat');
    const ally=setup.ally;
    const companion=attachDestinyCharacter(abilities.configureDestinyAbilities(
      combat.createDestinyFight(ally.hero,next.fight.opponents),ally.abilities||{},ally.equipment||{}, {catalog,bookRules}),
      {...ally.character,attributes:ally.hero,abilities:ally.abilities||{},equipment:ally.equipment||{}});
    next.fight=enableDestinyTeam(attachDestinyAlly(next.fight,companion));
  }
  next.fightId = outcomeId;
  delete next.challenge;
  delete next.outcome;
  return next;
}

export function applyDestinySessionAction(session, action, payload = {}, {roster, roll, timestamp = Date.now(), useBookAction = useWinterAction, catalog} = {}) {
  if(action==='story-action'){
    const owner=session.fight?.team?destinyTeamHero(session.fight,0):session.fight;
    const source=session.fight?.team&&session.fight.status!=='active'?{...session,fight:switchDestinyTeamHero(session.fight,0)}:session;
    return applyDestinyTravelAction(source,payload.name,payload.options,catalog??owner?.abilityCatalog);
  }
  if (action.startsWith('challenge-')) return applyDestinyChallengeAction(session, action, {roll,timestamp});
  const next = createDestinySession(session);
  let fight=next.fight;
  if (!fight) throw new RangeError('Start a fight first');
  if(fight.team&&['record-outcome','ring-loss'].includes(action)){fight=switchDestinyTeamHero(fight,0);next.fight=fight;}
  const options = payload.options || {};
  switch (action) {
    case 'team-attach': next.fight=enableDestinyTeam(attachDestinyAlly(fight,payload.ally));break;
    case 'team-select': next.fight=switchDestinyTeamHero(fight,payload.actor);break;
    case 'cancel-fight':
      if (fight.status !== 'active' || fight.round !== 0 || fight.history.length || Object.keys(fight.used).length) throw new RangeError('Only an untouched fight can be cancelled');
      next.fight = null;
      delete next.fightId;
      delete next.outcome;
      return next;
    case 'concede':
      if (fight.status !== 'active') throw new RangeError('This fight has already finished');
      (next.fight.encounter ??= {}).forcedLoss = true;
      combat.settleDestinyFight(next.fight, roll);
      break;
    case 'start-round': next.fight = fight.team?startDestinyTeamRound(fight,payload.roles,payload.target,roll):combat.startDestinyRound(fight, payload.target, roll, options); break;
    case 'approach-roll': next.fight=combat.rollDestinyApproachTest(fight,roll);break;
    case 'next-combat': next.fight = fight.team?continueDestinyTeamCombat(fight):combat.continueDestinyCombat(fight); break;
    case 'retarget': next.fight = combat.retargetDestinyRound(fight, payload.target); break;
    case 'roll-speed': next.fight = fight.team?rollDestinyTeamSpeed(fight,payload.actor??fight.team.active,roll):combat.rollDestinySpeed(fight, roll); break;
    case 'resolve-speed': next.fight = fight.team?resolveDestinyTeamSpeed(fight,{actor:payload.winnerActor},roll):combat.resolveDestinySpeed(fight, roll); break;
    case 'roll-damage': next.fight = fight.team?rollDestinyTeamDamage(fight,roll,options):combat.rollDestinyDamage(fight, roll, options); break;
    case 'score-reroll': next.fight=finishDestinyAbilityAction(rerollDestinyScoreDice(fight,payload.dice,roll),roll);break;
    case 'continue-ability': next.fight=continueDestinySustainedDamage(fight,options,roll);break;
    case 'remove-stance': next.fight=removeDestinyCombatStance(fight);break;
    case 'resolve-damage': next.fight = fight.team?resolveDestinyTeamDamage(fight,roll):combat.resolveDestinyDamage(fight, roll); break;
    case 'end-round': next.fight = fight.team?endDestinyTeamRound(fight,roll):combat.endDestinyRound(fight, payload.effects || [], roll, options); break;
    case 'skip-death-move': next.fight = combat.skipDestinyDeathMove(fight); break;
    case 'opening-test': next.fight = combat.rollDestinyOpeningTest(fight, roll); break;
    case 'sequence-test': next.fight = combat.rollDestinySequenceTest(fight, roll); break;
    case 'begin-path': next.fight = path.beginDestinyPath(fight, payload.placements, payload.additionalOrbs); break;
    case 'advance-path': next.fight = path.advanceDestinyPath(fight); break;
    case 'path-orb': next.fight = path.useDestinyPathOrb(fight, payload.socket, payload.target); break;
    case 'ability': next.fight = fight.team?useDestinyTeamAbility(fight,payload.actor??fight.team.active,payload.name,options,roll):fight.phase==='enemy-ability'?respondToDestinyEnemy(fight,payload.name,options,roll):abilities.useDestinyAbility(fight, payload.name, options, roll); break;
    case 'passive-activation': next.fight=setDestinyPassiveActivation(fight,payload.name,payload.enabled);break;
    case 'backpack-item': next.fight = abilities.useDestinyBackpackItem(fight,payload.index,roll); break;
    case 'potion-modifier': next.fight = abilities.useDestinyPotionModifier(fight,payload.attribute,roll); break;
    case 'resolve-ability': next.fight = fight.team?resolveDestinyTeamAbilityRoll(fight,roll,{roster}):resolveDestinyAbilityRoll(fight, roll, {roster}); break;
    case 'resolve-enemy-ability': next.fight=resolveAndAdvanceDestinyEnemy(fight,roll);break;
    case 'automatic-choice':
      next.fight=finishDestinyAbilityAction(chooseDestinyAutomaticModifier(fight,payload.attribute??null),roll);
      if(next.fight.team&&next.fight.team.active===next.fight.team.roundWinner&&next.fight.phase==='end')next.fight.team.stage='end';
      break;
    case 'defeat-choice': next.fight = abilities.resolveDestinyDefeatChoice(fight, payload.target, roll); break;
    case 'damage-choice': next.fight = abilities.resolveDestinyDamageChoice(fight, payload.target, roll); break;
    case 'sacrifice-choice': next.fight = abilities.resolveDestinyAbilitySacrifice(fight, payload.name ?? null, roll); break;
    case 'gambit-choice': next.fight = abilities.resolveDestinyGambit(fight, payload.name ?? null); break;
    case 'shared-item-loss': next.fight=resolveDestinyItemLoss(fight,payload.receipt,options,roll);applyDestinyItemLossToSetup(next.setup,options);break;
    case 'book-action': next.fight = useBookAction(fight, payload.name, {...options, roster}, roll); break;
    case 'record-outcome': {
      const character = fight.character || next.character;
      const result = recordDestinyOutcome(character, fight, next.fightId, roll);
      next.character = result.character;
      if(fight.team&&result.recorded){
        fight.team.rewardEligibility={0:result.teamLootEligible??null};
        fight.team.allyOutcomes={};
        for(const ally of fight.allies){
          const context=switchDestinyTeamHero(fight,ally.teamActorId);
          const allyResult=recordDestinyOutcome(ally.character||{},context,next.fightId,roll);
          ally.character=allyResult.character;
          if(allyResult.recorded&&fight.status==='loss'&&fight.encounter?.recoverOnDefeat){
            const penalty=ally.effects.filter(effect=>effect.kind==='health-penalty').reduce((sum,effect)=>sum+effect.amount,0);
            ally.character.attributes={...ally.character.attributes,health:ally.hero.maxHealth+penalty};
          }
          fight.team.rewardEligibility[ally.teamActorId]=allyResult.teamLootEligible??null;
          fight.team.allyOutcomes[ally.teamActorId]=Object.fromEntries(Object.entries(allyResult).filter(([key])=>key!=='character'));
        }
      }
      const preserveHealth=(fight.encounter?.persistHeroHealth||fight.encounter?.carryHeroHealth)&&['win','retreat'].includes(fight.status);
      const recoverHealth=fight.encounter?.recoverOnDefeat&&fight.status==='loss';
      if(result.recorded&&(preserveHealth||recoverHealth)){
        const penalty=fight.effects.filter(effect=>effect.kind==='health-penalty').reduce((sum,effect)=>sum+(fight.status==='loss'?effect.amount:effect.healthRemoved),0);
        const health=(fight.status==='loss'?fight.hero.maxHealth:fight.hero.health)+penalty;
        next.setup.hero={...next.setup.hero,health};
        next.character.attributes={...next.character.attributes,health};
      }
      if(result.recorded){
        const recoverArmour=fight.status==='loss'&&fight.encounter?.recoverArmourOnDefeat||fight.status==='win'&&fight.encounter?.recoverArmourOnVictory;
        const armour=recoverArmour ? character.combatRecovery?.armour ?? fight.hero.normal.armour :
          fight.status==='win'&&fight.encounter?.persistHeroArmour ? fight.encounter.remainingHeroArmour : undefined;
        if(armour!==undefined){next.setup.hero={...next.setup.hero,armour};next.character.attributes={...next.character.attributes,armour};}
      }
      next.fight.character = structuredClone(next.character);
      if (result.recorded || !next.outcome) next.outcome = Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'character'));
      if (result.recorded) {
        const ts=Math.max(timestamp,next.history.reduce((max,entry)=>Math.max(max,entry.ts??entry.timestamp??0),0)+1);
        next.history.push({id: next.fightId, section: fight.encounter?.sourceSection ?? null,
          opponents: fight.opponents.map(opponent => opponent.name), outcome: fight.status, timestamp, ts});
      }
      return next;
    }
    case 'ring-loss': {
      const result = resolveDestinyRingLoss(next.character, payload.slot ?? null);
      next.character = result.character;
      next.fight.character = structuredClone(next.character);
      next.setup.hero = structuredClone(next.character.attributes ?? next.setup.hero);
      next.setup.equipment = structuredClone(next.character.equipment ?? next.setup.equipment ?? {});
      next.setup.abilities = structuredClone(next.character.abilities ?? next.setup.abilities ?? {});
      return next;
    }
    default: throw new RangeError('Unknown simulator action');
  }
  next.fight=advanceDestinyEnemyAbilities(resumeDestinyEnemyResponse(next.fight),roll);
  const owner=next.fight.team?destinyTeamHero(next.fight,0):next.fight;
  if (owner.character) {
    next.character = structuredClone(owner.character);
    next.character.equipment = structuredClone(owner.equipment);
    next.setup.equipment = structuredClone(next.character.equipment);
    owner.character = structuredClone(next.character);
  }
  if(owner.clearedCurses&&next.setup.abilities)for(const name of owner.clearedCurses)delete next.setup.abilities[name];
  return next;
}


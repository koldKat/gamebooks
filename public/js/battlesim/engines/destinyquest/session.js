// Atomic simulator state updates shared by desktop and mobile panels. Rendering
// never calls these operations to migrate or restart a saved fight.
import * as combat from './core.js';
import * as abilities from './abilities.js';
import * as path from './path-challenge.js';
import {resolveDestinyAbilityRoll} from './ability-rolls.js';
import {applyDestinyChallengeAction} from './challenges.js';
import {createWinterFight, useWinterAction} from './winters-fury.js';
import {createDestinyCharacter, attachDestinyCharacter, recordDestinyOutcome, resolveDestinyRingLoss} from './character.js';

export function createDestinySession(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid simulator session');
  const next = structuredClone(input);
  next.character ??= createDestinyCharacter();
  next.setup ??= {};
  next.fight ??= null;
  next.history ??= [];
  return next;
}

export function beginDestinySession(session, setup, {roster, outcomeId} = {}) {
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
    roster, fimbulwinter: !!setup.fimbulwinter, bannerLit: !!setup.bannerLit, roughRide: !!setup.roughRide};
  if (setup.section) next.fight = createWinterFight(setup.hero, setup.section, options);
  else next.fight = attachDestinyCharacter(abilities.configureDestinyAbilities(
    combat.createDestinyFight(setup.hero, setup.opponents), options.abilities, options.equipment), next.character);
  next.fightId = outcomeId;
  delete next.challenge;
  delete next.outcome;
  return next;
}

export function applyDestinySessionAction(session, action, payload = {}, {roster, roll, timestamp = Date.now()} = {}) {
  if (action.startsWith('challenge-')) return applyDestinyChallengeAction(session, action, {roll,timestamp});
  const next = createDestinySession(session), fight = next.fight;
  if (!fight) throw new RangeError('Start a fight first');
  const options = payload.options || {};
  switch (action) {
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
    case 'start-round': next.fight = combat.startDestinyRound(fight, payload.target, roll, options); break;
    case 'retarget': next.fight = combat.retargetDestinyRound(fight, payload.target); break;
    case 'roll-speed': next.fight = combat.rollDestinySpeed(fight, roll); break;
    case 'resolve-speed': next.fight = combat.resolveDestinySpeed(fight, roll); break;
    case 'roll-damage': next.fight = combat.rollDestinyDamage(fight, roll, options); break;
    case 'resolve-damage': next.fight = combat.resolveDestinyDamage(fight, roll); break;
    case 'end-round': next.fight = combat.endDestinyRound(fight, payload.effects || [], roll, options); break;
    case 'skip-death-move': next.fight = combat.skipDestinyDeathMove(fight); break;
    case 'opening-test': next.fight = combat.rollDestinyOpeningTest(fight, roll); break;
    case 'sequence-test': next.fight = combat.rollDestinySequenceTest(fight, roll); break;
    case 'begin-path': next.fight = path.beginDestinyPath(fight, payload.placements, payload.additionalOrbs); break;
    case 'advance-path': next.fight = path.advanceDestinyPath(fight); break;
    case 'path-orb': next.fight = path.useDestinyPathOrb(fight, payload.socket, payload.target); break;
    case 'ability': next.fight = abilities.useDestinyAbility(fight, payload.name, options, roll); break;
    case 'resolve-ability': next.fight = resolveDestinyAbilityRoll(fight, roll, {roster}); break;
    case 'defeat-choice': next.fight = abilities.resolveDestinyDefeatChoice(fight, payload.target, roll); break;
    case 'sacrifice-choice': next.fight = abilities.resolveDestinyAbilitySacrifice(fight, payload.name ?? null, roll); break;
    case 'gambit-choice': next.fight = abilities.resolveDestinyGambit(fight, payload.name ?? null); break;
    case 'book-action': next.fight = useWinterAction(fight, payload.name, {...options, roster}, roll); break;
    case 'record-outcome': {
      const character = fight.character || next.character;
      const result = recordDestinyOutcome(character, fight, next.fightId, roll);
      next.character = result.character;
      next.fight.character = structuredClone(result.character);
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
  if (next.fight.character) {
    next.character = structuredClone(next.fight.character);
    next.character.equipment = structuredClone(next.fight.equipment);
    next.setup.equipment = structuredClone(next.character.equipment);
    next.fight.character = structuredClone(next.character);
  }
  return next;
}


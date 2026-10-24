// Explicit printed exceptions for The Eye of Winter's Fury. The shared combat
// engine consumes their declarative effects without branching on a book ID.
import { hasDestinyAbility } from './effects.js';
import { destinyVendorPrice } from './character.js';
import { winterRosterFor } from './winters-fury-roster.js';
import { createDestinyFight, settleDestinyFight } from './core.js';
import { configureDestinyAbilities } from './abilities.js';
import { attachDestinyCharacter } from './character.js';
import { destinyStrike, addDestinyStatEffect } from './effects.js';
import { destinyDie } from './damage.js';

export const WINTER_IMPLEMENTED_ENCOUNTERS = Object.freeze(['30', '34', '37', '49', '54', '70', '76', '91', '100', '118', '135', '141', '152', '166', '167', '184', '187', '194']);

export function winterChallenge(fight, section, { leif = false } = {}) {
  const hooks = hasDestinyAbility(fight, 'ice-hooks');
  if (String(section) === '35') return { turns: hooks ? 5 : 7, threshold: 15, rollBonus: leif ? 2 : 0 };
  if (String(section) === '67') return { threshold: hooks ? 8 : 14, rollBonus: 0 };
  throw new RangeError('Unknown climbing challenge');
}

export function configureWinterEncounter(fight, section) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start') throw new RangeError('Choose the encounter before combat');
  const next = structuredClone(fight);
  const insulated = hasDestinyAbility(next, 'insulated');
  const rules = { sourceSection: String(section) };
  switch (String(section)) {
    case '30': case '34': break;
    case '37': case '54':
      rules.rerollOnesByTarget = [0];
      rules.endEffects = [{ target: 0, amount: 1 }];
      break;
    case '49': rules.outnumbered = true; break;
    case '70': rules.fleeAtHealth = { 0: 10 }; break;
    case '76': rules.onDeathStatChanges = [0, 1].map(target => ({ dead: 1 - target, target, changes: { speed: 1, brawn: 1 } })); break;
    case '91': rules.initialStats = [{ target: 'hero', attribute: 'speed', amount: -1, from: 1, until: 2 }]; break;
    case '100': case '194': rules.outnumbered = true; break;
    case '118':
      rules.resources = { candles: 16 };
      rules.roundDamagePerLivingOpponent = 1;
      rules.roundDamageResource = 'candles';
      break;
    case '135':
      rules.endEffects = [{ target: 'hero', amount: 2 }];
      rules.startStats = [{ round: 3, target: 0, changes: { armour: 3, speed: -1 } }];
      break;
    case '141':
      rules.onDeathSetStats = [{ dead: 2, target: 0, attribute: 'speed', value: 3 }, { dead: 2, target: 1, attribute: 'speed', value: 3 }];
      rules.blockAbilitiesWhileAlive = [{ target: 0, categories: ['sp', 'co'] }];
      rules.endEffects = [{ target: 'hero', amount: 2, requiresAlive: [1] }];
      break;
    case '152': rules.deathDamageByTarget = Object.fromEntries(next.opponents.map((_, index) => [index, 4])); break;
    case '154': if (insulated) rules.scoreReductionByTarget = { 0: 3 }; break;
    case '166': rules.initialStats = [{ target: 0, attribute: 'speed', set: 0, from: 1, until: 2 }]; break;
    case '167':
      rules.statWhileAlive = [{ alive: 1, target: 'hero', attribute: 'speed', amount: -1 }];
      rules.endEffects = [{ target: 'hero', amount: 2, requiresAlive: [0] }];
      break;
    case '184':
      rules.outnumbered = true;
      rules.regeneration = [{ target: 0, amount: 2 }];
      rules.endArmourGrowth = [{ target: 1, amount: 1, maximum: 5 }, { target: 2, amount: 1, maximum: 5 }];
      break;
    case '187':
      rules.outnumbered = true;
      rules.regeneration = next.opponents.map((_, target) => ({ target, amount: 2 }));
      rules.blockAbilitiesWhileAlive = [{ target: 0, categories: ['mo'] }];
      break;
    case '292': rules.deathDamageByTarget = Object.fromEntries(next.opponents.slice(1).map((_, index) => [index + 1, insulated ? 2 : 5])); break;
    case '565': if (!insulated) rules.mirrorBonusTarget = 0; break;
    case '578': rules.roundDamagePerLivingOpponent = insulated ? 0 : 1; break;
    case '599': if (insulated) rules.scoreReductionByTarget = { 0: 2 }; break;
    case '615': rules.roundDamagePerLivingOpponent = insulated ? 1 : 2; break;
    default: throw new RangeError('Unsupported encounter exception');
  }
  next.encounter = rules;
  rules.implementation = WINTER_IMPLEMENTED_ENCOUNTERS.includes(String(section)) ? 'complete' : 'partial';
  for (const effect of rules.initialStats || []) next.effects.push({ kind: 'stat', ...effect, source: 'encounter' });
  return next;
}

export function createWinterFight(hero, section, { abilities = {}, equipment = {}, character = null } = {}) {
  if (!WINTER_IMPLEMENTED_ENCOUNTERS.includes(String(section))) throw new RangeError('This encounter still needs its complete rules adapter');
  const preset = winterRosterFor(section);
  const parts = preset.parts.filter(part => String(section) === '118' ? part.role === 'opponent' : true);
  if (parts.some(part => part.role !== 'opponent')) throw new RangeError('This encounter requires its dedicated component adapter');
  const opponents = parts.map(part => {
    const enemy = { name: part.name, speed: part.speed, armour: part.armour, health: part.health, damageStat: part.damageStat };
    for (const key of ['brawn', 'magic']) if (part[key] !== undefined) enemy[key] = part[key];
    return enemy;
  });
  let fight = configureDestinyAbilities(createDestinyFight(hero, opponents), abilities, equipment);
  if (character) fight = attachDestinyCharacter(fight, character);
  fight = configureWinterEncounter(fight, section);
  return fight;
}

export function useWinterAction(fight, action, { count = 1 } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active') throw new RangeError('No active encounter');
  const next = structuredClone(fight);
  const section = next.encounter?.sourceSection;
  if (action === 'smash-ice') {
    if (section !== '49' || next.phase !== 'damage' || next.turn.winner !== 'hero') throw new RangeError('Win a round against an ice tomb first');
    addDestinyStatEffect(next, next.target, 'armour', -4, null, action);
    next.encounter.smashedIce = true;
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  } else if (action === 'snuff-candles') {
    if (section !== '118' || next.phase !== 'damage' || next.turn.winner !== 'hero' || !(next.encounter.resources.candles > 0)) throw new RangeError('Win a round while candles remain');
    next.turn.pendingAbility = { type: 'resource', name: action, dice: [destinyDie(roll), destinyDie(roll)], returnPhase: 'end',
      resource: 'candles', onZeroStats: next.opponents.map((_, target) => ({ target, changes: { magic: -1, armour: -1 } })), options: {} };
    next.turn.normalDamageReplaced = true;
    next.phase = 'ability-rolled';
  } else if (action === 'tar-barrels') {
    if (!['141', '184'].includes(section) || next.phase !== 'end' || !Number.isInteger(count) || count < 1 ||
        count + (next.turn.tarBarrelsUsed || 0) > 4 || !(next.character?.tarBarrels >= count)) throw new RangeError('Choose up to four available tar barrels at round end');
    next.character.tarBarrels -= count;
    next.turn.tarBarrelsUsed = (next.turn.tarBarrelsUsed || 0) + count;
    next.opponents.forEach((opponent, target) => {
      if (opponent.health > 0) destinyStrike(next, target, count, action, 'passive');
    });
  } else throw new RangeError('Unknown encounter action');
  settleDestinyFight(next);
  return next;
}

export function winterSalePrice(fight, price, { quantity = 1, hide = false } = {}) {
  if (typeof hide !== 'boolean') throw new RangeError('Specify whether these are hides');
  return destinyVendorPrice(price, { quantity, persuade: hasDestinyAbility(fight, 'persuade'),
    trapperHide: hide && fight.character?.career === 'trapper' });
}

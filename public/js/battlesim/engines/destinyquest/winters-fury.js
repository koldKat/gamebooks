// Explicit printed exceptions for The Eye of Winter's Fury. The shared combat
// engine consumes their declarative effects without branching on a book ID.
import { hasDestinyAbility, destinyStat } from './effects.js';
import { destinyVendorPrice } from './character.js';
import { winterRosterFor } from './winters-fury-roster.js';
import { destinyEncounterSettings, destinyEncounterAction } from './encounter-settings.js';
import { createDestinyFight, settleDestinyFight } from './core.js';
import { configureDestinyAbilities } from './abilities.js';
import { attachDestinyCharacter } from './character.js';
import { destinyStrike, addDestinyStatEffect } from './effects.js';
import { destinyDie } from './damage.js';

export const WINTER_IMPLEMENTED_ENCOUNTERS = Object.freeze(['30', '34', '37', '41', '48', '49', '54', '70', '76', '83', '85', '91', '100', '101', '107', '118', '135', '141', '152', '154', '159', '166', '167', '174', '175', '184', '187', '194', '202', '211', '216', '236', '271', '272', '275', '292', '293', '300', '311', '316', '318', '325', '333', '337', '340', '348', '371', '372', '375', '379', '387', '402', '407', '419', '435', '436', '447', '459', '467', '468', '475', '485', '516', '533', '542', '548', '556', '565', '567', '578', '580', '590', '594', '597', '599', '600', '601', '603', '615', '619', '626', '635', '655', '666', '668', '672', '681', '693', '698', '702', '703', '716', '729', '737', '741', '751', '752', '767', '777']);

export function winterChallenge(fight, section, { roster, leif = false, useOptionalAbilities = true } = {}) {
  if (!Array.isArray(roster)) throw new TypeError('Load the book roster before selecting a challenge');
  const challenge = roster.find(entry => entry.challenges?.[String(section)])?.challenges[String(section)];
  if (!challenge) throw new RangeError('Unknown climbing challenge');
  const context = structuredClone(fight);
  if (!useOptionalAbilities) for (const name of challenge.optionalAbilities || []) context.abilities[name] = 0;
  return destinyEncounterSettings(context, { adapter: challenge }, { leif: !!leif });
}

export function configureWinterEncounter(fight, section, { roster, fimbulwinter = false, bannerLit = false, roughRide = false } = {}) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start') throw new RangeError('Choose the encounter before combat');
  if (Object.keys(fight.used).length) throw new RangeError('Choose the encounter before opening abilities');
  if (typeof fimbulwinter !== 'boolean') throw new RangeError('Specify whether the Titan shield is present');
  if (typeof bannerLit !== 'boolean') throw new RangeError('Specify whether the tower banner was lit');
  if (typeof roughRide !== 'boolean') throw new RangeError('Specify whether to use the rough ride advantage');
  const next = structuredClone(fight);
  for (const [name, original] of Object.entries(next.encounter?.grantOriginalCounts || {})) {
    if (original === null) delete next.abilities[name];
    else next.abilities[name] = original;
  }
  const preset = winterRosterFor(roster, section);
  const rules = destinyEncounterSettings(next, preset, { fimbulwinter, bannerLit, roughRide });
  rules.sourceSection = String(section);
  rules.implementation = 'complete';
  next.encounter = rules;
  for (const [name, grant] of Object.entries(rules.grantedAbilities || {})) {
    (rules.grantOriginalCounts ??= {})[name] = next.abilities[name] ?? null;
    next.abilities[name] = Math.max(next.abilities[name] || 0, grant.count);
  }
  if (rules.sequence || rules.openingTest) next.phase = 'encounter-start';
  if (rules.pathChallenge) next.phase = 'encounter-setup';
  for (const effect of rules.initialStats || []) next.effects.push({ kind: 'stat', ...effect, source: 'encounter' });
  for (const change of rules.initialHealthReductions || []) {
    const opponent = next.opponents[change.target];
    opponent.health = Math.max(1, opponent.health - change.amount);
    opponent.maxHealth = Math.max(1, opponent.maxHealth - change.amount);
  }
  return next;
}

export function createWinterFight(hero, section, { roster, abilities = {}, equipment = {}, character = null, fimbulwinter = false, bannerLit = false, roughRide = false } = {}) {
  if (!WINTER_IMPLEMENTED_ENCOUNTERS.includes(String(section))) throw new RangeError('This encounter still needs its complete rules adapter');
  const preset = winterRosterFor(roster, section);
  const parts = preset.parts.filter(part => !preset.adapter?.selectRoles || preset.adapter.selectRoles.includes(part.role));
  if (parts.some(part => part.role !== 'opponent') && !preset.adapter?.allowComponents) throw new RangeError('This encounter requires its dedicated component adapter');
  const opponents = parts.map(part => {
    const enemy = { name: part.name, speed: part.speed, armour: part.armour, health: part.health, damageStat: part.damageStat };
    if (part.role !== 'opponent') enemy.role = part.role;
    for (const key of ['brawn', 'magic']) if (part[key] !== undefined) enemy[key] = part[key];
    return enemy;
  });
  let fight = configureDestinyAbilities(createDestinyFight(hero, opponents), abilities, equipment);
  if (character) fight = attachDestinyCharacter(fight, character);
  fight = configureWinterEncounter(fight, section, { roster, fimbulwinter, bannerLit, roughRide });
  return fight;
}

export function useWinterAction(fight, action, { roster, count = 1 } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active') throw new RangeError('No active encounter');
  const next = structuredClone(fight);
  const settings = destinyEncounterAction(next, winterRosterFor(roster, next.encounter?.sourceSection), action);
  if (action === 'smash-ice') {
    if (next.phase !== 'damage' || next.turn.winner !== 'hero') throw new RangeError('Win a round against an ice tomb first');
    addDestinyStatEffect(next, next.target, 'armour', -settings.armourLoss, null, action);
    next.encounter.smashedIce = true;
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  } else if (action === 'remove-acorn') {
    if (next.phase !== 'damage' || next.turn.winner !== 'hero' || next.encounter.acornsRemoved >= settings.maximum) throw new RangeError('Win a round with an acorn remaining');
    next.turn.pendingAbility = { type: 'encounter', name: settings.name, event: { name: settings.name, kind: settings.kind }, dice: Array.from({ length: settings.dice }, () => destinyDie(roll)), returnPhase: 'end', options: {} };
    next.turn.normalDamageReplaced = true;
    next.phase = 'ability-rolled';
  } else if (action === 'avoid-splinters') {
    const pending = next.turn?.pendingAbility;
    if (next.phase !== 'ability-rolled' || pending?.event?.kind !== settings.eventKind || pending.event.avoided ||
        destinyStat(next, 'hero', settings.attribute) < settings.cost) throw new RangeError('Spend an available speed point during the splinter shower');
    addDestinyStatEffect(next, 'hero', settings.attribute, -settings.cost, null, action);
    pending.event.avoided = true;
  } else if (action === 'snuff-candles') {
    if (next.phase !== 'damage' || next.turn.winner !== 'hero' || !(next.encounter.resources[settings.resource] > 0)) throw new RangeError('Win a round while candles remain');
    next.turn.pendingAbility = { type: 'resource', name: action, dice: Array.from({ length: settings.dice }, () => destinyDie(roll)), returnPhase: 'end',
      resource: settings.resource, onZeroStats: settings.onZeroStats, options: {} };
    next.turn.normalDamageReplaced = true;
    next.phase = 'ability-rolled';
  } else if (action === 'tar-barrels') {
    if (next.phase !== 'end' || !Number.isInteger(count) || count < 1 ||
        count + (next.turn.tarBarrelsUsed || 0) > settings.perRoundLimit || !Number.isSafeInteger(next.character?.[settings.resource]) || !(next.character[settings.resource] >= count)) throw new RangeError(`Choose up to ${settings.perRoundLimit} available tar barrels at round end`);
    next.character[settings.resource] -= count;
    next.turn.tarBarrelsUsed = (next.turn.tarBarrelsUsed || 0) + count;
    next.opponents.forEach((opponent, target) => {
      if (opponent.health > 0) destinyStrike(next, target, count * settings.damagePerItem, action, 'passive');
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

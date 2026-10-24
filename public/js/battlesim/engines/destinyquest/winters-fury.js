// Explicit printed exceptions for The Eye of Winter's Fury. The shared combat
// engine consumes their declarative effects without branching on a book ID.
import { hasDestinyAbility } from './effects.js';
import { destinyVendorPrice } from './character.js';

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
    case '154': if (insulated) rules.scoreReductionByTarget = { 0: 3 }; break;
    case '292': rules.deathDamageByTarget = { 1: insulated ? 2 : 5, 2: insulated ? 2 : 5 }; break;
    case '565': if (!insulated) rules.mirrorBonusTarget = 0; break;
    case '578': rules.roundDamagePerLivingOpponent = insulated ? 0 : 1; break;
    case '599': if (insulated) rules.scoreReductionByTarget = { 0: 2 }; break;
    case '615': rules.roundDamagePerLivingOpponent = insulated ? 1 : 2; break;
    default: throw new RangeError('Unsupported encounter exception');
  }
  next.encounter = rules;
  return next;
}

export function winterSalePrice(fight, price, { quantity = 1, hide = false } = {}) {
  if (typeof hide !== 'boolean') throw new RangeError('Specify whether these are hides');
  return destinyVendorPrice(price, { quantity, persuade: hasDestinyAbility(fight, 'persuade'),
    trapperHide: hide && fight.character?.career === 'trapper' });
}

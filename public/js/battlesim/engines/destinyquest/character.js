import { destinyDie } from './damage.js';

export const DESTINY_PENALTIES = Object.freeze({
  1: 'weeping-wounds', 2: 'crippled', 3: 'head-blow',
  4: 'fingerless', 5: 'nervous-twitch', 6: 'chronic-convulsions',
});
const persistent = Object.values(DESTINY_PENALTIES).filter(name => name !== 'fingerless');

export function createDestinyCharacter(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid character');
  const next = structuredClone(input);
  next.defeats ??= 0;
  if (!Number.isSafeInteger(next.defeats) || next.defeats < 0 || next.defeats > 1000000) throw new RangeError('Invalid defeat count');
  next.nextPenaltyAt ??= (Math.floor(next.defeats / 5) + 1) * 5;
  if (!Number.isSafeInteger(next.nextPenaltyAt) || next.nextPenaltyAt <= next.defeats || next.nextPenaltyAt % 5) throw new RangeError('Invalid next penalty threshold');
  next.penalties ??= [];
  if (!Array.isArray(next.penalties) || new Set(next.penalties).size !== next.penalties.length ||
      next.penalties.some(name => !persistent.includes(name))) throw new RangeError('Invalid death penalties');
  next.outcomeIds ??= [];
  if (!Array.isArray(next.outcomeIds) || next.outcomeIds.some(id => typeof id !== 'string')) throw new RangeError('Invalid outcome history');
  return next;
}

export function cureDestinyCharacter(character) {
  const next = createDestinyCharacter(character);
  next.defeats = Math.max(0, next.defeats - 2);
  // Already assessed penalties remain assessed. Healing the tally must not
  // award the same five-defeat threshold again when the player reaches it.
  return next;
}

export function attachDestinyCharacter(fight, character) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' || Object.keys(fight.used).length) throw new RangeError('Attach the character before combat');
  if (fight.character) throw new RangeError('Character already attached');
  const profile = createDestinyCharacter(character);
  if (profile.pendingRingDestruction) throw new RangeError('Resolve the lost ring before another fight');
  const next = structuredClone(fight);
  next.character = profile;
  for (const [penalty, slot] of [['crippled', 'feet'], ['nervous-twitch', 'mainHand']]) {
    if (!profile.penalties.includes(penalty)) continue;
    for (const name of next.equipment?.[slot]?.abilities || []) {
      if (next.abilities?.[name]) next.abilities[name]--;
    }
  }
  return next;
}

export function recordDestinyOutcome(character, fight, outcomeId, roll = () => Math.floor(Math.random() * 6) + 1) {
  const next = createDestinyCharacter(character);
  if (!['win', 'loss'].includes(fight?.status) || typeof outcomeId !== 'string' || !outcomeId || outcomeId.length > 128) throw new RangeError('A finished fight needs an outcome ID');
  if (next.outcomeIds.includes(outcomeId)) return { character: next, recorded: false, escaped: false, penalty: null };
  const receipt = { character: next, recorded: true, escaped: false, penalty: null };
  if (fight.status === 'loss') {
    if (!fight.encounter?.disableHeroAbilities && (fight.abilities?.getaway || 0) > 0) {
      receipt.getawayDie = destinyDie(roll);
      receipt.escaped = receipt.getawayDie >= 5;
    }
    if (!receipt.escaped) {
      next.defeats++;
      if (next.defeats >= next.nextPenaltyAt) {
        let selected = null;
        for (let attempt = 0; attempt < 1000; attempt++) {
          const face = destinyDie(roll);
          const name = DESTINY_PENALTIES[face];
          if (next.penalties.includes(name)) continue;
          selected = name;
          receipt.penaltyDie = face;
          break;
        }
        if (!selected) throw new RangeError('No new penalty was rolled');
        if (selected === 'fingerless') next.pendingRingDestruction = true;
        else next.penalties.push(selected);
        next.nextPenaltyAt += 5;
        receipt.penalty = selected;
      }
    }
  }
  next.outcomeIds.push(outcomeId);
  return receipt;
}

export function resolveDestinyRingLoss(character, slot) {
  const next = createDestinyCharacter(character);
  if (!next.pendingRingDestruction) throw new RangeError('No pending ring loss');
  const equipped = ['ring1', 'ring2'].filter(key => next.equipment?.[key]);
  if (equipped.length && !equipped.includes(slot)) throw new RangeError('Choose an equipped ring');
  if (!equipped.length && slot !== null) throw new RangeError('No ring is equipped');
  const removed = equipped.length ? next.equipment[slot] : null;
  if (removed) {
    next.equipment[slot] = null;
    for (const name of removed.abilities || []) if (next.abilities?.[name]) next.abilities[name]--;
    // Only this simulator's explicitly represented attributes are changed.
    // Free-form sheets and unrelated run data are never interpreted or reset.
    for (const attribute of ['speed', 'brawn', 'magic', 'armour', 'health']) {
      const amount = removed[attribute] ?? 0;
      if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid ring attributes');
      if (typeof next.attributes?.[attribute] === 'number') next.attributes[attribute] = Math.max(0, next.attributes[attribute] - amount);
    }
  }
  delete next.pendingRingDestruction;
  return { character: next, removedRing: removed };
}

export function destinyVendorPrice(basePrice, { quantity = 1, persuade = false, trapperHide = false } = {}) {
  if (!Number.isSafeInteger(basePrice) || basePrice < 0 || !Number.isSafeInteger(quantity) || quantity < 1 ||
      typeof persuade !== 'boolean' || typeof trapperHide !== 'boolean') throw new RangeError('Invalid vendor sale');
  const total = (basePrice + (persuade ? 10 : 0) + (trapperHide ? 5 : 0)) * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError('Sale total is too large');
  return total;
}

import { legendaryInteger, validateLegendaryCharacter } from './character.js';

const spell = (name, scopes, recharge, starting = false) => Object.freeze({ name, scopes: Object.freeze(scopes), recharge, starting });
export const LEGENDARY_SPELLS = Object.freeze({
  animalSpeech: spell('Animal Speech', ['adventure'], 50, true),
  armourOfHeaven: spell('Armour of Heaven', ['combat'], 50, true),
  iceBolt: spell('Ice Bolt', ['combat'], 50, true),
  poisonStream: spell('Poison Stream', ['combat'], 50, true),
  unfailingStrike: spell('Unfailing Strike', ['combat'], 50, true),
  wolfSpirit: spell('Wolf Spirit', ['adventure'], 75, true),
  magicCabinet: spell('Magic Cabinet', ['adventure'], 100, true),
  wisdom: spell('Wisdom', ['adventure'], 75),
  dazingLights: spell('Dazing Lights', ['combat'], 50),
  soothingTouch: spell('Soothing Touch', ['adventure', 'combat'], 50),
  shadowDoor: spell('Shadow Door', ['adventure'], 50),
  silverTongue: spell('Silver Tongue', ['adventure'], 75),
  sandstorm: spell('Sandstorm', ['combat'], 50),
  clingingDread: spell('Clinging Dread', ['army'], 50),
  warpWood: spell('Warp Wood', ['naval'], 50),
});

export const CROWN_STARTING_SPELLS = Object.freeze([
  'armourOfHeaven', 'iceBolt', 'poisonStream', 'soothingTouch',
  'unfailingStrike', 'wolfSpirit', 'magicCabinet',
]);

export function legendarySpell(id) {
  if (!Object.hasOwn(LEGENDARY_SPELLS, id)) throw new RangeError('Unknown Legendary Kingdoms spell');
  return LEGENDARY_SPELLS[id];
}

export function validateLegendarySpellbook(character) {
  validateLegendaryCharacter(character, true);
  if (!character.spellcaster || !Array.isArray(character.spells) || character.spells.length > 6)
    throw new RangeError('Choose a living spellcaster with at most six spells');
  const known = new Set();
  for (const entry of character.spells) {
    legendarySpell(entry.id);
    if (known.has(entry.id) || typeof entry.charged !== 'boolean') throw new RangeError('Invalid or duplicate spell');
    known.add(entry.id);
  }
}

export function chooseLegendaryStartingSpells(character, ids) {
  return chooseStartingSpells(character, ids, id => legendarySpell(id).starting);
}

export function chooseCrownStartingSpells(character, ids) {
  return chooseStartingSpells(character, ids, id => CROWN_STARTING_SPELLS.includes(id));
}

function chooseStartingSpells(character, ids, allowed) {
  validateLegendarySpellbook(character);
  if (character.spells.length || !Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 ||
      ids.some(id => !allowed(id))) throw new RangeError('Choose three different starting spells');
  return { ...character, spells: ids.map(id => ({ id, charged: true })) };
}

export function learnCrownApprenticeSpell(character, id) {
  if (!CROWN_STARTING_SPELLS.includes(id)) throw new RangeError('Choose a Book Two starting spell');
  const next = learnLegendarySpell(character, id);
  return { ...next, spells: next.spells.map(entry => entry.id === id ? { ...entry, charged: false } : entry) };
}

export function learnLegendarySpell(character, id) {
  validateLegendarySpellbook(character);
  legendarySpell(id);
  if (character.spells.length === 6 || character.spells.some(entry => entry.id === id))
    throw new RangeError('Spellbook is full or already contains this spell');
  return { ...character, spells: [...character.spells.map(entry => ({ ...entry })), { id, charged: true }] };
}

export function forgetLegendarySpell(character, id) {
  validateLegendarySpellbook(character);
  if (!character.spells.some(entry => entry.id === id)) throw new RangeError('Spell is not known');
  return { ...character, spells: character.spells.filter(entry => entry.id !== id).map(entry => ({ ...entry })) };
}

export function drainLegendarySpell(character, id, scope) {
  validateLegendarySpellbook(character);
  if (!legendarySpell(id).scopes.includes(scope)) throw new RangeError('Spell cannot be cast in this kind of encounter');
  const entry = character.spells.find(entry => entry.id === id);
  if (!entry?.charged) throw new RangeError('Spell is unknown or drained');
  return { ...character, spells: character.spells.map(entry => ({ ...entry, charged: entry.id === id ? false : entry.charged })) };
}

export function rechargeLegendarySpells(character, ids, silver, { allowed = false, free = false } = {}) {
  validateLegendarySpellbook(character);
  legendaryInteger(silver);
  if (!allowed || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
    throw new RangeError('Recharge only where the story permits it');
  let cost = 0;
  for (const id of ids) {
    const entry = character.spells.find(entry => entry.id === id);
    if (!entry || entry.charged) throw new RangeError('Choose known, drained spells');
    cost += legendarySpell(id).recharge;
  }
  if (free) cost = 0;
  if (cost > silver) throw new RangeError('Not enough silver to recharge spells');
  return { silver: silver - cost, cost, character: { ...character,
    spells: character.spells.map(entry => ({ ...entry, charged: ids.includes(entry.id) ? true : entry.charged })) } };
}

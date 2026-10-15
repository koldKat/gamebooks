import { SPELLS } from './definition.js';
import { validateCharacter, rollDice } from './combat.js';

export function eat(character) {
  validateCharacter(character, true);
  if (!character.provisions || character.stamina >= character.staminaInitial) throw new RangeError('Cannot eat');
  const next = structuredClone(character); next.provisions--;
  next.stamina = Math.min(next.staminaInitial, next.stamina + 4);
  return next;
}

export function castSpell(character, spell, cost) {
  validateCharacter(character, true);
  if (!Object.hasOwn(SPELLS, spell) || !SPELLS[spell].includes(cost) || cost > character.stamina) throw new RangeError('Invalid spell cost');
  const next = structuredClone(character); next.stamina -= cost;
  if (!next.stamina) next.dead = true;
  return next;
}

export function testLuck(character, roll) {
  validateCharacter(character, true);
  if (!character.luck) throw new RangeError('No Luck');
  const next = structuredClone(character), value = rollDice(roll), lucky = value <= next.luck;
  next.luck--;
  return { character: next, roll: value, lucky };
}

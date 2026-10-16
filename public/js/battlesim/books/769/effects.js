import { PROVISIONS_HEAL } from './definition.js';
import { validateCharacter } from './combat.js';

export function eat(character) {
  validateCharacter(character, true);
  if (!character.provisions || character.stamina === character.staminaInitial) throw new RangeError('No meal needed or available');
  const next = structuredClone(character);
  next.provisions--;
  next.stamina = Math.min(next.staminaInitial, next.stamina + PROVISIONS_HEAL);
  return next;
}

export function drinkPotion(character) {
  validateCharacter(character, true);
  if (!character.potionUses) throw new RangeError('Potion empty');
  const next = structuredClone(character);
  const stat = { skill: 'skill', strength: 'stamina', fortune: 'luck' }[next.potion];
  next.potionUses = 0;
  if (next.potion === 'fortune') next.luckInitial++;
  next[stat] = next[stat + 'Initial'];
  return next;
}

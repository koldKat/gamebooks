import { newCharacter, rollDice, validateCharacter } from './combat.js';

export function eat(character) {
  validateCharacter(character, true);
  if (character.provisions <= 0) throw new RangeError('No provisions');
  const next = structuredClone(character);
  next.provisions--;
  next.stamina = Math.min(next.staminaInitial, next.stamina + 4);
  return next;
}

export function restoreStrength(character) {
  validateCharacter(character, true);
  return { ...structuredClone(character), stamina: character.staminaInitial };
}

export function restoreFortune(character) {
  validateCharacter(character, true);
  return { ...structuredClone(character), luckInitial: character.luckInitial + 1, luck: character.luckInitial + 1 };
}

export function sauna(character, roll) {
  validateCharacter(character, true);
  const next = structuredClone(character), rolled = newCharacter(roll);
  for (const key of ['skill', 'stamina', 'luck']) {
    next[key] = rolled[key];
    next[key + 'Initial'] = rolled[key + 'Initial'];
  }
  return next;
}

export function testLuck(character, roll, { talisman = false } = {}) {
  validateCharacter(character, true);
  if (talisman ? !character.talisman : character.luck <= 0) throw new RangeError('Luck unavailable');
  const next = structuredClone(character);
  let value = null, lucky = true;
  if (talisman) next.talisman = false;
  else {
    value = rollDice(roll);
    lucky = value <= next.luck;
    next.luck--;
  }
  return { character: next, lucky, roll: value };
}

import { MEAL_HEALING, SERPENT_RULES } from './definition.js';
import { integer, loseStamina, validateCharacter, testLuck, rollDice, effectiveSkill } from './combat.js';

const livingCopy = character => {
  validateCharacter(character, true);
  return structuredClone(character);
};

export function eat(character) {
  const next = livingCopy(character);
  if (!next.provisions) throw new RangeError('No provisions');
  const healing = next.mealsToday ? MEAL_HEALING.later : MEAL_HEALING.first;
  next.provisions--;
  next.mealsToday++;
  next.stamina = Math.min(next.staminaInitial, next.stamina + healing);
  return next;
}

export function nextDay(character, rest = 3) {
  integer(rest, 0, 3);
  let next = livingCopy(character);
  if (next.poisoned) {
    next.stamina = 0;
    next.dead = true;
    return next;
  }
  next.stamina = Math.min(next.staminaInitial, next.stamina + rest);
  if (!next.mealsToday) next = loseStamina(next, 3).character;
  next.mealsToday = 0;
  return next;
}

export function antidote(character) {
  const next = livingCopy(character);
  if (!next.antidote) throw new RangeError('No antidote');
  next.antidote = false;
  next.poisoned = false;
  next.afflictions = next.afflictions.filter(value => value !== 'snake-poison');
  return next;
}

export function liftEarthSerpent(character, protectedFromDamage = false, roll) {
  if (typeof protectedFromDamage !== 'boolean') throw new RangeError('Invalid protection');
  const tested = testLuck(character, roll);
  const skillRoll = tested.lucky ? rollDice(roll) : null;
  const success = tested.lucky && skillRoll < effectiveSkill(tested.character);
  const next = !success && !protectedFromDamage ? loseStamina(tested.character, SERPENT_RULES.earthLift.damage).character : tested.character;
  return { character: next, luckRoll: tested.roll, skillRoll, success, destination: success ? SERPENT_RULES.earthLift.destination : null };
}

export function useLibra(character, kind = 'restore') {
  const next = livingCopy(character);
  if (next.libraUsed || next.libraRenounced || !['restore', 'cure', 'rescue'].includes(kind)) throw new RangeError('Libra unavailable');
  next.libraUsed = true;
  if (kind === 'restore') {
    for (const stat of ['skill', 'stamina', 'luck']) next[stat] = next[stat + 'Initial'];
  }
  if (kind === 'cure') { next.afflictions = []; next.poisoned = false; }
  return next;
}

export function healingSpell(character) {
  validateCharacter(character, true);
  if (character.role !== 'wizard' || !character.medicines) throw new RangeError('Healing unavailable');
  const next = loseStamina(character, 1).character;
  next.medicines--;
  if (!next.dead) next.stamina = next.staminaInitial;
  return next;
}

export function adjust(character, field, amount) {
  const next = livingCopy(character);
  if (!['gold', 'provisions', 'goblinTeeth', 'giantTeeth', 'pebbles', 'medicines'].includes(field)) throw new RangeError('Invalid resource');
  integer(amount, -10000, 10000);
  integer(next[field] + amount);
  next[field] += amount;
  return next;
}

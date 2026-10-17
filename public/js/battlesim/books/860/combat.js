import { RULES_REVISION } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
const dice = (supplied, count, random) => {
  if (supplied !== undefined && (!Array.isArray(supplied) || supplied.length !== count)) throw new RangeError('Invalid dice');
  return Array.from({length: count}, (_, index) => integer(supplied === undefined ? random() : supplied[index], 1, 6));
};
const sum = values => values.reduce((total, value) => total + value, 0);

export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  integer(character.initialEnergy, 1, 1000000);
  integer(character.energy, 0, 1000000);
  return structuredClone(character);
}

export function newCharacter(value, random = rollDie) {
  const initialEnergy = 40 + dice(value === undefined ? undefined : [value], 1, random)[0];
  return {energy: initialEnergy, initialEnergy};
}

export function validateEncounter(encounter) {
  if (!encounter || typeof encounter.displayName !== 'string' || !encounter.displayName.trim()) throw new RangeError('Missing encounter name');
  integer(encounter.threshold, 0, 12);
  if (encounter.threshold === 1) throw new RangeError('Use zero for automatic wounds');
  integer(encounter.damageDice, 0, 2);
  if (encounter.heavyWound !== undefined && typeof encounter.heavyWound !== 'boolean') throw new RangeError('Invalid wound rule');
  if (encounter.heavyWound && (String(encounter.id) !== '31' || encounter.threshold !== 10 || encounter.damageDice !== 0)) throw new RangeError('Invalid source exception');
  if (!encounter.heavyWound && encounter.damageDice < 1) throw new RangeError('Missing damage dice');
  return structuredClone(encounter);
}

// Each picture permits one wound check, never repeated attacks against enemy HP.
export function resolveRound(character, encounter, supplied = {}, random = rollDie) {
  const player = validateCharacter(character), enemy = validateEncounter(encounter);
  if (!player.energy) throw new RangeError('Dead character');
  const attackDice = enemy.threshold ? dice(supplied.attackDice, 2, random) : [];
  const attackTotal = attackDice.length ? sum(attackDice) : null;
  const wounded = !enemy.threshold || attackTotal >= enemy.threshold;
  const damageDice = wounded && !enemy.heavyWound ? dice(supplied.damageDice, enemy.damageDice, random) : [];
  const damage = sum(damageDice);
  player.energy = Math.max(0, player.energy - damage);
  return {rulesRevision: RULES_REVISION, character: player, encounter: enemy, attackDice, attackTotal,
    wounded, damageDice, damage, outcome: !player.energy ? 'death' : wounded ? 'wounded' : 'safe',
    destination: enemy.heavyWound ? (wounded ? '78' : '85') : null};
}

export function rollAccuracy(value, random = rollDie) {
  const die = dice(value === undefined ? undefined : [value], 1, random)[0];
  return {die, destination: die === 1 ? '7' : '38'};
}

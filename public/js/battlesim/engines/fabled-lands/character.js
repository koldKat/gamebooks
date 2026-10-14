export const FABLED_ABILITIES = Object.freeze(['charisma', 'combat', 'magic', 'sanctity', 'scouting', 'thievery']);
export const FABLED_PROFESSIONS = Object.freeze({
  priest: [4, 2, 3, 6, 4, 2], mage: [2, 2, 6, 1, 5, 3], rogue: [5, 4, 4, 1, 2, 6],
  troubadour: [6, 3, 4, 3, 2, 4], warrior: [3, 6, 2, 4, 3, 2], wayfarer: [2, 5, 2, 3, 6, 4],
});

export function fabledInteger(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Fabled Lands value');
  return value;
}

export function fabledDie(roll = () => Math.floor(Math.random() * 6) + 1) {
  return fabledInteger(roll(6), 1, 6);
}

export function fabledDice(roll) { return fabledDie(roll) + fabledDie(roll); }

export function newFabledCharacter(profession = 'warrior') {
  if (!Object.hasOwn(FABLED_PROFESSIONS, profession)) throw new RangeError('Invalid profession');
  const abilities = Object.fromEntries(FABLED_ABILITIES.map((name, index) => [name, FABLED_PROFESSIONS[profession][index]]));
  return { ...abilities, profession, rank: 1, stamina: 9, staminaInitial: 9,
    shards: 16, armour: 1, ratPoison: 0, combatBlessing: false, luckBlessing: false, stormsBlessing: false };
}

export function validateFabledCharacter(character, alive = false) {
  if (!character || !Object.hasOwn(FABLED_PROFESSIONS, character.profession)) throw new RangeError('Invalid character');
  for (const name of FABLED_ABILITIES) fabledInteger(character[name], 1);
  fabledInteger(character.rank, 1); fabledInteger(character.armour);
  fabledInteger(character.stamina, alive ? 1 : 0); fabledInteger(character.staminaInitial, 1);
  fabledInteger(character.shards);
  fabledInteger(character.ratPoison);
  for (const name of ['combatBlessing', 'luckBlessing', 'stormsBlessing']) {
    if (typeof character[name] !== 'boolean') throw new RangeError('Invalid blessing');
  }
  return character;
}

export function fabledDefence(character) {
  validateFabledCharacter(character);
  return fabledInteger(character.combat + character.rank + character.armour, 1);
}

export function fabledAbilityCheck(character, ability, difficulty, roll) {
  validateFabledCharacter(character, true);
  if (!FABLED_ABILITIES.includes(ability)) throw new RangeError('Invalid ability');
  fabledInteger(difficulty);
  const total = fabledDice(roll) + character[ability];
  return { total, success: total > difficulty };
}

export function fabledRankCheck(character, count = 1, modifier = 0, roll) {
  validateFabledCharacter(character, true);
  fabledInteger(count, 1, 3); fabledInteger(modifier, -1000, 1000);
  let total = modifier;
  for (let i = 0; i < count; i++) total += fabledDie(roll);
  return { total, success: total <= character.rank };
}

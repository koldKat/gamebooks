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

export function newFabledCharacter(profession = 'warrior', {
  rank = 1, stamina = 9, shards = 16, armour = 1, professions = FABLED_PROFESSIONS, abilityCurse,
} = {}) {
  if (!Object.hasOwn(FABLED_PROFESSIONS, profession) || !Object.hasOwn(professions, profession)) throw new RangeError('Invalid profession');
  fabledInteger(rank, 1); fabledInteger(stamina, 1); fabledInteger(shards); fabledInteger(armour);
  const scores = professions[profession];
  if (!Array.isArray(scores) || scores.length !== FABLED_ABILITIES.length
    || abilityCurse !== undefined && typeof abilityCurse !== 'boolean') throw new RangeError('Invalid starting character');
  const abilities = Object.fromEntries(FABLED_ABILITIES.map((name, index) => [name, fabledInteger(scores[index], 1, 12)]));
  return { ...abilities, profession, rank, stamina, staminaInitial: stamina,
    shards, armour, ratPoison: 0, combatBlessing: false, luckBlessing: false, stormsBlessing: false,
    ...(abilityCurse === undefined ? {} : { abilityCurse }) };
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
  if (character.abilityCurse !== undefined && typeof character.abilityCurse !== 'boolean') throw new RangeError('Invalid ability curse');
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
  const total = (character.abilityCurse ? fabledDie(roll) : fabledDice(roll)) + character[ability];
  return { total, success: total > difficulty };
}

export function fabledRankCheck(character, count = 1, modifier = 0, roll) {
  validateFabledCharacter(character, true);
  fabledInteger(count, 1, 3); fabledInteger(modifier, -1000, 1000);
  let total = modifier;
  for (let i = 0; i < count; i++) total += fabledDie(roll);
  return { total, success: total <= character.rank };
}

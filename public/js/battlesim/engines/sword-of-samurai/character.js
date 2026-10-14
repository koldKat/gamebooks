export const SAMURAI_ARTS = Object.freeze(['archery', 'iaijutsu', 'acrobatics', 'nito']);
export const SAMURAI_ARROW_DAMAGE = Object.freeze({ leaf: 2, barbed: 3, piercing: 2, blunt: 1 });
const POTIONS = ['skill', 'stamina', 'luck'];

function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Samurai value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { return die(roll) + die(roll); }

export function validateSamuraiCharacter(character, alive = false) {
  if (!character || !SAMURAI_ARTS.includes(character.art)) throw new RangeError('Invalid martial art');
  for (const stat of ['skill', 'stamina', 'luck']) {
    integer(character[stat], alive && stat === 'stamina' ? 1 : 0);
    integer(character[stat + 'Initial'], 1);
  }
  integer(character.honour, alive ? 1 : 0);
  integer(character.provisions);
  integer(character.swords, 0, 2);
  if (typeof character.bow !== 'boolean') throw new RangeError('Invalid bow');
  if (!character.arrows) throw new RangeError('Invalid arrows');
  for (const type of Object.keys(SAMURAI_ARROW_DAMAGE)) integer(character.arrows[type]);
  if (!POTIONS.includes(character.potion) || typeof character.potionUsed !== 'boolean') {
    throw new RangeError('Invalid potion');
  }
  return character;
}

export function newSamuraiCharacter(options = {}, roll) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid character choices');
  const { art = 'iaijutsu', potion = 'skill' } = options;
  if (!SAMURAI_ARTS.includes(art) || !POTIONS.includes(potion)) throw new RangeError('Invalid character choice');
  const skill = die(roll) + 6, stamina = dice(roll) + 12, luck = die(roll) + 6;
  const arrows = Object.fromEntries(Object.keys(SAMURAI_ARROW_DAMAGE).map(type => [type, art === 'archery' ? 3 : 0]));
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    honour: 3, provisions: 10, art, bow: art === 'archery', arrows, swords: 2, potion, potionUsed: false };
}

export function samuraiDeathDestination(character) {
  validateSamuraiCharacter(character);
  return character.honour === 0 ? 99 : null;
}

function recoveryCharacter(input, inCombat) {
  validateSamuraiCharacter(input, true);
  if (typeof inCombat !== 'boolean' || inCombat) throw new RangeError('Recovery is unavailable in combat');
  return structuredClone(input);
}

export function eatSamuraiMeal(input, inCombat = false) {
  const character = recoveryCharacter(input, inCombat);
  if (!character.provisions) throw new RangeError('No provisions');
  character.provisions--;
  character.stamina = Math.max(character.stamina, Math.min(character.staminaInitial, character.stamina + 4));
  return character;
}

export function drinkSamuraiPotion(input, inCombat = false) {
  const character = recoveryCharacter(input, inCombat);
  if (character.potionUsed) throw new RangeError('Potion already used');
  const stat = character.potion;
  if (stat === 'luck') character.luckInitial = integer(character.luckInitial + 1, 1);
  character[stat] = Math.max(character[stat], character[stat + 'Initial']);
  character.potionUsed = true;
  return character;
}

export function testSamuraiLuck(input, roll) {
  validateSamuraiCharacter(input, true);
  const character = structuredClone(input), total = dice(roll), lucky = total <= character.luck;
  character.luck = Math.max(0, character.luck - 1);
  return { character, total, lucky };
}

export function fireSamuraiArrow(input, type, roll) {
  validateSamuraiCharacter(input, true);
  if (input.art !== 'archery' || !input.bow || !Object.hasOwn(SAMURAI_ARROW_DAMAGE, type) || !input.arrows[type]) {
    throw new RangeError('Arrow unavailable');
  }
  const character = structuredClone(input), total = dice(roll), hit = total < character.skill;
  character.arrows[type]--;
  return { character, total, hit, damage: hit ? SAMURAI_ARROW_DAMAGE[type] : 0, type };
}

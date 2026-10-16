export function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Sorcery value');
  return value;
}

export function die(roll = sides => Math.floor(Math.random() * sides) + 1) {
  return integer(roll(6), 1, 6);
}

export function rollDice(roll) { return die(roll) + die(roll); }

export function validateCharacter(character, alive = false) {
  if (!character || !['warrior', 'wizard'].includes(character.role)) throw new RangeError('Invalid character');
  for (const stat of ['skill', 'stamina', 'luck']) {
    integer(character[stat + 'Initial'], 1);
    integer(character[stat], alive && stat === 'stamina' ? 1 : 0, character[stat + 'Initial']);
  }
  for (const field of ['gold', 'provisions', 'mealsToday']) integer(character[field]);
  integer(character.attackModifier, -1000, 1000);
  for (const field of ['dead', 'libraUsed', 'libraRenounced']) {
    if (typeof character[field] !== 'boolean') throw new RangeError('Invalid character flag');
  }
  if (!Array.isArray(character.afflictions) || character.afflictions.some(value => typeof value !== 'string')) {
    throw new RangeError('Invalid afflictions');
  }
  if (alive && character.dead) throw new RangeError('Character is dead');
  return character;
}

export function newCharacter(role = 'warrior', roll) {
  if (!['warrior', 'wizard'].includes(role)) throw new RangeError('Invalid role');
  const skill = die(roll) + (role === 'wizard' ? 4 : 6);
  const stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { role, skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    gold: 20, provisions: 2, mealsToday: 0, attackModifier: 0,
    dead: false, libraUsed: false, libraRenounced: false, afflictions: [] };
}

export function attackStrength(skill, modifier = 0, roll) {
  integer(skill);
  integer(modifier, -50000, 50000);
  const dice = [die(roll), die(roll)];
  return { dice, total: Math.max(0, skill + modifier) + dice[0] + dice[1] };
}

export function compareAttacks(player, enemy, playerWinsTies = false) {
  integer(player, 0, 100000);
  integer(enemy, 0, 100000);
  if (typeof playerWinsTies !== 'boolean') throw new RangeError('Invalid tie rule');
  return player > enemy || playerWinsTies && player === enemy ? 'player' : player < enemy ? 'enemy' : 'tie';
}

export function damageWithLuck(direction, damage = 2, lucky = null) {
  if (!['outgoing', 'incoming'].includes(direction)) throw new RangeError('Invalid damage direction');
  integer(damage);
  if (lucky !== null && typeof lucky !== 'boolean') throw new RangeError('Invalid Luck result');
  if (lucky === null || damage === 0) return damage;
  return Math.max(0, damage + (direction === 'outgoing' ? lucky ? 2 : -1 : lucky ? -1 : 1));
}

export function loseStamina(character, damage) {
  validateCharacter(character, true);
  integer(damage);
  const next = structuredClone(character);
  next.stamina = Math.max(0, next.stamina - damage);
  next.dead = next.stamina === 0;
  return next;
}

export function healStamina(character, amount) {
  validateCharacter(character, true);
  integer(amount);
  const next = structuredClone(character);
  if (!next.afflictions.includes('fever')) next.stamina = Math.min(next.staminaInitial, next.stamina + amount);
  return next;
}

export function testLuck(character, roll) {
  validateCharacter(character, true);
  const next = structuredClone(character), value = rollDice(roll), lucky = value <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return { character: next, roll: value, lucky };
}

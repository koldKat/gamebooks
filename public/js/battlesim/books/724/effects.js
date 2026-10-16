import { die, healStamina, integer, loseStamina, rollDice, validateCharacter } from '../../engines/sorcery/core.js';

const livingCopy = character => structuredClone(validateCharacter(character, true));

export function eat(character) {
  let next = livingCopy(character);
  if (!integer(next.provisions)) throw new RangeError('No provisions');
  next.provisions--;
  next = healStamina(next, next.mealsToday ? 1 : 2);
  next.mealsToday++;
  return next;
}

export function nextDay(character) {
  let next = healStamina(character, 2);
  if (!next.mealsToday) next = loseStamina(next, 3);
  next.mealsToday = 0;
  return next;
}

export function fruit(character, inCombat = false) {
  if (typeof inCombat !== 'boolean' || inCombat) throw new RangeError('Fruit unavailable in combat');
  let next = livingCopy(character);
  if (!integer(next.fruits)) throw new RangeError('No fruit');
  next.fruits--;
  return healStamina(next, 4);
}

export function healingSpell(character) {
  let next = livingCopy(character);
  if (next.role !== 'wizard' || next.forgottenMagic || !integer(next.medicines)) throw new RangeError('Healing unavailable');
  next.medicines--;
  next = loseStamina(next, 1);
  return next.dead ? next : healStamina(next, next.staminaInitial);
}

export function coatWeapon(character) {
  let next = livingCopy(character);
  if (next.role !== 'wizard' || next.forgottenMagic || !next.wax || !next.armed) throw new RangeError('Weapon spell unavailable');
  next = loseStamina(next, 1);
  if (!next.dead) next.nextFightDoubleDamage = true;
  return next;
}

export function useLibra(character, kind = 'restore') {
  let next = livingCopy(character);
  if (next.libraUsed || next.libraRenounced || next.insideFortress || !['restore', 'cure', 'rescue'].includes(kind)) {
    throw new RangeError('Libra unavailable');
  }
  next.libraUsed = true;
  if (kind === 'restore') {
    next.skill = next.skillInitial;
    next.luck = next.luckInitial;
    next = healStamina(next, next.staminaInitial);
  } else if (kind === 'cure') next.afflictions = [];
  return next;
}

export function doorCheck(character, section, roll) {
  if (![53, 454].includes(section)) throw new RangeError('Unknown door');
  validateCharacter(character, true);
  const value = rollDice(roll), success = section === 53 ? value <= character.skill : value < character.skill;
  const next = loseStamina(character, 1);
  return { character: next, roll: value, success: !next.dead && success,
    destination: next.dead ? null : success ? section === 53 ? 112 : 102 : section };
}

export function spearEscape(character, roll) {
  let next = livingCopy(character);
  const throws = [[die(roll), die(roll)], [die(roll), die(roll)]];
  const fatal = throws.some(([a, b]) => a === b);
  const wounds = throws.filter(([a, b]) => a + b <= 6).length;
  next = loseStamina(next, fatal ? next.stamina : wounds * 3);
  return { character: next, throws, wounds, fatal: next.dead, destination: next.dead ? null : 441 };
}

export function feverChoice(character, roll) {
  validateCharacter(character, true);
  if (!character.afflictions.includes('fever')) throw new RangeError('No fever');
  const value = die(roll);
  return { roll: value, choiceIndex: value === 6 ? null : value - 1 };
}

export function mutation(character, roll) {
  let next = livingCopy(character);
  const value = rollDice(roll);
  const destination = [562, 544, 524, 501, 455, 433, 409, 105, 261, 184, 315][value - 2];
  if ([562, 315].includes(destination)) next = loseStamina(next, next.stamina);
  else if (destination === 544) { next = loseStamina(next, 2); next.twoWeapons = true; }
  else if (destination === 524) {
    next.skillInitial = Math.max(1, next.skillInitial - 2);
    next.skill = Math.max(0, Math.min(next.skillInitial, next.skill - 2));
    next = loseStamina(next, 3);
  } else if (destination === 501) next.forgottenMagic = true;
  else if (destination === 455) next.reptileFear = true;
  else if (destination === 409) {
    next = loseStamina(next, 2);
    next.staminaInitial = Math.max(1, next.staminaInitial - 2);
  } else if (destination === 105) {
    next.skillInitial = Math.max(1, next.skillInitial - 3);
    next.skill = Math.min(next.skill, next.skillInitial);
  } else if (destination === 261) next.disguised = true;
  else if (destination === 184) next.horn = true;
  return { character: next, roll: value, destination, nextSection: next.dead ? null : 448 };
}

export function timeTravel(roll) {
  const value = rollDice(roll);
  return { roll: value, destination: [447, 518, 733, 30, 75, 229, 631, 579, 407, 500, 420][value - 2] };
}

export function startDarts(character, borrow = false) {
  const next = livingCopy(character);
  if (typeof borrow !== 'boolean' || integer(next.dartsGames, 0, 2) >= 2) throw new RangeError('Darts unavailable');
  if (borrow) {
    if (next.gold >= 2) throw new RangeError('Loan only when stake unavailable');
    next.gold += 2;
  }
  if (next.gold < 2) throw new RangeError('Insufficient stake');
  next.gold -= 2;
  next.dartsGames++;
  return { character: next, total: 0, nextPlayer: 0, borrowed: borrow, winner: null, throws: 0, last: null };
}

export function dart(game, points) {
  if (!game || game.winner !== null) throw new RangeError('No active darts game');
  if (typeof game.borrowed !== 'boolean') throw new RangeError('Invalid darts loan');
  validateCharacter(game.character, true);
  integer(game.total, -1000000, 1000000);
  integer(game.nextPlayer, 0, 3);
  integer(game.throws, 0, 1000000);
  integer(points, -1000, 1000);
  const next = structuredClone(game), player = next.nextPlayer;
  next.total += points;
  integer(next.total, -1000000, 1000000);
  next.throws++;
  next.last = { player, points };
  if (Math.abs(next.total) === 10) {
    next.winner = player;
    if (player === 0) next.character.gold += 8 - (next.borrowed ? 4 : 0);
  } else next.nextPlayer = (player + 1) % 4;
  return next;
}

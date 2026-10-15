import { die, integer, testLuck, validateCharacter } from './combat.js';
import { WHEEL_PAGE_COUNT, WHEEL_PRIZES } from './definition.js';

export { testLuck } from './combat.js';
const copy = character => { validateCharacter(character, true); return structuredClone(character); };
const restore = character => {
  for (const stat of ['skill', 'stamina', 'luck']) character[stat] = character[stat + 'Initial'];
  return character;
};

export function eat(character, { shared = false } = {}) {
  const next = copy(character);
  if (!next.provisions || next.noEatingToday) throw new RangeError('Eating unavailable');
  const portions = shared ? Math.min(2, next.provisions) : 1;
  const healing = shared ? portions : next.mealsToday ? 1 : 2;
  next.provisions -= portions;
  next.mealsToday++;
  next.stamina = Math.min(next.staminaInitial, next.stamina + healing);
  return next;
}

export function nextDay(character) {
  const next = copy(character);
  next.mealsToday = 0;
  next.noEatingToday = false;
  next.intoxicated = false;
  return next;
}

export function useLibra(character, kind = 'restore') {
  const next = copy(character);
  if (next.libraUsed || !['restore', 'cure', 'champion'].includes(kind)) throw new RangeError('Libra unavailable');
  next.libraUsed = true;
  if (kind === 'restore') restore(next);
  if (kind === 'cure') next.afflictions = [];
  if (kind === 'champion') next.libraChampion = true;
  return next;
}

export function healingSpell(character) {
  const next = copy(character);
  if (next.role !== 'wizard' || !next.medicines) throw new RangeError('Healing spell unavailable');
  next.medicines--;
  next.stamina--;
  if (!next.stamina) next.dead = true;
  else next.stamina = next.staminaInitial;
  return next;
}

export function herbs(character, roll) {
  const next = copy(character), value = die(roll);
  next.intoxicated = true;
  if (value === 1) next.stamina = Math.min(next.staminaInitial, next.stamina + 2);
  if (value === 2) next.nextFightSkill++;
  if (value === 4) next.gold = Math.max(0, next.gold - 3);
  if (value === 5) { next.stamina--; next.nextFightSkill--; }
  if (!next.stamina) next.dead = true;
  return { character: next, roll: value, destination: value === 6 ? 58 : 242 };
}

export function scaldedMeal(character) {
  const next = copy(character);
  next.stamina--;
  next.noEatingToday = true;
  if (!next.stamina) next.dead = true;
  return next;
}

export function prediction(character, chosen, excluded = null, roll, { cake = false } = {}) {
  let next = copy(character);
  integer(chosen, 1, 6);
  if (excluded !== null) { integer(excluded, 1, 6); if (chosen === excluded) throw new RangeError('Invalid excluded number'); }
  if (!next.gold || next.predictionBets >= 5) throw new RangeError('Prediction unavailable');
  next.gold--;
  next.predictionBets++;
  let tested = null;
  if (excluded !== null) { tested = testLuck(next, roll, { cake }); next = tested.character; }
  const first = die(roll), rerolled = !!tested?.lucky && first === excluded;
  const value = rerolled ? die(roll) : first, won = value === chosen;
  if (won) next.gold += 10;
  return { character: next, first, roll: value, rerolled, won, luck: tested, destination: next.predictionBets === 5 ? 39 : null };
}

export function wheel(character, roll = pages => Math.floor(Math.random() * pages) + 1) {
  const next = copy(character);
  if (!next.gold || next.wheelWon) throw new RangeError('Wheel unavailable');
  const page = integer(roll(WHEEL_PAGE_COUNT), 1, WHEEL_PAGE_COUNT);
  const prize = WHEEL_PRIZES[page] ?? 0;
  next.gold += prize - 1;
  next.wheelWon = prize > 0;
  return { character: next, page, prize, won: next.wheelWon, destination: next.wheelWon ? 39 : null };
}

export function placeBet(character, fighter, stake) {
  const next = copy(character);
  integer(stake, 1, next.gold);
  if (!['barbarian', 'ogre'].includes(fighter) || fighter === 'ogre' && stake % 3) throw new RangeError('Invalid wager');
  next.gold -= stake;
  return { character: next, ticket: { fighter, stake, settled: false } };
}

export function settleBet(character, ticket, winner) {
  const next = copy(character);
  if (!ticket || ticket.settled || !['barbarian', 'ogre'].includes(ticket.fighter) || !['barbarian', 'ogre'].includes(winner)) throw new RangeError('No unsettled wager');
  integer(ticket.stake, 1);
  if (ticket.fighter === 'ogre' && ticket.stake % 3) throw new RangeError('Invalid wager');
  const won = ticket.fighter === winner;
  const profit = won ? ticket.fighter === 'ogre' ? ticket.stake / 3 : ticket.stake * 3 : 0;
  if (won) next.gold += ticket.stake + profit;
  return { character: next, ticket: { ...structuredClone(ticket), settled: true, winner }, won, profit };
}

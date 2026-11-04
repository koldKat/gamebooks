// Validate combat values and calculate Horror Classic dice, initiative and strike damage.
export const ATTRIBUTES = Object.freeze(['speed', 'courage', 'strength', 'skill', 'psi']);

export function number(value, min = 0, max = 10000) {
  const result = Number(value);
  if (value === '' || value == null || !Number.isFinite(result) || result < min || result > max) {
    throw new RangeError('Enter a valid combat value.');
  }
  return result;
}

export function rollDice(count, die = () => Math.floor(Math.random() * 6) + 1, manual) {
  if (![1, 2].includes(count)) throw new RangeError('Choose one or two dice.');
  if (manual !== undefined && manual !== '') {
    const total = number(manual, count, count * 6);
    if (!Number.isInteger(total)) throw new RangeError('Enter a whole dice score.');
    return {total, dice: null};
  }
  const dice = Array.from({length: count}, () => {
    const value = number(die(), 1, 6);
    if (!Number.isInteger(value)) throw new RangeError('Invalid die.');
    return value;
  });
  return {total: dice.reduce((sum, value) => sum + value, 0), dice};
}

export function fighter(input, {player = false} = {}) {
  const result = {...structuredClone(input), name: String(input.name || (player ? 'Player' : 'Opponent')).slice(0, 200)};
  for (const key of ATTRIBUTES) result[key] = number(input[key]);
  result.lifePoints = number(input.lifePoints, 0.000001, player ? 100 : 10000);
  result.maxLife = player ? 100 : number(input.maxLife ?? input.lifePoints, input.lifePoints);
  result.rules = structuredClone(input.rules || {});
  result.status = {poison: 0, ...structuredClone(input.status || {})};
  return result;
}

export function effectiveStats(combatant, {weapon = 'none', bat = false, garlicOil = false} = {}) {
  const values = Object.fromEntries(ATTRIBUTES.map(key => [key, combatant[key] * (garlicOil ? 0.5 : 1)]));
  if (weapon === 'dagger') values.skill = 0;
  if (weapon === 'mace') values.speed = values.skill = 0;
  if (bat) values.strength = 1;
  return values;
}

export function initiative(player, enemy, {playerOptions = {}, modifier = 0, playerRoll, enemyRoll} = {}, die) {
  const p = rollDice(1, die, playerRoll), e = rollDice(1, die, enemyRoll);
  const stats = effectiveStats(player, playerOptions);
  const playerScore = p.total + stats.speed + stats.courage + modifier;
  const enemyScore = e.total + enemy.speed + enemy.courage - modifier;
  return {playerRoll: p, enemyRoll: e, playerScore, enemyScore,
    first: playerScore === enemyScore ? null : playerScore > enemyScore ? 'player' : 'enemy'};
}

export function strikeDamage(attacker, defender, score, {
  weapon = 'none', bat = false, garlicOil = false, blessed = false, sanctuary = false,
  partyCard = false, hitThreshold = 6, damageBonus = 0, doubleDamage = false, doubleDice = false, noDamage = false,
} = {}) {
  if (score < hitThreshold || noDamage) return 0;
  const stats = effectiveStats(attacker, {weapon, bat, garlicOil});
  const weapons = {none: 0, dagger: 5, mace: 10, flintlock: 20};
  if (!Object.hasOwn(weapons, weapon)) throw new RangeError('Choose an available weapon.');
  let damage = score * (doubleDice ? 2 : 1) + stats.strength + stats.skill + weapons[weapon] + damageBonus + (blessed ? 5 : 0);
  if (doubleDamage) damage *= 2;
  return Math.max(0, damage - number(defender.rules?.armor ?? 0)
    - (sanctuary ? 5 : 0) - (partyCard && attacker.rules?.vampire ? 2 : 0));
}

export function naturalHealing(player, {role, score, rules} = {}, die) {
  if (role !== 'harker' || !['detailed', 'synopsis'].includes(rules)) {
    throw new RangeError('Choose Harker and a printed healing rule.');
  }
  const next = structuredClone(player);
  next.lifePoints = number(next.lifePoints, 0.000001, 100);
  const roll = rollDice(2, die, score);
  const heals = rules === 'detailed' ? roll.total > 6 : roll.total >= 6;
  next.lifePoints = Math.min(100, next.lifePoints + (heals ? roll.total : -roll.total));
  return {player: next, roll, heals};
}

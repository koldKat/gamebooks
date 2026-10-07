export function tossCoins(count, random = Math.random) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Invalid coin count');
  const coins = Array.from({ length: count }, () => random() < 0.5 ? 'H' : 'T');
  const heads = coins.filter(coin => coin === 'H').length;
  return { coins, heads, tails: count - heads };
}

export function initialFortune(random = Math.random) {
  const toss = tossCoins(3, random);
  return { ...toss, fortune: 10 + toss.heads - toss.tails };
}

export function rollAttack(expertise, penalty = 0, random = Math.random) {
  if (!Number.isFinite(expertise) || !Number.isFinite(penalty)) throw new TypeError('Invalid Expertise');
  const toss = tossCoins(4, random);
  return { ...toss, total: expertise - penalty + toss.heads };
}

export function rollExchange({ playerExpertise, enemyExpertise, surprise = null, surprisePenalty }, random = Math.random) {
  if (![null, 'player', 'enemy'].includes(surprise)) throw new TypeError('Invalid surprise side');
  // A tied attack repeats step 2, retaining the surprise penalty already rolled.
  const penalty = surprise ? (surprisePenalty ?? tossCoins(3, random).tails) : 0;
  if (!Number.isInteger(penalty) || penalty < 0 || penalty > 3) throw new RangeError('Invalid surprise penalty');
  const player = rollAttack(playerExpertise, surprise === 'enemy' ? penalty : 0, random);
  const enemy = rollAttack(enemyExpertise, surprise === 'player' ? penalty : 0, random);
  return { player, enemy, surprisePenalty: penalty,
    outcome: player.total > enemy.total ? 'player' : player.total < enemy.total ? 'enemy' : 'tie' };
}

export function spendFortune({ outcome, weaponDamage, enemyDamage, fortune, attackBonus = false, defensePoints = 0 }) {
  for (const value of [weaponDamage, enemyDamage, fortune, defensePoints]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError('Invalid damage or Fortune');
  }
  if (!['player', 'enemy', 'tie'].includes(outcome)) throw new TypeError('Invalid outcome');
  if (outcome === 'player') {
    const spent = attackBonus && fortune > 0 ? 1 : 0;
    return { playerLoss: 0, enemyLoss: weaponDamage + spent, fortuneSpent: spent };
  }
  if (outcome === 'enemy') {
    const spent = Math.min(defensePoints, fortune, enemyDamage);
    return { playerLoss: enemyDamage - spent, enemyLoss: 0, fortuneSpent: spent };
  }
  return { playerLoss: 0, enemyLoss: 0, fortuneSpent: 0 };
}

export function recoverVitality(vitality, amount, maximum = 20) {
  if (![vitality, amount, maximum].every(Number.isFinite) || amount < 0 || maximum < 0) {
    throw new RangeError('Invalid Vitality recovery');
  }
  return vitality <= 0 ? vitality : Math.min(maximum, vitality + amount);
}

// Apply the shared numerical rules for the books' optional Viking duels.
export function duelInteger(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid duel value');
  return value;
}

export function duelFighter(input) {
  return {strength:duelInteger(input?.strength, 1), energy:duelInteger(input?.energy)};
}

export function adjustStrengthEnergy(player, opponent) {
  const difference = player.strength - opponent.strength;
  if (difference > 0) opponent.energy = Math.max(0, opponent.energy - difference);
  if (difference < 0) player.energy = Math.max(0, player.energy + difference);
  return difference;
}

export function rollDuelDice(action, roll) {
  return {playerDie:duelInteger(action.playerDie ?? roll(), 1, 6),
    enemyDie:duelInteger(action.enemyDie ?? roll(), 1, 6)};
}

export function resolveDuelStrike(player, opponent, difference) {
  const playerDamage = Number(difference < -1), enemyDamage = Number(difference > 1);
  player.energy = Math.max(0, player.energy - playerDamage);
  opponent.energy = Math.max(0, opponent.energy - enemyDamage);
  return {playerDamage, enemyDamage};
}

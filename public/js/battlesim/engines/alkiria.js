// Шанс-table / life-tier battle engine for the Alkiria gamebooks (book 412).

// The printed number table at the back of the book: 60 cells, values 1-12.
// "Pointing blindly" is modelled as drawing one cell uniformly at random.
export const CHANCE_TABLE = [
  4, 8, 11, 5, 2, 10,
  10, 2, 4, 9, 11, 8,
  8, 5, 11, 7, 2, 4,
  6, 10, 1, 5, 8, 12,
  12, 7, 4, 12, 3, 5,
  4, 9, 2, 6, 9, 2,
  6, 1, 11, 12, 11, 4,
  3, 12, 7, 10, 7, 9,
  6, 9, 3, 8, 2, 6,
  3, 5, 11, 10, 7, 3,
];

export function drawChance() {
  return CHANCE_TABLE[Math.floor(Math.random() * CHANCE_TABLE.length)];
}

// Life level + Strength from current Life Points (ж.т.).
export function lifeTier(lp) {
  if (lp > 40) return { level: 'I', str: 7 };
  if (lp >= 26) return { level: 'II', str: 5 };
  if (lp >= 11) return { level: 'III', str: 3 };
  if (lp >= 1)  return { level: 'IV', str: 1 };
  return { level: 'V', str: 0 };
}

export function strengthForLp(lp) { return lifeTier(lp).str; }

// One strike: Шанс + player Strength vs enemy Strength.
// sum > enemyStr -> enemy loses 2; sum < -> player loses 2; equal -> both lose 1.
export function resolveStrike(playerLp, enemyStr, chance, strengthBonus = 0) {
  const playerStr = strengthForLp(playerLp) + strengthBonus;
  const sum = chance + playerStr;
  if (sum > enemyStr) return { chance, playerStr, sum, outcome: 'enemy',  playerLoss: 0, enemyLoss: 2 };
  if (sum < enemyStr) return { chance, playerStr, sum, outcome: 'player', playerLoss: 2, enemyLoss: 0 };
  return { chance, playerStr, sum, outcome: 'both', playerLoss: 1, enemyLoss: 1 };
}

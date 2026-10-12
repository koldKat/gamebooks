export function wonderlandInteger(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Wonderland value');
  return value;
}

export function wonderlandDraw(mode, roll = () => Math.floor(Math.random() * 6) + 1,
  random = Math.random, count = 2) {
  if (![1, 2, 4].includes(count)) throw new RangeError('Invalid dice count');
  if (mode === 'dice') {
    const dice = Array.from({ length: count }, () => wonderlandInteger(roll(), 1, 6));
    return { value: dice.reduce((a, b) => a + b, 0), dice, cards: [], ace: false };
  }
  if (mode !== 'cards') throw new RangeError('Invalid random mode');
  const cards = Array.from({ length: count === 4 ? 2 : 1 }, () => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Invalid card draw');
    const index = Math.floor(n * 52), rank = index % 13 + 1;
    return { rank, suit: ['clubs', 'diamonds', 'hearts', 'spades'][Math.floor(index / 13)],
      red: index >= 13 && index < 39, value: rank === 1 ? 12 : Math.min(rank, 11) };
  });
  return { value: cards.reduce((a, b) => a + b.value, 0), cards, dice: [],
    ace: cards.some(card => card.rank === 1) };
}

export function wonderlandTest(attribute, value, mode = 'dice', roll, random) {
  if (!['agility', 'logic', 'combat', 'endurance', 'insanity'].includes(attribute)) throw new RangeError('Invalid attribute');
  if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new RangeError('Invalid attribute value');
  const draw = wonderlandDraw(mode, roll, random, attribute === 'endurance' ? 4 : 2);
  return { ...draw, passed: draw.ace || (attribute === 'insanity' ? draw.value >= value : draw.value <= value) };
}

export function createWonderlandCharacter(points) {
  const keys = ['agility', 'logic', 'combat', 'endurance'];
  if (!points || keys.reduce((sum, key) => sum + wonderlandInteger(points[key], 0, 5), 0) !== 10) {
    throw new RangeError('Allocate exactly ten points, at most five per attribute');
  }
  return { agility: 6 + points.agility, logic: 6 + points.logic, combat: 6 + points.combat,
    endurance: 20 + points.endurance, insanity: 0, curiouser: 3, pen: 3 };
}

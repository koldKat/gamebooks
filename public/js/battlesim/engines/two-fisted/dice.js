// Roll the printed FISTS dice, including explicit zero dice and one-time lucky rerolls.
export function combatInteger(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}

export function rollSix(roll = () => Math.floor(Math.random() * 6) + 1) {
  return combatInteger(roll(), 1, 6);
}

export function rollFists(count, roll, {luckySix = false, bonus = 0} = {}) {
  combatInteger(count, 0, 20); combatInteger(bonus, -1000, 1000);
  const dice = [], rerolls = [];
  for (let i = 0; i < count; i++) {
    const die = rollSix(roll);
    const extra = luckySix && die === 6 ? rollSix(roll) : null;
    dice.push(extra === null ? die : 6 + extra); rerolls.push(extra);
  }
  return {dice, rerolls, score: dice.length ? Math.max(...dice) + bonus : 0};
}

export function rollIndex(count, roll) {
  combatInteger(count, 1, 1000);
  if (count === 1) return 0;
  let range = 6, digits = 1;
  while (range < count) {range *= 6; digits++;}
  const limit = range - range % count;
  for (let attempt = 0; attempt < 1000; attempt++) {
    let value = 0;
    for (let i = 0; i < digits; i++) value = value * 6 + rollSix(roll) - 1;
    if (value < limit) return value % count;
  }
  throw new RangeError('Random source repeatedly rejected');
}

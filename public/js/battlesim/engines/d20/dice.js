// Roll bounded d20 checks and damage expressions for independent encounters.
export function combatNumber(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}

export function rollDie(sides, random = Math.random) {
  combatNumber(sides, 2, 1000);
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
  return Math.floor(value * sides) + 1;
}

export function damageExpression(input) {
  if (typeof input !== 'string' || input.length > 60) throw new RangeError('Invalid damage expression');
  const match = /^(?:(\d{1,3})d(\d{1,4})(?:\s*([+-])\s*(\d{1,6}))?|(\d{1,6}))$/i.exec(input.trim());
  if (!match) throw new RangeError('Invalid damage expression');
  if (match[5] != null) return {count:0, sides:0, modifier:combatNumber(Number(match[5]))};
  return {count:combatNumber(Number(match[1]), 1, 100), sides:combatNumber(Number(match[2]), 2, 1000),
    modifier:combatNumber((match[3] === '-' ? -1 : 1) * Number(match[4] || 0), -1000000)};
}

export function rollDamage(expression, {critical = false, random = Math.random, dice} = {}) {
  const parsed = damageExpression(expression), count = parsed.count * (critical ? 2 : 1);
  if (dice !== undefined && (!Array.isArray(dice) || dice.length !== count)) throw new RangeError('Wrong damage dice');
  const rolls = dice === undefined ? Array.from({length:count}, () => rollDie(parsed.sides, random))
    : dice.map(value => combatNumber(value, 1, parsed.sides));
  return {amount:Math.max(0, rolls.reduce((sum, value) => sum + value, parsed.modifier)), rolls, modifier:parsed.modifier};
}

export function rollCheck(bonus, {advantage = false, disadvantage = false, random = Math.random, dice} = {}) {
  combatNumber(bonus, -1000, 1000);
  const mode = Boolean(advantage) === Boolean(disadvantage) ? 'normal' : advantage ? 'advantage' : 'disadvantage';
  const count = mode === 'normal' ? 1 : 2;
  if (dice !== undefined && (!Array.isArray(dice) || dice.length !== count)) throw new RangeError('Wrong check dice');
  const rolls = dice === undefined ? Array.from({length:count}, () => rollDie(20, random))
    : dice.map(value => combatNumber(value, 1, 20));
  const natural = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
  return {rolls, mode, natural, bonus, total:natural + bonus};
}

export function rollAttack(bonus, armourClass, options = {}) {
  combatNumber(armourClass, 0, 1000);
  const result = rollCheck(bonus, options);
  return {...result, critical:result.natural === 20,
    hit:result.natural === 20 || result.natural !== 1 && result.total >= armourClass};
}

export function rollSave(bonus, difficulty, options = {}) {
  combatNumber(difficulty, 0, 1000);
  const result = rollCheck(bonus, options);
  return {...result, success:result.total >= difficulty};
}

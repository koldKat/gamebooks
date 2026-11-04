// Calculate Lost Jedi combat rolls and explicit Jedi Point adjustments.
export function integer(value, minimum, maximum, label = 'Value') {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
    throw new RangeError(`${label} is required.`);
  }
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

export const rollDie = (random = Math.random) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid die source.');
  return 1 + Math.floor(value * 6);
};

export function weaponAttack({weapon, range, blaster, lightsabre, technical, target, armoured = true}) {
  if (!['range', 'close'].includes(range)) throw new RangeError('Choose the combat range.');
  target = integer(target, 1, 99, 'Target');
  if (weapon === 'unarmed') {
    if (range !== 'close') throw new RangeError('Unarmed attacks require Up Close combat.');
    return {skill: 1, bonus: 0, target};
  }
  if (weapon === 'lightsabre') {
    if (range !== 'close') throw new RangeError('A lightsabre requires Up Close combat.');
    return {skill: integer(lightsabre, 0, 99, 'Lightsabre skill'), bonus: 1, target};
  }
  if (weapon === 'speeder') return {skill: integer(technical, 0, 99, 'Technical skill'), bonus: 0, target};
  if (weapon === 'force-pike') {
    if (range !== 'close') throw new RangeError('A force pike requires Up Close combat.');
    return {skill:1, bonus:0, target};
  }
  if (!['blaster', 'rifle', 'redemptor', 'eweb', 'dart-launcher'].includes(weapon)) throw new RangeError('Choose a combat weapon.');
  return {skill: integer(blaster, 0, 99, 'Blaster skill'), bonus: 0,
    target: weapon === 'redemptor' ? 6 : weapon === 'rifle' && armoured && target > 7 ? target - 1 : target};
}

export function previewStrike(strike, adjustment, jediPoints) {
  const die = integer(strike.die, 1, 6, 'Die');
  const skill = integer(strike.skill, 0, 99, 'Combat skill');
  const bonus = integer(strike.bonus ?? 0, -99, 99, 'Attack bonus');
  const target = integer(strike.target, 1, 99, 'Target');
  const points = integer(jediPoints, 0, 999, 'Jedi Power Points');
  const change = integer(adjustment, -999, 999, 'Die adjustment');
  const cost = Math.abs(change);
  if (cost > points) throw new RangeError('Not enough Jedi Power Points.');
  const total = die + change + skill + bonus;
  // The source changes a roll by one per point without imposing a six-point roll cap.
  return {die, adjustment: change, cost, total, target, hit: total >= target, remainingPoints: points - cost};
}

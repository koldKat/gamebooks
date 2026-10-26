export const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const damageSpec = value => {
  if (!value || typeof value !== 'object') throw new RangeError('Choose weapon damage');
  const result={dice:integer(value.dice, 0, 10), add:integer(value.add, -100, 1000)};
  if(value.divideBy !== undefined)result.divideBy=integer(value.divideBy,1,100);
  return result;
};
export function dice(count, roll) {
  return Array.from({length:count}, () => integer(roll(), 1, 6));
}
export function damage(spec, roll) {
  const values = dice(spec.dice, roll);
  return {dice:values, amount:Math.max(0, Math.ceil(values.reduce((a,b) => a+b, spec.add)/(spec.divideBy ?? 1)))};
}
export function finish(fight, status) {
  fight.status = status;
  fight.destination = status === 'win' ? fight.rules.winSection ?? null : status === 'loss' ? fight.rules.lossSection ?? null : null;
  if (fight.rules.nonfatal) {
    fight.hero.hp = Math.max(0, fight.startingHp - (status === 'loss' ? fight.rules.nonfatalLossDamage ?? 0 : 0));
  }
  fight.events.push({kind:'outcome', status, destination:fight.destination});
}

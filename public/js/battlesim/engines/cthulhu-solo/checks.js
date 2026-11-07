// Resolve the printed percentile combat checks and damage dice without story state.
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}

function die(sides, random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
  return Math.floor(value * sides) + 1;
}

export function successLevel(roll, skill, { hard = Math.floor(skill / 2), extreme = Math.floor(skill / 5) } = {}) {
  integer(roll, 1, 1000); integer(skill, 0, 1000);
  integer(hard, 0, skill); integer(extreme, 0, hard);
  if (roll >= 96) return 0;
  if (roll === 1) return 5;
  if (roll > skill) return 1;
  if (roll <= extreme) return 4;
  if (roll <= hard) return 3;
  return 2;
}

export function percentileCheck(skill, bonus = 0, random = Math.random, addedRoll = 0, thresholds) {
  integer(skill, 0, 1000); integer(bonus, -2, 2); integer(addedRoll, 0, 100);
  const units = die(10, random) - 1;
  const tens = Array.from({ length: 1 + Math.abs(bonus) }, () => die(10, random) - 1);
  const candidates = tens.map(n => n * 10 + units || 100);
  const raw = (bonus < 0 ? Math.max : Math.min)(...candidates);
  const roll = raw + addedRoll;
  return { units, tens, raw, addedRoll, roll, skill, level: successLevel(roll, skill, thresholds) };
}

export function combatCheck(skill, bonus = 0, random = Math.random, mode = 'percentile', addedRoll = 0, thresholds) {
  if (mode === 'percentile') return percentileCheck(skill, bonus, random, addedRoll, thresholds);
  if (mode !== 'coin' || addedRoll) throw new RangeError('Invalid combat mode');
  integer(skill, 0, 1000); integer(bonus, -2, 2);
  const flips = [die(2, random) === 2];
  if (bonus < 0 ? flips[0] : !flips[0] && (bonus > 0 || skill > 60)) flips.push(die(2, random) === 2);
  return { flips, skill, roll: flips.at(-1) ? 'heads' : 'tails', level: flips.at(-1) ? 2 : 1 };
}

export function damageDice(expression, random = Math.random, { db = '0', maximize = false } = {}) {
  if (typeof expression !== 'string' || typeof db !== 'string' || /db/i.test(db)) throw new RangeError('Invalid damage dice');
  const bonus = db.replace(/^\+/, '');
  const formula = expression.replace(/\+DB/gi, bonus.startsWith('-') ? bonus : `+${bonus}`)
    .replace(/DB/gi, bonus).replace(/\s/g, '').toUpperCase();
  const terms = formula.match(/[+-]?(?:\d+D\d+|\d+)/g);
  if (!terms || terms.join('') !== formula || terms.length > 12) throw new RangeError('Invalid damage dice');
  const rolls = [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const parts = term.replace(/^[+-]/, '').split('D');
    if (parts.length === 1) total += sign * integer(Number(parts[0]), 0, 1000);
    else {
      const count = integer(Number(parts[0]), 1, 24), sides = integer(Number(parts[1]), 2, 100);
      const values = Array.from({ length: count }, () => maximize ? sides : die(sides, random));
      rolls.push({ sign, sides, values }); total += sign * values.reduce((a, b) => a + b, 0);
    }
  }
  return { formula, rolls, total: Math.max(0, total) };
}

export function opposedResult(attack, defense, { tie = 'defender' } = {}) {
  integer(attack, 0, 5); integer(defense, 0, 5);
  if (!['attacker', 'defender', 'both'].includes(tie)) throw new RangeError('Invalid opposed tie');
  if (attack < 2 && defense < 2) return { attacker: false, defender: false };
  if (attack === defense) return { attacker: tie !== 'defender', defender: tie !== 'attacker' };
  return { attacker: attack > defense, defender: defense > attack };
}

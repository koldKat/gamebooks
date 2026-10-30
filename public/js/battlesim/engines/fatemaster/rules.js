// Validate Fatemaster combatants and calculate bonuses from their current point pools.
export function integer(value, label, minimum = 0, maximum = 10000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${label}`);
  return value;
}

export function pointBonus(points) {
  // The printed 15-point creature has +2: damage taking it to 12 must not improve its bonus.
  return points >= 12 ? 2 : points >= 10 ? 1 : points <= 2 ? -2 : points <= 4 ? -1 : 0;
}

export function rollDice(count, die) {
  integer(count, 'dice count', 1, 3);
  if (die && typeof die === 'object' && Object.hasOwn(die,'total')) {
    return {dice:null,total:integer(die.total,'manual dice total',count,count * 6),manual:true};
  }
  if (typeof die !== 'function') throw new Error('Choose automatic or manual dice');
  const dice = Array.from({length: count}, () => integer(die(), 'die', 1, 6));
  return {dice, total: dice.reduce((total, value) => total + value, 0)};
}

export function combatant(input, player = false) {
  const unit = structuredClone(input);
  if (!unit || typeof unit.name !== 'string' || !unit.name.trim() || unit.name.length > 160) throw new Error('Invalid combatant name');
  unit.strength = integer(unit.strength, 'Strength', 1);
  unit.agility = integer(unit.agility, 'Agility', 1);
  unit.power = integer(unit.power, 'Power');
  unit.maxStrength = integer(unit.maxStrength ?? unit.strength, 'Strength score', unit.strength);
  unit.maxAgility = integer(unit.maxAgility ?? unit.agility, 'Agility score', unit.agility);
  unit.maxPower = integer(unit.maxPower ?? unit.power, 'Power score', unit.power);
  unit.damage = integer(unit.damage, 'weapon damage', 0);
  unit.weaponKind ??= 'normal';
  if (!['normal', 'silver', 'magic'].includes(unit.weaponKind)) throw new Error('Invalid weapon kind');
  if (player) {
    unit.attackModifier = integer(unit.attackModifier ?? 0, 'attack modifier', -100, 100);
    unit.weaponAttack = integer(unit.weaponAttack ?? 0, 'weapon modifier', -100, 100);
    unit.defenceModifier = integer(unit.defenceModifier ?? 0, 'defence modifier', -100, 100);
    if (unit.renewPower !== undefined && typeof unit.renewPower !== 'boolean') throw new Error('Invalid renewal setting');
    if (unit.scrolls) {
      for (const spell of ['healing', 'invisibility']) integer(unit.scrolls[spell] ?? 0, 'scroll charge', 0, 1);
    }
  } else {
    unit.attackBase = integer(unit.attackBonus, 'printed attack bonus', -100, 100) - pointBonus(unit.strength);
    unit.defenceBase = integer(unit.defenceBonus, 'printed defence bonus', -100, 100) - pointBonus(unit.agility);
    unit.condition = 'active';
  }
  return unit;
}

export const conscious = unit => unit.strength > 0 && unit.agility > 0;
export const participating = unit => conscious(unit) && unit.condition === 'active';
export const playerAttack = player => pointBonus(player.strength) + player.attackModifier + player.weaponAttack;
export const enemyAttack = enemy => pointBonus(enemy.strength) + enemy.attackBase;
export const enemyDefence = enemy => pointBonus(enemy.agility) + enemy.defenceBase;
export function playerDefence(fight, enemy) {
  const invisible = fight.invisibleTo.includes(enemy.id) ? (enemy.invisibilityBonus ?? fight.rules.invisibilityBonus ?? 2) : 0;
  return pointBonus(fight.player.agility) + fight.player.defenceModifier + invisible;
}

export function damageOpponent(enemy, amount, pool) {
  integer(amount, 'damage');
  pool ??= enemy.strength >= enemy.agility ? 'strength' : 'agility';
  if (!['strength', 'agility'].includes(pool)) throw new Error('Invalid damage pool');
  enemy[pool] = Math.max(0, enemy[pool] - amount);
  if (!conscious(enemy)) enemy.condition = 'unconscious';
  return pool;
}

export function activeAttackers(fight) {
  const available = fight.opponents.filter(participating), selected = [];
  if (fight.rules.mixedAttackers) {
    for (const enemy of available) {
      if (!selected.some(other => other.group === enemy.group)) selected.push(enemy);
      if (selected.length === 2) break;
    }
  }
  for (const enemy of available) {
    if (selected.length === 2) break;
    if (!selected.includes(enemy)) selected.push(enemy);
  }
  return selected;
}

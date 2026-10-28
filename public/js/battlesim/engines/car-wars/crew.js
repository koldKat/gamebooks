// Shared crew and personal-weapon rules. Printed identities and stats come from
// database metadata; this module never chooses a book or encounter.
const whole = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError('Enter a valid whole number');
  return value;
};

export function crewAlive(unit, seat) {
  const hp = unit[seat + 'Hp'] ?? 0;
  return hp > (seat === 'gunner' && unit.robotGunner ? 0 : 1);
}

export function firingCrew(unit, round) {
  whole(round, 1);
  if (unit.skipTurn > 0 || unit.hp <= 0 || unit.powerPlant?.boxes === 0) return [];
  const crew = [];
  if (crewAlive(unit, 'driver') && !(unit.skipFire > 0)) crew.push('driver');
  const robot = unit.robotGunner;
  if (unit.gunnerSeat && crewAlive(unit, 'gunner') && !(unit.gunnerSkipFire > 0)
      && (!robot?.activeTurns || round <= robot.activeTurns)) crew.push('gunner');
  return crew;
}

export function targetingBonus(unit, seat) {
  if (seat === 'gunner' && unit.robotGunner) return 0;
  // Legacy common computers stay common. Explicit crew-owned gadgets apply
  // only to their owner and stop contributing when destroyed.
  const owned = (unit.gadgets ?? []).filter(g => g.computerFor);
  if (!owned.length) return whole(unit.computerBonus ?? 0);
  return owned.filter(g => g.computerFor === seat && g.boxes > 0)
    .reduce((total, g) => total + whole(g.bonus ?? 0), 0);
}

export function crewGunnery(unit, seat) {
  const value = seat === 'gunner' ? unit.gunnerGunnery : unit.gunnery;
  if (value == null) throw new RangeError('Enter the missing ' + seat + ' Gunnery');
  return whole(value, -100);
}

export function weaponGroups(unit, indices, facing) {
  if (!Array.isArray(indices) || new Set(indices).size !== indices.length)
    throw new RangeError('A weapon may fire only once per turn');
  const groups = new Map();
  for (const index of indices) {
    whole(index);
    const weapon = unit.weapons[index];
    if (!weapon || weapon.boxes <= 0) throw new RangeError('Weapon unavailable');
    if (facing && !facing.includes(weapon.direction)) throw new RangeError('That weapon cannot face the enemy');
    const key = weapon.linkedGroup ? 'linked:' + weapon.linkedGroup : 'weapon:' + index;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  }
  return [...groups.values()];
}

export function assignWeapons(unit, indices, round, options = {}) {
  const groups = weaponGroups(unit, indices, options.facing);
  const available = firingCrew(unit, round);
  const seats = options.seats ?? available;
  if (new Set(seats).size !== seats.length || seats.some(seat => !available.includes(seat)))
    throw new RangeError('Choose an available firing crew member');
  if (groups.length > seats.length) throw new RangeError('One weapon system per available crew member');
  const targets = options.targets ?? groups.map(() => options.target ?? 0);
  if (targets.length !== groups.length) throw new RangeError('Choose one target per weapon system');
  targets.forEach(target => whole(target));
  if (unit.robotGunner?.sameTargetAsDriver && new Set(targets).size > 1)
    throw new RangeError('This robot must fire at the driver’s target');
  return groups.map((weapons, i) => ({seat: seats[i], weapons, target: targets[i],
    gunnery: crewGunnery(unit, seats[i]), computerBonus: targetingBonus(unit, seats[i]),
    ...(seats[i] === 'gunner' && unit.robotGunner ? {fixedCombatBonus: unit.robotGunner.combatBonus} : {})}));
}

export function installRobotGunner(source, profile) {
  const unit = structuredClone(source);
  whole(profile.hp, 1); whole(profile.combatBonus, -100);
  if (profile.activeTurns != null) whole(profile.activeTurns, 1);
  unit.robotGunner = structuredClone(profile);
  unit.gunnerSeat = true; unit.gunnerHp = profile.hp; unit.gunnerArmour = 0;
  // Combat Bonus is the robot's complete printed accuracy. It does not gain
  // the driver's computer or an additional gunner targeting computer.
  unit.gunnerGunnery = profile.combatBonus;
  unit.gunnerDriving = null;
  return unit;
}

export function replaceCrewDriver(source, driving) {
  const unit = structuredClone(source);
  if (unit.robotGunner || !crewAlive(unit, 'gunner')) throw new RangeError('No human replacement driver');
  const replacement = driving ?? unit.gunnerDriving;
  if (replacement == null) throw new RangeError('Enter the replacement driver’s Driving');
  whole(replacement);
  unit.driverHp = unit.gunnerHp; unit.driverArmour = unit.gunnerArmour ?? 0;
  unit.driving = replacement; unit.gunnery = unit.gunnerGunnery;
  unit.gunnerHp = 0; unit.gunnerArmour = 0; unit.needsReplacementDriver = false;
  unit.skipFire = unit.gunnerSkipFire ?? 0; unit.gunnerSkipFire = 0;
  return unit;
}

export function personalWeaponDamage(weapon, roll) {
  const die = () => whole(roll(6), 1);
  if (weapon.flatDamage != null) return {damage: whole(weapon.flatDamage), knockout: false, dice: []};
  const values = [];
  let damage = 0, knockout = false;
  if (weapon.damageByDie) {
    if (weapon.damageByDie.length !== 6 || weapon.damageByDie.some(v => !Number.isSafeInteger(v) || v < 0))
      throw new RangeError('Invalid damage table');
    const value = die();
    if (value > 6) throw new RangeError('Invalid die');
    values.push(value); damage = weapon.damageByDie[value - 1];
    if (value === 6 && weapon.knockoutOnDamageSixFollowup) {
      const next = die();
      if (next > 6) throw new RangeError('Invalid die');
      values.push(next); knockout = weapon.knockoutOnDamageSixFollowup.includes(next);
    }
  } else {
    whole(weapon.damageDice, 1);
    for (let i = 0; i < weapon.damageDice; i++) {
      const value = die();
      if (value > 6) throw new RangeError('Invalid die');
      values.push(value); damage += value;
    }
  }
  return {damage, knockout, dice: values};
}

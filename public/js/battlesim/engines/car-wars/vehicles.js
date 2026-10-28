// Simulator-local ownership and maintenance. No shared inventory or equipment
// object is read or modified here. Maintenance allowances come from DB metadata.
const copy = value => structuredClone(value);
const whole = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Enter a valid whole number');
  return value;
};

export function rememberVehicle(source) {
  const game = copy(source);
  game.vehicles ??= {};
  if (game.vehicle?.ownedStateKey) game.vehicles[game.vehicle.ownedStateKey] = copy(game.vehicle);
  return game;
}

export function switchVehicle(source, profile) {
  if (!profile?.ownedStateKey) throw new RangeError('Choose an owned vehicle profile');
  const game = rememberVehicle(source), person = game.character;
  if (!person) throw new RangeError('Enter your character first');
  let vehicle = game.vehicles[profile.ownedStateKey];
  if (!vehicle) {
    vehicle = {...copy(profile), kind:'vehicle', gunnerSeat:!!profile.fixedDriver};
    vehicle.maxHp ??= vehicle.hp;
    vehicle.powerPlant.maxBoxes ??= vehicle.powerPlant.boxes;
    for(const weapon of vehicle.weapons) weapon.maxBoxes ??= weapon.boxes;
    if (profile.fixedDriver) Object.assign(vehicle,{gunnerHp:person.hp,gunnerArmour:person.armour,
      gunnerGunnery:person.gunnery,gunnerDriving:person.driving});
    else Object.assign(vehicle,{driverHp:person.hp,driverArmour:person.armour,
      gunnery:person.gunnery,driving:person.driving,gunnerHp:0,gunnerArmour:0});
  }
  // The character travels between cars, while vehicle damage, components,
  // ammunition, gadgets and any accompanying NPC retain their own state.
  const seat = vehicle.fixedDriver ? 'gunner' : 'driver';
  vehicle[seat+'Hp'] = person.hp; vehicle[seat+'Armour'] = person.armour;
  if (seat === 'driver') {vehicle.gunnery=person.gunnery; vehicle.driving=person.driving;}
  else {vehicle.gunnerGunnery=person.gunnery; vehicle.gunnerDriving=person.driving;}
  game.vehicle=copy(vehicle); game.vehicles[profile.ownedStateKey]=copy(vehicle);
  return game;
}

export function rememberCombatCharacter(source, vehicle) {
  const game = copy(source), unit = copy(vehicle), seat = unit.fixedDriver ? 'gunner' : 'driver';
  game.character = {...game.character,hp:unit[seat+'Hp'],armour:unit[seat+'Armour'],
    gunnery:seat === 'driver' ? unit.gunnery : unit.gunnerGunnery,
    driving:seat === 'driver' ? unit.driving : unit.gunnerDriving ?? game.character.driving};
  game.vehicle=unit;
  return rememberVehicle(game);
}

export function applyMaintenance(source, rule, requested = {}) {
  if (!rule || !source.vehicle || source.fight?.status === 'fighting' || source.fight?.status === 'awaitingDriver')
    throw new RangeError('Maintenance is available between fights');
  let game = rememberVehicle(source), unit = game.vehicle;
  if (rule.repair) {
    const hp = whole(requested.hp ?? 0), parts = requested.parts ?? [];
    if (hp > rule.repair.generalHp || parts.reduce((n,p) => n+whole(p.amount),0) > rule.repair.componentBoxes)
      throw new RangeError('The section does not allow that much repair');
    const claim = String(rule.section)+':'+unit.ownedStateKey;
    game.maintenanceClaims ??= [];
    if (game.maintenanceClaims.includes(claim)) throw new RangeError('This repair allowance has already been used');
    unit.hp=Math.min(unit.maxHp,unit.hp+hp);
    for (const part of parts) {
      const component = part.component === 'plant' ? unit.powerPlant : unit.weapons[whole(part.component)];
      if (!component) throw new RangeError('Choose a vehicle component');
      component.boxes=Math.min(component.maxBoxes ?? component.boxes,component.boxes+part.amount);
    }
    game.maintenanceClaims.push(claim);
  }
  if (rule.armour != null) {
    game.character.armour=whole(rule.armour);
    unit[unit.fixedDriver ? 'gunnerArmour' : 'driverArmour']=rule.armour;
  }
  if (rule.ammunition) for (const weapon of unit.weapons) {
    weapon.ammo=/laser/i.test(weapon.name) ? null : weapon.oneShot ? 1
      : weapon.ammoCapacity ?? (/machine|vulcan|paint|oil/i.test(weapon.name) ? 20 : 10);
  }
  game.vehicle=unit;
  return rememberVehicle(game);
}

// Ship equipment and combat rules for Cosmic Scout.
const copy = value => structuredClone(value);
const ships = {
  centurion: { weapons: 2, energy: 120, volume: 260, mounts: 6, torpedoes: 3, speed: 11, manoeuvre: 10 },
  morningstar: { weapons: 4, energy: 120, volume: 180, mounts: 2, torpedoes: 1, speed: 12, manoeuvre: 11 },
  ghost: { weapons: 3, energy: 120, volume: 220, mounts: 4, torpedoes: 2, speed: 11, manoeuvre: 11 },
};
const equipment = {
  laser: { power: 10, energy: 5, volume: 0 },
  plasma: { power: 15, energy: 7, volume: 0 },
  ion: { power: 20, energy: 10, volume: 0 },
  phaser: { power: 25, energy: 15, volume: 0 },
  small: { power: 100, energy: 20, volume: 50 },
  medium: { power: 200, energy: 30, volume: 80 },
  large: { power: 300, energy: 40, volume: 100 },
  targeting: { energy: 1, volume: 5 },
  decoder: { energy: 3, volume: 20 },
  scanner: { energy: 4, volume: 15 },
  amplifier: { energy: 2, volume: 10 },
  jammer: { energy: 5, volume: 10 },
};
const weaponTypes = new Set(['laser', 'plasma', 'ion', 'phaser']);
const shieldTypes = new Set(['small', 'medium', 'large']);
const utilityTypes = new Set(['targeting', 'decoder', 'scanner', 'amplifier', 'jammer']);
const missilePower = { krotal: 100, leech: 150 };

function integer(value, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError('Invalid ship value');
  return value;
}
function items(value, allowed, maximum) {
  if (!Array.isArray(value) || value.length > maximum || value.some(key => !allowed.has(key))) {
    throw new RangeError('Invalid ship equipment');
  }
  return value;
}
function die() { return Math.floor(Math.random() * 6) + 1; }
function draw(roll) {
  const number = integer(roll(), 6);
  if (!number) throw new RangeError('A die must roll 1-6');
  return number;
}
function inventory(value) {
  if (!value || typeof value !== 'object') throw new RangeError('Invalid missile inventory');
  for (const key of ['krotal', 'leech', 'torpedoes']) integer(value[key], 12);
  return value;
}

export function spaceScoutLoadout(setup) {
  const base = Object.hasOwn(ships, setup?.ship) ? ships[setup.ship] : null;
  if (!base) throw new RangeError('Unknown ship');
  const weapons = items(setup.weapons, weaponTypes, base.weapons);
  const shields = items(setup.shields, shieldTypes, 3);
  const utilities = items(setup.utilities, utilityTypes, 5);
  if (new Set(utilities).size !== utilities.length) throw new RangeError('Duplicate auxiliary device');
  const mounts = items(setup.mounts, new Set(['krotal', 'leech']), base.mounts);
  const installed = [...weapons, ...shields, ...utilities].map(key => equipment[key]);
  const energy = installed.reduce((sum, item) => sum + item.energy, 0);
  const volume = installed.reduce((sum, item) => sum + item.volume, 0);
  if (energy > base.energy || volume > base.volume) throw new RangeError('Ship capacity exceeded');
  return {
    ship: setup.ship, setup: copy(setup), power: weapons.reduce((sum, key) => sum + equipment[key].power, 0),
    maxShields: shields.reduce((sum, key) => sum + equipment[key].power, 0),
    energy, volume, personalVolume: (base.volume - volume) * 10,
    speed: base.speed, manoeuvre: base.manoeuvre, targeting: utilities.includes('targeting'),
    inventory: { krotal: mounts.filter(key => key === 'krotal').length * 2,
      leech: mounts.filter(key => key === 'leech').length, torpedoes: base.torpedoes },
  };
}

export function spaceScoutPersonalEquipment(character, quantities) {
  integer(character?.personalVolume);
  const costs = { suit: 20, armour: 30, protection: 7, blaster: 7, launcher: 15,
    bazooka: 40, battery: 3, bazookaBattery: 10, grenade: 1, medkit: 9 };
  if (!quantities || typeof quantities !== 'object' || Array.isArray(quantities)
      || Object.keys(quantities).some(key => !Object.hasOwn(costs, key))) {
    throw new RangeError('Invalid personal equipment');
  }
  const gear = Object.fromEntries(Object.keys(costs).map(key => [key, integer(quantities[key] ?? 0, 10000)]));
  if (!character.personalVolume) {
    return { suit: 1, armour: 0, protection: 1, blaster: 1, launcher: 0,
      bazooka: 0, battery: 5, bazookaBattery: 0, grenade: 0, medkit: 0, volume: 49 };
  }
  const volume = Object.entries(costs).reduce((sum, [key, cost]) => sum + gear[key] * cost, 0);
  if (volume > character.personalVolume || !(gear.suit + gear.armour)
      || (gear.protection && !gear.battery) || (gear.blaster && !gear.battery)
      || (gear.bazooka && !gear.bazookaBattery)) throw new RangeError('Personal equipment requirements not met');
  return { ...gear, volume };
}

export const SPACE_SCOUT_DUEL_ENEMIES = {
  22: [{name: 'Torpedo boat', attack: 50, shields: 300}],
  32: [{name: 'Fighter', attack: 40, shields: 200}],
  36: [{name: 'First fighter', attack: 50, shields: 120}, {name: 'Second fighter', attack: 30, shields: 150}],
  42: [{name: 'Escort fighter', attack: 75, shields: 250}],
};

export function startSpaceScoutEncounter(character, section, options = {}) {
  const torpedoBoat = () => copy(SPACE_SCOUT_DUEL_ENEMIES[22][0]);
  switch (section) {
    case 12: return startSpaceScoutDuel(character, [torpedoBoat()], {
      openingDamage: draw(options.roll ?? die) * character.power });
    case 22: return startSpaceScoutDuel(character, [torpedoBoat()]);
    case 30: {
      if (!Array.isArray(options.missiles) || options.missiles.length > 12) throw new RangeError('Opening missiles required');
      const next = copy(character);
      const damage = options.missiles.reduce((sum, type) => sum + spendMissile(next, type), 0);
      return startSpaceScoutDuel(next, [torpedoBoat()], { openingDamage: damage });
    }
    case 32: return startSpaceScoutDuel(character, SPACE_SCOUT_DUEL_ENEMIES[32], {
      openingDamage: integer(options.openingDamage) });
    case 36: return startSpaceScoutDuel(character,
      SPACE_SCOUT_DUEL_ENEMIES[36], { shieldPenalty: 100 });
    case 42: return startSpaceScoutDuel(character, SPACE_SCOUT_DUEL_ENEMIES[42]);
    case 49: case 66: return startSpaceScoutFleet(character);
    case 'manual': return startSpaceScoutDuel(character, options.enemies,
      { shields: options.shields });
    default: throw new RangeError('Unknown encounter');
  }
}

function opponent(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) throw new RangeError('Invalid opponent');
  integer(value.attack); integer(value.shields);
  return copy(value);
}
function check(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  if (fight.stage && fight.stage !== 'duel') throw new RangeError('Fleet phase requires its own rules');
  integer(fight.power); integer(fight.shields); integer(fight.round); integer(fight.target);
  inventory(fight.inventory);
  if (!Array.isArray(fight.enemies) || fight.target >= fight.enemies.length || !fight.shields) {
    throw new RangeError('Invalid fight state');
  }
  for (const enemy of fight.enemies) opponent(enemy);
  if (!fight.enemies[fight.target].shields) throw new RangeError('Opponent already defeated');
}
function advance(fight) {
  if (!fight.shields) { fight.status = 'loss'; return; }
  while (fight.target < fight.enemies.length && !fight.enemies[fight.target].shields) fight.target++;
  if (fight.target === fight.enemies.length) fight.status = 'win';
}

export function startSpaceScoutDuel(character, enemies, options = {}) {
  integer(character?.power); integer(character?.maxShields); inventory(character?.inventory);
  if (!Array.isArray(enemies) || !enemies.length || enemies.length > 3) throw new RangeError('Invalid opponents');
  const shields = options.shields === undefined ? character.maxShields : integer(options.shields);
  if (shields > character.maxShields) throw new RangeError('Shields exceed capacity');
  const penalty = integer(options.shieldPenalty ?? 0);
  const opening = integer(options.openingDamage ?? 0);
  const fight = {
    rulesVersion: 1, status: 'fighting', power: character.power, shields: Math.max(0, shields - penalty),
    targeting: !!character.targeting, inventory: copy(character.inventory),
    enemies: enemies.map(opponent), target: 0, round: 0,
  };
  fight.enemies[0].shields = Math.max(0, fight.enemies[0].shields - opening);
  advance(fight);
  return fight;
}

export function spaceScoutDuelRound(fight, roll = die) {
  check(fight);
  const next = copy(fight), target = next.target, enemy = next.enemies[target];
  const playerRoll = draw(roll), enemyLoss = playerRoll * next.power;
  enemy.shields = Math.max(0, enemy.shields - enemyLoss);
  let enemyRoll = null, playerLoss = 0;
  // Ordinary duels stop before a defeated opponent can retaliate.
  if (enemy.shields) {
    enemyRoll = draw(roll); playerLoss = enemyRoll * enemy.attack;
    next.shields = Math.max(0, next.shields - playerLoss);
  }
  next.round++;
  advance(next);
  return { fight: next, target, playerRoll, enemyRoll, enemyLoss, playerLoss };
}

export function spaceScoutDuelMissile(fight, type, quantity = 1) {
  check(fight);
  const power = Object.hasOwn(missilePower, type) ? missilePower[type] : null;
  if (!power || !integer(quantity, 12) || quantity > fight.inventory[type]) throw new RangeError('Missiles unavailable');
  if (type === 'krotal' && !fight.targeting) throw new RangeError('Targeting device required');
  const next = copy(fight), target = next.target, damage = power * quantity;
  next.inventory[type] -= quantity;
  next.enemies[target].shields = Math.max(0, next.enemies[target].shields - damage);
  advance(next);
  return { fight: next, target, damage, type, quantity };
}

export function startSpaceScoutFleet(character) {
  const fight = startSpaceScoutDuel(character, Array.from({ length: 3 }, (_, i) =>
    ({ name: `Kilarti fighter ${i + 1}`, attack: 60, shields: 300 })));
  fight.stage = 'headon';
  fight.speed = integer(character.speed);
  fight.manoeuvre = integer(character.manoeuvre);
  return fight;
}

function fleetCheck(fight, stages) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting' || !stages.includes(fight.stage)
      || !Array.isArray(fight.enemies) || fight.enemies.length !== 3 || !fight.shields) {
    throw new RangeError('Invalid fleet stage');
  }
  integer(fight.shields); integer(fight.power); inventory(fight.inventory);
  for (const enemy of fight.enemies) opponent(enemy);
}

function fleetRoute(fight) {
  if (!fight.shields) { fight.status = 'loss'; return null; }
  const alive = fight.enemies.flatMap((enemy, i) => enemy.shields ? [i] : []);
  if (!alive.length) { fight.status = 'win'; return null; }
  if (alive.length === 1) {
    fight.stage = 'duel'; fight.target = alive[0];
    // Sections 46 and 50 explicitly change the survivor's attack to 50.
    fight.enemies[fight.target].attack = 50;
    return 46;
  }
  if (alive.length === 2) { fight.stage = 'maneuver'; return 56; }
  fight.status = 'loss'; return 87;
}

export function spaceScoutFleetOpening(fight, roll = die) {
  fleetCheck(fight, ['headon']);
  const next = copy(fight), playerRoll = draw(roll), enemyRoll = draw(roll);
  next.enemies[0].shields = Math.max(0, next.enemies[0].shields - playerRoll * next.power);
  // Section 73 applies both shots, including the destroyed enemy's shot.
  next.shields = Math.max(0, next.shields - enemyRoll * next.enemies[0].attack);
  if (!next.shields) next.status = 'loss';
  next.stage = next.enemies[0].shields ? 'missiles-three' : 'missiles-two';
  return { fight: next, playerRoll, enemyRoll, section: next.shields ? (next.enemies[0].shields ? 60 : 80) : null };
}

function fleetMissiles(fight, selections, maximum) {
  if (!Array.isArray(selections) || selections.length > maximum) throw new RangeError('Missile limit exceeded');
  for (const shot of selections) {
    const power = Object.hasOwn(missilePower, shot?.type) ? missilePower[shot.type] : null;
    const target = integer(shot?.target, 2);
    if (!power || !fight.enemies[target].shields || !fight.inventory[shot.type]) {
      throw new RangeError('Missile or target unavailable');
    }
    if (shot.type === 'krotal' && !fight.targeting) throw new RangeError('Targeting device required');
    fight.inventory[shot.type]--;
    fight.enemies[target].shields = Math.max(0, fight.enemies[target].shields - power);
  }
}

export function spaceScoutFleetMissiles(fight, selections = []) {
  fleetCheck(fight, ['missiles-three', 'missiles-two']);
  const next = copy(fight);
  fleetMissiles(next, selections, 3);
  return { fight: next, section: fleetRoute(next) };
}

export function spaceScoutFleetManeuver(fight, targets, selections = [], roll = die) {
  fleetCheck(fight, ['maneuver']);
  const product = integer(fight.speed) * integer(fight.manoeuvre);
  if (![110, 121, 132].includes(product)) throw new RangeError('Unknown ship maneuver');
  const count = product === 110 ? 1 : 2;
  if (!Array.isArray(targets) || targets.length !== count
      || targets.some(target => !Number.isInteger(target) || target < 0 || target > 2 || !fight.enemies[target].shields)) {
    throw new RangeError('Invalid beam allocation');
  }
  const next = copy(fight), rolls = Array.from({ length: count }, () => draw(roll));
  const damage = rolls.map((value, i) => (product === 121 && i === 1 ? Math.ceil(value / 2) : value) * next.power);
  for (let i = 0; i < targets.length; i++) {
    const enemy = next.enemies[targets[i]];
    enemy.shields = Math.max(0, enemy.shields - damage[i]);
  }
  fleetMissiles(next, selections, product === 110 ? 2 : 1);
  next.shields = Math.max(0, next.shields - (product === 110 ? 120 : product === 121 ? 90 : 60));
  let section = 50;
  if (!next.shields) { next.status = 'loss'; section = null; }
  else {
    const survivors = next.enemies.filter(enemy => enemy.shields).length;
    if (survivors > 1) next.status = 'loss';
    else fleetRoute(next);
  }
  return { fight: next, rolls, damage, section };
}

function spendMissile(character, type) {
  const power = Object.hasOwn(missilePower, type) ? missilePower[type] : null;
  if (!power || !character.inventory[type]) throw new RangeError('Missiles unavailable');
  if (type === 'krotal' && !character.targeting) throw new RangeError('Targeting device required');
  character.inventory[type]--;
  return power;
}

export function spaceScoutCruiserAttack(character, section, missiles = [], roll = die) {
  integer(character?.power); inventory(character?.inventory);
  if (![24,28,34].includes(section)) throw new RangeError('Unknown cruiser attack');
  const limit = section === 28 ? 6 : 4;
  if (!Array.isArray(missiles) || missiles.length > limit) throw new RangeError('Missile limit exceeded');
  const next = copy(character);
  const missileDamage = missiles.reduce((total, type) => total + spendMissile(next, type), 0);
  const rolls = [draw(roll), draw(roll)];
  const damage = (rolls[0] + rolls[1] + (section === 28 ? 2 : 0)) * next.power + missileDamage;
  const lower = section === 24 ? 600 : section === 28 ? 1000 : 800;
  const upper = section === 24 ? 700 : section === 28 ? 1200 : 900;
  const destination = damage >= upper ? (section === 24 ? 7 : 16)
    : damage < lower ? (section === 24 ? 41 : 8) : (section === 24 ? 17 : 37);
  return { character: next, rolls, missileDamage, damage, section: destination };
}

export function spaceScoutTorpedo(character, section) {
  inventory(character?.inventory);
  if (![24,28,34,91].includes(section) || !character.inventory.torpedoes) {
    throw new RangeError('Torpedo unavailable here');
  }
  const next = copy(character);
  next.inventory.torpedoes--;
  // The book resolves torpedoes narratively, without a generic damage value.
  return { character: next, section: section === 91 ? 104 : 31 };
}

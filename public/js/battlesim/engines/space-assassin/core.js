export const RULES_REVISION = 1;
const copy = value => structuredClone(value);

export function integer(value, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('Invalid combat value');
  return value;
}

export function die() { return 1 + Math.floor(Math.random() * 6); }
export function dice(count = 2, roll = die) {
  integer(count, 1, 20);
  let total = 0;
  for (let index = 0; index < count; index++) total += integer(roll(), 1, 6);
  return total;
}

export function validateCharacter(character, alive = false) {
  if (!character || typeof character !== 'object') throw new RangeError('Missing character');
  for (const field of ['skill', 'stamina', 'luck', 'armour']) {
    integer(character[field]);
    integer(character[field + 'Initial']);
    // Replacement suits can exceed rolled ARMOUR (section 231).
    if (field !== 'armour' && character[field] > character[field + 'Initial']) throw new RangeError('Value exceeds initial score');
  }
  integer(character.pills);
  integer(character.grenades);
  if (alive && !character.stamina) throw new RangeError('Character is dead');
  return character;
}

export function newCharacter(roll = die) {
  const scores = { skill: dice(1, roll) + 6, stamina: dice(2, roll) + 12,
    luck: dice(1, roll) + 6, armour: dice(1, roll) + 6 };
  return { ...scores, ...Object.fromEntries(Object.entries(scores).map(([key, value]) => [key + 'Initial', value])), pills: 4, grenades: 0 };
}

export function testLuck(character, roll = die) {
  validateCharacter(character, true);
  const player = copy(character), value = dice(2, roll), before = player.luck;
  player.luck = Math.max(0, before - 1);
  return { player, roll: value, before, lucky: value <= before };
}

export function takePill(character) {
  validateCharacter(character, true);
  if (!character.pills || character.stamina === character.staminaInitial) throw new RangeError('No recovery available');
  const player = copy(character);
  player.pills--;
  player.stamina = Math.min(player.staminaInitial, player.stamina + 5);
  return player;
}

export function armourHit(character, damage, roll = die) {
  validateCharacter(character, true);
  integer(damage);
  const player = copy(character), before = player.armour, value = dice(2, roll);
  player.armour = Math.max(0, before - 1);
  const blocked = value <= before;
  if (!blocked) player.stamina = Math.max(0, player.stamina - damage);
  return { player, before, roll: value, blocked, damage: blocked ? 0 : damage };
}

function weaponDamage(weapon, roll) {
  if (weapon === 'lash') return 2;
  if (weapon === 'unarmed') return 1;
  if (weapon === 'blaster') return dice(1, roll);
  throw new RangeError('Unknown weapon');
}

export function startFight(character, enemies, {
  mode = 'melee', weapon = 'blaster', grenadeAllowed = false, grenadeCover = 0, grenadeLimit = 1, grenadeArmourOnEven = false,
  openingShots = 0, initialArmourLoss = 0, playerDamageBonus = 0, roundDamage = 0, roundLimit = null, limitDestination = null, limitFatal = false,
  escapeCost = null, escapeDestination = null,
} = {}) {
  validateCharacter(character, true);
  if (!['melee', 'gunfire'].includes(mode) || !['lash', 'blaster', 'unarmed'].includes(weapon)
      || !Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Invalid encounter');
  if (typeof grenadeAllowed !== 'boolean' || typeof grenadeArmourOnEven !== 'boolean') throw new RangeError('Invalid grenade permission');
  integer(grenadeCover, 0, 6);
  integer(grenadeLimit, 1, 100);
  integer(openingShots, 0, 20);
  integer(initialArmourLoss);
  if (openingShots && mode !== 'gunfire') throw new RangeError('Opening shots require gunfire');
  integer(playerDamageBonus);
  integer(roundDamage);
  if (roundLimit !== null) integer(roundLimit, 1);
  if (limitDestination !== null) integer(limitDestination, 1);
  if (typeof limitFatal !== 'boolean' || roundLimit === null && (limitDestination !== null || limitFatal)
      || roundLimit !== null && limitDestination === null && !limitFatal) throw new RangeError('Incomplete round limit');
  if (escapeCost !== null) integer(escapeCost);
  if (escapeDestination !== null) integer(escapeDestination, 1);
  if ((escapeCost === null) !== (escapeDestination === null)) throw new RangeError('Incomplete escape rule');
  const opponents = enemies.map(enemy => {
    integer(enemy.skill);
    integer(enemy.stamina, 1);
    const shots = integer(enemy.shots ?? 1, 0, 20);
    if (enemy.damage !== undefined) integer(enemy.damage);
    if (enemy.instant !== undefined && typeof enemy.instant !== 'boolean') throw new RangeError('Invalid lethal weapon');
    if (enemy.weapons !== undefined) {
      if (!Array.isArray(enemy.weapons) || enemy.weapons.length !== 6) throw new RangeError('Invalid weapon table');
      for (const entry of enemy.weapons) {
        integer(entry.skill);
        if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200
            || entry.instant !== undefined && typeof entry.instant !== 'boolean') throw new RangeError('Invalid weapon entry');
        if (entry.damage !== undefined) integer(entry.damage);
        if (!entry.instant && entry.damage === undefined && entry.weapon !== 'blaster') throw new RangeError('Missing weapon damage');
      }
    }
    const weapon = enemy.weapon ?? 'blaster';
    if (!['lash', 'blaster', 'unarmed', 'disintegrator'].includes(weapon)
        || weapon === 'disintegrator' && !enemy.instant) throw new RangeError('Unknown weapon');
    return { ...copy(enemy), staminaInitial: enemy.stamina, weapon, shots };
  });
  const player = copy(character), events = [];
  if (initialArmourLoss) {
    const amount = Math.min(player.armour, initialArmourLoss);
    player.armour -= amount;
    events.push({ kind: 'openingArmourLoss', amount });
  }
  return { rulesRevision: RULES_REVISION, player, enemies: opponents,
    mode, weapon, grenadeAllowed, grenadeCover, grenadeLimit, grenadeArmourOnEven, grenadesUsed: 0,
    openingShots, openingPending: openingShots > 0, initialArmourLoss, playerDamageBonus, roundDamage,
    roundLimit, limitDestination, limitFatal, escapeCost, escapeDestination,
    rounds: 0, outcome: null, events };
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome
      || !['melee', 'gunfire'].includes(fight.mode) || !Array.isArray(fight.enemies)
      || !fight.enemies.some(enemy => enemy.stamina > 0)) throw new RangeError('No active fight');
  validateCharacter(fight.player, true);
}

function finish(fight) {
  if (!fight.player.stamina) fight.outcome = 'loss';
  else if (fight.enemies.every(enemy => !enemy.stamina)) fight.outcome = 'win';
  else if (!fight.outcome && fight.roundLimit !== null && fight.rounds >= fight.roundLimit) {
    fight.outcome = fight.limitFatal ? 'loss' : 'continue';
    if (fight.limitFatal) fight.player.stamina = 0;
    fight.destination = fight.limitDestination;
  }
  fight.events = fight.events.slice(-160);
  return fight;
}

export function throwGrenade(original, roll = die) {
  requireFight(original);
  if (original.openingPending || !original.grenadeAllowed || original.rounds
      || original.grenadesUsed >= original.grenadeLimit || !original.player.grenades) {
    throw new RangeError('No grenade available for this encounter');
  }
  const fight = copy(original);
  fight.player.grenades--;
  fight.grenadesUsed++;
  if (fight.grenadeArmourOnEven) {
    const value = dice(1, roll), armourLoss = value % 2 ? 0 : Math.min(1, fight.player.armour);
    fight.player.armour -= armourLoss;
    fight.events.push({ kind: 'grenadeRisk', roll: value, armourLoss });
  }
  for (const [target, enemy] of fight.enemies.entries()) {
    if (!enemy.stamina) continue;
    const value = dice(1, roll), damage = Math.max(0, value - fight.grenadeCover);
    enemy.stamina = Math.max(0, enemy.stamina - damage);
    fight.events.push({ kind: 'grenade', target, roll: value, damage });
  }
  return finish(fight);
}

function fireEnemies(fight, roll, opening = false) {
  for (const [index, opponent] of fight.enemies.entries()) {
    if (!opponent.stamina || !fight.player.stamina) continue;
    const shots = opening ? fight.openingShots : opponent.shots;
    if (!shots) continue;
    const profile = opponent.weapons?.[dice(1, roll) - 1];
    const skill = profile?.skill ?? opponent.skill;
    const instant = profile ? Boolean(profile.instant) : Boolean(opponent.instant);
    for (let shot = 0; shot < shots && fight.player.stamina > 0; shot++) {
      const enemyRoll = dice(2, roll), hit = enemyRoll < skill;
      const event = { kind: 'shot', actor: 'enemy', target: index, shot, opening, roll: enemyRoll, skill, hit, damage: 0 };
      event.weapon = profile?.name ?? opponent.weapon;
      event.instant = instant;
      if (hit) {
        let damage;
        if (instant) damage = fight.player.stamina;
        else if (profile) damage = profile.damage ?? weaponDamage(profile.weapon, roll);
        else damage = opponent.damage ?? weaponDamage(opponent.weapon, roll);
        const result = armourHit(fight.player, damage, roll);
        fight.player = result.player;
        Object.assign(event, { damage: result.damage, blocked: result.blocked, armourRoll: result.roll, armourBefore: result.before });
      }
      fight.events.push(event);
    }
  }
}

export function openingVolley(original, roll = die) {
  requireFight(original);
  if (!original.openingPending) throw new RangeError('No opening volley pending');
  const fight = copy(original);
  fireEnemies(fight, roll, true);
  fight.openingPending = false;
  return finish(fight);
}

export function escapeFight(original) {
  requireFight(original);
  if (original.openingPending || original.escapeCost === null) throw new RangeError('No escape available');
  const fight = copy(original);
  fight.player.stamina = Math.max(0, fight.player.stamina - fight.escapeCost);
  fight.outcome = fight.player.stamina ? 'escape' : 'loss';
  fight.destination = fight.player.stamina ? fight.escapeDestination : null;
  fight.events.push({ kind: 'escape', damage: fight.escapeCost });
  return finish(fight);
}

export function round(original, roll = die) {
  requireFight(original);
  if (original.openingPending) throw new RangeError('Resolve opening shots first');
  const fight = copy(original), target = fight.enemies.findIndex(enemy => enemy.stamina > 0);
  const enemy = fight.enemies[target];
  fight.rounds++;
  if (fight.mode === 'melee') {
    const playerAttack = dice(2, roll) + fight.player.skill, enemyAttack = dice(2, roll) + enemy.skill;
    if (playerAttack > enemyAttack) enemy.stamina = Math.max(0, enemy.stamina - 2 - fight.playerDamageBonus);
    else if (enemyAttack > playerAttack) fight.player.stamina = Math.max(0, fight.player.stamina - (enemy.damage ?? 2));
    fight.events.push({ kind: 'melee', target, playerAttack, enemyAttack });
  } else {
    const playerRoll = dice(2, roll), hit = playerRoll < fight.player.skill;
    const damage = hit ? weaponDamage(fight.weapon, roll) + fight.playerDamageBonus : 0;
    enemy.stamina = Math.max(0, enemy.stamina - damage);
    fight.events.push({ kind: 'shot', actor: 'player', target, roll: playerRoll, hit, damage });
    // A killed target cannot shoot; every other surviving enemy still can.
    fireEnemies(fight, roll);
  }
  if (fight.roundDamage) {
    fight.player.stamina = Math.max(0, fight.player.stamina - fight.roundDamage);
    fight.events.push({ kind: 'roundDamage', damage: fight.roundDamage });
  }
  return finish(fight);
}

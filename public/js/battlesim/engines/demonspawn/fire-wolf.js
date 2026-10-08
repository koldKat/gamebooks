export const FIRE_WOLF_ATTRIBUTES = ['strength', 'speed', 'stamina', 'courage', 'luck', 'charm', 'attraction'];
export const FIRE_WOLF_WEAPONS = Object.freeze({ unarmed: 0, arrow: 10, axe: 15, club: 8, dagger: 5, flail: 7, halberd: 12, lance: 12, mace: 14, spear: 12, sword: 10, doombringer: 20 });
export const FIRE_WOLF_ARMOUR = Object.freeze({ none: 0, leather: 5, chain: 8, plate: 12 });

function die(random) { return Math.floor(random() * 6) + 1; }
function dice(random) { return die(random) + die(random); }
function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

export function fireWolfNaturalLife(character) {
  return FIRE_WOLF_ATTRIBUTES.reduce((sum, key) => sum + number(character[key]), number(character.skill));
}

export function rollFireWolfCharacter(random = Math.random) {
  const character = Object.fromEntries(FIRE_WOLF_ATTRIBUTES.map(key => [key, dice(random) * 8]));
  character.skill = 0;
  character.maxLife = character.lifePoints = fireWolfNaturalLife(character);
  return character;
}

export function fireWolfHitThreshold(character) {
  return 7 - Math.floor(number(character.skill) / 10) - (number(character.luck) >= 72 ? 1 : 0);
}

export function fireWolfProtection(character) {
  const armour = FIRE_WOLF_ARMOUR[character.armour] ?? Math.max(0, number(character.armour));
  return armour + (character.shield ? (armour ? 5 : 7) : 0) + Math.max(0, number(character.magicArmour));
}

export function fireWolfDamage(attacker, defender, roll, weapon = attacker.weapon) {
  const threshold = fireWolfHitThreshold(attacker);
  if (roll < threshold) return 0;
  const bonus = FIRE_WOLF_WEAPONS[weapon] ?? Math.max(0, number(weapon));
  return Math.max(0, (roll - threshold) * 10 + Math.floor(number(attacker.strength) / 8) + bonus - fireWolfProtection(defender));
}

export function createFireWolfFight(player, enemy, options = {}) {
  const p = structuredClone(player), e = structuredClone(enemy);
  p.maxLife = number(p.maxLife) || fireWolfNaturalLife(p);
  e.maxLife = number(e.maxLife) || number(e.lifePoints);
  return {
    player: p, enemy: e, options: structuredClone(options), round: 0,
    turn: options.first === 'player' || options.first === 'enemy' ? options.first : null,
    attacks: 0, enemyTurns: 0, rest: 0, freePlayerAttacks: 0, blindedEnemyRounds: 0,
    lightbringerTested: false, luckUsed: false, pending: null, outcome: null,
    skillAwarded: false, charmTested: false, opening: { playerLife: p.lifePoints, enemyLife: e.lifePoints }, log: [],
  };
}

function log(fight, item) {
  fight.log.push(item);
  if (fight.log.length > 150) fight.log.splice(0, fight.log.length - 150);
}

function survive(fight, outcome) {
  fight.outcome = outcome;
  if (!fight.skillAwarded) {
    const reward = Math.max(1, number(fight.options.skillReward) || 1);
    fight.player.skill = number(fight.player.skill) + reward;
    fight.player.maxLife += reward;
    fight.player.lifePoints = Math.min(fight.player.maxLife, Math.max(0, fight.player.lifePoints) + reward);
    fight.skillAwarded = true;
  }
}

export function checkFireWolfOutcome(fight) {
  if (fight.outcome || fight.pending) return;
  // Baldar's practice fight ends at 50 LP, without a death or a Luck rescue.
  if (fight.options.sparring) {
    if (fight.player.lifePoints <= 50) survive(fight, 'defeat');
    else if (fight.enemy.lifePoints <= 50) survive(fight, 'win');
  } else if (fight.player.lifePoints <= 0) {
    if (!fight.luckUsed) fight.pending = 'death-luck';
    else fight.outcome = 'loss';
  } else if ((fight.enemies ?? [fight.enemy]).every(enemy => enemy.lifePoints <= 0)) survive(fight, 'win');
}

export function resolveFireWolfInitiative(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.turn) return null;
  const score = character => dice(random) + number(character.speed) + number(character.courage) + number(character.luck);
  const player = score(fight.player), enemy = score(fight.enemy);
  if (player !== enemy) fight.turn = player > enemy ? 'player' : 'enemy';
  log(fight, { kind: 'initiative', player, enemy, first: fight.turn });
  return fight.turn;
}

export function rollFireWolfAttack(fight, random = Math.random) {
  if (fight.outcome || fight.pending || !fight.turn) return null;
  checkFireWolfOutcome(fight);
  if (fight.outcome || fight.pending) return null;
  const side = fight.turn;
  if (side === 'player' && fight.paralysedPlayerRounds > 0) {
    fight.paralysedPlayerRounds -= 1;
    fight.round += 1;
    fight.turn = 'enemy';
    log(fight, { kind: 'paralysed', remaining: fight.paralysedPlayerRounds });
    return { kind: 'paralysed' };
  }
  if (side === 'enemy' && fight.blindedEnemyRounds > 0) {
    if (!fight.manualGroup) fight.blindedEnemyRounds -= 1;
    fight.enemyTurns += 1;
    if (fight.rest) {
      fight.rest -= 1;
      if (!fight.rest) fight.attacks = 0;
    }
    fight.turn = 'player';
    log(fight, { kind: 'blinded', remaining: fight.blindedEnemyRounds });
    return { kind: 'blinded' };
  }
  if (side === 'player') {
    const endurance = Math.max(0, Math.floor(number(fight.player.stamina) / 10));
    if (fight.rest || fight.attacks >= endurance) {
      if (!fight.rest) fight.rest = 2;
      log(fight, { kind: 'rest', remaining: fight.rest });
      fight.turn = 'enemy';
      return { kind: 'rest' };
    }
    fight.round += 1;
    fight.attacks += 1;
    if (fight.player.weapon === 'doombringer') {
      fight.player.lifePoints -= 10;
      log(fight, { kind: 'doombringer-cost', damage: 10 });
      checkFireWolfOutcome(fight);
      if (fight.outcome || fight.pending) return { kind: 'doombringer-cost' };
    }
  }
  const attacker = side === 'player' ? fight.player : fight.enemy;
  const defender = side === 'player' ? fight.enemy : fight.player;
  const roll = dice(random);
  let weapon = attacker.weapon;
  if (side === 'enemy') fight.enemyTurns += 1;
  if (side === 'enemy' && fight.options.regentSword) {
    const round = fight.enemyTurns;
    weapon = round % 3 === 1 ? 10 : round % 3 === 2 ? 20 : 20 * die(random);
  }
  let damage = fireWolfDamage(attacker, defender, roll, weapon);
  if (side === 'player' && fight.options.orbHeld && fight.options.demonspawn) damage *= 2;
  if (side === 'enemy') damage = Math.max(0, damage - Math.max(0, number(fight.options.enemyDamageReduction)) - Math.max(0, number(attacker.magicFear)));
  defender.lifePoints -= damage;
  if (side === 'player' && weapon === 'doombringer') {
    fight.player.lifePoints = Math.min(fight.player.maxLife, fight.player.lifePoints + damage);
  }
  const result = { kind: 'attack', side, roll, threshold: fireWolfHitThreshold(attacker), damage };
  if (side === 'player' && fight.options.pitThreshold) {
    result.pitRoll = die(random);
    if (result.pitRoll <= fight.options.pitThreshold) fight.outcome = 'pit';
  }
  log(fight, result);
  if (!fight.outcome) checkFireWolfOutcome(fight);
  if (side === 'enemy' && fight.rest) {
    fight.rest -= 1;
    if (!fight.rest) fight.attacks = 0;
  }
  if (side === 'player' && fight.freePlayerAttacks > 0) fight.freePlayerAttacks -= 1;
  fight.turn = side === 'player' && !fight.freePlayerAttacks ? 'enemy' : 'player';
  return result;
}

export function resolveFireWolfDeathLuck(fight, random = Math.random) {
  if (fight.pending !== 'death-luck' || fight.outcome) return null;
  const roll = dice(random) * 8;
  const success = roll < number(fight.player.luck);
  fight.luckUsed = true;
  fight.pending = null;
  log(fight, { kind: 'death-luck', roll, success });
  if (success) {
    fight.player.lifePoints = fight.player.maxLife;
    fight.enemy.lifePoints = fight.enemy.maxLife;
    for (const enemy of fight.enemies ?? []) enemy.lifePoints = enemy.maxLife;
    fight.turn = fight.options.first === 'player' || fight.options.first === 'enemy' ? fight.options.first : null;
    fight.round = fight.attacks = fight.enemyTurns = fight.rest = fight.freePlayerAttacks = fight.blindedEnemyRounds = fight.paralysedPlayerRounds = 0;
    fight.stoneUsedAt = null;
    if (fight.manualGroup) fight.manualRound = 0;
  } else fight.outcome = 'loss';
  return success;
}

export function throwFireWolfOrb(fight, random = Math.random) {
  if (fight.outcome || fight.pending || !fight.options.orbHeld) return null;
  fight.options.orbHeld = false;
  const roll = dice(random);
  const damage = fight.options.demonspawn ? (roll >= 4 ? Math.max(0, fight.enemy.lifePoints) : 200) : 0;
  fight.enemy.lifePoints -= damage;
  log(fight, { kind: 'orb', roll, damage });
  checkFireWolfOutcome(fight);
  return { roll, damage };
}

export function healFireWolfWithStone(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.player.lifePoints <= 0 || number(fight.player.healingStone) <= 0) return 0;
  const boundary = fight.manualGroup ? fight.manualRound : fight.enemyTurns;
  if (!boundary || fight.stoneUsedAt === boundary) return 0;
  const restored = Math.min(die(random), fight.player.healingStone, Math.max(0, fight.player.maxLife - fight.player.lifePoints));
  fight.player.healingStone -= restored;
  fight.player.lifePoints += restored;
  if (restored) fight.stoneUsedAt = boundary;
  log(fight, { kind: 'healing-stone', restored });
  return restored;
}

export function tryFireWolfCharm(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.charmTested || fight.round || fight.enemyTurns || !fight.options.charmEscape) return null;
  fight.charmTested = true;
  const eligible = number(fight.player.charm) > number(fight.enemy.charm);
  const roll = eligible ? dice(random) * 8 : null;
  const success = eligible && roll < number(fight.player.charm);
  if (success) fight.outcome = 'avoided';
  log(fight, { kind: 'charm', roll, success });
  return success;
}

export function tryFireWolfLightbringer(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.lightbringerTested || fight.round || fight.enemyTurns || !fight.options.lightbringer) return null;
  fight.lightbringerTested = true;
  const roll = dice(random);
  const success = roll < number(fight.player.skill);
  if (success) {
    fight.freePlayerAttacks = 3;
    fight.turn = 'player';
  }
  log(fight, { kind: 'lightbringer', roll, success });
  return success;
}

export function useFireWolfBluePowder(fight) {
  if (fight.outcome || fight.pending || !fight.options.openFlame || number(fight.player.bluePowder) < 1) return false;
  fight.player.bluePowder -= 1;
  fight.blindedEnemyRounds = 2;
  log(fight, { kind: 'blue-powder', remaining: fight.player.bluePowder });
  return true;
}

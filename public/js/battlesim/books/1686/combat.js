const dieSides = 12;
const statuses = new Set(['fighting', 'win', 'loss', 'cancelled']);
const turnDamage = [5, 7, 10];

function integer(value, min = 0, max = 1000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError('Invalid combat number');
  }
  return value;
}

function nameOf(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 200) throw new RangeError('Invalid combatant name');
  return name;
}

function creature(row) {
  if (![undefined, 'close', 'throw'].includes(row.impTactic)) throw new RangeError('Invalid imp tactic');
  return {
    name: nameOf(row.displayName || row.name),
    hp: integer(row.hp, 1),
    hit: integer(row.hit, 0, dieSides),
    damage: integer(row.damage),
    hitsToWin: integer(row.hitsToWin ?? 0, 0, 100),
    hits: 0,
    poisonOnHit: Boolean(row.poisonOnHit),
    impTactic: row.impTactic ?? null,
  };
}

export function startEncounter(player, encounter) {
  if (!Array.isArray(encounter.profiles) || !encounter.profiles.length || encounter.profiles.length > 100) {
    throw new RangeError('Invalid opponent count');
  }
  return {
    rulesVersion: 1,
    mode: 'encounter',
    player: { hp: integer(player.hp, 1), armor: integer(player.armor) },
    opponent: { key: encounter.key, name: nameOf(encounter.name), section: encounter.section },
    enemies: encounter.profiles.map(creature),
    round: 0,
    opponentRound: 0,
    currentEnemy: 0,
    poisoned: false,
    revision: 0,
    status: 'fighting',
    events: [],
  };
}

export function startArmyBattle(player, enemy) {
  const playerOffense = integer(player.offense);
  const playerDefense = integer(player.defense);
  const enemyOffense = integer(enemy.offense);
  const enemyDefense = integer(enemy.defense);
  const status = enemyDefense > playerOffense ? 'loss' : playerDefense > enemyOffense ? 'win' : 'fighting';
  return {
    rulesVersion: 1,
    mode: 'army',
    player: { hp: 100, offense: playerOffense, defense: playerDefense },
    opponent: { name: nameOf(enemy.name), section: '85' },
    enemies: [{ name: nameOf(enemy.name), hp: 200, offense: enemyOffense, defense: enemyDefense }],
    round: 0,
    revision: 0,
    status,
    events: status === 'fighting' ? [] : [{ kind: 'defense', round: 0, status }],
  };
}

export function validateFight(fight) {
  if (fight?.rulesVersion !== 1 || !statuses.has(fight.status)
      || !['encounter', 'army'].includes(fight.mode) || !Array.isArray(fight.events)
      || fight.events.length > 100 || !Array.isArray(fight.enemies) || !fight.enemies.length || fight.enemies.length > 100) {
    throw new RangeError('Invalid saved fight');
  }
  integer(fight.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  integer(fight.round, 0, fight.revision);
  integer(fight.player.hp);
  nameOf(fight.opponent.name);
  if (fight.mode === 'encounter') {
    integer(fight.player.armor);
    integer(fight.currentEnemy, 0, fight.enemies.length - 1);
    integer(fight.opponentRound, 0, fight.round);
    if (fight.status === 'fighting' && (!fight.player.hp || !fight.enemies[fight.currentEnemy].hp)) {
      throw new RangeError('Invalid active opponent');
    }
    if (typeof fight.poisoned !== 'boolean') throw new RangeError('Invalid poison state');
  } else {
    integer(fight.player.offense);
    integer(fight.player.defense);
    if (fight.enemies.length !== 1 || fight.status === 'fighting' && (!fight.player.hp || !fight.enemies[0].hp)) {
      throw new RangeError('Invalid active army');
    }
  }
  for (const enemy of fight.enemies) {
    nameOf(enemy.name);
    integer(enemy.hp);
    if (fight.mode === 'army') {
      integer(enemy.offense);
      integer(enemy.defense);
    } else {
      integer(enemy.hit, 0, dieSides);
      integer(enemy.damage);
      integer(enemy.hitsToWin, 0, 100);
      integer(enemy.hits, 0, fight.round);
      if (![null, 'close', 'throw'].includes(enemy.impTactic) || typeof enemy.poisonOnHit !== 'boolean') {
        throw new RangeError('Invalid saved opponent');
      }
    }
  }
  return fight;
}

function roll(manual, random) {
  if (manual !== undefined) return integer(manual, 1, dieSides);
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid dice source');
  return Math.floor(value * dieSides) + 1;
}

function note(fight, event) {
  fight.events.push({ round: fight.round, ...event });
  if (fight.events.length > 100) fight.events.shift();
}

function woundPlayer(fight, damage, bypassArmor = false) {
  const armor = bypassArmor ? 0 : Math.min(damage, fight.player.armor);
  fight.player.armor -= armor;
  const life = Math.min(damage - armor, fight.player.hp);
  fight.player.hp -= life;
  if (!fight.player.hp) fight.status = 'loss';
  return { armor, life };
}

function handleImpTail(fight, enemy, dice, random) {
  const base = enemy.impTactic === 'throw' ? woundPlayer(fight, enemy.damage) : { armor: 0, life: 0 };
  if (fight.status === 'loss') {
    note(fight, { kind: 'impTail', die: null, ...base });
    return;
  }
  const tail = roll(dice.tail, random);
  const direct = tail >= 11 ? 5 : enemy.impTactic === 'close' && tail >= 9 ? enemy.damage + 1 : 0;
  const { life } = woundPlayer(fight, direct, true);
  note(fight, { kind: 'impTail', die: tail, armor: base.armor, life: base.life + life });
}

function encounterRound(fight, { dice, hitModifier, weaponDamage }, random) {
  const enemy = fight.enemies[fight.currentEnemy];
  const armored = fight.player.armor > 0;
  const target = (armored ? 8 : 3) + hitModifier;
  const playerDie = roll(dice.player, random);
  const hitPlayerAttack = playerDie <= target;
  const damage = hitPlayerAttack
    ? weaponDamage ?? (enemy.impTactic === 'throw' ? 3 : armored ? turnDamage[Math.min(fight.opponentRound, 2)] : 1)
    : 0;
  fight.opponentRound++;
  enemy.hp = Math.max(0, enemy.hp - damage);
  note(fight, { kind: 'player', opponent: enemy.name, die: playerDie, target, hit: hitPlayerAttack, damage });
  if (!enemy.hp) {
    fight.poisoned = false;
    if (fight.currentEnemy + 1 === fight.enemies.length) fight.status = 'win';
    else {
      fight.currentEnemy++;
      fight.opponentRound = 0;
    }
    return;
  }

  const enemyDie = roll(dice.enemy, random);
  const hit = enemyDie <= enemy.hit;
  if (hit) enemy.hits++;
  if (hit && enemy.impTactic) {
    note(fight, { kind: 'enemy', opponent: enemy.name, die: enemyDie, target: enemy.hit, hit, armor: 0, life: 0 });
    handleImpTail(fight, enemy, dice, random);
    return;
  }
  const result = woundPlayer(fight, hit ? enemy.damage : 0);
  note(fight, { kind: 'enemy', opponent: enemy.name, die: enemyDie, target: enemy.hit, hit, ...result });
  if (hit && enemy.hitsToWin && enemy.hits >= enemy.hitsToWin) {
    fight.status = 'loss';
    note(fight, { kind: 'hitLimit', opponent: enemy.name });
  }
  fight.poisoned ||= hit && enemy.poisonOnHit;
  if (fight.poisoned && fight.status === 'fighting') {
    const { life } = woundPlayer(fight, 1, true);
    note(fight, { kind: 'poison', life });
  }
}

function armyRound(fight, dice, random) {
  const enemy = fight.enemies[0];
  const opening = fight.round === 1;
  const playerDie = opening ? null : roll(dice.player, random);
  const damage = opening || playerDie <= 8 ? fight.player.offense - enemy.defense : 0;
  enemy.hp = Math.max(0, enemy.hp - damage);
  note(fight, { kind: opening ? 'opening' : 'player', opponent: enemy.name, die: playerDie, target: 8, hit: opening || playerDie <= 8, damage });
  if (!enemy.hp) {
    fight.status = 'win';
  } else if (!opening) {
    const enemyDie = roll(dice.enemy, random);
    const life = enemyDie <= 7 ? Math.min(fight.player.hp, enemy.offense - fight.player.defense) : 0;
    fight.player.hp -= life;
    note(fight, { kind: 'enemy', opponent: enemy.name, die: enemyDie, target: 7, hit: enemyDie <= 7, life, armor: 0 });
    if (!fight.player.hp) fight.status = 'loss';
  }
}

export function combatAction(source, { kind, revision, dice = {}, hitModifier = 0, weaponDamage } = {}, random = Math.random) {
  validateFight(source);
  if (source.status !== 'fighting' || source.revision !== revision) throw new RangeError('Inactive combat action');
  const fight = structuredClone(source);
  fight.revision++;
  if (kind === 'cancel') {
    fight.status = 'cancelled';
  } else if (kind === 'round') {
    fight.round++;
    if (fight.mode === 'army') armyRound(fight, dice, random);
    else encounterRound(fight, {
      dice,
      hitModifier: integer(hitModifier, -12, 12),
      weaponDamage: weaponDamage === undefined ? undefined : integer(weaponDamage),
    }, random);
  } else {
    throw new RangeError('Invalid combat action');
  }
  return validateFight(fight);
}

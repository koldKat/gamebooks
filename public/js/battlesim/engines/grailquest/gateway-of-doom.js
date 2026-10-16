import { customGrailEncounter } from './opponents.js';
import { GATEWAY_ENCOUNTERS, GATEWAY_WANDERING, GATEWAY_DREAMS } from './gateway-of-doom-roster.js';
import { initialDenLife, denDamage, denFriendlyReaction } from './den-of-dragons.js';

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const clone = value => JSON.parse(JSON.stringify(value));
const valid = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const spells = new Set(['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeat', 'invisibility',
  'plop', 'pid', 'pals', 'pil', 'pops', 'light']);
const invisibilitySections = new Set([78, 83, 86, 88, 89, 91, 93, 98, 106, 118, 121, 129]);

export function createGatewayCharacter() {
  return { life: 0, maxLife: 0, hit: 4, bonus: 5, armour: 0, permanent: 0, experience: 0,
    speed: 0, weight: 0, gold: 0, bolts: 10, fireballs: 2, potions: 18, smallPotions: 0,
    salves: 5, seeds: 0, seedsEaten: 0, polish: 0, lamp: 0, weedkiller: 0, antidotes: 0,
    spellUses: {}, magicCost: 1, magicLost: false, magicLock: [], resurrection: false,
    poisonProtected: false, poisoned: false, magicArmour: 0, pendingWallop: 0,
    coin: false, emerald: false, shield: false, tinglering: false, djinnCalls: 0,
    carrot: false, aardvark: false, dark: false, dreamLimp: [] };
}

export function initialGatewayStats(permanent = 0, random = Math.random) {
  return { ...initialDenLife(permanent, random), speed: dice(random) * 2, gold: dice(random) * 10 };
}

export const gatewayFriendlyReaction = denFriendlyReaction;

function threshold(fight, foe) {
  return fight.spec.deathRequired || foe.maxLife <= 5 ? 0 : 5;
}

export function gatewayTargets(fight) {
  return fight.foes.map((foe, index) => ({ foe, index }))
    .filter(({ foe }) => !foe.bypassed && foe.life > threshold(fight, foe));
}

function settle(fight) {
  if (fight.player.life <= 5) fight.status = 'loss';
  else if (!gatewayTargets(fight).length) fight.status = 'win';
  if (fight.status === 'win' && !fight.rewarded && !fight.spec.dream) {
    fight.rewarded = true;
    fight.player.experience++;
    fight.player.gold += fight.foes.filter(foe => !foe.bypassed).reduce((sum, foe) => sum + (foe.gold ?? 0), 0);
  }
}

function hurtPlayer(fight, amount) {
  fight.player.life = Math.max(0, fight.player.life - amount);
  fight.playerLoss += amount;
}

function armour(fight, foe) {
  return foe.knight ? [12, 6, 4][Math.min(2, foe.hitsTaken)] : foe.armour;
}

function hurtEnemy(fight, foe, damage, hit) {
  const before = foe.life;
  foe.life = Math.max(0, foe.life - damage);
  fight.enemyLoss += damage;
  if (hit) {
    foe.hitsTaken++;
    foe.unanswered = 0;
  }
  if (!fight.spec.ants && before > threshold(fight, foe) && foe.life <= threshold(fight, foe)) {
    fight.enemyChanged = true;
    if (fight.companion?.expiresOnEnemy === fight.foes.indexOf(foe)) fight.companion = null;
    if (!fight.spec.wandering && !fight.spec.first) fight.first = null;
  }
  if (fight.spec.section === 76 && !foe.baby && before > 0 && foe.life === 0) {
    const baby = fight.foes.find(enemy => enemy.baby && enemy.life > 0);
    if (baby && !baby.fireballUsed) {
      baby.fireballUsed = true;
      const amount = Math.max(0, 75 - fight.player.armour - fight.magicArmour);
      hurtPlayer(fight, amount);
      fight.events.push({ kind: 'baby-fireball', damage: amount });
    }
  }
  settle(fight);
}

export function createGatewayFight(section, player, options = {}, random = Math.random) {
  const spec = [...GATEWAY_ENCOUNTERS, ...GATEWAY_WANDERING, ...GATEWAY_DREAMS]
    .find(entry => String(entry.section) === String(section)) ?? customGrailEncounter(section, options.opponents);
  if (!spec) throw new RangeError('Unknown Gateway encounter');
  if (!valid(player.life, 6) || !valid(player.maxLife, player.life) || !valid(player.hit, 2)
    || player.hit > 12 || !valid(player.bonus) || !valid(player.armour)
    || !valid(player.speed) || !valid(player.weight)) throw new RangeError('Invalid character');
  const p = clone(player);
  const fight = { rulesVersion: 1, spec: clone(spec), player: p, options: clone(options),
    rounds: 0, playerStrikes: 0, enemyBlows: 0, playerLoss: 0, enemyLoss: 0,
    status: 'fighting', events: [], skipPlayer: 0, repeat: false, pops: 0,
    nextBonus: spec.dream ? 0 : p.pendingWallop, magicArmour: spec.dream ? 0 : p.magicArmour,
    poisoned: spec.dream ? false : p.poisoned, weedkiller: false,
    polish: false, lamp: false, companion: null, carrotHits: 0 };
  let foes = clone(spec.foes);
  if (spec.ants) foes = Array.from({ length: dice(random) * 10 }, () =>
    ({ name: 'Ant', life: 1, hit: 6, bonus: 0, armour: 0, fixedDamage: 1 }));
  if (spec.djinn) foes = Array.from({ length: die(random) }, () =>
    ({ name: 'Djinn', life: 30, hit: 5, bonus: 2, armour: 0 }));
  if (spec.vampires) foes = Array.from({ length: dice(random) }, () =>
    ({ name: 'Vampire', life: dice(random) * 2, hit: 5, bonus: 0, armour: 0, fixedDamage: 5 }));
  if (spec.mirror) foes = [{ name: 'Distorted Pip', life: Math.floor(p.life / 2),
    hit: p.hit, bonus: p.bonus, armour: p.armour }];
  if (spec.finale) {
    const group = (count, name, life, hit, bonus, extra = {}) => Array.from({ length: count }, () =>
      ({ name, life, hit, bonus, armour: 0, ...extra }));
    foes = [...group(options.djinnGone ? 0 : 7, 'Djinn', 30, 5, 2, { ringHalfDamage: true }),
      ...group(7, 'Slime Monster', 10, 6, 0, { slime: true }),
      ...group(options.dwarvesGone ? 0 : 7, 'Military Dwarf', 20, 5, 3),
      { name: 'Black Knight', life: 80, hit: 4, bonus: 4, armour: 12, knight: true }];
  }
  fight.foes = foes.map(foe => ({ ...foe, maxLife: foe.life, hitsTaken: 0, successfulHits: 0,
    unanswered: 0, attacksMade: 0, skip: 0 }));
  if (spec.entryDamage) hurtPlayer(fight, spec.entryDamage);
  if (spec.webCheck) {
    const roll = die(random);
    fight.events.push({ kind: 'web', roll });
    if (roll >= 5) hurtPlayer(fight, p.life);
  }
  if (spec.waterChecks) {
    const swim = die(random), cold = die(random);
    fight.events.push({ kind: 'water', swim, cold });
    if (swim <= 3 || cold <= 2) hurtPlayer(fight, p.life);
  }
  if (spec.bellCheck) {
    const roll = die(random);
    fight.events.push({ kind: 'bell', roll });
    if (roll <= 3) { fight.status = 'redirect'; fight.redirect = 101; }
  }
  if (options.polish && !spec.dream && p.polish > 0) { p.polish--; fight.polish = true; }
  if (options.lamp && !spec.dream && p.lamp > 0) { p.lamp--; fight.lamp = true; fight.magicArmour += 3; }
  if (options.weedkiller && !spec.dream && p.weedkiller > 0) { p.weedkiller--; fight.weedkiller = true; }
  if (spec.first) fight.first = spec.first;
  else rerollGatewayInitiative(fight, random);
  if (spec.freeOpeningBlows && options.switchMachineFirst) {
    for (const foe of fight.foes) enemyBlow(fight, foe, random);
  }
  if (fight.status === 'fighting') settle(fight);
  return fight;
}

export function rerollGatewayInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const enemy = dice(random), player = dice(random);
  fight.initiative = { enemy, player };
  fight.first = player > enemy ? 'player' : enemy > player ? 'enemy' : null;
  return fight.initiative;
}

function enemyBlow(fight, foe, random) {
  if (foe.skip > 0) { foe.skip--; fight.events.push({ kind: 'skip-enemy', name: foe.name }); return; }
  if (foe.noAttack || foe.wizard) return;
  fight.enemyBlows++;
  foe.attacksMade++;
  const roll = dice(random);
  const hitAt = fight.rounds === 1 && foe.firstRoundHit ? foe.firstRoundHit : foe.hit;
  const buddy = fight.companion?.life > 5;
  const blocked = !buddy && !fight.spec.dream && fight.player.shield && fight.enemyBlows % 3 === 0;
  const hit = roll >= hitAt && !blocked;
  const bonus = foe.hugEvery && fight.rounds > 0 && fight.rounds % foe.hugEvery === 0 ? foe.hugBonus : foe.bonus;
  const protection = buddy || fight.spec.dream ? 0 : fight.player.armour + fight.magicArmour;
  let damage = hit ? foe.fixedDamage === undefined ? denDamage(roll, hitAt, bonus, protection)
    : Math.max(0, foe.fixedDamage - protection) : 0;
  if (!buddy && foe.ringHalfDamage && fight.player.tinglering) damage = Math.floor(damage / 2);
  if (buddy) fight.companion.life = Math.max(0, fight.companion.life - damage);
  else hurtPlayer(fight, damage);
  if (hit) {
    foe.successfulHits++;
    foe.unanswered++;
    if (!buddy && foe.slime && foe.successfulHits === 1 && !fight.player.poisonProtected) fight.poisoned = fight.player.poisoned = true;
    if (!buddy && foe.paralysis) fight.skipPlayer += foe.paralysis;
    if (!buddy && foe.paralysisTwelve && roll === 12) fight.skipPlayer = Math.max(fight.skipPlayer, foe.paralysisTwelve);
    if (!buddy && !fight.player.poisonProtected && (foe.lethalHits && foe.successfulHits >= foe.lethalHits
      || foe.unansweredHits && foe.unanswered >= foe.unansweredHits)) hurtPlayer(fight, fight.player.life);
  }
  fight.events.push({ kind: 'enemy', name: foe.name, roll, hit, damage, blocked });
  settle(fight);
}

function enemyTurn(fight, random) {
  const targets = gatewayTargets(fight);
  const attacking = fight.spec.ants ? targets : targets.slice(0, 1);
  for (const { foe } of attacking) {
    for (let attack = 0; attack < (foe.attacks ?? 1) && fight.status === 'fighting'; attack++) {
      enemyBlow(fight, foe, random);
    }
  }
}

function playerTurn(fight, target, random) {
  const p = fight.player;
  if (fight.skipPlayer > 0) { fight.skipPlayer--; fight.events.push({ kind: 'skip-player' }); return; }
  if (!fight.spec.dream && p.speed - p.weight < p.speed / 2 && fight.rounds % 2 === 0) {
    fight.events.push({ kind: 'encumbered' }); return;
  }
  for (let blow = 0; blow < (fight.repeat ? 2 : 1) && fight.status === 'fighting'; blow++) {
    const foe = fight.foes[target];
    if (foe.life <= threshold(fight, foe) || foe.bypassed) return;
    const buddy = fight.companion?.life > 5;
    const roll = dice(random);
    fight.playerStrikes++;
    const hitAt = buddy ? fight.companion.hit ?? 5 : fight.spec.playerHit ?? (p.dark && !fight.spec.dream ? 8 : p.hit);
    const missed = !buddy && (fight.spec.missEvery && fight.playerStrikes % fight.spec.missEvery === 0
      || !fight.spec.dream && p.dreamLimp.length && fight.playerStrikes % 3 === 0);
    const hit = !missed && roll >= hitAt;
    const bonus = buddy ? fight.companion.bonus ?? 3 : fight.spec.playerBonus ?? p.bonus;
    const extras = buddy || fight.spec.dream ? 0 : fight.nextBonus + (p.coin ? 5 : 0)
      - (p.emerald ? 4 : 0) + (fight.polish ? 2 : 0) - (fight.spec.swordPenalty ?? 0);
    let damage = hit ? denDamage(roll, hitAt, bonus + extras, 0) : 0;
    if (!buddy && fight.pops) {
      damage = fight.pops === 2 ? damage * 2 : Math.floor(damage / 2);
      fight.pops--;
    }
    if (hit && !buddy && !fight.spec.dream) {
      fight.nextBonus = p.pendingWallop = 0;
      if (fight.weedkiller && foe.vegetable) { damage *= 2; fight.weedkiller = false; }
    }
    damage = Math.max(0, damage - armour(fight, foe));
    fight.events.push({ kind: 'player', name: foe.name, roll, hit, damage, companion: buddy });
    if (hit && fight.poisoned && !buddy) hurtPlayer(fight, 2);
    hurtEnemy(fight, foe, damage, hit);
    if (fight.spec.oneBlow && foe.life > 0) {
      p.magicLost = true;
      fight.status = p.life <= 5 ? 'loss' : 'escaped';
    }
    if (fight.spec.moveLimit && gatewayTargets(fight).length && fight.playerStrikes >= fight.spec.moveLimit) {
      hurtPlayer(fight, p.life); settle(fight);
    }
    if (fight.spec.strikeLimit && gatewayTargets(fight).length && fight.playerStrikes >= fight.spec.strikeLimit) {
      hurtPlayer(fight, p.life); settle(fight);
    }
  }
  if (p.carrot && !fight.spec.dream && fight.status === 'fighting') {
    const foe = gatewayTargets(fight)[0]?.foe;
    if (foe) {
      const roll = dice(random), hit = roll >= 6;
      fight.carrotHits = hit ? fight.carrotHits + 1 : 0;
      const damage = fight.carrotHits >= 3 && !foe.poisonProtected ? foe.life : denDamage(roll, 6, 0, armour(fight, foe));
      fight.events.push({ kind: 'carrot', roll, hit, damage });
      hurtEnemy(fight, foe, damage, hit);
    }
  }
}

export function rollGatewayRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.first || fight.foes.some(foe => foe.wizard)) return null;
  const targets = gatewayTargets(fight);
  if (!targets.some(entry => entry.index === target)) throw new RangeError('Invalid target');
  if (!fight.spec.ants && target !== targets[0].index) throw new RangeError('Enemies attack in sequence');
  fight.rounds++;
  fight.events = [];
  fight.enemyChanged = false;
  const first = fight.first;
  if (first === 'enemy') enemyTurn(fight, random);
  if (fight.status === 'fighting') playerTurn(fight, target, random);
  if (fight.status === 'fighting' && first === 'player' && !fight.enemyChanged) enemyTurn(fight, random);
  return fight.events;
}

export function castGatewaySpell(fight, spell, target = 0, random = Math.random) {
  const p = fight.player;
  if (fight.status !== 'fighting' || fight.spec.dream || p.magicLost || p.magicLock.length || !spells.has(spell)) return null;
  const limit = spell === 'invisibility' ? 1 : 3;
  if ((p.spellUses[spell] ?? 0) >= limit || spell === 'invisibility' && !invisibilitySections.has(fight.spec.section)) return null;
  const foe = fight.foes[target];
  if (['pad', 'pill', 'pals'].includes(spell) && (!foe || foe.life <= threshold(fight, foe) || foe.bypassed)) return null;
  if (spell === 'pals' && !foe.vegetable || spell === 'pip' && fight.poisoned) return null;
  const cost = (spell === 'light' ? 1 : spell === 'invisibility' ? 15 : 3) * p.magicCost;
  p.spellUses[spell] = (p.spellUses[spell] ?? 0) + 1;
  hurtPlayer(fight, cost);
  settle(fight);
  if (fight.status !== 'fighting') return { spell, cost, success: false, fatal: true };
  const roll = spell === 'light' ? null : dice(random);
  const success = spell === 'light' || roll >= 7;
  if (success) {
    if (spell === 'panic') fight.magicArmour = (fight.lamp ? 3 : 0) + (p.magicArmour = 4);
    if (spell === 'pow') fight.nextBonus = p.pendingWallop = 10;
    if (spell === 'pill') foe.skip += 3;
    if (spell === 'pad') {
      hurtEnemy(fight, foe, Math.max(0, 10 + (p.coin ? 5 : 0) - (p.emerald ? 4 : 0) - armour(fight, foe)), true);
      finishZapperAttempt(fight);
    }
    if (spell === 'pip') p.poisonProtected = true;
    if (spell === 'repeat') fight.repeat = true;
    if (spell === 'pops') fight.pops = 2;
    if (spell === 'pals') { foe.bypassed = true; settle(fight); }
    if (spell === 'light') p.dark = false;
    if (spell === 'pil') { hurtPlayer(fight, Math.floor(p.life / 2)); settle(fight); }
    if (spell === 'invisibility') p.invisible = true;
  }
  return { spell, cost, roll, success };
}

export function launchGatewayMagic(fight, kind, target = 0, random = Math.random) {
  const p = fight.player, foe = fight.foes[target];
  if (!['bolts', 'fireballs'].includes(kind) || fight.status !== 'fighting' || fight.spec.dream
    || p.magicLost || p.magicLock.length || p[kind] < 1 || !foe || foe.bypassed || foe.life <= threshold(fight, foe)) return null;
  p[kind]--;
  const roll = kind === 'fireballs' ? dice(random) : null;
  const success = roll === null || roll >= 6;
  const damage = success ? Math.max(0, (kind === 'bolts' ? 10 : 75) + (p.coin ? 5 : 0)
    - (p.emerald ? 4 : 0) - armour(fight, foe)) : 0;
  hurtEnemy(fight, foe, damage, success);
  finishZapperAttempt(fight);
  return { kind, roll, success, damage };
}

function finishZapperAttempt(fight) {
  if (fight.spec.oneBlow && gatewayTargets(fight).length) {
    fight.player.magicLost = true;
    fight.status = fight.player.life <= 5 ? 'loss' : 'escaped';
  }
}

export function leaveGatewayZapper(fight) {
  if (fight.status !== 'fighting' || !fight.spec.oneBlow) return false;
  fight.player.magicCost = 2;
  fight.status = 'escaped';
  return true;
}

export function healGatewayPlayer(player, amount) {
  if (player.life <= 0 || !valid(amount)) return 0;
  const healed = Math.min(amount, player.maxLife - player.life);
  player.life += healed;
  return healed;
}

export function useGatewayHealing(player, kind, random = Math.random) {
  if (!['potions', 'smallPotions', 'salves', 'seeds'].includes(kind) || player[kind] < 1 || player.life <= 0) return null;
  player[kind]--;
  const amount = kind === 'potions' ? dice(random) : kind === 'smallPotions' ? die(random)
    : kind === 'salves' ? 3 : player.maxLife;
  const healed = healGatewayPlayer(player, amount);
  if (kind === 'seeds' && ++player.seedsEaten % 6 === 0) {
    player.permanent++; player.maxLife++; player.life++;
  }
  return { kind, amount: healed };
}

export function exchangeGatewayExperience(player) {
  if (player.experience < 20) return false;
  player.experience -= 20;
  player.permanent++; player.maxLife++; player.life++;
  return true;
}

export function useGatewayAntidote(fight, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.poisoned || fight.player.antidotes < 1) return null;
  fight.player.antidotes--;
  fight.poisoned = fight.player.poisoned = false;
  fight.events = [];
  enemyTurn(fight, random);
  return fight.events;
}

export function useGatewayAardvark(fight, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.spec.ants || !fight.player.aardvark) return null;
  const roll = dice(random);
  if (roll >= 6) for (const { foe } of gatewayTargets(fight).slice(0, 20)) foe.life = 0;
  settle(fight);
  return { roll, success: roll >= 6 };
}

export function callGatewayDjinn(fight) {
  const p = fight.player;
  if (fight.status !== 'fighting' || fight.spec.dream || !p.tinglering || p.djinnCalls >= 3 || fight.companion?.life > 5) return false;
  p.djinnCalls++;
  fight.companion = { life: 100 };
  return true;
}

export function resurrectGatewayPlayer(fight, random = Math.random) {
  const p = fight.player;
  if (!p.resurrection || p.life > 0 || fight.spec.dream) return null;
  const roll = dice(random), success = roll >= 10;
  if (success) {
    p.life = p.maxLife;
    p.magicLock = [String(fight.spec.section)];
    fight.status = gatewayTargets(fight).length ? 'fighting' : 'win';
  }
  return { roll, success };
}

export function visitGatewaySection(player, section) {
  const key = String(section);
  if (player.magicLock.length && !player.magicLock.includes(key)) {
    player.magicLock.push(key);
    if (player.magicLock.length >= 4) player.magicLock = [];
  }
  if (player.dreamLimp.length && !player.dreamLimp.includes(key)) {
    player.dreamLimp.push(key);
    if (player.dreamLimp.length >= 4) player.dreamLimp = [];
  }
}

export function gatewayDream(player, number, options = {}, random = Math.random) {
  if (!valid(number, 2) || number > 12 || player.life <= 0) throw new RangeError('Invalid dream');
  const p = clone(player), result = { number, player: p, status: 'return' };
  if (number === 2) {
    result.roll = die(random);
    if (result.roll <= 3) p.life = 0;
  } else if (number === 3 || number === 4) {
    result.fight = createGatewayFight('dream' + number, p, {}, random);
  } else if (number === 5) {
    result.roll = die(random);
    result.amount = result.roll >= 5 ? healGatewayPlayer(p, dice(random)) : -Math.min(10, p.life);
    if (result.amount < 0) p.life += result.amount;
  } else if (number === 6) {
    result.status = 'limerick';
  } else if (number === 7) {
    result.roll = dice(random);
    if (result.roll <= 6) result.fight = createGatewayFight('dream7', p, {}, random);
    else if (result.roll >= 11) p.gnurlbash = true;
  } else if (number === 8) {
    result.roll = die(random);
    if (result.roll >= 5) result.fight = createGatewayFight('dream8', p, {}, random);
  } else if (number === 9) {
    result.roll = dice(random);
    if (result.roll <= 8) p.dreamLimp = [String(options.section ?? '')];
  } else if (number === 10) {
    result.bonds = dice(random); result.effort = dice(random);
    if (result.effort <= result.bonds) p.life = 0;
  } else if (number === 11) {
    result.rolls = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const roll = die(random); result.rolls.push(roll);
      if (roll === 6) break;
    }
    if (!result.rolls.includes(6)) p.life = 0;
  } else if (number === 12) {
    result.roll = die(random);
    if (result.roll <= 2) p.life = 0;
    else if (result.roll >= 5) result.status = 'dream-again';
  }
  if (p.life <= 0) result.status = 'loss';
  else if (result.fight) result.status = 'fight';
  return result;
}

export function gatewaySleep(player, section, random = Math.random) {
  if (player.life <= 0) return null;
  const p = clone(player), roll = die(random);
  p.magicLock = [];
  if (roll >= 5) return { roll, player: p, status: 'return', amount: healGatewayPlayer(p, dice(random)) };
  return { roll, ...gatewayDream(p, dice(random), { section }, random) };
}

export function resolveGatewayLimerick(player, finishedInTime) {
  if (typeof finishedInTime !== 'boolean' || player.life <= 0) return false;
  if (!finishedInTime) player.life = Math.max(0, player.life - 5);
  return true;
}

export function callGatewayGnurlbash(fight) {
  if (fight.status !== 'fighting' || fight.spec.dream || !fight.player.gnurlbash || fight.companion?.life > 5) return false;
  fight.player.gnurlbash = false;
  fight.companion = { life: 30, hit: 6, bonus: 2, expiresOnEnemy: gatewayTargets(fight)[0].index };
  return true;
}

export function gatewayWandering(player, level, random = Math.random) {
  if (!valid(level, 1) || level > 3 || player.life <= 5) return null;
  const roll = dice(random), section = 'level' + level + '-' + roll;
  if (GATEWAY_WANDERING.some(spec => spec.section === section)) {
    return { level, roll, fight: createGatewayFight(section, player, {}, random) };
  }
  const p = clone(player), result = { level, roll, player: p, damage: 0, status: 'none' };
  if (level === 3 && (roll === 6 || roll === 9)) {
    result.damage = dice(random);
    p.life = Math.max(0, p.life - result.damage);
    result.status = p.life <= 0 ? 'loss' : 'trap';
    if (roll === 9 && !p.poisonProtected) p.travelPoison = 5;
  }
  return result;
}

export function gatewayBribe(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.spec.wandering || !fight.spec.bribe || fight.bribeAttempted) return null;
  const cost = fight.spec.bribe * (fight.spec.bribeEach ? gatewayTargets(fight).length : 1);
  if (fight.player.gold < cost) return null;
  fight.bribeAttempted = true;
  fight.player.gold -= cost;
  const roll = dice(random), success = roll >= 8;
  if (success) fight.status = 'avoided';
  return { cost, roll, success };
}

export function rollGatewayWizardRound(fight, spell, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.first || !fight.foes[0]?.wizard) return null;
  const wizard = fight.foes[0];
  const choices = new Set(['panic', 'pow', 'pill', 'pad', 'pip', 'repeat', 'firefinger', 'bolt', 'strike']);
  if (!choices.has(spell) || spell === 'bolt' && !wizard.bolts
    || spell === 'firefinger' && wizard.boltsCharged
    || !['strike', 'bolt'].includes(spell) && (wizard.spellUses?.[spell] ?? 0) >= 3) return null;
  fight.rounds++; fight.events = []; fight.enemyChanged = false;
  const cast = () => {
    if (wizard.skip > 0) {
      wizard.skip--; fight.events.push({ kind: 'skip-enemy', name: wizard.name }); return;
    }
    if (spell === 'bolt') {
      wizard.bolts--;
      const damage = Math.max(0, 2 - fight.player.armour - fight.magicArmour);
      hurtPlayer(fight, damage);
      fight.events.push({ kind: 'wizard-bolt', damage }); settle(fight); return;
    }
    if (spell === 'strike') {
      wizard.wizard = false;
      for (let i = 0; i < (wizard.repeat ? 2 : 1) && fight.status === 'fighting'; i++) {
        const original = wizard.bonus;
        wizard.bonus += wizard.nextBonus ?? 0;
        const count = wizard.successfulHits;
        enemyBlow(fight, wizard, random);
        wizard.bonus = original;
        if (wizard.successfulHits > count) wizard.nextBonus = 0;
      }
      wizard.wizard = true;
      return;
    }
    wizard.spellUses ||= {};
    wizard.spellUses[spell] = (wizard.spellUses[spell] ?? 0) + 1;
    const cost = spell === 'invisibility' ? 15 : 3;
    wizard.life = Math.max(0, wizard.life - cost);
    settle(fight);
    if (fight.status !== 'fighting') return;
    const roll = dice(random), success = roll >= 7;
    let damage = 0;
    if (success) {
      if (spell === 'panic') wizard.armour = 4;
      if (spell === 'pow') wizard.nextBonus = 10;
      if (spell === 'pill') fight.skipPlayer += 3;
      if (spell === 'repeat') wizard.repeat = true;
      if (spell === 'pip') wizard.poisonProtected = true;
      if (spell === 'firefinger') { wizard.bolts = 10; wizard.boltsCharged = true; }
      if (spell === 'pad') {
        damage = Math.max(0, 10 - fight.player.armour - fight.magicArmour);
        hurtPlayer(fight, damage);
      }
    }
    fight.events.push({ kind: 'wizard-spell', spell, cost, roll, success, damage });
    settle(fight);
  };
  if (fight.first === 'enemy') cast();
  if (fight.status === 'fighting') playerTurn(fight, 0, random);
  if (fight.status === 'fighting' && fight.first === 'player') cast();
  return fight.events;
}

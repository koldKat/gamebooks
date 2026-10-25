import { customGrailEncounter } from './opponents.js';
import { KINGDOM_ENCOUNTERS, KINGDOM_DREAMS, KINGDOM_MAGIC_STOCK,
  KINGDOM_EQUIPMENT, KINGDOM_SUPPORT, KINGDOM_RULES } from './kingdom-of-horror-roster.js';
export { KINGDOM_RULES } from './kingdom-of-horror-roster.js';

export function kingdomCanCollectWitchLoot(fight) {
  return fight?.spec?.id === KINGDOM_RULES.witchLoot.encounterId && fight.status === 'win' && !fight.player.witchLootCollected;
}

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const clone = value => JSON.parse(JSON.stringify(value));

export function createKingdomCharacter() {
  return { life: 0, maxLife: 0, permanent: 0, experience: 0, gold: 0,
    hit: 4, bonus: 5, armour: 0, weapon: 'ej', potions: 0, salves: 0,
    rations: 0, yarrow: 0, sectionPoison: 0, confusionFights: 0,
    limpSections: [], neckBolt: true, neckRemoved: false,
    neckActivated: false, vronTooth: false, cherryBlossom: false,
    passageToken: false, ruby: false, ebonyRod: false, ebonyRodUsed: false,
    invisibleDoses: 0, speedCombats: 0, ejJealousCombats: 0,
    luckyGame: false, luckyRolls: 0, resurrectionCharged: false,
    visited: [], equipment: [], magic: {}, ghosts: {}, enemyCounts: {},
    equipmentStock: [...KINGDOM_EQUIPMENT],
    magicStock: Object.fromEntries(KINGDOM_MAGIC_STOCK.map(item => [item.id, item.stock])) };
}

export function initialKingdomLife(permanent = 0, random = Math.random) {
  if (!integer(permanent)) throw new RangeError('Invalid permanent LIFE');
  const carried = Math.min(10, permanent);
  const rolls = Array.from({ length: 3 }, () => dice(random));
  const life = Math.max(...rolls) * 4 + carried;
  return { life, maxLife: life, permanent: carried, rolls };
}

export function kingdomStrike(roll, hit = 6, bonus = 0, armour = 0,
  { fullDice = false, fixedDamage = null, multiplier = 1, rollBonus = 0 } = {}) {
  if (!integer(roll, 2) || roll > 12 || !integer(hit, 2) || hit > 12
    || !integer(bonus) || !integer(armour) || !integer(multiplier, 1) || !integer(rollBonus) || rollBonus > 2
    || fixedDamage !== null && !integer(fixedDamage)) {
    throw new RangeError('Invalid strike');
  }
  const score = roll + rollBonus;
  const landed = score >= hit;
  const raw = fixedDamage ?? (fullDice ? score : score - hit) + bonus;
  return { hit: landed, damage: landed ? Math.max(0, raw * multiplier - armour) : 0 };
}

export function kingdomFriendlyReaction(random = Math.random) {
  const enemy = die(random);
  const player = die(random) + die(random) + die(random);
  return { enemy, player, success: player < enemy };
}

export function kingdomRunning(random = Math.random) {
  const roll = die(random);
  return { roll, destination: [14, 87, 29, 76, 99, 38][roll - 1], dead: roll === 1 };
}

export function kingdomCourt(random = Math.random) {
  const roll = dice(random);
  return { roll, result: roll >= KINGDOM_RULES.court.releasedAt ? 'released' : roll >= KINGDOM_RULES.court.penaltyAt ? 'penalty' : 'hanged' };
}

export function kingdomTargets(fight) {
  if (fight.spec.trial) return [];
  return fight.foes.map((foe, index) => ({ foe, index }))
    .filter(({ foe }) => (!foe.phase || fight.benTriggered) && !foe.bypassed && foe.life > (fight.spec.deathRequired ||
      fight.options.killEnemies || foe.phase === 1 ? 0 : 5));
}

function settle(fight) {
  if (fight.status !== 'fighting') return;
  const p = fight.player;
  if (p.life <= 5) {
    fight.status = fight.spec.nonlethal ? 'knockout' : 'loss';
    if (fight.spec.knockoutReturn && p.life > 0) fight.redirect = fight.spec.knockoutReturn;
  } else if (!fight.spec.trial && !kingdomTargets(fight).length) {
    fight.status = 'win';
  }
  if (fight.status === 'fighting' && fight.spec.strikeLimit && fight.playerStrikes >= fight.spec.strikeLimit
    && kingdomTargets(fight).length) {
    p.life = 0;
    fight.status = 'loss';
  }
  if (fight.status === 'win' && !fight.rewarded && !fight.spec.dream) {
    if (fight.rounds === 0 && fight.durationBefore) Object.assign(p, fight.durationBefore);
    p.experience++;
    if (p.experience % 20 === 0) { p.permanent++; p.maxLife++; p.life++; }
    fight.rewarded = true;
  }
}

export function rerollKingdomInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const player = dice(random), enemy = dice(random);
  fight.first = player === enemy ? null : player > enemy ? 'player' : 'enemy';
  fight.events.push({ kind: 'initiative', player, enemy, first: fight.first });
  return { player, enemy, first: fight.first };
}

export function startKingdomFight(character, encounterId, options = {}, random = Math.random) {
  const spec = [...KINGDOM_ENCOUNTERS, ...KINGDOM_DREAMS].find(row => row.id === encounterId) ?? customGrailEncounter(encounterId, options.opponents);
  if (!spec) throw new RangeError('Unknown encounter');
  if (!integer(character.life, 6) || !integer(character.maxLife, 6)) {
    throw new RangeError('A conscious character is required');
  }
  const p = clone(character), settings = clone(options);
  let count = spec.count || 1;
  const events = [];
  if (spec.countRoll) {
    if (integer(p.enemyCounts?.[spec.id], 1)) count = p.enemyCounts[spec.id];
    else {
      const roll = spec.countRoll === 'pack' ? die(random) : dice(random);
      count = spec.countRoll === 'pack' ? roll + KINGDOM_RULES.packOffset : roll;
      (p.enemyCounts ||= {})[spec.id] = count;
      events.push({ kind: 'enemyCount', roll, count });
    }
  }
  const enemies = spec.count || spec.countRoll ? Array.from({ length: count }, () => spec.enemies[0]) : spec.enemies;
  const foes = enemies.map(foe => ({ ...foe,
    life: spec.matchPlayerLife ? p.life : foe.life,
    maxLife: spec.matchPlayerLife ? p.life : foe.life,
    hitCount: 0, bypassed: false, spellsUsed: 0, sleepRounds: 0,
    pills: foe.pills || 0 }));
  if (settings.halfEnemyLife && !spec.dream && !spec.trial) {
    for (const foe of foes) foe.life = foe.maxLife = Math.ceil(foe.life / 2);
  }
  if (!settings.halfEnemyLife && !spec.dream && !spec.trial) {
    for (const [index, foe] of foes.entries()) if (p.ghosts?.[spec.id]?.[index]) {
      foe.bypassed = true;
      foe.ghost = true;
    }
  }
  const fight = { rulesVersion: 1, spec: clone(spec), options: settings, player: p, foes,
    status: 'fighting', first: null, rounds: 0, playerStrikes: 0, enemyStrikes: 0,
    friendlyAttempts: [], briberyAttempts: [], target: 0, events,
    combatPoison: 0, gelDamage: 0, bearGripped: !!spec.bearGrip,
    playerMissEvery: spec.playerMissEvery || 0, enemyMissEvery: 0,
    playerAttacks: 1, playerMissRules: spec.playerMissEvery ? [spec.playerMissEvery] : [],
    playerHit: p.hit, playerBonus: p.bonus, playerArmour: p.armour,
    benTriggered: false, ally: null, enemyAlly: null, trialPlayerDamage: 0,
    trialEnemyDamage: 0, trialPassed: null, active: null, attacksLeft: 0,
    enemyQueue: [], enemyQueueIndex: 0, playerLoss: 0, enemyLoss: 0,
    neckArmed: !spec.dream && !spec.surprised && !!settings.neckArmed && p.neckBolt && !p.neckRemoved,
    roundStarted: false,
    durationBefore: { speedCombats: p.speedCombats, confusionFights: p.confusionFights,
      ejJealousCombats: p.ejJealousCombats } };
  if (spec.dream) {
    fight.playerHit = spec.dreamEJ ? 4 : 6;
    fight.playerBonus = spec.dreamEJ ? 5 : 0;
    fight.playerArmour = 0;
  } else {
    if (p.confusionFights > 0) {
      fight.playerMissRules.push(2);
      p.confusionFights--;
    }
    if (p.speedCombats > 0) { fight.playerAttacks = 2; p.speedCombats--; }
    if (p.weapon === 'ej' && p.ejJealousCombats > 0) {
      fight.playerHit = 6; fight.playerBonus = 0; p.ejJealousCombats--;
    }
  }
  if (spec.unarmed) { fight.playerHit = 6; fight.playerBonus = 0; }
  fight.surprised = !!spec.surprised && fight.playerAttacks !== 2;
  fight.neckArmed = !spec.dream && !fight.surprised && !!settings.neckArmed && p.neckBolt && !p.neckRemoved;
  if (settings.invisibility === 'invisible' && !spec.dream) {
    fight.first = 'player';
    fight.enemyMissEvery = 2;
    fight.surprised = false;
  }
  if (!spec.dream && spec.ebonyRod && settings.ebonyRod && p.ebonyRod && p.ruby && !p.ebonyRodUsed) {
    foes[0].life -= 50;
    p.ebonyRodUsed = true;
    events.push({ kind: 'ebonyRod', damage: 50 });
  }
  if (!fight.first && spec.first && !(spec.surprised && fight.playerAttacks === 2 && !spec.dream)) {
    fight.first = spec.first;
  } else if (fight.playerAttacks === 2 && !spec.dream && spec.surprised) {
    fight.first = 'player';
  }
  if (!fight.first) rerollKingdomInitiative(fight, random);
  if (!spec.trial && !kingdomTargets(fight).length && foes.some(foe => foe.ghost)) {
    fight.status = 'avoided';
    Object.assign(p, fight.durationBefore);
    events.push({ kind: 'ghosts' });
  }
  if (settings.invisibility === 'head' && !spec.dream && !spec.trial) {
    for (const foe of foes.filter(foe => !foe.phase)) {
      const roll = dice(random);
      if (roll < 6) foe.bypassed = true;
      events.push({ kind: 'headInvisibility', roll, success: roll < 6 });
    }
    settle(fight);
  }
  if (!spec.dream && (spec.vronTooth && p.vronTooth || spec.cherryBlossom && p.cherryBlossom
    || spec.passageToken && p.passageToken || spec.captureBorfax && p.equipment.includes('quartz')
    || !spec.friendlyForbidden && p.friendshipSection === spec.id)) {
    for (const foe of foes) foe.bypassed = true;
    settle(fight);
  }
  return fight;
}

function damagePlayer(f, amount) {
  const damage = Math.min(f.player.life, Math.max(0, amount));
  f.player.life -= damage;
  f.playerLoss += damage;
  if (f.spec.nonlethal) f.player.life = Math.max(1, f.player.life);
  return damage;
}

function damageEnemy(f, foe, amount) {
  const damage = Math.min(foe.life, Math.max(0, amount));
  foe.life -= damage;
  if (f.spec.immortal) foe.life = Math.max(1, foe.life);
  f.enemyLoss += damage;
  // Killing the Borfax activates Ben before the victory check.
  if (f.spec.captureBorfax && foe === f.foes[0] && foe.life === 0) f.benTriggered = true;
  if (foe.life === 0 && !f.spec.dream) {
    ((f.player.ghosts ||= {})[f.spec.id] ||= {})[f.foes.indexOf(foe)] = true;
  }
  return damage;
}

function beginKingdomRound(f) {
  f.rounds++;
  if (f.sanctuaryThroughRound && f.rounds > f.sanctuaryThroughRound) {
    damagePlayer(f, f.player.life);
    f.status = 'loss';
    f.events.push({ kind: 'suffocation' });
    return;
  }
  f.playerDone = false;
  f.enemyDone = false;
  f.trialPlayerDamage = 0;
  f.trialEnemyDamage = 0;
  f.active = f.first;
  f.attacksLeft = f.playerAttacks;
  f.enemyQueue = f.spec.trial ? [{ index: 0, attacks: 1 }] :
    kingdomTargets(f).map(({ foe, index }) => ({ index, attacks: foe.attacks || 1 }));
  if (f.rounds === 1 && f.spec.countRoll === 'guards' && f.first === 'enemy') f.enemyQueue = f.enemyQueue.slice(0, KINGDOM_RULES.guardsOpeningCount);
  f.enemyQueueIndex = 0;
  f.roundStarted = true;
}

function finishKingdomTurn(f, random = Math.random) {
  if (f.active === 'player' && f.ally?.life > 5 && f.status === 'fighting') {
    f.allyPending = true;
    kingdomAllyAttack(f, random);
  }
  f[f.active === 'player' ? 'playerDone' : 'enemyDone'] = true;
  if (!f.playerDone || !f.enemyDone) {
    f.active = f.playerDone ? 'enemy' : 'player';
    return;
  }
  if (f.spec.trial) {
    const damage = damagePlayer(f, Math.max(0, f.trialEnemyDamage - f.trialPlayerDamage));
    f.events.push({ kind: 'trialRound', damage, player: f.trialPlayerDamage, enemy: f.trialEnemyDamage });
    if (f.player.life < KINGDOM_RULES.trial.minLife || f.rounds === KINGDOM_RULES.trial.rounds) {
      f.trialPassed = f.rounds === KINGDOM_RULES.trial.rounds && f.player.life >= KINGDOM_RULES.trial.minLife;
      f.status = f.trialPassed ? 'win' : 'knockout';
      if (f.trialPassed && !f.rewarded) {
        f.player.experience++;
        if (f.player.experience % 20 === 0) { f.player.permanent++; f.player.maxLife++; f.player.life++; }
        f.rewarded = true;
      }
    }
  } else if (f.status === 'fighting') {
    for (const { foe } of kingdomTargets(f)) if (foe.gelDamage) damageEnemy(f, foe, foe.gelDamage);
    const damage = damagePlayer(f, f.combatPoison + (f.sanctuaryThroughRound >= f.rounds ? 0 : f.gelDamage));
    if (damage) f.events.push({ kind: 'ongoingDamage', damage });
    settle(f);
  }
  f.active = null;
  f.roundStarted = false;
}

export function kingdomPlayerAttack(f, index = f.target, random = Math.random) {
  if (f.status !== 'fighting' || !f.first || f.bearGripped) return null;
  if (f.roundStarted && f.active !== 'player' || !f.roundStarted && f.first !== 'player') return null;
  const target = f.spec.trial ? f.foes[0] : kingdomTargets(f).find(row => row.index === index)?.foe;
  if (!target || f.freeStrikes && !(target.freePlayerStrikes > 0)) return null;
  if (!f.roundStarted) beginKingdomRound(f);
  if (f.status !== 'fighting') return null;
  f.playerStrikes++;
  const roll = dice(random);
  const rollBonus = f.luckyNext && f.player.luckyRolls > 0 ? 2 : 0;
  if (rollBonus) { f.player.luckyRolls--; f.luckyNext = false; }
  const forcedMiss = f.playerMissRules.some(period => f.playerStrikes % period === 0)
    || !f.spec.dream && (f.player.limpActive || f.player.limpSections.length > 0) && f.playerStrikes % 3 === 0;
  const result = forcedMiss ? { hit: false, damage: 0 } :
    kingdomStrike(roll, f.playerHit, f.playerBonus, target.armour,
      { fullDice: !!f.spec.fullDice, rollBonus });
  if (f.spec.trial) f.trialPlayerDamage += result.damage;
  else if (result.hit) damageEnemy(f, target,
    f.player.weapon === 'vorpalSword' && !f.spec.unarmed && !f.spec.dream && roll >= 11 ? target.life : result.damage);
  const event = { kind: 'playerAttack', index, roll, rollBonus, forcedMiss, ...result };
  f.events.push(event);
  if (f.player.weapon === 'vorpalSword' && !f.spec.unarmed && !f.spec.dream) {
    f.player.vorpalUses = (f.player.vorpalUses || 0) + 1;
    f.player.ejJealousCombats = f.player.vorpalUses;
  }
  f.attacksLeft--;
  if (f.freeStrikes) {
    target.freePlayerStrikes--;
    if (!kingdomTargets(f).some(row => row.foe === target)) {
      f.attacksLeft -= target.freePlayerStrikes;
      target.freePlayerStrikes = 0;
    }
    f.freeStrikes = f.foes.some(foe => foe.freePlayerStrikes > 0 && kingdomTargets(f).some(row => row.foe === foe));
  }
  settle(f);
  if (f.attacksLeft === 0 || f.status !== 'fighting') finishKingdomTurn(f, random);
  return event;
}

export function kingdomEnemyAttack(f, random = Math.random) {
  if (f.status !== 'fighting' || !f.first || f.bearGripped) return null;
  if (f.roundStarted && f.active !== 'enemy' || !f.roundStarted && f.first !== 'enemy') return null;
  if (!f.roundStarted) beginKingdomRound(f);
  if (f.status !== 'fighting' || f.allyPending) return null;
  let slot, foe;
  while ((slot = f.enemyQueue[f.enemyQueueIndex])) {
    foe = f.foes[slot.index];
    if (f.spec.trial || kingdomTargets(f).some(row => row.index === slot.index)) break;
    f.enemyQueueIndex++;
  }
  if (!slot) { finishKingdomTurn(f, random); return { kind: 'noEnemyAttack' }; }
  let event;
  if (f.spec.reinforcements && !f.whistleBlown) {
    const count = die(random);
    f.whistleBlown = true;
    for (let i = 0; i < count; i++) f.foes.push({ ...clone(f.spec.enemies[0]), maxLife: f.spec.enemies[0].life,
      hitCount: 0, bypassed: false, spellsUsed: 0, sleepRounds: 0 });
    event = { kind: 'reinforcements', count };
  } else if (foe.sleepRounds > 0) {
    foe.sleepRounds--;
    event = { kind: 'sleeping', index: slot.index };
  } else if (foe.magic === 'dragonfire' && foe.pills > 0) {
    foe.pills--;
    let damage = foe.psionicThroughRound >= f.rounds ? KINGDOM_RULES.witchMagic.psionicDragonfire : KINGDOM_RULES.witchMagic.dragonfire;
    if (f.sanctuaryThroughRound >= f.rounds) damage = 0;
    event = { kind: 'dragonfire', damage: damagePlayer(f, damage), index: slot.index };
  } else {
    const roll = dice(random);
    f.enemyStrikes++;
    const forcedMiss = f.enemyMissEvery && f.enemyStrikes % f.enemyMissEvery === 0
      || f.xerox && f.rounds % 2 === 0;
    const bonus = foe.alternatingHitBonus?.[foe.hitCount % foe.alternatingHitBonus.length] ?? foe.bonus;
    let result = forcedMiss ? { hit: false, damage: 0 } : kingdomStrike(roll, foe.hit, bonus,
      f.playerArmour, { fullDice: foe.fullDice, fixedDamage: foe.fixedDamage });
    if (foe.magic && foe.magic !== 'dragonfire' && !foe.spellsUsed) {
      if (foe.magic === 'thunderbolt') foe.spellsUsed++;
      result = { hit: !forcedMiss && roll >= KINGDOM_RULES.witchMagic.hit, damage: 0 };
      if (result.hit && foe.magic === 'thunderbolt') {
        result.damage = Math.floor(f.player.life / 2);
        if (f.player.magic.lightningRod > 0) {
          f.player.magic.lightningRod--;
          result.damage = 0;
          result.absorbed = true;
        }
      }
      if (result.hit && foe.magic === 'kangling') { f.gelDamage = KINGDOM_RULES.witchMagic.kangling; foe.spellsUsed++; }
    }
    if (result.hit) {
      foe.hitCount++;
      if (foe.sectionPoison) f.player.sectionPoison = foe.sectionPoison;
      if (foe.combatPoison) f.combatPoison = foe.combatPoison;
      if (foe.psionicThroughRound >= f.rounds) result.damage = Math.floor(result.damage / 2);
      if (f.sanctuaryThroughRound >= f.rounds) result.damage = 0;
      if (f.spec.trial) f.trialEnemyDamage += result.damage;
      else damagePlayer(f, result.damage);
      if (f.neckArmed && !foe.magic && roll === 12 && !f.spec.immortal) damageEnemy(f, foe, foe.life);
    }
    event = { kind: 'enemyAttack', index: slot.index, roll, forcedMiss: !!forcedMiss, ...result };
  }
  f.events.push(event);
  slot.attacks--;
  if (slot.attacks === 0) f.enemyQueueIndex++;
  settle(f);
  if (f.enemyQueueIndex === f.enemyQueue.length || f.status !== 'fighting') finishKingdomTurn(f, random);
  return event;
}

export function kingdomTryFriendly(f, index = f.target, random = Math.random) {
  const target = kingdomTargets(f).find(row => row.index === index)?.foe;
  if (!target || f.roundStarted || f.rounds || f.status !== 'fighting' || !f.spec.friendly
    || f.spec.friendlyForbidden || f.friendlyAttempts.includes(index)
    || f.spec.friendlyLimit && f.friendlyAttempts.length >= f.spec.friendlyLimit) return null;
  const result = kingdomFriendlyReaction(random);
  f.friendlyAttempts.push(index);
  if (result.success) target.bypassed = true;
  f.events.push({ kind: 'friendly', index, ...result });
  settle(f);
  return result;
}

export function kingdomTryBribe(f, index = f.target, random = Math.random) {
  const target = kingdomTargets(f).find(row => row.index === index)?.foe;
  const cost = f.spec.bribe;
  if (!target || !cost || f.rounds || f.roundStarted || f.status !== 'fighting'
    || f.briberyAttempts.includes(index) || f.player.gold < cost) return null;
  f.player.gold -= cost;
  if (f.spec.bribeRations) f.player.rations = 0;
  f.briberyAttempts.push(index);
  const roll = dice(random), success = roll >= 8;
  if (success) target.bypassed = true;
  f.events.push({ kind: 'bribe', index, cost, roll, success });
  settle(f);
  return { roll, success, cost };
}

export function rollKingdomRound(f, target = kingdomTargets(f)[0]?.index ?? 0, random = Math.random) {
  if (f.status !== 'fighting' || !f.first || f.bearGripped) return null;
  if (!f.spec.trial && !kingdomTargets(f).some(row => row.index === target)) return null;
  const start = f.events.length;
  if (!f.roundStarted) beginKingdomRound(f);
  while (f.roundStarted && f.status === 'fighting') {
    if (f.active === 'player') {
      const targets = kingdomTargets(f).filter(row => !f.freeStrikes || row.foe.freePlayerStrikes > 0);
      const index = f.spec.trial ? 0 : targets.find(row => row.index === target)?.index
        ?? targets[0]?.index;
      if (index === undefined) { settle(f); break; }
      kingdomPlayerAttack(f, index, random);
    } else if (f.allyPending) kingdomAllyAttack(f, random);
    else kingdomEnemyAttack(f, random);
  }
  return f.events.slice(start);
}

export function prepareKingdomMagic(f, index, random = Math.random) {
  if (f.spec.dream || f.spec.trial || f.status !== 'fighting' || !f.first || f.bearGripped
    || f.roundStarted && f.active !== 'player' || !f.roundStarted && f.first !== 'player') return null;
  const foe = kingdomTargets(f).find(row => row.index === index)?.foe;
  if (!foe) return null;
  if (!f.roundStarted) beginKingdomRound(f);
  f.playerStrikes++;
  const forcedMiss = f.playerMissRules.some(period => f.playerStrikes % period === 0);
  const resistanceRoll = foe.magicResistance ? dice(random) : null;
  return { foe, forcedMiss, resistanceRoll,
    resisted: resistanceRoll !== null && resistanceRoll < foe.magicResistance };
}

export function finishKingdomMagic(f, event, random = Math.random) {
  f.events.push(event);
  f.attacksLeft--;
  settle(f);
  if (f.attacksLeft === 0 || f.status !== 'fighting') finishKingdomTurn(f, random);
  return event;
}

export function kingdomAllyAttack(f, random = Math.random) {
  if (!f.allyPending || f.status !== 'fighting' || !f.ally || f.ally.life <= 5) return null;
  f.allyPending = false;
  const target = kingdomTargets(f).find(row => !f.ally.expiresOnEnemy || row.index === f.ally.target);
  if (!target) { f.ally = null; return { kind: 'allyExpired' }; }
  const roll = dice(random);
  const result = kingdomStrike(roll, f.ally.hit, f.ally.bonus, target.foe.armour);
  damageEnemy(f, target.foe, result.damage);
  const event = { kind: 'allyAttack', name: f.ally.name, index: target.index, roll, ...result };
  f.events.push(event);
  settle(f);
  return event;
}

export function kingdomBreakBearGrip(f, random = Math.random) {
  if (f.status !== 'fighting' || !f.bearGripped) return null;
  const roll = dice(random);
  f.bearGripped = roll < KINGDOM_RULES.bearGrip.releaseAt;
  const event = { kind: 'bearGrip', roll, freed: !f.bearGripped,
    damage: f.bearGripped ? damagePlayer(f, KINGDOM_RULES.bearGrip.damage) : 0 };
  f.events.push(event);
  settle(f);
  return event;
}

export function kingdomLeaveFight(f, mode, random = Math.random) {
  if (f.status !== 'fighting' || f.rounds > 0 || f.roundStarted) return null;
  let result;
  if (mode === 'run' && f.spec.running) {
    result = kingdomRunning(random);
    if (result.dead) { damagePlayer(f, f.player.life); f.status = 'loss'; }
    else f.status = 'avoided';
    f.redirect = result.destination;
  } else if (mode === 'retreat' && f.spec.freeRetreat) {
    f.status = 'avoided';
    result = { success: true };
  } else if (mode === 'surrender' && f.spec.surrender) {
    f.player.equipment = [];
    f.player.armour = 0;
    f.player.potions = f.player.salves = f.player.rations = 0;
    f.status = 'avoided';
    result = { success: true };
  } else return null;
  if (f.durationBefore) Object.assign(f.player, f.durationBefore);
  f.events.push({ kind: mode, ...result });
  return result;
}

export function kingdomCallGnurlbash(f, index = f.target) {
  if (f.status !== 'fighting' || f.spec.dream || !f.player.gnurlbash || f.ally
    || !kingdomTargets(f).some(row => row.index === index)) return false;
  f.player.gnurlbash = false;
  f.ally = { ...clone(KINGDOM_SUPPORT.gnurlbash), target: index };
  return true;
}

export function kingdomCollectWitchLoot(f) {
  if (!kingdomCanCollectWitchLoot(f)) return false;
  f.player.witchLootCollected = true;
  for (const { item, charges } of KINGDOM_RULES.witchLoot.rewards) {
    f.player.magic[item] = (f.player.magic[item] || 0) + charges;
  }
  return true;
}

export { damagePlayer as damageKingdomPlayer, damageEnemy as damageKingdomEnemy,
  settle as settleKingdomFight };

export function kingdomVisit(character, section) {
  if (!integer(section, 1) || section > 181) throw new RangeError('Invalid section');
  const p = clone(character);
  p.visited.push(section);
  p.limpActive = p.limpSections.length > 0;
  p.limpSections = p.limpSections.slice(1);
  if (p.friendshipPending) { p.friendshipSection = section; p.friendshipPending = false; }
  else if (p.friendshipSection !== section) p.friendshipSection = null;
  if (p.sectionPoison) p.life = Math.max(0, p.life - p.sectionPoison);
  return p;
}

export function kingdomHeal(character, item, random = Math.random) {
  const p = clone(character);
  if (p.life <= 0) return { ok: false, player: p, reason: 'dead' };
  const field = item === 'potion' ? 'potions' : item === 'salve' ? 'salves' : null;
  if (!field || p[field] <= 0) return { ok: false, player: p, reason: 'unavailable' };
  const amount = item === 'potion' ? dice(random) : 3;
  p[field]--;
  p.life = Math.min(p.maxLife, p.life + amount);
  return { ok: true, player: p, amount };
}

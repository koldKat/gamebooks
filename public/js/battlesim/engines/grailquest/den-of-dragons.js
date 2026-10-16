import { customGrailEncounter } from './opponents.js';
import { DEN_ENCOUNTERS, DEN_DREAM_FIGHTS } from './den-of-dragons-roster.js';

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const copy = value => JSON.parse(JSON.stringify(value));
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

export function createDenCharacter() {
  return { life: 0, maxLife: 0, hit: 4, bonus: 5, armour: 0, permanent: 0, experience: 0,
    spellUses: {}, bolts: 0, fireballs: 0, spellCharged: {}, poisonProtected: false,
    invisible: false, dragonEJ: false, snuff: false, snuffSection: null, lollipop: 0,
    luckstone: false, disease: false, magicalWeapon: true, magicArmour: 0, pendingWallop: 0,
    globs: 0, healingScroll: false, deathScroll: false, hypnosisScroll: false, antidoteScroll: false,
    snuffSections: [] };
}

export function initialDenLife(permanent = 0, random = Math.random) {
  if (!integer(permanent) || permanent > 10) throw new RangeError('Invalid carried permanent LIFE');
  const rolls = Array.from({ length: 3 }, () => dice(random) * 4);
  return { rolls, life: Math.max(...rolls) + permanent };
}

export function denDamage(roll, hit, bonus, armour = 0) {
  return roll < hit ? 0 : Math.max(0, roll - hit + bonus - armour);
}

function active(fight) {
  return fight.foes.map((foe, index) => ({ foe, index })).filter(({ foe }) => !foe.bypassed && (fight.spec.tokenLimit ? fight.enemyLoss < fight.spec.tokenLimit : foe.life > (fight.spec.shapes ? 0 : 5)));
}

function hurtEnemy(fight, foe, damage) {
  if (!fight.spec.tokenLimit) foe.life = Math.max(0, foe.life - damage);
  fight.enemyLoss += damage;
}

function settle(fight) {
  if (fight.player.life <= 0) fight.status = 'loss';
  else if (fight.player.life <= 5 && !fight.spec.shapes) fight.status = 'loss';
  else if (fight.spec.tokenLimit && fight.playerLoss >= fight.spec.tokenLimit) fight.status = 'loss';
  else if (fight.spec.tokenLimit && fight.enemyLoss >= fight.spec.tokenLimit) fight.status = 'win';
  else if (!active(fight).length || fight.spec.fleeAfter && fight.foes.filter(foe => foe.life <= 5).length >= fight.spec.fleeAfter) fight.status = 'win';
  if (fight.status === 'win' && !fight.spec.dream && !fight.experienceAwarded) {
    fight.experienceAwarded = true;
    fight.player.experience++;
    if (fight.player.experience >= 20) {
      const gain = Math.floor(fight.player.experience / 20);
      fight.player.experience %= 20;
      fight.player.permanent += gain;
      fight.player.maxLife += gain;
      fight.player.life += gain;
    }
  }
}

export function createDenFight(section, player, options = {}, random = Math.random) {
  const spec = [...DEN_ENCOUNTERS, ...DEN_DREAM_FIGHTS].find(spec => String(spec.section) === String(section))
    ?? customGrailEncounter(section, options.opponents);
  if (!spec) throw new RangeError('Unknown encounter');
  if (!integer(player.life, 1) || !integer(player.maxLife, player.life) || !integer(player.hit, 2) || player.hit > 12 || !integer(player.bonus) || !integer(player.armour)) throw new RangeError('Invalid character');
  const p = copy(player);
  const fight = { rulesVersion: 1, spec: copy(spec), player: p, rounds: 0, status: 'fighting',
    playerLoss: 0, enemyLoss: 0, nextBonus: spec.dream ? 0 : p.pendingWallop ?? 0,
    magicArmour: spec.dream ? 0 : p.magicArmour ?? 0, repeat: false,
    events: [], poisonPending: false, arrows: spec.arrows ?? 0, openingTargets: 1,
    foes: (spec.custom ? spec.enemies : Array.from({length: spec.count}, () => ({name: spec.name, life: spec.life})))
      .map((enemy, index) => ({...copy(enemy), maxLife: enemy.life, consecutiveHits: 0, successfulHits: 0, attacks: 0, skip: 0, index})) };
  if (spec.magicChallenge && ['pad', 'pow'].every(spell => (p.spellUses[spell] ?? 0) >= 3)) p.life = 0;
  if (spec.entryDamage) { p.life = Math.max(0, p.life - spec.entryDamage); fight.playerLoss += spec.entryDamage; }
  if (spec.dreamInitiative) fight.first = dice(random) <= 6 ? 'enemy' : 'player';
  else if (spec.first) fight.first = spec.first;
  else {
    const enemy = dice(random), own = dice(random) + (spec.playerRollModifier ?? 0);
    fight.initiative = { enemy, player: own };
    fight.first = own > enemy ? 'player' : enemy > own ? 'enemy' : null;
  }
  if (options.first !== undefined) {
    if (!['player', 'enemy'].includes(options.first) || fight.first) throw new RangeError('Initiative override only resolves a tie');
    fight.first = options.first;
  }
  if (spec.openingTargets) { fight.openingTargets = dice(random); fight.first = 'player'; }
  if (spec.openingEvasion) {
    const roll = dice(random);
    fight.events.push({ kind: 'evasion', roll });
    if (roll >= 9) p.life = 0;
  }
  settle(fight);
  return fight;
}

export function resolveDenInitiative(fight, first) {
  if (fight.first || !['player', 'enemy'].includes(first)) throw new RangeError('Not an unresolved initiative tie');
  fight.first = first;
}

export function rerollDenInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const enemy = dice(random), player = dice(random) + (fight.spec.playerRollModifier ?? 0);
  fight.initiative = { enemy, player };
  fight.first = player > enemy ? 'player' : enemy > player ? 'enemy' : null;
  return fight.initiative;
}

function enemyTurn(fight, random) {
  const spec = fight.spec;
  for (const { foe, index } of active(fight)) {
    if (fight.status !== 'fighting') break;
    if (foe.globBlows > 0) { fight.events.push({ kind: 'skip', index }); continue; }
    if (foe.skip > 0) { foe.skip--; fight.events.push({ kind: 'skip', index }); continue; }
    if (spec.shapes) break;
    foe.attacks++;
    const roll = spec.automaticDamage ? null : dice(random);
    const invisible = fight.player.invisible && !spec.dream;
    const threshold = invisible && spec.invisibleHit ? spec.invisibleHit : foe.hit ?? spec.hit;
    const hit = spec.automaticDamage ? true : roll >= threshold;
    if (hit) foe.successfulHits++;
    const bonus = hit && spec.fireEvery && foe.successfulHits % spec.fireEvery === 0 ? spec.fireBonus : foe.bonus ?? spec.bonus;
    const playerArmour = spec.playerArmour ?? (spec.dream ? 0 : fight.player.armour);
    const damage = spec.automaticDamage ?? denDamage(roll, threshold, bonus, playerArmour + fight.magicArmour);
    foe.consecutiveHits = hit ? foe.consecutiveHits + 1 : 0;
    fight.player.life = Math.max(0, fight.player.life - damage);
    fight.playerLoss += damage;
    fight.events.push({ kind: 'enemy', index, roll, hit, damage });
    if (hit && spec.disease) fight.player.disease = true;
    if (hit && spec.lethalHit) fight.player.life = 0;
    if (spec.petrifyHits && foe.consecutiveHits >= spec.petrifyHits + (invisible ? 1 : 0)) fight.player.life = 0;
    if (spec.poisonHits && foe.consecutiveHits >= spec.poisonHits && !fight.player.poisonProtected) {
      fight.poisonPending = true;
      break;
    }
    settle(fight);
  }
}

function playerTurn(fight, target, random) {
  const spec = fight.spec;
  const targets = spec.shapes ? active(fight).slice(0, 1) : fight.rounds === 1 && spec.openingTargets ? active(fight).slice(0, fight.openingTargets) : active(fight).filter(entry => entry.index === target);
  for (const { foe, index } of targets) {
    for (let blow = 0; blow < (fight.repeat ? 2 : 1); blow++) {
      if (fight.status !== 'fighting' || !spec.tokenLimit && foe.life <= (spec.shapes ? 0 : 5)) break;
      const roll = dice(random) + (spec.playerRollModifier ?? 0);
      if (foe.globBlows > 0) foe.globBlows--;
      const arrow = spec.arrows && fight.arrows > 0;
      const threshold = arrow ? 7 : spec.playerHit ?? (spec.unarmed || spec.dream ? 6 : fight.player.hit);
      const hit = roll >= threshold;
      const armour = spec.magicWeaponArmour ?? foe.armour ?? spec.armour;
      const bonus = spec.playerBonus ?? (spec.unarmed || spec.dream ? 0 : spec.dragon && fight.player.dragonEJ ? 10 : fight.player.bonus);
      const immune = spec.magicOnly || spec.magicWeaponArmour !== undefined && !fight.player.magicalWeapon;
      const damage = immune ? 0 : arrow ? (hit ? 10 : 0) : denDamage(roll, threshold, bonus + fight.nextBonus, armour);
      if (arrow) fight.arrows--;
      if (hit && !immune && !spec.dream) { fight.nextBonus = 0; fight.player.pendingWallop = 0; }
      hurtEnemy(fight, foe, damage);
      fight.events.push({ kind: 'player', index, roll, hit, damage, arrow });
      if (spec.shapes && foe.life > 0) {
        fight.player.life = Math.max(0, fight.player.life - 15);
        fight.playerLoss += 15;
        foe.life = 0;
        fight.events.push({ kind: 'blend', index, damage: 15 });
      }
      settle(fight);
    }
  }
}

export function rollDenRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.poisonPending || !fight.first || fight.spec.magicChallenge) return null;
  if (!fight.spec.shapes && !active(fight).some(entry => entry.index === target)) throw new RangeError('Invalid target');
  fight.rounds++;
  fight.events = [];
  const ranged = fight.spec.arrows && fight.rounds <= 8;
  if (fight.first === 'enemy' && !ranged) enemyTurn(fight, random);
  if (fight.status === 'fighting' && !fight.poisonPending) playerTurn(fight, target, random);
  if (fight.status === 'fighting' && !fight.poisonPending && (fight.first === 'player' || ranged) && !(fight.spec.arrows && fight.rounds < 8)) enemyTurn(fight, random);
  if (fight.status === 'fighting' && fight.spec.roundLimit && fight.rounds >= fight.spec.roundLimit) { fight.player.life = 0; settle(fight); }
  return fight.events;
}

export function resolveDenPoison(fight, random = Math.random) {
  if (!fight.poisonPending || fight.status !== 'fighting') return null;
  const roll = dice(random);
  fight.poisonPending = false;
  fight.foes[0].consecutiveHits = 0;
  if (roll <= 4) fight.player.life = 0;
  else if (roll <= 8) fight.player.poisonProtected = true;
  else if (roll === 9) fight.foes[0].life = 0;
  else {
    fight.player.life = Math.floor(fight.player.life / 2);
    fight.status = 'escaped';
  }
  settle(fight);
  return { roll, status: fight.status };
}

export function castDenSpell(fight, spell, target = 0, random = Math.random) {
  const available = ['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeat', 'invisibility', 'firefinger', 'fireball'];
  if (fight.status !== 'fighting' || fight.poisonPending || fight.spec.dream || !available.includes(spell)) return null;
  if (fight.spec.magicChallenge && !['pad', 'pow'].includes(spell)) return null;
  const p = fight.player;
  const limit = spell === 'invisibility' ? 1 : 3;
  if ((p.spellUses[spell] ?? 0) >= limit || p.spellCharged[spell]) return null;
  if (spell === 'invisibility' && ![98, 130, 136, 137, 172].includes(fight.spec.section)) return null;
  if (['pad', 'pill'].includes(spell) && !active(fight).some(entry => entry.index === target)) return null;
  const cost = spell === 'invisibility' ? 15 : 3;
  p.spellUses[spell] = (p.spellUses[spell] ?? 0) + 1;
  p.life = Math.max(0, p.life - cost);
  settle(fight);
  if (fight.status !== 'fighting') return { spell, cost, success: false, fatal: true };
  const roll = dice(random) + (fight.spec.playerRollModifier ?? 0), success = roll >= 7;
  if (fight.spec.magicChallenge) {
    if (success) hurtEnemy(fight, fight.foes[0], fight.foes[0].life);
    else p.life = 0;
    settle(fight);
    return { spell, cost, roll, success };
  }
  if (success) {
    if (spell === 'panic') { fight.magicArmour = 4; p.magicArmour = 4; }
    else if (spell === 'pow') { fight.nextBonus = 10; p.pendingWallop = 10; }
    else if (spell === 'repeat') fight.repeat = true;
    else if (spell === 'pip') p.poisonProtected = true;
    else if (spell === 'invisibility') p.invisible = true;
    else if (spell === 'pill') fight.foes[target].skip += 3;
    else if (spell === 'pad') hurtEnemy(fight, fight.foes[target], 10);
    else if (spell === 'firefinger') { p.bolts += 10; p.spellCharged[spell] = true; }
    else if (spell === 'fireball') { p.fireballs += 2; p.spellCharged[spell] = true; }
    settle(fight);
  }
  return { spell, cost, roll, success };
}

export function launchDenMagic(fight, kind, target = 0) {
  if (fight.status !== 'fighting' || fight.poisonPending || fight.spec.dream || fight.spec.magicChallenge || !['bolts', 'fireballs'].includes(kind) || fight.player[kind] < 1) return null;
  const selected = active(fight).find(entry => entry.index === target);
  if (!selected) throw new RangeError('Invalid target');
  fight.player[kind]--;
  const damage = kind === 'bolts' ? 10 : 75;
  hurtEnemy(fight, selected.foe, damage);
  settle(fight);
  return { damage, target };
}

export function healDenPlayer(player, amount) {
  if (!integer(amount) || player.life <= 0) return false;
  player.life = Math.min(player.maxLife, player.life + amount);
  return true;
}

export function useDenItem(fight, item, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.spec.dream || fight.spec.magicChallenge) return null;
  const p = fight.player;
  if (fight.poisonPending && item !== 'antidoteScroll') return null;
  const selected = active(fight).find(entry => entry.index === target);
  if (!selected || !['globs', 'healingScroll', 'deathScroll', 'hypnosisScroll', 'antidoteScroll', 'snuff'].includes(item) || !p[item]) return null;
  if (item === 'hypnosisScroll' && fight.spec.dragon) return null;
  if (item === 'snuff' && (p.snuffSections ?? []).includes(fight.spec.section)) return null;
  if (item === 'globs') {
    if (!integer(p.globs, 1)) return null;
    p.globs--;
    selected.foe.globBlows = 4;
    return { item, success: true };
  }
  if (item === 'snuff') {
    (p.snuffSections ||= []).push(fight.spec.section);
    const amount = dice(random) + dice(random), before = p.life;
    healDenPlayer(p, amount);
    return { item, success: true, amount: p.life - before };
  }
  if (item === 'healingScroll' || item === 'deathScroll') p[item] = false;
  if (item === 'healingScroll') {
    const amount = p.maxLife - p.life;
    healDenPlayer(p, amount);
    return { item, success: true, amount };
  }
  if (item === 'antidoteScroll') {
    fight.poisonPending = false;
    selected.foe.consecutiveHits = 0;
    return { item, success: true };
  }
  const first = die(random), second = die(random), roll = first + second + (item === 'hypnosisScroll' ? fight.spec.playerRollModifier ?? 0 : 0);
  const success = item === 'deathScroll' ? first !== second || ![1, 3, 6].includes(first) : roll >= 5;
  if (success) {
    if (item === 'hypnosisScroll') selected.foe.bypassed = true;
    else hurtEnemy(fight, selected.foe, fight.spec.tokenLimit ? fight.spec.tokenLimit : selected.foe.life);
  } else if (item === 'deathScroll') p.life = 0;
  settle(fight);
  return { item, roll, success };
}

export function useDenLollipop(fight) {
  if (fight.status !== 'fighting' || fight.player.life <= 0 || fight.player.lollipop < 1 || fight.spec.dream || fight.spec.magicChallenge || fight.poisonPending) return null;
  const foe = active(fight)[0]?.foe;
  if (!foe) return null;
  const amount = fight.player.maxLife - fight.player.life;
  fight.player.lollipop--;
  fight.player.life += amount;
  hurtEnemy(fight, foe, amount);
  settle(fight);
  return amount;
}

export function denFriendlyReaction(random = Math.random) {
  const enemy = die(random), player = die(random) + die(random) + die(random);
  return { enemy, player, friendly: player < enemy };
}

export function denDream(player, number, random = Math.random) {
  if (!integer(number, 2) || number > 12 || player.life <= 0) throw new RangeError('Invalid Dreamtime');
  const p = copy(player), result = { number, player: p, rolls: [], status: 'survived' };
  const roll = () => { const value = dice(random); result.rolls.push(value); return value; };
  if ([2, 8, 10].includes(number)) {
    result.fight = createDenFight(`dream${number}`, p, {}, random);
    result.player = result.fight.player;
    result.status = result.fight.status;
    return result;
  }
  let loss = 0;
  if (number === 3) { const vampire = roll(), own = roll(); if (vampire - own > 5) loss = p.life; }
  else if (number === 4) { if (roll() <= 6) loss = roll(); }
  else if (number === 5) {
    if (roll() < 6) { if (roll() < 6) loss = 10; else if (roll() < 6) loss = p.life; }
  } else if (number === 6 || number === 11) loss = die(random);
  else if (number === 7) loss = die(random) < 6 ? 5 : 0;
  else if (number === 9) result.status = die(random) <= 3 ? 'survived' : 'sleep-again';
  else if (number === 12) {
    const enemy = die(random), own = die(random);
    result.rolls = [enemy, own];
    if (enemy > own) loss = Math.ceil(p.life / 2);
    if (enemy === own) result.status = 'tie';
  }
  p.life = Math.max(0, p.life - loss);
  if (p.life <= 0) result.status = 'loss';
  result.loss = loss;
  return result;
}

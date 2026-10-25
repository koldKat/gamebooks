import { customGrailEncounter } from './opponents.js';
import { TOMB_EQUIPMENT, TOMB_SECRET_DOORS, TOMB_ENCOUNTERS, TOMB_DREAMS, TOMB_COMPANION, TOMB_RULES } from './tomb-of-nightmares-roster.js';
export { TOMB_RULES, TOMB_COMPANION } from './tomb-of-nightmares-roster.js';

export function tombEncounterId(value) {
  return [...TOMB_ENCOUNTERS, ...TOMB_DREAMS].find(spec => String(spec.id) === String(value))?.id ?? Number(value);
}

export function tombDisplaySection(id) {
  return [...TOMB_ENCOUNTERS, ...TOMB_DREAMS].find(spec => spec.id === id)?.section ?? id;
}

export function tombManualPoisonAmount(kind) {
  return kind === 'needle' ? TOMB_RULES.manualPoison.needle : TOMB_RULES.manualPoison.default;
}

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const alive = character => Number.isFinite(character.life) && character.life > 0;

export function createTombCharacter() {
  return { life: 0, maxLife: 0, permanent: 0, experience: 0, gold: 0,
    hit: 4, bonus: 5, armour: 0, weapon: 'ej', potions: 0, salves: 0,
    equipment: [...TOMB_EQUIPMENT], killed: {}, spells: {}, bolts: 0, fireballs: 0, fruit: 0,
    currentSection: null, searchedSection: null, poison: null, dreamDisease: false,
    poisonImmune: false, fireballImmune: false, gills: false, goldenGarlic: false,
    deathOde: false, nauseaFights: 0, mould: false, pearlUses: 0, crystalDagger: false,
    vampireRing: false, blackRod: false, beeTraining: false, hologram: false, silverSword: false,
    companion: null, deaths: 0 };
}

export function initialTombLife(permanent = 0, random = Math.random) {
  if (!integer(permanent)) throw new RangeError('Invalid permanent LIFE');
  const carried = Math.min(10, permanent);
  const rolls = Array.from({ length: 3 }, () => dice(random));
  const life = Math.max(...rolls) * 4 + carried;
  return { life, maxLife: life, permanent: carried, rolls };
}

export function tombStrike(roll, hit = 6, bonus = 0, armour = 0, fixedDamage = null) {
  if (!integer(roll, 2) || roll > 12 || !integer(hit, 1) || hit > 12
    || !Number.isFinite(bonus) || !Number.isFinite(armour) || armour < 0
    || fixedDamage !== null && (!Number.isFinite(fixedDamage) || fixedDamage < 0)) {
    throw new RangeError('Invalid strike');
  }
  const landed = roll >= hit;
  return { hit: landed, damage: landed ? Math.max(0, (fixedDamage ?? roll - hit + bonus) - armour) : 0 };
}

function heal(character, amount) {
  const before = character.life;
  if (alive(character)) character.life = Math.min(character.maxLife, character.life + amount);
  return character.life - before;
}

export function tombVisit(character, section) {
  const number = Number(section);
  if (!integer(number, 1) || number > 224 || number === character.currentSection) return false;
  character.currentSection = number;
  character.searchedSection = null;
  if (alive(character) && character.poison && character.poison.kind !== 'combat') {
    character.life = Math.max(0, character.life - character.poison.amount);
  }
  if (alive(character) && character.dreamDisease) character.life = Math.max(0, character.life - 1);
  return true;
}

export function tombSearch(character, random = Math.random) {
  if (!alive(character) || !integer(character.currentSection, 1)
    || character.currentSection === character.searchedSection) return null;
  character.searchedSection = character.currentSection;
  const roll = die(random);
  return { roll, success: roll >= 4,
    doors: roll >= 4 ? TOMB_SECRET_DOORS[character.currentSection] ?? [] : [] };
}

export function tombHeal(character, kind, random = Math.random, { inCombat = false } = {}) {
  if (!alive(character) || inCombat) return null;
  if (kind === 'potion') {
    if (!integer(character.potions, 1)) return null;
    character.potions--;
    character.dreamDisease = false;
    if (character.poison?.kind === 'rot') character.poison = null;
    return { kind, healing: heal(character, dice(random)) };
  }
  if (kind === 'antidote') {
    if (!integer(character.potions, 3) || !character.poison
      || !['crab', 'needle'].includes(character.poison.kind)) return null;
    character.potions -= 3;
    character.poison = null;
    character.dreamDisease = false;
    return { kind, cured: true, healing: 0 };
  }
  if (kind === 'salve' && integer(character.salves, 1)) {
    character.salves--;
    return { kind, healing: heal(character, 5) };
  }
  if (kind === 'pearl' && integer(character.pearlUses, 1)) {
    character.pearlUses--;
    return { kind, healing: heal(character, character.maxLife) };
  }
  if (kind === 'fruit' && integer(character.fruit, 1)) {
    character.fruit--;
    return { kind, healing: heal(character, dice(random)) };
  }
  return null;
}

export function tombTakeItem(character, item, random = Math.random) {
  if (!alive(character)) return null;
  switch (item) {
    case 'gem':
      character.poisonImmune = character.fireballImmune = true;
      character.poison = null;
      break;
    case 'gills':
      character.life = Math.max(0, character.life - 15);
      if (alive(character)) character.gills = true;
      break;
    case 'mould':
      character.mould = true;
      return { item, healing: heal(character, dice(random)) };
    case 'pearl':
      character.pearlUses = 2;
      return { item, healing: heal(character, character.maxLife) };
    case 'droppings': character.nauseaFights = 3; break;
    case 'goldenGarlic': case 'vampireRing': case 'blackRod': case 'crystalDagger':
    case 'beeTraining': case 'deathOde': case 'silverSword': character[item] = true; break;
    default: return null;
  }
  return { item, dead: !alive(character) };
}

const SPELLS = new Set(['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeater',
  'invisibility', 'firefinger', 'fireball', 'plop', 'pid', 'pals', 'pil', 'pops']);

export function tombEquip(character, weapon) {
  if (!['ej', 'silver', 'crystal', 'unarmed'].includes(weapon)
    || weapon === 'silver' && !character.silverSword
    || weapon === 'crystal' && !character.crystalDagger) return false;
  character.weapon = weapon;
  character.hit = weapon === 'ej' ? 4 : 6;
  character.bonus = weapon === 'ej' ? 5 : 0;
  return true;
}

export function tombCast(character, spell, random = Math.random, options = {}) {
  if (!SPELLS.has(spell) || !alive(character)) return null;
  if (options.blocked || spell === 'invisibility' && !options.markedSection) return null;
  const used = character.spells[spell] ?? 0;
  const single = spell === 'invisibility';
  const generated = ['firefinger', 'fireball'].includes(spell);
  if (used >= (single ? 1 : 3) || generated && character.spells[spell + 'Generated']) return null;
  if (spell === 'plop' && character.spells.plopSection === character.currentSection) return null;
  character.spells[spell] = used + 1;
  character.life = Math.max(0, character.life - (single ? 15 : 3));
  const roll = dice(random);
  const success = alive(character) && roll >= (spell === 'plop' ? 6 : 7);
  if (success) {
    if (generated) {
      character.spells[spell + 'Generated'] = true;
      if (spell === 'firefinger') character.bolts += 10;
      else character.fireballs += 2;
    }
    if (spell === 'pip' && !character.poison) character.poisonImmune = true;
    if (spell === 'plop') character.spells.plopSection = character.currentSection;
    if (spell === 'pil' && options.indoors && !options.shaftException) character.life /= 2;
  }
  return { spell, roll, success, attemptsLeft: (single ? 1 : 3) - character.spells[spell], dead: !alive(character) };
}

export function tombSleep(character, random = Math.random, { inCombat = false } = {}) {
  if (!alive(character) || inCombat) return null;
  const roll = die(random);
  return roll <= 4 ? { roll, dream: true } : { roll, dream: false, healing: heal(character, dice(random)) };
}

export function tombDream(character, number, random = Math.random) {
  if (!integer(number, 2) || number > 12 || !alive(character)) return null;
  const result = { number };
  switch (number) {
    case 2:
      character.life = Math.max(0, character.life - 1);
      if (alive(character)) character.gold += 100;
      break;
    case 3:
      result.roll = die(random);
      if (result.roll >= 4) character.life = 0;
      break;
    case 4:
      result.fruit = die(random);
      character.fruit += result.fruit;
      break;
    case 5: result.encounter = 'dream5'; break;
    case 6:
      result.loss = dice(random) * 2;
      character.life = Math.max(0, character.life - result.loss);
      break;
    case 7: character.gold /= 2; break;
    case 8:
      result.roll = dice(random);
      if (result.roll > 6) result.healing = heal(character, result.roll);
      else character.life = Math.max(0, character.life - result.roll);
      result.printedDeathDestination = 143;
      break;
    case 9: character.dreamDisease = true; break;
    case 10: character.hologram = true; break;
    case 11:
      result.roll = dice(random);
      if (result.roll <= 4) result.retry = true;
      else if (result.roll <= 8) character.life = 0;
      else result.healing = heal(character, character.maxLife);
      break;
    case 12: result.redream = true; break;
  }
  result.dead = !alive(character);
  return result;
}

export function tombBees(character, random = Math.random) {
  if (!alive(character)) return null;
  if (character.beeTraining) return { bypassed: true, bees: 0, loss: 0, dead: false };
  const bees = Array.from({ length: TOMB_RULES.bees.countDice }, () => die(random)).reduce((sum, value) => sum + value, 0) * TOMB_RULES.bees.multiplier;
  const loss = bees * TOMB_RULES.bees.damageEach;
  character.life = Math.max(0, character.life - loss);
  return { bypassed: false, bees, loss, dead: !alive(character) };
}

export function tombReincarnate(character, random = Math.random) {
  const fresh = createTombCharacter();
  Object.assign(fresh, initialTombLife(character.permanent, random));
  fresh.experience = character.experience;
  fresh.killed = { ...character.killed };
  fresh.deaths = (character.deaths ?? 0) + 1;
  Object.assign(character, fresh);
  return character;
}

const clone = value => JSON.parse(JSON.stringify(value));

export function tombTargets(fight) {
  const stop = fight.spec.deathRequired || fight.options.killEnemies ? 0 : 5;
  return fight.foes.map((foe, index) => ({ foe, index })).filter(({ foe }) => !foe.bypassed && foe.life > stop);
}

function settle(fight, random = Math.random) {
  if (fight.status !== 'fighting') return;
  if (fight.ally) fight.player.companion = clone(fight.ally);
  for (const foe of fight.foes) {
    if (foe.life <= 0 && !fight.spec.custom) fight.player.killed[foe.historyKey] = true;
  }
  if (fight.player.life <= 5) fight.status = 'loss';
  else if (!tombTargets(fight).length) fight.status = 'win';
  if (fight.status === 'win' && !fight.rewarded) {
    if (!fight.spec.dream) {
      fight.player.experience++;
      if (fight.player.experience % 20 === 0) {
        fight.player.permanent++;
        fight.player.maxLife++;
        fight.player.life++;
      }
    }
    fight.rewarded = true;
  }
  if (fight.status !== 'fighting') {
    if (fight.player.mould && alive(fight.player)) fight.mouldHealing = heal(fight.player, dice(random));
    if (fight.player.poison?.kind === 'combat') fight.player.poison = null;
    if (fight.ally?.poison?.kind === 'combat') fight.ally.poison = null;
    if (fight.ally) fight.player.companion = clone(fight.ally);
  }
}

export function tombInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const player = dice(random), enemy = dice(random);
  fight.first = player === enemy ? null : player > enemy ? 'player' : 'enemy';
  return { player, enemy, first: fight.first };
}

export function startTombFight(character, encounterId, options = {}, random = Math.random) {
  const original = [...TOMB_ENCOUNTERS, ...TOMB_DREAMS].find(row => row.id === encounterId) ?? customGrailEncounter(encounterId, options.opponents);
  if (!original) throw new RangeError('Unknown encounter');
  if (!alive(character) || character.life <= 5 || !Number.isFinite(character.maxLife)) {
    throw new RangeError('No conscious character');
  }
  const spec = clone(original), player = clone(character);
  let count = spec.count ?? 1;
  if (spec.countDice) {
    count = options.enemyCount ?? (spec.countDice === 1 ? die(random) : dice(random)) + (spec.countExtra ?? 0);
    const low = spec.countDice + (spec.countExtra ?? 0), high = spec.countDice * 6 + (spec.countExtra ?? 0);
    if (!integer(count, low) || count > high) throw new RangeError('Invalid enemy count');
  }
  const foes = spec.enemies.length > 1 ? spec.enemies : Array.from({ length: count }, () => clone(spec.enemies[0]));
  for (const [index, foe] of foes.entries()) {
    foe.initialLife = foe.life;
    foe.historyKey = spec.id + ':' + index;
    if (player.killed[foe.historyKey]) foe.life /= 2;
  }
  const fight = { spec, options: clone(options), player, foes, round: 0, status: 'fighting',
    first: spec.playerFirst ? 'player' : null, paralysis: 0, selfBite: 0, panic: 0,
    pill: 0, pow: false, pops: 0, repeater: false, bat: false, hologram: !!player.hologram,
    nausea: player.nauseaFights > 0 ? 3 : 0, enemyTurns: 0, logs: [], actions: [], rewarded: false,
    ally: !spec.dream && options.useCompanion && player.companion?.life > 5 ? clone(player.companion) : null,
    enemyTargets: {}, rodRound: null };
  if (spec.garlicBypass && player.goldenGarlic) {
    fight.status = 'bypassed';
    return fight;
  }
  if (player.nauseaFights > 0) player.nauseaFights--;
  player.hologram = false;
  if (!fight.first) tombInitiative(fight, random);
  settle(fight, random);
  return fight;
}

function playerStrike(fight, index, random) {
  const foe = fight.foes[index];
  if (!tombTargets(fight).some(target => target.index === index)) return null;
  const player = fight.player;
  const hit = fight.bat ? 4 : fight.spec.playerHit ?? player.hit;
  const bonus = fight.bat ? 4 : fight.spec.playerBonus ?? player.bonus;
  const armour = foe.silverVulnerable && player.weapon === 'silver' ? 0 : foe.armour;
  const roll = dice(random);
  const penalty = fight.spec.grott && !player.deathOde ? 3 : 0;
  const dagger = !fight.bat && player.weapon === 'crystal' && player.crystalDagger;
  const strike = tombStrike(roll, dagger ? 6 : hit, bonus - penalty);
  if (fight.pow) {
    if (strike.hit) strike.damage += 10;
    fight.pow = false;
  }
  if (fight.pops && !fight.bat && player.weapon === 'ej') {
    strike.damage *= fight.pops === 2 ? 2 : 0.5;
    fight.pops--;
  }
  if (strike.hit) strike.damage = Math.max(0, strike.damage - armour);
  if (dagger && strike.hit) {
    foe.life = 0;
    player.crystalDagger = false;
    tombEquip(player, 'ej');
  } else foe.life = Math.max(0, foe.life - strike.damage);
  return { kind: 'player', index, roll, ...strike, fatal: dagger && strike.hit };
}

export function tombAssignEnemy(fight, index, target) {
  if (fight.status !== 'fighting' || !tombTargets(fight).some(row => row.index === index)
    || !['player', 'ally'].includes(target) || target === 'ally' && fight.ally?.life <= 5
    || target === 'ally' && !fight.ally || fight.foes[index].attached) return false;
  fight.enemyTargets[index] = target;
  return true;
}

function defender(fight, index) {
  return fight.enemyTargets[index] === 'ally' && fight.ally?.life > 5
    ? { value: fight.ally, target: 'ally' } : { value: fight.player, target: 'player' };
}

function companionStrike(fight, index, random) {
  if (!fight.ally || fight.ally.life <= 5) return null;
  const foe = fight.foes[index], ally = fight.ally;
  const roll = dice(random);
  const strike = tombStrike(roll, ally.hit, ally.bonus, foe.armour);
  const fatal = ally.fatalRolls?.includes(roll) ?? false;
  foe.life = fatal ? 0 : Math.max(0, foe.life - strike.damage);
  return { kind: 'ally', index, roll, ...strike, fatal };
}

function enemyStrike(fight, index, random) {
  const foe = fight.foes[index];
  if (!tombTargets(fight).some(target => target.index === index)) return null;
  const { value: victim, target } = defender(fight, index);
  fight.enemyTurns++;
  foe.turns = (foe.turns ?? 0) + 1;
  if (target === 'player' && fight.hologram && foe.turns % 2 === 0) return { kind: 'enemy', index, target, skipped: 'hologram' };
  if (fight.pill > 0) { fight.pill--; return { kind: 'enemy', index, skipped: 'laughter' }; }
  if (foe.laughter > 0) { foe.laughter--; return { kind: 'enemy', index, skipped: 'laughter' }; }
  const roll = foe.automatic ? 12 : dice(random);
  const bonus = foe.fireFrom && roll >= foe.fireFrom
    ? foe.fireBonus + (fight.options.fireAdds ? foe.bonus : 0) : foe.bonus;
  const armour = (victim.armour ?? 0) + (target === 'player' ? fight.panic + fight.nausea : 0);
  const strike = tombStrike(roll, target === 'player' && fight.bat ? 7 : foe.hit, bonus,
    0, foe.fixedDamage ?? null);
  if (foe.pow) {
    if (strike.hit) strike.damage = Math.max(0, strike.damage + 10);
    foe.pow = false;
  }
  if (strike.hit) strike.damage = Math.max(0, strike.damage - armour);
  const drowning = foe.drowningFrom && roll >= foe.drowningFrom && fight.round <= foe.drowningRounds;
  const poisonedDeath = foe.poisonFatal && victim.poisonImmune;
  const fatal = !poisonedDeath && (foe.fatalRolls?.includes(roll) || foe.fatalOnHit && strike.hit);
  if (fatal || drowning && !victim.gills) {
    victim.life = 0;
    return { kind: 'enemy', index, target, roll, fatal: true, drowning: !!drowning };
  }
  if (strike.hit) {
    victim.life = Math.max(0, victim.life - strike.damage);
    if (foe.persistentDrain) { foe.draining = true; foe.drainTarget = target; }
    if (foe.attachedDrain) { foe.attached = true; foe.attachedTarget = target; }
    if (foe.selfBiteRoll === roll) {
      if (target === 'player') fight.selfBite = Math.max(fight.selfBite, foe.selfBiteDamage);
      else victim.selfBite = Math.max(victim.selfBite ?? 0, foe.selfBiteDamage);
    }
    if (!victim.poisonImmune && (foe.poisonRoll === roll || foe.poisonFrom && roll >= foe.poisonFrom)) {
      victim.poison = { kind: foe.poisonKind, amount: foe.poison };
    }
  }
  if (foe.paralyseRolls?.includes(roll)) {
    if (target === 'player') fight.paralysis = Math.max(fight.paralysis, foe.paralyseRounds);
    else victim.paralysis = Math.max(victim.paralysis ?? 0, foe.paralyseRounds);
  }
  return { kind: 'enemy', index, target, roll, ...strike };
}

export function tombRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.first || !tombTargets(fight).some(row => row.index === target)) return null;
  fight.round++;
  const events = [];
  const playerTurn = () => {
    if (fight.selfBite) {
      const loss = fight.selfBite;
      fight.selfBite = 0;
      fight.player.life = Math.max(0, fight.player.life - loss);
      events.push({ kind: 'player', skipped: 'self-bite', loss });
    } else if (fight.paralysis > 0) {
      fight.paralysis--;
      events.push({ kind: 'player', skipped: 'paralysis' });
    } else {
      for (let index = 0; index < (fight.repeater ? 2 : 1); index++) {
        const selected = tombTargets(fight).some(row => row.index === target) ? target : tombTargets(fight)[0]?.index;
        if (selected === undefined) break;
        events.push(playerStrike(fight, selected, random));
      }
    }
    if (fight.ally?.life > 5) {
      if (fight.ally.selfBite) {
        const loss = fight.ally.selfBite;
        fight.ally.selfBite = 0;
        fight.ally.life = Math.max(0, fight.ally.life - loss);
        events.push({ kind: 'ally', skipped: 'self-bite', loss });
      } else if (fight.ally.paralysis > 0) {
        fight.ally.paralysis--;
        events.push({ kind: 'ally', skipped: 'paralysis' });
      } else {
        const selected = tombTargets(fight).some(row => row.index === target) ? target : tombTargets(fight)[0]?.index;
        if (selected !== undefined) events.push(companionStrike(fight, selected, random));
      }
    }
  };
  const enemyTurn = () => {
    for (const { foe, index } of tombTargets(fight)) {
      for (let attack = 0; attack < (foe.repeater ? 2 : foe.attacks ?? 1); attack++) {
        if (fight.player.life <= 5) return;
        if (foe.attached) {
          const victim = foe.attachedTarget === 'ally' ? fight.ally : fight.player;
          if (victim?.life > 0) victim.life = Math.max(0, victim.life - foe.attachedDrain);
          events.push({ kind: 'enemy', index, target: foe.attachedTarget, loss: foe.attachedDrain, attached: true });
        } else events.push(enemyStrike(fight, index, random));
      }
    }
  };
  if (fight.first === 'player') {
    playerTurn();
    if (fight.player.life > 5 && tombTargets(fight).length) enemyTurn();
  } else {
    enemyTurn();
    if (fight.player.life > 5) playerTurn();
  }
  for (const [targetName, victim] of [['player', fight.player], ['ally', fight.ally]]) {
    if (!victim || victim.life <= 0) continue;
    let loss = victim.poison?.kind === 'needle' ? 0 : victim.poison?.amount ?? 0;
    for (const { foe } of tombTargets(fight)) {
      if (foe.draining && foe.drainTarget === targetName) loss += foe.persistentDrain;
    }
    if (loss) {
      victim.life = Math.max(0, victim.life - loss);
      events.push({ kind: 'ongoing', target: targetName, loss });
    }
  }
  if (fight.ally) fight.player.companion = clone(fight.ally);
  settle(fight, random);
  fight.logs.push({ round: fight.round, events });
  return events;
}

export function tombFightCast(fight, spell, target = 0, random = Math.random, options = {}) {
  if (fight.status !== 'fighting' || !tombTargets(fight).some(row => row.index === target)) return null;
  const result = tombCast(fight.player, spell, random,
    { ...options, blocked: fight.spec.grott && !fight.player.deathOde });
  if (!result) return null;
  if (result.success) {
    const foe = fight.foes[target];
    switch (spell) {
      case 'panic': fight.panic = 4; break;
      case 'pow': fight.pow = true; break;
      case 'pill': foe.laughter = 3; break;
      case 'pad': foe.life = Math.max(0, foe.life - 10); break;
      case 'repeater': fight.repeater = true; break;
      case 'pops': fight.pops = 2; break;
    }
  }
  fight.actions.push(result);
  settle(fight, random);
  return result;
}

export function tombUseStock(fight, kind, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.spec.grott && !fight.player.deathOde
    || !tombTargets(fight).some(row => row.index === target)) return null;
  const key = kind === 'firefinger' ? 'bolts' : kind === 'fireball' ? 'fireballs' : null;
  if (!key || !integer(fight.player[key], 1)) return null;
  fight.player[key]--;
  const damage = kind === 'firefinger' ? 10 : 75;
  fight.foes[target].life = Math.max(0, fight.foes[target].life - damage);
  const result = { kind, target, damage, stock: fight.player[key] };
  fight.actions.push(result);
  settle(fight, random);
  return result;
}

export function tombUseRing(fight) {
  if (fight.status !== 'fighting' || !fight.player.vampireRing || fight.bat) return false;
  fight.bat = true;
  fight.paralysis = Math.max(fight.paralysis, 1);
  fight.actions.push({ kind: 'ring' });
  return true;
}

export function tombUseRod(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.player.blackRod || fight.round >= 3
    || fight.rodRound === fight.round
    || !tombTargets(fight).some(row => row.index === target)) return null;
  const roll = dice(random);
  fight.rodRound = fight.round;
  const success = roll >= 9 && TOMB_RULES.rodHumanoidIds.includes(fight.spec.id);
  if (success) fight.foes[target].life = 0;
  const result = { kind: 'rod', target, roll, success };
  fight.actions.push(result);
  settle(fight, random);
  return result;
}

export function tombRecruitVampire(character) {
  if (!alive(character) || !character.goldenGarlic) return false;
  character.companion = clone(TOMB_COMPANION);
  return true;
}

export function settleTombFight(fight) { settle(fight); }

export function tombGrottCast(fight, spell, random = Math.random, target = 'player') {
  if (fight.status !== 'fighting' || !fight.spec.enemyMagic || !fight.spec.grott
    || !['player', 'ally'].includes(target) || target === 'ally' && !(fight.ally?.life > 5)) return null;
  const foe = fight.foes[0], victim = target === 'ally' ? fight.ally : fight.player;
  if (foe.life <= 0) return null;
  foe.spells ??= {};
  foe.bolts ??= 0;
  foe.fireballs ??= 0;
  const result = tombCast(foe, spell, random);
  if (!result) return null;
  if (result.success) {
    switch (spell) {
      case 'panic': foe.armour = Math.max(foe.armour, 4); break;
      case 'pow': foe.pow = true; break;
      case 'pill':
        if (target === 'player') fight.paralysis = Math.max(fight.paralysis, 3);
        else victim.paralysis = Math.max(victim.paralysis ?? 0, 3);
        break;
      case 'pad': victim.life = Math.max(0, victim.life - 10); break;
      case 'repeater': foe.repeater = true; break;
    }
  }
  fight.actions.push({ ...result, kind: 'grottSpell', target });
  settle(fight, random);
  return result;
}

export function tombGrottStock(fight, kind, target = 'player', random = Math.random) {
  if (fight.status !== 'fighting' || !fight.spec.enemyMagic || !fight.spec.grott
    || !['player', 'ally'].includes(target) || target === 'ally' && !(fight.ally?.life > 5)) return null;
  const key = kind === 'firefinger' ? 'bolts' : kind === 'fireball' ? 'fireballs' : null;
  const foe = fight.foes[0], victim = target === 'ally' ? fight.ally : fight.player;
  if (!key || !integer(foe[key], 1)) return null;
  foe[key]--;
  const damage = kind === 'fireball' && victim.fireballImmune ? 0 : kind === 'firefinger' ? 10 : 75;
  victim.life = Math.max(0, victim.life - damage);
  const result = { kind: 'grottStock', spell: kind, target, damage, stock: foe[key] };
  fight.actions.push(result);
  settle(fight, random);
  return result;
}

export function tombFriendlyReaction(random = Math.random) {
  const enemy = die(random), rolls = [die(random), die(random), die(random)];
  const player = rolls.reduce((total, roll) => total + roll, 0);
  return { enemy, rolls, player, success: player < enemy };
}

export function tombTryFriendly(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.round || fight.spec.dream
    || !tombTargets(fight).some(row => row.index === target)) return null;
  const foe = fight.foes[target];
  if (foe.friendlyAttempted) return null;
  foe.friendlyAttempted = true;
  const result = tombFriendlyReaction(random);
  if (result.success) foe.bypassed = true;
  fight.actions.push({ kind: 'friendly', target, ...result });
  settle(fight, random);
  return result;
}

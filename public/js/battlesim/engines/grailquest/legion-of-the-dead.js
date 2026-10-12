import { LEGION_ENCOUNTERS, LEGION_DREAMS, LEGION_COMPANIONS, LEGION_EQUIPMENT } from './legion-of-the-dead-roster.js';

const clone = value => JSON.parse(JSON.stringify(value));
const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const alive = character => Number.isFinite(character.life) && character.life > 0;

export function createLegionCharacter() {
  return { life: 0, maxLife: 0, permanent: 0, experience: 0, gold: 0, deaths: 0,
    weapon: 'ej', hit: 4, bonus: 5, armour: 0, equipment: [], killed: {}, spells: {},
    bolts: 0, fireballs: 0, cubeUses: 0, waterUses: 0, brandyUses: 0,
    amuletUses: 0, wandUses: 0, ringUses: 0, teaUses: 0, teaMode: null,
    flattenedFights: 0, drunkNext: false, blind: false, fingerLost: false,
    creeperFights: 0, drain: 0, coldChecks: 0, coldSections: 0, redSections: 0,
    dreamArmour: 0, currentSection: null, jadeGarlic: false, monkey: false,
    germ: false, deathOde: false, sunstone: false, leek: false, collar: false,
    wandWord: false, poisonImmune: false, companions: {} };
}

export function initialLegionLife(permanent = 0, random = Math.random, reincarnating = false) {
  if (!integer(permanent)) throw new RangeError('Invalid permanent LIFE');
  const rolls = Array.from({ length: reincarnating ? 1 : 3 }, () => dice(random));
  const life = Math.max(...rolls) * 4 + permanent;
  return { life, maxLife: life, permanent, rolls };
}

export function legionEquipment(character, equipment) {
  if (!Array.isArray(equipment) || equipment.length > 6 || new Set(equipment).size !== equipment.length
    || equipment.some(item => !LEGION_EQUIPMENT.includes(item))) return false;
  character.equipment = [...equipment];
  return true;
}

export function legionStrike(roll, hit = 6, bonus = 0, armour = 0, fixed = null) {
  if (!integer(roll, 2) || roll > 12 || !integer(hit, 1) || hit > 14
    || !Number.isFinite(bonus) || !Number.isFinite(armour) || armour < 0
    || fixed !== null && (!Number.isFinite(fixed) || fixed < 0)) throw new RangeError('Invalid strike');
  const landed = roll >= hit;
  return { hit: landed, damage: landed ? Math.max(0, (fixed ?? roll - hit + bonus) - armour) : 0 };
}

function heal(character, amount) {
  const before = character.life;
  if (alive(character)) character.life = Math.min(character.maxLife, character.life + amount);
  return character.life - before;
}

export function legionVisit(character, section, random = Math.random) {
  const number = Number(section);
  if (!integer(number, 1) || number > 237 || number === character.currentSection) return null;
  character.currentSection = number;
  const result = { section: number, drain: 0 };
  if (!alive(character)) return result;
  if (character.drain) {
    result.drain = Math.min(character.life, character.drain);
    character.life -= result.drain;
  }
  for (const ally of Object.values(character.companions)) {
    if (alive(ally) && ally.drain) ally.life = Math.max(0, ally.life-ally.drain);
  }
  if (!alive(character)) return result;
  if (character.coldSections > 0) character.coldSections--;
  if (character.coldChecks > 0) {
    character.coldChecks--;
    result.coldRoll = die(random);
    if (result.coldRoll > 3) character.coldSections = 10;
  }
  if (character.blind) {
    result.sightRoll = dice(random);
    if (result.sightRoll === 12) character.blind = false;
  }
  if (character.redSections > 0) character.redSections--;
  return result;
}

export function legionHeal(character, kind, random = Math.random, inCombat = false) {
  if (!alive(character) || inCombat) return null;
  const stocks = { cube: 'cubeUses', water: 'waterUses', brandy: 'brandyUses', amulet: 'amuletUses', tea: 'teaUses' };
  const stock = stocks[kind];
  if (!stock || !integer(character[stock], 1)) return null;
  character[stock]--;
  const full = ['water', 'brandy'].includes(kind) || kind === 'tea' && character.teaMode === 'full';
  if (kind === 'brandy') character.drunkNext = true;
  return { kind, healing: heal(character, full ? character.maxLife : dice(random)) };
}

export function legionTakeItem(character, item, random = Math.random) {
  if (!alive(character)) return null;
  switch (item) {
    case 'cube': character.cubeUses = 6; break;
    case 'water':
      if (!character.equipment.some(value => ['Waterskin (full)', 'Wineskin (full)', 'Whiskeyskin (full)'].includes(value))) return null;
      character.waterUses = 6;
      break;
    case 'brandy': character.brandyUses = 4; break;
    case 'amulet': character.amuletUses = dice(random) * 2; break;
    case 'wand': character.wandUses = die(random); break;
    case 'ring': character.ringUses = die(random); break;
    case 'flattened': character.flattenedFights = 2; break;
    case 'cold': character.coldChecks = 3; break;
    case 'moonshine': character.blind = true; break;
    case 'finger': character.fingerLost = true; break;
    case 'armour': character.armour = 3; break;
    case 'teaFull': character.teaUses = 1; character.teaMode = 'full'; break;
    case 'teaDice': character.teaUses = 3; character.teaMode = 'dice'; break;
    case 'skeleton': case 'orangutiger': case 'dragon':
      character.companions[item] = clone(LEGION_COMPANIONS[item]);
      break;
    case 'monkey': case 'germ': case 'jadeGarlic': case 'deathOde': case 'sunstone':
    case 'leek': case 'collar': case 'wandWord': character[item] = true; break;
    default: return null;
  }
  return { item };
}

export function legionReincarnate(character, random = Math.random) {
  const fresh = createLegionCharacter();
  Object.assign(fresh, initialLegionLife(character.permanent, random, true));
  fresh.experience = character.experience;
  fresh.killed = { ...character.killed };
  fresh.deaths = character.deaths + 1;
  Object.assign(character, fresh);
  return character;
}

export function legionEquip(character, weapon) {
  if (!['ej','unarmed','leek'].includes(weapon) || weapon === 'leek' && !character.leek) return false;
  character.weapon = weapon;
  character.hit = weapon === 'ej' ? 4 : weapon === 'leek' ? 9 : 6;
  character.bonus = weapon === 'ej' ? 5 : 0;
  return true;
}

export function legionSunstone(character, use, fight = null) {
  if (!alive(character) || !character.sunstone || !['gold','life','destroy'].includes(use)
    || use === 'destroy' && (!fight || fight.player !== character || fight.status !== 'fighting' || fight.spec.contest)) return null;
  character.sunstone = false;
  if (use === 'gold') character.gold += 100000000;
  else if (use === 'life') { character.permanent += 20; character.maxLife += 20; character.life += 20; }
  else { for (const foe of fight.foes) foe.life = 0; settle(fight); }
  return { use };
}

export function legionAmulet(character, use, random = Math.random, fight = null) {
  if (!alive(character) || !integer(character.amuletUses,1)
    || !['heal','damage','gold','roll','friendly','knockout'].includes(use)
    || ['damage','knockout'].includes(use) && (!fight || fight.player !== character || fight.status !== 'fighting')
    || use === 'heal' && fight?.status === 'fighting') return null;
  character.amuletUses--;
  const result = { use };
  if (use === 'heal') result.healing = heal(character,dice(random));
  else if (use === 'gold') character.gold += 1000;
  else if (use === 'damage') fight.damageBonus += 2;
  else if (use === 'knockout') fight.knockout = 10;
  else result.manual = true;
  return result;
}

export function legionWand(character, band, fight = null) {
  if (!alive(character) || !character.wandWord || !integer(character.wandUses,1)
    || !['gold','blue','red','green','silver'].includes(band)
    || ['blue','red','green'].includes(band) && (!fight || fight.player !== character || fight.status !== 'fighting')
    || band === 'gold' && fight?.status === 'fighting') return null;
  character.wandUses--;
  const result = { band };
  if (band === 'gold') {
    result.healing = heal(character,character.maxLife);
    character.drain = 0; character.coldChecks = character.coldSections = 0;
    character.blind = false; character.fingerLost = false; character.creeperFights = 0;
  } else if (band === 'blue') fight.armourBonus = Math.max(3,fight.armourBonus);
  else if (band === 'red') fight.damageBonus += 2;
  else if (band === 'green') {
    if (!fight.spec.noFriendly) fight.status = 'bypassed';
    else result.refused = true;
  } else result.manual = true;
  return result;
}

export function legionBat(fight) {
  if (fight.status !== 'fighting' || !alive(fight.player)) return false;
  if (fight.bat) { fight.bat = false; return true; }
  if (!integer(fight.player.ringUses,1)) return false;
  fight.player.ringUses--; fight.bat = true;
  return true;
}

export function legionSleep(character, random = Math.random) {
  if (!alive(character)) return null;
  const roll = die(random);
  return roll >= 5 ? { roll, healing: heal(character,dice(random)) }
    : { roll, dream: dice(random) };
}

export function legionFriendly(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.round > 0 || fight.spec.noFriendly || fight.spec.contest) return null;
  const enemy = die(random), player = die(random)+die(random)+die(random);
  const success = player < enemy;
  if (success) fight.status = 'bypassed';
  return { enemy, player, success };
}

export function legionCollar(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.round > 0 || !fight.player.collar || fight.collarAttempted) return null;
  fight.collarAttempted = true;
  const roll = dice(random), success = roll >= 10;
  if (success) fight.status = 'bypassed';
  return { roll, success };
}

const SPELLS = new Set(['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeater',
  'invisibility', 'firefinger', 'fireball', 'plop', 'pid', 'pals', 'pil']);

export function legionCast(character, spell, random = Math.random, fight = null, targetIndex = 0) {
  if (!SPELLS.has(spell) || !alive(character) || fight && (fight.player !== character || fight.status !== 'fighting' || fight.stunTurns > 0)) return null;
  const combatOnly = ['panic', 'pow', 'pill', 'pad', 'repeater'].includes(spell);
  if (combatOnly && !fight) return null;
  if (spell === 'pad' && !legionTargets(fight).some(row => row.index === targetIndex)) return null;
  if (spell === 'plop' && (!character.currentSection || character.spells.plopSection === character.currentSection)) return null;
  if (spell === 'invisibility' && !fight?.options.invisibilityAllowed) return null;
  const used = character.spells[spell] ?? 0;
  if (used >= (spell === 'invisibility' ? 1 : 3)
    || ['firefinger', 'fireball'].includes(spell) && character.spells[spell+'Ready']) return null;
  character.spells[spell] = used + 1;
  if (spell === 'plop') character.spells.plopSection = character.currentSection;
  const cost = spell === 'invisibility' ? 15 : 3;
  character.life = Math.max(0, character.life-cost);
  const roll = dice(random), result = { spell, cost, roll, success: roll >= (spell === 'plop' ? 6 : 7) && alive(character) };
  if (result.success) {
    switch (spell) {
      case 'panic': fight.panic = 4; break;
      case 'pow': fight.pow = true; break;
      case 'pill': fight.pill = 3; break;
      case 'repeater': fight.repeater = true; break;
      case 'pad': {
        const target = legionTargets(fight).find(row => row.index === targetIndex);
        if (target) target.foe.life = Math.max(0, target.foe.life-10);
        break;
      }
      case 'pip': character.poisonImmune = true; break;
      case 'pals':
        if (fight?.spec.section === 144) fight.status = 'bypassed';
        else result.manual = true;
        break;
      case 'pil':
        if (fight?.options.indoors) character.life /= 2;
        else result.manual = true;
        break;
      case 'firefinger': character.bolts = 10; character.spells.firefingerReady = true; break;
      case 'fireball': character.fireballs = 2; character.spells.fireballReady = true; break;
      default: result.manual = true; break;
    }
  }
  if (fight) settle(fight);
  return result;
}

export function legionProjectile(fight, kind, index = 0) {
  const target = legionTargets(fight).find(row => row.index === index);
  const stock = kind === 'bolt' ? 'bolts' : kind === 'fireball' ? 'fireballs' : null;
  if (fight.status !== 'fighting' || !alive(fight.player) || fight.stunTurns > 0
    || !target || !stock || !integer(fight.player[stock], 1)) return null;
  fight.player[stock]--;
  const damage = kind === 'bolt' ? 10 : 75;
  target.foe.life = Math.max(0, target.foe.life-damage);
  settle(fight);
  return { kind, index, damage };
}

export function legionDream(character, score, random = Math.random) {
  if (!alive(character) || !integer(score, 2) || score > 12) return null;
  const result = { score };
  switch (score) {
    case 2:
      result.roll = dice(random);
      if (result.roll <= 4) character.life = 0;
      else result.healing = heal(character, 10);
      break;
    case 3: character.gold += 350; break;
    case 4: result.retry = true; break;
    case 5: result.loss = dice(random); character.life = Math.max(0, character.life - result.loss); break;
    case 6: result.healing = heal(character, character.maxLife); break;
    case 7:
      result.roll = die(random);
      if (result.roll < 4) result.encounter = 'dream7';
      break;
    case 8:
      result.roll = die(random);
      if (result.roll >= 4) result.healing = heal(character, dice(random));
      else { result.loss = dice(random); character.life = Math.max(0, character.life - result.loss); }
      break;
    case 9: character.redSections = 5; break;
    case 10:
      result.roll = dice(random);
      if (result.roll < 8) character.life = 0;
      else result.healing = heal(character, character.maxLife);
      break;
    case 11: character.gold += 500; break;
    case 12: result.healing = heal(character, 10); character.dreamArmour = 1; break;
  }
  result.dead = !alive(character);
  return result;
}

export function legionTargets(fight) {
  const threshold = fight.spec.contest === 'half' ? 10
    : fight.spec.contest === 'pseudo' ? 0 : fight.spec.contest === 'wrestle' ? 10
      : fight.options.killEnemies || fight.spec.creeper ? 0 : fight.knockout ?? 5;
  return fight.foes.map((foe, index) => ({ foe, index })).filter(({ foe }) =>
    fight.spec.contest === 'wrestle' ? foe.life >= threshold : foe.life > threshold);
}

export function settleLegionFight(fight) { settle(fight); }

function settle(fight) {
  if (fight.status !== 'fighting') return;
  for (const foe of fight.foes) if (foe.life <= 0 && !fight.spec.contest) fight.player.killed[foe.historyKey] = true;
  if (fight.spec.contest === 'wrestle') {
    if (fight.player.life < 10) fight.status = 'loss';
  } else if (fight.spec.contest === 'pseudo') {
    if (fight.player.life <= 0) fight.status = 'loss';
  } else if (fight.spec.contest === 'half') {
    if (fight.player.life <= fight.playerStop) fight.status = 'loss';
  } else if (fight.player.life <= 5) fight.status = 'loss';
  if (fight.status === 'fighting' && !legionTargets(fight).length) fight.status = 'win';
  if (fight.status === 'fighting') return;
  for (const [key, ally] of Object.entries(fight.allies)) fight.player.companions[key] = clone(ally);
  if (fight.spec.contest === 'pseudo') fight.player.life = fight.realLife;
  if (fight.spec.contest === 'wrestle' && fight.player.life <= 0) fight.player.life = 1;
  if (fight.status === 'win' && !fight.rewarded) {
    if (!fight.spec.dream) {
      fight.player.experience++;
      if (fight.player.experience % 20 === 0) {
        fight.player.permanent++; fight.player.maxLife++; fight.player.life++;
      }
    }
    if (fight.spec.creeper) fight.player.creeperFights = fight.round;
    if (fight.spec.healPerFoe) heal(fight.player, fight.spec.healPerFoe * fight.foes.length);
    fight.rewarded = true;
  }
}

export function startLegionFight(character, id, options = {}, random = Math.random) {
  const original = [...LEGION_ENCOUNTERS, ...LEGION_DREAMS].find(row => row.id === id);
  if (!original) throw new RangeError('Unknown encounter');
  if (!alive(character) || character.life <= 5 || !Number.isFinite(character.maxLife)) throw new RangeError('No conscious character');
  const spec = clone(original), player = clone(character);
  let count = spec.count ?? 1;
  if (typeof count === 'string') {
    const ranges = { shapes: [0, 5], twoDice: [2, 12], vampires: [1, 3], oneDie: [1, 6] };
    const kind = count;
    count = options.enemyCount ?? (kind === 'shapes' ? Math.ceil((dice(random)-2)/2)
      : kind === 'vampires' ? Math.ceil(die(random)/2) : kind === 'oneDie' ? die(random) : dice(random));
    if (!integer(count, ranges[kind][0]) || count > ranges[kind][1]) throw new RangeError('Invalid enemy count');
  }
  const foes = Array.from({ length: count }, (_, index) => {
    const enemy = clone(spec.enemies[0]);
    if (spec.manualLife) {
      if (!integer(options.enemyLife, 1)) throw new RangeError('Source does not specify enemy LIFE');
      enemy.life = options.enemyLife;
    }
    enemy.initialLife = enemy.life;
    enemy.historyKey = spec.id + ':' + index;
    if (player.killed[enemy.historyKey]) enemy.life /= 2;
    enemy.consecutive = {}; enemy.turns = 0;
    return enemy;
  });
  const fight = { spec, options: clone(options), player, foes, realLife: player.life,
    playerStop: player.life/2, round: 0, status: 'fighting', rewarded: false,
    first: spec.playerFirst || player.redSections > 0 ? 'player' : spec.enemyFirst ? 'enemy' : null,
    flattened: player.flattenedFights > 0, weak: player.creeperFights > 0,
    drunk: !!spec.drunk, brandy: player.drunkNext, blindTurns: 0, stunTurns: 0, attacks: 0,
    monkey: false, panic: 0, pill: 0, pow: false, repeater: false, bat: false,
    damageBonus: 0, armourBonus: 0, germPlayer: false, germEnemy: false,
    allies: {}, enemyTargets: {}, germTarget: options.germTargetIndex ?? 0, actions: [], logs: [] };
  if (spec.jadeGarlic && player.jadeGarlic) { fight.status = 'bypassed'; return fight; }
  if (player.flattenedFights > 0) player.flattenedFights--;
  if (player.creeperFights > 0) player.creeperFights--;
  player.drunkNext = false;
  if (options.useMonkey && player.monkey) {
    fight.monkeyRoll = dice(random); fight.monkey = fight.monkeyRoll >= 4;
    if (fight.monkey) fight.first = 'enemy';
  }
  if (options.useGerm && player.germ) {
    fight.germRoll = dice(random);
    fight.germPlayer = fight.germRoll === 2; fight.germEnemy = fight.germRoll > 8;
  }
  for (const [key, ally] of Object.entries(player.companions)) {
    if (ally.life <= 5 || spec.contest || spec.dream) continue;
    if (key === 'skeleton' && !options.useSkeleton) continue;
    if (key === 'orangutiger' && dice(random) < 10) continue;
    if (key === 'dragon') {
      if (ally.remainingFights <= 0) continue;
      ally.remainingFights--;
    }
    fight.allies[key] = clone(ally);
  }
  if (spec.openingLoss) player.life -= spec.openingLoss;
  settle(fight);
  return fight;
}

export function legionInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const player = dice(random), enemy = dice(random);
  fight.first = player === enemy ? null : player > enemy ? 'player' : 'enemy';
  return { player, enemy, first: fight.first };
}

export function legionAssignEnemy(fight, index, target) {
  if (fight.status !== 'fighting' || !legionTargets(fight).some(row => row.index === index)
    || target !== 'player' && (!fight.allies[target] || fight.allies[target].life <= 5)) return false;
  fight.enemyTargets[index] = target;
  return true;
}

function playerStrike(fight, index, random) {
  const foe = fight.foes[index], player = fight.player, roll = dice(random);
  fight.attacks++;
  const unarmed = fight.spec.unarmed || fight.bat || player.weapon === 'unarmed';
  let hit = unarmed ? 6 : player.weapon === 'leek' ? 9 : fight.flattened ? 8 : 4;
  let bonus = unarmed || player.weapon === 'leek' ? 0 : fight.flattened ? -1 : 5;
  bonus += fight.damageBonus - (player.fingerLost ? 1 : 0) - (player.coldSections > 0 ? 2 : 0);
  hit += foe.evade ?? 0;
  const strike = legionStrike(roll, hit, bonus);
  if (strike.hit && fight.weak) strike.damage = Math.max(0, (roll-hit)/2 + bonus);
  const missed = fight.blindTurns > 0 || fight.stunTurns > 0
    || (fight.drunk || player.blind) && fight.attacks % 3 !== 0
    || fight.brandy && fight.attacks % 3 === 0;
  if (fight.blindTurns > 0) fight.blindTurns--;
  if (missed) { strike.hit = false; strike.damage = 0; }
  if (strike.hit) {
    if (fight.spec.playerPin === roll) foe.life = 0;
    else if (fight.bat && roll >= 10) foe.life = 0;
    else {
      if (player.weapon === 'leek' && !unarmed) strike.damage = roll * 3;
      if (fight.pow) { strike.damage += 10; fight.pow = false; }
      if (fight.germPlayer) strike.damage /= 2;
      strike.damage = Math.max(0, strike.damage - foe.armour);
      foe.life = Math.max(0, foe.life - strike.damage);
      if (strike.damage > 0 && player.weapon === 'leek' && !unarmed) foe.stun = 2;
    }
  }
  return { kind: 'player', index, roll, ...strike, missed };
}

function enemyStrike(fight, index, random, surprise = false) {
  const foe = fight.foes[index], key = fight.enemyTargets[index] ?? 'player';
  const targetKey = key !== 'player' && fight.allies[key]?.life > 5 ? key : 'player';
  const target = targetKey === 'player' ? fight.player : fight.allies[targetKey];
  const roll = dice(random);
  foe.turns++;
  if (roll === 12 && fight.player.monkey) { fight.player.monkey = false; fight.monkey = false; }
  let hit = foe.thirdTurnHit && foe.turns % 3 === 0 ? foe.thirdTurnHit : foe.hit;
  hit += targetKey === 'player' ? fight.bat ? 2 : 0 : target.evade ?? 0;
  const strike = legionStrike(roll, hit, foe.bonus, 0, foe.fixedDamage ?? null);
  const missed = foe.stun > 0 || fight.pill > 0 || fight.monkey && foe.turns % 2 === 0;
  if (foe.stun > 0) foe.stun--;
  if (missed) { strike.hit = false; strike.damage = 0; }
  const fatal = strike.hit && foe.fatalFrom && roll >= foe.fatalFrom;
  if (strike.hit) {
    if (foe.tripleDice) strike.damage = roll * 3;
    if (foe.doubleFrom && roll >= foe.doubleFrom && !(targetKey === 'player' && target.poisonImmune)) strike.damage *= 2;
    if (fight.germEnemy && index === fight.germTarget) strike.damage /= 2;
    const armour = targetKey === 'player' ? target.armour + target.dreamArmour + fight.armourBonus + fight.panic : target.armour;
    strike.damage = Math.max(0, strike.damage - armour);
    target.life = fatal ? 0 : Math.max(0, target.life - strike.damage);
    if (foe.blindRoll === roll && targetKey === 'player') fight.blindTurns = foe.blindTurns;
    else if (foe.blindRoll === roll) target.blindTurns = foe.blindTurns;
    if (foe.stunTurns && targetKey === 'player') fight.stunTurns = foe.stunTurns;
    else if (foe.stunTurns) target.stunTurns = foe.stunTurns;
  }
  if (!(surprise && foe.excludeSurprise)) {
    foe.consecutive[targetKey] = strike.hit ? (foe.consecutive[targetKey] ?? 0) + 1 : 0;
    if (foe.consecutiveDrain && foe.consecutive[targetKey] >= foe.consecutiveDrain) target.drain = 2;
    if (foe.consecutiveFatal && foe.consecutive[targetKey] >= foe.consecutiveFatal) target.life = 0;
  }
  return { kind: 'enemy', index, target: targetKey, roll, ...strike, fatal: !!fatal, missed };
}

export function legionRound(fight, targetIndex = 0, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.first || !legionTargets(fight).some(row => row.index === targetIndex)) return null;
  fight.round++;
  const events = [];
  const players = () => {
    const stunned = fight.stunTurns > 0;
    for (let blow = 0; blow < (fight.spec.playerAttacks ?? 1) * (fight.repeater ? 2 : 1); blow++) {
      const target = legionTargets(fight).find(row => row.index === targetIndex) ?? legionTargets(fight)[0];
      if (!target || fight.player.life <= 0) break;
      events.push(playerStrike(fight, target.index, random));
      settle(fight);
      if (fight.status !== 'fighting') break;
    }
    if (stunned && fight.stunTurns > 0) fight.stunTurns--;
    if (fight.status !== 'fighting') return;
    for (const [key, ally] of Object.entries(fight.allies)) {
      const target = legionTargets(fight)[0];
      if (!target || ally.life <= 5) continue;
      const roll = dice(random), strike = legionStrike(roll, ally.hit + (target.foe.evade ?? 0), ally.bonus, target.foe.armour);
      if (ally.blindTurns > 0 || ally.stunTurns > 0) {
        strike.hit = false; strike.damage = 0;
        if (ally.blindTurns > 0) ally.blindTurns--;
        if (ally.stunTurns > 0) ally.stunTurns--;
      }
      target.foe.life = Math.max(0, target.foe.life - strike.damage);
      events.push({ kind: key, index: target.index, roll, ...strike });
      settle(fight);
    }
  };
  const enemies = () => {
    for (const target of legionTargets(fight)) {
      if (fight.status !== 'fighting') break;
      events.push(enemyStrike(fight, target.index, random, fight.round === 1 && fight.spec.enemyFirst));
      settle(fight);
    }
    if (fight.pill > 0) fight.pill--;
  };
  if (fight.first === 'player') { players(); if (fight.status === 'fighting') enemies(); }
  else { enemies(); if (fight.status === 'fighting') players(); }
  fight.logs.push({ round: fight.round, events });
  if (fight.logs.length > 150) fight.logs.splice(0, fight.logs.length-150);
  return { round: fight.round, events, status: fight.status };
}

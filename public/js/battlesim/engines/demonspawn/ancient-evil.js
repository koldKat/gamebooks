import { fireWolfHitThreshold, fireWolfProtection, FIRE_WOLF_WEAPONS } from './fire-wolf.js';
import { rollDemondoomCharacter, awardDemondoomSkill } from './demondoom-character.js';
import { demondoomInitialOrder, demondoomDeathLuck } from './demondoom-rules.js';
import { checkDemondoomInclination, attemptDemondoomSpell, demondoomCastAvailability,
  tradeDemondoomLifeForPower } from './demondoom-magic.js';

export { rollDemondoomCharacter as rollAncientEvilCharacter, tradeDemondoomLifeForPower as tradeAncientEvilLifeForPower };
export const ANCIENT_EVIL_SPELL_COSTS = Object.freeze({ armour: 25, fireball: 15, invisibility: 30,
  paralysis: 30, 'poison-needle': 25, resurrection: 55, retrace: 20, timewarp: 15, xenophobia: 20 });
const die = random => Math.floor(random() * 6) + 1;
const dice = random => die(random) + die(random);
const log = (fight, event) => { fight.log.push(event); if (fight.log.length > 150) fight.log.shift(); return event; };

export function createAncientEvilFight(prepared) {
  const fight = { ...structuredClone(prepared), round: 0, attacks: 0, rest: 0, enemyTurns: 0,
    sequence: 0, turn: prepared.encounter.passiveAttempts ? 'enemy' : null, pending: null,
    outcome: null, luckUsed: false, log: [], openingHits: [], shieldUsed: false };
  fight.opening = { player: structuredClone(fight.player), enemies: structuredClone(fight.enemies) };
  fight.manualGroup = !fight.encounter.sequential && fight.enemies.length > 1;
  return fight;
}

export function ancientEvilEnemyActive(fight, index) {
  return Boolean(fight.enemies[index]?.lifePoints > 0 && !fight.enemies[index].paralysed &&
    (!fight.encounter.sequential || fight.sequence === index));
}

export function finishAncientEvilFight(fight, outcome) {
  if (fight.outcome) return false;
  fight.outcome = outcome;
  if (outcome === 'win') {
    awardDemondoomSkill(fight.player);
    if (fight.encounter.rule === 'freya') delete fight.player.freyaPoison;
    if (fight.player.magicGauntlets && fight.player.gauntletCombats > 0) {
      fight.player.gauntletCombats--;
      if (!fight.player.gauntletCombats) {
        fight.player.strength -= 6; fight.player.speed -= 6; fight.player.maxLife -= 12;
        fight.player.lifePoints = Math.min(fight.player.lifePoints, fight.player.maxLife);
        fight.player.magicGauntlets = false;
      }
    }
  }
  return true;
}

export function checkAncientEvilFight(fight) {
  if (fight.outcome || fight.pending) return;
  if (fight.player.lifePoints <= 0) {
    if (fight.luckUsed) finishAncientEvilFight(fight, 'loss');
    else fight.pending = 'death-luck';
    return;
  }
  if (fight.enemies.every(e => e.lifePoints <= 0)) { finishAncientEvilFight(fight, 'win'); return; }
  if (fight.enemies.every(e => e.lifePoints <= 0 || e.paralysed)) { finishAncientEvilFight(fight, 'avoided'); return; }
  if (fight.encounter.sequential && !ancientEvilEnemyActive(fight, fight.sequence)) {
    while (fight.sequence < fight.enemies.length && !ancientEvilEnemyActive({ ...fight, encounter: {} }, fight.sequence)) fight.sequence++;
    fight.turn = null; fight.attacks = fight.rest = 0;
  }
}

export function determineAncientEvilInitiative(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.turn || fight.manualGroup) return null;
  if (fight.encounter.openingPlayerEach && fight.openingHits.length < fight.enemies.length) fight.turn = 'player';
  else fight.turn = demondoomInitialOrder(fight.player, fight.enemies[fight.sequence], dice(random), dice(random));
  return log(fight, { kind: 'initiative', first: fight.turn });
}

function poisonTick(fight) {
  let damage = 0;
  if (fight.slimePoison) damage += 8;
  if (fight.player.freyaPoison > 0) {
    const tick = Math.min(15, fight.player.freyaPoison);
    fight.player.freyaPoison -= tick; damage += tick;
  }
  fight.player.lifePoints -= damage;
  checkAncientEvilFight(fight);
  return damage;
}

export function endAncientEvilGroupRound(fight) {
  if (!fight.manualGroup || fight.outcome || fight.pending) return false;
  fight.round++;
  if (fight.rest && !--fight.rest) fight.attacks = 0;
  return log(fight, { kind: 'round', poison: poisonTick(fight) });
}

function attackDamage(attacker, defender, roll, threshold, options = {}) {
  if (roll < threshold) return 0;
  const weapon = options.weapon ?? FIRE_WOLF_WEAPONS[attacker.weapon] ?? attacker.weapon;
  if (!Number.isFinite(weapon) || weapon < 0) throw new Error('Supply the unprinted weapon modifier');
  const diceDamage = (roll - threshold) * 10 * (options.halfDice ? .5 : 1);
  return Math.max(0, diceDamage + (options.diceOnly ? 0 : Math.floor(attacker.strength / 8)) + weapon - fireWolfProtection(defender) - (attacker.magicFear ?? 0));
}

export function rollAncientEvilAttack(fight, side, target = 0, random = Math.random) {
  if (fight.outcome || fight.pending || !['player', 'enemy'].includes(side) || !ancientEvilEnemyActive(fight, target)) return null;
  if (!fight.manualGroup && fight.turn !== side) return { error: 'wrong-turn' };
  const rule = fight.encounter.rule, player = fight.player, enemy = fight.enemies[target];
  if (fight.encounter.openingCheck && !fight.serpentChecked) return { error: 'opening-check-required' };
  if (side === 'player' && fight.encounter.passiveAttempts) return { error: 'passive-exposure' };
  if (side === 'enemy' && fight.encounter.openingPlayerEach && fight.openingHits.length < fight.enemies.length) return { error: 'player-opening' };
  if (side === 'player' && fight.encounter.openingPlayerEach && fight.openingHits.length < fight.enemies.length && fight.openingHits.includes(target)) return { error: 'opening-already-used' };
  for (const fighter of [player, enemy]) {
    if (!(Number.isFinite(fighter.weapon) && fighter.weapon >= 0) && !Object.hasOwn(FIRE_WOLF_WEAPONS, fighter.weapon)) return { error: 'manual-weapon-required' };
  }
  if (side === 'player' && (fight.rest || fight.attacks >= Math.floor(player.stamina / 10))) {
    if (!fight.rest) fight.rest = 2;
    if (!fight.manualGroup) fight.turn = 'enemy';
    return log(fight, { kind: 'rest' });
  }
  if (side === 'enemy' && !fight.manualGroup) {
    const poison = poisonTick(fight);
    if (fight.pending || fight.outcome) return log(fight, { kind: 'poison', damage: poison });
  }
  const attacker = side === 'player' ? player : enemy, defender = side === 'player' ? enemy : player;
  const roll = dice(random);
  const threshold = side === 'player' && rule === 'stalker' ? 10 : fireWolfHitThreshold(attacker);
  const hit = roll >= threshold;
  let damage;
  try { damage = attackDamage(attacker, defender, roll, threshold, {
    halfDice: side === 'player' && player.weapon === 'doombringer' && rule === 'fiery-dragon',
    diceOnly: side === 'enemy' && rule === 'serpent',
    weapon: side === 'player' && player.weapon === 'doombringer' && rule === 'demon' ? 20 : undefined,
  }); } catch { return { error: 'manual-weapon-required' }; }
  if (side === 'player') {
    if (fight.encounter.openingPlayerEach && !fight.openingHits.includes(target)) fight.openingHits.push(target);
    fight.attacks++;
    if (rule === 'demon') damage = Math.max(0, damage - 5);
    if (rule === 'sorcerers' && roll === 12) damage = enemy.lifePoints;
    enemy.lifePoints -= damage;
    if (player.weapon === 'doombringer' && rule !== 'demon') player.lifePoints = Math.min(player.maxLife, player.lifePoints + damage * (rule === 'sorcerers' ? .25 : 1));
  } else {
    fight.enemyTurns++;
    if (rule === 'club' && roll === 12) enemy.weapon = 10;
    if (rule === 'lethal' && roll === 12) damage = player.lifePoints;
    if (rule === 'stalker' && roll === 12) damage = 75;
    if (rule === 'sorcerers' && hit) damage = 25;
    if (rule === 'fiery-dragon' && [6, 12].includes(roll) && !player.fireproof) damage += Math.max(0, 25 - (player.magicArmour ?? 0));
    if (rule === 'dragon-fumes' && [5, 6, 9].includes(roll)) damage += Math.floor(player.lifePoints / 10);
    if (player.magicShield && !fight.shieldUsed && hit) { damage = 0; fight.shieldUsed = true; }
    player.lifePoints -= damage;
    if (rule === 'slime-poison' && roll === 12) fight.slimePoison = true;
    if (rule === 'freya' && hit && !(player.freyaPoison > 0)) player.freyaPoison = 100;
    if (!fight.manualGroup && fight.rest && !--fight.rest) fight.attacks = 0;
  }
  const event = { kind: 'attack', side, target, roll, threshold, damage };
  if (rule === 'plank' && hit && defender.lifePoints > 0) {
    const footing = dice(random) + Math.max(0, Math.floor((defender.skill - 50) / 5));
    event.footing = footing;
    if (footing < 10) defender.lifePoints = 0;
  }
  const sequence = fight.sequence;
  checkAncientEvilFight(fight);
  if (!fight.outcome && !fight.pending && fight.encounter.passiveAttempts && fight.enemyTurns >= fight.encounter.passiveAttempts) finishAncientEvilFight(fight, 'reconsider');
  if (!fight.outcome && !fight.pending && sequence === fight.sequence) {
    if (fight.encounter.passiveAttempts) fight.turn = 'enemy';
    else if (fight.encounter.openingPlayerEach && fight.openingHits.length < fight.enemies.length) fight.turn = 'player';
    else fight.turn = side === 'player' ? 'enemy' : 'player';
  }
  return log(fight, event);
}

export function checkAncientEvilSerpent(fight, random = Math.random) {
  if (!fight.encounter.openingCheck || fight.serpentChecked || fight.pending || fight.outcome) return null;
  fight.serpentChecked = true;
  const roll = dice(random) + Math.max(0, Math.floor((fight.player.speed - 50) / 5));
  if (roll < 10) { fight.player.lifePoints = 0; checkAncientEvilFight(fight); }
  return log(fight, { kind: 'serpent', roll, success: roll >= 10 });
}

export function resolveAncientEvilDeathLuck(fight, random = Math.random) {
  if (fight.pending !== 'death-luck' || fight.outcome) return null;
  const roll = dice(random), success = demondoomDeathLuck(fight.player, roll);
  fight.luckUsed = true; fight.pending = null;
  if (success) {
    fight.player.lifePoints = fight.player.maxLife;
    for (let i = fight.sequence; i < fight.enemies.length; i++) { fight.enemies[i].lifePoints = fight.enemies[i].maxLife; delete fight.enemies[i].paralysed; }
    fight.attacks = fight.rest = fight.enemyTurns = 0; fight.slimePoison = false; delete fight.player.freyaPoison;
    fight.openingHits = []; fight.shieldUsed = false; fight.serpentChecked = false;
    fight.turn = fight.encounter.passiveAttempts ? 'enemy' : null;
  } else finishAncientEvilFight(fight, 'loss');
  return log(fight, { kind: 'death-luck', roll, success });
}

export function ancientEvilCastAvailability(player, section, spell) {
  return demondoomCastAvailability(player, section, spell, ANCIENT_EVIL_SPELL_COSTS[spell]);
}

export function castAncientEvilSpell(fight, spell, options = {}, random = Math.random) {
  if (fight.encounter.noMagic) return { error: 'magic-forbidden' };
  if (fight.outcome && !(spell === 'resurrection' && fight.player.lifePoints <= 0)) return { error: 'unavailable' };
  if (fight.pending && spell !== 'resurrection') return { error: 'pending' };
  if (spell === 'resurrection' && fight.player.lifePoints > 0) return { error: 'not-dead' };
  if (spell !== 'resurrection' && !fight.manualGroup && fight.turn !== 'player') return { error: 'wrong-turn' };
  if (spell === 'retrace' && (!options.destination || !options.visited?.map(String).includes(String(options.destination)))) return { error: 'unvisited-destination' };
  const target = options.target ?? fight.sequence;
  if (!ancientEvilEnemyActive(fight, target)) return { error: 'no-target' };
  checkDemondoomInclination(fight.player, fight.encounter.section, random);
  const immune = fight.encounter.attackMagicImmune && ['fireball', 'poison-needle', 'paralysis', 'xenophobia'].includes(spell);
  const result = attemptDemondoomSpell(fight.player, fight.encounter.section, spell, { manualCost: ANCIENT_EVIL_SPELL_COSTS[spell], magicImmune: immune }, random);
  if (result.error) return result;
  const player = fight.player, enemy = fight.enemies[target];
  if (result.success && !immune) {
    if (spell === 'armour') player.magicArmour = 10;
    if (spell === 'fireball') enemy.lifePoints -= 50;
    if (spell === 'invisibility') finishAncientEvilFight(fight, 'avoided');
    if (spell === 'paralysis') enemy.paralysed = true;
    if (spell === 'poison-needle') { result.immunity = die(random); if (result.immunity <= 3) enemy.lifePoints = 0; }
    if (spell === 'xenophobia') enemy.magicFear = 5;
    if (spell === 'retrace') { result.destination = String(options.destination); finishAncientEvilFight(fight, 'reconsider'); }
    if (spell === 'resurrection') {
      const penalty = (player.resurrectionPenalty ?? 0) + 10;
      fight.player = { ...player, ...rollDemondoomCharacter(random, player.skill, penalty), power: player.power, maxPower: player.maxPower };
      fight.outcome = null; fight.pending = null; fight.recorded = false;
    }
    if (spell === 'timewarp') {
      const magicSections = player.magicSections, adventureSpells = player.adventureSpells;
      fight.player = { ...structuredClone(fight.opening.player), magicSections, adventureSpells };
      fight.enemies = structuredClone(fight.opening.enemies);
      fight.sequence = fight.round = fight.attacks = fight.rest = fight.enemyTurns = 0;
      fight.slimePoison = false; fight.openingHits = []; fight.shieldUsed = false; fight.serpentChecked = false;
      fight.pending = null; fight.outcome = null; fight.turn = fight.encounter.passiveAttempts ? 'enemy' : null;
    }
  }
  const sequence = fight.sequence;
  checkAncientEvilFight(fight);
  if (!fight.outcome && !fight.pending && spell !== 'timewarp' && sequence === fight.sequence) fight.turn = 'enemy';
  return log(fight, { kind: 'spell', ...result });
}

export function applyAncientEvilDamage(fight, damage) {
  if (fight.outcome || fight.pending || !Number.isFinite(damage) || damage < 0) return false;
  fight.player.lifePoints -= damage; checkAncientEvilFight(fight);
  return log(fight, { kind: 'manual-damage', damage });
}

export function useAncientEvilRuby(fight) {
  if (fight.outcome !== 'win' || !fight.player.rubyPendant || fight.rubyUsed || fight.player.lifePoints <= 0) return false;
  const restored = (fight.player.maxLife - fight.player.lifePoints) / 2;
  fight.player.lifePoints += restored; fight.rubyUsed = true;
  return restored;
}

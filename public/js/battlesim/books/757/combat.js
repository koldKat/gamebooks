import {ATTACKERS, DUEL_CHOICES, RITUAL_CHOICES, SPELL_COSTS} from './definition.js';

const LIMIT = 1000000;
function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > LIMIT) throw new RangeError('Invalid combat value');
  return value;
}
function character(input) {
  const result = Object.fromEntries(['attack', 'defence', 'mobility', 'skill', 'stamina'].map(key => [key, integer(input[key])]));
  result.defence += integer(input.armour ?? 0) + integer(input.shield ?? 0);
  return result;
}
function complete(fight, outcome, section) {
  fight.outcome = outcome;
  fight.section = section;
  fight.choices = [];
}
function damage(fight, amount) {
  fight.character.stamina -= amount;
  fight.lastDamage = amount;
  if (fight.character.stamina < 0) complete(fight, 'loss', fight.section);
}

export function startFight(kind, input, options = {}) {
  const fight = {kind, ruleVersion: 1, character: character(input), outcome: null, turns: 0, lastDamage: 0};
  if (kind === 'ritual') {
    Object.assign(fight, {section: 55, choices: [...RITUAL_CHOICES[55]], lost: 0, enemyLost: 0,
      enemy: {attack: 4, mobility: 4, skill: 1, strength: 10, stamina: 120}, lizard: options.lizard === true});
    fight.character.defence = 0;
  } else if (kind === 'attackers') {
    fight.character.defence = integer(input.armour ?? 0) + integer(input.shield ?? 0);
    if (!Array.isArray(options.enemies) || options.enemies.length !== 3) throw new RangeError('Enter all three original enemy values');
    fight.enemies = ATTACKERS.map((stats, index) => ({...stats,
      defence: integer(options.enemies[index].defence), stamina: integer(options.enemies[index].stamina)}));
    Object.assign(fight, {section: 235, enemyIndex: 0, choices: []});
  } else if (kind === 'duel') {
    Object.assign(fight, {section: 263, choices: [...DUEL_CHOICES[263]], wormAloft: options.wormAloft === true});
  } else throw new RangeError('Unknown encounter');
  return fight;
}

export function advanceRitual(previous, target, rolls = {}) {
  if (previous.kind !== 'ritual' || previous.outcome || !previous.choices.includes(target)) throw new RangeError('Unavailable ritual action');
  const fight = structuredClone(previous);
  fight.turns++;
  fight.lastDamage = 0;
  fight.section = target;
  if (target === 45 || target === 48) {
    const player = integer(rolls.player) + fight.character.mobility + (target === 45 ? fight.character.attack : 0);
    const enemy = integer(rolls.enemy) + fight.enemy.mobility + fight.enemy.attack;
    fight.lastComparison = {player, enemy};
    fight.section = enemy > player ? (target === 45 ? 88 : 42) : (target === 45 ? 52 : 63);
    if (fight.section === 88 || fight.section === 42) {
      const amount = fight.section === 88 ? 10 : 5;
      damage(fight, amount);
      fight.lost += amount;
      if (fight.outcome) return fight;
      if (fight.lost >= 15) complete(fight, 'loss', 97);
      else if (fight.section === 88) fight.section = 47;
    }
  } else if (target === 20 || target === 83) {
    fight.enemy.stamina -= 5;
    fight.enemyLost += 5;
    if (fight.enemyLost >= 15) complete(fight, 'win', 34);
    else if (target === 83) complete(fight, fight.lizard ? 'win' : 'loss', fight.lizard ? 21 : 58);
  } else if (target === 34) complete(fight, 'win', 34);
  else if (target === 78) {
    damage(fight, 5);
    fight.lost += 5;
    // Section 78 explicitly sends simultaneous knockdowns to the draw at 61.
    if (!fight.outcome) complete(fight, 'draw', 61);
  }
  if (!fight.outcome) fight.choices = [...RITUAL_CHOICES[fight.section]];
  return fight;
}

export function advanceAttackers(previous, rolls) {
  if (previous.kind !== 'attackers' || previous.outcome) throw new RangeError('No active attacker fight');
  const fight = structuredClone(previous), hero = fight.character, foe = fight.enemies[fight.enemyIndex];
  if (!foe || foe.stamina < 0) throw new RangeError('Invalid active attacker');
  const attack = integer(rolls.enemyAttack) + foe.attack + foe.mobility - foe.skill;
  const defence = integer(rolls.playerDefence) + hero.mobility + hero.defence - hero.skill;
  fight.lastComparison = {attack, defence};
  fight.lastDamage = 0;
  fight.turns++;
  if (attack > defence) damage(fight, attack - defence);
  else {
    const counter = integer(rolls.playerAttack) + hero.attack + hero.mobility - hero.skill;
    const guard = integer(rolls.enemyDefence) + foe.mobility + foe.defence - foe.skill;
    fight.lastComparison.counter = counter;
    fight.lastComparison.guard = guard;
    if (counter > guard) foe.stamina -= counter - guard;
  }
  if (fight.outcome) return fight;
  if (fight.enemies.every(enemy => enemy.stamina < 0)) complete(fight, 'win', 245);
  else {
    for (let step = 1; step <= 3; step++) {
      const index = (fight.enemyIndex + step) % 3;
      if (fight.enemies[index].stamina >= 0) {fight.enemyIndex = index; break;}
    }
  }
  return fight;
}

export function advanceDuel(previous, target) {
  if (previous.kind !== 'duel' || previous.outcome || !previous.choices.includes(target)) throw new RangeError('Unavailable spell');
  const fight = structuredClone(previous);
  fight.section = target;
  fight.turns++;
  fight.lastDamage = 0;
  const cost = {254: 4, 252: 5, 253: 3}[target] ?? 0;
  if (cost) damage(fight, cost);
  if (fight.outcome) return fight;
  if (target === 261) complete(fight, 'loss', 261);
  else if (target === 258 || target === 262) complete(fight, 'win', target);
  else if (target === 260) fight.choices = [fight.wormAloft ? 247 : 234];
  else if (target === 246) fight.choices = [fight.wormAloft ? 250 : 262];
  else fight.choices = [...DUEL_CHOICES[target]];
  return fight;
}

export function spendSpell(stamina, spell, staff) {
  integer(stamina);
  const costs = Object.hasOwn(SPELL_COSTS, spell) ? SPELL_COSTS[spell] : null;
  if (!costs || typeof staff !== 'boolean') throw new RangeError('Unknown spell or staff state');
  return {stamina: stamina - costs[staff ? 1 : 0], cost: costs[staff ? 1 : 0]};
}

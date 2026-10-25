import { PRESETS, RACES, RULES_REVISION, GALANSIA_RULES } from './definition.js';

const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const flag = value => {
  if (typeof value !== 'boolean') throw new RangeError('Invalid combat option');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
const die = (value, random) => integer(value === undefined ? random() : value, 1, 6);

export function newCharacter(id = 'hilga') {
  const preset = PRESETS.find(row => row.id === id);
  if (!preset) throw new RangeError('Unknown character');
  return {...structuredClone(preset), shield: false, godSword: false, optionalRaces: false};
}
export function validateCharacter(character) {
  if (!character || !RACES.includes(character.race)) throw new RangeError('Invalid character');
  for (const key of ['strength', 'agility', 'life', 'damage']) integer(character[key]);
  integer(character.maxLife, 1); integer(character.bags, 1, 2);
  for (const key of ['boulder', 'shield', 'godSword', 'optionalRaces']) flag(character[key]);
  return structuredClone(character);
}
export function creationCost(character) {
  const player = validateCharacter(character);
  return player.strength + player.agility + player.maxLife + player.damage + Number(player.boulder) + player.bags - 1;
}
export function heal(character, amount) {
  const next = validateCharacter(character);
  if (!next.life) throw new RangeError('Dead character');
  integer(amount);
  next.life = Math.max(next.life, Math.min(next.maxLife, next.life + amount));
  return next;
}
export function checkAttribute(character, key, value, modifier = 0) {
  const player = validateCharacter(character);
  if (!player.life || !['strength', 'agility'].includes(key)) throw new RangeError('Invalid check');
  integer(value, 1, 6); integer(modifier, -1000000);
  const bonus = Number(player.optionalRaces && player.race === 'giant' && key === 'strength');
  const total = value + modifier - bonus;
  return {die: value, modifier, bonus, total, target: player[key], success: total < player[key]};
}
export function takeDamage(character, amount, {fire = false, shieldDie} = {}, random = rollDie) {
  const next = validateCharacter(character);
  if (!next.life) throw new RangeError('Dead character');
  integer(amount); flag(fire);
  const resistance = Number(fire && next.optionalRaces && next.race === 'ogre' && amount > 0);
  let damage = Math.max(0, amount - resistance), shield = null;
  if (damage && next.shield) {
    shield = die(shieldDie, random);
    if (shield === 1) damage = 0;
  }
  next.life = Math.max(0, next.life - damage);
  return {character: next, damage, resistance, shield};
}
export function startFight(character, opponents, {encounter = null, traits = {}} = {}) {
  const player = validateCharacter(character);
  if (!player.life || !player.strength || !player.damage || !Array.isArray(opponents)
      || opponents.length < 1 || opponents.length > 100) throw new RangeError('Invalid fight');
  const flags = Object.fromEntries(['drain', 'firstHit', 'fire', 'gnome', 'demon'].map(key => [key, flag(traits[key] ?? encounter?.[key] ?? false)]));
  const enemies = opponents.map(opponent => {
    if (!opponent.displayName?.trim()) throw new RangeError('Missing opponent name');
    return {name: opponent.displayName.trim().slice(0, 200), strength: integer(opponent.strength),
      damage: integer(opponent.damage), hp: integer(opponent.hp, 1), rounds: 0, resolved: false};
  });
  return {rulesRevision: RULES_REVISION, character: player, enemies, traits: flags,
    encounter: encounter ? structuredClone(encounter) : null, name: enemies.map(row => row.name).join(' / '),
    rounds: 0, boulderSpent: false, outcome: null, events: [{kind: 'start', name: enemies.map(row => row.name).join(' / ')}]};
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Inactive fight');
  const next = structuredClone(fight);
  next.character = validateCharacter(next.character);
  if (!next.character.life || !Array.isArray(next.enemies) || !next.enemies.length
      || !next.enemies.some(row => !row.resolved && row.hp > 0)) throw new RangeError('Invalid fight state');
  integer(next.rounds); flag(next.boulderSpent);
  for (const key of ['drain', 'firstHit', 'fire', 'gnome', 'demon']) flag(next.traits[key]);
  for (const enemy of next.enemies) {
    integer(enemy.hp); integer(enemy.strength); integer(enemy.damage); integer(enemy.rounds); flag(enemy.resolved);
  }
  next.events = [];
  return next;
}
function targetEnemy(fight, target) {
  integer(target, 0, fight.enemies.length - 1);
  const enemy = fight.enemies[target];
  if (enemy.resolved || !enemy.hp) throw new RangeError('Opponent already resolved');
  return enemy;
}
function finish(fight, outcome) {
  fight.outcome = outcome;
  if (outcome === 'win' && fight.boulderSpent) fight.character.boulder = true;
  fight.destination = outcome === 'win' ? fight.encounter?.win ?? null
    : outcome === 'fled' ? fight.encounter?.flee ?? null : GALANSIA_RULES.deathDestination;
  fight.events.push({kind: outcome, destination: fight.destination ?? ''});
  return fight;
}
function resolveEnemy(fight, enemy) {
  if (enemy.hp > 0 && !fight.traits.firstHit) return;
  enemy.resolved = true;
  if (fight.character.optionalRaces && fight.character.race === 'troll' && fight.traits.gnome) {
    const before = fight.character.life;
    fight.character = heal(fight.character, 1);
    if (fight.character.life !== before) fight.events.push({kind: 'meal', life: fight.character.life});
  }
}
export function playRound(fight, {target = 0, playerDie, enemyDie, shieldDie} = {}, random = rollDie) {
  const next = fresh(fight), enemy = targetEnemy(next, target), player = next.character;
  const one = die(playerDie, random), two = die(enemyDie, random);
  const sword = Number(player.godSword && next.traits.demon);
  const cry = Number(player.optionalRaces && player.race === 'ape' && !enemy.rounds);
  const attack = one + player.strength + sword, defence = two + enemy.strength - cry;
  let dealt = 0, damage = 0, drained = 0, shield = null, resistance = 0;
  if (attack > defence) {
    dealt = player.optionalRaces && player.race === 'minotaur' && !enemy.rounds ? 3 : player.damage;
    enemy.hp = Math.max(0, enemy.hp - dealt);
  } else if (attack < defence) {
    const hit = takeDamage(player, enemy.damage, {fire: next.traits.fire, shieldDie}, random);
    next.character = hit.character;
    ({damage, shield, resistance} = hit);
    if (damage && next.traits.drain) { drained = damage; enemy.hp += damage; }
  }
  next.rounds++; enemy.rounds++;
  next.events.push({kind: 'round', turn: next.rounds, one, two, sword, cry, attack, defence,
    name: enemy.name, dealt, damage, drained, shield: shield ?? '', resistance, life: next.character.life, hp: enemy.hp});
  if (!next.character.life) return finish(next, 'loss');
  if (dealt) resolveEnemy(next, enemy);
  return next.enemies.every(row => row.resolved || !row.hp) ? finish(next, 'win') : next;
}
export function throwBoulder(fight, {target = 0, value} = {}, random = rollDie) {
  const next = fresh(fight), enemy = targetEnemy(next, target);
  if (next.rounds || next.boulderSpent || !next.character.boulder) throw new RangeError('Boulder unavailable');
  const roll = die(value, random);
  const bonus = Number(next.character.optionalRaces && next.character.race === 'cyclops');
  const hit = roll - bonus < next.character.agility;
  next.character.boulder = false; next.boulderSpent = true;
  if (hit) enemy.hp = Math.max(0, enemy.hp - 1);
  next.events.push({kind: 'boulder', die: roll, bonus, target: next.character.agility, hit,
    name: enemy.name, hp: enemy.hp});
  if (hit) resolveEnemy(next, enemy);
  return next.enemies.every(row => row.resolved || !row.hp) ? finish(next, 'win') : next;
}
export function flee(fight) { return finish(fresh(fight), 'fled'); }

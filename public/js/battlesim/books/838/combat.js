import { MODES, RULES_REVISION } from './definition.js';

const integer = (value, min, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
const die = random => integer(random(), 1, 6);
export function newCharacter(random = rollDie) {
  return {life: die(random) + die(random) + 20, agility: die(random) + 3, gold: 10};
}
export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  integer(character.life, 0); integer(character.agility, 0); integer(character.gold, 0);
  return structuredClone(character);
}
export function startFight(character, opponents, {mode = 'duel', hitAt = 7, encounter = null} = {}) {
  const player = validateCharacter(character);
  if (!player.life || !player.agility || !MODES.includes(mode) || !Array.isArray(opponents)
      || !opponents.length || opponents.length > 100 || mode === 'pirates' && opponents.length !== 2
      || mode === 'dogs' && opponents.length < 3) throw new RangeError('Invalid fight');
  integer(hitAt, 2, 12);
  const enemies = opponents.map(opponent => {
    if (!opponent.displayName?.trim()) throw new RangeError('Missing opponent name');
    return {name: opponent.displayName.trim().slice(0, 200), hp: integer(opponent.hp, 1)};
  });
  return {rulesRevision: RULES_REVISION, character: player, enemies, mode, hitAt,
    encounter: encounter ? structuredClone(encounter) : {}, name: enemies.map(enemy => enemy.name).join(' / '),
    singlePirate: false, kills: 0, rounds: 0, outcome: null, events: [{kind: 'start', name: enemies.map(enemy => enemy.name).join(' / ')}]};
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Inactive fight');
  const next = structuredClone(fight);
  next.character = validateCharacter(next.character);
  if (!next.character.life || !next.character.agility || !MODES.includes(next.mode)
      || !Array.isArray(next.enemies) || !next.enemies.some(enemy => enemy.hp > 0)) throw new RangeError('Invalid fight state');
  for (const enemy of next.enemies) integer(enemy.hp, 0);
  integer(next.rounds, 0); integer(next.kills, 0); integer(next.hitAt, 2, 12);
  next.events = [];
  return next;
}
function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.destination = outcome === 'win' ? fight.encounter.destination ?? null : null;
  fight.events.push({kind: outcome, destination: fight.destination ?? ''});
  return fight;
}
export function playRound(fight, {target = 0, dice, damageDie} = {}, random = rollDie) {
  const next = fresh(fight);
  integer(target, 0, next.enemies.length - 1);
  if (!next.enemies[target].hp) throw new RangeError('Target already defeated');
  const rolls = dice === undefined ? [die(random), die(random)] : dice;
  if (!Array.isArray(rolls) || rolls.length !== 2) throw new RangeError('Two dice required');
  for (const value of rolls) integer(value, 1, 6);
  const sum = rolls[0] + rolls[1];
  const threshold = next.mode === 'pirates' ? next.singlePirate ? 6 : 8 : next.mode === 'dogs' ? 7 : next.hitAt;
  let damage = 0, dealt = 0, extra = '';
  if (sum >= threshold) {
    dealt = 3;
    next.enemies[target].hp = Math.max(0, next.enemies[target].hp - dealt);
    if (!next.enemies[target].hp) next.kills++;
  } else {
    damage = 3;
    if (next.mode === 'octopus') {
      extra = damageDie === undefined ? die(random) : integer(damageDie, 1, 6);
      damage = extra * 3;
    } else if (next.mode === 'pirates' && !next.singlePirate && sum <= 3) damage = 6;
    else if (next.mode === 'dogs') damage = sum === 2 ? 9 : sum === 3 ? 6 : 3;
    next.character.life = Math.max(0, next.character.life - damage);
  }
  next.rounds++;
  next.events.push({kind: 'round', turn: next.rounds, dice: rolls.join(' + '), sum, extra,
    target: next.enemies[target].name, dealt, damage, life: next.character.life, hp: next.enemies[target].hp});
  if (!next.character.life) return finish(next, 'loss');
  if (next.mode === 'dogs' && next.kills >= 3 || next.enemies.every(enemy => !enemy.hp)) return finish(next, 'win');
  if (next.mode === 'pirates' && !next.singlePirate && next.kills === 1) {
    next.singlePirate = true;
    next.events.push({kind: 'survivor', hp: next.enemies.find(enemy => enemy.hp > 0).hp});
  }
  return next;
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }
export function checkAgility(character, dice) {
  const player = validateCharacter(character);
  if (!Array.isArray(dice) || dice.length !== 2) throw new RangeError('Two dice required');
  for (const value of dice) integer(value, 1, 6);
  const sum = dice[0] + dice[1];
  return {sum, success: player.life > 0 && player.agility > 0 && sum <= player.agility};
}
export function checkWhirlpool(value, magicSail) {
  integer(value, 1, 6);
  if (typeof magicSail !== 'boolean') throw new RangeError('Invalid sail');
  const total = value + Number(magicSail);
  return {total, destination: total >= 3 ? '62' : '47'};
}

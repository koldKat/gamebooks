import { DEFAULT_CHARACTER, RULES_REVISION } from './definition.js';

const clone = value => structuredClone(value);
function integer(value, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('Invalid value');
  return value;
}
export const rollDie = () => 1 + Math.floor(Math.random() * 6);
const die = (value, random) => integer(value ?? random(), 1, 6);
export const newCharacter = () => clone(DEFAULT_CHARACTER);
export function validateCharacter(character) {
  if (!character || typeof character !== 'object') throw new RangeError('Missing character');
  const next = clone(character);
  for (const key of ['combat', 'movement']) integer(next[key], -1000000);
  for (const key of ['life', 'damage', 'armour', 'gold']) integer(next[key]);
  return next;
}
function enemy(row) {
  if (!row?.displayName?.trim()) throw new RangeError('Missing opponent name');
  const next = {name: row.displayName.trim().slice(0, 200)};
  for (const key of ['combat', 'movement']) next[key] = integer(row[key], -1000000);
  for (const key of ['damage', 'armour']) next[key] = integer(row[key]);
  next.hp = integer(row.hp, 1);
  return next;
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Inactive fight');
  const next = clone(fight);
  next.character = validateCharacter(next.character);
  next.events = [];
  return next;
}
export function startFight(character, opponents, {encounter = null, playerDie, enemyDie} = {}, random = rollDie) {
  const player = validateCharacter(character);
  if (!player.life || !Array.isArray(opponents) || !opponents.length || opponents.length > 100) throw new RangeError('Invalid fight');
  const enemies = opponents.map(enemy);
  const next = {rulesRevision: RULES_REVISION, character: player, enemies, target: 0, actor: null,
    encounter: encounter ? clone(encounter) : null, name: enemies.map(row => row.name).join(' / '),
    attacks: 0, pendingTie: false, outcome: null, events: []};
  return initiative(next, {playerDie, enemyDie}, random);
}
function initiative(fight, {playerDie, enemyDie}, random) {
  const one = die(playerDie, random), two = die(enemyDie, random);
  const player = one + fight.character.movement, opponent = two + fight.enemies[fight.target].movement;
  fight.initiative = {one, two, player, opponent};
  fight.actor = player === opponent ? null : player > opponent ? 'player' : 'enemy';
  fight.events.push({kind: 'initiative', one, two, player, opponent, name: fight.enemies[fight.target].name});
  return fight;
}
export function chooseInitiative(fight, actor) {
  const next = fresh(fight);
  if (next.actor !== null || !['player', 'enemy'].includes(actor)) throw new RangeError('No initiative choice');
  next.actor = actor;
  next.events.push({kind: 'initiativeChoice', actor});
  return next;
}
function finishAttack(fight, {dealt, received}, random) {
  const opponent = fight.enemies[fight.target];
  opponent.hp = Math.max(0, opponent.hp - dealt);
  fight.character.life = Math.max(0, fight.character.life - received);
  fight.attacks++;
  fight.events.push({kind: 'damage', dealt, received, hp: opponent.hp, life: fight.character.life, name: opponent.name});
  fight.pendingTie = false;
  if (!fight.character.life) fight.outcome = 'loss';
  else if (!opponent.hp) {
    if (fight.target === fight.enemies.length - 1) fight.outcome = 'win';
    else {
      fight.target++;
      fight.actor = null;
      return initiative(fight, {}, random);
    }
  } else fight.actor = fight.actor === 'player' ? 'enemy' : 'player';
  if (fight.outcome) {
    fight.destination = fight.outcome === 'win' ? fight.encounter?.win ?? null : null;
    fight.events.push({kind: fight.outcome, destination: fight.destination ?? ''});
  }
  return fight;
}
export function playAttack(fight, {playerDie, enemyDie} = {}, random = rollDie) {
  const next = fresh(fight);
  if (!next.actor || next.pendingTie) throw new RangeError('Manual resolution required');
  const one = die(playerDie, random), two = die(enemyDie, random);
  const player = one + next.character.combat, opponent = two + next.enemies[next.target].combat;
  next.events.push({kind: 'attack', actor: next.actor, one, two, player, opponent});
  if (player === opponent) {
    next.pendingTie = true;
    next.events.push({kind: 'tie'});
    return next;
  }
  const playerWins = player > opponent;
  const attackerWins = (next.actor === 'player') === playerWins;
  const winner = playerWins ? next.character : next.enemies[next.target];
  const loser = playerWins ? next.enemies[next.target] : next.character;
  // The example uses the full attack total, but only the difference for a counterattack.
  const base = attackerWins ? (playerWins ? player : opponent) : Math.abs(player - opponent);
  const damage = Math.max(0, base + winner.damage - loser.armour);
  return finishAttack(next, {dealt: playerWins ? damage : 0, received: playerWins ? 0 : damage}, random);
}
export function resolveTie(fight, {dealt = 0, received = 0} = {}, random = rollDie) {
  const next = fresh(fight);
  if (!next.pendingTie) throw new RangeError('No tied attack');
  integer(dealt); integer(received);
  next.events.push({kind: 'manualTie', dealt, received});
  return finishAttack(next, {dealt, received}, random);
}
export function abandon(fight) {
  const next = fresh(fight);
  next.outcome = 'abandoned';
  next.events.push({kind: 'abandoned'});
  return next;
}

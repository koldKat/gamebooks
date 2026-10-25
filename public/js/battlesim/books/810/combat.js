import { ENCOUNTERS, RULES_REVISION, ESCAPE_RULES } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const newCharacter = () => ({attack: 1, life: 10, maximum: 10, armour: false, axe: false, amulet: false, meat: false});
export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  integer(character.attack, 0, 1000); integer(character.life, 0, 10000);
  integer(character.maximum, Math.max(1, character.life), 10000);
  return structuredClone(character);
}
export const effectiveAttack = character => character.attack + Number(Boolean(character.axe)) + Number(Boolean(character.amulet));
function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.destination = ['win', 'escape'].includes(outcome) ? fight.encounter.destination : null;
  fight.events.push({kind: outcome, destination: fight.destination});
  return fight;
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight); next.events = []; return next;
}
export function startFight(character, opponent, section) {
  const encounter = ENCOUNTERS.find(row => row.section === Number(section));
  const player = validateCharacter(character);
  if (!encounter || player.life <= 0 || !opponent?.displayName?.trim()) throw new RangeError('Invalid fight');
  const enemy = {...opponent, attack: integer(opponent.attack, 0, 1000), life: integer(opponent.life, 1, 10000)};
  return {rulesRevision: RULES_REVISION, encounter, character: player, enemy, name: enemy.displayName,
    rounds: 0, escapeAttempted: false, outcome: null, events: [{kind: 'start', section: encounter.section}]};
}
export function round(fight, playerDie = rollDie(), enemyDie = rollDie()) {
  const next = fresh(fight);
  integer(playerDie, 1, 6); integer(enemyDie, 1, 6);
  const playerTotal = effectiveAttack(next.character) + playerDie, enemyTotal = next.enemy.attack + enemyDie;
  const enemyLoss = Math.max(0, playerTotal - enemyTotal);
  const playerLoss = Math.min(next.character.armour ? 2 : Infinity, Math.max(0, enemyTotal - playerTotal));
  next.character.life = Math.max(0, next.character.life - playerLoss);
  next.enemy.life = Math.max(0, next.enemy.life - enemyLoss);
  next.rounds++;
  next.events.push({kind: 'round', playerDie, enemyDie, playerTotal, enemyTotal, enemyLoss, playerLoss});
  if (next.character.life <= 0) return finish(next, 'loss');
  if (next.enemy.life <= 0) return finish(next, 'win');
  return next;
}
export function escapeFight(fight, die = rollDie()) {
  const next = fresh(fight);
  integer(die, 1, 6);
  if (!next.encounter.escape || next.rounds || next.escapeAttempted) throw new RangeError('Escape unavailable');
  next.escapeAttempted = true;
  next.events.push({kind: 'escapeAttempt', die});
  if (die >= ESCAPE_RULES.minimum) return finish(next, 'escape');
  next.character.life = Math.max(0, next.character.life - ESCAPE_RULES.failureDamage);
  next.events.push({kind: 'escapeFailed', life: next.character.life});
  if (next.character.life <= 0) return finish(next, 'loss');
  return next;
}
export function eatMeat(character) {
  const next = validateCharacter(character);
  if (!next.meat || next.life <= 0 || next.life >= next.maximum) throw new RangeError('Meat unavailable');
  next.life = Math.min(next.maximum, next.life + 6);
  next.meat = false;
  return next;
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }

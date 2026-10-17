import { combatLosses } from '../../engines/lone-wolf/combat-table.js';
import { ENCOUNTERS, RULES_REVISION } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid character value');
  return value;
};
export const randomNumber = () => Math.floor(Math.random() * 10);
export function newCharacter(pick = randomNumber) {
  const skill = integer(pick(), 0, 9) + 10, stamina = integer(pick(), 0, 9) + 20;
  return {skill, stamina, maxStamina: stamina, potions: 0, modifier: 0,
    unarmed: false, vigour: false, restoration: false};
}
export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  const next = structuredClone(character);
  integer(next.skill, 0, 1000); integer(next.stamina, 0, 10000);
  if (!next.maxStamina) next.maxStamina = next.stamina;
  integer(next.maxStamina, next.stamina, 10000); integer(next.potions, 0, 1);
  integer(next.modifier, -1000, 1000);
  return next;
}
function finish(fight, outcome, destination) {
  fight.outcome = outcome;
  fight.destination = destination ?? (outcome === 'win' ? fight.encounter.destination : null);
  fight.events.push({kind: outcome, destination: fight.destination});
  return fight;
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight); next.events = []; return next;
}
export function startFight(character, opponent, section) {
  const encounter = ENCOUNTERS.find(row => row.section === Number(section));
  if (!encounter || !opponent?.displayName?.trim()) throw new RangeError('Missing encounter');
  const player = validateCharacter(character);
  if (player.stamina <= 0) throw new RangeError('Character dead');
  const enemy = {...opponent, skill: integer(opponent.skill, 0, 1000), stamina: integer(opponent.stamina, 1, 10000)};
  const events = [{kind: 'start', section: encounter.section}];
  if (player.vigour) {
    if (player.stamina < 10) throw new RangeError('Vigour requires ten endurance');
    player.stamina -= 3;
    events.push({kind: 'vigour', stamina: player.stamina});
  }
  return {rulesRevision: RULES_REVISION, encounter, character: player, enemy, name: enemy.displayName,
    enemyMaximum: enemy.stamina, ratio: player.skill + player.modifier + (player.vigour ? 3 : 0)
      - (encounter.unarmed || player.unarmed ? 4 : 0) - enemy.skill,
    rounds: 0, outcome: null, events};
}
export function round(fight, pick = randomNumber()) {
  const next = fresh(fight);
  const [enemyLoss, playerLoss] = combatLosses(next.ratio, pick);
  next.rounds++;
  next.enemy.stamina = enemyLoss === 'K' ? 0 : Math.max(0, next.enemy.stamina - enemyLoss);
  next.character.stamina = playerLoss === 'K' ? 0 : Math.max(0, next.character.stamina - playerLoss);
  next.events.push({kind: 'round', pick, enemyLoss, playerLoss, rounds: next.rounds});
  if (next.character.stamina <= 0) return finish(next, 'loss');
  if (next.enemy.stamina <= 0) return finish(next, 'win');
  return next;
}
export function escapeFight(fight) {
  const next = fresh(fight);
  if (next.encounter.escapeAfter === null || next.rounds < next.encounter.escapeAfter) throw new RangeError('Escape unavailable');
  return finish(next, 'escape', next.encounter.escapeDestination);
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }
export function restore(character, kind, water = false) {
  const next = validateCharacter(character);
  if (next.stamina <= 0 || next.stamina >= next.maxStamina) throw new RangeError('Healing unavailable');
  if (kind === 'potion') {
    if (!next.potions) throw new RangeError('No potion');
    next.potions--;
    next.stamina = Math.min(next.maxStamina, next.stamina + 2);
  } else if (kind === 'restoration' && next.restoration && water) {
    next.stamina = Math.min(next.maxStamina, next.stamina + 5);
  } else throw new RangeError('Healing unavailable');
  return next;
}

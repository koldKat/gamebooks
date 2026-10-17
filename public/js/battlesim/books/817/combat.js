import { RULES_REVISION, encounterPreset } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const newCharacter = () => ({life: 10, blaster: false, shots: 0, grenades: 0, bazookas: 0, medkits: 0});
export function validateCharacter(character) {
  if (!character || typeof character.blaster !== 'boolean') throw new RangeError('Invalid character');
  integer(character.life, 0, 10); integer(character.shots, 0, 10);
  integer(character.grenades, 0, 4); integer(character.bazookas, 0, 2); integer(character.medkits, 0, 1);
  if (!character.blaster && character.shots) throw new RangeError('Ammunition without blaster');
  return structuredClone(character);
}
export function useMedkit(character) {
  const next = validateCharacter(character);
  if (next.life <= 0 || next.life >= 10 || !next.medkits) throw new RangeError('Cannot heal');
  next.medkits--; next.life = 10;
  return next;
}
export function startFight(character, opponent, section, difficulty = 'easy') {
  const player = validateCharacter(character), encounter = encounterPreset(section, difficulty);
  if (!player.life || !opponent?.displayName?.trim()) throw new RangeError('Invalid fight');
  const count = integer(opponent.count, 1, 1000);
  if (encounter.meleeOnly && count !== 1) throw new RangeError('Forced single opponent');
  return {rulesRevision: RULES_REVISION, character: player, encounter, name: opponent.displayName.trim(),
    remaining: count, initialCount: count, turns: 0, usedExplosives: false, usedBlaster: false,
    outcome: null, events: [{kind: 'start', count, section: encounter.section}]};
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight);
  validateCharacter(next.character); integer(next.remaining, 1, 1000);
  next.events = [];
  return next;
}
function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.destination = outcome === 'win' ? fight.encounter.destination : null;
  fight.events.push({kind: outcome, destination: fight.destination});
  return fight;
}
export function attack(fight, weapon, die = rollDie()) {
  const next = fresh(fight), player = next.character;
  if (!['blaster', 'melee', 'grenade', 'bazooka'].includes(weapon)
      || next.encounter.meleeOnly && weapon !== 'melee') throw new RangeError('Invalid weapon');
  let kills = 1, damage = 0, shots = 0;
  if (weapon !== 'bazooka') integer(die, 1, 6);
  if (weapon === 'blaster') {
    if (!player.blaster) throw new RangeError('No blaster');
    shots = Math.min(player.shots, die); player.shots -= shots;
    damage = die - shots; next.usedBlaster = true;
  } else if (weapon === 'melee') {
    damage = die;
  } else if (weapon === 'grenade') {
    if (!player.grenades) throw new RangeError('No grenades');
    player.grenades--; kills = die; next.usedExplosives = true;
  } else {
    if (!player.bazookas) throw new RangeError('No bazookas');
    player.bazookas--; kills = 3; next.usedExplosives = true;
  }
  kills = Math.min(kills, next.remaining);
  next.remaining -= kills; player.life = Math.max(0, player.life - damage); next.turns++;
  next.events.push({kind: 'attack', weapon, die: weapon === 'bazooka' ? null : die, shots, damage, kills, remaining: next.remaining});
  // Zero Health ends the game even when the final alien also dies.
  if (!player.life) return finish(next, 'loss');
  if (!next.remaining) return finish(next, 'win');
  return next;
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }

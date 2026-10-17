import { ENCOUNTERS, MECHS, RULES_REVISION } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export function newCharacter(mech = 'argos') {
  if (!MECHS[mech]) throw new RangeError('Invalid mech');
  return { mech, ...MECHS[mech], maxWeapons: MECHS[mech].weapons, maxArmour: MECHS[mech].armour,
    difficulty: 'normal', mechanic: false, heavyWeapons: false, repairMinutes: 0 };
}
export function validateCharacter(character) {
  if (!character || !MECHS[character.mech] || !['easy', 'normal', 'hard'].includes(character.difficulty)) throw new RangeError('Invalid character');
  integer(character.weapons, 0, 6); integer(character.armour, 0, 6);
  integer(character.maxWeapons, character.weapons, 6); integer(character.maxArmour, character.armour, 6);
  integer(character.repairMinutes, 0, Number.MAX_SAFE_INTEGER);
  return structuredClone(character);
}
function finish(fight, outcome, destination) {
  fight.outcome = outcome;
  if (outcome === 'win') fight.remaining = 0;
  fight.phase = 'finished';
  fight.destination = outcome === 'cancelled' ? null : destination ?? (outcome === 'loss' ? 'scoring' : fight.encounter.destination);
  fight.events.push({ kind: outcome, destination: fight.destination });
  return fight;
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight);
  next.events = [];
  return next;
}
export function startFight(character, section, name, overrides = {}) {
  const encounter = ENCOUNTERS.find(row => row.section === Number(section));
  if (!encounter || typeof name !== 'string' || !name.trim()) throw new RangeError('Missing encounter');
  const player = validateCharacter(character);
  player.repairPointsUsed = 0;
  if (encounter.kind === 'mech' && player.armour <= 0) throw new RangeError('Mech destroyed');
  const count = integer(overrides.count ?? encounter.count, 1, 100);
  const range = integer(overrides.range ?? encounter.range, 0, 100);
  const fight = { rulesRevision: RULES_REVISION, encounter: { ...encounter, count, range },
    character: player, name: String(name).trim(), remaining: count, rounds: 0, rolls: 0, successes: 0,
    sniperRemaining: player.mech === 'mycenae' ? range : 0, defenceRemaining: 0,
    phase: encounter.entryDamage ? 'damage' : encounter.kind === 'mech' ? 'attack' : 'personal',
    entryDamage: Boolean(encounter.entryDamage), outcome: null, events: [{ kind: 'start', section: encounter.section }] };
  if (!fight.entryDamage && encounter.kind === 'mech' && fight.sniperRemaining) fight.phase = 'sniper';
  return fight;
}

// A normal-difficulty reroll is optional, and the player may retain either result.
export function chooseDie(difficulty, first, second, useSecond = false) {
  if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new RangeError('Invalid difficulty');
  integer(first, 1, 6);
  if (second !== undefined) {
    if (difficulty !== 'normal') throw new RangeError('Reroll unavailable');
    integer(second, 1, 6);
  }
  if (useSecond && second === undefined) throw new RangeError('Missing reroll');
  return useSecond ? second : first;
}

export function applyRoll(fight, die) {
  const next = fresh(fight);
  integer(die, 1, 6);
  const character = next.character;
  if (next.phase === 'personal') {
    next.rolls++;
    const threshold = character.heavyWeapons ? 5 : next.encounter.kind === 'ravagers' ? 4 : 3;
    if (die <= threshold) next.successes++;
    next.events.push({ kind: 'personal', die, successes: next.successes, rolls: next.rolls });
    if (next.encounter.kind === 'personal') return finish(next, die <= threshold ? 'win' : 'loss');
    if (next.successes >= 2) return finish(next, 'win', next.rolls <= 3 ? '28' : '82');
    if (next.rolls >= 5) return finish(next, 'loss');
    return next;
  }
  if (next.phase === 'attack' || next.phase === 'sniper') {
    const sniper = next.phase === 'sniper';
    if (!sniper) next.rounds++;
    const hit = die <= character.weapons;
    if (hit) next.remaining--;
    next.events.push({ kind: sniper ? 'sniper' : 'attack', die, hit, remaining: next.remaining });
    if (!next.remaining) return finish(next, 'win');
    if (sniper) {
      next.sniperRemaining--;
      if (!next.sniperRemaining) next.phase = 'attack';
    } else {
      next.defenceRemaining = next.remaining;
      next.phase = 'defence';
    }
    return next;
  }
  if (next.phase !== 'defence') throw new RangeError('Roll unavailable');
  const hit = die > character.armour;
  next.defenceRemaining--;
  next.events.push({ kind: 'defence', die, hit });
  next.phase = hit ? 'damage' : next.defenceRemaining ? 'defence' : 'attack';
  return next;
}

export function allocateDamage(fight, stat) {
  const next = fresh(fight);
  if (next.phase !== 'damage' || !['weapons', 'armour'].includes(stat) || next.character[stat] <= 0) throw new RangeError('Invalid damage allocation');
  next.character[stat]--;
  next.events.push({ kind: 'damage', stat, value: next.character[stat] });
  if (next.character.armour === 0) return finish(next, 'loss');
  if (next.entryDamage) {
    next.entryDamage = false;
    next.phase = next.sniperRemaining ? 'sniper' : 'attack';
  } else next.phase = next.defenceRemaining ? 'defence' : 'attack';
  return next;
}

export function escapeFight(fight, die) {
  const next = fresh(fight);
  integer(die, 1, 6);
  if (next.encounter.kind !== 'mech' || !next.encounter.escape || next.character.mech === 'sparta'
      || !['attack', 'sniper'].includes(next.phase)) throw new RangeError('Escape unavailable');
  const threshold = next.encounter.range + (next.character.mech === 'olympia' ? 2 : 0);
  next.events.push({ kind: 'escapeAttempt', die, threshold, loseBraveryMedal: true });
  return finish(next, die <= threshold ? 'escape' : 'loss');
}

export function repairCharacter(character, stat) {
  const next = validateCharacter(character);
  if (!next.mechanic || next.armour <= 0 || !['weapons', 'armour'].includes(stat)) throw new RangeError('Repair unavailable');
  const maximum = stat === 'weapons' ? next.maxWeapons : next.maxArmour;
  if (next[stat] >= maximum) throw new RangeError('Nothing to repair');
  // Two points may be split between weapons and armour within one half-hour.
  const used = integer(next.repairPointsUsed ?? 0, 0, Number.MAX_SAFE_INTEGER);
  next[stat]++;
  next.repairMinutes += used % 2 === 0 ? 30 : 0;
  next.repairPointsUsed = used + 1;
  return next;
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled', null); }

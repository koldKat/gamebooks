import { createRosterLoader } from '../roster-data.js';
import { customThresholdEncounter } from './threshold-opponents.js';

export let ARKHAM_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(555, 'ARKHAM_ENCOUNTERS', rows => { ARKHAM_ENCOUNTERS = rows; });

function die(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
  return Math.floor(value * 6) + 1;
}

export function createArkhamCharacter(profile, stats) {
  if (!['agnes', 'nathaniel', 'rex'].includes(profile)) throw new RangeError('Invalid investigator');
  for (const key of ['willpower', 'intellect', 'combat', 'health', 'sanity'])
    if (!Number.isSafeInteger(stats[key])) throw new RangeError('Invalid investigator stats');
  return { ...stats, profile, resources: 0, clues: profile === 'rex' ? 1 : 0, doom: 0,
    rites: false, agile: false, fear: false, sorcererUsed: false, weaponUsed: false };
}

export function createArkhamFight(section, player, sorcerer = false, options = {}) {
  const spec = ARKHAM_ENCOUNTERS.find(e => e.section === Number(section))
    ?? customThresholdEncounter(ARKHAM_ENCOUNTERS, section, options.opponents, 'arkham');
  if (!spec || !player || sorcerer && (player.profile !== 'agnes' || player.sorcererUsed))
    throw new RangeError('Invalid encounter');
  for (const key of ['willpower', 'intellect', 'combat', 'health', 'sanity', 'resources', 'clues', 'doom'])
    if (!Number.isSafeInteger(player[key]) || ['resources', 'clues', 'doom'].includes(key) && player[key] < 0)
      throw new RangeError('Invalid investigator stats');
  const copy = { ...player };
  if (sorcerer) copy.sorcererUsed = true;
  return { spec: structuredClone(spec), player: copy, sorcerer, rounds: [], status: 'fighting', recorded: false };
}

export function rollArkhamRound(fight, { resource = false, weapon = false } = {}, random = Math.random) {
  if (!fight || fight.status !== 'fighting') return null;
  const p = fight.player, e = fight.spec, index = fight.rounds.length;
  if (index >= e.thresholds.length || resource && p.resources < 1 || weapon && (p.profile !== 'nathaniel' || p.weaponUsed)) return null;
  const rawDice = [die(random), die(random)];
  const stats = e.stats.map(k => fight.sorcerer && k === 'combat' ? 'willpower' : k);
  const cursed = p.profile === 'rex' && (stats.includes('intellect') || stats.includes('willpower')) && rawDice[0] === rawDice[1];
  const dice = cursed ? [1, 1] : rawDice;
  let modifier = stats.reduce((n, key) => n + p[key] + (key === 'combat' ? Math.min(0, p.health) : key === 'willpower' ? Math.min(0, p.sanity) : 0), 0);
  if (e.doom && index === 0) modifier -= p.doom;
  if ((e.agile || e.agileFirst && index === 0) && p.agile) modifier++;
  if (e.rites && p.rites) modifier++;
  if (e.fear && p.fear) modifier -= 2;
  if (index) modifier += e.finalMomentum && index === 2 ? (fight.rounds[index - 1].success ? 1 : -1) : fight.rounds[index - 1].success ? 2 : 0;
  if (p.profile === 'nathaniel' && stats.includes('combat')) modifier += dice.filter(n => n === 6).length;
  if (resource) { p.resources--; modifier += 2; }
  if (weapon) { p.weaponUsed = true; modifier += 3; }
  modifier += e.manualModifier ?? 0;
  const total = dice[0] + dice[1] + modifier, success = total >= e.thresholds[index];
  if (!success && e.hurtRound === index + 1) p.health--;
  if (p.profile === 'agnes' && stats.includes('willpower') && success) p.resources++;
  if (p.profile === 'rex' && stats.includes('intellect') && dice.includes(6)) p.clues++;
  const round = { round: index + 1, rawDice, dice, cursed, modifier, total, threshold: e.thresholds[index], success };
  fight.rounds.push(round);
  if (fight.rounds.length === e.thresholds.length) {
    const won = e.wins ? fight.rounds.filter(r => r.success).length >= e.wins : success;
    fight.status = won ? 'win' : 'loss'; fight.destination = won ? e.win : e.loss;
  }
  return round;
}

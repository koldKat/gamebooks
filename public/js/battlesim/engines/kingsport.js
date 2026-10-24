import { createRosterLoader } from '../roster-data.js';
import { customThresholdEncounter } from './threshold-opponents.js';

export const KINGSPORT_FLAGS = ['agile', 'survivor', 'resolved', 'fighter', 'tough', 'cautious', 'arachnophobia'];
export const KINGSPORT_PROFILES = {
  jacqueline: { willpower: 5, intellect: 3, combat: 2, health: 6, sanity: 9 },
  lucius: { willpower: 2, intellect: 4, combat: 1, health: 8, sanity: 6 },
  lola: { willpower: 3, intellect: 3, combat: 3, health: 6, sanity: 6 },
};
export let KINGSPORT_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(557, 'KINGSPORT_ENCOUNTERS', rows => { KINGSPORT_ENCOUNTERS = rows; });
function die(random) {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Invalid random value');
  return Math.floor(n * 6) + 1;
}
function validate(player) {
  if (!Object.hasOwn(KINGSPORT_PROFILES, player?.profile)) throw new RangeError('Invalid investigator');
  for (const key of ['willpower', 'intellect', 'combat', 'health', 'sanity', 'resources', 'clues', 'doom'])
    if (!Number.isSafeInteger(player[key]) || ['resources', 'clues', 'doom'].includes(key) && player[key] < 0) throw new RangeError('Invalid stats');
}
export function createKingsportCharacter(profile) {
  if (!Object.hasOwn(KINGSPORT_PROFILES, profile)) throw new RangeError('Invalid investigator');
  return { ...KINGSPORT_PROFILES[profile], profile, clues: profile === 'jacqueline' ? 1 : 0,
    resources: profile === 'jacqueline' ? 1 : 0, doom: 0, cardUsed: false, improvisations: 0,
    ...Object.fromEntries(KINGSPORT_FLAGS.map(key => [key, false])),
    agile: profile === 'jacqueline', cautious: profile === 'lola' };
}
export function createKingsportFight(section, player, options = {}) {
  validate(player);
  const spec = KINGSPORT_ENCOUNTERS.find(e => e.section === Number(section))
    ?? customThresholdEncounter(KINGSPORT_ENCOUNTERS, section, options.opponents, 'kingsport');
  if (!spec) throw new RangeError('Invalid encounter');
  return { spec: structuredClone(spec), player: structuredClone(player), rounds: [], status: 'fighting', recorded: false };
}
function spendResource(player, random) {
  player.resources--;
  if (player.profile === 'lola') {
    const crisis = die(random);
    if (crisis === 1) player.sanity--;
    return crisis;
  }
  return null;
}
export function improviseKingsport(player, increase, decrease, random = Math.random) {
  validate(player);
  const skills = ['willpower', 'intellect', 'combat'];
  if (player.profile !== 'lola' || !skills.includes(increase) || !skills.includes(decrease) || increase === decrease || !Number.isSafeInteger(player.improvisations) || player.improvisations < 0 || player.improvisations > 0 && player.resources < 1) return null;
  const next = { ...player };
  const crisis = next.improvisations ? spendResource(next, random) : null;
  next[increase]++; next[decrease]--; next.improvisations++;
  Object.assign(player, next);
  return { increase, decrease, crisis };
}
export function rollKingsportRound(fight, { resource = false, card = '' } = {}, random = Math.random) {
  if (!fight || fight.status !== 'fighting') return null;
  const p = fight.player, spec = fight.spec, index = fight.rounds.length, rule = spec.rounds[index];
  if (!rule || resource && (spec.noResources || p.resources < 1) || card && (p.profile !== 'lola' || p.cardUsed || !KINGSPORT_FLAGS.slice(0, 5).includes(card) || p[card])) return null;
  const dice = [die(random), die(random)];
  const next = { ...p }, crisis = resource ? spendResource(next, random) : null;
  if (card) { next.cardUsed = true; next[card] = true; }
  const darkFuture = p.profile === 'jacqueline' && dice[0] === dice[1];
  if (darkFuture) next.doom++;
  let modifier = rule.stats.reduce((n, key) => n + next[key] + (key === 'combat' ? Math.min(0, next.health) : key === 'willpower' ? Math.min(0, next.sanity) : 0), 0);
  if (rule.bonus.some(k => next[k] || card === k)) modifier++;
  if (rule.penalty.some(k => next[k])) modifier--;
  if (index && fight.rounds[index - 1].success) modifier += rule.momentum;
  if (resource) modifier += 2;
  modifier += spec.manualModifier ?? 0;
  const total = dice[0] + dice[1] + modifier, success = !darkFuture && total >= rule.target;
  Object.assign(p, next);
  const result = { round: index + 1, dice, modifier, total, threshold: rule.target, success, darkFuture, crisis, card };
  fight.rounds.push(result);
  if (fight.rounds.length === spec.rounds.length) {
    const wins = fight.rounds.filter(r => r.success).length;
    fight.destination = spec.outcomes[spec.countWins ? wins : Number(success)];
    const won = spec.countWins ? wins >= (spec.custom ? spec.wins : Math.ceil(spec.rounds.length / 2)) : success;
    fight.status = !spec.custom && fight.destination == null ? 'unresolved' : won ? 'win' : 'loss';
  }
  return result;
}

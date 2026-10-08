export const KINGSPORT_FLAGS = ['agile', 'survivor', 'resolved', 'fighter', 'tough', 'cautious', 'arachnophobia'];
export const KINGSPORT_PROFILES = {
  jacqueline: { willpower: 5, intellect: 3, combat: 2, health: 6, sanity: 9 },
  lucius: { willpower: 2, intellect: 4, combat: 1, health: 8, sanity: 6 },
  lola: { willpower: 3, intellect: 3, combat: 3, health: 6, sanity: 6 },
};
const round = (target, stats, bonus = [], penalty = [], momentum = 0) => ({ target, stats, bonus, penalty, momentum });
const c = ['combat'], cw = ['combat', 'willpower'];
const first = ['agile', 'resolved', 'survivor'], second = ['fighter', 'tough'];
const fear = ['arachnophobia', 'cautious'];
const three = (start) => [round(start, c, ['fighter', 'resolved'], fear), round(start + 1, c, ['tough'], ['arachnophobia'], 1), round(start + 2, c, ['survivor'], ['arachnophobia'], 2)];
export const KINGSPORT_ENCOUNTERS = [
  { section: 21, rounds: [round(14, c, ['agile', 'survivor'], ['cautious']), round(15, cw, second, [], 2)], outcomes: [56, 36] },
  { section: 37, rounds: [round(14, c, first, ['cautious']), round(15, cw, second, [], 2)], outcomes: [49, 78], noResources: true },
  { section: 103, rounds: three(10), outcomes: [86, 86, 71, 71], countWins: true },
  { section: 135, rounds: [round(14, cw, first, ['cautious']), round(15, cw, second, [], 2)], outcomes: [153, 113] },
  { section: 149, rounds: [round(12, c, ['fighter'], ['cautious']), round(16, c, ['tough'], [], 1), round(17, c, ['survivor'], [], 2)], outcomes: [168, 185, 205, 221], countWins: true },
  { section: 218, rounds: three(10), outcomes: [64, 64, 44, 27], countWins: true },
  { section: 223, rounds: three(15), outcomes: [86, 86, 71, 71], countWins: true },
  { section: 245, rounds: [round(12, cw, ['agile', 'survivor'], fear), round(13, cw, ['fighter'], ['arachnophobia'], 2), round(14, cw, ['tough'], ['arachnophobia'], 2), round(15, cw, ['survivor'], ['arachnophobia'], 3)], outcomes: [86, 86, null, 71, 71], countWins: true },
  { section: 286, rounds: [round(14, cw, ['survivor'], fear), round(15, cw, ['tough'], ['arachnophobia'], 2)], outcomes: [141, 59] },
  { section: 292, rounds: [round(14, cw, ['fighter'], ['cautious']), round(15, cw, ['tough'], [], 2)], outcomes: [84, 238] },
  { section: 299, rounds: [round(14, cw, first, ['cautious']), round(15, cw, second, [], 2)], outcomes: [153, 71] },
];
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
    ...Object.fromEntries(KINGSPORT_FLAGS.map(key => [key, false])) };
}
export function createKingsportFight(section, player) {
  validate(player);
  const spec = KINGSPORT_ENCOUNTERS.find(e => e.section === Number(section));
  if (!spec) throw new RangeError('Invalid encounter');
  return { spec: structuredClone(spec), player: structuredClone(player), rounds: [], status: 'fighting', recorded: false };
}
function spendResource(player, random) {
  player.resources--;
  if (player.profile === 'lola') {
    const crisis = die(random);
    if (crisis <= 3) player.sanity--;
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
  if (card) next.cardUsed = true;
  const darkFuture = p.profile === 'jacqueline' && dice[0] === dice[1];
  if (darkFuture) next.doom++;
  let modifier = rule.stats.reduce((n, key) => n + next[key] + (key === 'combat' ? Math.min(0, next.health) : key === 'willpower' ? Math.min(0, next.sanity) : 0), 0);
  if (rule.bonus.some(k => next[k] || card === k)) modifier++;
  if (rule.penalty.some(k => next[k])) modifier--;
  if (index && fight.rounds[index - 1].success) modifier += rule.momentum;
  if (resource) modifier += 2;
  const total = dice[0] + dice[1] + modifier, success = !darkFuture && total >= rule.target;
  Object.assign(p, next);
  const result = { round: index + 1, dice, modifier, total, threshold: rule.target, success, darkFuture, crisis, card };
  fight.rounds.push(result);
  if (fight.rounds.length === spec.rounds.length) {
    const wins = fight.rounds.filter(r => r.success).length;
    fight.destination = spec.outcomes[spec.countWins ? wins : Number(success)];
    fight.status = fight.destination == null ? 'unresolved' : (spec.countWins ? wins >= Math.ceil(spec.rounds.length / 2) : success) ? 'win' : 'loss';
  }
  return result;
}

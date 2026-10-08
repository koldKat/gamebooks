const encounter = (section, thresholds, stats, win, loss, extra = {}) =>
  ({ section, thresholds, stats, win, loss, ...extra });

export const ARKHAM_ENCOUNTERS = [
  encounter(15, [15, 15, 13], ['combat'], 74, 20, { fear: true }),
  encounter(62, [15, 16, 17], ['combat', 'willpower'], 103, 83, { wins: 2 }),
  encounter(64, [15, 16], ['combat', 'willpower'], 113, 133, { rites: true }),
  encounter(102, [12, 13], ['combat', 'willpower'], 132, 235, { rites: true }),
  encounter(138, [17, 18], ['combat'], 269, 257, { hurtRound: 2 }),
  encounter(157, [15, 16, 16], ['combat'], 238, 272, { doom: true, agile: true, rites: true, fear: true }),
  encounter(160, [15, 16], ['combat'], 201, 184, { agile: true }),
  encounter(183, [14, 15], ['combat', 'willpower'], 113, 133, { rites: true }),
  encounter(203, [16, 17], ['combat', 'willpower'], 113, 133, { rites: true }),
  encounter(205, [13, 14], ['combat'], 245, 225, { fear: true, hurtRound: 1 }),
  encounter(214, [10, 11], ['combat', 'intellect'], 290, 274),
  encounter(220, [10, 11], ['combat', 'intellect'], 233, 193),
  encounter(221, [15, 16], ['combat'], 269, 257, { agile: true }),
  encounter(239, [14, 15], ['combat', 'willpower'], 17, 46, { rites: true, wins: 2 }),
  encounter(248, [12, 13], ['combat'], 288, 268, { fear: true }),
  encounter(258, [18, 19, 20], ['combat', 'willpower'], 146, 284, { doom: true, rites: true }),
  encounter(270, [10, 11], ['combat', 'intellect'], 290, 274),
  encounter(275, [17, 18], ['combat'], 269, 257, { doom: true, agile: true }),
  encounter(281, [16, 16], ['combat'], 181, 92, { doom: true, agile: true }),
  encounter(294, [14, 15, 14], ['combat'], 13, 106, { agileFirst: true, finalMomentum: true, hurtRound: 3 }),
];

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

export function createArkhamFight(section, player, sorcerer = false) {
  const spec = ARKHAM_ENCOUNTERS.find(e => e.section === Number(section));
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

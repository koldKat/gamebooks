// Validate and apply explicit combat reinforcements, flanking and continuation changes.
const integer = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) throw new RangeError('Invalid combat timing value');
};
const chart = value => { if (!/^[A-G]$/.test(value)) throw new RangeError('Invalid timed combat chart'); };
function additions(entries, enemies, timed) {
  if (!Array.isArray(entries) || entries.length > 100) throw new RangeError('Invalid reinforcements');
  for (const entry of entries) {
    if (!enemies.some(unit => unit.key === entry.key)) throw new RangeError('Unknown reinforcement unit');
    integer(entry.count, 1);
    if (timed) integer(entry.round, 1);
  }
}
export function validatePersonnelTiming(config) {
  const rules = config.rules;
  if (rules.resumeRoundMinimum !== undefined) integer(rules.resumeRoundMinimum);
  if (rules.reinforcements !== undefined) additions(rules.reinforcements, config.enemies, true);
  for (const [round, value] of Object.entries(rules.enemyChartRounds ?? {})) { integer(Number(round), 1); chart(value); }
  if (rules.flank) {
    integer(rules.flank.fromRound, 1); integer(rules.flank.minimumRoll, 1);
    if (rules.flank.minimumRoll > 6) throw new RangeError('Invalid flanking roll');
    if (rules.flank.playerChart !== undefined) chart(rules.flank.playerChart);
    if (rules.flank.enemyChart !== undefined) chart(rules.flank.enemyChart);
    if (rules.flank.playerFiringDivisor !== undefined) integer(rules.flank.playerFiringDivisor, 1);
  }
  if (rules.requireFullRounds && !rules.roundLimit) throw new RangeError('Enter the complete-round objective');
  if (rules.continuations !== undefined) {
    if (!Array.isArray(rules.continuations) || !rules.continuations.length || rules.continuations.length > 20
        || rules.limitOutcome !== 'paused' || !rules.roundLimit) throw new RangeError('Invalid combat continuations');
    const keys = new Set();
    for (const entry of rules.continuations) {
      if (typeof entry.key !== 'string' || !entry.key || keys.has(entry.key)
          || typeof entry.label !== 'string' || !entry.label.trim()) throw new RangeError('Invalid combat continuation');
      keys.add(entry.key);
      if (entry.playerChart !== undefined) chart(entry.playerChart);
      if (entry.enemyChart !== undefined) chart(entry.enemyChart);
      if (entry.reinforcements !== undefined) additions(entry.reinforcements, config.enemies, false);
    }
  }
}
export function pendingPersonnelReinforcements(fight) {
  return (fight.config.rules.reinforcements ?? []).some((entry, index) => entry.round > fight.round
    && !fight.appliedReinforcements?.includes(index));
}
export function waitingPersonnelObjective(fight) {
  return Boolean(fight.config.rules.requireFullRounds && fight.round <= fight.config.rules.roundLimit);
}
export function addPersonnelReinforcements(fight, entries) {
  additions(entries, fight.enemies, false);
  for (const entry of entries) {
    const unit = fight.enemies.find(enemy => enemy.key === entry.key);
    integer(unit.count + entry.count);
    const start = fight.startEnemies.find(enemy => enemy.key === entry.key);
    integer((start.initialCount ?? start.count) + entry.count);
    unit.count += entry.count;
    start.initialCount = (start.initialCount ?? start.count) + entry.count;
    fight.history.at(-1).checks.push({ kind:'reinforcements', key:unit.key, count:entry.count,
      message:`${entry.count} reinforcements join ${unit.name}; ${unit.count} now remain.` });
  }
}
export function applyPersonnelRoundEvents(fight) {
  const entries = fight.config.rules.reinforcements ?? [];
  for (const [index, entry] of entries.entries()) if (entry.round === fight.round
      && !fight.appliedReinforcements?.includes(index)) {
    addPersonnelReinforcements(fight, [entry]);
    (fight.appliedReinforcements ??= []).push(index);
  }
}

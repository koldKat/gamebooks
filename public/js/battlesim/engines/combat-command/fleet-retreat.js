// Resolve explicit in-combat Morale and Stealth tests without choosing a story destination.
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid retreat value or roll');
  return value;
};

export function rollFleetTest(value, total, random) {
  integer(value, 0, 1000000);
  if (total !== undefined) return { total: integer(total, 2, 12), dice: null, manual: true, passed: total <= value };
  const dice = [integer(random(6), 1, 6), integer(random(6), 1, 6)];
  total = dice[0] + dice[1];
  return { total, dice, manual: false, passed: total <= value };
}

export function resolveFleetRetreat(config, stats, options, random) {
  const rule = config.retreat;
  if (!rule || !['manual-stop', 'voluntary-or-forced', 'morale-gated-voluntary'].includes(rule.kind)) {
    throw new RangeError('No retreat rule is available');
  }
  if (options.moraleRoll !== undefined) integer(options.moraleRoll, 2, 12);
  if (rule.kind === 'manual-stop') return { outcome: 'stopped', tests: [] };
  const attempts = integer(rule.stealthAttempts, 1, 3);
  if (options.stealthRolls !== undefined && (!Array.isArray(options.stealthRolls)
      || options.stealthRolls.length !== attempts)) throw new RangeError('Enter each Stealth roll');
  options.stealthRolls?.forEach(total => integer(total, 2, 12));
  if (options.automaticNoEnemyFire && (!rule.sourceAmbiguity || stats.lastEnemyFired)) {
    throw new RangeError('Automatic withdrawal is unavailable');
  }
  const tests = [];
  if (rule.kind === 'morale-gated-voluntary' && !options.forced) {
    const result = rollFleetTest(stats.morale, options.moraleRoll, random);
    tests.push({ kind: 'morale', ...result });
    if (!result.passed) return { outcome: null, gateFailed: true, tests };
  }
  if (options.automaticNoEnemyFire) {
    return { outcome: 'withdrawn', tests, sourceInterpretation: 'automatic-after-no-enemy-fire' };
  }
  for (let index = 0; index < attempts; index++) {
    const result = rollFleetTest(stats.stealth, options.stealthRolls?.[index], random);
    tests.push({ kind: 'stealth', ...result });
    if (result.passed) return { outcome: 'withdrawn', tests };
  }
  return { outcome: null, tests };
}

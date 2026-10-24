const sum = values => values.reduce((total, value) => total + value, 0);
function die(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('Invalid die');
  return value;
}
function result(rules, key) {
  const value = rules.results?.[key];
  if (!value || !['win', 'loss', 'draw', 'manual', 'pending'].includes(value.outcome)) throw new TypeError('Missing encounter outcome');
  return structuredClone(value);
}

// Enemy attributes, destinations and comparison thresholds are supplied by the
// database catalog. Existing pending duel state remains authoritative on resume.
export function resolveGalacticDuel(rules, player, previous, flee, roll, limit = 256) {
  if (rules?.kind !== 'duel' || !Number.isFinite(rules.enemyStrength) ||
      rules.lifePhase && !Number.isFinite(rules.enemyLife)) throw new TypeError('Load duel rules before combat');
  const state = previous ? { ...previous } : { enemyStrength: rules.enemyStrength, enemyLife: rules.enemyLife, rounds: 0 };
  let strength = player.sila, life = player.zhivot;
  const finish = key => ({ ...result(rules, key), rounds: state.rounds,
    cost: { sila: player.sila - strength, zhivot: player.zhivot - life } });
  const won = () => state.enemyStrength <= 0 || rules.lifePhase && state.enemyLife <= 0;
  for (let count = 0; count < limit; count++) {
    if (strength <= 0 || life < 3) return finish('lose');
    if (won()) return finish('win');
    if (rules.fleeBelowStrength !== undefined && flee && strength < rules.fleeBelowStrength) return finish('flee');
    state.rounds++;
    const dice = rules.alternatingDice && state.rounds % 2 === 0 ? 2 : 1;
    let playerRoll = 0, enemyRoll = 0;
    for (let index = 0; index < dice; index++) { playerRoll += die(roll); enemyRoll += die(roll); }
    const difference = strength + playerRoll - state.enemyStrength - enemyRoll;
    if (difference > 0) state.enemyStrength = Math.max(0, state.enemyStrength - difference);
    if (difference < 0) strength = Math.max(0, strength + difference);
    if (strength <= 0 || state.enemyStrength <= 0) continue;
    if (rules.lifePhase) {
      const difference = life + die(roll) - state.enemyLife - die(roll);
      if (difference > 0) state.enemyLife = Math.max(0, state.enemyLife - difference);
      if (difference < 0) life = Math.max(0, life + difference);
    }
  }
  if (strength <= 0 || life < 3) return finish('lose');
  if (won()) return finish('win');
  return { ...finish('paused'), pending: state };
}

export function resolveGalacticEncounter(rules, player, previous, flee = false, roll = () => 1 + Math.floor(Math.random() * 6)) {
  if (!rules || !player) throw new TypeError('Missing encounter setup');
  if (rules.kind === 'duel') return resolveGalacticDuel(rules, player, previous, flee, roll);
  const attributes = rules.attributes || [rules.attribute];
  const score = () => sum(attributes.map(key => player[key]));
  switch (rules.kind) {
    case 'attribute-test': {
      const rolled = sum(Array.from({ length: rules.dice || 0 }, () => die(roll)));
      return { ...result(rules, score() + rolled > rules.threshold ? 'success' : 'failure'), ...(rules.dice ? { roll: rolled } : {}) };
    }
    case 'paired-test': {
      const values = attributes.map(key => player[key]);
      const passed = values.map((value, index) => value >= rules.thresholds[index]);
      if (passed.every(Boolean)) return result(rules, 'success');
      if (passed.every(value => !value)) return result(rules, 'failure');
      if (values.some((value, index) => value === rules.thresholds[index])) return result(rules, 'boundary');
      return result(rules, 'mixed');
    }
    case 'difference-bands': {
      const difference = sum(rules.enemyBases) - score();
      return result(rules, difference < 0 ? 'below' : difference <= rules.middleLimit ? 'middle' : 'above');
    }
    case 'sum-comparison': {
      const enemy = sum(rules.enemyBases) + sum(Array.from({ length: rules.enemyDice }, () => die(roll)));
      const difference = score() - enemy;
      if (rules.manualAdvantage !== undefined && difference > rules.manualAdvantage) return result(rules, 'manual');
      return result(rules, difference > 0 ? 'success' : difference === 0 && rules.results.equal ? 'equal' : 'failure');
    }
    default: throw new TypeError('Unsupported encounter rules');
  }
}

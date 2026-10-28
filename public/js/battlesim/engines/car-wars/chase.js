import {controlCheck} from './core.js';

const copy = value => structuredClone(value);
const integer = (value, minimum = 1) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError('Invalid chase rule');
  return value;
};

export function startChase(hero, entry) {
  const rules = entry?.rules?.chase;
  if (!rules || !entry.enemies?.length) throw new RangeError('Choose a chase');
  const mode = rules.mode ?? 'pursuit';
  if (!['first-failures', 'success-lead', 'pursuit'].includes(mode)) throw new RangeError('Invalid chase mode');
  if (mode !== 'pursuit' && entry.enemies.length !== 1) throw new RangeError('Choose one chase opponent');
  for (const unit of [hero, ...entry.enemies]) {
    if (unit.driving == null) {
      if (!Number.isSafeInteger(unit.controlRoll)) throw new RangeError('Enter the missing Control roll');
    } else if (!Number.isSafeInteger(unit.driving) || !Number.isSafeInteger(unit.handling)) {
      throw new RangeError('Enter Driving and Handling');
    }
  }
  if (mode === 'first-failures') integer(rules.failureLimit);
  if (mode === 'success-lead') {integer(rules.leadRequired); integer(rules.turnLimit);}
  if (mode === 'pursuit') integer(rules.failuresToDropOut);
  return {
    rulesVersion: 1, type: 'chase', sourceSection: entry.section,
    hero: copy(hero), enemies: copy(entry.enemies), rules: copy(entry.rules),
    round: 0, status: 'chasing', section: null, events: [],
    heroRolls: {successes: 0, failures: 0},
    enemyRolls: entry.enemies.map(() => ({successes: 0, failures: 0})),
  };
}

export function chaseTurn(previous, roll) {
  if (previous?.type !== 'chase' || previous.rulesVersion !== 1 || previous.status !== 'chasing') {
    throw new RangeError('No active chase');
  }
  const state = copy(previous), rules = state.rules.chase, mode = rules.mode ?? 'pursuit';
  state.round++; state.events = [];
  const check = (unit, counts) => {
    const result = controlCheck(unit, roll);
    counts[result.passed ? 'successes' : 'failures']++;
    state.events.push(`${unit.name ?? 'Driver'}: ${result.dice.join('+')} against ${result.target}, ${result.passed ? 'control held' : 'control lost'}.`);
  };
  const finish = (status, section) => {state.status = status; state.section = section ?? null;};
  check(state.hero, state.heroRolls);
  // A first-to-fail contest ends immediately when the first driver reaches the limit.
  if (mode === 'first-failures' && state.heroRolls.failures >= rules.failureLimit) {
    finish('loss', state.rules.defeat); return state;
  }
  for (let index = 0; index < state.enemies.length; index++) {
    const unit = state.enemies[index];
    if (unit.escaped || unit.out) continue;
    check(unit, state.enemyRolls[index]);
    if (mode === 'first-failures' && state.enemyRolls[index].failures >= rules.failureLimit) {
      finish('win', state.rules.victory); return state;
    }
    if (mode === 'pursuit' && state.enemyRolls[index].failures >= rules.failuresToDropOut) {
      unit.escaped = true;
      state.events.push(`${unit.name ?? 'Pursuer'} drops behind.`);
    }
  }
  if (mode === 'success-lead') {
    // Compare after a pair of alternating rolls so both drivers have the same number of attempts.
    const lead = state.heroRolls.successes - state.enemyRolls[0].successes;
    if (lead >= rules.leadRequired) finish('win', state.rules.victory);
    else if (lead <= -rules.leadRequired) finish('loss', state.rules.defeat);
    else if (state.round >= rules.turnLimit) finish('branch', rules.timeout);
  } else if (mode === 'pursuit') {
    if (state.enemies.every(unit => unit.escaped || unit.out)) finish('win', state.rules.victory);
    else if (state.heroRolls.failures >= rules.failuresToDropOut) finish('branch', rules.heroFailuresDestination);
  }
  return state;
}

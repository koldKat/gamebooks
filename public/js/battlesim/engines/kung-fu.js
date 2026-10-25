export function kungFuLegacyAction(enemy, round, random = Math.random) {
  const pattern = enemy.legacyPattern, opening = pattern.opening ?? [];
  if (round < opening.length) return {...opening[round]};
  const index = pattern.random ? Math.floor(random() * pattern.cycle.length)
    : (round - opening.length) % pattern.cycle.length;
  return {...pattern.cycle[index]};
}

export function kungFuEnemy(enemy, corrected = true) {
  const {legacyPattern, revisedRules, ...profile} = enemy;
  return {...profile, pattern: undefined, ...(corrected ? revisedRules.stats : {})};
}

export function kungFuAction(state, enemy, random = Math.random) {
  const attacks = state.enemyAttacks || 0, rules = enemy.revisedRules;
  if (rules.alwaysDefend || (rules.defendAfterAttacks !== undefined && attacks >= rules.defendAfterAttacks)) {
    return {type: 'defend', move: 'aggressive'};
  }
  const defending = rules.opensDefending && state.roundIdx === 0;
  if (defending || (!rules.continuous && !state.enemyAttackLocked && state.enemyLastAction === 'attack')) {
    return {type: 'defend', move: 'aggressive'};
  }
  const moves = rules.moves;
  const index = rules.random ? Math.floor(random() * moves.length) : attacks % moves.length;
  return {type: 'attack', move: moves[index]};
}

export function advanceKungFuAction(state, action, enemyOutcome) {
  if (action.type === 'attack') {
    if (state.roundIdx === 0 && enemyOutcome === 'win') state.enemyAttackLocked = true;
    state.enemyAttacks = (state.enemyAttacks || 0) + 1;
  }
  state.enemyLastAction = action.type;
}

export function kungFuDefeated(state, enemy) {
  return Boolean(enemy.revisedRules.defeatedOnPlayerLoss) && state.playerResults.includes('loss');
}

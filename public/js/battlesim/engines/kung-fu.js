const MOVES = {
  li_xiao: ['combined', 'combined', 'leg', 'hand'],
  tun_tsin: ['combined', 'hand'],
  dupont_early: ['leg'],
  dupont_tournament: ['leg'],
  steve_train: ['hand', 'combined'],
  lin_bao_tournament: ['leg', 'hand', 'combined'],
  lin_bao_rescue: ['hand'],
  mac_stone: ['leg', 'hand', 'combined'],
  park_attackers: ['hand'],
  kao_lie: ['leg', 'hand', 'combined'],
  arena_rescue_guards: ['combined'],
  arena_melee_guards: ['hand', 'combined'],
};

export function kungFuEnemy(enemy) {
  const result = {...enemy, pattern: undefined};
  if (enemy.id === 'steve_train') result.defLeg = 27;
  if (enemy.id === 'lin_bao_rescue') result.defComb = 41;
  return result;
}

export function kungFuAction(state, enemy, random = Math.random) {
  const attacks = state.enemyAttacks || 0;
  if (enemy.id === 'arena_guards' || (enemy.id === 'lin_bao_rescue' && attacks >= 2)) {
    return {type: 'defend', move: 'aggressive'};
  }
  const opensDefending = ['dupont_tournament', 'mac_stone', 'kao_lie', 'arena_rescue_guards'].includes(enemy.id);
  const continuous = ['tun_tsin', 'lin_bao_rescue'].includes(enemy.id);
  const defending = opensDefending && state.roundIdx === 0;
  if (defending || (!continuous && !state.enemyAttackLocked && state.enemyLastAction === 'attack')) {
    return {type: 'defend', move: 'aggressive'};
  }
  const moves = MOVES[enemy.id];
  const index = enemy.id === 'mac_stone' ? Math.floor(random() * moves.length) : attacks % moves.length;
  return {type: 'attack', move: moves[index]};
}

export function advanceKungFuAction(state, action, enemyOutcome) {
  if (action.type === 'attack') {
    if (state.roundIdx === 0 && enemyOutcome === 'win') state.enemyAttackLocked = true;
    state.enemyAttacks = (state.enemyAttacks || 0) + 1;
  }
  state.enemyLastAction = action.type;
}

export function kungFuDefeated(state) {
  return state.enemyId === 'arena_guards' && state.playerResults.includes('loss');
}

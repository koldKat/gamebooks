export function resolveGalacticDuel(id, player, previous, flee, roll, limit = 256) {
  const state = previous ? { ...previous } : {
    enemyStrength: id === 'goraoktopod' ? 12 : 20,
    enemyLife: 18,
    rounds: 0,
  };
  let strength = player.sila, life = player.zhivot;
  const finish = (key, section, outcome) => ({
    key: `${id}_${key}`, section, outcome, rounds: state.rounds,
    cost: { sila: player.sila - strength, zhivot: player.zhivot - life },
  });
  for (let count = 0; count < limit; count++) {
    if (strength <= 0 || life < 3) return finish('lose', id === 'goraoktopod' ? 193 : 65, 'loss');
    if (state.enemyStrength <= 0 || (id === 'goraoktopod' && state.enemyLife <= 0)) {
      return finish('win', id === 'goraoktopod' ? 4 : 59, 'win');
    }
    if (id === 'invisiblerobot' && flee && strength < 10) return finish('flee', 179, 'draw');
    state.rounds++;
    const dice = id === 'invisiblerobot' && state.rounds % 2 === 0 ? 2 : 1;
    let playerRoll = 0, enemyRoll = 0;
    for (let die = 0; die < dice; die++) {
      playerRoll += roll();
      enemyRoll += roll();
    }
    const difference = strength + playerRoll - state.enemyStrength - enemyRoll;
    if (difference > 0) state.enemyStrength = Math.max(0, state.enemyStrength - difference);
    if (difference < 0) strength = Math.max(0, strength + difference);
    if (strength <= 0 || state.enemyStrength <= 0) continue;
    if (id === 'goraoktopod') {
      const lifeDifference = life + roll() - state.enemyLife - roll();
      if (lifeDifference > 0) state.enemyLife = Math.max(0, state.enemyLife - lifeDifference);
      if (lifeDifference < 0) life = Math.max(0, life + lifeDifference);
    }
  }
  if (strength <= 0 || life < 3) return finish('lose', id === 'goraoktopod' ? 193 : 65, 'loss');
  if (state.enemyStrength <= 0 || (id === 'goraoktopod' && state.enemyLife <= 0)) {
    return finish('win', id === 'goraoktopod' ? 4 : 59, 'win');
  }
  return { ...finish('paused', null, 'pending'), pending: state };
}

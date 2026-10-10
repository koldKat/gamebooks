export function tetivaEncounter(section) {
  return {
    enemyFirst: section === 119 || section === 279,
    initiativeBySpeed: section === 211,
    variableDefense: section === 109 || section === 119,
    kobaldi: section === 279,
  };
}

export function tetivaRound(state, roll) {
  const events = [];
  const won = () => state.enemy.hitsLanded >= state.enemy.hitsNeeded;
  const lost = () => state.player.damage >= 24;
  if (won() || lost()) return events;
  const effects = state.combatEffects;
  if (effects.initiativeBySpeed && state.initiativeEnemyFirst === undefined) {
    state.initiativeEnemyFirst = roll() > (state.player.speed || 0);
  }
  const enemyFirst = effects.initiativeBySpeed ? state.initiativeEnemyFirst : effects.enemyFirst;
  const playerTurn = () => {
    const attack = state.player.attack + roll();
    const hit = attack > state.enemy.defense;
    if (hit) state.enemy.hitsLanded++;
    events.push({side:'player', attack, hit});
  };
  const enemyTurn = () => {
    let strikes = Math.max(1, state.enemy.strikesPerRound || 1);
    if (state.kobaldiMode) {
      const first = roll();
      let second;
      do { second = roll(); } while (second === first);
      strikes = Math.abs(first - second);
    }
    for (let i = 0; i < strikes && !lost(); i++) {
      const attack = state.enemy.attack + roll();
      const defense = effects.variableDefense ? (state.player.speed || 0) + roll() : state.player.defense;
      const damage = Math.max(0, attack - defense);
      state.player.damage = Math.min(24, state.player.damage + damage);
      events.push({side:'enemy', attack, damage, total:state.player.damage});
    }
  };
  if (enemyFirst) {
    enemyTurn();
    if (!lost()) playerTurn();
  } else {
    playerTurn();
    if (!won()) enemyTurn();
  }
  return events;
}

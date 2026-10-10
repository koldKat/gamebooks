export function resolveCellarDragon(encounter, player, options, previous, roll, limit = 256) {
  const state = previous ? {
    ...previous, enemies: previous.enemies.map(enemy => ({ ...enemy })),
  } : {
    version: 2,
    strength: player.sila + (encounter.swordBonus?.[options.swordId] || 0) + (options.potion ? 5 : 0),
    endurance: player.izd,
    startingEndurance: player.izd,
    rounds: 0, killed: 0,
    enemies: (encounter.enemies || []).map((enemy, index) => ({
      ...enemy, index, remaining: options.removed?.includes(index) ? 0 : enemy.izd,
    })),
  };
  const events = [];
  const finish = outcome => ({ outcome, state, events, finalPlayerIzd: state.endurance });
  const outcome = () => {
    if (state.endurance <= 0) return 'loss';
    if (encounter.stopAfterLoss && state.startingEndurance - state.endurance >= encounter.stopAfterLoss) return 'loss';
    if (encounter.stopAt && state.endurance <= encounter.stopAt) return 'loss';
    if (!encounter.special && state.enemies.every(enemy => enemy.remaining <= 0)) return 'win';
    if (encounter.special === 'wolfpack' && state.killed >= 3) return 'win';
    return null;
  };
  if (!previous && encounter.special === 'knifeThrow' && options.magicKnife && state.endurance > 0) {
    events.push({ key: 'knife_magic', args: {} });
    return finish('win');
  }
  for (let count = 0; count < limit; count++) {
    const result = outcome();
    if (result) return finish(result);
    state.rounds++;
    if (encounter.special === 'knifeThrow') {
      let dice = roll(), total = state.strength + dice;
      if (total >= 10) {
        events.push({ key: 'knife_win', args: { roll: dice, total } });
        return finish('win');
      }
      events.push({ key: 'knife_miss', args: { roll: dice, total } });
      dice = roll(); total = encounter.enemySila + dice;
      events.push({ key: total >= 10 ? 'knife_enemy_hit' : 'knife_enemy_miss', args: { roll: dice, total } });
      if (total >= 10) { state.endurance = 0; return finish('loss'); }
      continue;
    }
    if (encounter.special === 'wolfpack') {
      const dice = roll(), total = state.strength + dice;
      if (total >= 10) {
        state.killed++;
        events.push({ key: 'wolf_hit', args: { roll: dice, total, killed: state.killed } });
      } else {
        state.endurance = Math.max(0, state.endurance - 3);
        events.push({ key: 'wolf_miss', args: { roll: dice, total, izd: state.endurance } });
      }
      continue;
    }
    const selected = state.enemies.find(enemy => enemy.index === options.target && enemy.remaining > 0);
    const opponents = encounter.chooseTarget ? [selected || state.enemies.find(enemy => enemy.remaining > 0)] : state.enemies;
    for (const enemy of opponents) {
      if (enemy.remaining <= 0) continue;
      const dice = roll(), total = state.strength + dice, damage = encounter.hitAmount ?? 2;
      const args = { nameKey: enemy.nameKey, roll: dice, total, esila: enemy.sila };
      if (total > enemy.sila) {
        enemy.remaining = Math.max(0, enemy.remaining - damage);
        events.push({ key: 'round_win', args: { ...args, loss: damage, izd: enemy.remaining } });
      } else if (total < enemy.sila) {
        state.endurance = Math.max(0, state.endurance - damage);
        events.push({ key: 'round_lose', args: { ...args, loss: damage, izd: state.endurance } });
      } else {
        const playerLoss = encounter.tiePlayer ?? (encounter.tieBoth2 ? 2 : 1);
        const enemyLoss = encounter.tieEnemy ?? playerLoss;
        state.endurance = Math.max(0, state.endurance - playerLoss);
        enemy.remaining = Math.max(0, enemy.remaining - enemyLoss);
        events.push({ key: 'round_tie_checked', args: { ...args, playerLoss, enemyLoss, pizd: state.endurance, eizd: enemy.remaining } });
      }
      const result = outcome();
      if (result) return finish(result);
    }
    if (encounter.chooseTarget) return finish('pending');
  }
  return finish(outcome() || 'pending');
}

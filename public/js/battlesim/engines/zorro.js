const number = value => Math.max(0, Number(value) || 0);

export function startZorroFight(player, encounter, removed = 0, priorDamage = 0) {
  const p = Object.fromEntries(Object.entries(player).map(([key, value]) => [key, number(value)]));
  const enemies = (encounter.enemies || [encounter.enemy]).map(enemy => ({ ...enemy, life: enemy.zhivot }));
  const count = Math.min(enemies.length - 1, Math.max(0, Math.floor(number(removed))));
  enemies.splice(enemies.length - count, count);
  if (encounter.id === 'rosario') enemies[0].life = Math.max(0, enemies[0].life - priorDamage);
  return {
    player: p, enemies, type: encounter.type, encounterId: encounter.id,
    playerLife: p.zhivot, initialLife: p.zhivot, nextEnemy: 0, rounds: 0,
    playerDamage: encounter.extraDamageBonus || 0,
    enemyDamage: encounter.enemyDamageBonus || 0,
    retreatLoss: encounter.retreatLoss || 0,
    turn: null, playerInterrupts: Math.max(0, p.trikove - (encounter.enemy?.trikove || 0)),
    enemyInterrupts: Math.max(0, (encounter.enemy?.trikove || 0) - p.trikove),
    outcome: null,
  };
}

export function advanceZorroFight(previous, roll, interrupt = false, budget = 128) {
  const state = JSON.parse(JSON.stringify(previous));
  const events = [];
  const die = () => {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('Invalid chance roll');
    return value;
  };
  function finish() {
    if (state.playerLife <= 0) state.outcome = 'loss';
    else if (state.enemies.every(enemy => enemy.life <= 0)) state.outcome = 'win';
    else if (state.retreatLoss && state.initialLife - state.playerLife >= state.retreatLoss) state.outcome = 'retreat';
    state.playerLife = Math.max(0, state.playerLife);
    return Boolean(state.outcome);
  }
  if (state.outcome || finish()) return { state, events };
  if (state.type !== 'duel') {
    const sword = state.type === 'shpagi';
    const skill = sword ? 'fehtovka' : 'rb';
    const strength = actor => number(actor.sila) + (sword ? number(actor.barzina) + number(actor.srachnost) : 0);
    for (let step = 0; step < budget && !state.outcome; step++) {
      const index = state.nextEnemy;
      state.nextEnemy = (index + 1) % state.enemies.length;
      if (index === 0) state.rounds++;
      const enemy = state.enemies[index];
      if (enemy.life <= 0) continue;
      const p = die(), e = die();
      const comparison = p + number(state.player[skill]) - e - number(enemy[skill]);
      if (comparison > 0) {
        const damage = Math.max(0, p + strength(state.player) + state.playerDamage - number(enemy.izdr));
        enemy.life = Math.max(0, enemy.life - damage);
        events.push({ kind: 'hit_win', name: enemy.nameKey, dmg: damage, izd: enemy.life });
      } else if (comparison < 0) {
        const damage = Math.max(0, e + strength(enemy) + state.enemyDamage - number(state.player.izdr));
        state.playerLife -= damage;
        events.push({ kind: 'hit_lose', name: enemy.nameKey, dmg: damage, izd: Math.max(0, state.playerLife) });
      } else events.push({ kind: 'hit_tie', name: enemy.nameKey });
      finish();
    }
    return { state, events };
  }
  const enemy = state.enemies[0];
  if (state.turn === null) {
    if (state.player.fint !== enemy.fint) state.turn = state.player.fint > enemy.fint;
    else {
      for (let attempt = 0; attempt < budget && state.turn === null; attempt++) {
        const p = die(), e = die();
        if (p !== e) state.turn = p > e;
      }
      if (state.turn === null) return { state, events };
    }
    events.push({ kind: 'duel_first', player: state.turn, name: enemy.nameKey });
  }
  let choice = interrupt;
  for (let step = 0; step < budget && !state.outcome; step++) {
    const attacker = state.turn ? state.player : enemy;
    const strongest = Math.max(number(attacker.pronizvasht), number(attacker.sechasht));
    const weakest = Math.min(number(attacker.pronizvasht), number(attacker.sechasht));
    let length = 3;
    if (state.turn && state.enemyInterrupts > 0) { length = 1; state.enemyInterrupts--; }
    if (!state.turn && state.playerInterrupts > 0 && choice) { length = 1; state.playerInterrupts--; }
    choice = false;
    for (const skill of (length === 1 ? [strongest] : [strongest, strongest, weakest])) {
      const damage = Math.max(0, skill + die() - number(state.turn ? enemy.blok : state.player.blok));
      if (state.turn) enemy.life = Math.max(0, enemy.life - damage);
      else state.playerLife -= damage;
      events.push({ kind: 'duel_hit', player: state.turn, name: enemy.nameKey, dmg: damage, izd: Math.max(0, state.turn ? enemy.life : state.playerLife) });
      if (finish()) break;
    }
    state.rounds++;
    state.turn = !state.turn;
    // Let the player decide whether to spend a Trick before the next enemy series.
    if (!state.outcome && !state.turn && state.playerInterrupts > 0) break;
  }
  return { state, events };
}

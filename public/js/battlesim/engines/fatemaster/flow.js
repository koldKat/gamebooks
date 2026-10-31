// Persist Fatemaster pending damage, rolls and turn transitions independently of the interface.
import {activeAttackers, conscious, integer} from './rules.js';

export function event(fight, type, values = {}) {
  fight.events.push({round: fight.round, type, ...values});
}

export function outcome(fight) {
  if (fight.status !== 'fighting') {
    fight.pending = null;
    fight.queue = [];
    fight.phase = 'finished';
    return fight.status;
  }
  if (!conscious(fight.player)) {
    fight.status = 'loss';
  } else if (fight.rules.stopBelow && fight.opponents.some(enemy =>
    enemy.strength < fight.rules.stopBelow && enemy.agility < fight.rules.stopBelow)) {
    fight.status = 'paused';
    fight.pauseReason = 'opponent-threshold';
  } else if (fight.rules.stopRemaining && !fight.casting && fight.opponents.filter(enemy => conscious(enemy)
      && !['asleep', 'helpless'].includes(enemy.condition)).length === fight.rules.stopRemaining) {
    fight.status = 'paused';
    fight.pauseReason = 'remaining-opponents';
  } else if (fight.opponents.every(enemy => !conscious(enemy) || ['asleep', 'helpless'].includes(enemy.condition))
      && !fight.flameRoundPending
      && fight.pending?.check !== 'weapon-break' && !fight.queue.some(task => task.check === 'weapon-break')) {
    fight.status = 'win';
  }
  if (fight.status !== 'fighting') {
    fight.pending = null;
    fight.queue = [];
    fight.phase = 'finished';
  }
  return fight.status;
}

export function enemyTurnTasks(fight) {
  if (fight.rules.response === 'drain') {
    const enemy = fight.opponents.find(conscious);
    return enemy ? [{kind: 'drain', enemyId: enemy.id}] : [];
  }
  if (['miss-bolt', 'flame'].includes(fight.rules.response)) return [];
  return activeAttackers(fight).map(enemy => ({kind: 'enemy', enemyId: enemy.id}));
}

export function queueEnemyTurn(fight) {
  fight.queue.push(...enemyTurnTasks(fight), {kind: 'round-end'});
}

export function pump(fight) {
  while (outcome(fight) === 'fighting' && !fight.pending && fight.queue.length) {
    const task = fight.queue.shift();
    if (task.kind === 'round-end') {
      fight.round++;
      fight.phase = 'player';
    } else if (task.kind === 'flame-round-end') {
      fight.flameRoundPending = false;
    } else if (task.kind === 'finish') {
      fight.status = task.status;
      fight.pauseReason = task.reason ?? null;
      fight.phase = 'finished';
      fight.queue = [];
    } else if (task.kind === 'drain') {
      const enemy = fight.opponents.find(enemy => enemy.id === task.enemyId);
      if (enemy && conscious(enemy)) {
        fight.pending = {kind: 'damage', amount: enemy.strength, source: 'drain', enemyId: enemy.id};
        event(fight, 'drain', {enemyId: enemy.id, amount: enemy.strength});
      }
    } else if (task.kind === 'enemy') {
      const enemy = fight.opponents.find(enemy => enemy.id === task.enemyId);
      if (enemy && conscious(enemy) && enemy.condition === 'active') fight.pending = task;
    } else if (task.kind === 'damage') {
      if (task.amount > 0) fight.pending = task;
    } else if (['check', 'hostile-save', 'hostile-damage', 'spell-resolve', 'opening-hit', 'flame-round'].includes(task.kind)) {
      fight.pending = task;
    } else {
      throw new Error('Unsupported combat task');
    }
  }
  if (fight.pending) fight.phase = 'pending';
  else if (fight.status === 'fighting' && !fight.queue.length) fight.phase = 'player';
  return fight;
}

export function beginAction(original, pendingKind) {
  if (!original || original.rulesVersion !== 1 || original.status !== 'fighting') throw new Error('No active Fatemaster encounter');
  if (pendingKind) {
    if (original.pending?.kind !== pendingKind) throw new Error('Resolve the current combat choice first');
  } else if (original.pending || original.queue.length || original.phase !== 'player') {
    throw new Error('Wait for the player turn');
  }
  return structuredClone(original);
}

export function applyPlayerDamage(fight, pool) {
  const pending = fight.pending;
  if (!['strength', 'agility'].includes(pool) || (pending.pool && pool !== pending.pool)) throw new Error('Invalid damage pool');
  integer(pending.amount, 'pending damage');
  fight.player[pool] = Math.max(0, fight.player[pool] - pending.amount);
  event(fight, 'player-damage', {pool, amount: pending.amount, source: pending.source, enemyId: pending.enemyId});
  if (fight.casting && pending.amount > 0) fight.casting.interrupted = true;
  fight.pending = null;
  if (pending.poison && conscious(fight.player)) fight.queue.unshift({kind: 'check', check: 'poison', ...pending.poison});
  return pump(fight);
}

import { createFireWolfFight, rollFireWolfAttack, checkFireWolfOutcome } from './fire-wolf.js';

export function createFireWolfManualGroup(prepared) {
  if (!prepared.encounter.manualGroup || !prepared.enemies.length) throw new Error('Not a manual group encounter');
  const fight = createFireWolfFight(prepared.player, prepared.enemies[0], {
    ...prepared.options, skillReward: Number(prepared.encounter.section) === 4 ? 2 : 1,
  });
  fight.enemies = structuredClone(prepared.enemies);
  fight.enemy = fight.enemies[0];
  fight.manualGroup = true;
  fight.manualRound = 0;
  fight.bleedingEnemy = prepared.encounter.bleeding ? 0 : null;
  return fight;
}

// The book does not define group initiative or attack order; the player selects each turn.
export function rollFireWolfManualAttack(fight, side, target, random = Math.random) {
  if (!fight.manualGroup || fight.outcome || fight.pending || !['player', 'enemy'].includes(side)) return null;
  if (side === 'enemy' && fight.freePlayerAttacks > 0) return null;
  const enemy = fight.enemies[target];
  if (!Number.isInteger(target) || !enemy || enemy.lifePoints <= 0) return null;
  if (side === 'enemy' && enemy.paralysed) return null;
  fight.enemy = enemy;
  fight.turn = side;
  return rollFireWolfAttack(fight, random);
}

export function advanceFireWolfManualRound(fight) {
  if (!fight.manualGroup || fight.outcome || fight.pending) return false;
  fight.manualRound += 1;
  if (fight.blindedEnemyRounds > 0) fight.blindedEnemyRounds -= 1;
  if (fight.bleedingEnemy !== null) {
    const enemy = fight.enemies[fight.bleedingEnemy];
    if (enemy.lifePoints > 0) enemy.lifePoints -= 10;
  }
  checkFireWolfOutcome(fight);
  return true;
}

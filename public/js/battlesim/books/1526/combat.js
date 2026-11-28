import { combatInteger, rollSix } from '../../engines/two-fisted/dice.js';

export function rollStartingStats(roll) {
  return {
    elan: 6 + Math.ceil(rollSix(roll) / 2),
    effort: 10 * (rollSix(roll) + rollSix(roll)),
    fists: 2,
  };
}

function rollDice(count, shouldReroll, roll) {
  return Array.from({ length: count }, () => {
    const initial = rollSix(roll);
    const rerolled = shouldReroll(initial);
    return { initial, result: rerolled ? rollSix(roll) : initial, rerolled };
  });
}

export function rollAttempt({
  player, enemies, target, effort, simultaneous, rerollHigh = false, rerollEnemyOnes = false,
}, roll) {
  const remainingEffort = combatInteger(player.effort, 1);
  const effectiveElan = combatInteger(player.effectiveElan);
  const fists = combatInteger(player.fists, 1, 20);
  combatInteger(effort, 0, Math.min(remainingEffort, effectiveElan));
  const active = enemies.map((enemy, index) => ({ ...enemy, index })).filter(enemy => enemy.toughness > 0);
  const group = simultaneous && active.length > 1;
  const targeted = active.find(enemy => enemy.index === target);
  if (!targeted) throw new RangeError('Choose an active opponent');
  const opponents = group ? [targeted, ...active.filter(enemy => enemy.index !== target)] : [targeted];
  return {
    effort,
    remainingEffort: remainingEffort - effort,
    group,
    target,
    dice: rollDice(fists, die => (group || rerollHigh) && die >= 4, roll),
    opponents: opponents.map(enemy => {
      const dice = rollDice(combatInteger(enemy.fists, 0, 20), die => rerollEnemyOnes && group && die === 1, roll);
      return {
        index: enemy.index,
        dice,
        total: combatInteger(enemy.difficulty) + Math.max(0, ...dice.map(die => die.result)),
      };
    }),
  };
}

export function resolveAttempt(attempt, dieIndex, damage = 1, fistModifier = 0) {
  combatInteger(dieIndex, 0, attempt.dice.length - 1);
  combatInteger(damage, 1);
  const score = attempt.effort + attempt.dice[dieIndex].result + fistModifier;
  const comparisons = attempt.opponents.map(opponent => ({
    ...opponent,
    overcome: score > opponent.total,
    target: opponent.index === attempt.target,
  }));
  return {
    score,
    comparisons,
    targetDamage: comparisons[0].overcome ? damage : 0,
    remainingEffort: attempt.remainingEffort,
  };
}

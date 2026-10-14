import { legendaryAutomaticDamage } from './encounter.js';

export function legendaryPlayerReactions(fight, memberIndex, targetIndex, damage) {
  const enemy = fight.enemies[targetIndex];
  const actions = [];
  if (enemy.retaliationDamage && damage > 0) actions.push({ enemyIndex: targetIndex,
    hits: enemy.retaliationDamage, forcedMember: memberIndex });
  if (enemy.counterattack && enemy.health > 0) actions.push({ enemyIndex: targetIndex,
    count: enemy.attack, threshold: enemy.threshold, forcedMember: memberIndex,
    turnPenalty: enemy.nextTurnPenalty ?? 0, automaticDamage: legendaryAutomaticDamage(fight, targetIndex) });
  for (const [index, trigger] of (fight.rules.thresholdReactions ?? []).entries()) {
    if (fight.triggeredReactions?.includes(index) || fight.enemies[trigger.enemyIndex].health === 0) continue;
    const reached = trigger.checks.some(check => check.below !== undefined ?
      fight.enemies[check.index].health < check.below : fight.enemies[check.index].health <= check.atMost);
    if (!reached) continue;
    (fight.triggeredReactions ??= []).push(index);
    for (let recipient = 0; recipient < trigger.recipients; recipient++) actions.push({
      enemyIndex: trigger.enemyIndex, hits: trigger.hits, noArmour: !!trigger.noArmour,
      distinctGroup: 'threshold-' + index, requiredRecipients: trigger.recipients });
    fight.log = [...fight.log.slice(-59), { type: 'thresholdReaction', round: fight.round, trigger: index }];
  }
  return actions;
}

export function queueLegendaryReactions(fight, actions) {
  if (!actions.length) return false;
  if (fight.phase !== 'player' || fight.reactionResume || fight.pending)
    throw new RangeError('Resolve the current action before another reaction');
  fight.reactionResume = { enemyCursor: fight.enemyCursor, enemyActions: fight.enemyActions,
    enemyRecipients: fight.enemyRecipients, enemyRecipientGroups: fight.enemyRecipientGroups };
  fight.phase = 'enemy';
  fight.enemyActions = actions;
  fight.enemyCursor = fight.enemies.length;
  fight.enemyRecipients = {};
  fight.enemyRecipientGroups = {};
  return true;
}

export function resumeLegendaryPlayer(fight) {
  if (!fight.reactionResume || fight.enemyActions.length || fight.pending) return false;
  Object.assign(fight, fight.reactionResume);
  delete fight.reactionResume;
  fight.phase = 'player';
  return true;
}

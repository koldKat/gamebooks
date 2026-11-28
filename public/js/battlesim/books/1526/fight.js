import { combatInteger, rollSix } from '../../engines/two-fisted/dice.js';
import { resolveAttempt, rollAttempt } from './combat.js';

function applyLoss(fight, resource, amount) {
  const loss = Math.min(fight.player[resource], amount);
  fight.player[resource] -= loss;
  if (loss) fight.events.push({ resource, loss });
}

export function startFight(stats, opponents, rules, options = {}) {
  const player = {
    elan: combatInteger(stats.elan, 1),
    effort: combatInteger(stats.effort, 1),
    fists: combatInteger(stats.fists, 1, 20),
    guards: combatInteger(stats.guards ?? 0),
    elanModifier: combatInteger(stats.elanModifier ?? 0, -100, 100),
    hitDamage: combatInteger(stats.hitDamage ?? 1, 1, 20),
    temporaryElanLoss: 0,
  };
  const problems = combatInteger(options.problems ?? 0, 0, 100);
  const droppedItems = combatInteger(options.droppedItems ?? 0, 0, 100);
  const enemies = opponents.map((opponent, slot) => {
    const traits = rules.enemies?.[slot] ?? {};
    let difficulty = combatInteger(opponent.difficulty);
    let fists = combatInteger(opponent.fists, 0, 20);
    let toughness = combatInteger(opponent.toughness, 1);
    switch (rules.condition) {
      case 'problems':
        difficulty += problems;
        toughness += problems;
        break;
      case 'wormGear':
        if (options.blade) difficulty -= 2;
        if (options.ring) toughness--;
        break;
      case 'mirror':
        difficulty = player.elan;
        fists = player.fists;
        break;
      case 'droppedItems':
        difficulty -= droppedItems;
        break;
    }
    return {
      ...traits, name: opponent.name,
      difficulty: Math.max(0, difficulty), fists, toughness: Math.max(1, toughness),
    };
  });
  if (rules.condition === 'skeletonFriend' && options.skeletonFriend) enemies.splice(1);
  const mode = rules.condition === 'ring' && options.ring ? 'ordered' : rules.mode ?? 'single';
  return {
    player, enemies, rules, mode, options, turn: 0, pending: null, events: [],
    outcome: null, section: null, groupAfterMiss: false, footFreed: false,
  };
}

export function attackOptions(fight) {
  const { enemies, mode, player, rules, options } = fight;
  const alive = enemies.flatMap((enemy, index) => enemy.toughness > 0 ? [index] : []);
  const guardsAbsent = mode === 'guards' && player.guards <= (rules.guardThreshold ?? 0);
  const simultaneous = mode === 'group' || guardsAbsent;
  const targets = simultaneous || mode === 'freeTarget' ? alive : alive.slice(0, 1);
  const basePenalty = rules.condition === 'inWater' && !options.inWater ? 0 : rules.elanPenalty ?? 0;
  const activePenalty = alive.reduce((sum, index) => sum + (enemies[index].elanWhileActive ?? 0), 0);
  const footPenalty = rules.footTrapped && !fight.footFreed ? 2 : 0;
  const effectiveElan = Math.max(0,
    player.elan + player.elanModifier - player.temporaryElanLoss - basePenalty - activePenalty - footPenalty);
  const fists = Math.max(rules.minimumFists ?? 0, player.fists + (rules.playerFists ?? 0));
  return {
    targets, simultaneous, fists, effectiveElan,
    maxEffort: Math.min(effectiveElan, Math.max(0, player.effort - (rules.effortOnSpend ?? 0))),
  };
}

export function beginAttempt(fight, target, effort, roll) {
  if (fight.pending || fight.outcome) throw new RangeError('Resolve the current fight first');
  const { rules, player, enemies, turn } = fight;
  const { targets, simultaneous, effectiveElan, fists, maxEffort } = attackOptions(fight);
  combatInteger(effort, 0, maxEffort);
  if (!targets.includes(target)) throw new RangeError('Choose an eligible opponent');
  const activeEnemies = enemies.map(enemy => ({
    ...enemy,
    difficulty: enemy.guardDefense
      ? Math.max(8, enemy.difficulty - player.guards)
      : turn === 0 ? rules.firstDifficulty ?? enemy.difficulty : enemy.difficulty,
    fists: enemy.fists + (turn === 0 ? rules.firstFists ?? 0 : 0),
  }));
  fight.pending = rollAttempt({
    player: { ...player, effectiveElan, fists }, enemies: activeEnemies, target, effort, simultaneous,
    rerollHigh: rules.rerollHigh || fight.groupAfterMiss || (simultaneous && fight.mode === 'guards'),
    rerollEnemyOnes: rules.rerollEnemyOnes,
  }, roll);
  fight.events = [];
  applyLoss(fight, 'effort', effort + (effort > 0 ? rules.effortOnSpend ?? 0 : 0));
  return fight.pending;
}

function finish(fight, outcome, section = null) {
  fight.outcome = outcome;
  fight.section = section;
}

function onMiss(fight, enemy, comparison, roll) {
  const effect = enemy.onMiss ?? fight.rules.onMiss;
  const highest = Math.max(0, ...comparison.dice.map(die => die.result));
  switch (effect) {
    case 'loseImmediately':
      finish(fight, 'loss', enemy.lossSection ?? fight.rules.lossSection);
      break;
    case 'elfBastard':
      finish(fight, 'loss', fight.player.guards ? 759 : 831);
      break;
    case 'hardmodWeaken':
      if (highest >= 4) enemy.fists = Math.max(0, enemy.fists - 1);
      applyLoss(fight, 'effort', highest);
      break;
    case 'hardmod':
      applyLoss(fight, 'effort', highest);
      break;
    case 'effort10':
      applyLoss(fight, 'effort', 10);
      break;
    case 'leech': {
      const amount = rollSix(roll);
      applyLoss(fight, 'effort', amount);
      fight.events.push({ reward: 'Leech Fangs', amount });
      break;
    }
    case 'guardOrElan':
      applyLoss(fight, fight.player.guards ? 'guards' : 'elan', 1);
      break;
    case 'loseGuard':
      applyLoss(fight, 'guards', 1);
      break;
    case 'shambler':
      fight.player.temporaryElanLoss++;
      fight.events.push({ resource: 'elan', loss: 1 });
      break;
    case 'elan':
      applyLoss(fight, 'elan', 1);
      break;
    case 'reinforce':
      enemy.toughness++;
      break;
    case 'breakItem':
    case 'corrosion':
    case 'food':
      fight.events.push({ inventory: effect });
      break;
  }
}

export function completeAttempt(fight, dieIndex, roll) {
  if (!fight.pending || fight.outcome) throw new RangeError('Roll an attempt first');
  const { rules, player, enemies, pending } = fight;
  const result = resolveAttempt(pending, dieIndex, player.hitDamage, rules.fistRollModifier ?? 0);
  const target = enemies[pending.target];
  fight.pending = null;
  fight.turn++;
  fight.events.push({ round: fight.turn, score: result.score, comparisons: result.comparisons.map(comparison => ({
    name: enemies[comparison.index].name, total: comparison.total, success: comparison.overcome, target: comparison.target,
  })) });
  for (const enemy of enemies) {
    if (enemy.toughness > 0 && enemy.effortPerRound) applyLoss(fight, 'effort', enemy.effortPerRound);
  }
  for (const comparison of result.comparisons) {
    const enemy = enemies[comparison.index];
    if (rules.onRoll === 'smiting') applyLoss(fight, 'effort', 5 * comparison.dice.filter(die => die.result === 6).length);
    if (!comparison.overcome) onMiss(fight, enemy, comparison, roll);
  }
  if (result.targetDamage > 0) {
    const damage = Math.min(target.toughness, result.targetDamage);
    const weaken = rules.weakensAtOne && target.toughness > 1 && target.toughness - damage === 1;
    target.toughness -= damage;
    target.fists = Math.max(0, target.fists + damage * (rules.fistsOnHit ?? 0) + (weaken ? rules.fistsOnWeaken ?? 0 : 0));
    target.difficulty = Math.max(0, target.difficulty + damage * (rules.difficultyOnHit ?? 0) + (weaken ? rules.difficultyOnWeaken ?? 0 : 0));
    if (target.hitReward) fight.events.push({ reward: target.hitReward, amount: 1 });
    if (!target.toughness && target.onDefeat === 'hedgehog') {
      applyLoss(fight, 'effort', Math.max(0, ...result.comparisons[0].dice.map(die => die.result)));
    }
    fight.footFreed = true;
  } else {
    if (rules.groupAfterMiss) fight.groupAfterMiss = true;
    if (fight.turn === 1) {
      target.difficulty += rules.firstMissDifficulty ?? 0;
      target.toughness += rules.firstMissToughness ?? 0;
      if (rules.firstMissSection) finish(fight, 'loss', rules.firstMissSection);
    }
  }
  if (rules.difficultyPerRound) target.difficulty = Math.max(0, target.difficulty + rules.difficultyPerRound);
  if (fight.outcome) return;
  if (!player.effort || player.elan <= player.temporaryElanLoss || !attackOptions(fight).fists) finish(fight, 'loss');
  else if (enemies.every(enemy => !enemy.toughness) || (rules.winOnFirstDefeat && !target.toughness)) finish(fight, 'win');
  else if (rules.limit && fight.turn >= rules.limit) finish(fight, rules.timeout ?? 'stopped', rules.timeoutSection);
}

export function concede(fight) {
  if (fight.outcome || fight.pending || fight.rules.noSurrender || fight.turn < (fight.rules.surrenderAfter ?? 0)) {
    throw new RangeError('Surrender is not available in this encounter');
  }
  finish(fight, 'loss', fight.rules.surrenderSection);
}

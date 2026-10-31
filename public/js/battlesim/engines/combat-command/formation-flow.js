// Advance saved formation attack, casualty and morale tasks without crossing into story decisions.
import { formationAttackStrength, formationCasualties, formationEngagedCount,
  formationMoraleResult } from './formation-rules.js';
import { formationSideUnits } from './formation-config.js';
import { combatCommandHits } from './core.js';

const opposite = side => side === 'player' ? 'enemy' : 'player';
const currentRound = fight => Math.max(1, fight.round);
const engaged = (fight, side, unit) => formationEngagedCount(unit, currentRound(fight), fight.config.engagements?.[side]?.[unit.key]);
const available = unit => unit.count > 0 && !unit.retired;

export function finishFormation(fight, status) {
  fight.status = status;
  fight.phase = 'finished';
  fight.pending = null;
  fight.queue = [];
  // A reference is displayed only. The reader never navigates as a combat side effect.
  fight.section = fight.config[status] == null ? null : String(fight.config[status]);
}

export function formationOutcome(fight) {
  if (fight.status !== 'fighting') return true;
  const config = fight.config;
  const defeated = (side, keys) => {
    const units = formationSideUnits(fight, side).filter(unit => !keys || keys.includes(unit.key));
    return units.length > 0 && units.every(unit => !available(unit));
  };
  if (defeated('player', config.defeatKeys)
      || fight.player.some(unit => config.loseIfRouted?.includes(unit.key) && unit.retired === 'routed')) {
    finishFormation(fight, 'loss');
  } else if (!config.reportOnly) {
    const goal = config.casualtyGoal;
    const goalReached = goal && goal.keys.reduce((sum, key) => {
      const original = formationSideUnits(fight.start, goal.side).find(unit => unit.key === key);
      const unit = formationSideUnits(fight, goal.side).find(unit => unit.key === key);
      return sum + original.count - unit.count;
    }, 0) >= goal.losses;
    if (goalReached || !config.escapeAtStart && defeated('enemy', config.victoryKeys)) finishFormation(fight, 'win');
  }
  return fight.status !== 'fighting';
}

function actorsFor(fight, attack) {
  const units = formationSideUnits(fight, attack.side);
  return (attack.actors ?? []).map(input => {
    const actor = structuredClone(input);
    actor.key = [actor.key, ...(actor.fallbackKeys ?? [])].find(key => {
      const unit = units.find(candidate => candidate.key === key);
      return unit && engaged(fight, attack.side, unit);
    }) ?? actor.key;
    if (typeof actor.countLimit === 'object') {
      const limit = actor.countLimit;
      const losses = limit.lossKeys.reduce((sum, key) => {
        if (!limit.cumulative) return sum + (fight.lossByRound[limit.lossRound]?.[attack.side]?.[key] ?? 0);
        const original = formationSideUnits(fight.start, attack.side).find(unit => unit.key === key);
        const current = units.find(unit => unit.key === key);
        return sum + original.count - current.count;
      }, 0);
      actor.countLimit = Math.max(0, limit.value - losses);
    }
    return actor;
  });
}

function attackTask(fight, attack) {
  const units = formationSideUnits(fight, attack.side), targetSide = opposite(attack.side);
  const actors = actorsFor(fight, attack);
  const activeActors = actors.some(actor => engaged(fight, attack.side, units.find(unit => unit.key === actor.key)));
  if (attack.actors && !activeActors) return null;
  const strength = attack.fixedStrength ?? formationAttackStrength(units, actors, currentRound(fight), fight.config.engagements?.[attack.side]);
  if (!strength) return null;
  let targets = (attack.targets ?? []).map(key => [key, ...(attack.targetFallbacks?.[key] ?? [])].find(candidate => {
    const unit = formationSideUnits(fight, targetSide).find(unit => unit.key === candidate);
    return unit && engaged(fight, targetSide, unit);
  })).filter(Boolean);
  targets = [...new Set(targets)];
  if (attack.targetSelection === 'first') targets = targets.slice(0, 1);
  if (!targets.length && !attack.reportHitsOnly) return null;
  return {kind:'attack',dice:2,attack:structuredClone(attack),strength,targets,
    label:attack.label ?? (attack.side === 'player' ? 'Your formation attack' : 'Enemy formation attack')};
}

export function formationNext(fight) {
  while (!formationOutcome(fight) && fight.queue.length) {
    const task = fight.queue.shift();
    if (task.kind === 'opening-end') {fight.phase = 'ready';fight.pending = null;return;}
    if (task.kind === 'round-end') {
      if (fight.config.roundLimit !== undefined && fight.round >= fight.config.roundLimit) finishFormation(fight, 'paused');
      else {fight.phase = 'ready';fight.pending = null;}
      return;
    }
    if (task.kind === 'attack') {
      const pending = attackTask(fight, task.attack);
      if (!pending) continue;
      fight.pending = pending;
    } else if (task.kind === 'morale') {
      const unit = formationSideUnits(fight, task.side).find(candidate => candidate.key === task.key);
      if (!unit || !available(unit)) continue;
      fight.pending = {...task,dice:2,morale:unit.morale,label:unit.name + ': morale check'};
    } else throw new RangeError('Unknown formation task');
    fight.phase = 'roll';
    return;
  }
  if (fight.status === 'fighting' && !fight.pending) fight.phase = 'ready';
}

function recordCasualties(fight, side, result, event) {
  if (side === 'player') fight.player = result.units;
  else fight.enemies = result.units;
  event.losses = result.losses;
  event.applied = result.applied;
  event.excessHits = result.unallocated;
  if (fight.trackedLossRounds.includes(fight.round)) {
    const round = fight.lossByRound[fight.round] ??= {};
    const units = round[side] ??= {};
    for (const loss of result.losses) units[loss.key] = (units[loss.key] ?? 0) + loss.count;
  }
}

export function applyFormationAttack(fight, task, attackIndex, allocation) {
  const side = opposite(task.attack.side), event = fight.history.at(-1).attacks[attackIndex];
  if (!event || event.applied !== undefined) throw new RangeError('Attack has already been applied');
  let result;
  if (task.attack.reportHitsOnly) result = {units:formationSideUnits(fight, side),losses:[],checks:[],applied:0,unallocated:event.hits};
  else {
    try {
      result = formationCasualties(formationSideUnits(fight, side), event.hits, {
        targets:task.targets,mode:task.attack.casualties ?? 'manual',allocation,
        round:currentRound(fight),engagements:fight.config.engagements?.[side],
      });
    } catch (error) {
      if (error.code !== 'FORMATION_ALLOCATION_REQUIRED' || allocation !== undefined) throw error;
      fight.pending = {kind:'allocation',side,attackIndex,task:structuredClone(task),hits:event.hits,targets:task.targets,message:error.message};
      fight.phase = 'allocation';
      return;
    }
  }
  recordCasualties(fight, side, result, event);
  const checks = new Map(result.checks.map(check => [check.key, {...check,side}]));
  if (task.attack.moralePenalty) {
    const penalty = task.attack.moralePenalty, unit = result.units.find(candidate => candidate.key === penalty.key);
    if (unit && available(unit)) {
      unit.morale = Math.max(0, unit.morale - penalty.amount);
      event.moralePenalty = {...penalty};
      checks.set(unit.key,{kind:'morale',side,key:unit.key});
    }
  }
  for (const key of task.attack.alwaysCheckMorale ?? []) {
    const unit = result.units.find(candidate => candidate.key === key);
    if (unit && available(unit)) checks.set(key,{kind:'morale',side,key});
  }
  fight.queue.unshift(...checks.values());
  fight.pending = null;
  formationNext(fight);
}

export function resolveFormationTask(fight, task, result) {
  if (task.kind === 'morale') {
    const check = formationMoraleResult(formationSideUnits(fight, task.side), task.key, result.total);
    if (task.side === 'player') fight.player = check.units;
    else fight.enemies = check.units;
    fight.history.at(-1).checks.push({kind:'morale',side:task.side,key:task.key,morale:task.morale,...result,passed:check.passed});
    formationNext(fight);
    return;
  }
  if (task.kind !== 'attack') throw new RangeError('No dice roll pending');
  const hits = combatCommandHits(fight.charts, task.attack.chart, Math.min(1000000,task.strength), result.total);
  const event = {side:task.attack.side,label:task.label,strength:task.strength,chart:task.attack.chart,...result,hits,losses:[]};
  const attacks = fight.history.at(-1).attacks;
  attacks.push(event);
  applyFormationAttack(fight, task, attacks.length - 1);
}

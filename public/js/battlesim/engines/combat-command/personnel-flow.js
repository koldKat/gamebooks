// Advance queued combat phases until the next explicit dice roll or round boundary.
import { personnelCopy, personnelDamage, personnelFinish, personnelInteger, personnelLiving,
  personnelOutcome } from './personnel-rules.js';
import { personnelAttackInfo, personnelResolveAttack, personnelResolveHitSave } from './personnel-attacks.js';

export function personnelEscapeAllowed(fight, duringPlayerTurn = false) {
  if (fight.status !== 'fighting' || fight.melee || fight.config.rules.meleeOnly) return false;
  const rules = fight.config.rules, escape = rules.escape;
  if (rules.openingEscapeChoice) return Boolean(fight.setup.raidersEligible
    && fight.openingRemaining === 0 && fight.enemyReplies === 0);
  if (!escape || fight.escapeAttemptRound === fight.round) return false;
  if (duringPlayerTurn && escape.window !== 'after-player') return false;
  if (fight.round < (escape.afterRound ?? (escape.window === 'after-player' ? 1 : 0))) return false;
  if (escape.rounds && !escape.rounds.includes(fight.round)) return false;
  const enemyLosses = fight.startEnemies.reduce((sum, unit) => sum + (unit.initialCount ?? unit.count), 0)
    - fight.enemies.reduce((sum, unit) => sum + unit.count, 0);
  return enemyLosses >= (escape.enemyLosses ?? 0);
}

function endTasks(fight) {
  const rules = fight.config.rules, tasks = [];
  if (rules.enemyMorale && !(fight.melee && rules.enemyMorale.disabledByMelee)) {
    for (const unit of personnelLiving(fight.enemies)) tasks.push({ kind: 'enemy-morale', key: unit.key,
      dice: 2, label: unit.name + ': surrender check', rule: rules.enemyMorale });
  }
  const wave = fight.enemies.find(unit => unit.key === fight.roundOptions.enemyKey);
  if (rules.waves && !fight.roundOptions.opening && wave?.retire) {
    tasks.push({ kind: 'wave-morale', key: wave.key, dice: 2, label: wave.name + ': withdrawal check' });
  }
  if (fight.round === rules.playerMoraleRound) {
    tasks.push({ kind: 'player-morale', key: fight.player[0].key, dice: 2,
      label: 'Your force: first-round surrender check' });
  }
  for (const unit of personnelLiving(fight.player)) if (unit.lossMorale) {
    tasks.push({ kind: 'loss-morale', key: unit.key, dice: 2, label: unit.name + ': casualty morale check' });
  }
  tasks.push({ kind: 'round-finish' });
  return tasks;
}

function eligible(fight, task) {
  const rules = fight.config.rules;
  const unit = (task.kind === 'loss-morale' || task.kind === 'pre-morale' || task.kind === 'player-morale'
    ? fight.player : fight.enemies).find(u => u.key === task.key);
  if (task.kind === 'attack') return Boolean(personnelAttackInfo(fight, task)?.strength);
  if (['pre-morale', 'player-morale', 'loss-morale', 'enemy-morale', 'wave-morale', 'disruption'].includes(task.kind)
      && (!unit || !unit.count || unit.retired)) return false;
  if (task.kind === 'enemy-morale') {
    const start = fight.startEnemies.find(u => u.key === task.key), rule = task.rule;
    return fight.round >= (rule.fromRound ?? 0) && (rule.lossesOver === undefined || (start.initialCount ?? start.count) - unit.count > rule.lossesOver);
  }
  if (task.kind === 'wave-morale') return unit.count < unit.retire.belowCount;
  if (task.kind === 'loss-morale') {
    const start = fight.startPlayer.find(u => u.key === unit.key), rule = unit.lossMorale;
    return (start.initialCount ?? start.count) - unit.count > rule.lossesOver && (rule.frequency === 'each-round' || !unit.lossMoraleChecked);
  }
  if (task.kind === 'platform') return fight.platformsDestroyed < rules.platforms.maximum
    && personnelLiving(fight.player).some(u => u.ordnance > rules.platforms.ordnanceOver);
  if (task.kind === 'escape') return personnelEscapeAllowed(fight, task.duringPlayerTurn);
  return true;
}

export function personnelNext(fight) {
  while (fight.status === 'fighting' && fight.queue.length) {
    const task = fight.queue.shift();
    if (task.kind === 'end') { fight.queue.unshift(...endTasks(fight)); continue; }
    if (task.kind === 'round-finish') {
      const rules = fight.config.rules;
      if (fight.roundOptions.opening) fight.openingRemaining--;
      else if (rules.waves) {
        const index = fight.enemies.findIndex(u => u.key === fight.roundOptions.enemyKey);
        fight.waveCursor = (index + 1) % fight.enemies.length;
      }
      const limit = rules.fixedAttack ? fight.attackLimit : rules.roundLimit;
      if (limit !== undefined && fight.round >= limit) personnelFinish(fight, rules.limitOutcome ?? 'survived');
      else { fight.phase = 'ready'; fight.pending = null; }
      continue;
    }
    if (task.kind === 'talk-finish') { personnelFinish(fight, 'talked'); continue; }
    if (!eligible(fight, task)) continue;
    fight.pending = task;
    fight.phase = 'roll';
    return;
  }
  if (fight.status === 'fighting' && !fight.pending) fight.phase = 'ready';
}

export function personnelResolveTask(fight, task, result) {
  const rules = fight.config.rules, event = fight.history.at(-1);
  if (task.kind === 'attack') { personnelResolveAttack(fight, task, result); return; }
  if (task.kind === 'hit-save') { personnelResolveHitSave(fight, task, result); return; }
  const check = { kind: task.kind, key: task.key ?? null, ...result };
  event.checks.push(check);
  const unit = fight.enemies.find(u => u.key === task.key);
  const friendly = fight.player.find(u => u.key === task.key);
  if (task.kind === 'opening-count') {
    fight.openingCount = result.total;
    fight.openingRemaining = rules.openingAttacks.includesFirstReply ? 0 : result.total;
    fight.enemyFreeRounds = rules.openingAttacks.includesFirstReply ? result.total - 1 : 0;
  } else if (task.kind === 'strike-count') fight.attackLimit = result.total;
  else if (task.kind === 'disruption') {
    check.passed = result.total >= unit.disruption.minimumRoll;
    if (check.passed) fight.roundOptions.ordnanceReduction = unit.disruption.ordnanceReduction;
  } else if (task.kind === 'pre-morale') {
    check.passed = result.total <= friendly.morale;
    if (!check.passed) fight.roundOptions.blocked.push(friendly.key);
  } else if (task.kind === 'player-morale') {
    check.passed = result.total <= friendly.morale;
    if (!check.passed) personnelFinish(fight, 'surrendered');
  } else if (task.kind === 'enemy-morale') {
    check.passed = task.rule.minimumRoll === undefined ? result.total <= unit.morale : result.total < task.rule.minimumRoll;
    if (!check.passed) { unit.retired = 'surrendered'; personnelOutcome(fight); }
  } else if (task.kind === 'wave-morale') {
    check.passed = result.total <= unit.morale;
    if (!check.passed) { unit.retired = 'fled'; personnelOutcome(fight); }
  } else if (task.kind === 'loss-morale') {
    friendly.lossMoraleChecked = true;
    check.passed = result.total <= friendly.morale;
    if (!check.passed) { friendly.retired = friendly.lossMorale.outcome; personnelOutcome(fight); }
  } else if (task.kind === 'searchlight') {
    check.passed = result.total >= rules.searchlight.minimumRoll;
    if (check.passed) fight.searchlightDestroyed = true;
  } else if (task.kind === 'vehicle-shot') {
    check.passed = result.total <= rules.vehicleShot.maximumRoll;
    if (check.passed) {
      const attack = { side: 'player', key: fight.player[0].key, target: task.target,
        kind: 'vehicle-shot', ...result, hits: rules.vehicleShot.hits, losses: [] };
      event.attacks.push(attack);
      personnelDamage(fight, 'enemy', attack.hits, attack);
    }
  } else if (task.kind === 'platform') {
    check.passed = result.total >= rules.platforms.minimumRoll;
    if (check.passed) {
      fight.platformsDestroyed++;
      for (const enemy of fight.enemies) enemy.ordnance = Math.max(0, enemy.ordnance - 1);
    }
  } else if (task.kind === 'escape') {
    fight.escapeAttemptRound = fight.round;
    check.passed = result.total <= fight.player[0].stealth;
    if (check.passed) personnelFinish(fight, 'escaped');
  } else throw new RangeError('Unknown combat check');
}

export function personnelAttackTask(side, key, target, fixed, attackKind) {
  return { kind: 'attack', dice: 2, side, key, target, fixed: fixed ? personnelCopy(fixed) : undefined,
    attackKind, label: (side === 'player' ? 'Your attack' : 'Enemy attack')
      + (attackKind ? ' · ' + attackKind : '') };
}

export function personnelQueueRound(fight, options) {
  const rules = fight.config.rules, opening = fight.openingRemaining > 0;
  const enemies = personnelLiving(fight.enemies);
  let enemy;
  if (rules.waves) {
    if (opening) {
      enemy = enemies.find(u => u.key === options.targetKey);
      if (!enemy) throw new RangeError('Choose the wave for the opening attacks');
      if (fight.openingTarget && fight.openingTarget !== enemy.key) throw new RangeError('Opening attacks must target the same wave');
      fight.openingTarget = enemy.key;
    } else {
      for (let offset = 0; offset < fight.enemies.length; offset++) {
        const candidate = fight.enemies[(fight.waveCursor + offset) % fight.enemies.length];
        if (candidate.count && !candidate.retired) { enemy = candidate; break; }
      }
    }
  } else enemy = enemies.find(u => u.key === options.targetKey) ?? (enemies.length === 1 ? enemies[0] : undefined);
  if (!rules.fixedAttack && !enemy) throw new RangeError('Choose a surviving opponent');
  fight.roundOptions = { ...personnelCopy(options), blocked: [], enemyKey: enemy?.key ?? null, opening,
    excluded: fight.continuingExclusion ?? 0 };
  const queue = [];
  if (options.talk) {
    if (!rules.talk || !enemy) throw new RangeError('Talking is unavailable in this encounter');
    queue.push(personnelAttackTask('enemy', enemy.key), { kind: 'talk-finish' });
    fight.queue = queue; return;
  }
  if (rules.fixedAttack) {
    queue.push(personnelAttackTask('enemy', undefined, undefined, rules.fixedAttack), { kind: 'end' });
    fight.queue = queue; return;
  }
  if (rules.preRoundMorale) for (const unit of personnelLiving(fight.player)) queue.push({ kind: 'pre-morale',
    key: unit.key, dice: 2, label: unit.name + ': permission to attack' });
  if (enemy.disruption && !opening) queue.push({ kind: 'disruption', key: enemy.key, dice: 2, label: enemy.name + ': power-weapon disruption' });
  const playerTasks = [], enemyTasks = [];
  if (options.tactic) {
    const rule = options.tactic === 'searchlight' ? rules.searchlight : options.tactic === 'vehicle-shot' ? rules.vehicleShot : null;
    if (!rule || fight.melee || rules.meleeOnly || options.tactic === 'searchlight' && fight.searchlightDestroyed) {
      throw new RangeError('This special shot is unavailable');
    }
    if (options.tactic === 'vehicle-shot' && !['round', 'continuing'].includes(options.exclusionDuration)) {
      throw new RangeError('Choose how long the printed firing exclusion lasts');
    }
    fight.roundOptions.excluded = rule.exclude;
    if (options.exclusionDuration === 'continuing') fight.continuingExclusion = rule.exclude;
    playerTasks.push({ kind: options.tactic, dice: 2, target: enemy.key,
      label: options.tactic === 'searchlight' ? 'Mies: shoot the searchlight' : 'Mies: shoot a floater' });
  }
  for (const unit of personnelLiving(fight.player)) {
    const target = options.targets?.[unit.key] ?? enemy.key;
    if (!enemies.some(u => u.key === target)) throw new RangeError('Choose a surviving target');
    playerTasks.push(personnelAttackTask('player', unit.key, target));
    if (options.charges?.includes(unit.key)) {
      if (fight.melee) throw new RangeError('Explosive attacks are unavailable in close combat');
      if (!unit.charges) throw new RangeError('No explosive charges remain');
      const charge = rules.charge ?? unit.chargeAttack;
      if (!charge) throw new RangeError('Enter the explosive charge’s Attack Strength and chart');
      playerTasks.push(personnelAttackTask('player', unit.key, target, charge, 'charge'));
    }
    if (unit.extraAttack && !fight.melee) playerTasks.push(personnelAttackTask('player', unit.key, target, unit.extraAttack, 'artillery'));
  }
  if (rules.platforms) playerTasks.push({ kind: 'platform', dice: 2, label: 'Attack a gun platform' });
  if (options.escapeAfterAttack) playerTasks.push({ kind: 'escape', duringPlayerTurn: true, dice: 2, label: 'Escape after firing' });
  const opposing = rules.waves ? [enemy] : enemies;
  for (const unit of opposing) enemyTasks.push(personnelAttackTask('enemy', unit.key));
  if (rules.enemyExtraAttack) enemyTasks.push(personnelAttackTask('enemy', enemy.key, undefined, rules.enemyExtraAttack, 'heavy weapons'));
  const playerFirst = personnelAtInitiative(rules, fight.round) === 'player';
  const canReply = !rules.playerOnly && !opening && fight.round > (rules.freePlayerRounds ?? 0)
    && fight.round > (fight.enemyFreeRounds ?? 0);
  queue.push(...(playerFirst ? [...playerTasks, ...(canReply ? enemyTasks : [])] : [...(canReply ? enemyTasks : []), ...playerTasks]), { kind: 'end' });
  fight.queue = queue;
}

function personnelAtInitiative(rules, round) {
  let initiative = rules.initiative ?? 'player';
  for (const [start, value] of Object.entries(rules.initiativeRounds ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    personnelInteger(Number(start), 1);
    if (!['player', 'enemy'].includes(value)) throw new RangeError('Invalid initiative');
    if (round >= Number(start)) initiative = value;
  }
  return initiative;
}

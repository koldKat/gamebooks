const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export function createFight(spec, player, setup = {}, roll = rollD6) {
  const fight = {
    spec: structuredClone(spec),
    player: { ...player },
    check: null,
    stage: 'ready',
    status: 'fighting',
    attempts: 0,
    successes: 0,
    crystalUsed: false,
    lostItems: 0,
  };
  if (spec.sequence === 'wardRoll') {
    fight.setupRoll = [roll(), roll()];
    fight.totalChecks = Math.max(0, fight.setupRoll[0] + fight.setupRoll[1] - 2 * player.ward);
  } else {
    fight.totalChecks = spec.checks.length;
  }
  if (spec.sequence === 'trap') {
    fight.otherSuccesses = Number(!!setup.dexPassed) + Number(!!setup.witPassed);
  }
  if (spec.sequence === 'alligator') {
    fight.hitAdjustment = setup.dexPassed ? 0 : -1;
  }
  if (fight.totalChecks === 0) {
    fight.stage = 'done';
    fight.status = 'skipped';
  }
  return fight;
}

export function currentCheck(fight) {
  const { spec, attempts, player } = fight;
  const step = spec.checks[Math.min(attempts, spec.checks.length - 1)];
  const threshold = spec.sequence === 'alligator' && player.starving ? 6 : step.threshold;
  return { ...step, threshold };
}

function consume(fight, item) {
  const { player } = fight;
  if (!player[item]) return false;
  if (typeof player[item] === 'boolean') player[item] = false;
  else player[item]--;
  if (player.pixiePowder) {
    player.vigor++;
    player.starving = false;
  }
  return true;
}

export function startCheck(fight, options = {}, roll = rollD6) {
  if (fight?.status !== 'fighting' || fight.stage !== 'ready') return;
  const { player, spec } = fight;
  const step = currentCheck(fight);
  const check = { step, threshold: step.threshold, dice: [], forcedResult: null, effects: [] };
  fight.check = check;
  fight.stage = 'rolled';
  const baseHit = Math.max(0, player.hit + (fight.hitAdjustment ?? 0));
  if (!baseHit && spec.sequence === 'alligator') {
    check.forcedResult = false;
    return check;
  }
  if (options.useSilver && spec.living && consume(fight, 'silverTongue')) {
    check.effects.push(options.witPassed ? 'silverWon' : 'silverFailed');
    if (options.witPassed) {
      check.forcedResult = true;
      return check;
    }
  }
  let hit = baseHit;
  if (options.useFiery && player.ward > 0 && consume(fight, 'fierySpirit')) {
    player.ward--;
    hit += 2;
    check.effects.push('fieryUsed');
    check.threshold = currentCheck(fight).threshold;
  }
  if (player.ranged) {
    check.rangedRoll = roll();
    if (check.rangedRoll <= player.dex) {
      check.threshold--;
      if (check.threshold <= 1) {
        check.forcedResult = true;
        return check;
      }
    }
  }
  check.dice = Array.from({ length: hit }, roll);
  return check;
}

export function canChangeDie(fight, kind, index) {
  if (fight?.status !== 'fighting' || fight.stage !== 'rolled' || !Number.isInteger(index)) return false;
  const { player, check } = fight;
  const value = check.dice[index];
  if (!value || check.forcedResult !== null) return false;
  switch (kind) {
    case 'weapon': return player.weapon && !check.weaponUsed && value < 6;
    case 'brassknuckles': return player.brassknuckles && player.vigor > 1 && value < 6;
    case 'crystal': return player.crystal && !fight.crystalUsed && value === 1;
    default: return false;
  }
}

export function changeDie(fight, kind, index, roll = rollD6) {
  if (!canChangeDie(fight, kind, index)) return false;
  const { player, check } = fight;
  if (kind === 'crystal') {
    check.dice[index] = roll();
    fight.crystalUsed = true;
  } else {
    check.dice[index]++;
    if (kind === 'weapon') check.weaponUsed = true;
    else player.vigor--;
  }
  check.effects.push(kind);
  return true;
}

function loseVigor(fight, value, fromLivingCreature) {
  const damage = value >= 3 && fromLivingCreature && fight.player.shield ? value - 1 : value;
  fight.player.vigor -= damage;
  return damage;
}

function resumeFight(fight) {
  if (fight.completedResult) {
    fight.status = fight.completedResult;
    fight.stage = 'done';
  } else {
    fight.stage = 'ready';
  }
}

export function availableRecovery(fight) {
  if (fight?.stage !== 'recovery') return [];
  const { player } = fight;
  return [
    player.gnomeFood > 0 && 'gnomeFood',
    player.soup && 'soup',
    player.cleanser > 0 && player.vigor + 1 + Number(player.pixiePowder) > 0 && 'cleanser',
  ].filter(Boolean);
}

export function resolveRecovery(fight, item) {
  if (fight?.stage !== 'recovery') return false;
  if (item === 'none') {
    fight.status = 'loss';
    fight.stage = 'done';
    return true;
  }
  if (!availableRecovery(fight).includes(item)) return false;
  consume(fight, item);
  if (item === 'gnomeFood') fight.player.vigor = Math.max(3, fight.player.vigor);
  else if (item === 'soup') {
    fight.player.vigor = Math.max(2, fight.player.vigor);
    fight.player.ward++;
  } else fight.player.vigor++;
  resumeFight(fight);
  return true;
}

export function finishCheck(fight, roll = rollD6) {
  if (fight?.status !== 'fighting' || fight.stage !== 'rolled') return;
  const { spec, check, player } = fight;
  const success = check.forcedResult ?? check.dice.some(die => die >= check.threshold);
  fight.attempts++;
  if (success) fight.successes++;
  const hitEffect = success ? check.step.winVigor : check.step.failVigor;
  let damage = 0;
  if (typeof hitEffect === 'number' && hitEffect >= 0) player.vigor += hitEffect;
  else if (typeof hitEffect === 'number') damage += loseVigor(fight, -hitEffect, spec.living);
  else if (hitEffect === 'die') damage += loseVigor(fight, roll(), spec.living);
  if (success && check.step.clearStarving) player.starving = false;
  if (!success && check.step.loseItem) fight.lostItems++;

  const required = spec.successesRequired;
  const isComplete = required ? fight.successes >= required : fight.attempts >= fight.totalChecks;
  if (isComplete) {
    if (spec.sequence === 'trap') {
      const total = fight.otherSuccesses + Number(success);
      damage += loseVigor(fight, spec.vigorByCombinedSuccesses[total], spec.living);
    }
    if (spec.finalDamage) damage += loseVigor(fight, spec.finalDamage, spec.living);
    fight.completedResult = success || spec.survivalWins ? 'win' : 'loss';
  }

  const fatal = !success && check.step.fatal;
  if (fatal || player.vigor <= 0) {
    fight.stage = 'recovery';
    if (fatal || !availableRecovery(fight).length) resolveRecovery(fight, 'none');
  } else {
    resumeFight(fight);
  }
  fight.check = null;
  return { success, damage, dice: check.dice, threshold: check.threshold, effects: check.effects, rangedRoll: check.rangedRoll };
}

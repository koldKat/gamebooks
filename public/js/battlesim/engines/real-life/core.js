// Resolve a single Real Life Gamebooks combat encounter without advancing the story.
const copy = value => structuredClone(value);
export const realLifeActive = fight => fight?.status === 'fighting';

export function realLifeInteger(value, min = 0, max = 10000) {
  if (value === '' || value == null || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new RangeError('Enter a valid combat value');
  }
  return Number(value);
}

export function realLifePlayer(source) {
  const keys = ['strength', 'sword', 'firearm', 'horsemanship', 'wounds',
    ...['agility', 'luck', 'javelin'].filter(key => Object.hasOwn(source ?? {}, key))];
  return Object.fromEntries(keys.map(key =>
    [key, realLifeInteger(['firearm', 'horsemanship'].includes(key) ? source?.[key] ?? 0 : source?.[key], key === 'wounds' ? 1 : 0, key === 'wounds' ? 10000 : 99)]));
}

function opponent(source, index, weapon) {
  const skill = source.skill ?? source.skills?.[weapon];
  return {id: 'enemy' + index, name: String(source.displayName ?? source.name ?? 'Opponent').slice(0, 200),
    skill: source.noSkillPrinted ? null : realLifeInteger(skill, 0, 99), noSkillPrinted: Boolean(source.noSkillPrinted),
    wounds: source.noWoundsPrinted ? 1 : realLifeInteger(source.wounds, 1), noWoundsPrinted: Boolean(source.noWoundsPrinted),
    damage: realLifeInteger(source.damage ?? (['firearm', 'javelin'].includes(weapon) ? 2 : 1), 1, 100),
    horsemanship: realLifeInteger(source.horsemanship ?? 0, 0, 99), mounted: Boolean(source.mounted),
    target: source.target ?? 'hero', halfNext: false};
}

export function startRealLifeFight(player, encounter, options = {}) {
  const hero = {...realLifePlayer(player), id: 'hero', name: 'You', mounted: Boolean(options.mounted), halfNext: false};
  const spec = copy(encounter);
  const weapon = options.weapon ?? spec.weapon ?? 'sword';
  if (!['strength', 'sword', 'firearm', 'javelin'].includes(weapon) || (spec.weaponChoices && !spec.weaponChoices.includes(weapon))
      || (spec.weapon && !spec.weaponChoices && weapon !== spec.weapon)) throw new RangeError('Invalid weapon');
  const enemies = options.opponents ?? spec.opponents;
  if (!Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Choose opponents');
  const opponents = enemies.map((row, index) => opponent(row, index, weapon));
  if (opponents.some(enemy => enemy.noSkillPrinted) && spec.enemyAttackMode !== 'agility-avoidance') throw new RangeError('Missing enemy attack rule');
  for (const key of [weapon, ...(spec.initiativeTest || spec.openingAgilityTest || spec.enemyOpeningAgility || spec.enemyAttackMode === 'agility-avoidance' ? ['agility'] : []),
    ...(spec.optionalRoundLuckTarget ? ['luck'] : [])]) realLifeInteger(hero[key], 0, 99);
  const allies = (options.allies ?? spec.allies ?? []).map((row, index) => ({...opponent(row, index, weapon), id: 'ally' + index}));
  for (const enemy of opponents) if (enemy.target !== 'hero' && !allies.some(ally => ally.id === enemy.target)) throw new RangeError('Invalid allied combatant');
  if (spec.grapple && (weapon !== 'strength' || ![0, 1].includes(spec.stopAtWounds))) throw new RangeError('Invalid wrestling encounter');
  if (spec.grapple && hero.wounds <= spec.stopAtWounds) throw new RangeError('Current Wounds must exceed the stopping threshold');
  if (spec.playerAttacks != null) realLifeInteger(spec.playerAttacks, 1, 10);
  for (const key of ['roundLimit', 'survivalRounds', 'attackLimit', 'winWithinRounds']) if (spec[key] != null) realLifeInteger(spec[key], 1);
  if (spec.winWithinRounds != null && !spec.lateWinTarget) throw new RangeError('Missing late victory destination');
  if (spec.mountedCombat && !spec.horseRule) {
    hero.mounted = options.mounted ?? true;
    for (const enemy of opponents) enemy.mounted = options.opponents ? enemy.mounted : true;
  }
  if (spec.mountedStart) hero.mounted = options.mounted ?? true;
  const heroTurns = Array(spec.playerAttacks ?? 1).fill('hero');
  const enemyTurns = opponents.filter(enemy => enemy.target === 'hero').map(enemy => enemy.id);
  const queue = spec.opponentFirst ? [...enemyTurns, ...heroTurns] : [...heroTurns, ...enemyTurns];
  for (const ally of allies) queue.push(ally.id, ...opponents.filter(enemy => enemy.target === ally.id).map(enemy => enemy.id));
  const fight = {rulesVersion: 1, encounter: spec, weapon, hero, opponents, allies, queue,
    round: 0, cursor: 0, heroAttacks: 0, pending: null, opening: Boolean(spec.openingFirearm), status: 'fighting', log: []};
  if (spec.horseRule) Object.assign(fight, {horseCheckedRound: -1, mountedBonusActive: hero.mounted});
  if (spec.initiativeTest) fight.initiativePending = true;
  if (spec.optionalCharge && options.charge) fight.chargePending = true;
  if (spec.optionalRoundLuckTarget) fight.luckCheckedRound = 0;
  if (spec.requireUnharmed) fight.initialWounds = hero.wounds;
  if (spec.openingShots) fight.openingShotsRemaining = realLifeInteger(spec.openingShots, 1, 2);
  if (spec.openingAgilityTest) fight.openingAgilityPending = true;
  if (spec.enemyOpeningAgility) fight.enemyOpeningAgilityPending = true;
  if (spec.knifePossession && (weapon !== 'strength' || opponents.length !== 1)) throw new RangeError('Invalid knife struggle');
  if (opponents.some(enemy => enemy.noWoundsPrinted) && !spec.knifePossession) throw new RangeError('Missing opponent Wounds');
  validateRealLifeFight(fight);
  return fight;
}

export function validateRealLifeFight(fight) {
  if (fight?.rulesVersion !== 1 || !['fighting', 'win', 'loss', 'interrupted', 'cancelled', 'escaped', 'surrendered'].includes(fight.status)
      || !Array.isArray(fight.log) || !Array.isArray(fight.opponents) || !fight.opponents.length || !Array.isArray(fight.allies)
      || !Array.isArray(fight.queue) || !fight.queue.includes('hero')) throw new RangeError('Invalid saved combat');
  for (const actor of [fight.hero, ...fight.opponents, ...fight.allies]) {
    realLifeInteger(actor.wounds); realLifeInteger(actor.horsemanship, 0, 99);
    if (actor.id === 'hero') for (const key of ['strength', 'sword', 'firearm']) realLifeInteger(actor[key], 0, 99);
    else {
      if (!actor.noSkillPrinted) realLifeInteger(actor.skill, 0, 99);
      else if (actor.skill !== null || fight.encounter.enemyAttackMode !== 'agility-avoidance') throw new RangeError('Invalid no-skill combatant');
      realLifeInteger(actor.damage, 1, 100);
    }
  }
  const ids = new Set([fight.hero, ...fight.opponents, ...fight.allies].map(actor => actor.id));
  if (fight.queue.some(id => !ids.has(id))) throw new RangeError('Invalid turn queue');
  realLifeInteger(fight.round); realLifeInteger(fight.cursor, 0, fight.queue.length - 1); realLifeInteger(fight.heroAttacks);
  if (fight.pending && (!ids.has(fight.pending.attacker) || !ids.has(fight.pending.target))) throw new RangeError('Invalid pending attack');
  return fight;
}

const actors = fight => [fight.hero, ...fight.opponents, ...fight.allies];
const actorById = (fight, id) => actors(fight).find(actor => actor.id === id);
const alive = actor => actor?.wounds > 0 && !actor.outOfFight;

function finish(fight, status, destination, reason) {
  fight.status = status; fight.destination = destination ?? null; fight.reason = reason;
  fight.pending = null; fight.opening = false;
  fight.log.push({type: 'end', status, reason, round: fight.round, destination: fight.destination});
}

function checkEnd(fight, attacker, target, hit, critical = false) {
  const spec = fight.encounter;
  if (spec.grapple) {
    if (fight.hero.wounds <= spec.stopAtWounds) finish(fight, 'loss', spec.lossTarget, 'grapple');
    else if (fight.opponents.every(enemy => enemy.wounds <= spec.stopAtWounds)) finish(fight, 'win', spec.winTarget, 'grapple');
  } else if (!alive(fight.hero)) finish(fight, 'loss', spec.nonlethalZero && critical
    ? spec.criticalLossTarget : spec.heroDeathTarget ?? spec.lossTarget, spec.nonlethalZero && !critical ? 'unconscious' : 'death');
  else if (spec.firstBlood && hit) {
    const criticalDeath = !alive(target);
    finish(fight, attacker.id === 'hero' ? 'win' : 'loss', criticalDeath && attacker.id === 'hero'
      ? spec.opponentDeathTarget : spec.firstBloodTarget, criticalDeath ? 'death' : 'first-blood');
  } else if (!fight.enemyOpeningAgilityPending && fight.opponents.every(enemy => !alive(enemy))) {
    const wounded = spec.requireUnharmed && fight.hero.wounds < fight.initialWounds;
    const victoryTarget = spec.winWithinRounds != null && fight.round + 1 > spec.winWithinRounds
      ? spec.lateWinTarget : spec.winTarget ?? spec.survivalTarget;
    finish(fight, wounded ? 'loss' : 'win', wounded ? spec.lossTarget : victoryTarget,
      wounded ? 'wounded' : 'defeated');
  }
}

function nextTurn(fight) {
  fight.pending = null;
  if (!realLifeActive(fight)) return;
  if (fight.encounter.attackLimit && fight.heroAttacks >= fight.encounter.attackLimit) {
    finish(fight, 'interrupted', fight.encounter.interruptionTarget, 'attack-limit'); return;
  }
  do {
    fight.cursor++;
    if (fight.cursor === fight.queue.length) {
      fight.cursor = 0; fight.round++;
      if (fight.encounter.survivalRounds && fight.round >= fight.encounter.survivalRounds) finish(fight, 'win', fight.encounter.survivalTarget, 'survived');
      else if (fight.encounter.roundLimit && fight.round >= fight.encounter.roundLimit) finish(fight, 'interrupted', fight.encounter.interruptionTarget, 'round-limit');
    }
  } while (realLifeActive(fight) && !alive(actorById(fight, fight.queue[fight.cursor])));
}

function pickTurn(fight) {
  for (let skipped = 0; realLifeActive(fight) && skipped <= fight.queue.length; skipped++) {
    const actor = actorById(fight, fight.queue[fight.cursor]);
    const hasTarget = actor?.id.startsWith('ally') ? fight.opponents.some(enemy => alive(enemy) && enemy.target === actor.id) : true;
    if (alive(actor) && hasTarget) return actor;
    nextTurn(fight);
  }
  return null;
}

export function realLifeTurn(original) {
  validateRealLifeFight(original);
  if (!realLifeActive(original)) return null;
  const fight = copy(original);
  const heroTargets = () => fight.opponents.filter(alive).map(enemy => enemy.id);
  if (fight.openingAgilityPending) return {attacker: 'hero', kind: 'opening-agility', targets: heroTargets()};
  if (!fight.opening && fight.enemyOpeningAgilityPending) return {attacker: 'hero', kind: 'avoid-pistol', targets: []};
  if (fight.initiativePending) return {attacker: 'hero', kind: 'initiative', targets: heroTargets()};
  if (fight.chargePending) return {attacker: 'hero', kind: 'charge', targets: heroTargets()};
  if (fight.encounter.horseRule && fight.hero.mounted && fight.horseCheckedRound < fight.round
      && (fight.encounter.horseRule === 'hero-before-round-fall' || fight.round > 0)) {
    return {attacker: 'hero', kind: 'round-horsemanship', targets: heroTargets()};
  }
  if (fight.opening) return {attacker: 'hero', kind: 'opening', targets: fight.opponents.filter((enemy, index) => alive(enemy)
    && (fight.encounter.openingTargetIndex == null || index === fight.encounter.openingTargetIndex)
    && !(fight.encounter.openingDistinctTargets && fight.openingTargets?.includes(enemy.id))).map(enemy => enemy.id)};
  if (fight.pending) return {...fight.pending, kind: 'attack', targets: [fight.pending.target]};
  const actor = pickTurn(fight);
  if (!actor) return null;
  const split = fight.splitRound?.round === fight.round ? fight.splitRound : null;
  const targets = actor.id === 'hero' ? fight.opponents.filter(enemy => alive(enemy) && (!split?.remaining || split.remaining.includes(enemy.id)))
    : actor.id.startsWith('ally') ? fight.opponents.filter(enemy => alive(enemy) && enemy.target === actor.id)
      : [alive(actorById(fight, actor.target)) ? actorById(fight, actor.target) : fight.hero];
  return {attacker: actor.id, kind: fight.encounter.knifePossession ? 'knife-possession' : fight.encounter.enemyAttackMode === 'agility-avoidance' && actor.id.startsWith('enemy')
    ? 'agility' : fight.encounter.mountedCombat && !fight.encounter.horseRule && actor.mounted ? 'horsemanship' : 'attack', targets: targets.map(target => target.id)};
}

function dice(roll = () => 1 + Math.floor(Math.random() * 6)) {
  const values = [realLifeInteger(roll(), 1, 6), realLifeInteger(roll(), 1, 6)];
  return {dice: values, total: values[0] + values[1]};
}

export function realLifeStep(original, options = {}, roll) {
  validateRealLifeFight(original);
  if (!realLifeActive(original)) throw new RangeError('This encounter has ended');
  const fight = copy(original);
  const special = realLifeTurn(fight);
  if (['opening-agility', 'avoid-pistol', 'knife-possession'].includes(special.kind)) {
    const actor = special.kind === 'knife-possession' ? pickTurn(fight) : fight.hero;
    const skill = special.kind === 'knife-possession' ? (actor.id === 'hero' ? actor.strength : actor.skill) : fight.hero.agility;
    const result = dice(roll), success = special.kind === 'knife-possession' ? result.total < skill : result.total <= skill;
    fight.log.push({type: special.kind, actor: actor.name, skill, ...result, success, round: fight.round});
    if (special.kind === 'opening-agility') {
      fight.openingAgilityPending = false;
      if (!success) {fight.opening = false; fight.openingShotsRemaining = 0;}
    } else if (special.kind === 'avoid-pistol') {
      fight.enemyOpeningAgilityPending = false;
      if (!success) finish(fight, 'loss', fight.encounter.lossTarget, 'pistol');
      else checkEnd(fight, fight.hero, null, false);
    } else if (success) finish(fight, actor.id === 'hero' ? 'win' : 'loss',
      actor.id === 'hero' ? fight.encounter.winTarget : fight.encounter.lossTarget, 'knife-possession');
    else nextTurn(fight);
    fight.log = fight.log.slice(-250);
    return fight;
  }
  if (['initiative', 'charge', 'round-horsemanship'].includes(special.kind)) {
    const key = special.kind === 'initiative' ? 'agility' : 'horsemanship';
    const result = dice(roll), success = result.total <= fight.hero[key];
    if (special.kind === 'initiative') {
      fight.initiativePending = false;
      if (!success) fight.queue = [...fight.queue.filter(id => id !== 'hero'), 'hero'];
    } else if (special.kind === 'charge') {
      const id = options.target ?? special.targets[0];
      if (!special.targets.includes(id)) throw new RangeError('Choose a living charge target');
      fight.chargePending = false;
      if (success) actorById(fight, id).outOfFight = true;
    } else {
      fight.horseCheckedRound = fight.round;
      if (fight.encounter.horseRule === 'hero-before-round-fall' && !success) {
        fight.hero.mounted = false; nextTurn(fight);
      } else if (fight.encounter.horseRule === 'hero-after-round-bonus') fight.mountedBonusActive = success;
    }
    fight.log.push({type: special.kind, ...result, success, round: fight.round});
    return fight;
  }
  const actor = fight.opening ? fight.hero : fight.pending ? actorById(fight, fight.pending.attacker) : pickTurn(fight);
  if (!actor || !realLifeActive(fight)) return fight;
  const turn = realLifeTurn(fight);
  const targetId = fight.pending?.target ?? options.target ?? turn.targets[0];
  if (!turn.targets.includes(targetId)) throw new RangeError('Choose a living target');
  const target = actorById(fight, targetId), result = dice(roll);
  const defensive = fight.pending?.defensive ?? Boolean(options.defensive);
  const both = Boolean(options.attackBoth && actor.id === 'hero' && fight.encounter.simultaneousAttack);
  if (options.attackBoth && !both) throw new RangeError('Group attack unavailable');
  if (options.splitSkill && (!fight.encounter.splitSkillAttacks || actor.id !== 'hero' || fight.opening)) throw new RangeError('Split-skill attack unavailable');
  if (!fight.opening && actor.id === 'hero' && fight.encounter.splitSkillAttacks && fight.splitRound?.round !== fight.round) {
    const enemies = fight.opponents.filter(alive);
    fight.splitRound = {round: fight.round, divisor: options.splitSkill ? enemies.length : 1,
      remaining: options.splitSkill ? enemies.map(enemy => enemy.id) : null};
  }
  const split = actor.id === 'hero' && !fight.opening && fight.splitRound?.round === fight.round ? fight.splitRound : null;
  if (split?.remaining && defensive) throw new RangeError('Defensive attack unavailable while splitting skill');
  if (defensive && (actor.id !== 'hero' || ['firearm', 'javelin'].includes(fight.weapon) || fight.opening || fight.encounter.cannotDefend || both)) throw new RangeError('Defensive attack unavailable');
  if (turn.kind === 'agility') {
    const avoided = result.total <= fight.hero.agility;
    const lost = avoided ? 0 : Math.min(actor.damage, fight.hero.wounds);
    fight.hero.wounds -= lost;
    fight.log.push({type: 'agility', actor: fight.hero.name, ...result, success: avoided, lost, round: fight.round});
    checkEnd(fight, actor, fight.hero, !avoided); nextTurn(fight); return fight;
  }
  if (turn.kind === 'horsemanship') {
    const stayedMounted = result.total <= actor.horsemanship;
    fight.log.push({type: 'horsemanship', actor: actor.name, ...result, success: stayedMounted, round: fight.round});
    if (stayedMounted) fight.pending = {attacker: actor.id, target: target.id, defensive};
    else {actor.mounted = false; nextTurn(fight);}
    return fight;
  }
  const opening = fight.opening;
  let skill = actor.id === 'hero' ? actor[opening ? 'firearm' : fight.weapon] : actor.skill;
  if (actor.id === 'hero') skill += opening ? fight.encounter.openingSkillModifier ?? 0 : fight.encounter.playerSkillModifier ?? 0;
  if (!opening && actor.id === 'hero' && fight.hero.mounted && fight.encounter.playerSkillBonus
      && (fight.encounter.horseRule !== 'hero-after-round-bonus' || fight.mountedBonusActive)) skill += fight.encounter.playerSkillBonus;
  if (actor.id.startsWith('enemy') && actor.mounted && !fight.hero.mounted
      && fight.encounter.horseRule === 'hero-before-round-fall') skill++;
  if (!opening && fight.encounter.mountedCombat && !fight.encounter.horseRule && !actor.mounted && target.mounted) skill--;
  if (!opening && defensive) {skill = Math.ceil(skill / 2); target.halfNext = true;}
  if (!opening && actor.halfNext) {skill = Math.ceil(skill / 2); actor.halfNext = false;}
  if (both) skill = Math.ceil(skill / 2);
  if (split?.remaining) skill /= split.divisor;
  const penalty = actor.id === 'hero' && !opening ? (fight.encounter.playerRollPenalty ?? 0) : 0;
  const automaticHit = !fight.encounter.grapple && result.total === 2;
  const removed = opening && fight.encounter.openingRemovesTarget && (automaticHit || result.total <= skill);
  const critical = automaticHit && !removed;
  const success = automaticHit || (fight.encounter.grapple ? result.total + penalty < skill : result.total + penalty <= skill);
  const damage = actor.id === 'hero' ? (opening || ['firearm', 'javelin'].includes(fight.weapon) ? 2 : 1) : actor.damage;
  const lost = success && !removed ? (critical ? target.wounds : Math.min(damage, Math.max(0, target.wounds - (fight.encounter.grapple ? fight.encounter.stopAtWounds : 0)))) : 0;
  target.wounds -= lost;
  if (removed) {target.outOfFight = true; target.exitReason = 'shot';}
  if (target.id.startsWith('enemy') && success && target.wounds > 0 && target.wounds <= (fight.encounter.enemyFleeAtWounds ?? -1)) {
    target.outOfFight = true; target.exitReason = 'fled';
  }
  if (both && success) for (const enemy of fight.opponents.filter(enemy => alive(enemy) && enemy !== target)) {
    enemy.wounds -= critical ? enemy.wounds : Math.min(damage, enemy.wounds);
  }
  fight.log.push({type: opening ? 'opening' : 'attack', actor: actor.name, target: target.name, skill, penalty,
    ...result, success, critical, lost, removed: Boolean(removed), fled: target.exitReason === 'fled', defensive, attackBoth: both,
    ...(split?.remaining ? {splitDivisor: split.divisor} : {}), round: fight.round});
  checkEnd(fight, actor, target, success, critical);
  if (opening) {
    if (realLifeActive(fight)) {
      if (fight.openingShotsRemaining != null) fight.openingShotsRemaining--;
      if (fight.encounter.openingDistinctTargets) (fight.openingTargets ??= []).push(target.id);
      fight.opening = fight.openingShotsRemaining > 0 && fight.opponents.some(enemy => alive(enemy)
        && !(fight.encounter.openingDistinctTargets && fight.openingTargets?.includes(enemy.id)));
    }
  } else {
    if (actor.id === 'hero') fight.heroAttacks++;
    if (split?.remaining) split.remaining = split.remaining.filter(id => id !== target.id && alive(actorById(fight, id)));
    if (!split?.remaining?.length || !realLifeActive(fight)) nextTurn(fight);
    if (both && success) while (realLifeActive(fight) && fight.cursor !== 0) nextTurn(fight);
  }
  fight.log = fight.log.slice(-250);
  return fight;
}

export function canTestRealLifeLuck(fight) {
  return Boolean(realLifeActive(fight) && fight.encounter.optionalRoundLuckTarget && fight.round > 0
    && fight.cursor === 0 && !fight.pending && fight.luckCheckedRound < fight.round);
}

export function testRealLifeLuck(original, roll) {
  validateRealLifeFight(original);
  if (!canTestRealLifeLuck(original)) throw new RangeError('Luck is available once after a complete combat round');
  const fight = copy(original), result = dice(roll), success = result.total <= fight.hero.luck;
  fight.luckCheckedRound = fight.round;
  fight.log.push({type: 'luck', ...result, success, round: fight.round});
  if (success) finish(fight, 'interrupted', fight.encounter.optionalRoundLuckTarget, 'luck');
  return fight;
}

export function skipRealLifeOpening(original) {
  validateRealLifeFight(original);
  if (!realLifeActive(original) || !original.opening || original.openingAgilityPending) throw new RangeError('No opening shot');
  const fight = copy(original); fight.opening = false;
  if (fight.openingShotsRemaining != null) fight.openingShotsRemaining = 0;
  fight.log.push({type: 'opening-skipped', round: fight.round}); return fight;
}

export function endRealLifeFight(original, action = 'cancelled') {
  validateRealLifeFight(original);
  if (!realLifeActive(original)) throw new RangeError('This encounter has ended');
  const key = action === 'escaped' ? 'escapeTarget' : action === 'surrendered' ? 'surrenderTarget' : null;
  if (action !== 'cancelled' && (!key || !original.encounter[key])) throw new RangeError('This exit is unavailable');
  const fight = copy(original); finish(fight, action, key ? fight.encounter[key] : null, action); return fight;
}

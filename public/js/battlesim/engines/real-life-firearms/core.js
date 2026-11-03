// Resolve independent Real Life Gamebooks firearm encounters where a successful hit kills.
const copy = value => structuredClone(value);
const living = actors => actors.filter(actor => actor.alive);
const integer = (value, min, max) => {
  if (value === '' || value == null || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new RangeError('Enter a valid combat value');
  }
  return Number(value);
};
const dice = values => {
  if (!Array.isArray(values) || values.length !== 2) throw new RangeError('Roll two dice');
  return values.map(value => integer(value, 1, 6));
};
const actor = (row, id) => ({id, name: String(row.displayName ?? row.name ?? 'Opponent').slice(0, 200),
  skill: integer(row.skill, 0, 12), alive: true, shots: 0, hits: 0,
  hitsToKill: integer(row.hitsToKill ?? 1, 1, 100),
  hitDamage: row.hitDamage === 'lethal' ? 'lethal' : integer(row.hitDamage ?? 1, 1, 100)});
const teamQueue = fight => fight.mode === 'team'
  ? [...living(fight.allies).map(row => row.id), 'hero'] : ['hero', ...living(fight.allies).map(row => row.id)];

export function startFirearmFight(skill, encounter, options = {}) {
  const spec = copy(encounter);
  const mode = spec.mode ?? 'alternating';
  if (!['alternating', 'simultaneous', 'ambush', 'team'].includes(mode)) throw new RangeError('Invalid firearm rules');
  const rows = options.opponents ?? spec.opponents;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new RangeError('Choose opponents');
  const allies = options.allies ?? spec.allies ?? [];
  if (!Array.isArray(allies) || allies.length > 100) throw new RangeError('Invalid allies');
  if (mode === 'simultaneous' && (rows.length !== 1 || allies.length)) throw new RangeError('Simultaneous duel needs one opponent');
  if (['ambush', 'team'].includes(mode) && !allies.length) throw new RangeError('Group combat needs companions');
  if (!['ambush', 'team'].includes(mode) && allies.length) throw new RangeError('Companions need group combat rules');
  for (const key of ['heroRollPenalty', 'enemyRollPenalty']) if (spec[key] != null) integer(spec[key], 0, 12);
  if (spec.enemyShotsEachLimit != null) integer(spec.enemyShotsEachLimit, 1, 100);
  if (spec.heroOpeningShots != null && (mode !== 'alternating' || spec.opponentFirst)) throw new RangeError('Invalid opening shots');
  const fight = {rulesVersion: 1, encounter: spec, mode, hero: actor({name: 'You', skill, hitsToKill: spec.heroHitsToDeath}, 'hero'),
    opponents: rows.map((row, index) => actor(row, 'enemy' + index)),
    allies: allies.map((row, index) => actor(row, 'ally' + index)),
    status: 'fighting', round: 1, phase: mode === 'simultaneous' ? 'simultaneous' : 'resistance', cursor: 0,
    queue: ['hero', ...allies.map((row, index) => 'ally' + index)], enemyTargets: [], log: []};
  fight.hero.hits = integer(options.initialHeroHits ?? 0, 0, fight.hero.hitsToKill - 1);
  fight.queue = spec.heroOpeningShots ? Array(integer(spec.heroOpeningShots, 1, 100)).fill('hero') : teamQueue(fight);
  if (['alternating', 'team'].includes(mode) && spec.opponentFirst) enemyPhase(fight);
  validateFirearmFight(fight);
  return fight;
}

export function validateFirearmFight(fight) {
  if (fight?.rulesVersion !== 1 || !['alternating', 'simultaneous', 'ambush', 'team'].includes(fight.mode)
      || !['fighting', 'win', 'loss', 'interrupted', 'cancelled'].includes(fight.status)
      || !['resistance', 'enemies', 'simultaneous'].includes(fight.phase)
      || !Array.isArray(fight.opponents) || !fight.opponents.length || !Array.isArray(fight.allies)
      || !Array.isArray(fight.queue) || !Array.isArray(fight.enemyTargets) || !Array.isArray(fight.log)) {
    throw new RangeError('Invalid saved firearm combat');
  }
  integer(fight.round, 1, 1000000); integer(fight.cursor, 0, 1000000);
  const actors = [fight.hero, ...fight.opponents, ...fight.allies];
  const ids = new Set(actors.map(row => row.id));
  if (ids.size !== actors.length || fight.hero.id !== 'hero' || fight.queue.some(id => !ids.has(id))
      || fight.enemyTargets.some(id => ![fight.hero, ...fight.allies].some(row => row.id === id))) {
    throw new RangeError('Invalid combatant order');
  }
  for (const row of actors) {
    integer(row.skill, 0, 12); integer(row.shots, 0, 1000000);
    integer(row.hitsToKill ?? 1, 1, 100); integer(row.hits ?? 0, 0, 1000000);
    if (row.hitDamage !== 'lethal') integer(row.hitDamage ?? 1, 1, 100);
    if (typeof row.alive !== 'boolean' || typeof row.name !== 'string') throw new RangeError('Invalid combatant');
  }
  if (fight.mode === 'simultaneous' && (fight.opponents.length !== 1 || fight.allies.length)) throw new RangeError('Invalid duel');
  if (fight.mode === 'ambush' && !fight.allies.length) throw new RangeError('Invalid ambush');
  if (fight.mode === 'team' && !fight.allies.length) throw new RangeError('Invalid squad');
  if (fight.pendingSpray && (fight.phase !== 'resistance' || fight.encounter.heroTargeting !== 'spray'
      || fight.queue[fight.cursor] !== 'hero' || !fight.log.at(-1)?.hit
      || fight.log.at(-1).target !== null)) throw new RangeError('Invalid pending spray hit');
  for (const key of ['heroRollPenalty', 'enemyRollPenalty']) if (fight.encounter[key] != null) integer(fight.encounter[key], 0, 12);
  if (fight.encounter.enemyShotsEachLimit != null) integer(fight.encounter.enemyShotsEachLimit, 1, 100);
  return fight;
}

const find = (fight, id) => [fight.hero, ...fight.opponents, ...fight.allies].find(row => row.id === id);

function outcome(fight) {
  if (!fight.hero.alive || (fight.mode === 'ambush' && !living(fight.allies).length)) fight.status = 'loss';
  else if (!living(fight.opponents).length) fight.status = 'win';
  if (fight.status !== 'fighting') {
    fight.destination = fight.status === 'win' && (fight.hero.hits ?? 0) > 0 && fight.encounter.woundedWinTarget
      ? fight.encounter.woundedWinTarget : fight.encounter[fight.status + 'Target'] ?? null;
    return true;
  }
  return false;
}

function enemyPhase(fight) {
  fight.phase = 'enemies'; fight.cursor = 0;
  fight.queue = living(fight.opponents).map(row => row.id);
  fight.enemyTargets = [fight.hero, ...living(fight.allies)].map(row => row.id);
}

function advance(fight) {
  while (fight.cursor < fight.queue.length && !find(fight, fight.queue[fight.cursor]).alive) fight.cursor++;
  if (fight.cursor < fight.queue.length || outcome(fight)) return;
  if (fight.phase === 'resistance') enemyPhase(fight);
  else {
    if (fight.encounter.enemyShotsEachLimit && living(fight.opponents).every(row => row.shots >= fight.encounter.enemyShotsEachLimit)) {
      fight.status = 'interrupted'; fight.destination = fight.encounter.interruptionTarget ?? null; return;
    }
    fight.round++; fight.phase = 'resistance'; fight.cursor = 0;
    fight.queue = teamQueue(fight);
  }
}

export function firearmTurn(source) {
  validateFirearmFight(source);
  if (source.status !== 'fighting') return null;
  if (source.mode === 'simultaneous') return {kind: 'simultaneous', attackerId: 'hero', targetId: source.opponents[0].id};
  if (source.pendingSpray) return {kind: 'sprayHit', attackerId: 'hero', targetId: null,
    targets: living(source.opponents).map(row => row.id), requiresTarget: true};
  const attackerId = source.queue[source.cursor];
  if (!attackerId || !find(source, attackerId)?.alive) throw new RangeError('Invalid saved combat turn');
  if (source.phase === 'enemies') {
    const targetId = source.mode === 'team' ? source.encounter.enemyTargetOrder === 'allies-first'
      ? living(source.allies)[0]?.id ?? 'hero' : null
      : source.mode === 'ambush' ? source.enemyTargets[source.cursor] : 'hero';
    return {kind: 'shot', attackerId, targetId: targetId ?? null,
      targets: targetId ? [targetId] : [source.hero, ...living(source.allies)].map(row => row.id),
      requiresTarget: !targetId};
  }
  const targets = living(source.opponents).map(row => row.id);
  if (attackerId === 'hero' && source.encounter.heroTargeting === 'spray') {
    return {kind: 'spray', attackerId, targetId: null, targets: [], requiresTarget: false};
  }
  const ordered = source.mode === 'ambush' || source.encounter.chainHeroHits || source.encounter.targetOrder === 'printed';
  return {kind: 'shot', attackerId, targetId: ordered || targets.length === 1 ? targets[0] : null,
    targets: ordered ? targets.slice(0, 1) : targets, requiresTarget: !ordered && targets.length > 1};
}

function applyHit(fight, shooter, victims, event) {
  for (const victim of victims) {
    const before = victim.hits ?? 0, limit = victim.hitsToKill ?? 1;
    victim.hits = before + (shooter.hitDamage === 'lethal' ? limit : shooter.hitDamage ?? 1);
    if (victim.hits >= limit) {victim.alive = false; event.killed.push(victim.id);}
    else if (victim.id === 'hero' && before === 0 && fight.encounter.firstWoundSkillPenalty) {
      victim.skill = Math.max(0, victim.skill - integer(fight.encounter.firstWoundSkillPenalty, 1, 12));
    }
  }
}

function shot(fight, shooter, target, values, penalty, count = 1) {
  const rolled = dice(values), total = rolled[0] + rolled[1], adjusted = total + penalty;
  const hit = adjusted <= shooter.skill;
  const victims = hit && target ? (count === 1 ? [target] : living(fight.opponents).slice(0, count)) : [];
  shooter.shots++;
  const event = {round: fight.round, attacker: shooter.id, target: target?.id ?? null, dice: rolled, total,
    adjusted, skill: shooter.skill, hit, killed: []};
  applyHit(fight, shooter, victims, event); fight.log.push(event);
  return hit;
}

export function resolveFirearmTurn(source, rolls, options = {}) {
  const turn = firearmTurn(source);
  if (!turn) throw new RangeError('Fight is over');
  const fight = copy(source);
  if (turn.kind === 'sprayHit') {
    const target = find(fight, options.target);
    if (!turn.targets.includes(target?.id)) throw new RangeError('Choose the recipient of the spray hit');
    const event = fight.log.at(-1); event.target = target.id;
    applyHit(fight, fight.hero, [target], event); delete fight.pendingSpray;
    if (!outcome(fight)) {fight.cursor++; advance(fight);} return fight;
  }
  if (turn.kind === 'simultaneous') {
    const heroDice = dice(rolls.hero), enemyDice = dice(rolls.enemy), enemy = fight.opponents[0];
    // Both shots resolve even if the first one kills its target.
    shot(fight, fight.hero, enemy, heroDice, fight.encounter.heroRollPenalty ?? 0);
    shot(fight, enemy, fight.hero, enemyDice, fight.encounter.enemyRollPenalty ?? 0);
    if (!outcome(fight)) fight.round++;
    return fight;
  }
  const targetId = options.target ?? turn.targetId;
  if (turn.kind !== 'spray' && (!turn.targets.includes(targetId) || !find(fight, targetId)?.alive)) throw new RangeError('Choose a living combat target');
  const shooter = find(fight, turn.attackerId), target = find(fight, targetId), enemyShot = fight.phase === 'enemies';
  const rolled = dice(rolls);
  const kills = fight.mode === 'ambush' && !enemyShot && fight.encounter.resistanceParityKills ? (rolled[0] + rolled[1]) % 2 === 0 ? 2 : 1 : 1;
  const hit = shot(fight, shooter, target, rolled, enemyShot ? fight.encounter.enemyRollPenalty ?? 0 : fight.encounter.heroRollPenalty ?? 0, kills);
  if (turn.kind === 'spray' && hit) {fight.pendingSpray = true; return fight;}
  if (outcome(fight)) return fight;
  if (!enemyShot && fight.encounter.chainHeroHits && shooter.id === 'hero') {
    if (!hit) enemyPhase(fight);
  } else {
    fight.cursor++;
    advance(fight);
  }
  return fight;
}

export function cancelFirearmFight(source) {
  validateFirearmFight(source);
  const fight = copy(source);
  if (fight.status !== 'fighting') throw new RangeError('Fight is over');
  fight.status = 'cancelled';
  return fight;
}

export function firearmReport(source) {
  validateFirearmFight(source);
  return {status: source.status, round: source.round, destination: source.destination ?? null,
    heroAlive: source.hero.alive, opponents: source.opponents.map(row => ({id: row.id, name: row.name, skill: row.skill, alive: row.alive})),
    allies: source.allies.map(row => ({id: row.id, name: row.name, skill: row.skill, alive: row.alive})), log: copy(source.log)};
}

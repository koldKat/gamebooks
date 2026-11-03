// Resolve isolated Sagard ship encounters from database-owned charts and combat options.
const clone = value => structuredClone(value);
const int = (value, min, max) => {
  if (value === '' || value == null || !Number.isSafeInteger(Number(value)) || value < min || value > max) {
    throw new RangeError('Enter a valid ship combat value');
  }
  return Number(value);
};
const faces = values => {
  if (!Array.isArray(values) || new Set(values).size !== values.length) throw new RangeError('Invalid combat faces');
  return values.map(value => int(value, 1, 4));
};
const chart = values => {
  if (!Array.isArray(values) || values.length !== 4) throw new RangeError('Missing ship damage chart');
  return values.map(value => int(value, 0, 1000));
};
const alive = fight => fight.opponents.filter(row => row.alive && (row.hp === null || row.hp > 0));
const enemy = fight => fight.opponents.find(row => row.id === fight.target);
const event = (fight, item) => {
  fight.log.push({...item, round: fight.round});
  if (fight.log.length > 500) fight.log.splice(0, fight.log.length - 500);
  fight.turnSerial++;
};

export function validateSagardNavalEncounter(encounter) {
  const spec = encounter?.naval;
  if (!spec || !['fleet', 'galleon', 'escape', 'hunters', 'tentacles'].includes(spec.kind)) {
    throw new RangeError('Choose a ship encounter');
  }
  chart(spec.heroChart);
  if (spec.kind === 'fleet') {
    if (!Array.isArray(spec.actions) || !spec.actions.length || new Set(spec.actions).size !== spec.actions.length
        || spec.actions.some(action => !['ram', 'missile', 'board'].includes(action))) throw new RangeError('Missing naval actions');
    faces(spec.ramSinkFaces); faces(spec.ramThreatFaces); faces(spec.boardKillFaces);
    if (spec.ramConfirmFaces != null) faces(spec.ramConfirmFaces);
  }
  if (spec.kind === 'escape') faces(spec.escapeFaces);
  if (spec.kind === 'galleon') {
    faces(spec.surrenderFaces); faces(spec.escapeThreatFaces); faces(spec.escapeConfirmFaces);
  }
  return encounter;
}

export function startSagardNaval(ship, encounter, options = {}) {
  validateSagardNavalEncounter(encounter);
  if (encounter.mode === 'manual') throw new RangeError(encounter.manualReason || 'This source needs manual combat values');
  let rows = options.opponents ?? encounter.opponents;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new RangeError('Choose ships or sea opponents');
  const spec = encounter.naval;
  if (spec.singleOpponent) rows = [rows[int(options.opponentIndex ?? 0, 0, rows.length - 1)]];
  const fight = {kind: 'naval', rulesVersion: 1, encounter: clone(encounter),
    ship: {name: String(ship.name || 'Midnight Reaper'), hp: int(ship.hp, 1, 1000000), maxHp: int(ship.maxHp, 1, 1000000)},
    opponents: rows.map((row, i) => ({id: 'enemy' + i, name: String(row.displayName ?? row.name), chart: chart(row.chart),
      hp: ['escape', 'hunters'].includes(spec.kind) ? null : int(row.hp, 1, 1000000),
      maxHp: ['escape', 'hunters'].includes(spec.kind) ? null : int(row.hp, 1, 1000000), alive: true})),
    status: 'fighting', phase: '', target: null, round: 1, cursor: 0, turnSerial: 0, log: []};
  beginRound(fight, false);
  return validateSagardNavalFight(fight);
}

export function validateSagardNavalFight(fight) {
  if (fight?.kind !== 'naval' || fight.rulesVersion !== 1
      || !['fighting', 'win', 'loss', 'fled', 'withdrawn', 'cancelled'].includes(fight.status)
      || !['chooseShip', 'chooseAction', 'ram', 'ramConfirm', 'missileHero', 'enemyAttack', 'boardHero', 'boardEnemy',
        'escape', 'precheck', 'escapeCheck', 'heroAttack', 'allocate'].includes(fight.phase)
      || !Array.isArray(fight.opponents) || !fight.opponents.length || fight.opponents.length > 100
      || !Array.isArray(fight.log) || fight.log.length > 500) throw new RangeError('Invalid saved ship encounter');
  validateSagardNavalEncounter(fight.encounter);
  int(fight.ship.maxHp, 1, 1000000); int(fight.ship.hp, 0, fight.ship.maxHp);
  int(fight.round, 1, 1000000); int(fight.cursor, 0, 1000000); int(fight.turnSerial, 0, 1000000000);
  const ids = new Set();
  for (const row of fight.opponents) {
    if (ids.has(row.id) || !/^enemy\d+$/.test(row.id) || typeof row.alive !== 'boolean' || typeof row.name !== 'string') {
      throw new RangeError('Invalid sea opponent');
    }
    ids.add(row.id); chart(row.chart);
    if (['escape', 'hunters'].includes(fight.encounter.naval.kind)) {
      if (row.hp !== null || row.maxHp !== null) throw new RangeError('This opponent has no printed HP');
    } else {
      int(row.maxHp, 1, 1000000); int(row.hp, 0, row.maxHp);
      if (row.alive !== (row.hp > 0)) throw new RangeError('Invalid ship casualty');
    }
  }
  if (fight.target !== null && !ids.has(fight.target)) throw new RangeError('Invalid active ship');
  if (['boardHero', 'boardEnemy'].includes(fight.phase)) {
    int(fight.boardHeroShots, 1, 1000000); int(fight.boardEnemyShots, 1, 1000000);
    int(fight.cursor, 0, (fight.phase === 'boardHero' ? fight.boardHeroShots : fight.boardEnemyShots)
      - (fight.status === 'fighting' ? 1 : 0));
  }
  if (fight.phase === 'allocate') int(fight.pendingDamage, fight.status === 'fighting' ? 1 : 0, 1000);
  if (fight.phase !== 'chooseShip' && fight.encounter.naval.kind === 'fleet' && !ids.has(fight.target)) {
    throw new RangeError('Missing active ship');
  }
  if (fight.phase === 'enemyAttack' && ['hunters', 'tentacles'].includes(fight.encounter.naval.kind)) {
    if (!Array.isArray(fight.attackQueue) || !fight.attackQueue.length
        || new Set(fight.attackQueue).size !== fight.attackQueue.length
        || fight.attackQueue.some(id => !ids.has(id)) || fight.cursor >= fight.attackQueue.length) {
      throw new RangeError('Invalid sea opponent attack order');
    }
  }
  if (fight.status === 'fighting' && (fight.ship.hp === 0
      || (!alive(fight).length && fight.phase !== 'boardEnemy'))) throw new RangeError('Unresolved ship outcome');
  return fight;
}

function finish(fight, status, reason) {
  fight.status = status;
  fight.destination = fight.encounter[status === 'fled' ? 'escapeTarget' : status + 'Target'] ?? null;
  if (reason) fight.ending = reason;
}

function outcome(fight) {
  if (fight.ship.hp === 0) finish(fight, 'loss');
  else if (!alive(fight).length) finish(fight, 'win');
  return fight.status !== 'fighting';
}

function beginRound(fight, increment = true) {
  if (outcome(fight)) return;
  if (increment) fight.round++;
  fight.cursor = 0;
  const spec = fight.encounter.naval;
  if (spec.kind === 'fleet') {
    if (spec.chooseShipEachRound && alive(fight).length > 1) {fight.target = null; fight.phase = 'chooseShip';}
    else {fight.target = alive(fight)[0].id; fight.phase = 'chooseAction';}
  } else if (spec.kind === 'escape') {fight.target = alive(fight)[0].id; fight.phase = 'escape';}
  else if (spec.kind === 'galleon') {fight.target = alive(fight)[0].id; fight.phase = 'precheck';}
  else {fight.attackQueue = alive(fight).map(row => row.id); fight.phase = 'enemyAttack';}
}

export function sagardNavalTurn(fight) {
  validateSagardNavalFight(fight);
  if (fight.status !== 'fighting') return null;
  const select = ['chooseShip', 'allocate'].includes(fight.phase);
  return {kind: fight.phase, targets: select ? alive(fight).map(row => row.id) : [],
    attackerId: fight.phase === 'enemyAttack' ? (fight.attackQueue?.[fight.cursor] ?? fight.target) : null,
    requiresDie: !['chooseShip', 'chooseAction', 'allocate'].includes(fight.phase),
    actions: fight.phase === 'chooseAction' ? [...fight.encounter.naval.actions] : [],
    canWithdraw: fight.encounter.naval.kind === 'galleon', pendingDamage: fight.pendingDamage ?? 0};
}

function hitShip(fight, damage) {fight.ship.hp = Math.max(0, fight.ship.hp - damage);}
function hitEnemy(row, damage) {row.hp = Math.max(0, row.hp - damage); row.alive = row.hp > 0;}

export function resolveSagardNaval(original, die, {decision, target, amount} = {}) {
  const turn = sagardNavalTurn(original);
  if (!turn) throw new RangeError('This ship encounter has ended');
  const fight = clone(original), spec = fight.encounter.naval;
  const roll = turn.requiresDie ? int(die, 1, 4) : null;
  if (turn.kind === 'chooseShip') {
    if (!turn.targets.includes(target)) throw new RangeError('Choose one surviving ship');
    fight.target = target; fight.phase = 'chooseAction'; event(fight, {kind: 'chooseShip', target});
  } else if (turn.kind === 'chooseAction') {
    if (!turn.actions.includes(decision)) throw new RangeError('Choose a printed naval action');
    fight.phase = decision === 'ram' ? 'ram' : decision === 'missile' ? 'missileHero' : 'boardHero';
    if (decision === 'board') {
      fight.boardHeroShots = fight.ship.hp; fight.boardEnemyShots = enemy(fight).hp; fight.cursor = 0;
    }
    event(fight, {kind: 'navalAction', decision, target: fight.target});
  } else if (turn.kind === 'ram' || turn.kind === 'ramConfirm') {
    let result = 'no collision';
    if (turn.kind === 'ramConfirm') {
      if (spec.ramConfirmFaces.includes(roll)) {hitShip(fight, fight.ship.hp); result = 'own ship sunk';}
      beginRound(fight);
    } else if (spec.ramSinkFaces.includes(roll)) {
      hitEnemy(enemy(fight), enemy(fight).hp); result = 'opponent sunk'; beginRound(fight);
    } else if (spec.ramThreatFaces.includes(roll)) {
      if (spec.ramConfirmFaces) {fight.phase = 'ramConfirm'; result = 'enemy ramming attempt';}
      else {hitShip(fight, fight.ship.hp); result = 'own ship sunk'; outcome(fight);}
    } else beginRound(fight);
    event(fight, {kind: turn.kind, die: roll, result});
  } else if (turn.kind === 'missileHero') {
    const damage = spec.heroChart[roll - 1]; hitEnemy(enemy(fight), damage);
    event(fight, {kind: 'missile', die: roll, target: fight.target, damage});
    if (!enemy(fight).alive) beginRound(fight);
    else fight.phase = 'enemyAttack';
  } else if (turn.kind === 'enemyAttack') {
    const attacker = fight.opponents.find(row => row.id === turn.attackerId);
    if (!attacker?.alive) throw new RangeError('This opponent cannot attack');
    const damage = attacker.chart[roll - 1]; hitShip(fight, damage);
    event(fight, {kind: 'enemyAttack', attacker: attacker.id, die: roll, damage});
    if (!outcome(fight)) {
      if (['fleet', 'galleon', 'escape'].includes(spec.kind)) beginRound(fight);
      else if (++fight.cursor === fight.attackQueue.length) {fight.cursor = 0; fight.phase = 'heroAttack';}
    }
  } else if (turn.kind === 'boardHero' || turn.kind === 'boardEnemy') {
    const kill = spec.boardKillFaces.includes(roll);
    if (kill) {
      if (turn.kind === 'boardHero') hitEnemy(enemy(fight), 1);
      else hitShip(fight, 1);
    }
    event(fight, {kind: turn.kind, die: roll, casualty: kill ? 1 : 0});
    fight.cursor++;
    if (fight.ship.hp === 0) finish(fight, 'loss');
    else if (turn.kind === 'boardHero' && (fight.cursor === fight.boardHeroShots || !enemy(fight).alive)) {
      fight.phase = 'boardEnemy'; fight.cursor = 0;
    } else if (turn.kind === 'boardEnemy' && fight.cursor === fight.boardEnemyShots) beginRound(fight);
  } else if (turn.kind === 'escape') {
    const success = spec.escapeFaces.includes(roll); event(fight, {kind: 'escape', die: roll, success});
    if (success) finish(fight, 'fled'); else fight.phase = 'enemyAttack';
  } else if (turn.kind === 'precheck' || turn.kind === 'escapeCheck') {
    if (turn.kind === 'escapeCheck') {
      if (spec.escapeConfirmFaces.includes(roll)) finish(fight, 'withdrawn', 'opponent escaped');
      else fight.phase = 'missileHero';
    } else if (spec.surrenderFaces.includes(roll)) finish(fight, 'win', 'opponent surrendered');
    else fight.phase = spec.escapeThreatFaces.includes(roll) ? 'escapeCheck' : 'missileHero';
    event(fight, {kind: turn.kind, die: roll, ending: fight.ending ?? null});
  } else if (turn.kind === 'heroAttack') {
    const damage = spec.heroChart[roll - 1];
    if (spec.kind === 'hunters') {
      const victims = alive(fight).slice(0, damage); for (const row of victims) row.alive = false;
      event(fight, {kind: 'kills', die: roll, targets: victims.map(row => row.id)}); beginRound(fight);
    } else {
      fight.pendingDamage = damage; fight.phase = 'allocate'; event(fight, {kind: 'damagePool', die: roll, damage});
      if (!damage) beginRound(fight);
    }
  } else if (turn.kind === 'allocate') {
    if (!turn.targets.includes(target)) throw new RangeError('Choose a surviving tentacle');
    const victim = fight.opponents.find(row => row.id === target), damage = int(amount, 1, Math.min(victim.hp, fight.pendingDamage));
    hitEnemy(victim, damage); fight.pendingDamage -= damage; event(fight, {kind: 'allocate', target, damage});
    if (!outcome(fight) && fight.pendingDamage === 0) beginRound(fight);
  }
  return validateSagardNavalFight(fight);
}

export function withdrawSagardNaval(original) {
  if (!sagardNavalTurn(original)?.canWithdraw) throw new RangeError('This ship encounter cannot be left now');
  const fight = clone(original); finish(fight, 'withdrawn', 'attack broken off'); event(fight, {kind: 'withdraw'}); return fight;
}

export function cancelSagardNaval(original) {
  if (!sagardNavalTurn(original)) throw new RangeError('This ship encounter has ended');
  const fight = clone(original); finish(fight, 'cancelled'); event(fight, {kind: 'cancel'}); return fight;
}

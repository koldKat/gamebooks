const copy = value => structuredClone(value);
const randomDie = () => Math.floor(Math.random() * 6) + 1;

function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}

export function combatCommandForce(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new RangeError('Enter a force');
  const keys = new Set();
  return value.map(unit => {
    if (!unit || typeof unit.key !== 'string' || !unit.key || keys.has(unit.key)
        || typeof unit.name !== 'string' || !unit.name.trim()) throw new RangeError('Invalid unit');
    keys.add(unit.key);
    const next = copy(unit);
    integer(next.count); integer(next.ordnance);
    integer(next.spent ?? 0, 0, next.count);
    if (next.lossPriority !== undefined && !Number.isFinite(next.lossPriority)) throw new RangeError('Invalid casualty priority');
    next.spent ??= 0;
    return next;
  });
}

export function combatCommandHits(charts, chart, strength, total) {
  integer(strength); integer(total, 2, 12);
  const matrix = charts?.[chart];
  if (!Array.isArray(matrix) || matrix.length !== 11 || matrix.some(row => !Array.isArray(row) || row.length !== 11
      || row.some(cell => !Number.isSafeInteger(cell) || cell < 0))) throw new RangeError('Invalid combat chart');
  if (!strength) return 0;
  return matrix[total - 2][Math.min(10, Math.ceil(strength / 10) - 1)];
}

export function combatCommandTest(value, roll = randomDie) {
  integer(value);
  const dice = [integer(roll(6), 1, 6), integer(roll(6), 1, 6)];
  return { dice, total: dice[0] + dice[1], passed: dice[0] + dice[1] <= value };
}

const physical = force => force.reduce((sum, unit) => sum + (unit.drone ? 0 : unit.count), 0);
const living = force => force.reduce((sum, unit) => sum + unit.count, 0);
const availableDrones = force => force.reduce((sum, unit) => sum + (unit.drone ? unit.count - unit.spent : 0), 0);

export function startCombatCommandFight(player, encounter, charts) {
  if (!encounter || !Array.isArray(encounter.enemies)) throw new RangeError('Choose opponents');
  const fight = { rulesVersion: 1, player: combatCommandForce(player), enemies: combatCommandForce(encounter.enemies),
    config: copy(encounter), charts: copy(charts), round: 0, enemyExchanges: 0,
    status: 'fighting', section: null, history: [], launchedDrones: 0, destroyedDrones: 0, destroyedSpentDrones: 0 };
  for (const side of ['player', 'enemy']) {
    const names = [encounter[side + 'Chart'], ...Object.values(encounter[side + 'ChartRounds'] ?? {})].filter(Boolean);
    if (!names.length && !(side === 'player' ? encounter.enemyOnly : encounter.playerOnly)) throw new RangeError('Choose a combat chart');
    for (const name of names) combatCommandHits(charts, name, 1, 2);
  }
  if (!living(fight.player) || !living(fight.enemies) && !(encounter.enemyOnly && encounter.emptyEnemyOutcome)) throw new RangeError('A force has no surviving units');
  for (const key of ['roundLimit', 'enemyAmmo', 'freeOpeningAttacks', 'minimumPhysical', 'droneRound', 'minimumDrones',
    'dronesCanTakeLossesFrom', 'singleAttackWinHits', 'enemyFreeOpeningAttacks', 'interruptOnPlayerHitThroughRound',
    'winWithinRounds', 'afterOpeningRound', 'ignorePlayerDefeatUntilRound']) if (encounter[key] !== undefined) integer(encounter[key], 1);
  if (encounter.afterOpeningRound !== undefined) {
    combatCommandForce(encounter.afterOpeningPlayerUnits);
    combatCommandHits(charts, encounter.afterOpeningPlayerChart, 1, 2);
    integer(encounter.afterOpeningMaximumManpower, 1);
  }
  if (encounter.ignorePlayerDefeatUntilRound !== undefined
      && encounter.ignorePlayerDefeatUntilRound !== encounter.afterOpeningRound) throw new RangeError('Invalid opening handoff');
  for (const reinforcement of encounter.reinforcements ?? []) {
    integer(reinforcement.round, 1);
    if (!['player', 'enemy'].includes(reinforcement.side)) throw new RangeError('Invalid reinforcement side');
    combatCommandForce(reinforcement.units);
  }
  for (const changes of [encounter.playerStrengthRounds, encounter.enemyStrengthRounds]) {
    for (const [round, value] of Object.entries(changes ?? {})) { integer(Number(round), 1); if (value !== null) integer(value); }
  }
  fight.startPlayer = copy(fight.player);
  if (!living(fight.enemies)) finish(fight, encounter.emptyEnemyOutcome);
  return fight;
}

function finish(fight, status) {
  fight.status = status;
  let target = fight.config[status];
  if (status === 'win' && fight.config.winWithinRounds !== undefined && fight.round <= fight.config.winWithinRounds) {
    target = fight.config.earlyWin;
  }
  if (status === 'win' && fight.config.winWithoutLosses !== undefined) {
    target = physical(fight.player) === physical(fight.startPlayer) ? fight.config.winWithoutLosses : fight.config.win;
  }
  const survivors = fight.config[status + 'BySurvivors'];
  if (survivors) target = survivors[String(physical(fight.player))] ?? survivors.multiple ?? target;
  const losses = fight.config[status + 'ByLosses'];
  if (losses) target = losses[String((fight.startingPhysical ?? physical(fight.startPlayer)) - physical(fight.player))] ?? target;
  fight.section = target == null ? null : String(target);
}

function outcome(fight) {
  const opening = fight.round <= (fight.config.ignorePlayerDefeatUntilRound ?? -1);
  if ((!fight.config.ignorePlayerDefeat && !opening && !living(fight.player)) || fight.player.some(unit => unit.essential && !unit.count)
      || fight.config.minimumPhysical && physical(fight.player) < fight.config.minimumPhysical) finish(fight, 'loss');
  else if (!living(fight.enemies) && !fight.config.refillEnemyEachRound) finish(fight, 'win');
  return fight.status !== 'fighting';
}

// A printed change of force can require information the book does not derive
// from the preceding vehicle damage. Keep the same encounter and its log.
export function resumeCombatCommandFight(previous, player) {
  if (previous?.rulesVersion !== 1 || previous.status !== 'awaiting-force') throw new RangeError('No force handoff pending');
  const fight = copy(previous), force = combatCommandForce(player);
  if (physical(force) > fight.config.afterOpeningMaximumManpower) throw new RangeError('Too many surviving men');
  fight.player = force;
  fight.startPlayer = copy(force);
  fight.startingPhysical = physical(force);
  fight.config.playerChart = fight.config.afterOpeningPlayerChart;
  delete fight.config.ignorePlayerDefeatUntilRound;
  fight.status = 'fighting';
  outcome(fight);
  return fight;
}

function ordered(force, keys, defaultOrder = 'loss') {
  if (keys !== undefined && (!Array.isArray(keys) || new Set(keys).size !== keys.length
      || keys.some(key => !force.some(unit => unit.key === key)))) throw new RangeError('Invalid unit order');
  const ranks = new Map((keys ?? []).map((key, index) => [key, index]));
  return [...force].sort((a, b) => {
    // Explicit protected units always remain last, even with a custom casualty order.
    if (defaultOrder === 'loss' && (a.lossPriority ?? 0) !== (b.lossPriority ?? 0)) return (a.lossPriority ?? 0) - (b.lossPriority ?? 0);
    const rank = key => ranks.has(key) ? ranks.get(key) : Number.MAX_SAFE_INTEGER;
    return rank(a.key) - rank(b.key) || (defaultOrder === 'fire' ? b.ordnance - a.ordnance : 0);
  });
}

function casualties(fight, force, hits, keys, event, player) {
  if (player && fight.config.prisonerShield) {
    const previous = fight.enemyHitsReceived ?? 0;
    fight.enemyHitsReceived = previous + hits;
    let absorbed = 0;
    for (let hit = previous; hit < previous + hits; hit++) {
      if (fight.config.prisonerShield === 'alternating' ? hit % 2 === 0 : hit === 0) absorbed++;
    }
    hits -= absorbed;
    event.absorbed = absorbed;
  }
  let candidates = ordered(force, keys).filter(unit => unit.count > 0 && (!unit.drone
    || player && fight.config.dronesCanTakeLossesFrom !== undefined && fight.round >= fight.config.dronesCanTakeLossesFrom));
  if (player && fight.config.separatePlayerTargets) candidates = [force[fight.round - 1]].filter(Boolean);
  if (player && fight.config.enemyHitDestroysKey && hits) candidates = force.filter(unit => unit.key === fight.config.enemyHitDestroysKey);
  for (const unit of candidates) {
    const removed = Math.min(unit.count, hits);
    if (!removed) continue;
    unit.count -= removed;
    if (player && unit.drone) fight.destroyedSpentDrones += Math.min(unit.spent, removed);
    unit.spent = Math.max(0, unit.spent - removed);
    if (player && unit.drone) fight.destroyedDrones += removed;
    event.losses.push({ key: unit.key, name: unit.name, count: removed });
    hits -= removed;
    if (!hits) break;
  }
}

function chartAt(config, side, round) {
  const changes = config[side + 'ChartRounds'];
  let chart = config[side + 'Chart'];
  for (const [start, value] of Object.entries(changes ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    if (round >= Number(start)) chart = value;
  }
  return chart;
}

function strength(fight, side, options) {
  const config = fight.config;
  const changes = Object.entries(config[side + 'StrengthRounds'] ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  let override;
  for (const [round, value] of changes) if (fight.round >= Number(round)) override = value;
  if (override !== undefined && override !== null) return integer(override);
  if (config[side + 'Strength'] !== undefined) return integer(config[side + 'Strength']);
  const force = side === 'player' ? fight.player : fight.enemies;
  if (side === 'enemy') return force.reduce((sum, unit) => sum + unit.count * unit.ordnance, 0);
  const ships = ordered(force.filter(unit => !unit.drone && unit.count), options.firingOrder, 'fire');
  let slots = config.halfPlayerFire ? Math.ceil(physical(force) / 2) : Infinity;
  let total = 0;
  for (const unit of ships) {
    const firing = Math.min(slots, unit.count);
    total += firing * unit.ordnance; slots -= firing;
  }
  let drones = Math.min(options.drones ?? 0, availableDrones(force));
  for (const unit of force.filter(unit => unit.drone)) {
    const firing = Math.min(drones, unit.count - unit.spent);
    total += firing * unit.ordnance;
    unit.spent += firing; fight.launchedDrones += firing; drones -= firing;
  }
  return total;
}

function attack(fight, side, options, roll, event) {
  const player = side === 'player';
  const power = strength(fight, side, options);
  const chart = chartAt(fight.config, side, fight.round);
  const manual = options[player ? 'playerRoll' : 'enemyRoll'];
  let total = null, dice = [];
  if (power) {
    if (manual !== undefined && manual !== null) total = integer(manual, 2, 12);
    else { dice = [integer(roll(6), 1, 6), integer(roll(6), 1, 6)]; total = dice[0] + dice[1]; }
  }
  const hits = power ? combatCommandHits(fight.charts, chart, power, total) : 0;
  const entry = { side, strength: power, chart, dice, total, hits, losses: [] };
  event.attacks.push(entry);
  if (!player && hits && fight.round <= (fight.config.interruptOnPlayerHitThroughRound ?? 0)) {
    entry.wounded = true;
    finish(fight, 'interrupted');
    return;
  }
  casualties(fight, player ? fight.enemies : fight.player, hits,
    options[player ? 'enemyLossOrder' : 'playerLossOrder'], entry, !player);
  if (!player) fight.enemyExchanges++;
  if (player && fight.config.singleAttackWinHits && hits >= fight.config.singleAttackWinHits) finish(fight, 'win');
  else outcome(fight);
}

export function combatCommandRound(previous, options = {}, roll = randomDie) {
  if (previous?.rulesVersion !== 1 || previous.status !== 'fighting') throw new RangeError('No active combat');
  const fight = copy(previous), config = fight.config;
  fight.round++;
  const drones = integer(options.drones ?? 0, 0, availableDrones(fight.player));
  if (drones && (!config.dronesMayAttack || config.droneRound && fight.round !== config.droneRound)) throw new RangeError('Drones cannot attack this round');
  if (drones && drones < (config.minimumDrones ?? 1)) throw new RangeError('Not enough drones selected');
  const event = { round: fight.round, attacks: [] };
  if (config.refillEnemyEachRound && fight.round > 1) fight.enemies = combatCommandForce(config.enemies);
  for (const reinforcement of config.reinforcements ?? []) {
    if (reinforcement.round !== fight.round) continue;
    const force = reinforcement.side === 'player' ? fight.player : fight.enemies;
    for (const unit of combatCommandForce(reinforcement.units)) {
      const existing = force.find(candidate => candidate.key === unit.key);
      if (existing) existing.count += unit.count;
      else force.push(unit);
    }
    if (reinforcement.side === 'player') fight.startingPhysical = (fight.startingPhysical ?? physical(fight.startPlayer)) + physical(reinforcement.units);
  }
  if (!outcome(fight)) {
    const playerFires = !config.enemyOnly && fight.round > (config.enemyFreeOpeningAttacks ?? 0);
    const enemyFires = !config.playerOnly && fight.round > (config.freeOpeningAttacks ?? 0)
      && fight.enemyExchanges < (config.enemyAmmo ?? Infinity);
    const order = config.initiative === 'enemy' ? ['enemy', 'player'] : ['player', 'enemy'];
    for (const side of order) {
      if (fight.status !== 'fighting') break;
      if (side === 'player' ? playerFires : enemyFires) attack(fight, side, { ...options, drones }, roll, event);
    }
    if (fight.status === 'fighting' && fight.round === config.afterOpeningRound) fight.status = 'awaiting-force';
    else if (fight.status === 'fighting' && fight.round >= (config.roundLimit ?? Infinity)) finish(fight, config.limitOutcome ?? 'survived');
  }
  fight.history.push(event);
  fight.history = fight.history.slice(-100);
  return fight;
}

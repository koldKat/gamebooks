import test from 'node:test';
import assert from 'node:assert/strict';
import { startFleetBattle, fleetBattleRound, resolveFleetBattleLosses, chooseFleetBattleSector,
  redistributeFleetBattle, waitFleetBattle, retreatFleetBattle, fleetBattlePlayers }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-battle.js';

const matrix = hits => Array.from({ length: 11 }, () => Array(11).fill(hits));
const charts = (a = 1, b = 0) => Object.fromEntries('ABCDEFG'.split('').map(key => [key, matrix(key === 'A' ? a : key === 'B' ? b : 0)]));
const force = (count = 6) => [{ key: 'dd', type: 'destroyer', name: 'Destroyers', count, ordnance: 1, hitsPerShip: 1 }];
const config = extra => ({ enemyInitial: 3, enemyOrdnance: 1, enemyChart: 'B', playerChart: 'A',
  retreat: { kind: 'manual-stop' }, ...extra });
const setup = extra => ({ morale: 9, stealth: 9, ...extra });
const action = extra => ({ playerRolls: [7], enemyRoll: 7, ...extra });
const noRandom = () => { throw Error('Deterministic test unexpectedly consumed dice'); };
const start = (entry = config(), tables = charts(), players = force(), options = setup()) => startFleetBattle(players, entry, tables, options, noRandom);
const round = (fight, extra) => fleetBattleRound(fight, action(extra), noRandom);
const divisions = extra => config({ enemyDivisions: [1, 2, 3],
  reinforcement: { mode: 'directional-divisions', timing: 'after-fire', delayByInitialDivision: {
    '1': { '2': 3, '3': 5 }, '2': { '1': 3, '3': 4 }, '3': { '1': 2, '2': 4 },
  } }, ...extra });

test('a full ordinary fight ends only when the enemy force is destroyed', () => {
  let fight = start(); const original = structuredClone(fight);
  fight = round(fight); assert.equal(fight.round, 1); assert.equal(fight.status, 'fighting');
  fight = round(fight); fight = round(fight);
  assert.equal(fight.status, 'victory'); assert.equal(fight.round, 3);
  assert.equal(fleetBattlePlayers(fight)[0].count, 6);
  assert.equal(original.round, 0); assert.equal(original.opposition.state.active, 3);
  assert.throws(() => round(fight), /No active/);
});

test('pool replacements join after the exchange, never in that round return fire', () => {
  let fight = start(config({ enemyInitial: 2, enemyPoolTotal: 5,
    reinforcement: { mode: 'replace-active-cap', cap: 2, timing: 'after-fire' } }));
  fight = round(fight);
  assert.equal(fight.opposition.state.active, 2); assert.equal(fight.opposition.state.reserve, 2);
  assert.equal(fight.history.find(event => event.kind === 'exchange').events[1].strength, 1);
  for (let i = 0; i < 4; i++) fight = round(fight);
  assert.equal(fight.status, 'victory'); assert.equal(fight.round, 5);
});

test('cumulative casualty reinforcements are checked until one arrival and never recreated', () => {
  let fight = start(config({ enemyInitial: 2, enemyPoolTotal: 5,
    reinforcement: { mode: 'cumulative-casualty-check-once', count: 3, dice: 2,
      trigger: 'roll-at-most-total-enemy-ships-destroyed', timing: 'after-fire' } }));
  fight = round(fight, { reinforcementDice: [1, 1] });
  assert.equal(fight.opposition.state.active, 1); assert.equal(fight.opposition.state.reinforcementArrived, false);
  fight = round(fight, { reinforcementDice: [1, 1] });
  assert.equal(fight.opposition.state.active, 3); assert.equal(fight.opposition.state.reinforcementArrived, true);
  fight = JSON.parse(JSON.stringify(fight));
  for (let i = 0; i < 3; i++) fight = round(fight);
  assert.equal(fight.status, 'victory');
  assert.equal(fight.history.filter(event => event.kind === 'reinforcement' && event.arrived > 0).length, 1);
});

test('pending loss allocation resumes a stored exchange and commits a round exactly once', () => {
  const players = [...force(3), { key: 'bc', type: 'battlecruiser', name: 'Battlecruisers', count: 2,
    ordnance: 1, hitsPerShip: 2, finishDamagedTypeFirst: true }];
  const initial = start(config(), charts(0, 2), players);
  const pending = round(initial);
  assert.equal(pending.status, 'awaiting-player-losses'); assert.equal(pending.round, 0);
  assert.equal(pending.exchange.current.roll.total, 7);
  const resolved = resolveFleetBattleLosses(JSON.parse(JSON.stringify(pending)), { bc: 2 }, noRandom);
  assert.equal(resolved.round, 1); assert.equal(resolved.status, 'fighting');
  assert.equal(resolved.player[1].count, 1);
  assert.equal(resolved.history.filter(event => event.kind === 'exchange').length, 1);
  assert.equal(pending.player[1].count, 2, 'canonical force is committed only on completion');
  assert.throws(() => resolveFleetBattleLosses(resolved, { bc: 2 }), /No fleet allocation/);
});

test('empty division gaps require a deliberate wait without firing at future ships', () => {
  let fight = start(divisions(), charts(), force(), setup({ initialDivision: 1 }));
  fight = round(fight);
  assert.equal(fight.status, 'awaiting-wave'); assert.equal(fight.round, 1);
  const previous = fight.history.filter(event => event.kind === 'exchange').length;
  fight = waitFleetBattle(fight, {}, noRandom);
  assert.equal(fight.round, 3); assert.equal(fight.status, 'fighting');
  assert.equal(fight.history.filter(event => event.kind === 'exchange').length, previous);
  fight = round(fight); fight = round(fight);
  assert.equal(fight.round, 5);
  assert.equal(fight.opposition.state.divisions[2].arrived, true);
  assert.equal(fight.opposition.state.divisions[2].count, 3);
  for (let i = 0; i < 3; i++) fight = round(fight);
  assert.equal(fight.status, 'victory');
});

test('overlapping divisions pause for explicit enemy losses and preserve arrivals across reload', () => {
  const entry = config({ enemyDivisions: [3, 2], reinforcement: { timing: 'after-fire',
    delayByInitialDivision: { '1': { '2': 1 }, '2': { '1': 1 } } } });
  let fight = start(entry, charts(), force(), setup({ initialDivision: 1 }));
  fight = round(fight); assert.equal(fight.opposition.state.divisions[1].arrived, true);
  fight = round(fight); assert.equal(fight.status, 'awaiting-enemy-losses');
  fight = resolveFleetBattleLosses(JSON.parse(JSON.stringify(fight)), { '2': 1 }, noRandom);
  assert.equal(fight.round, 2);
  assert.deepEqual(fight.opposition.state.divisions.map(division => division.count), [2, 1]);
});

test('winning on the exact do-or-die round limit does not count as a victory before that limit', () => {
  const entry = config({ roundLimit: 3, victoryRequires: 'before-round-limit' });
  let fight = start(entry);
  for (let i = 0; i < 3; i++) fight = round(fight);
  assert.equal(fight.status, 'time-limit');
  let early = start({ ...entry, enemyInitial: 2 }); early = round(early); early = round(early);
  assert.equal(early.status, 'victory');
});

test('a holdout reaches support without starting a new fight or changing the player force', () => {
  let fight = start(config({ roundLimit: 2, limitOutcome: 'support-arrived' }), charts(0));
  fight = round(fight); fight = round(fight);
  assert.equal(fight.status, 'support-arrived'); assert.equal(fight.opposition.state.active, 3);
  assert.equal(fight.player[0].count, 6);
});

test('mandatory morale failure pauses for retreat; failed Stealth resumes the same fight', () => {
  const entry = config({ retreat: { kind: 'voluntary-or-forced', forcedWhen: 'player-losses-exceed-enemy-losses', stealthAttempts: 1 } });
  let fight = start(entry, charts(0, 1), force(3), setup({ morale: 0 }));
  fight = round(fight, { moraleRoll: 2 }); assert.equal(fight.status, 'retreat-required');
  assert.throws(() => round(fight), /pending/);
  fight = retreatFleetBattle(fight, { stealthRolls: [12] }, noRandom);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.round, 1);
  fight = round(fight, { moraleRoll: 2 });
  fight = retreatFleetBattle(fight, { stealthRolls: [2] }, noRandom);
  assert.equal(fight.status, 'withdrawn');
});

test('voluntary morale gates and three-try Stealth are encounter-specific', () => {
  let fight = start(config({ retreat: { kind: 'morale-gated-voluntary', stealthAttempts: 1 } }), charts(0));
  fight = round(fight);
  const blocked = retreatFleetBattle(fight, { moraleRoll: 12, stealthRolls: [2] }, noRandom);
  assert.equal(blocked.status, 'fighting'); assert.equal(blocked.history.at(-1).tests.length, 1);
  assert.equal(retreatFleetBattle(fight, { moraleRoll: 2, stealthRolls: [2] }, noRandom).status, 'withdrawn');
  let three = start(config({ retreat: { kind: 'voluntary-or-forced', stealthAttempts: 3 } }), charts(0));
  three = round(three);
  three = retreatFleetBattle(three, { stealthRolls: [12, 11, 2] }, noRandom);
  assert.equal(three.status, 'withdrawn'); assert.equal(three.history.at(-2).tests.length, 3);
});

test('the ambiguous automatic withdrawal is an explicit source interpretation after no enemy fire', () => {
  const entry = divisions({ retreat: { kind: 'voluntary-or-forced', stealthAttempts: 1, sourceAmbiguity: 'Printed instructions disagree.' } });
  let fight = start(entry, charts(), force(), setup({ initialDivision: 1 })); fight = round(fight);
  fight = retreatFleetBattle(fight, { automaticNoEnemyFire: true }, noRandom);
  assert.equal(fight.status, 'withdrawn'); assert.equal(fight.history.at(-2).tests.length, 0);
  let fired = start(entry, charts(0), force(), setup({ initialDivision: 1 })); fired = round(fired);
  assert.throws(() => retreatFleetBattle(fired, { automaticNoEnemyFire: true }, noRandom), /unavailable/);
});

test('sector transitions preserve wounds and the whole-battle special-use flag', () => {
  const players = [{ key: 'bc', name: 'BC', type: 'battlecruiser', count: 2, ordnance: 1,
    hitsPerShip: 2, finishDamagedTypeFirst: true }, ...force(3)];
  const entry = config({ playerChart: undefined, enemySectors: [3, 3], initialSector: 'player-choice',
    canEngageAnotherSector: true, firingOrder: 'destroyer-until-special-or-eliminated',
    playerCharts: { battlecruiser: 'C', destroyer: 'D' }, casualtyFallbackWhenPrimaryEliminated: true,
    specialAttack: { volleys: 2, chart: 'A', maximumUses: 1, scope: 'whole-battle', requiresSurvivingDestroyers: true,
      eligibility: 'battlecruisers-not-yet-fired' } });
  const tables = charts(1, 1); tables.C = matrix(1);
  let fight = start(entry, tables, players, setup({ initialSector: 1 }));
  fight = round(fight, { special: true, playerRolls: [7, 7] });
  assert.equal(fight.player[0].damage, 1);
  fight = round(fight); assert.equal(fight.status, 'awaiting-sector');
  fight = chooseFleetBattleSector(fight, 2);
  assert.equal(fight.player[0].damage, 1); assert.equal(fight.tactics.specialUsed, true);
  assert.throws(() => round(fight, { special: true, playerRolls: [7, 7] }), /unavailable/);
});

test('globe/cylinder stop after their first sector and the sector limit applies only to unengaged enemies', () => {
  let globe = start(config({ enemySectors: [1, 1], initialSector: 'player-choice', canEngageAnotherSector: false }),
    charts(), force(), setup({ initialSector: 1 }));
  globe = round(globe); assert.equal(globe.status, 'unengaged-enemies');
  const limited = config({ enemySectors: [1, 1], initialSector: 'player-choice', canEngageAnotherSector: true,
    roundLimit: 2, limitCondition: 'unengaged-enemy-sectors-remain' });
  let fight = start(limited, charts(0), force(), setup({ initialSector: 1 }));
  fight = round(fight); fight = round(fight); assert.equal(fight.status, 'unengaged-enemies');
  let isolated = start({ ...limited, enemySectors: [1, 0] }, charts(0), force(), setup({ initialSector: 1 }));
  isolated = round(isolated); isolated = round(isolated); assert.equal(isolated.status, 'fighting');
});

const dispersed = () => config({ playerChart: undefined, enemySectors: [1, 1, 1],
  firingOrder: 'each-sector-in-order', playerCharts: { destroyer: 'A', battlecruiser: 'C' },
  roundLimit: 20, limitCondition: 'unengaged-enemy-sectors-remain' });
const dividedSetup = () => setup({ allocation: { '1': { dd: 1 }, '2': { dd: 1 }, '3': { dd: 1 } } });

test('a complete dispersed battle moves survivors forward without advancing rounds per sector', () => {
  let fight = start(dispersed(), charts(), force(3), dividedSetup());
  fight = round(fight, { wing: 'destroyer' });
  assert.equal(fight.round, 0); assert.equal(fight.status, 'awaiting-redistribution');
  assert.throws(() => retreatFleetBattle(fight, {}, noRandom), /end of a round/);
  fight = redistributeFleetBattle(fight, { '2': { 'dd>1': 1 } });
  fight = round(fight, { wing: 'destroyer' });
  fight = redistributeFleetBattle(fight, { '3': { 'dd>2': 1, 'dd>1>2': 1 } });
  fight = round(fight, { wing: 'destroyer' });
  assert.equal(fight.status, 'victory'); assert.equal(fleetBattlePlayers(fight).reduce((sum, unit) => sum + unit.count, 0), 3);
});

test('wiped dispersed sectors stay unengaged and an explicit wait resolves the round-limit condition', () => {
  const tables = charts(0, 1); tables.A[5] = Array(11).fill(1);
  let fight = start(dispersed(), tables, force(3), dividedSetup());
  fight = round(fight, { wing: 'destroyer', playerRolls: [7] });
  fight = redistributeFleetBattle(fight);
  fight = round(fight, { wing: 'destroyer', playerRolls: [8] });
  fight = round(fight, { wing: 'destroyer', playerRolls: [8] });
  assert.equal(fight.status, 'blocked-sectors'); assert.equal(fight.round, 1);
  fight = waitFleetBattle(fight, {}, noRandom);
  assert.equal(fight.status, 'unengaged-enemies'); assert.equal(fight.round, 20);
});

test('missing normal-globe setup and excessive prior pool losses fail without invented values', () => {
  assert.throws(() => start(config({ enemyInitial: null, enemyChart: null })), /enemy firing chart/);
  assert.throws(() => start(config({ enemyInitial: 3, enemyPoolTotal: 5,
    reinforcement: { mode: 'replace-active-cap', cap: 3, timing: 'after-fire' } }), charts(), force(),
  setup({ priorEnemyLosses: 3 })), /Active ships/);
});

test('all firing charts are validated before initial random sector selection', () => {
  const entry = config({ enemySectors: [1, 1, 1, 1, 1, 1], initialSector: 'random-d6',
    specialAttack: { chart: 'G' } });
  const tables = charts(); delete tables.G;
  assert.throws(() => start(entry, tables), /Invalid combat chart/);
  assert.throws(() => start(config({ enemyChartOverrides: [{ division: '3', chart: 'G' }] }), tables), /Invalid combat chart/);
  assert.throws(() => start(config({ playerChart: undefined })), /Choose a combat chart/);
});

test('an edited depleted initial division waits for surviving divisions without an empty exchange', () => {
  let fight = start(divisions({ enemyDivisions: [0, 1, 0] }), charts(), force(), setup({ initialDivision: 1 }));
  assert.equal(fight.status, 'awaiting-wave'); assert.equal(fight.round, 0);
  assert.throws(() => round(fight), /pending battle action/);
  fight = waitFleetBattle(fight, {}, noRandom);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.round, 3);
  fight = round(fight); assert.equal(fight.status, 'victory');
});

test('custom fights retain separately editable enemy groups and ask which group takes hits', () => {
  let fight = start(config({ enemyOrdnance: undefined, enemies: [
    { key: 'scouts', type: 'enemy', name: 'Scout cruisers', count: 1, ordnance: 2, hitsPerShip: 1 },
    { key: 'heavy', type: 'enemy', name: 'Heavy cruisers', count: 2, ordnance: 8, hitsPerShip: 1 },
  ] }));
  fight = round(fight);
  assert.equal(fight.status, 'awaiting-enemy-losses');
  fight = resolveFleetBattleLosses(JSON.parse(JSON.stringify(fight)), { heavy: 1 }, noRandom);
  assert.equal(fight.history[0].events.find(event => event.side === 'enemy').strength, 10);
  assert.deepEqual(fight.opposition.state.units.map(unit => unit.count), [1, 1]);
  fight = round(fight);
  fight = resolveFleetBattleLosses(fight, { scouts: 1 }, noRandom);
  fight = round(fight);
  assert.equal(fight.status, 'victory'); assert.equal(fight.round, 3);
  assert.throws(() => start(config({ enemies: [{ key: 'heavy', type: 'enemy', name: 'Heavy', count: 1,
    ordnance: 8, hitsPerShip: 2 }] })), /one hit/);
});

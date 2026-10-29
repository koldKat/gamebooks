import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combatCommandForce, combatCommandHits, combatCommandTest, startCombatCommandFight,
  combatCommandRound } from '../../../../public/js/battlesim/engines/combat-command/core.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog = JSON.parse(readFileSync('data/simulator-rosters/1467.json'));
const entries = [...new Map(catalog.enemies.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
const source = section => structuredClone(entries.find(entry => entry.section === String(section)));
const defaults = entries[0].playerDefaults, charts = entries[0].charts;
const unit = (key, count, ordnance, extra = {}) => ({ key, name: key, count, ordnance, ...extra });
const fleet = () => structuredClone(defaults.fleet);
const selected = keys => fleet().filter(ship => keys.includes(ship.key));
const start = (section, player, overrides = {}) => startCombatCommandFight(player ?? fleet(), { ...source(section), ...overrides }, charts);
const round = (fight, values = {}) => combatCommandRound(fight, { playerRoll: 2, enemyRoll: 2, ...values });
const forbiddenDice = () => { throw Error('Unexpected dice roll'); };

test('database catalog reconstructs every actual encounter and all seven printed matrices', async () => {
  const rows = catalog.enemies.map(row => ({ name: row.name, stats: row.stats }));
  const loaded = await loadRosterDataset(1467, 'CATALOG', async () => ({ ok: true, json: async () => rows }));
  assert.equal(loaded.length, 26);
  assert.deepEqual(loaded.map(e => e.section), ['4','15','16','18','20','22','32','38','40','42','52','53','56','60','61','67','69','81','82','83','93','96','97','99','100','102']);
  assert.equal(Object.values(charts).flat(2).length, 847);
  assert.equal(defaults.fleet.filter(u => !u.drone).length, 24);
  assert.equal(defaults.fleet.find(u => u.drone).count, 9);
  assert.equal(defaults.morale, 9); assert.equal(defaults.stealth, 8);
  assert.equal(defaults.fleet.find(u => u.key === 'inverness').ordnance, 14);
  assert.equal(defaults.fleet.filter(u => !u.drone).reduce((s,u) => s + u.ordnance, 0), 161);
});

test('chart columns use ten-point bands, 101+ caps, and zero strength never causes damage', () => {
  const row = [4,4,5,6,7,7,8,9,10,11,12];
  for (let strength = 1; strength <= 150; strength++) {
    assert.equal(combatCommandHits(charts,'A',strength,12), row[Math.min(10,Math.ceil(strength/10)-1)]);
  }
  for (const chart of Object.keys(charts)) {
    assert.equal(combatCommandHits(charts,chart,0,12), 0);
    assert.throws(() => combatCommandHits(charts,chart,10,13));
  }
  assert.throws(() => combatCommandHits({},'A',10,2));
});

test('morale and stealth equality succeed with exactly two ordinary dice', () => {
  const dice = [3,5];
  assert.deepEqual(combatCommandTest(8, () => dice.shift()), { dice: [3,5], total: 8, passed: true });
  assert.equal(combatCommandTest(7, () => 4).passed, false);
  assert.throws(() => combatCommandTest(8, () => 7));
});

test('tanker shoots first, casualties reduce immediate return fire, and outcomes distinguish losses', () => {
  const config = source(4), player = selected(config.playerKeys);
  const fight = start(4, player), before = JSON.stringify(fight);
  const next = round(fight, { playerRoll:12, enemyRoll:12 });
  assert.equal(JSON.stringify(fight), before, 'combat does not mutate saved input');
  assert.deepEqual(next.history[0].attacks.map(a => [a.side,a.strength]), [['enemy',8],['player',7]]);
  assert.equal(next.status, 'win'); assert.equal(next.section, '7');
  const noLoss = round(start(4,player), { playerRoll:12,enemyRoll:2 });
  assert.equal(noLoss.section, '9');
});

test('boarding distinguishes mixed forces, troop losses and branch-specific charts', () => {
  for (const [section,strength,chart] of [[15,63,'B'],[16,63,'B'],[18,66,'B'],[38,81,'C']]) {
    const entry = source(section), next = round(start(section, entry.playerUnits));
    assert.equal(next.history[0].attacks[0].strength, strength);
    assert.equal(next.history[0].attacks[0].chart, chart);
  }
  assert.equal(source(22).enemyChart, 'D');
  for (const section of [20,40,42]) assert.equal(source(section).enemyChart, 'E');
});

test('a cruiser is one physical casualty and never shoots after it has been destroyed', () => {
  const fight = start(15,[unit('hero',100,9)], { enemies:[unit('cruiser',1,12),unit('escort',2,6)], playerChart:'C' });
  const next = round(fight, { playerRoll:2 });
  assert.equal(next.enemies[0].count, 0);
  assert.equal(next.history[0].attacks[1].strength, 6);
});

test('Risk and Inverness stay last even when casualty selection tries to put them first', () => {
  const fight = start(99);
  const next = round(fight, { enemyRoll:12,playerLossOrder:['inverness','risk'] });
  assert.equal(next.player.find(u => u.key === 'inverness').count, 1);
  assert.equal(next.player.find(u => u.key === 'risk').count, 1);
  assert.equal(next.player.filter(u => !u.drone).reduce((s,u) => s+u.count,0), 19);
  assert.equal(next.section, '100');
});

test('recon potshots hit two separate birds and cannot spill into another target', () => {
  const birds = [unit('bird-a',1,7),unit('bird-b',1,7)];
  let fight = start(32,birds);
  fight = round(fight,{enemyRoll:12});
  assert.deepEqual(fight.player.map(u => u.count), [0,1]);
  fight = round(fight,{enemyRoll:12});
  assert.deepEqual(fight.player.map(u => u.count), [0,0]);
  assert.equal(fight.status, 'survived'); assert.equal(fight.section,'31');
  assert.ok(fight.history.every(event => event.attacks.length === 1));
});

test('fleet attack changes chart after round two and only permits at least three drones on round two', () => {
  let fight = start(53,undefined,{ enemies:[unit('many',1000,0)] });
  assert.throws(() => round(fight,{drones:3}));
  fight = round(fight);
  assert.throws(() => round(fight,{drones:2}));
  fight = round(fight,{drones:3});
  assert.equal(fight.history[1].attacks[0].strength, 224);
  assert.equal(fight.history[1].attacks[0].chart,'D');
  assert.equal(fight.launchedDrones,3);
  fight = round(fight);
  assert.equal(fight.history[2].attacks[0].chart,'C');
  assert.equal(fight.history[2].attacks[0].strength,161);
  assert.throws(() => round(fight,{drones:3}));
});

test('drones cannot absorb round-one casualties but do absorb round-two losses', () => {
  let fight = start(53,undefined,{ enemies:[unit('many',1000,1)] });
  fight = round(fight,{enemyRoll:12});
  assert.equal(fight.player.find(u => u.drone).count,9);
  fight = round(fight,{enemyRoll:12,drones:3});
  assert.equal(fight.player.find(u => u.drone).count,3);
  assert.equal(fight.destroyedDrones,6);
});

test('enemy-first drone strike recalculates the surviving attack and cannot reuse launched drones', () => {
  const player = [unit('drones',9,21,{drone:true,lossPriority:-1})];
  const next = round(start(56,player),{drones:9,enemyRoll:12,playerRoll:2});
  assert.deepEqual(next.history[0].attacks.map(a => a.side), ['enemy','player']);
  assert.equal(next.history[0].attacks[1].strength,84);
  assert.equal(next.launchedDrones,4); assert.equal(next.destroyedDrones,5);
  assert.equal(next.section,'63');
  assert.throws(() => round(next,{drones:1}));
});

test('cut and run recalculates half of physical ships and only fifteen enemy ships fire', () => {
  const force = [unit('cruiser',1,14),unit('escorts',4,7),unit('tug',1,0)];
  const next = round(start(81,force,{minimumPhysical:1}),{enemyRoll:12});
  assert.equal(next.history[0].attacks[0].strength,28);
  assert.equal(next.history[0].attacks[1].strength,45);
  const again = round(next);
  assert.equal(again.history[1].attacks[0].strength,14);
  assert.equal(next.enemies[0].count,15);
});

test('braking gives three free attacks followed by eight actual enemy exchanges', () => {
  let fight = start(82,[unit('navy',100,0)],{enemies:[unit('pirates',100,0)]});
  for (let i=1;i<=11;i++) {
    fight = combatCommandRound(fight,{},forbiddenDice);
    assert.equal(fight.enemyExchanges,Math.max(0,i-3));
    assert.equal(fight.status,i===11?'survived':'fighting');
  }
  assert.equal(fight.section,'86');
});

test('porcupine allows two free attacks after eight exchanges and succeeds with survivors', () => {
  let fight = start(83,[unit('navy',100,0)],{enemies:[unit('pirates',100,0)]});
  for (let i=0;i<10;i++) fight = combatCommandRound(fight,{},forbiddenDice);
  assert.equal(fight.enemyExchanges,8); assert.equal(fight.section,'87');
  assert.equal(fight.history[8].attacks.length,1); assert.equal(fight.history[9].attacks.length,1);
});

test('bomb dies before returning fire, but an enemy hit destroys the protected flagship', () => {
  let next = round(start(93),{playerRoll:12,enemyRoll:12});
  assert.equal(next.section,'94'); assert.equal(next.history[0].attacks.length,1);
  next = round(start(93),{playerRoll:2,enemyRoll:12});
  assert.equal(next.section,'29'); assert.equal(next.player.find(u => u.key==='inverness').count,0);
  assert.equal(next.player.find(u => u.key==='risk').count,1);
});

test('asteroid drone strike requires two hits and has no return fire', () => {
  const drones = [unit('drones',9,21,{drone:true})];
  const win = round(start(96,drones),{drones:3,playerRoll:12});
  assert.equal(win.section,'98'); assert.equal(win.launchedDrones,3);
  assert.equal(win.history[0].attacks.length,1);
  assert.equal(round(start(96,drones),{drones:1,playerRoll:2}).section,'97');
});

test('conventional asteroid attack wins on three in one shot or four cumulative, otherwise fails after two', () => {
  const big = round(start(97,[unit('navy',1,50)]),{playerRoll:12});
  assert.equal(big.section,'98'); assert.equal(big.history[0].attacks[0].hits,4);
  let cumulative = round(start(97,[unit('navy',1,10)]),{playerRoll:12});
  assert.equal(cumulative.status,'fighting');
  cumulative = round(cumulative,{playerRoll:12});
  assert.equal(cumulative.section,'98');
  let miss = round(start(97,[unit('navy',1,10)])); miss=round(miss);
  assert.equal(miss.section,'99');
});

test('scout interceptions use the different printed charts, one shot, and no enemy fire', () => {
  for (const [section,win,loss] of [[100,'101','102'],[102,'101','104']]) {
    const entry=source(section);
    const hit=round(start(section,entry.playerUnits),{playerRoll:12});
    assert.equal(hit.section,win); assert.equal(hit.history[0].attacks.length,1);
    assert.equal(round(start(section,entry.playerUnits)).section,loss);
  }
});

test('custom forces work without a source preset, preserve extensions and reject malformed input', () => {
  const player=[unit('custom',3,4,{extension:{kept:true}})];
  const fight=startCombatCommandFight(player,{playerChart:'A',enemyChart:'G',enemies:[unit('foe',20,1)]},charts);
  const snapshot=JSON.stringify(fight);
  assert.deepEqual(round(fight).player[0].extension,{kept:true});
  assert.equal(JSON.stringify(fight),snapshot);
  assert.throws(()=>combatCommandForce([unit('a',1,1),unit('a',1,1)]));
  assert.throws(()=>combatCommandForce([unit('a',-1,1)]));
  assert.throws(()=>round(fight,{enemyRoll:13}));
  assert.throws(()=>round(fight,{firingOrder:['missing']}));
});

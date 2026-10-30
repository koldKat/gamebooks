import test from 'node:test';
import assert from 'node:assert/strict';
import { combatCommandHits, startCombatCommandFight, combatCommandRound,
  resolveCombatCommandChartResult, resolveCombatCommandCasualties,
} from '../../../../public/js/battlesim/engines/combat-command/core.js';
import { combatCommandPlayerSetup, rememberCombatCommandForce } from '../../../../public/js/battlesim/engines/combat-command/force-state.js';

// Synthetic charts isolate rule behavior; book-owned matrices remain in the DB.
const matrix = hits => Array.from({length:11}, () => Array(11).fill(hits));
const charts = () => ({A:matrix(0),B:matrix(0),C:matrix(0),D:matrix(0)});
const unit = (key,count,ordnance,extra={}) => ({key,name:key,count,ordnance,...extra});
const player = () => [unit('party',6,10)];
const start = (config={}, tables=charts(), force=player()) => startCombatCommandFight(force,
  {playerChart:'A',enemyChart:'D',enemies:[unit('enemy',6,10)],win:'victory',loss:'defeat',...config},tables);
const noRoll = () => {throw Error('Unexpected roll');};
const round = (fight,options={}) => combatCommandRound(fight,{playerRoll:8,enemyRoll:8,...options},noRoll);
const reload = value => JSON.parse(JSON.stringify(value));
const blankCharts = () => {const result=charts();result.A[6][5]=null;return result;};

test('blank cells require explicit permission and never replace valid cells or zero strength',()=>{
  const tables=blankCharts();
  assert.throws(()=>start({},tables),/Invalid combat chart/);
  assert.throws(()=>combatCommandHits(tables,'A',60,8),/Invalid combat chart/);
  assert.equal(combatCommandHits(tables,'A',60,8,{allowBlankCells:true}),null);
  assert.equal(combatCommandHits(tables,'A',50,8,{allowBlankCells:true}),0);
  assert.equal(combatCommandHits(tables,'A',0,8,{allowBlankCells:true}),0);
  tables.A[0][0]=undefined;
  assert.throws(()=>start({manualBlankChartResults:true},tables),/Invalid combat chart/);
});

test('a blank player result pauses on its rolled dice and resumes once with reduced return strength',()=>{
  const initial=start({manualBlankChartResults:true},blankCharts()),original=JSON.stringify(initial);
  let calls=0;
  const pending=combatCommandRound(initial,{enemyRoll:2},()=>{calls++;return 4;});
  assert.equal(JSON.stringify(initial),original);assert.equal(calls,2);
  assert.equal(pending.status,'awaiting-chart-value');
  assert.deepEqual(pending.history[0].attacks[0].dice,[4,4]);
  assert.equal(pending.history[0].attacks[0].hits,null);
  assert.equal(pending.enemyExchanges,0);
  const frozen=JSON.stringify(pending),fight=resolveCombatCommandChartResult(reload(pending),2,noRoll);
  assert.equal(JSON.stringify(pending),frozen);
  assert.equal(fight.status,'fighting');assert.equal(fight.round,1);
  assert.equal(fight.history.length,1);assert.equal(fight.history[0].attacks.length,2);
  assert.equal(fight.history[0].attacks[1].strength,40);
  assert.equal(fight.history[0].attacks[0].manualChartResult,true);
  assert.equal(fight.enemies[0].count,4);assert.equal(fight.enemyExchanges,1);
  assert.equal(fight.charts.A[6][5],null,'the source chart remains blank');
  assert.throws(()=>resolveCombatCommandChartResult(fight,2),/No blank chart result/);
});

test('a lethal manual result ends immediately without rolling an enemy reply',()=>{
  const pending=round(start({manualBlankChartResults:true},blankCharts()));
  const fight=resolveCombatCommandChartResult(pending,20,noRoll);
  assert.equal(fight.status,'win');assert.equal(fight.section,'victory');
  assert.equal(fight.history[0].attacks.length,1);assert.equal(fight.enemyExchanges,0);
  assert.equal(fight.history[0].attacks[0].losses[0].count,6);
});

test('successive blank results on opposing sides retain the same round and both rolls',()=>{
  let fight=round(start({manualBlankChartResults:true,enemyChart:'A'},blankCharts()));
  fight=resolveCombatCommandChartResult(reload(fight),0,noRoll);
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.pendingChartResult.side,'enemy');
  assert.equal(fight.history[0].attacks.length,2);assert.equal(fight.enemyExchanges,0);
  fight=resolveCombatCommandChartResult(reload(fight),1,noRoll);
  assert.equal(fight.status,'fighting');assert.equal(fight.round,1);assert.equal(fight.enemyExchanges,1);
  assert.equal(fight.player[0].count,5);assert.equal(fight.history[0].attacks.length,2);
  assert.deepEqual(fight.history[0].attacks.map(a=>a.total),[8,8]);
});

test('enemy-first blank results resolve casualties before the player counterattack',()=>{
  let fight=round(start({manualBlankChartResults:true,enemyChart:'A',initiative:'enemy'},blankCharts()));
  assert.equal(fight.pendingChartResult.side,'enemy');
  fight=resolveCombatCommandChartResult(reload(fight),1,noRoll);
  assert.deepEqual(fight.history[0].attacks.map(a=>[a.side,a.strength]),[['enemy',60],['player',50]]);
  assert.equal(fight.enemyExchanges,1);assert.equal(fight.player[0].count,5);
});

test('a manual enemy result can pause again for casualty allocation without losing the counterattack',()=>{
  let fight=round(start({manualBlankChartResults:true,enemyChart:'A',initiative:'enemy',
    playerCasualtyPolicy:{discretion:true}},blankCharts()));
  fight=resolveCombatCommandChartResult(reload(fight),1,noRoll);
  assert.equal(fight.status,'awaiting-losses');assert.deepEqual(fight.pendingCasualties.remainingAttacks,['player']);
  fight=resolveCombatCommandCasualties(reload(fight),{party:1},noRoll);
  assert.equal(fight.status,'fighting');assert.equal(fight.round,1);
  assert.deepEqual(fight.history[0].attacks.map(a=>a.strength),[60,50]);
  assert.equal(fight.enemyExchanges,1);
});

test('casualty allocation can lead into a blank counterattack and finish a limited round once',()=>{
  const tables=blankCharts();tables.D=matrix(1);tables.A[6][4]=null;
  let fight=round(start({manualBlankChartResults:true,initiative:'enemy',roundLimit:1,
    playerCasualtyPolicy:{discretion:true}},tables));
  assert.equal(fight.status,'awaiting-losses');
  fight=resolveCombatCommandCasualties(reload(fight),{party:1},noRoll);
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.pendingChartResult.side,'player');
  fight=resolveCombatCommandChartResult(reload(fight),0,noRoll);
  assert.equal(fight.status,'survived');assert.equal(fight.round,1);
  assert.equal(fight.history[0].attacks.length,2);assert.equal(fight.enemyExchanges,1);
});

test('invalid manual results and stale pending pointers leave saved combat untouched',()=>{
  const pending=round(start({manualBlankChartResults:true},blankCharts())),saved=JSON.stringify(pending);
  for(const hits of [-1,1.5,NaN,Infinity,'2',1000001]) {
    assert.throws(()=>resolveCombatCommandChartResult(pending,hits));assert.equal(JSON.stringify(pending),saved);
  }
  for(const change of [f=>f.pendingChartResult.round++,f=>f.pendingChartResult.attackIndex++,
    f=>f.pendingChartResult.side='enemy',f=>f.history[0].attacks[0].hits=0]) {
    const bad=reload(pending);change(bad);assert.throws(()=>resolveCombatCommandChartResult(bad,1));
  }
  assert.throws(()=>round(pending),/No active combat/);
});

test('guns may switch on in a later round, change only their specified chart, and remain on after reload',()=>{
  let fight=start({playerChart:'D',firearms:{ordnance:10,chart:'B'}},charts(),[unit('party',5,6)]);
  fight=round(fight);assert.equal(fight.history[0].attacks[0].strength,30);
  const saved=JSON.stringify(fight);
  fight=round(reload(fight),{useFirearms:true});
  assert.equal(JSON.stringify(JSON.parse(saved).player),JSON.stringify([unit('party',5,6,{spent:0})]));
  assert.deepEqual(fight.history[1].attacks.map(a=>a.chart),['B','D']);
  assert.equal(fight.history[1].attacks[0].strength,50);assert.equal(fight.firearmsRound,2);
  fight=round(reload(fight),{useFirearms:false});
  assert.equal(fight.firearmsRound,2);assert.equal(fight.player[0].ordnance,10);
  assert.equal(fight.history[2].attacks[0].chart,'B');
  const unchanged=round(start({playerChart:'C',firearms:{ordnance:10}},charts(),[unit('party',5,6)]),{useFirearms:true});
  assert.equal(unchanged.history[0].attacks[0].chart,'C');
});

test('unavailable and malformed gun requests are atomic and cannot affect ordinary saved fights',()=>{
  const fight=start(),saved=JSON.stringify(fight);
  assert.throws(()=>round(fight,{useFirearms:true}),/unavailable/);
  assert.throws(()=>round(fight,{useFirearms:'yes'}),/Invalid firearm choice/);
  assert.equal(JSON.stringify(fight),saved);
  assert.throws(()=>start({firearms:{ordnance:0}}));
  assert.throws(()=>start({firearms:{ordnance:10,chart:'missing'}}));
  const ordinary=round(fight);assert.equal(Object.hasOwn(ordinary,'firearmsUsed'),false);
});

test('a firearm change is preserved while its blank chart result waits for a reader decision',()=>{
  let fight=round(start({manualBlankChartResults:true,playerChart:'D',firearms:{ordnance:10,chart:'A'}},
    blankCharts(),[unit('party',6,6)]),{useFirearms:true});
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.firearmsRound,1);
  fight=resolveCombatCommandChartResult(reload(fight),1,noRoll);
  assert.equal(fight.player[0].ordnance,10);assert.equal(fight.firearmsRound,1);
  assert.equal(fight.history[0].attacks[0].strength,60);
});

test('remembering gunfire casualties preserves the ordinary combat value for the next setup',()=>{
  const tables=charts();tables.D=matrix(1);
  const fight=round(start({playerChart:'B',firearms:{ordnance:10}},tables,[unit('party',6,7)]),{useFirearms:true});
  const state={custom:{}};
  rememberCombatCommandForce(state,fight.player,{restoreWeaponValues:true});
  assert.equal(fight.player[0].ordnance,10);assert.equal(fight.player[0].count,5);
  assert.equal(state.playerForce[0].ordnance,7);assert.equal(state.playerForce[0].count,5);
  assert.equal(Object.hasOwn(state.playerForce[0],'ordnanceBeforeFirearms'),false);
  const next=combatCommandPlayerSetup(state,{playerUnits:[unit('party',9,6)]},{},true);
  assert.equal(next[0].count,5);assert.equal(next[0].ordnance,7);
});

test('retreat threshold ends before return fire, including an edited force already at the threshold',()=>{
  const tables=charts();tables.B=matrix(6);
  const fight=round(start({playerChart:'B',enemyRetreatAt:2,enemies:[unit('wolves',8,6)]},tables));
  assert.equal(fight.status,'win');assert.equal(fight.enemyFled,2);assert.equal(fight.enemyExchanges,0);
  assert.equal(fight.enemies[0].count,2);assert.equal(fight.history[0].attacks.length,1);
  const already=start({enemyRetreatAt:2,enemies:[unit('wolves',2,6)]});
  assert.equal(already.status,'win');assert.equal(already.enemyFled,2);assert.equal(already.round,0);
  assert.throws(()=>start({enemyRetreatAt:-1}));
  const wiped=round(start({playerChart:'B',enemyRetreatAt:2},tables));
  assert.equal(wiped.enemies[0].count,0);assert.equal(wiped.status,'win');
});

test('one extra opening attack yields exactly two player attacks before the first enemy reply',()=>{
  let fight=start({freeOpeningAttacks:1});
  fight=round(fight);fight=round(reload(fight));
  assert.deepEqual(fight.history.flatMap(event=>event.attacks.map(a=>a.side)),['player','player','enemy']);
});

test('mandatory first casualty keeps the hero safe even when a custom loss order asks otherwise',()=>{
  const tables=charts();tables.D=matrix(1);
  const fight=round(start({playerChart:'B'},tables,[
    unit('companion',1,6),unit('hero',1,6,{lossPriority:1,essential:true}),
  ]),{playerLossOrder:['hero','companion']});
  assert.deepEqual(fight.player.map(u=>u.count),[0,1]);assert.equal(fight.status,'fighting');
});

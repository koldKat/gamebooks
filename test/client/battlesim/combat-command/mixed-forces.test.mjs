import test from 'node:test';
import assert from 'node:assert/strict';
import { startCombatCommandFight, combatCommandRound, resolveCombatCommandCasualties } from '../../../../public/js/battlesim/engines/combat-command/core.js';
import { combatCommandPlayerSetup, rememberCombatCommandForce } from '../../../../public/js/battlesim/engines/combat-command/force-state.js';

const matrix = hits => Array.from({length:11},()=>Array(11).fill(hits));
const unit = (key,type,count,ordnance=1) => ({key,name:key,type,count,ordnance});
const cycle = {cycle:['infantry','tanks']};
const force = () => [unit('tanks','tanks',5,4),unit('infantry','infantry',5,2)];
const start = (rules={}, player=force(), hits=3, enemyHits=0) => startCombatCommandFight(player,
  {enemies:[unit('enemy','infantry',20)],playerChart:'A',enemyChart:'B',...rules}, {A:matrix(enemyHits),B:matrix(hits)});
const round = fight => combatCommandRound(fight,{playerRoll:2,enemyRoll:2},()=>{throw Error('Unexpected reroll');});
const counts = fight => Object.fromEntries(fight.player.map(unit=>[unit.key,unit.count]));

test('mixed casualties alternate across volleys, beginning with infantry, without mutating saved fights',()=>{
  const initial=start({playerCasualtyPolicy:cycle}), frozen=JSON.stringify(initial);
  let fight=round(initial);
  assert.deepEqual(counts(fight),{tanks:4,infantry:3});
  fight=round(fight);
  assert.deepEqual(counts(fight),{tanks:2,infantry:2});
  assert.equal(JSON.stringify(initial),frozen);
  const oneType=round(start({playerCasualtyPolicy:cycle},[unit('tank','tanks',5)],3));
  assert.equal(oneType.player[0].count,2);
});

test('enemy mixed losses reduce both components before the immediate return volley',()=>{
  const enemies=[unit('vehicles','tanks',4,4),unit('troops','infantry',4,1)];
  const fight=round(start({enemies,enemyCasualtyPolicy:cycle},force(),0,3));
  assert.deepEqual(fight.enemies.map(unit=>unit.count),[3,2]);
  assert.equal(fight.history[0].attacks[1].strength,14);
});

test('a reader may choose the platoon within a type without overriding a required priority',()=>{
  const player=[...force(),unit('bravo','infantry',2,2)];
  let initial=start({playerCasualtyPolicy:cycle},player,1);
  let fight=combatCommandRound(initial,{playerRoll:2,enemyRoll:2,playerLossOrder:['bravo']});
  assert.equal(fight.player.find(unit=>unit.key==='bravo').count,1);
  initial=start({playerCasualtyPolicy:{...cycle,priority:['bravo']}},player,1);
  fight=combatCommandRound(initial,{playerRoll:2,enemyRoll:2,playerLossOrder:['infantry']});
  assert.equal(fight.player.find(unit=>unit.key==='bravo').count,1);
  assert.equal(fight.player.find(unit=>unit.key==='infantry').count,5);
});

test('priority platoons lose only their current survivors before ordinary mixed casualties',()=>{
  const player=[...force(),unit('bravo','infantry',2,2)];
  const fight=round(start({playerCasualtyPolicy:{...cycle,priority:['bravo']}},player,3));
  assert.deepEqual(counts(fight),{tanks:4,infantry:5,bravo:0});
  assert.deepEqual(fight.history[0].attacks[1].losses.map(loss=>[loss.key,loss.count]),[['bravo',2],['tanks',1]]);
});

test('four-infantry restriction applies to actual casualties across rounds, never starting manpower',()=>{
  const initial=start({playerCasualtyPolicy:{...cycle,first:{type:'infantry',count:4}}});
  assert.deepEqual(counts(initial),{tanks:5,infantry:5});
  let fight=round(initial);
  assert.deepEqual(counts(fight),{tanks:5,infantry:2});
  fight=round(fight);
  assert.deepEqual(counts(fight),{tanks:4,infantry:0});
  assert.equal(fight.playerInitialLosses,4);
});

test('discretion pauses after priority losses, validates exact allocation, and survives serialization',()=>{
  const rules={playerCasualtyPolicy:{priority:['bravo'],discretion:true},roundLimit:1};
  const pending=round(start(rules,[...force(),unit('bravo','infantry',2)],5));
  assert.equal(pending.status,'awaiting-losses');assert.equal(pending.pendingCasualties.hits,3);
  assert.deepEqual(counts(pending),{tanks:5,infantry:5,bravo:0});
  assert.throws(()=>round(pending),/No active combat/);
  const frozen=JSON.stringify(pending);
  for (const allocation of [{tanks:2},{tanks:3.5},{bravo:1,infantry:2},{tanks:-1,infantry:4},{unknown:3}]) {
    assert.throws(()=>resolveCombatCommandCasualties(pending,allocation));
    assert.equal(JSON.stringify(pending),frozen);
  }
  const fight=resolveCombatCommandCasualties(JSON.parse(frozen),{tanks:1,infantry:2},()=>{throw Error('Rerolled volley');});
  assert.deepEqual(counts(fight),{tanks:4,infantry:3,bravo:0});
  assert.equal(fight.status,'survived');assert.equal(fight.round,1);assert.equal(fight.enemyExchanges,1);
  assert.equal(fight.history.length,1);assert.equal(fight.history[0].attacks.length,2);
  assert.equal(fight.history[0].attacks[1].losses.reduce((sum,loss)=>sum+loss.count,0),5);
  assert.throws(()=>resolveCombatCommandCasualties(fight,{tanks:3}),/No casualty allocation/);
});

test('enemy-first discretion resumes the same round with reduced player firepower',()=>{
  const pending=round(start({initiative:'enemy',playerCasualtyPolicy:{discretion:true}},force(),3));
  assert.equal(pending.history[0].attacks.length,1);
  const fight=resolveCombatCommandCasualties(pending,{tanks:3},()=>{throw Error('Manual total was lost');});
  assert.equal(fight.history[0].attacks.length,2);assert.equal(fight.history[0].attacks[1].strength,18);
  assert.equal(fight.round,1);assert.equal(fight.enemyExchanges,1);assert.equal(fight.status,'fighting');
});

test('all surviving units must be allocated before a lethal volley ends the fight',()=>{
  const pending=round(start({playerCasualtyPolicy:{discretion:true}},[unit('toString','tanks',1)],5));
  assert.equal(pending.pendingCasualties.hits,1);
  const fight=resolveCombatCommandCasualties(pending,{toString:1});
  assert.equal(fight.status,'loss');assert.equal(fight.player[0].count,0);
});

test('infantry-only firing and its explicit tank fallback are distinct rules',()=>{
  const player=[unit('tanks','tanks',4,4),unit('infantry','infantry',1,2)];
  const rules={playerCasualtyPolicy:{priority:['infantry']},playerFiringTypes:['infantry']};
  let fight=round(start({...rules,playerFallbackFiringTypes:['tanks']},player,1));
  assert.equal(fight.history[0].attacks[0].strength,2);
  fight=round(fight);assert.equal(fight.history[1].attacks[0].strength,16);
  fight=round(round(start(rules,player,1)));
  assert.equal(fight.history[1].attacks[0].strength,0);
  assert.equal(fight.history[1].attacks[0].total,null);
});

test('tank-only fire does not exempt infantry from ordinary casualties',()=>{
  const fight=round(start({playerCasualtyPolicy:cycle,playerFiringTypes:['tanks']},force(),1));
  assert.equal(fight.history[0].attacks[0].strength,20);
  assert.deepEqual(counts(fight),{tanks:5,infantry:4});
});

test('unconfigured encounters retain the previous casualty order',()=>{
  assert.deepEqual(counts(round(start())),{tanks:2,infantry:5});
  for(const policy of [{cycle:[]},{cycle:['unrecognised']},{priority:['missing']},{first:{type:'infantry',count:-1}}]) {
    assert.throws(()=>start({playerCasualtyPolicy:policy}));
  }
});

test('current combat force survives preset changes, including depleted and inactive units',()=>{
  const defaults={playerUnits:force()},state={custom:{}};
  rememberCombatCommandForce(state,[unit('tanks','tanks',2,3),unit('infantry','infantry',0,2)]);
  const tankOnly={playerUnits:[unit('tanks','tanks',5,4)]};
  const selected=combatCommandPlayerSetup(state,tankOnly,defaults,true);
  assert.equal(selected[0].count,2);assert.equal(selected[0].ordnance,3);
  rememberCombatCommandForce(state,[{...selected[0],count:1}]);
  const next=combatCommandPlayerSetup(state,{playerUnits:force()},defaults,true);
  assert.deepEqual(next.map(unit=>unit.count),[1,0]);
  assert.deepEqual(combatCommandPlayerSetup(state,{playerUnits:force()},defaults,false).map(unit=>unit.count),[5,5]);
  assert.equal(next[1].count,0,'destroyed units are not refilled');
  next[0].count=99;assert.equal(state.playerForce[0].count,1);
});

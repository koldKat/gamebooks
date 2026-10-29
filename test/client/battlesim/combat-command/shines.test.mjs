import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startCombatCommandFight, combatCommandRound } from '../../../../public/js/battlesim/engines/combat-command/core.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog=JSON.parse(readFileSync('data/simulator-rosters/1468.json'));
const entries=[...new Map(catalog.enemies.map(row=>[row.stats.entryIndex,row.stats.entry])).values()];
const source=section=>structuredClone(entries.find(entry=>entry.section===String(section)));
const charts=entries[0].charts;
const fill=units=>units.map(unit=>({...unit,count:unit.count===''?2:unit.count}));
function start(section,overrides={},matrices=charts) {
  const config={...source(section),...overrides};
  config.enemies=fill(config.enemies);
  config.reinforcements=(config.reinforcements??[]).map(group=>({...group,units:fill(group.units)}));
  return startCombatCommandFight(fill(config.playerUnits),config,matrices);
}
const round=(fight,options={})=>combatCommandRound(fight,{playerRoll:2,enemyRoll:2,...options});
const matrix=value=>Array.from({length:11},()=>Array(11).fill(value));
const controlled={...charts,C:matrix(0),E:matrix(1)};

test('all 45 database presets load and use their own seven exact matrices',async()=>{
  const loaded=await loadRosterDataset(1468,'CATALOG',async()=>({ok:true,json:async()=>catalog.enemies}));
  assert.equal(loaded.length,45);assert.equal(Object.values(charts).flat(2).length,847);
  assert.deepEqual(charts.A[0],[0,1,1,2,2,3,3,4,5,6,6]);
  for (const entry of loaded) {
    let fight=start(entry.section), before=JSON.stringify(fight);
    const next=round(fight,{playerRoll:12,enemyRoll:12});
    assert.equal(JSON.stringify(fight),before,'immutable '+entry.section);
    assert.equal(next.round,1);
    assert.ok(!Object.hasOwn(next,'hours')&&!Object.hasOwn(next,'mission'));
  }
});

test('early hits interrupt with a nonfatal wound; reinforcement arrives only after two full rounds',()=>{
  const wounded=round(start(2),{enemyRoll:12});
  assert.equal(wounded.status,'interrupted');assert.equal(wounded.section,'6');
  assert.equal(wounded.player[0].count,1);
  let fight=start(2,{}, {...charts,D:matrix(0),E:matrix(0)});
  fight=round(round(fight));assert.equal(fight.player.length,1);
  fight=round(fight);assert.deepEqual(fight.player.map(unit=>unit.count),[1,1,1]);
  fight=round(fight);assert.equal(fight.section,'5');assert.equal(fight.status,'survived');
  const noReinforcement=round(round(start(4,{}, {...charts,D:matrix(0),E:matrix(0)})));
  assert.equal(noReinforcement.section,'9');assert.equal(noReinforcement.player.length,1);
});

test('civilian casualties reduce return attack, refill next round, and cannot cause a false early victory',()=>{
  const fight=start(17,{}, {...charts,B:matrix(5),F:matrix(0)});
  const first=round(fight);assert.equal(first.status,'fighting');
  assert.equal(first.history[0].attacks[1].strength,0);
  const next=round(first);assert.equal(next.history[1].attacks[0].losses[0].count,5);
  const last=round(next);assert.equal(last.status,'survived');assert.equal(last.section,'30');
});

test('rookie and Birgu forces retain distinct charts, counts, ranged and melee values',()=>{
  assert.equal(source(21).enemies[0].ordnance,5);
  assert.equal(source(39).enemies[0].ordnance,4);
  assert.equal(source(47).enemies[0].ordnance,4);
  assert.equal(source(104).enemyChart,'E');assert.equal(source(105).enemyChart,'F');
  assert.equal(source(107).enemyChart,'E');assert.equal(source(103).enemyChart,'F');
  assert.equal(source(115).playerUnits[0].count,15);assert.equal(source(115).playerChart,'D');
  assert.equal(source(118).playerUnits[0].ordnance,7);assert.equal(source(126).playerUnits[0].ordnance,7);
  let fight=round(start(122));
  assert.deepEqual(fight.history[0].attacks.map(a=>[a.side,a.strength,a.chart]),[['player',14,'A']]);
  fight=round(fight);assert.equal(fight.history[1].attacks[0].strength,30);
  assert.equal(fight.history[1].attacks[0].chart,'D');
});

test('free attacks work for either side without granting the other side a return volley',()=>{
  for (const [section,side] of [[129,'player'],[131,'enemy'],[133,'enemy']]) {
    let fight=start(section,{playerUnits:[{key:'mi',name:'M.I.',count:6,ordnance:5}]},Object.fromEntries(Object.keys(charts).map(k=>[k,matrix(0)])));
    fight=round(round(fight));
    assert.ok(fight.history.every(event=>event.attacks.length===1&&event.attacks[0].side===side));
    fight=round(fight);assert.equal(fight.history[2].attacks.length,2);
  }
});

test('reinforcements join at the correct start of round and preserve previous casualties',()=>{
  let fight=start(114,{},controlled);
  for(let i=0;i<4;i++)fight=round(fight);
  assert.equal(fight.player[0].count,1);
  // A zero-hit fifth round leaves one survivor; the seven reinforcements do not restore the original five.
  fight.charts.E=matrix(0);fight=round(fight);assert.equal(fight.player.length,1);
  fight=round(fight);assert.deepEqual(fight.player.map(u=>u.count),[1,7]);
  let indoor=start(104,{},Object.fromEntries(Object.keys(charts).map(k=>[k,matrix(0)])));
  for(let i=0;i<4;i++)indoor=round(indoor);
  assert.equal(indoor.enemies.length,1);indoor=round(indoor);assert.equal(indoor.enemies.length,2);
  for(let i=0;i<4;i++)indoor=round(indoor);
  assert.equal(indoor.enemies.length,3);
});

test('prisoners absorb only the printed casualties, across exchanges, and never add attack strength',()=>{
  const matrices={...charts,B:matrix(0),F:matrix(1),D:matrix(1)};
  let solo=round(start(108,{},matrices));
  assert.equal(solo.player[0].count,1);assert.equal(solo.history[0].attacks[0].absorbed,1);
  assert.equal(solo.history[0].attacks[1].strength,6);
  solo=round(solo);assert.equal(solo.status,'loss');assert.equal(solo.section,'29');
  let group=start(109,{playerUnits:[{key:'mi',name:'M.I.',count:3,ordnance:6}]},matrices);
  for (const remaining of [3,2,2,1]) {group=round(group);assert.equal(group.player[0].count,remaining);}
  assert.equal(group.status,'survived');assert.equal(group.section,'112');
});

test('survivor destinations and unopposed escape do not advance the player’s run',()=>{
  for (const [count,target] of [[1,'106'],[2,'107']]) {
    let fight=start(100,{playerUnits:[{key:'mi',name:'M.I.',count,ordnance:6}]},Object.fromEntries(Object.keys(charts).map(k=>[k,matrix(0)])));
    fight=round(round(round(fight)));assert.equal(fight.section,target);
  }
  const escape=start(95,{enemies:[{key:'none',name:'No survivors',count:0,ordnance:3}]});
  assert.equal(escape.status,'survived');assert.equal(escape.round,0);assert.equal(escape.section,'97');
  assert.throws(()=>start(20,{enemies:[{key:'none',name:'None',count:0,ordnance:3}]}));
});

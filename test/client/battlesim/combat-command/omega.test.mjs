import test from 'node:test';
import assert from 'node:assert/strict';
import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';
import { startCombatCommandFight, combatCommandRound, resumeCombatCommandFight } from '../../../../public/js/battlesim/engines/combat-command/core.js';

const catalog=readRosterDocument(1469);
const entries=[...new Map(catalog.enemies.map(row=>[row.stats.entryIndex,row.stats.entry])).values()];
const source=section=>structuredClone(entries.find(entry=>entry.section===String(section)));
const charts=entries[0].charts;
const matrix=value=>Array.from({length:11},()=>Array(11).fill(value));
const neutral=Object.fromEntries(Object.keys(charts).map(key=>[key,matrix(0)]));
function start(section,matrices=neutral,variant) {
  const config=source(section);
  if (variant) Object.assign(config,config.variants.find(item=>item.key===variant));
  return startCombatCommandFight(config.playerUnits,config,matrices);
}
const round=(fight,options={})=>combatCommandRound(fight,{playerRoll:2,enemyRoll:2,...options});

test('all 45 installed encounter presets load their complete source charts and resolve immutable rounds',async()=>{
  const loaded=await loadRosterDataset(1469,'CATALOG',async()=>({ok:true,json:async()=>catalog.enemies}));
  assert.equal(loaded.length,45);assert.equal(Object.values(charts).flat(2).length,847);
  for (const entry of loaded) {
    const fight=start(entry.section),before=JSON.stringify(fight),next=round(fight);
    assert.equal(JSON.stringify(fight),before);
    assert.equal(next.round,1);
    assert.ok(!Object.hasOwn(next,'mission')&&!Object.hasOwn(next,'inventory'));
  }
  assert.equal(source(8).loss,'13');
  assert.deepEqual(['161','166','168'].map(id=>source(id).enemies[0].count),[16,15,14]);
  assert.equal(source(165).enemies[0].count,13);
});

test('Gasper fires twice alone before both sides enter melee in round three',()=>{
  let fight=start(21);
  fight=round(fight);assert.deepEqual(fight.history[0].attacks.map(a=>[a.side,a.strength]),[['player',5]]);
  fight=round(fight);assert.equal(fight.history[1].attacks.length,1);
  fight=round(fight);assert.deepEqual(fight.history[2].attacks.map(a=>[a.side,a.strength]),[['player',6],['enemy',60]]);
});

test('reader-selected detection variants grant only the printed opening volley',()=>{
  let fight=round(start(85,neutral,'detected'));
  assert.deepEqual(fight.history[0].attacks.map(a=>a.side),['enemy']);
  fight=round(fight);assert.deepEqual(fight.history[1].attacks.map(a=>a.chart),['D','C']);
  const hidden=round(start(85,neutral,'undetected'));
  assert.deepEqual(hidden.history[0].attacks.map(a=>a.chart),['B','C']);
  assert.deepEqual(round(start(60)).history[0].attacks.map(a=>a.side),['enemy']);
  assert.deepEqual([start(58,neutral,'held'),start(58,neutral,'failed')].map(f=>[f.config.playerChart,f.config.enemyChart,f.player[0].count]),[['B','E',16],['C','C',8]]);
});

test('limited exchanges stop at the printed continuation without pretending an enemy survived fight is won',()=>{
  for (const [id,target] of [[87,'95'],[91,'101'],[102,'120'],[160,'166']]) {
    const fight=round(start(id));assert.equal(fight.status,'continued');assert.equal(fight.section,target);
    assert.equal(fight.enemies[0].count,2);
  }
  let ambush=round(round(start(61)));
  assert.equal(ambush.status,'survived');assert.equal(ambush.section,'61');
  assert.deepEqual(ambush.history.map(event=>event.attacks.map(a=>a.side)),[['player','enemy'],['player']]);
  for(const [id,limit,target]of [[4,2,'9'],[7,3,'11'],[41,2,'47']]){
    let fight=start(id);for(let i=0;i<limit;i++)fight=round(fight);
    assert.equal(fight.status,'survived');assert.equal(fight.section,target);
  }
});

test('section 97 distinguishes a quiet melee victory from gunfire and surviving guards',()=>{
  const hits={...neutral,B:matrix(2)};
  assert.equal(round(start(97,hits,'melee')).section,'109');
  assert.equal(round(start(97,hits,'ranged')).section,'113');
  const survivors=round(start(97,neutral,'melee'));
  assert.equal(survivors.status,'continued');assert.equal(survivors.section,'113');
});

test('bridge access stays active after round two and selects the victory reference by actual round',()=>{
  const selected=matrix(0);selected[10]=Array(11).fill(6);
  const early=round(start(122,{...neutral,C:selected}),{playerRoll:12});
  assert.equal(early.status,'win');assert.equal(early.section,'127');
  let late=round(round(start(122,{...neutral,C:selected})));
  assert.equal(late.status,'fighting');
  late=round(late,{playerRoll:12});assert.equal(late.round,3);assert.equal(late.section,'128');
});

test('rebels stop when manpower reaches four instead of fighting to annihilation',()=>{
  const fight=round(start(150,{...neutral,D:matrix(8)}));
  assert.equal(fight.player[0].count,4);assert.equal(fight.status,'loss');assert.equal(fight.section,'153');
});

test('vehicle losses pause for a manually supplied force, preserving enemy damage and the same encounter',()=>{
  const first=round(start(100,{...neutral,A:matrix(1),D:matrix(3)}));
  assert.equal(first.status,'awaiting-force');assert.equal(first.player[0].count,0);
  assert.equal(first.enemies[0].count,7);assert.equal(first.round,1);assert.equal(first.history.length,1);
  assert.throws(()=>round(first),/No active combat/);
  const frozen=JSON.stringify(first);
  assert.throws(()=>resumeCombatCommandFight(first,[{key:'player',name:'Men',count:11,ordnance:4}]),/Too many/);
  let next=resumeCombatCommandFight(first,[{key:'player',name:'Surviving men',count:6,ordnance:4}]);
  assert.equal(JSON.stringify(first),frozen);assert.equal(next.round,1);assert.equal(next.history.length,1);
  assert.equal(next.enemies[0].count,7);assert.equal(next.config.playerChart,'C');
  next=round(next);assert.equal(next.round,2);assert.equal(next.history[1].attacks[0].strength,24);
  assert.equal(next.player[0].count,3);
  const none=resumeCombatCommandFight(first,[{key:'player',name:'No survivors',count:0,ordnance:4}]);
  assert.equal(none.status,'loss');assert.equal(none.section,'89');
  assert.throws(()=>resumeCombatCommandFight(next,next.player),/No force handoff/);
  const openingWin=round(start(100,{...neutral,A:matrix(8)}));
  assert.equal(openingWin.status,'win');assert.equal(openingWin.section,'115');
});

test('tank damage reduces return fire and ten hits end the duel at its own printed destination',()=>{
  for(const [id,target]of [[141,'145'],[144,'148']]){
    let fight=start(id,{...neutral,C:matrix(1)});
    fight=round(fight);assert.equal(fight.history[0].attacks[1].strength,90);
    for(let i=1;i<10;i++)fight=round(fight);
    assert.equal(fight.status,'win');assert.equal(fight.section,'146');assert.equal(fight.player[0].count,1);
    const lethal=matrix(0);lethal[10]=Array(11).fill(10);
    const loss=round(start(id,{...neutral,C:lethal}),{enemyRoll:12});
    assert.equal(loss.status,'loss');assert.equal(loss.section,target);
  }
});

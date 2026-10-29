import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommandRecord, commandRecordOutcome, commandEncounterForce, beginCommandEncounter,
  advanceCommandEncounter, cancelCommandEncounter, updateCommandRecord, applyCommandEffect, testCommandRecord, recoverCommandDrones,
  repairCommandFlagship, repairCommandShips } from '../../../../public/js/battlesim/engines/combat-command/record.js';

const catalog=JSON.parse(readFileSync('data/simulator-rosters/1467.json'));
const entries=[...new Map(catalog.enemies.map(row=>[row.stats.entryIndex,row.stats.entry])).values()];
const source=section=>structuredClone(entries.find(entry=>entry.section===String(section)));
const defaults=entries[0].playerDefaults, charts=entries[0].charts;
const instructions=defaults.instructions;
const effect=section=>instructions.effects.find(effect=>effect.section===String(section));
const fresh=()=>createCommandRecord(defaults);
const unit=(key,count,ordnance)=>({key,name:key,count,ordnance});
const step=(record,options={})=>advanceCommandEncounter(record,{playerRoll:2,enemyRoll:2,...options});

test('new record owns its fleet, preserves arbitrary extensions and never touches unrelated run fields',()=>{
  const record=fresh(), original=JSON.stringify(defaults);
  record.extension={keep:7};
  const run={inventory:[{name:'Existing item'}],equipment:{hand:'Existing sword'},character:{skill:12},simOther:{fight:{id:3}},sim1467:record};
  const before=JSON.stringify({...run,sim1467:null});
  run.sim1467=applyCommandEffect(record,effect(27));
  assert.equal(JSON.stringify({...run,sim1467:null}),before);
  assert.equal(JSON.stringify(defaults),original);
  assert.equal(record.hours,0); assert.equal(run.sim1467.hours,2);
  assert.deepEqual(run.sim1467.extension,{keep:7});
});

test('manual fleet corrections enforce original limits, keep optional retry escorts disabled initially and respect tug capacity',()=>{
  const original=fresh(), values=structuredClone(original);
  assert.equal(original.fleet.find(unit=>unit.key==='catherine').count,0);
  assert.equal(original.fleet.find(unit=>unit.key==='penny').count,0);
  values.fleet.find(unit=>unit.key==='catherine').count=1;
  values.fleet.find(unit=>unit.key==='tug-1').count=0;
  const next=updateCommandRecord(original,values);
  assert.equal(next.fleet.find(unit=>unit.key==='catherine').count,1);
  assert.equal(next.fleet.find(unit=>unit.drone).count,6);
  values.fleet.find(unit=>unit.key==='catherine').count=2;
  assert.throws(()=>updateCommandRecord(original,values));
  assert.equal(original.fleet.find(unit=>unit.key==='catherine').count,0);
});

test('one-time time and morale effects do not apply twice; exactly twelve hours remains valid',()=>{
  let record=applyCommandEffect(fresh(),effect(86));
  assert.equal(record.hours,1); assert.equal(record.morale,10);
  assert.throws(()=>applyCommandEffect(record,effect(86)));
  record=applyCommandEffect(record,{key:'test-time',hours:11});
  assert.equal(commandRecordOutcome(record),null);
  record=applyCommandEffect(record,{key:'test-expire',hours:.5});
  assert.equal(commandRecordOutcome(record),'loss');
  assert.equal(instructions.effects.some(e=>e.section==='48'),false,'no invented section48 time penalty');
});

test('Brooksville return and the already destroyed enemy cruiser cannot duplicate or resurrect',()=>{
  let record=fresh(); record.fleet.find(u=>u.key==='brooksville').detached=true;
  record=applyCommandEffect(record,effect(34));
  assert.equal(record.fleet.filter(u=>u.key==='brooksville').length,1);
  assert.equal(record.fleet.find(u=>u.key==='brooksville').detached,false);
  assert.equal(record.enemyForces.marianas[0].count,1);
  record=beginCommandEncounter(record,source(53),charts);
  assert.equal(record.fight.enemies[0].count,1,'reprinted full roster does not resurrect a cruiser');
  assert.throws(()=>applyCommandEffect(record,effect(34)));
});

test('destroyed ships stay destroyed and the scripted Pike loss is applied before the selected-ship fight',()=>{
  let record=fresh(); record.fleet.find(u=>u.key==='scimitar').count=0;
  record=beginCommandEncounter(record,source(20),charts);
  assert.equal(record.fleet.find(u=>u.key==='pike').count,0);
  assert.deepEqual(record.fight.player.map(u=>u.key),['discovered-check','sparrowhawk','hummingbird']);
  const saved=JSON.stringify(record);
  assert.throws(()=>beginCommandEncounter(record,source(22),charts));
  assert.equal(JSON.stringify(record),saved);
});

test('recon selection requires exactly two surviving birds and leaves the third untouched',()=>{
  let record=fresh();
  assert.throws(()=>commandEncounterForce(record,source(32),{playerKeys:['inverness','risk']}));
  assert.throws(()=>commandEncounterForce(record,source(32),{playerKeys:['bluejay']}));
  record=beginCommandEncounter(record,source(32),charts,{playerKeys:['bluejay','raven']});
  record=step(record,{enemyRoll:12}); record=step(record,{enemyRoll:12});
  assert.equal(record.fleet.find(u=>u.key==='bluejay').count,0);
  assert.equal(record.fleet.find(u=>u.key==='raven').count,0);
  assert.equal(record.fleet.find(u=>u.key==='hummingbird').count,1);
  assert.equal(record.fight.section,'31');
});

test('holding squadron selection is two destroyers and three escorts and survivors remain detached',()=>{
  const keys=['bear','wolf','kukri','scimitar','lance'];
  assert.throws(()=>commandEncounterForce(fresh(),source(60),{playerKeys:keys.slice(1)}));
  let record=beginCommandEncounter(fresh(),source(60),charts,{playerKeys:keys,enemies:[unit('foe',1,0)]});
  record=step(record,{playerRoll:12});
  assert.equal(record.fight.section,'49');
  assert.ok(record.fleet.filter(u=>keys.includes(u.key)).every(u=>u.detached));
  assert.ok(commandEncounterForce(record,source(69)).every(u=>!keys.includes(u.key)));
});

test('reinforcements inherit actual surviving pirates; direct entry requires an explicit current force',()=>{
  assert.throws(()=>beginCommandEncounter(fresh(),source(18),charts));
  let record=beginCommandEncounter(fresh(),source(15),charts,{player:[unit('slugs',1,0)]});
  record=step(record,{enemyRoll:12});
  assert.equal(record.fight.section,'18');
  record=beginCommandEncounter(record,source(18),charts);
  assert.equal(record.fight.enemies[0].count,21);
  const entered=beginCommandEncounter(fresh(),source(18),charts,{enemies:[unit('pirates',4,2)]});
  assert.equal(entered.fight.enemies[0].count,4);
});

test('one-use drone strike removes fired drones exactly once and preserves unused drones',()=>{
  let record=beginCommandEncounter(fresh(),source(96),charts);
  record=step(record,{drones:3,playerRoll:12});
  assert.equal(record.fleet.find(u=>u.drone).count,6);
  assert.equal(record.fleet.find(u=>u.drone).spent,0);
  assert.equal(record.recovery,null);
  record=beginCommandEncounter(record,source(100),charts);
  record=step(record,{playerRoll:12});
  assert.equal(record.fleet.find(u=>u.drone).count,6);
});

test('ending an unfinished encounter preserves casualties and consumes fired drones once',()=>{
  let record=beginCommandEncounter(fresh(),{...source(53),enemies:[unit('foe',1000,0)]},charts);
  record=step(record);record=step(record,{drones:3});
  const before=JSON.stringify(record);
  const ended=cancelCommandEncounter(record);
  assert.equal(JSON.stringify(record),before);
  assert.equal(ended.fight.status,'cancelled');assert.equal(ended.fight.section,null);
  assert.equal(ended.fleet.find(unit=>unit.drone).count,6);
  assert.equal(ended.fleet.find(unit=>unit.drone).spent,0);
  assert.throws(()=>cancelCommandEncounter(ended));
  const next=beginCommandEncounter(ended,source(100),charts);
  assert.equal(next.fleet.find(unit=>unit.drone).count,6);
});

test('source recovery restores surviving unused drone capacity and cannot be applied twice',()=>{
  let record=beginCommandEncounter(fresh(),{...source(53),enemies:[unit('foe',3,0)]},charts);
  record=step(record);
  record=step(record,{drones:3});
  assert.equal(record.fight.section,'59');
  assert.equal(record.recovery.survivingSpent,3);
  assert.throws(()=>beginCommandEncounter(record,source(100),charts));
  record=recoverCommandDrones(record,()=>1);
  assert.equal(record.fleet.find(u=>u.drone).count,7);
  assert.equal(record.fleet.find(u=>u.drone).spent,0);
  assert.throws(()=>recoverCommandDrones(record,()=>1));
  record=beginCommandEncounter(record,source(100),charts);
  assert.equal(record.fleet.find(u=>u.drone).count,7);
});

test('remaining tugs cap carried drones after combat without changing any ship statistics',()=>{
  let record=beginCommandEncounter(fresh(),source(99),charts);
  record=step(record,{enemyRoll:12,playerLossOrder:['tug-1','tug-2','tug-3']});
  assert.equal(record.fleet.filter(u=>u.droneCapacity).reduce((sum,u)=>sum+u.count,0),0);
  assert.equal(record.fleet.find(u=>u.drone).count,0);
  assert.equal(record.fleet.find(u=>u.key==='inverness').ordnance,14);
});

test('scripted bird casualties fall back to escorts then destroyers and stay idempotent',()=>{
  let record=fresh();
  for(const ship of record.fleet) if(ship.shipClass==='Assault Ships') ship.count=0;
  const before=record.fleet.filter(u=>u.shipClass==='Escort').reduce((s,u)=>s+u.count,0);
  record=applyCommandEffect(record,effect(75));
  assert.equal(record.fleet.filter(u=>u.shipClass==='Escort').reduce((s,u)=>s+u.count,0),before-2);
  assert.equal(record.hours,1.5);
  assert.throws(()=>applyCommandEffect(record,effect(75)));
});

test('source stealth tests distinguish recon ten from fleet eight and charge pursuit time once',()=>{
  const instruction=sec=>instructions.tests.find(t=>t.section===String(sec));
  let record=testCommandRecord(fresh(),instruction(30),()=>5);
  assert.equal(record.log.at(-1).passed,true);
  record=testCommandRecord(record,instruction(50),()=>5);
  assert.equal(record.log.at(-1).passed,false);
  record=testCommandRecord(record,instruction(63),()=>4);
  assert.equal(record.hours,.5);
  record=testCommandRecord(record,instruction(63),()=>4);
  assert.equal(record.hours,.5);
});

test('flagship repairs charge battle once and every repair roll including the successful roll',()=>{
  let record=beginCommandEncounter(fresh(),{...source(69),enemies:[unit('foe',1,0)]},charts);
  record=step(record,{playerRoll:12});
  assert.equal(record.fight.section,'70');
  const instruction=instructions.flagshipRepairs.find(t=>t.section==='70');
  record=repairCommandFlagship(record,instruction,()=>6);
  assert.equal(record.hours,2); assert.equal(record.repair.done,false);
  record=repairCommandFlagship(record,instruction,()=>4);
  assert.equal(record.hours,3); assert.equal(record.repair.done,true);
  assert.throws(()=>repairCommandFlagship(record,instruction,()=>4));
});

test('optional repairs restore only current encounter losses and failed selected ships stay unrepairable',()=>{
  let record=fresh(); record.fleet.find(u=>u.key==='wolf').count=0;
  record=beginCommandEncounter(record,source(81),charts);
  for(let i=0;i<3;i++) record=step(record,{enemyRoll:12});
  const lost=record.fight.startPlayer.filter(u=>u.count && !u.drone && !record.fleet.find(s=>s.key===u.key).count).map(u=>u.key);
  assert.ok(lost.length>=4);
  assert.throws(()=>repairCommandShips(record,instructions.shipRepair,['wolf'],()=>1));
  record=repairCommandShips(record,instructions.shipRepair,lost.slice(0,2),()=>4);
  assert.equal(record.hours,1);
  assert.ok(lost.slice(0,2).every(key=>record.fleet.find(u=>u.key===key).count===1));
  assert.throws(()=>repairCommandShips(record,instructions.shipRepair,lost.slice(0,2),()=>4));
  record=repairCommandShips(record,instructions.shipRepair,lost.slice(2,4),()=>6);
  assert.equal(record.hours,2);
  assert.throws(()=>repairCommandShips(record,instructions.shipRepair,lost.slice(2,4),()=>1));
});

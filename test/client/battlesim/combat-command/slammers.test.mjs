import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startCombatCommandFight, combatCommandRound, resolveCombatCommandCasualties, combatCommandHits } from '../../../../public/js/battlesim/engines/combat-command/core.js';

const catalog=readRosterDocument(1470);
const entries=catalog.enemies.map(row=>row.stats.entry), charts=entries[0].charts;
const source=id=>structuredClone(entries.find(entry=>entry.section===String(id)));
const matrix=hits=>Array.from({length:11},()=>Array(11).fill(hits));
const neutral=()=>Object.fromEntries(Object.keys(charts).map(key=>[key,matrix(0)]));
const start=(id,hits=0,player)=>{
  const entry=source(id),tables=neutral();tables[entry.enemyChart]=matrix(hits);
  return startCombatCommandFight(player??entry.playerUnits,entry,tables);
};
const round=fight=>combatCommandRound(fight,{playerRoll:2,enemyRoll:2});
const sum=(force,type)=>force.filter(unit=>unit.type===type).reduce((total,unit)=>total+unit.count,0);

test('all actual numerical battles and source charts are database-owned and complete',()=>{
  assert.equal(entries.length,56);assert.equal(new Set(entries.map(entry=>entry.section)).size,56);
  assert.equal(Object.values(charts).flat(2).length,847);
  assert.equal(combatCommandHits(charts,'B',64,8),4,'printed tutorial');
  const defaults=entries[0].playerDefaults;
  assert.equal(defaults.playerUnits.length,5);assert.equal(sum(defaults.playerUnits,'tanks'),8);
  assert.equal(sum(defaults.playerUnits,'infantry'),12);
  assert.ok(defaults.playerUnits.filter(unit=>unit.type==='tanks').every(unit=>unit.ordnance===4));
  assert.ok(defaults.playerUnits.filter(unit=>unit.type==='infantry').every(unit=>unit.ordnance===2));
  for(const id of [47,53,60,78,80,99,101,113,114,117,138])assert.ok(!entries.some(entry=>entry.section===String(id)));
  assert.ok(entries.every(entry=>entry.initiative==='player'&&!entry.freeOpeningAttacks&&!entry.enemyFreeOpeningAttacks));
});

test('only printed withdrawal limits stop an unresolved battle',()=>{
  const unlimited=['65','76','77','90','95','119','120','126','127'];
  assert.deepEqual(entries.filter(entry=>entry.roundLimit===undefined).map(entry=>entry.section),unlimited);
  for(const entry of entries){
    let fight=start(entry.section);
    for(let i=0;i<3;i++)fight=round(fight);
    assert.equal(fight.status,unlimited.includes(entry.section)?'fighting':'survived',entry.section);
    assert.equal(fight.round,3);
    if(fight.status==='fighting')assert.equal(round(fight).round,4);
  }
});

test('Bravo India priority respects current survivors and discretionary additional losses',()=>{
  for(const id of [38,111]){
    const player=source(id).playerUnits;player.find(unit=>unit.key==='bravo-india').count=2;
    const fight=round(start(id,3,player));
    assert.equal(fight.player.find(unit=>unit.key==='bravo-india').count,0);
    assert.equal(sum(fight.player,'tanks'),7);assert.equal(sum(fight.player,'infantry'),8);
  }
  const pending=round(start(50,6));
  assert.equal(pending.status,'awaiting-losses');assert.equal(pending.pendingCasualties.hits,2);
  assert.equal(pending.player.find(unit=>unit.key==='bravo-india').count,0);
  const fight=resolveCombatCommandCasualties(pending,{tango:1,india:1});
  assert.equal(sum(fight.player,'tanks'),7);assert.equal(sum(fight.player,'infantry'),7);
});

test('first four infantry losses are a restriction on hits, not automatic pre-battle damage',()=>{
  const initial=start(72,6);assert.equal(sum(initial.player,'infantry'),12);
  const fight=round(initial);
  assert.equal(sum(fight.player,'infantry'),7);assert.equal(sum(fight.player,'tanks'),7);
  assert.equal(fight.playerInitialLosses,4);
});

test('explicit infantry and tank firing exceptions remain distinct',()=>{
  for(const id of [87,88]){
    const player=source(id).playerUnits;
    for(const unit of player)if(unit.type==='infantry')unit.count=0;
    const fight=round(start(id,0,player));
    assert.equal(fight.history[0].attacks[0].strength,id===87?32:0);
  }
  assert.equal(round(start(95)).history[0].attacks[0].strength,32);
  assert.equal(round(start(40)).history[0].attacks[0].strength,56,'mostly tanks is not tanks only');
  assert.equal(round(start(20)).history[0].attacks[0].strength,32);
  assert.equal(source(20).playerUnits.length,2);
});

test('mixed enemy losses alternate before their return attack',()=>{
  const entry=source(22),tables=neutral();tables[entry.playerChart]=matrix(3);
  const fight=round(startCombatCommandFight(entry.playerUnits,entry,tables));
  assert.equal(sum(fight.enemies,'infantry'),2);assert.equal(sum(fight.enemies,'tanks'),3);
  assert.equal(fight.history[0].attacks[1].strength,16);
});

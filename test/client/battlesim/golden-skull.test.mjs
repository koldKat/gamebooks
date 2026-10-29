import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';
import {createFantasyState} from '../../../public/js/battlesim/engines/fighting-fantasy/state.js';
import {definition} from '../../../public/js/battlesim/books/1362/definition.js';

const roster = readRosterDocument(1362);
const entries = [...new Map(roster.enemies.map(row => [row.stats.entry.section,row.stats.entry])).values()];
const items = entries[0].support.items;
const hero = changes => ({skill:12,skillInitial:12,stamina:24,staminaInitial:24,luck:12,luckInitial:12,
  gold:20,provisions:10,potion:'skill',potionUses:1,attackModifier:0,nextFightPenalty:0,items:{},...changes});
const config = n => entries.find(entry => entry.section === String(n));
const start = (n, changes = {}, options = {applyEntry:false}, roll) => combat.startFight(hero(changes),config(n),options,roll);
function dice(values) {
  let index=0;
  return {roll(){assert.ok(index<values.length,'unexpected die');return values[index++];},done(){assert.equal(index,values.length,'unused dice');}};
}
function round(fight, values) {
  const random = dice(values), next = combat.roundFight(fight,items,random.roll); random.done(); return next;
}
function wound(fight, luck = false, values = []) {
  const random = dice(values), next = combat.resolveWound(fight,luck,random.roll); random.done(); return next;
}
const win = fight => wound(round(fight,[1,1,6,6]));
const lose = fight => wound(round(fight,[6,6,1,1]));
const tie = fight => round(fight,[3,3,3,3]);

test('all33 source groups and41 NPC rows retain source rules and sequential enemies',()=>{
  assert.equal(entries.length,33); assert.equal(roster.enemies.length,41);
  for(const entry of entries){
    assert.ok(entry.printedRules.length); assert.ok(entry.sourcePages.length);
    const fight=start(entry.section);
    assert.equal(fight.enemies.length,entry.enemies.length);
    assert.equal(fight.target,0); assert.equal(fight.status,'active');
  }
  assert.deepEqual(config(387).enemies.map(e=>[e.skill,e.stamina]),[[8,8],[8,8]]);
  assert.deepEqual(config(145).enemies.map(e=>[e.skill,e.stamina]),[[9,8],[10,7]]);
});
test('standard creation, provisions and one-dose potions respect initial scores',()=>{
  const random=dice([1,2,3,4]), character=combat.newCharacter(entries[0].support.defaults,random.roll);random.done();
  assert.deepEqual([character.skill,character.stamina,character.luck,character.gold,character.provisions],[7,17,10,20,10]);
  let current=combat.recover(hero({stamina:23}),'provision');assert.equal(current.stamina,24);assert.equal(current.provisions,9);
  current=combat.recover(hero({potion:'fortune',luck:2}),'potion');assert.equal(current.luckInitial,13);assert.equal(current.luck,13);assert.equal(current.potionUses,0);
  assert.throws(()=>combat.recover(current,'potion'));
  assert.equal(combat.recover(hero({potion:'strength',stamina:1}),'potion').stamina,24);
  assert.equal(combat.recover(hero({skill:1}),'potion').skill,12);
});
test('entry damage and luck penalties are explicit and optional, without double application',()=>{
  for(const [n,amount] of [[3,4],[12,3],[41,2],[234,2],[270,4],[387,1]]){
    assert.equal(start(n,{}, {applyEntry:true}).character.stamina,24-amount);
    assert.equal(start(n).character.stamina,24);
  }
  assert.equal(start(43,{}, {applyEntry:true}).character.luck,10);
  const random=dice([5]);assert.equal(start(309,{}, {applyEntry:true},random.roll).character.stamina,19);random.done();
  assert.equal(start(3,{stamina:3},{applyEntry:true}).status,'loss');
});
test('Luck is chosen after the roll, and changes outgoing damage4/1 and incoming1/3',()=>{
  for(const [n,values,damage] of [[57,[1,1],4],[57,[6,6],1]]){
    let fight=round(start(n,{luck:4}),[1,1,6,6]);assert.ok(fight.pending);assert.equal(fight.enemies[0].stamina,12);
    assert.throws(()=>combat.roundFight(fight,items));
    fight=wound(fight,true,values);assert.equal(fight.enemies[0].stamina,12-damage);assert.equal(fight.character.luck,3);
  }
  for(const [values,damage] of [[[1,1],1],[[6,6],3]]){
    const fight=wound(round(start(57,{luck:4}),[6,6,1,1]),true,values);assert.equal(fight.character.stamina,24-damage);
  }
  const unlucky=combat.testLuck(hero({luck:0}),()=>1);assert.equal(unlucky.lucky,false);assert.equal(unlucky.character.luck,0);
});
test('ties cause no wound and break the Snake consecutive-loss streak',()=>{
  let fight=start(159,{skill:7});fight=lose(fight);assert.equal(fight.consecutiveLost,1);
  fight=tie(fight);assert.equal(fight.consecutiveLost,0);assert.equal(fight.roundsLost,1);
  fight=lose(fight);assert.equal(fight.status,'active');fight=lose(fight);
  assert.equal(fight.status,'routed');assert.equal(fight.destination,'349');
  let other=lose(lose(start(41,{skill:7})));assert.equal(other.destination,'349');
  other=lose(lose(start(129,{skill:7})));assert.equal(other.status,'active');
});
test('clean wins track lost rounds, not damage, across all members of each group',()=>{
  for(const [n,clean,bitten] of [[98,'145','365'],[126,'396','267'],[145,'392','160'],[167,'145','365'],[217,'283','371']]){
    let cleanFight=start(n), bittenFight=lose(start(n));
    while(cleanFight.status==='active')cleanFight=win(cleanFight);
    while(bittenFight.status==='active')bittenFight=win(bittenFight);
    assert.equal(cleanFight.destination,clean);assert.equal(bittenFight.destination,bitten);
  }
  let immune=lose(start(230));while(immune.status==='active')immune=win(immune);assert.equal(immune.destination,'392');
});
test('round penalties and all item bonuses follow printed scope without stacking weapons',()=>{
  const fight=start(167);fight.round=1;assert.equal(combat.attackModifier(fight,items),-2);
  fight.round=2;assert.equal(combat.attackModifier(fight,items),0);
  for(const [n,modifier] of [[42,-3],[43,-3],[168,-3],[270,-2]])assert.equal(combat.attackModifier(start(n),items),modifier);
  for(const [n,modifier] of [[43,-3],[168,-3],[270,-2]])assert.equal(combat.attackModifier(start(n,{items:{doomSword:true}}),items),modifier,'A sword cannot help a barehanded or knife-only fight');
  let lich=start(125,{items:{doomSword:true,vest:true,helmet:true,shield:true,glove:true,silverDagger:true}});
  assert.equal(combat.attackModifier(lich,items),6);
  lich.config.section='57';assert.equal(combat.attackModifier(lich,items),5);
  lich.character.items.shadowSword=true;assert.throws(()=>combat.attackModifier(lich,items));
});
test('Valmorka potion bonus lasts exactly three rounds and does not double-count Dragonblade',()=>{
  for(const blade of [false,true]){
    const fight=start(220,{items:{dragonblade:blade,invisibility:true}},{applyEntry:true});
    assert.equal(fight.character.items.invisibility,false);
    for(let round=1;round<=4;round++){fight.round=round;assert.equal(combat.attackModifier(fight,items),round<=3?(blade?5:2):(blade?3:0));}
    assert.equal(combat.attackModifier(start(343,{items:{dragonblade:blade}}),items),blade?3:0);
  }
  assert.throws(()=>start(220,{}, {applyEntry:true}));
});
test('virus penalty is consumed by one fight and persists for all of its rounds',()=>{
  const first=start(57,{nextFightPenalty:-2});assert.equal(first.character.nextFightPenalty,0);
  for(const round of [1,3,10]){first.round=round;assert.equal(combat.attackModifier(first,items),-2);}
  const second=combat.startFight(first.character,config(57),{applyEntry:false});assert.equal(combat.attackModifier(second,items),0);
});
test('Terrorhawk escapes after three survived rounds without requiring its death',()=>{
  let fight=start(299,{skill:8});for(let i=0;i<3;i++)fight=tie(fight);
  assert.equal(fight.status,'win');assert.equal(fight.destination,'91');assert.equal(fight.enemies[0].stamina,10);
  fight=start(299,{stamina:1});fight.round=2;fight=lose(fight);assert.equal(fight.status,'loss');assert.equal(fight.destination,null);
});
test('Thornback quills damage every round, including ties and the killing round',()=>{
  let fight=start(309,{skill:8});fight=round(fight,[3,3,3,3,4]);assert.equal(fight.character.stamina,20);
  fight=wound(round(fight,[1,1,6,6]),false,[3]);assert.equal(fight.character.stamina,17);
  fight=wound(round(fight,[1,1,6,6]),false,[2]);assert.equal(fight.character.stamina,15);
  fight=wound(round(fight,[1,1,6,6]),false,[1]);assert.equal(fight.status,'win');assert.equal(fight.character.stamina,14);
  fight=start(309,{stamina:1});fight.enemies[0].stamina=1;
  fight=wound(round(fight,[1,1,6,6]),false,[1]);assert.equal(fight.status,'loss');
});
test('escape obeys round and enemy gates and costs the general2STAMINA',()=>{
  for(const [n,rounds,destination] of [[68,3,'387'],[168,3,'275'],[271,2,'294']]){
    let fight=start(n,{skill:config(n).enemies[0].skill,attackModifier:-(config(n).attackModifier??0)});assert.equal(combat.canEscape(fight),false);
    for(let i=0;i<rounds;i++)fight=tie(fight);
    assert.equal(combat.canEscape(fight),true);fight=combat.escapeFight(fight);
    assert.equal(fight.status,'escaped');assert.equal(fight.destination,destination);assert.equal(fight.character.stamina,22);
  }
  let pirates=start(43);assert.equal(combat.canEscape(pirates),false);
  for(let i=0;i<3;i++)pirates=win(pirates);
  assert.equal(pirates.target,1);assert.equal(combat.canEscape(pirates),true);
  assert.equal(combat.escapeFight(pirates).character.stamina,22);
});
test('Treeman has two independently wounded branches and escape needs a won round',()=>{
  let fight=start(387,{skill:8});fight=tie(fight);assert.equal(combat.canEscape(fight),false);
  fight=win(fight);assert.equal(combat.canEscape(fight),true);
  fight=tie(fight);assert.equal(combat.canEscape(fight),false);
  for(let i=0;i<3;i++)fight=win(fight);
  assert.equal(fight.target,1);assert.equal(fight.enemies[1].stamina,8);
  for(let i=0;i<4;i++)fight=win(fight);
  assert.equal(fight.destination,'18');assert.equal(fight.status,'win');
});
test('dart is single-use fixed damage, ordinary fights need no preset, and input state is immutable',()=>{
  const original=hero({items:{dart:true}}), custom=combat.startFight(original,null,{opponents:[{displayName:'Custom foe',skill:6,stamina:5}]});
  const next=combat.useProjectile(custom,items.find(item=>item.key==='dart'));
  assert.equal(next.status,'win');assert.equal(next.character.items.dart,false);
  assert.equal(original.items.dart,true);assert.equal(custom.character.items.dart,true);assert.equal(custom.enemies[0].stamina,5);
  assert.throws(()=>combat.startFight(hero(),config(145),{opponents:[{skill:1,stamina:1}]}));
});
test('Razor Shark bypass is explicit, before combat, with no fake victory',()=>{
  const fight=combat.bypassFight(start(42,{nextFightPenalty:-2}));assert.equal(fight.status,'bypassed');assert.equal(fight.destination,'204');assert.equal(fight.character.nextFightPenalty,-2);
  assert.throws(()=>combat.bypassFight(start(57)));
  assert.throws(()=>combat.bypassFight(win(start(42))));
});
test('run-scoped persistence records each result once and rejects stale or failed updates',()=>{
  const run={inventory:{sentinel:true},equipment:{sentinel:true},sim1303:{sentinel:true}};
  let current=run,book=1362,saves=0;
  const state=createFantasyState(definition,()=>({getRun:()=>current,getBookId:()=>book,saveState:()=>saves++}));
  assert.equal(state.read(),null);
  state.change(data=>{data.character=hero();});
  let fight=start(129);fight=win(fight);
  state.change(data=>{data.fight=fight;});state.change(()=>{});
  assert.equal(state.read().history.length,1);assert.equal(state.read().character.stamina,24);
  const before=JSON.stringify(run);
  assert.throws(()=>state.change(data=>{data.character.stamina=0;throw Error('abort');}));assert.equal(JSON.stringify(run),before);
  assert.equal(state.change(data=>{data.character.stamina=0;book=1;}),false);assert.equal(JSON.stringify(run),before);book=1362;
  assert.equal(state.change(data=>{data.character.stamina=0;current={};}),false);assert.equal(JSON.stringify(run),before);current=run;
  assert.deepEqual(run.inventory,{sentinel:true});assert.deepEqual(run.equipment,{sentinel:true});assert.deepEqual(run.sim1303,{sentinel:true});assert.equal(saves,3);
});

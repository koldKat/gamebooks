import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {createDestinyState} from '../../../public/js/battlesim/engines/destinyquest/state.js';
import {resolveDestinyItemLoss,captureDestinyItemChoices,planDestinyItemLoss} from '../../../public/js/battlesim/engines/destinyquest/shared-item-loss.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:0,brawn:0,magic:0,armour:100,health:20,maxHealth:20};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(options={})=>createHeartFight({...hero,...options.hero},66,{...options,roster});
const lose=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,5)));
const pending=f=>resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(6)));
const none={source:'none',reason:'no-items'};
function stateFor(run){
  let current=run,book=1287,writes=0;
  const state=createDestinyState({id:1287,stateKey:'sim1287'},()=>({getRun:()=>current,getBookId:()=>book,saveState:()=>writes++}));
  return {state,run:next=>current=next,book:next=>book=next,writes:()=>writes};
}
const session=f=>createDestinySession({fight:f,fightId:'zombie-fight',setup:{hero,abilities:{}}});

test('winning enemy score six pauses for item loss even with complete Armour absorption',()=>{
  let f=pending(fight());assert.equal(f.phase,'ability-choice');assert.equal(f.hero.health,20);
  assert.equal(f.turn.pendingAbility.type,'shared-item-loss');
  f=resolveDestinyItemLoss(f,none);assert.equal(f.phase,'end');assert.equal(f.hero.health,20);assert.equal(f.turn.damageScore,8);
  assert.throws(()=>resolveDestinyItemLoss(f,none),/pending/);
  f=resolveDestinyDamage(rollDestinyDamage(lose(fight()),rolls(5)));assert.equal(f.phase,'end');
});

test('item modifiers are removed before incoming score damage and accepted score faces count only once',()=>{
  let f=fight({hero:{armour:7},abilities:{heal:2}});
  f.encounter.acceptedRollCounters=[{owner:'opponent',kinds:['damage'],faces:[6],required:100,outcome:'loss',name:'test'}];
  f=pending(f);assert.equal(f.encounter.acceptedRollCounters[0].count,1);
  f=resolveDestinyItemLoss(f,{source:'equipment',key:'chest',itemId:7,quantity:1},{statLosses:{armour:5},lostAbilities:{heal:1}});
  assert.equal(f.hero.armour,2);assert.equal(f.hero.normal.armour,2);assert.equal(f.hero.health,14);assert.equal(f.abilities.heal,1);
  assert.equal(f.encounter.acceptedRollCounters[0].count,1);
});

test('shared inventory loss and simulator acknowledgement commit together once, preserving every unrelated field',()=>{
  const run={inventory:[null,{itemId:8,qty:2,label:'Rope',note:'Keep note',visible:true,custom:'keep'},9],equipment:{head:3},equipmentVisible:{head:true},notebook:'keep',party:{members:[1,2]},sim1287:session(pending(fight()))};
  const s=stateFor(run),snapshot=s.state.capture(),choice=s.state.itemChoices(snapshot).find(c=>c.source==='inventory'&&c.itemId===8);
  assert.equal(s.writes(),0);const before=structuredClone(run);
  assert.equal(s.state.commitItemLoss(snapshot,choice,receipt=>applyDestinySessionAction(snapshot.value,'shared-item-loss',{receipt})),true);
  assert.equal(s.writes(),1);assert.equal(run.inventory[1].qty,1);assert.equal(run.inventory[1].custom,'keep');assert.equal(run.inventory[1].note,'Keep note');assert.equal(run.inventory[1].visible,true);
  assert.equal(run.sim1287.fight.phase,'end');assert.deepEqual(run.equipment,before.equipment);assert.deepEqual(run.party,before.party);assert.equal(run.notebook,'keep');
  assert.equal(s.state.commitItemLoss(snapshot,choice,()=>{throw Error('Must not run');}),false);assert.equal(s.writes(),1);assert.equal(run.inventory[1].qty,1);
});

test('equipment destruction removes one unit and clears visibility only when the whole slot disappears',()=>{
  for(const qty of [1,2]){
    const run={equipment:{head:{itemId:4,qty,label:'Helm',note:'keep'},feet:6},equipmentVisible:{head:true,feet:true},inventory:[7]};
    const before=structuredClone(run),choice=captureDestinyItemChoices(run).find(c=>c.source==='equipment'&&c.key==='head');
    const plan=planDestinyItemLoss(run,choice);assert.deepEqual(run,before);Object.assign(run,plan.patch);
    assert.equal(plan.receipt.quantity,1);assert.equal(run.equipment.feet,6);assert.deepEqual(run.inventory,[7]);
    if(qty===1){assert.equal(run.equipment.head,undefined);assert.equal(run.equipmentVisible.head,undefined);}
    else{assert.equal(run.equipment.head.qty,1);assert.equal(run.equipment.head.note,'keep');assert.equal(run.equipmentVisible.head,true);}
  }
});

for(const change of ['book','run','session','fight','inventory','item','quantity','read-only'])test('stale shared loss choice cannot remove an item after '+change,()=>{
  const run={inventory:[{itemId:8,qty:2}],sim1287:session(pending(fight()))};const s=stateFor(run),snapshot=s.state.capture(),choice=s.state.itemChoices(snapshot)[0];
  if(change==='book')s.book(1);if(change==='run')s.run(structuredClone(run));if(change==='read-only')s.run(null);
  if(change==='session')run.sim1287={...run.sim1287};if(change==='fight')run.sim1287.fight={...run.sim1287.fight};
  if(change==='inventory')run.inventory=[...run.inventory];if(change==='item')run.inventory[0]={...run.inventory[0]};if(change==='quantity')run.inventory[0].qty=3;
  const before=structuredClone(run);assert.equal(s.state.commitItemLoss(snapshot,choice,()=>{throw Error('Must not run');}),false);
  assert.deepEqual(run,before);assert.equal(s.writes(),0);
});

test('a failed resolution never destroys the item or writes simulator state',()=>{
  const run={inventory:[7],sim1287:session(pending(fight()))},s=stateFor(run),snapshot=s.state.capture(),choice=s.state.itemChoices(snapshot)[0],before=structuredClone(run);
  assert.throws(()=>s.state.commitItemLoss(snapshot,choice,()=>{throw Error('Invalid modifiers');}),/Invalid modifiers/);
  assert.throws(()=>s.state.commitItemLoss(snapshot,choice,()=>snapshot.value),/Acknowledge/);
  assert.throws(()=>s.state.commitItemLoss(snapshot,choice,()=>applyDestinySessionAction(snapshot.value,'shared-item-loss',{receipt:{source:'inventory',key:0,itemId:99,quantity:1}})),/Acknowledge/);
  assert.deepEqual(run,before);assert.equal(s.writes(),0);
});

test('nothing-to-lose acknowledgement is allowed only when both shared inventory and equipment are empty',()=>{
  for(const equipped of [false,true]){
    const run={inventory:[],equipment:equipped?{head:7}:{},sim1287:session(pending(fight()))},s=stateFor(run),snapshot=s.state.capture();
    assert.equal(s.state.commitItemLoss(snapshot,null,receipt=>applyDestinySessionAction(snapshot.value,'shared-item-loss',{receipt})),!equipped);
    assert.equal(s.writes(),equipped?0:1);
  }
});

test('a rerolled-away six does not destroy an item and the fifth survived round wins with zombies still alive',()=>{
  let f=rollDestinyDamage(lose(fight({abilities:{hypnotise:1}})),rolls(6));f=useDestinyAbility(f,'hypnotise',{},rolls(4));f=resolveDestinyDamage(f);
  assert.equal(f.phase,'end');assert.equal(f.history.some(e=>e.type==='shared-item-loss'),false);
  f=fight();for(let i=1;i<=5;i++){
    f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1))));assert.equal(f.status,i===5?'win':'active');
  }
  assert.equal(f.encounter.outcomeSection,'203');assert.equal(f.opponents[0].health,70);
});

test('explicit lost modifiers persist in setup while original sessions and unrelated ability counts remain intact',()=>{
  const original=session(pending(fight({abilities:{heal:2,cunning:1}})));original.setup.abilities={heal:2,cunning:1};
  const before=structuredClone(original),next=applyDestinySessionAction(original,'shared-item-loss',{receipt:{source:'inventory',key:0,itemId:8,quantity:1},options:{statLosses:{armour:1},lostAbilities:{heal:1}}});
  assert.deepEqual(original,before);assert.equal(next.setup.hero.armour,99);assert.equal(next.setup.abilities.heal,1);assert.equal(next.setup.abilities.cunning,1);
});

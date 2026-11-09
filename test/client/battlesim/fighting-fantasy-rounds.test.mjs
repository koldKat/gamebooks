import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const hero = changes => ({skill:8,skillInitial:12,stamina:24,staminaInitial:24,luck:6,luckInitial:12,
  gold:0,provisions:10,potion:'skill',potionUses:1,attackModifier:0,nextFightPenalty:0,items:{},...changes});
const enemy = stamina => ({name:'Opponent',skill:8,stamina});
const start = (rules = {}, changes = {}) => combat.startFight(hero(changes),
  {section:'1',label:'Encounter',enemies:[enemy(12)],...rules});
function dice(values) {
  let index=0;
  const roll=()=>{assert.ok(index<values.length,'unexpected die');return values[index++];};
  return {roll,done:()=>assert.equal(index,values.length,'unused dice')};
}
function round(fight,values) {
  const random=dice(values),next=combat.roundFight(fight,[],random.roll);random.done();return next;
}
const wound = fight => combat.resolveWound(fight);

test('two attacks remain in one round and stop when the opponent falls',()=>{
  let fight=start({attacksPerRound:2});
  fight=wound(round(fight,[1,1,6,6]));assert.equal(fight.round,1);assert.equal(fight.enemies[0].stamina,10);
  fight=wound(round(fight,[1,1,6,6]));assert.equal(fight.round,1);assert.equal(fight.enemies[0].stamina,8);
  fight=round(fight,[3,3,3,3]);assert.equal(fight.round,2);assert.equal(fight.pending,null);
  fight=wound(round(start({attacksPerRound:2,enemies:[enemy(2)]}),[1,1,6,6]));
  assert.equal(fight.status,'win');assert.deepEqual(fight.roundSequence,[]);
});

test('simultaneous enemies share one player roll and only the chosen target takes damage',()=>{
  let fight=start({simultaneous:true,enemies:[enemy(4),enemy(4)]});
  fight=wound(round(fight,[6,6,1,1]));assert.equal(fight.round,1);
  fight=round(fight,[1,1]);assert.equal(fight.pending,null);assert.equal(fight.round,1);
  assert.deepEqual(fight.enemies.map(e=>e.stamina),[2,4]);
  fight=wound(round(fight,[6,6,1,1]));assert.equal(fight.target,1);
  fight=round(fight,[6,6]);assert.equal(fight.pending,null);
  assert.equal(fight.character.stamina,24);
});

test('a simultaneous defensive comparison can wound the player after the target falls',()=>{
  let fight=start({simultaneous:true,enemies:[{...enemy(2),skill:0},{...enemy(4),skill:20}]});
  fight=wound(round(fight,[3,3,1,1]));assert.equal(fight.target,1);
  fight=wound(round(fight,[1,1]));assert.equal(fight.character.stamina,22);assert.equal(fight.round,1);
  assert.equal(fight.enemies[1].stamina,4);
});

test('forced first rounds need no dice and normal opposed combat resumes afterward',()=>{
  for(const direction of ['outgoing','incoming']) {
    const random=dice([]);let fight=combat.roundFight(start({firstRoundOutcome:direction}),[],random.roll);random.done();
    assert.equal(fight.pending.direction,direction);fight=wound(fight);
    assert.equal(direction==='outgoing'?fight.enemies[0].stamina:fight.character.stamina,direction==='outgoing'?10:22);
    fight=round(fight,[3,3,3,3]);assert.equal(fight.round,2);assert.equal(fight.pending,null);
  }
});

test('reduced wounds use the same Luck adjustment as the printed combat rules',()=>{
  const fight=round(start({outgoingDamage:1}),[1,1,6,6]);
  assert.deepEqual(combat.pendingWoundValues(fight),{damage:1,lucky:3,unlucky:0});
  assert.equal(wound(fight).enemies[0].stamina,11);
  assert.equal(combat.resolveWound(fight,true,()=>1).enemies[0].stamina,9);
  assert.throws(()=>combat.resolveWound({...fight,character:hero({luck:0})},true,()=>1));
});

test('first lost round ends an encounter even if Luck reduces the wound',()=>{
  let fight=round(start({loseOnLostRound:true}),[6,6,1,1]);
  fight=combat.resolveWound(fight,true,()=>1);assert.equal(fight.status,'loss');assert.equal(fight.character.stamina,23);
});

test('entry score changes are optional, capped, and do not mutate the player',()=>{
  const player=hero();const entry={section:'1',label:'Encounter',enemies:[enemy(4)],entry:{skillChange:10,stamina:2}};
  assert.equal(combat.startFight(player,entry).character.skill,12);assert.equal(player.skill,8);
  const skipped=combat.startFight(player,entry,{applyEntry:false});assert.equal(skipped.character.skill,8);assert.equal(skipped.character.stamina,24);
  assert.equal(combat.startFight(player,{...entry,entry:{skillChange:-20}}).character.skill,0);
});

test('a printed escape price is required and spent exactly once',()=>{
  const config={escape:{gold:3,damage:0,destination:'2'}};
  assert.equal(combat.canEscape(start(config,{gold:2})),false);
  const fight=combat.escapeFight(start(config,{gold:4}));
  assert.equal(fight.status,'escaped');assert.equal(fight.character.gold,1);assert.equal(fight.destination,'2');
  assert.throws(()=>combat.escapeFight(fight));
});

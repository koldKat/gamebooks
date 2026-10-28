import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {character,beginFight,round,missileRound,approach,resolveOutcome,step,applyLuck,acceptNumbers,modifiers,woundedExitAvailable,takeWoundedExit,useRecovery} from '../../../../public/js/battlesim/engines/tolkien-quest/core.js';
import {definition,loadRoster,getRoster} from '../../../../public/js/battlesim/books/1441/definition.js';
const catalog=JSON.parse(readFileSync('data/simulator-rosters/1441.json','utf8'));
await loadRoster(async url=>{assert.equal(url,'/api/books/1441/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
const entry=id=>getRoster().find(e=>e.section===id);
const numbers=(...values)=>()=>{assert.ok(values.length,'unexpected pick');return values.shift();};
const start=(id,hero={},options={})=>{const e=entry(id);return beginFight(character({endurance:100,...hero}),e.enemies,{...options,rules:{...definition.combatRules,...e.rules}});};
test('Moria roster retains all 16 combats, four surprised entries and distinct creature stats',()=>{
  assert.equal(catalog.enemies.length,26);assert.equal(getRoster().length,20);
  for(const id of ['127-from221','189-from402','199-from193','259-from260']){
    const f=start(id,{}, {mode:'advanced'});assert.equal(f.surprised,true);assert.equal(f.stage,'melee');
    assert.equal(start(id.split('-')[0],{}, {mode:'advanced'}).surprised,false);
  }
  assert.deepEqual(['199','220','259'].map(id=>entry(id).enemies[0].endurance),[40,30,20]);
  assert.equal(entry('125').rules.cannotEscape,true);assert.equal(entry('257').rules.escape,'335');
  assert.equal(entry('203').enemies.length,2);assert.equal(entry('127').enemies.length,1);
  assert.equal(entry('127').enemies[0].kind,'monster','a swarm is not one charmable animal');
  assert.equal(entry('234').rules.sourceExperiencePerDefeatedEnemy,18);
});
test('Trolls begin in melee, prohibit escape and retain normal/magic weapon branches',()=>{
  for(const id of ['113','114']){
    const f=start(id,{}, {mode:'advanced'});assert.equal(f.stage,'melee');assert.throws(()=>round(f,'escape',numbers()),/Cannot escape/);
  }
  assert.equal(entry('113').enemies[0].db,10);assert.equal(entry('114').enemies[0].db,6);
});
test('only passage199 interrupts after three completed rounds; victory and defeat take precedence',()=>{
  let f=start('199');for(let i=0;i<3;i++)f=round(f,'attack',numbers(2,2));
  assert.equal(f.status,'avoided');assert.equal(f.destination,'209');assert.equal(f.round,3);
  let g=start('220');for(let i=0;i<4;i++)g=round(g,'attack',numbers(2,2));assert.equal(g.status,'active');
  f=start('199',{ob:100});f.round=2;f=resolveOutcome(round(f,'attack',numbers(12)));assert.equal(f.destination,'216');
  f=start('199',{endurance:1});f.round=2;f=resolveOutcome(round(f,'attack',numbers(2,12)));assert.equal(f.destination,'215');
  f=start('199',{missile:'bow'},{mode:'advanced'});f=missileRound(f,'shoot',numbers(2));f=approach(f,false);f=round(f,'attack',numbers(2,2));f=round(f,'attack',numbers(2,2));assert.equal(f.destination,'209');
});
test('the two dwarf encounters distinguish unconsciousness from death',()=>{
  for(const [id,unconscious,death]of [['231','158','202'],['412','273','148']]){
    const f=start(id);f.hero.condition='unconscious';f.status='loss';assert.equal(resolveOutcome(f).destination,unconscious);
    f.hero.condition='killed';assert.equal(resolveOutcome(f).destination,death);
  }
});
test('wounded-spider exit is optional, needs 40–50 damage and never replaces a kill',()=>{
  assert.equal(woundedExitAvailable(),false);
  const f=start('189');assert.equal(woundedExitAvailable(f),false);f.enemies[0].damage=40;
  assert.equal(woundedExitAvailable(f),true);assert.equal(takeWoundedExit(f).destination,'388');assert.equal(f.status,'active');
  f.enemies[0].damage=50;assert.equal(woundedExitAvailable(f),true);
  f.enemies[0].damage=51;assert.equal(woundedExitAvailable(f),false);
  f.enemies[0].damage=40;f.enemies[0].condition='killed';assert.equal(woundedExitAvailable(f),false);
  f.enemies[0].condition=undefined;f.lastAction={used:false,rolls:[{raw:7}]};assert.equal(woundedExitAvailable(f),false);
});
test('special arrows apply only with the source bow, consume one per shot and survive Luck replay',()=>{
  let f=start('207',{missile:'bow',specialArrows:3,sourceItems:['recurvedBow']},{mode:'advanced'});
  const before=JSON.stringify(f);assert.equal(modifiers(f,true).missileOb,2);
  f=missileRound(f,'shoot',numbers(7));assert.equal(f.hero.specialArrows,2);assert.equal(f.enemies[0].damage,4);assert.equal(JSON.parse(before).hero.specialArrows,3);
  f=approach(f,true,numbers(10));f=missileRound(f,'shoot',numbers(7));f=approach(f,true,numbers(10));f=missileRound(f,'shoot',numbers(7));assert.equal(f.hero.specialArrows,0);assert.equal(modifiers(f,true).missileOb,0);
  for(const h of [{missile:'spear',specialArrows:3,sourceItems:['recurvedBow']},{missile:'bow',specialArrows:3}]){
    f=start('207',h,{mode:'advanced'});const ob=modifiers(f,true).missileOb;assert.equal(ob,h.missile==='spear'?-1:0);
    f=missileRound(f,'shoot',numbers(7));assert.equal(f.hero.specialArrows,3);
  }
  f=start('207',{missile:'bow',specialArrows:3,sourceItems:['recurvedBow'],spells:['luck']},{mode:'advanced'});
  f=step(f,'shoot',numbers(7));f=applyLuck(f,0,numbers(7,8));assert.equal(f.hero.specialArrows,2);
});
test('recovery is local, spends one charge and cannot revive or bypass a pending Luck result',()=>{
  const item=definition.recoveryItems[0],f=start('207',{damage:17,mirenna:3});const original=JSON.stringify(f);
  const healed=useRecovery(f,item);assert.equal(healed.hero.damage,7);assert.equal(healed.hero.mirenna,2);assert.equal(JSON.stringify(f),original);
  assert.equal(useRecovery(healed,item).hero.damage,0);healed.hero.mirenna=0;assert.throws(()=>useRecovery(healed,item),/unavailable/);
  f.status='loss';f.hero.condition='killed';assert.throws(()=>useRecovery(f,item),/recover/);
  f.status='active';f.hero.condition=undefined;f.lastAction={used:false,rolls:[{raw:7}]};assert.throws(()=>useRecovery(f,item),/recover/);
  assert.equal(useRecovery(acceptNumbers(f),item).hero.damage,7);
});

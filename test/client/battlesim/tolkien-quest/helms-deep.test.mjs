import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {character,beginFight,round,missileRound,approach,openingAction,resolveOutcome} from '../../../../public/js/battlesim/engines/tolkien-quest/core.js';
import {definition,loadRoster,getRoster} from '../../../../public/js/battlesim/books/1440/definition.js';

const catalog=readRosterDocument(1440);
await loadRoster(async url=>{assert.equal(url,'/api/books/1440/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
const entry=id=>getRoster().find(e=>e.section===id);
const hero=extra=>character({strength:10,endurance:100,...extra});
const foe=extra=>({name:'Custom foe',ob:0,db:0,endurance:100,kind:'normal',...extra});
const numbers=(...values)=>()=>{assert.ok(values.length,'unexpected picked number');return values.shift();};
const start=(section,h={},options={},roll)=>{const e=entry(section);return beginFight(hero(h),e.enemies,{...options,rules:{...definition.combatRules,...e.rules,...options.rules}},roll);};
const custom=(h={},options={},enemies=[foe()])=>beginFight(hero(h),enemies,{...options,rules:{...definition.combatRules,...options.rules}});

test('Helm’s Deep roster is database-backed and preserves all eighteen printed encounters',()=>{
  assert.equal(catalog.enemies.length,25);assert.equal(getRoster().length,24);
  assert.equal(new Set(catalog.enemies.map(e=>e.key)).size,25);
  assert.equal(new Set(catalog.enemies.map(e=>e.stats.entry.section)).size,18);
  assert.equal(entry('115').enemies.length,3);
  assert.equal(entry('250').enemies[0].endurance,0);
  assert.equal(entry('384').enemies[0].endurance,2);
  for(const [ordinary,surprised]of [['226','226-surprised'],['232','232-surprised'],['264','264-surprised'],['269','269-surprised'],['336','336-surprised']]){
    assert.equal(entry(ordinary).rules.surprised,undefined);assert.equal(entry(surprised).rules.surprised,true);
    assert.deepEqual(entry(ordinary).enemies,entry(surprised).enemies);
  }
  assert.equal(entry('365').rules.surprised,true);
});

test('combat escape requires nine, while earlier books and the opening action retain eight',()=>{
  assert.equal(round(custom(),'escape',numbers(2,8)).status,'active');
  assert.equal(round(custom(),'escape',numbers(2,9)).status,'escaped');
  assert.equal(round(beginFight(hero(),[foe()]),'escape',numbers(2,8)).status,'escaped');
  assert.equal(openingAction(hero(),'escape',{rules:definition.combatRules},numbers(8)).success,true);
  assert.equal(openingAction(hero(),'escape',{rules:definition.combatRules},numbers(7)).surprised,true);
  assert.throws(()=>openingAction(hero(),'steal',{rules:definition.combatRules},numbers()),/not in this source/);
  let f=missileRound(custom({}, {mode:'advanced'}),'skip');
  assert.equal(approach(f,true,numbers(9)).stage,'melee');
  assert.equal(approach(f,true,numbers(10)).stage,'missile');
});

test('a damaging Skeleton hit drains one Strength instead of damage, without mutating saved input',()=>{
  const f=start('158',{strength:2,damage:7});const before=JSON.stringify(f);
  const hit=round(f,'attack',numbers(2,5));
  assert.equal(hit.hero.strength,1);assert.equal(hit.hero.damage,7);assert.equal(hit.status,'active');
  assert.equal(JSON.stringify(f),before);
  const missed=round(hit,'attack',numbers(2,2));assert.equal(missed.hero.strength,1);
  const lost=resolveOutcome(round(missed,'attack',numbers(2,5)));
  assert.equal(lost.hero.strength,0);assert.equal(lost.hero.damage,7);assert.equal(lost.status,'loss');assert.equal(lost.destination,'173');
  assert.equal(JSON.parse(JSON.stringify(lost)).hero.strength,0);
  assert.throws(()=>start('158',{strength:0}),/no Strength/);
});

test('Skeleton U and K defeat the hero even when no numeric Strength drain occurs',()=>{
  for(const raw of [11,12]){
    const f=round(start('158',{}, {surprised:true}),'attack',numbers(raw));
    assert.equal(f.status,'loss');assert.equal(resolveOutcome(f).destination,'173');
  }
});

test('printed zero Endurance waits for a successful strike and remains opt-in for older books',()=>{
  const f=start('250');assert.equal(f.status,'active');
  const missed=round(f,'attack',numbers(2,2));assert.equal(missed.status,'active');
  const hit=resolveOutcome(round(missed,'attack',numbers(7)));
  assert.equal(hit.status,'win');assert.equal(hit.destination,'211');
  assert.throws(()=>beginFight(hero(),[foe({endurance:0})]));
});

test('Fire Bolt uses one damage pick, and the older family still uses two',()=>{
  const f=missileRound(custom({magic:2,spells:['firebolt']},{mode:'advanced'}),'firebolt',numbers(7,3));
  assert.equal(f.enemies[0].damage,7);assert.equal(f.hero.damage,6);
  const old=missileRound(beginFight(hero({magic:2,spells:['firebolt']}),[foe()],{mode:'advanced'}),'firebolt',numbers(7,3,4));
  assert.equal(old.enemies[0].damage,11);
});

test('staff supplies five Fire Bolts but cannot pay another spell’s strain',()=>{
  let f=custom({deviceCharges:5},{mode:'advanced'});
  for(let i=0;i<5;i++){
    f=missileRound(f,'firebolt',numbers(7,2));assert.equal(f.hero.deviceCharges,4-i);assert.equal(f.hero.damage,0);
    f=approach(f,true,numbers(10));
  }
  assert.throws(()=>missileRound(f,'firebolt',numbers()),/not learned/);
  const shield=missileRound(custom({deviceCharges:5,spells:['shield']},{mode:'advanced'}),'shield',numbers(7));
  assert.equal(shield.hero.deviceCharges,5);assert.equal(shield.hero.damage,4);
  const failed=missileRound(custom({deviceCharges:5},{mode:'advanced'}),'firebolt',numbers(6));assert.equal(failed.hero.deviceCharges,5);
});

test('Calm permits escape from one normal foe and never bypasses compulsory or group fights',()=>{
  const f=resolveOutcome(missileRound(custom({spells:['calm']},{mode:'advanced',rules:{escape:'187'}}),'calm',numbers(7,8)));
  assert.equal(f.status,'calmed');assert.equal(f.destination,'187');assert.equal(f.enemies[0].condition,undefined);
  for(const section of ['194','264','158'])assert.throws(()=>missileRound(start(section,{spells:['calm']},{mode:'advanced'}),'calm',numbers()),/Cannot escape|normal being/);
});

test('spear doubles numeric damage, stacks with Strength, and leaves U/K untouched',()=>{
  let f=custom({weapon:'spear',itemBonuses:{weaponDamageMultiplier:2}});
  f=round(f,'attack',numbers(7,2));assert.equal(f.enemies[0].damage,6);
  const powered=custom({weapon:'spear',itemBonuses:{weaponDamageMultiplier:2}});powered.effects.strength=true;
  assert.equal(round(powered,'attack',numbers(7,2)).enemies[0].damage,12);
  const killed=round(custom({weapon:'spear',itemBonuses:{weaponDamageMultiplier:2}}),'attack',numbers(12));
  assert.equal(killed.enemies[0].condition,'killed');assert.equal(killed.events[0].damage,0);
  const thrown=missileRound(custom({weapon:'spear',missile:'spear',missileOb:1,itemBonuses:{weaponDamageMultiplier:2}},{mode:'advanced'}),'shoot',numbers(7));
  assert.equal(thrown.enemies[0].damage,6);assert.equal(thrown.hero.weapon,'unarmed');
});

test('Herulf and the cliff opponent distinguish unconsciousness from death on both sides',()=>{
  assert.equal(resolveOutcome(round(start('194',{ob:1}),'attack',numbers(11))).destination,'267');
  assert.equal(resolveOutcome(round(start('194',{ob:1}),'attack',numbers(12))).destination,'428');
  assert.equal(resolveOutcome(round(start('292',{ob:3}),'attack',numbers(11))).destination,'257');
  assert.equal(resolveOutcome(round(start('292',{ob:3}),'attack',numbers(12))).destination,'407');
  assert.equal(resolveOutcome(round(start('292',{}, {surprised:true}),'attack',numbers(10))).destination,'205');
  assert.equal(resolveOutcome(round(start('292',{}, {surprised:true}),'attack',numbers(12))).destination,'162');
  assert.equal(resolveOutcome(round(start('226',{}, {surprised:true}),'attack',numbers(12))).destination,undefined);
});

test('the healing entry applies at fight creation and not at render or subsequent rounds',()=>{
  const f=start('433-via150',{damage:12}, {},numbers(7));assert.equal(f.hero.damage,5);
  assert.equal(f.events[0].type,'entryHealing');assert.equal(start('433',{damage:12}).hero.damage,12);
  assert.equal(round(f,'attack',numbers(2,2)).hero.damage,5);
});

test('optional natural extremes preserve both two and twelve without changing older rules',()=>{
  const options={rules:definition.combatRules,unmodifiedTwo:true};
  assert.equal(openingAction(hero({running:-100}),'escape',options,numbers(12)).success,true);
  assert.equal(openingAction(hero({running:100}),'escape',options,numbers(2)).success,false);
  assert.equal(openingAction(hero({running:-100}),'escape',{unmodifiedTwo:true},numbers(12)).success,false);
  const f=missileRound(custom({magic:-100,deviceCharges:1},{mode:'advanced',unmodifiedTwo:true}),'firebolt',numbers(12,12));
  assert.equal(f.enemies[0].damage,12);
});

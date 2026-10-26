import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../../../public/js/battlesim/books/1288/state.js';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createDestinySession,beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {createRaidersFight,prepareRaidersFight,getRaidersPetCatalog,RAIDERS_BOOK_RULES} from '../../../public/js/battlesim/engines/destinyquest/raiders.js';
import {RAIDERS_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/raiders-abilities.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1288.json',import.meta.url))).enemies);
const hero={speed:100,brawn:200,magic:10,armour:0,health:1000,maxHealth:1000};
const context={roster,catalog:RAIDERS_ABILITIES,bookRules:RAIDERS_BOOK_RULES,createFight:createRaidersFight,prepareFight:prepareRaidersFight};
const begin=(setup,id='one',session=createDestinySession())=>beginDestinySession(session,{hero,...setup},{...context,outcomeId:id});
const act=(s,name,payload={})=>applyDestinySessionAction(s,name,payload,{roster,catalog:RAIDERS_ABILITIES,roll:()=>1});
const win=s=>act(act(s,'roll-speed'),'resolve-speed');
const damage=s=>act(act(s,'roll-damage'),'resolve-damage');
const pet=id=>({...getRaidersPetCatalog(roster).find(pet=>pet.id===id),stance:'passive',target:0});

test('Raiders source profiles stay in the database roster and pet setup also works with custom opponents',()=>{
 assert.equal(roster.length,122);assert.equal(getRaidersPetCatalog(roster).length,6);
 const source=pet('mastiff'),s=begin({pet:source,opponents:[{name:'Custom enemy',speed:1,brawn:1,armour:0,health:10,damageStat:'brawn'}]});
 assert.equal(s.fight.pet.name,source.name);assert.equal(s.fight.pet.brawn,source.brawn);assert.equal(s.fight.encounter.sourceBookId,1288);assert.equal(s.fight.team,undefined);
});
test('Raiders record-outcome carries lowered permanent attributes and Health but resets short-lived buffs',()=>{
 let s=begin({section:'735',abilities:{channel:1,haste:1}});s=act(s,'start-round',{target:0});s=act(s,'ability',{name:'channel'});s=act(s,'ability',{name:'haste'});s.fight.hero.health=900;s=damage(win(s));assert.equal(s.fight.status,'win');s=act(s,'record-outcome');assert.equal(s.setup.hero.health,900);assert.equal(s.setup.hero.magic,8);assert.equal(s.setup.hero.speed,100);
 const next=begin({...s.setup,section:'756'},'two',s);assert.equal(next.fight.hero.health,900);assert.equal(next.fight.hero.magic,8);assert.equal(next.fight.used.channel||0,0);
});
test('Raiders linked pet Health survives recording and re-entry without stacking minion Health bonuses',()=>{
 let s=begin({section:'735',pet:pet('fire-sprite'),abilities:{'volatile-link':1}});assert.equal(s.fight.pet.maxHealth,9);assert.equal(s.fight.pet.health,9);assert.equal(s.fight.abilities.conflagration,1);s.fight.pet.health=4;s=damage(win(act(s,'start-round',{target:0})));s=act(s,'record-outcome');assert.equal(s.setup.pet.carriedHealth,4);
 const next=begin({...s.setup,section:'756'},'two',s);assert.equal(next.fight.pet.maxHealth,9);assert.equal(next.fight.pet.health,4);assert.equal(next.setup.pet.maxHealth,6);
});
test('Raiders ordinary victory restores the companion before the next saved fight',()=>{
 let s=begin({section:'16',pet:pet('fire-sprite'),abilities:{'volatile-link':1}});s.fight.pet.health=1;s=damage(win(act(s,'start-round',{target:0})));s=act(s,'record-outcome');assert.equal(s.setup.pet.carriedHealth,9);const next=begin({...s.setup,section:'735'},'two',s);assert.equal(next.fight.pet.maxHealth,9);assert.equal(next.fight.pet.health,9);
});
test('Raiders preparation and session actions preserve the caller state and unrelated run data',()=>{
 const session=createDestinySession({setup:{},character:{items:['source-marker']}}),before=JSON.stringify(session);const setup={section:'735',hero,pet:pet('mastiff')},setupBefore=JSON.stringify(setup);const run={inventory:[{itemId:8,qty:2}],equipment:{head:{itemId:9}},notebook:'keep',simOther:{keep:true},sim1288:session},shared=JSON.stringify([run.inventory,run.equipment,run.notebook,run.simOther]);let saves=0;const state=createState(()=>({getBookId:()=>1288,getRun:()=>run,saveState:()=>saves++}));const snapshot=state.capture(),next=begin(setup,'one',state.read());assert.equal(state.commit(snapshot,next),true);assert.equal(saves,1);assert.equal(JSON.stringify(session),before);assert.equal(JSON.stringify(setup),setupBefore);assert.equal(JSON.stringify([run.inventory,run.equipment,run.notebook,run.simOther]),shared);assert.equal(run.sim1288,next);
});

test('Raiders companion rest restores the next setup without altering an active or unrecorded fight',()=>{
 let s=begin({section:'735',pet:pet('mastiff')});assert.throws(()=>act(s,'rest-companion'),/record combat/);s.fight.pet.health=0;s=damage(win(act(s,'start-round',{target:0})));s=act(s,'record-outcome');assert.equal(s.setup.pet.carriedHealth,0);s=act(s,'rest-companion');assert.equal(s.setup.pet.carriedHealth,undefined);const next=begin({...s.setup,section:'756'},'two',s);assert.equal(next.fight.pet.health,8);
});

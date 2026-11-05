import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1607/definition.js';
import {startKingfisherFight, kingfisherAction, validateKingfisherFight} from '../../../public/js/battlesim/engines/kingfisher/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';
const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const player = overrides => ({hp:100,maxHp:100,experience:0,meleeBonus:0,rangedBonus:0,armour:0,ammo:0,spells:0,prayers:0,antidotes:0,...overrides});
const entry = n => ENCOUNTERS.find(e => e.section === String(n));
const start = (n, overrides, options) => startKingfisherFight(player(overrides),entry(n),options,RULES);
const act = (f,a,r) => kingfisherAction(f,{expectedRevision:f.revision,...a},r);
const attack = (f,dice,weaponIndex=0) => act(f,{kind:'attack',dice,weaponIndex});
const initiative = (f,die=4) => act(f,{kind:'initiative',dice:[die]});

test('the source-backed database supplies all twenty encounters and never invents missing Life Points',async()=>{
  let requests=0;
  await loadRoster(async()=>{requests++;return {ok:true,json:async()=>getRosterRows(1607)};});
  assert.equal(requests,1);assert.equal(ENCOUNTERS.length,20);assert.equal(RULES.storyProgressionAutomatic,false);
  for(const e of ENCOUNTERS){assert.ok(e.sourcePdfPages.length);if(e.section!=='83')assert.equal(validateKingfisherFight(start(e.section)).opponent.section,e.section);}
  assert.equal(entry(83).profiles[0].hp,null);assert.throws(()=>start(83),RangeError);
  assert.throws(()=>startKingfisherFight({},entry(7),{},RULES),RangeError);
});
test('ordinary misses ignore weapon bonuses and jaguar attacks retain their separate printed bonuses',()=>{
  let f=initiative(start(23,{meleeBonus:3}));f=attack(f,[2,2]);assert.equal(f.groups[0].currentHp,50);
  f=attack(f,[1,1]);f=attack(f,[2,3]);assert.equal(f.groups[0].currentHp,42);
  f=attack(initiative(start(7),1),[3,3],1);assert.equal(f.player.hp,84);
});
test('capture bounds distinguish unconsciousness, one remaining Life Point and death',()=>{
  let f=attack(initiative(start(16,{hp:25}),1),[3,3]);assert.equal(f.status,'loss');assert.equal(f.player.hp,9);assert.equal(f.destination,'71');
  f=attack(initiative(start(16,{hp:15}),1),[3,3]);assert.equal(f.player.hp,0);assert.equal(f.destination,'13');
  f=attack(initiative(start(91,{hp:11}),1),[2,3]);assert.equal(f.player.hp,1);assert.equal(f.status,'fighting');
  f=attack(initiative(start(91,{hp:12}),1),[2,3]);assert.equal(f.player.hp,2);assert.equal(f.destination,'21');
});
test('food and weakness affect this encounter only, and automatic first hit differs from first attack',()=>{
  let f=attack(initiative(start(18,{}, {beforeEating:true})),[3,3]);assert.equal(f.groups[0].currentHp,37);
  f=attack(initiative(start(18,{}, {foodBonus:true})),[3,3]);assert.equal(f.groups[0].currentHp,24);assert.equal(f.player.damageModifier,0);
  const next=attack(initiative(startKingfisherFight(f.player,entry(23),{},RULES)),[3,3]);assert.equal(next.groups[0].currentHp,44);
  assert.throws(()=>start(18,{}, {beforeEating:true,foodBonus:true}),RangeError);
  assert.equal(start(18,{}, {suckerPunch:true}).phase,'player');
  f=attack(start(113),[1,1]);assert.equal(f.player.hp,94);assert.equal(f.poisoned,0);
  f=attack(start(133),[1,1]);assert.equal(f.groups[0].currentHp,50);
  assert.equal(start(113,{weapon:'bow',ammo:3}).phase,'enemy');
});
test('rattler poison ticks at the next player turn even after a later missed enemy attack',()=>{
  let f=attack(initiative(start(9,{antidotes:1}),1),[3,3]);assert.equal(f.player.hp,79);assert.equal(f.poisoned,5);
  f=attack(f,[1,1]);f=attack(f,[1,1]);assert.equal(f.player.hp,74);
  f=act(f,{kind:'antidote'});assert.equal(f.poisoned,0);assert.equal(f.player.antidotes,0);
  f=attack(initiative(start(9,{poisonImmune:true}),1),[3,3]);assert.equal(f.player.hp,94);assert.equal(f.poisoned,0);
});
test('consecutive poisonous fangs reset on misses or antidote and immunity prevents the lethal effect',()=>{
  let f=attack(initiative(start(123,{antidotes:1}),1),[2,3]);assert.equal(f.groups[0].hitStreak,1);
  f=act(f,{kind:'antidote'});assert.equal(f.groups[0].hitStreak,0);
  f=attack(f,[1,1]);f=attack(f,[2,3]);assert.equal(f.status,'fighting');
  f=attack(f,[1,1]);f=attack(f,[1,1]);assert.equal(f.groups[0].hitStreak,0);
  for(let i=0;i<2;i++){f=attack(f,[1,1]);f=attack(f,[2,3]);}
  assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
  f=attack(initiative(start(123,{poisonImmune:true}),1),[2,3]);f=attack(f,[1,1]);f=attack(f,[2,3]);assert.equal(f.status,'fighting');
});
test('the tax collector keeps exact halves and the ambassador doubles dice scores before the hit test',()=>{
  let f=attack(initiative(start(64,{hp:15,armour:100}),1),[5,5]);assert.equal(f.player.hp,7.5);assert.equal(f.status,'fighting');
  f=attack(initiative(start(80),1),[1,2]);assert.equal(f.player.hp,92);
});
test('the priest has exactly two explicit, conditional healing doses',()=>{
  let f=initiative(start(61));
  for(let i=0;i<3;i++){f=attack(f,[6,6]);if(i<2)f=attack(f,[1,1]);}
  assert.equal(f.groups[0].currentHp,4);f=act(f,{kind:'healEnemy',dice:[1]});f=act(f,{kind:'healEnemy',dice:[1]});
  assert.equal(f.groups[0].currentHp,6);assert.equal(f.groups[0].healingLeft,0);
  let rolls=0;assert.throws(()=>act(f,{kind:'healEnemy'},()=>{rolls++;return 0;}),RangeError);assert.equal(rolls,0);
});
test('arrows are consumed on misses, melee enemies cannot return bow fire, and empty guns lose their bonus',()=>{
  let f=start(23,{weapon:'bow',ammo:2,rangedBonus:5});assert.equal(f.phase,'player');
  f=attack(f,[1,1]);assert.equal(f.player.ammo,1);assert.equal(f.phase,'player');
  f=attack(f,[3,3]);assert.equal(f.groups[0].currentHp,39);assert.equal(f.player.ammo,0);
  let rolls=0;assert.throws(()=>act(f,{kind:'attack'},()=>{rolls++;return 0;}),RangeError);assert.equal(rolls,0);
  f=act(f,{kind:'weapon',weapon:'melee'});f=attack(f,[3,3]);assert.equal(f.groups[0].currentHp,33);
  f=attack(initiative(start(23,{weapon:'firearm',ammo:1,rangedBonus:10})),[1,1]);assert.equal(f.player.ammo,0);
  f=attack(f,[1,1]);f=attack(f,[3,3]);assert.equal(f.groups[0].currentHp,44);
});
test('the projectile vest blocks bow and thrown bonuses but leaves base dice damage intact',()=>{
  const e=structuredClone(entry(83));e.profiles[0].hp=60;
  let f=startKingfisherFight(player({projectileProtection:true}),e,{},RULES);f=attack(initiative(f,1),[3,3],2);assert.equal(f.player.hp,94);assert.equal(f.groups[0].weapons[2].remainingAmmo,50);
  f=startKingfisherFight(player({projectileProtection:true}),e,{},RULES);f=attack(initiative(f,1),[3,3],1);assert.equal(f.player.hp,94);
});
test('spells affect one human, prayers avoid cat fights, and the three-priest surprise applies once',()=>{
  let f=act(initiative(start(149,{spells:1})),{kind:'spell'});assert.equal(f.status,'win');assert.equal(f.destination,'160');assert.equal(f.player.experience,1);
  assert.throws(()=>act(initiative(start(7,{spells:1})),{kind:'spell'}),RangeError);
  f=act(start(76,{prayers:1}),{kind:'prayer'});assert.equal(f.status,'fled');assert.equal(f.player.experience,0);
  f=start(156,{meleeBonus:100,spells:3},{read108:true});assert.equal(f.phase,'enemy');assert.throws(()=>act(f,{kind:'spell'}),RangeError);
  f=attack(f,[1,1]);f=attack(f,[2,3]);assert.equal(f.groups[0].remaining,2);assert.equal(f.phase,'player');
  f=attack(f,[2,3]);assert.equal(f.phase,'player');f=attack(f,[2,3]);assert.equal(f.status,'win');
});
test('large groups stay compact, do not impose a roster order, and never play the story ending',()=>{
  let f=start(110,{meleeBonus:100});assert.equal(f.groups.length,1);assert.equal(f.groups[0].remaining,7002);assert.ok(JSON.stringify(f).length<6000);
  f=attack(f,[2,3]);assert.equal(f.groups[0].remaining,7001);assert.equal(f.phase,'initiative');
  f=act(start(16),{kind:'target',index:2});assert.equal(f.active,2);assert.equal(f.phase,'initiative');assert.equal(f.groups[2].remaining,3);
  const e=structuredClone(entry(110));e.profiles[0].count=1;
  f=attack(startKingfisherFight(player({meleeBonus:100}),e,{},RULES),[2,3]);assert.equal(f.status,'win');assert.equal(f.destination,'13');assert.equal(f.player.hp,100);
});
test('escape follows the source two-dice retries and stays unavailable after fighting starts',()=>{
  let f=act(start(91),{kind:'escape',dice:[3,3]});assert.equal(f.escapeClosed,false);
  f=act(f,{kind:'escape',dice:[3,3]});assert.equal(f.escapeClosed,true);assert.throws(()=>act(f,{kind:'escape',dice:[5,5]}),RangeError);
  f=act(start(91),{kind:'escape',dice:[5,5]});assert.equal(f.status,'fled');assert.equal(f.destination,'19');
  f=act(start(91),{kind:'escape',dice:[1,1]});assert.equal(f.player.hp,0);
  f=attack(initiative(start(91)),[1,1]);assert.throws(()=>act(f,{kind:'escape',dice:[5,5]}),RangeError);
});
test('the skunk distinguishes a clean kill, enemy initiative and a later missed attack',()=>{
  let f=attack(initiative(start(98,{meleeBonus:10})),[2,3]);assert.equal(f.status,'win');
  f=initiative(start(98),1);assert.equal(f.phase,'spray');f=act(f,{kind:'spray',dice:[3,4]});assert.equal(f.status,'ended');assert.equal(f.destination,'65');
  f=attack(initiative(start(98)),[1,1]);f=attack(f,[1,1]);assert.equal(f.phase,'player');
  f=attack(f,[1,1]);f=attack(f,[2,3]);assert.equal(f.phase,'spray');f=act(f,{kind:'spray',dice:[1,1]});assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
});
test('custom fights, bounded logs and revision guards preserve unrelated run state',()=>{
  const custom={name:'Custom opponent',profiles:[{name:'Custom opponent',hp:100,bonus:0,armour:0,count:1}]};
  let f=initiative(startKingfisherFight(player(),custom,{},RULES));
  for(let i=0;i<150;i++)f=attack(f,[1,1]);
  assert.equal(f.events.length,100);assert.equal(f.revision,151);
  let calls=0;assert.throws(()=>kingfisherAction(f,{kind:'attack',expectedRevision:1},()=>{calls++;return 0;}),RangeError);assert.equal(calls,0);
  const run={unrelated:{hp:17}}, definition={id:1607,stateKey:'sim1607'};let bookId=1607,saves=0;
  const store=createQuestState(()=>({run,bookId,definition,saveState:()=>saves++}),{validateFight:validateKingfisherFight});
  const token=store.snapshot();bookId=1;assert.equal(store.update(state=>({...state,fight:f}),token),false);assert.equal(saves,0);
  bookId=1607;assert.equal(store.update(state=>({...state,fight:f}),token),true);assert.deepEqual(run.unrelated,{hp:17});assert.equal(saves,1);
  const stale=store.snapshot();store.update(state=>state);assert.equal(store.update(state=>state,stale),false);
});

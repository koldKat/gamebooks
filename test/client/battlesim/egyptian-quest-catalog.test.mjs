import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeKingfisherEncounter, startKingfisherFight, kingfisherAction} from '../../../public/js/battlesim/engines/kingfisher/core.js';
import {loadRoster, ENCOUNTERS} from '../../../public/js/battlesim/books/1608/definition.js';
const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1608);
const encounters = rows.filter(row => row.stats?.dataset === 'ENCOUNTERS').map(row => row.stats.entry);
const rules = rows.find(row => row.stats?.dataset === 'RULES')?.stats.entry;
const entry = n => structuredClone(encounters.find(row => row.section === String(n)));
const player = overrides => ({hp:100,maxHp:100,...overrides});
const begin = (n, overrides, amend = () => {}) => {const e=entry(n);amend(e);return startKingfisherFight(player(overrides),e,{},rules);};
const act = (f,a,r) => kingfisherAction(f,{expectedRevision:f.revision,...a},r);
const hit = (f,dice=[2,3],weaponIndex=0) => act(f,{kind:'attack',dice,weaponIndex});
const initiative = (f,die=4) => act(f,{kind:'initiative',dice:[die]});

test('the book definition fetches the installed catalog once and accepts its explicit missing-stat fields',async()=>{
  let requests=0;
  await loadRoster(async()=>{requests++;return {ok:true,json:async()=>rows};});
  assert.equal(requests,1);assert.equal(ENCOUNTERS.length,19);
  assert.equal(ENCOUNTERS.find(row=>row.section==='122').profiles[0].bonus,null);
});
test('all nineteen source encounters load, while missing stats and rolled counts remain explicit',()=>{
  assert.equal(encounters.length,19);assert.equal(rules.storyProgressionAutomatic,false);
  for(const e of encounters)assert.ok(normalizeKingfisherEncounter(e).sourcePdfPages.length);
  for(const n of [87,116,122,150])assert.throws(()=>begin(n),RangeError);
  assert.equal(entry(116).profiles[0].hp,null);assert.equal(entry(150).profiles[0].hp,null);
  assert.equal(entry(122).profiles[0].bonus,null);assert.equal(entry(87).profiles[0].count,null);
  assert.throws(()=>begin(87,{},e=>e.profiles[0].count=7),RangeError);
  for(const e of encounters){
    const fixed=structuredClone(e);
    for(const p of fixed.profiles){if(p.countRequired)p.count=4;if(p.bonusRequired)p.bonus=0;if(p.hp==null&&!p.singleHitDefeat)p.hp=100;}
    assert.equal(startKingfisherFight(player(),fixed,{},rules).opponent.section,e.section);
  }
});
test('priests bring two replacements per kill without creating an unbounded opponent array',()=>{
  for(const n of [6,78]){
    let f=hit(initiative(begin(n,{meleeBonus:100})));assert.equal(f.groups.length,1);assert.equal(f.groups[0].remaining,4);
    assert.equal(f.status,'fighting');assert.equal(f.player.experience,0);assert.ok(JSON.stringify(f).length<8000);
    f=hit(initiative(begin(n,{hp:14}),1));assert.equal(f.player.hp,4);assert.equal(f.destination,'136');
    f=hit(initiative(begin(n,{hp:10}),1));assert.equal(f.destination,'13');
  }
});
test('crumbling mummies have no invented LP and a natural twelve remains lethal after score adjustments',()=>{
  let f=hit(initiative(begin(27)));assert.equal(f.opponent.profiles[0].hp,null);assert.equal(f.groups[0].remaining,1);
  f=begin(27,{enemyRollModifier:-20});f=act(f,{kind:'target',index:1});f=hit(initiative(f,1),[6,6]);
  assert.equal(f.status,'loss');assert.equal(f.player.hp,0);assert.equal(f.destination,'13');
  f=hit(initiative(begin(79,{poisonImmune:true,armour:100}),1),[6,6]);assert.equal(f.status,'loss');
});
test('the firearm deals thirty on a hit and automatically gives way to the sword',()=>{
  let f=hit(initiative(begin(22),1),[2,3],1);assert.equal(f.player.hp,70);assert.equal(f.groups[0].weapons[0].remainingAmmo,0);
  f=hit(f,[1,1]);f=hit(f,[2,3],0);assert.equal(f.player.hp,50);
  f=hit(initiative(begin(22),1),[1,1]);assert.equal(f.player.hp,100);assert.equal(f.groups[0].weapons[0].remainingAmmo,0);
});
test('cobra and scorpion hits kill, while a charged flail needs no invented scorpion LP',()=>{
  let f=hit(initiative(begin(70,{armour:100}),1));assert.equal(f.player.hp,0);
  f=hit(initiative(begin(70,{weapon:'magic',magicUses:1})));assert.equal(f.status,'win');assert.equal(f.destination,'45');
  f=begin(116,{weapon:'magic',magicUses:2});assert.equal(f.opponent.profiles[0].hp,null);assert.equal(f.groups[0].hpUnstated,true);
  f=hit(initiative(f));assert.equal(f.status,'win');
  f=hit(initiative(begin(116,{weapon:'magic',magicUses:1})),[1,1]);assert.equal(f.player.magicUses,0);
  f=hit(f,[1,1]);let calls=0;assert.throws(()=>act(f,{kind:'attack'},()=>{calls++;return 0;}),RangeError);assert.equal(calls,0);
});
test('the captain is rescued after three complete rounds, but a third-round victory still counts',()=>{
  const captain=e=>e.profiles[0].bonus=0;
  let f=begin(122,{},captain);
  for(let i=0;i<3;i++){f=hit(f,[1,1]);f=hit(f,[1,1]);}
  assert.equal(f.status,'loss');assert.equal(f.destination,'44');assert.equal(f.player.hp,100);
  f=begin(122,{meleeBonus:30},captain);
  for(let i=0;i<2;i++){f=hit(f,[1,1]);f=hit(f,[1,1]);}
  f=hit(f);assert.equal(f.status,'win');assert.equal(f.destination,'17');assert.equal(f.player.experience,1);
});
test('the ruby mummy removes exactly twenty LP per hit, including against armor',()=>{
  let f=hit(initiative(begin(126,{armour:100}),1));assert.equal(f.player.hp,80);
  f=hit(initiative(begin(126),1),[1,1]);assert.equal(f.player.hp,100);
});
test('the fistfight ignores weapon bonuses and ends below ten by comparing remaining LP',()=>{
  const rival=e=>e.profiles[0].hp=50;
  let f=hit(initiative(begin(150,{hp:20,meleeBonus:100,weapon:'magic',magicUses:3},rival)));
  assert.equal(f.groups[0].currentHp,45);assert.equal(f.player.weapon,'melee');
  f=hit(f,[3,3]);assert.equal(f.player.hp,6);assert.equal(f.status,'loss');assert.equal(f.destination,'103');
  f=hit(initiative(begin(150,{meleeBonus:100},e=>e.profiles[0].hp=12)));assert.equal(f.groups[0].currentHp,7);assert.equal(f.status,'win');
  f=begin(150,{hp:5},e=>e.profiles[0].hp=5);assert.equal(f.status,'ended');assert.equal(f.player.experience,0);
  f=initiative(begin(150,{},rival));assert.throws(()=>act(f,{kind:'weapon',weapon:'magic'}),RangeError);
});
test('the heavy club can be used every other player turn, with a wait or another weapon between uses',()=>{
  let f=hit(initiative(begin(135,{weapon:'heavy',heavyBonus:12})));assert.equal(f.groups[0].currentHp,43);assert.equal(f.heavyReady,false);
  f=hit(f,[1,1]);let calls=0;assert.throws(()=>act(f,{kind:'attack'},()=>{calls++;return 0;}),RangeError);assert.equal(calls,0);
  f=act(f,{kind:'wait'});assert.equal(f.heavyReady,true);f=hit(f,[1,1]);f=hit(f);assert.equal(f.groups[0].currentHp,26);
});
test('sleep and the orb neutralize opponents without summoning kill-triggered replacements',()=>{
  let f=act(initiative(begin(59,{sleepUses:1})),{kind:'sleep'});assert.equal(f.groups[0].remaining,1);assert.equal(f.phase,'enemy');
  f=act(initiative(begin(6,{orbUses:1})),{kind:'orb',dice:[3]});assert.equal(f.groups[0].remaining,0);assert.equal(f.status,'ended');assert.equal(f.player.experience,0);
  f=act(initiative(begin(87,{orbUses:1},e=>e.profiles[0].count=6)),{kind:'orb',dice:[6]});assert.equal(f.status,'win');assert.equal(f.player.experience,1);
});
test('limited healing preserves the current turn and rejects an exhausted item before rolling',()=>{
  let f=initiative(begin(135,{hp:50,potionUses:1,fullHealUses:1}));f=act(f,{kind:'potion',dice:[2,3]});assert.equal(f.player.hp,55);assert.equal(f.phase,'player');
  let calls=0;assert.throws(()=>act(f,{kind:'potion'},()=>{calls++;return 0;}),RangeError);assert.equal(calls,0);
  f=act(f,{kind:'fullHeal'});assert.equal(f.player.hp,100);assert.equal(f.player.fullHealUses,0);
});
test('Egyptian bow fights retain ordinary initiative and retaliation, and explicit score adjustments affect hits',()=>{
  let f=begin(135,{weapon:'bow',ammo:3});assert.equal(f.phase,'initiative');f=hit(initiative(f));assert.equal(f.phase,'enemy');
  f=hit(initiative(begin(135,{playerRollModifier:2})),[1,3]);assert.equal(f.groups[0].currentHp,54);
  f=hit(initiative(begin(135,{playerRollModifier:-1})),[2,3]);assert.equal(f.groups[0].currentHp,60);
});

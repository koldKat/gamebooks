import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const resume=f=>JSON.parse(JSON.stringify(f));
const foe={name:'Opponent',speed:0,brawn:2,armour:3,health:100};
function setup(abilities={},options={}){
  return configureDestinyAbilities(createDestinyFight({speed:20,brawn:5,magic:4,armour:2,health:12,maxHealth:30,...options.hero},options.foes||[foe]),abilities,options.equipment||{},
    {catalog,bookRules:{deathPenalties:false,deathMoves:false}});
}
const start=(abilities,options)=>startDestinyRound(setup(abilities,options),0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const finish=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(2))));

test('Channel pays two actual Magic per item, adds score without another damage die and survives reload',()=>{
  let f=rollDestinyDamage(win(start({channel:2})),rolls(2));
  const original=resume(f);
  f=use(f,'channel');assert.equal(destinyStat(f,'hero','magic'),2);assert.equal(destinyDamageScore(f),11);
  assert.deepEqual(f.turn.damageDice,[2]);assert.deepEqual(original.turn.damageDice,[2]);assert.equal(original.effects.length,0);
  f=use(resume(f),'channel');assert.equal(destinyStat(f,'hero','magic'),0);assert.equal(destinyDamageScore(f),15);
  assert.throws(()=>use(f,'channel'),/no uses left/);
  f=startDestinyRound(endDestinyRound(resolveDestinyDamage(f)),0);
  assert.equal(destinyStat(f,'hero','magic'),0);assert.equal(f.turn.damageScoreBonus,undefined);
});

test('Channel refuses insufficient current Magic without spending a charge or changing the input fight',()=>{
  const f=win(start({channel:1},{hero:{magic:1}})),before=resume(f);
  assert.throws(()=>use(f,'channel'),/Not enough magic/);assert.deepEqual(f,before);
});

test('Compulsion adds one score die and lowers only next round Speed by two',()=>{
  let f=use(win(start({compulsion:1})),'compulsion');
  f=rollDestinyDamage(f,rolls(2,4));assert.deepEqual(f.turn.damageDice,[2,4]);assert.equal(destinyStat(f,'hero','speed'),20);
  f=startDestinyRound(endDestinyRound(resolveDestinyDamage(f)),0);assert.equal(destinyStat(f,'hero','speed'),18);
  f=startDestinyRound(finish(win(f)),0);assert.equal(destinyStat(f,'hero','speed'),20);
});

test('Blessed Blades requires two swords, heals only their Brawn and caps at maximum Health',()=>{
  const equipment={mainHand:{type:'sword',brawn:3,magic:20},leftHand:{type:'sword',brawn:4,magic:20}};
  let f=use(start({'blessed-blades':1},{equipment}),'blessed-blades');assert.equal(f.hero.health,19);
  f=use(start({'blessed-blades':1},{equipment,hero:{health:28}}),'blessed-blades');assert.equal(f.hero.health,30);
  assert.throws(()=>use(start({'blessed-blades':1},{equipment:{mainHand:equipment.mainHand}}),'blessed-blades'),/leftHand/);
  assert.throws(()=>use(start({'blessed-blades':1},{equipment:{...equipment,leftHand:{type:'dagger',brawn:4}}}),'blessed-blades'),/leftHand/);
});

test('Focused Strike accepts fist weapons in both hands and ignores all enemy Armour',()=>{
  const equipment={mainHand:{type:'fist'},leftHand:{type:'fist weapon'}};
  let f=use(win(start({'focused-strike':1},{equipment})),'focused-strike');
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));assert.equal(f.opponents[0].health,93);
  assert.throws(()=>use(win(start({'focused-strike':1},{equipment:{mainHand:{type:'fist'},leftHand:{type:'sword'}}})),'focused-strike'),/leftHand/);
});

test('Last Defence and Near Death require ten Health or less and persist for the combat',()=>{
  for(const [name,attribute,initial]of [['last-defence','brawn',5],['near-death','magic',4]]){
    const invalid=start({[name]:1}),before=resume(invalid);
    assert.throws(()=>use(invalid,name),/Health is above/);assert.deepEqual(invalid,before);
    let f=use(start({[name]:1},{hero:{health:10}}),name);assert.equal(destinyStat(f,'hero',attribute),initial+2);
    f=startDestinyRound(finish(win(resume(f))),0);assert.equal(destinyStat(f,'hero',attribute),initial+2);
  }
});

test('Prophecy avoids an ordinary lost-round damage score once, without importing death penalties',()=>{
  let f=lose(start({prophecy:1},{hero:{speed:0},foes:[{...foe,speed:20,brawn:20}]}));
  f=use(f,'prophecy');f=resolveDestinyDamage(rollDestinyDamage(f,rolls(6)));assert.equal(f.hero.health,12);
  f=lose(startDestinyRound(endDestinyRound(resume(f)),0));assert.throws(()=>use(f,'prophecy'),/no uses left/);
});

test('Trample shares its three damage dice across every opponent, ignores Armour and replaces the score',()=>{
  let f=use(win(start({trample:1},{foes:[foe,{...foe,armour:50}]})),'trample',{},rolls(2,3,4));
  assert.deepEqual(f.opponents.map(o=>o.health),[91,91]);assert.equal(f.phase,'end');
  assert.throws(()=>rollDestinyDamage(f),/combat stage/);
});

test('Heart Shatter has its one printed variant, leaving the existing family and Legion catalogs unchanged',()=>{
  assert.equal(catalog.shatter.shatter,undefined);assert.equal(catalog.shatter.armourLoss,2);
  assert.equal(LEGION_ABILITIES.savagery.chooseAttribute.length,2);assert.equal(catalog.savagery.attribute,'brawn');
  assert.ok(Object.isFrozen(catalog));assert.ok(Object.isFrozen(catalog['focused-strike'].requiresWeaponHands.mainHand));
});

test('Channel and Faithful Friend can be prepared before Speed but never increase enemy damage',()=>{
  let f=start({channel:1,'faithful-friend':1},{hero:{speed:0},foes:[{...foe,speed:20}]});
  f=use(use(f,'channel'),'faithful-friend');f=rollDestinyDamage(lose(f),rolls(3));
  assert.equal(destinyDamageScore(f),5);f=resolveDestinyDamage(f);assert.equal(f.hero.health,9);
});

test('Confound and Counter strike the actual attacker even when a different component was selected',()=>{
  const options={hero:{speed:0},foes:[{...foe,speed:20,brawn:8,magic:2,damageStat:'brawn'},{name:'Component',role:'resource',armour:0,health:40}]};
  let f=start({confound:1},options);f.encounter={attackProxy:{1:0}};f.target=1;
  f=lose(f);const before=resume(f);assert.throws(()=>use(f,'confound',{target:1},rolls(4)),/targets the attacker/);assert.deepEqual(f,before);
  f=use(f,'confound',{},rolls(4));assert.deepEqual(f.opponents.map(o=>o.health),[96,40]);
  assert.equal(destinyStat(f,0,'brawn'),7);assert.equal(destinyStat(f,0,'magic'),1);
  f=resolveDestinyDamage(rollDestinyDamage(resume(f),rolls(6)));assert.equal(f.hero.health,12);
  f=start({counter:1},options);f.encounter={attackProxy:{1:0}};f.target=1;
  f=use(lose(f),'counter',{},rolls(3));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(4)));
  assert.deepEqual(f.opponents.map(o=>o.health),[97,40]);assert.equal(f.hero.health,4);
});

test('Stagger sets Armour to zero for precisely the next round while other effects continue',()=>{
  let f=resolveDestinyDamage(rollDestinyDamage(win(start({stagger:1})),rolls(2)));
  f=use(f,'stagger');assert.equal(destinyStat(f,0,'armour'),3);
  f=startDestinyRound(endDestinyRound(resume(f)),0);assert.equal(destinyStat(f,0,'armour'),0);
  f=startDestinyRound(finish(win(f)),0);assert.equal(destinyStat(f,0,'armour'),3);
});

test('Tremor Strike lowers every living opponent Speed for two rounds and leaves dash components null',()=>{
  let f=use(start({'tremor-strike':1},{foes:[{...foe,speed:5},{...foe,speed:7},{name:'Resource',role:'resource',armour:0,health:20}]}),'tremor-strike');
  assert.equal(destinyStat(f,0,'speed'),3);assert.equal(destinyStat(f,1,'speed'),5);assert.equal(f.opponents[2].speed,null);
  f=startDestinyRound(finish(win(f)),0);assert.equal(destinyStat(f,1,'speed'),5);
  f=startDestinyRound(finish(win(f)),0);assert.equal(destinyStat(f,1,'speed'),7);
});

test('Wish Master persists its three stat changes, and Last Rites checks the chosen enemy Health',()=>{
  let f=use(start({'wish-master':1}),'wish-master');
  assert.deepEqual(['speed','magic','armour'].map(k=>destinyStat(f,'hero',k)),[19,6,4]);
  f=startDestinyRound(finish(win(f)),0);assert.equal(destinyStat(f,'hero','armour'),4);
  f=start({'last-rites':1},{foes:[foe,{...foe,speed:5,health:15}]});const before=resume(f);
  assert.throws(()=>use(f,'last-rites',{target:0}),/Opponent Health/);assert.deepEqual(f,before);
  f=use(f,'last-rites',{target:1});assert.equal(destinyStat(f,1,'speed'),4);assert.equal(destinyStat(f,1,'armour'),2);
  assert.throws(()=>use(f,'last-rites',{target:1}),/no uses left/);
});

test('Blood Hail uses a shared roll but adds its bonus only for Bleed applied in an earlier round',()=>{
  let f=start({'blood-hail':1},{foes:[foe,foe,foe],equipment:{leftHand:{type:'bow'}}});
  f.round=2;f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:99},{kind:'bleed',target:1,amount:1,from:2,until:99});
  f=use(win(f),'blood-hail',{},rolls(2,3));assert.deepEqual(f.opponents.map(o=>o.health),[91,95,95]);
  assert.throws(()=>use(win(start({'blood-hail':1})),'blood-hail',{},rolls(2,3)),/left-hand/);
});

test('Blood Thief heals each rolled damage six, including a reroll, while the required bow is equipped',()=>{
  const options={hero:{health:5},equipment:{leftHand:{type:'bow'}}};
  let f=rollDestinyDamage(win(start({'blood-thief':1,'deep-wound':1,charm:1},options)),rolls(6));assert.equal(f.hero.health,9);
  f=use(f,'deep-wound',{},rolls(6));assert.equal(f.hero.health,13);
  f=use(f,'charm',{die:0},rolls(6));assert.equal(f.hero.health,17);
  f=rollDestinyDamage(win(start({'blood-thief':1},{hero:{health:5}})),rolls(6));assert.equal(f.hero.health,5);
  f=rollDestinySpeed(start({'blood-thief':1},options),rolls(6,6,1,2));assert.equal(f.hero.health,5);
});

test('Demon Claws damages on Speed doubles before and after a reroll, without triggering on damage doubles',()=>{
  let f=rollDestinySpeed(start({'demon-claws':1,feint:1,'deep-wound':1}),rolls(3,3,1,2));assert.equal(f.opponents[0].health,96);
  f=use(f,'feint',{dice:[0,1]},rolls(4,4));assert.equal(f.opponents[0].health,92);
  f=use(resolveDestinySpeed(f),'deep-wound');f=rollDestinyDamage(f,rolls(2,2));assert.equal(f.opponents[0].health,92);
});

test('Fiery Temper carries unmatched enemy damage sixes across rounds and boosts Brawn for each pair',()=>{
  let f=lose(start({'fiery-temper':1},{hero:{speed:0,armour:100},foes:[{...foe,speed:20}]}));
  f=rollDestinyDamage(f,rolls(6));assert.equal(destinyStat(f,'hero','brawn'),5);
  f=lose(startDestinyRound(endDestinyRound(resolveDestinyDamage(resume(f))),0));
  f=rollDestinyDamage(f,rolls(6));assert.equal(destinyStat(f,'hero','brawn'),7);assert.equal(f.opponentFaceCounts['fiery-temper'],2);
});

test('Searing Mantle uses current Armour and Fire Aura upgrades damage all eligible opponents',()=>{
  let f=start({'searing-mantle':1,'fire-aura':1,'turn-up-the-heat':1},{hero:{speed:0,armour:7},foes:[foe,foe]});
  f.encounter={passiveImmunityByTarget:{1:['fire-aura']}};
  addDestinyStatEffect(f,'hero','armour',1,null,'test-bonus');
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
  assert.deepEqual(f.opponents.map(o=>o.health),[96,98]);
});

test('Holy Protector affects undead only; Snake Strike requires its snake and inflicts owned harmful passives',()=>{
  let f=start({'holy-protector':1},{hero:{speed:0},foes:[foe,foe]});f.encounter={traitsByTarget:{0:['undead']}};
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));assert.deepEqual(f.opponents.map(o=>o.health),[99,100]);
  f=use(setup({'snake-strike':1,bleed:1,gouge:1},{equipment:{leftHand:{type:'snake'}}}),'snake-strike',{target:0},rolls(2,3));
  assert.equal(f.opponents[0].health,95);assert.equal(f.effects.find(e=>e.kind==='bleed').amount,2);
  assert.throws(()=>use(setup({'snake-strike':1}),'snake-strike',{target:0},rolls(2,3)),/left-hand/);
});

test('Indomitable prevents additive and set Brawn reductions while allowing boosts and other stat changes',()=>{
  const f=start({indomitable:1});addDestinyStatEffect(f,'hero','brawn',-3,null,'enemy');
  f.effects.push({kind:'stat',target:'hero',attribute:'brawn',set:0,from:1,until:99,source:'enemy'});
  addDestinyStatEffect(f,'hero','brawn',2,null,'blessing');addDestinyStatEffect(f,'hero','magic',-2,null,'enemy');
  assert.equal(destinyStat(f,'hero','brawn'),7);assert.equal(destinyStat(f,'hero','magic'),2);
});

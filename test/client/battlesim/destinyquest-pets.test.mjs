import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,
  resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyPet,setDestinyPetStance} from '../../../public/js/battlesim/engines/destinyquest/pets.js';
import {destinyStat,addDestinyStatEffect,restoreDestinySpentStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {RAIDERS_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/raiders-abilities.js';
import {resetDestinyCombatActor} from '../../../public/js/battlesim/engines/destinyquest/combat-reset.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';

const hero={speed:1,brawn:5,magic:4,armour:0,health:30,maxHealth:30};
const enemy={name:'Custom opponent',speed:9,brawn:10,magic:null,armour:20,health:100};
const pet={name:'Source pet',type:'pet',damageStat:'brawn',brawn:3,armour:2,health:8,abilities:[]};
const catalog={guardian:{category:'pa',phases:[]},'astral-manipulator':{category:'pa',phases:[]},bleed:{category:'pa',phases:[]},
  paralysis:{category:'mo',phases:['end'],petAction:'paralysis'}};
const create=(input=pet,stance='aggressive',inventory={},opponents=[enemy],restoreOnVictory=false)=>attachDestinyPet(
  configureDestinyAbilities(createDestinyFight(hero,opponents,{restoreOnVictory}),inventory,{},
    {catalog,bookRules:{deathMoves:false,deathPenalties:false}}),input,{stance});
const losing=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));
const hit=(f,roll=()=>1)=>resolveDestinyDamage(rollDestinyDamage(f,()=>1),roll);
const draws=(...values)=>()=>{assert.ok(values.length,'unexpected die');return values.shift();};

test('aggressive pet uses its own armour, retaliates through armour when killed and absorbs overflow',()=>{
  const initial=losing(create()),before=structuredClone(initial);
  const f=hit(initial,()=>{throw Error('Aggressive stance does not roll');});
  assert.equal(f.pet.health,0);assert.equal(f.hero.health,30);assert.equal(f.opponents[0].health,97);
  assert.equal(f.turn.petIntercept.damage,8);assert.equal(f.turn.healthDamage,0);assert.deepEqual(initial,before);
});

test('passive guard rolls one once; only a one redirects damage and never retaliates',()=>{
  for(const die of [1,2,6]){
    const f=hit(losing(create(pet,'passive')),draws(die));
    assert.equal(f.hero.health,die===1?30:19);assert.equal(f.pet.health,die===1?0:8);
    assert.equal(f.opponents[0].health,100);
    assert.deepEqual(f.history.filter(e=>e.type==='pet-guard').map(e=>e.die),[die]);
  }
});

test('an attack that cannot damage the hero neither targets the pet nor rolls its guard',()=>{
  let f=create(pet,'passive');f.hero.armour=20;
  f=hit(losing(f),()=>{throw Error('No Health damage means no pet guard');});
  assert.equal(f.hero.health,30);assert.equal(f.pet.health,8);
});

test('pet interception suppresses enemy hit statuses, tests and reflection against the hero',()=>{
  let f=create({...pet,health:20},'aggressive',{bleed:1});
  f.encounter={heroStatusOnHit:{name:'venom',amount:2},blockCategoriesOnHit:['sp','co'],
    healthHitTestsByTarget:{0:{name:'Hit test',kind:'test'}},reflectDamage:[{allDamage:true,amount:5}]};
  f=hit(losing(f));assert.equal(f.hero.health,30);assert.equal(f.pet.health,11);
  assert.equal(f.encounter.heroStatuses,undefined);assert.equal(f.encounter.blockedRounds,undefined);
  assert.equal(f.turn.pendingAbility,undefined);assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
  assert.equal(f.turn.lastHeroDamage,undefined);
});

test('explicit printed piercing can ignore pet armour, while ordinary special attacks cannot',()=>{
  let f=create({...pet,health:20,armour:10});f.encounter={opponentIgnorePetArmourByTarget:{0:true}};
  f=hit(losing(f));assert.equal(f.pet.health,9);
  f=hit(losing(create({...pet,health:20,armour:10})));assert.equal(f.pet.health,19);
});

test('Astral manipulator protects only passive minions',()=>{
  let f=create({...pet,type:'minion'},'passive',{'astral-manipulator':1});
  f=hit(losing(f),()=>{throw Error('Protected passive minion cannot be targeted');});
  assert.equal(f.hero.health,19);assert.equal(f.pet.health,8);
  f=hit(losing(create(pet,'passive',{'astral-manipulator':1})),()=>1);
  assert.equal(f.hero.health,30);assert.equal(f.pet.health,0);
});

test('stance changes require a new round and survive JSON resume',()=>{
  let f=setDestinyPetStance(create(),'passive');f=losing(JSON.parse(JSON.stringify(f)));
  assert.throws(()=>setDestinyPetStance(f,'aggressive'),/start of a round/);
  f=hit(f,()=>2);f=endDestinyRound(f);f=setDestinyPetStance(f,'aggressive');
  f=startDestinyRound(f,0);assert.equal(f.pet.stance,'aggressive');
});

test('passive pet healing cannot revive it or exceed its starting Health',()=>{
  let f=create({...pet,health:7,maxHealth:8,abilities:['lick-your-wounds']},'passive');
  f=hit(losing(f),()=>2);f=endDestinyRound(f);assert.equal(f.pet.health,8);
  f=create({...pet,health:0,maxHealth:8,abilities:['lick-your-wounds']},'passive');
  f=hit(losing(f),()=>{throw Error('Dead pet cannot guard');});f=endDestinyRound(f);assert.equal(f.pet.health,0);
});

test('pet end damage uses the same round as enemy passives and does not suppress them',()=>{
  let f=create({...pet,abilities:['spark-jolt']},'passive',{},[{...enemy,health:1}]);
  f.encounter={endDamage:[{target:'hero',amount:2,ignoreArmour:true}]};
  // Supply the public end effect, independent of encounter adapter syntax.
  f=hit(losing(f),()=>2);f=endDestinyRound(f,[{target:'hero',amount:2,ignoreArmour:true}]);
  assert.equal(f.opponents[0].health,0);assert.equal(f.hero.health,17);assert.equal(f.status,'win');
});

test('pet injuries remain in delves and ordinary victory restores the pet',()=>{
  for(const restoreOnVictory of [false,true]){
    let f=create({...pet,health:3,maxHealth:8},'passive',{},[{...enemy,health:1}],restoreOnVictory);
    f.pet.abilities=['spark-jolt'];f=hit(losing(f),()=>2);f=endDestinyRound(f);
    assert.equal(f.status,'win');assert.equal(f.pet.health,restoreOnVictory?8:3);
  }
});

test('Guardian can retaliate on a fatal passive pet hit; scorpion paralysis applies next round',()=>{
  let f=hit(losing(create(pet,'passive',{guardian:1})),()=>1);
  assert.equal(f.opponents[0].health,98);assert.equal(f.hero.health,30);
  f=hit(losing(create({...pet,health:20,abilities:['paralysis']},'aggressive',{paralysis:1})));
  assert.equal(f.effects.some(e=>e.source==='paralysis'),false);
  f=useDestinyAbility(f,'paralysis');assert.throws(()=>useDestinyAbility(f,'paralysis'),/no uses/);
  assert.equal(destinyStat(f,0,'speed'),9);f=endDestinyRound(f);f=startDestinyRound(f,0);
  assert.equal(destinyStat(f,0,'speed'),8);
});

test('pet passive damage respects passive-immune shields',()=>{
  let f=create({...pet,abilities:['spark-jolt']},'passive');f.encounter={passiveImmuneTargets:[0]};
  f=hit(losing(f),()=>2);f=endDestinyRound(f);assert.equal(f.opponents[0].health,100);
});

const magical={name:'Source minion',type:'minion',damageStat:'magic',magic:4,armour:1,health:6,maxHealth:6,abilities:[]};
const withSourcePet=(input,inventory,stance='aggressive',heroInput=hero)=>attachDestinyPet(
  configureDestinyAbilities(createDestinyFight(heroInput,[enemy],{restoreOnVictory:false}),inventory,{},
    {catalog:RAIDERS_ABILITIES}),input,{stance});

test('Energy boost spends real Magic and Dark bond restores costs without removing enemy debuffs',()=>{
  let f=withSourcePet({...magical,abilities:['dark-bond']},{'energy-boost':1});
  f=startDestinyRound(f,0);f=useDestinyAbility(f,'energy-boost');assert.equal(f.pet.armour,4);
  assert.equal(destinyStat(f,'hero','magic'),2);addDestinyStatEffect(f,'hero','magic',-1,null,'enemy-debuff');
  f=hit(resolveDestinySpeed(rollDestinySpeed(f,()=>1)));
  assert.equal(destinyStat(f,'hero','magic'),2);assert.equal(f.pet.health,0);
  assert.equal(f.effects.find(e=>e.source==='enemy-debuff').amount,-1);
  assert.equal(restoreDestinySpentStat(f,'magic',10),1);assert.equal(destinyStat(f,'hero','magic'),3);
  assert.equal(restoreDestinySpentStat(f,'magic',10),0);
});

test('Resurrection restores base minion attributes and cannot itself be restored',()=>{
  let f=withSourcePet({...magical,health:0},{resurrection:1,'shadow-well':1});
  f=startDestinyRound(f,0);f=useDestinyAbility(f,'resurrection');
  assert.equal(f.pet.health,6);assert.equal(f.pet.armour,1);assert.equal(f.pet.magic,4);
  assert.equal(destinyStat(f,'hero','magic'),1);
  const before=structuredClone(f);assert.throws(()=>useDestinyAbility(f,'shadow-well',{restore:'resurrection'}),/cannot be restored/);
  assert.deepEqual(f,before);
});

test('Pack spirit sacrifices distinct unused abilities without consuming their round allowance',()=>{
  let f=withSourcePet({...pet,abilities:['lick-your-wounds']},{'pack-spirit':1,charge:1,dodge:1});
  f=startDestinyRound(f,0);f=useDestinyAbility(f,'pack-spirit',{ability:'charge'});
  assert.equal(f.pet.brawn,4);assert.equal(f.used.charge,1);assert.equal(f.turn.used.sp,false);
  const before=structuredClone(f);assert.throws(()=>useDestinyAbility(f,'pack-spirit',{ability:'charge'}),/unused speed or combat/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'pack-spirit',{ability:'dodge'});assert.equal(f.pet.brawn,5);assert.equal(f.used.dodge,1);
  assert.equal(f.turn.used.co,false);assert.equal(f.turn.used.mo,undefined);
});

test('Evocation adds only the living minion Magic to the hero damage score',()=>{
  let f=withSourcePet(magical,{evocation:1},'passive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));
  f=useDestinyAbility(f,'evocation');assert.equal(f.turn.damageScoreBonus,4);assert.equal(f.turn.used.co,true);
  assert.equal(f.pet.magic,4);assert.equal(f.hero.magic,4);
  f=withSourcePet({...magical,health:0},{evocation:1},'passive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));
  assert.throws(()=>useDestinyAbility(f,'evocation'),/living pet or minion/);
});

test('linked combat resets temporary pet boosts while preserving its wounds and death',()=>{
  for(const health of [0,3]) {
    let f=withSourcePet(magical,{'energy-boost':1});f.encounter={};
    f=startDestinyRound(f,0);f=useDestinyAbility(f,'energy-boost');assert.equal(f.pet.armour,4);
    f.pet.health=health;resetDestinyCombatActor(f,{restoreAbilities:true});
    assert.equal(f.pet.armour,1);assert.equal(f.pet.health,health);assert.equal(f.pet.maxHealth,6);
  }
});

test('Far sight skips the first Speed roll only with a living talon wing',()=>{
  for(const health of [8,0]) {
    let f=withSourcePet({...pet,health,maxHealth:8,abilities:['winged-tormenter']},{'far-sight':1},'passive');
    f=startDestinyRound(f,0);let calls=0;
    f=rollDestinySpeed(f,()=>{calls++;return 1;});f=resolveDestinySpeed(f);
    assert.equal(calls,health?0:4);assert.equal(f.turn.winner,health?'hero':'opponent');
    f=hit(f,()=>2);f=endDestinyRound(f);f=startDestinyRound(f,0);calls=0;
    f=rollDestinySpeed(f,()=>{calls++;return 1;});assert.equal(calls,4);
  }
});

test('Death from above attacks before enemy damage and can end the fight immediately',()=>{
  for(const die of [4,5,6]) {
    let f=withSourcePet({...pet,abilities:['winged-tormenter']},{'death-from-above':1});
    f=rollDestinySpeed(startDestinyRound(f,0),()=>1);f=resolveDestinySpeed(f,()=>die);
    assert.equal(f.opponents[0].health,die>=5?97:100);assert.equal(f.hero.health,30);assert.equal(f.pet.health,8);
  }
  let f=attachDestinyPet(configureDestinyAbilities(createDestinyFight(hero,[{...enemy,health:2}],{restoreOnVictory:false}),
    {'death-from-above':1},{},{catalog:RAIDERS_ABILITIES}),{...pet,abilities:['winged-tormenter']});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1),()=>5);
  assert.equal(f.status,'win');assert.equal(f.hero.health,30);
});

test('Fire boost improves each fire-spell die only while its minion is alive',()=>{
  for(const health of [6,0]) {
    let f=withSourcePet({...magical,health,abilities:['fire-boost']},{fireball:1},'passive',{...hero,speed:30});
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'fireball',{},()=>2);
    assert.equal(f.opponents[0].health,health?91:94);
  }
});

test('Lightning boost adds three to the whole attack rather than to each damage die',()=>{
  let f=withSourcePet({...magical,abilities:['lightning-boost']},{'shock-blast':1},'passive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'shock-blast',{},()=>2);
  assert.equal(f.opponents[0].health,73);
});

test('Shadow boost waives Dark pact Health, improves Mind flay healing and extends Poison cloud',()=>{
  let f=withSourcePet({...magical,abilities:['shadow-boost']},{'dark-pact':1},'passive',{...hero,speed:30,health:1});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'dark-pact');assert.equal(f.hero.health,1);
  for(const health of [6,0]) {
    f=attachDestinyPet(configureDestinyAbilities(createDestinyFight({...hero,speed:30,health:20},[enemy,{...enemy,name:'Second'}]),
      {'mind-flay':1},{},{catalog:RAIDERS_ABILITIES}),{...magical,health,abilities:['shadow-boost']});
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'mind-flay',{},()=>2);
    assert.equal(f.hero.health,health?24:22);assert.deepEqual(f.opponents.map(o=>o.health),[98,98]);
  }
  f=attachDestinyPet(configureDestinyAbilities(createDestinyFight({...hero,speed:30},[0,1,2,3].map(i=>({...enemy,name:'Foe'+i}))),
    {'poison-cloud':1},{},{catalog:RAIDERS_ABILITIES}),{...magical,abilities:['shadow-boost']});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));const before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'poison-cloud',{targets:[0,2]}),/adjacent/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'poison-cloud',{targets:[0,1,2]});f=endDestinyRound(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[99,99,99,100]);
});

test('Broken bond offers a rerollable die plus two only when a mastiff dies, without repeating next round',()=>{
  let f=withSourcePet({...pet,abilities:['lick-your-wounds']},{'broken-bond':1,charm:1});
  f=hit(losing(f),()=>3);assert.equal(f.pet.health,0);assert.equal(f.phase,'ability-rolled');
  assert.equal(f.turn.pendingAbility.name,'broken-bond');assert.equal(f.opponents[0].health,97);
  f=useDestinyAbility(f,'charm',{die:0},()=>5);f=resolveDestinyAbilityRoll(f);
  assert.equal(f.opponents[0].health,90);assert.equal(f.phase,'end');
  f=hit(losing(endDestinyRound(f)));assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,90);
  f=hit(losing(withSourcePet(pet,{'broken-bond':1})));assert.equal(f.phase,'end');
});

test('Broken bond allows choosing another living opponent after its death roll',()=>{
  let f=attachDestinyPet(configureDestinyAbilities(createDestinyFight(hero,[enemy,{...enemy,name:'Other'}],{restoreOnVictory:false}),
    {'broken-bond':1},{},{catalog:RAIDERS_ABILITIES}),{...pet,abilities:['lick-your-wounds']},{stance:'aggressive'});
  f=hit(losing(f),()=>4);const before=structuredClone(f);
  assert.throws(()=>resolveDestinyAbilityRoll(f,()=>1,{target:9}),/living opponent/);assert.deepEqual(f,before);
  f=resolveDestinyAbilityRoll(f,()=>1,{target:1});assert.deepEqual(f.opponents.map(o=>o.health),[97,94]);
});

test('Volatile link grants three minion Health and rolls separate death damage against every opponent',()=>{
  let f=attachDestinyPet(configureDestinyAbilities(createDestinyFight(hero,[enemy,{...enemy,name:'Other'}],{restoreOnVictory:false}),
    {'volatile-link':1},{},{catalog:RAIDERS_ABILITIES}),magical,{stance:'aggressive'});
  assert.equal(f.pet.health,9);assert.equal(f.pet.maxHealth,9);assert.equal(f.pet.normal.maxHealth,9);
  f=hit(losing(f),draws(2,5));assert.deepEqual(f.turn.pendingAbility.groups.map(g=>g.dice),[[2],[5]]);
  f=resolveDestinyAbilityRoll(f);assert.deepEqual(f.opponents.map(o=>o.health),[94,95]);assert.equal(f.pet.health,0);
  const dead=withSourcePet({...magical,health:0},{'volatile-link':1});assert.equal(dead.pet.health,0);assert.equal(dead.pet.maxHealth,9);
});

test('Conflagration requires a living fire sprite and resolves its hit before Volatile link',()=>{
  let f=startDestinyRound(withSourcePet({...magical,abilities:['fire-boost']},{conflagration:1,'volatile-link':1}),0);
  f=useDestinyAbility(f,'conflagration',{deferDamage:true},()=>3);
  assert.equal(f.pet.health,0);assert.equal(f.turn.pendingAbility.name,'conflagration');
  f=resolveDestinyAbilityRoll(f,()=>5);assert.equal(f.opponents[0].health,97);assert.equal(f.turn.pendingAbility.name,'volatile-link');
  f=resolveDestinyAbilityRoll(f);assert.equal(f.opponents[0].health,92);assert.equal(f.phase,'speed');
  f=startDestinyRound(withSourcePet(magical,{conflagration:1}),0);
  assert.throws(()=>useDestinyAbility(f,'conflagration'),/required living minion/);assert.equal(f.pet.health,6);
});

test('a resurrected minion can trigger Volatile link again without stacking its Health bonus',()=>{
  let f=withSourcePet(magical,{'volatile-link':1,resurrection:1});
  f=hit(losing(f),()=>2);f=resolveDestinyAbilityRoll(f);f=useDestinyAbility(f,'resurrection');
  assert.equal(f.pet.health,9);assert.equal(f.pet.maxHealth,9);
  f=hit(losing(endDestinyRound(f)),()=>3);assert.equal(f.turn.pendingAbility.name,'volatile-link');
  f=resolveDestinyAbilityRoll(f);assert.equal(f.opponents[0].health,87);
});

test('Minor mirage can protect a living minion, with a rerollable avoidance check only on its actual hit',()=>{
  let f=withSourcePet(magical,{'minor-mirage':1,charm:1},'aggressive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));
  f=useDestinyAbility(f,'minor-mirage',{recipient:'pet'});assert.equal(destinyStat(f,'hero','magic'),3);
  assert.equal(f.phase,'end');f.hero.speed=1;f=hit(losing(endDestinyRound(f)),()=>1);
  assert.equal(f.turn.pendingAbility.type,'mirage-defense');assert.equal(f.pet.health,6);assert.equal(f.hero.health,30);
  f=useDestinyAbility(f,'charm',{die:0},()=>6);f=resolveDestinyAbilityRoll(f,()=>{throw Error('Avoided attack does not roll again');});
  assert.equal(f.pet.health,6);assert.equal(f.hero.health,30);assert.equal(f.phase,'end');
});

test('failed minion Mirage uses the previously rolled passive guard result without rerolling it',()=>{
  let f=withSourcePet(magical,{'minor-mirage':1},'passive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'minor-mirage',{recipient:'pet'});
  f.hero.speed=1;f=hit(losing(endDestinyRound(f)),draws(1,5));
  f=resolveDestinyAbilityRoll(f,()=>{throw Error('Guard roll was already accepted');});
  assert.equal(f.pet.health,0);assert.equal(f.hero.health,30);assert.equal(f.phase,'end');
});

test('hero Mirage does not protect an attacking pet and minion Mirage does not protect the hero',()=>{
  for(const [recipient,guard]of [['hero',1],['pet',2]]) {
    let f=withSourcePet(magical,{'minor-mirage':1},'passive',{...hero,speed:30});
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));f=useDestinyAbility(f,'minor-mirage',{recipient});
    f.hero.speed=1;f=hit(losing(endDestinyRound(f)),draws(guard));assert.equal(f.phase,'end');
    assert.equal(f.hero.health,guard===1?30:19);assert.equal(f.pet.health,guard===1?0:6);
  }
});

test('Minor mirage rejects ordinary pets but allows casting on the hero without a minion',()=>{
  let f=withSourcePet(pet,{'minor-mirage':1},'passive',{...hero,speed:30});
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1));
  assert.throws(()=>useDestinyAbility(f,'minor-mirage',{recipient:'pet'}),/living minion/);
  f=useDestinyAbility(f,'minor-mirage',{recipient:'hero'});assert.equal(f.effects.some(e=>e.kind==='mirage'&&e.target==='hero'),true);
});

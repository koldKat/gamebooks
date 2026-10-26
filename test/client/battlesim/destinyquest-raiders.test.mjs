import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,
  rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility,resolveDestinyAbilitySacrifice} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,addDestinyStatEffect,destinyOpponentSpeedResult,destinyStrike,destinyPassiveDamageBonus} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {RAIDERS_WARP_ABILITIES,RAIDERS_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/raiders-abilities.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';

const catalog={...RAIDERS_WARP_ABILITIES,
  cunning:{category:'mo',phases:['speed','end'],attribute:'brawn',amount:3},
  charge:{category:'sp',phases:['speed'],attribute:'speed',amount:2},
  dodge:{category:'co',phases:['damage','damage-rolled'],enemyWon:true,avoidDamage:true},
  charm:{category:'mo',phases:['speed-rolled','damage-rolled','ability-rolled'],reroll:'hero-die',perItem:true},
  bleed:{category:'pa',phases:[],statusEffect:{amount:1,delay:0}},
};
const hero={speed:4,brawn:5,magic:2,armour:1,health:30,maxHealth:30};
const foe={name:'Custom opponent',speed:20,brawn:5,magic:null,armour:2,health:100};
const setup=(inventory,health=30)=>configureDestinyAbilities(createDestinyFight({...hero,health},[foe]),inventory,{},
  {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
const losing=f=>resolveDestinySpeed(rollDestinySpeed(f,()=>1));
const nextRound=f=>startDestinyRound(endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,()=>1))),0);

test('Warp has a separate round allowance, survives resume and expires with its round',()=>{
  let f=startDestinyRound(setup({'dark-haze':1,'shadow-well':1,cunning:1,charge:1}),0);
  f=useDestinyAbility(f,'charge');f=useDestinyAbility(f,'cunning');f=useDestinyAbility(f,'dark-haze');
  assert.equal(f.hero.health,26);assert.equal(destinyStat(f,'hero','brawn'),11);
  assert.equal(f.turn.used.sp,true);assert.equal(f.turn.used.wa,true);
  f=JSON.parse(JSON.stringify(f));
  assert.throws(()=>useDestinyAbility(f,'shadow-well',{restore:'cunning'}),/Only one ability/);
  f=nextRound(losing(f));
  assert.equal(destinyStat(f,'hero','speed'),3);assert.equal(destinyStat(f,'hero','brawn'),5);
  f=useDestinyAbility(f,'shadow-well',{restore:'cunning'});
  assert.equal(f.used.cunning,0);assert.equal(f.used['dark-haze'],1);
  f=useDestinyAbility(f,'cunning');assert.equal(destinyStat(f,'hero','brawn'),8);
});

for(const [name,bonus]of [['misdirection',1],['improved-misdirection',2]]){
  test(`${name} avoids a lost round, costs four Health and boosts only the next round`,()=>{
    let f=losing(startDestinyRound(setup({[name]:1,dodge:1}),0));
    f=useDestinyAbility(f,name);assert.equal(f.hero.health,26);assert.equal(f.turn.avoidDamage,true);
    assert.equal(f.turn.used.co,false);assert.equal(f.turn.used.wa,true);
    f=useDestinyAbility(f,'dodge');assert.equal(f.turn.used.co,true);
    f=nextRound(f);assert.equal(f.hero.health,26);assert.equal(destinyStat(f,'hero','speed'),4+bonus);
    f=nextRound(losing(f));assert.equal(destinyStat(f,'hero','speed'),4);
  });
}

test('Warp rejects insufficient Health and invalid recovery without changing the saved fight',()=>{
  for(const health of [1,3]){
    const f=startDestinyRound(setup({'dark-haze':1},health),0),before=structuredClone(f);
    assert.throws(()=>useDestinyAbility(f,'dark-haze'),/Not enough health/);assert.deepEqual(f,before);
  }
  const f=startDestinyRound(setup({'shadow-well':1,cunning:1,charge:1}),0),before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'shadow-well',{restore:'charge'}),/already used/);
  assert.deepEqual(f,before);
});

test('Shroud burst damages all living opponents through armour without rolling or inflicting bleed',()=>{
  const opponents=[{...foe,armour:50},{...foe,name:'Second',armour:50},{...foe,name:'Third',health:0}];
  // A defeated opponent can exist in a resumed multi-opponent fight.
  opponents[2].health=1;
  let f=configureDestinyAbilities(createDestinyFight(hero,opponents),{'shroud-burst':1,bleed:1},{},{catalog});
  f.opponents[2].health=0;f=startDestinyRound(f,0);
  f=useDestinyAbility(f,'shroud-burst',{},()=>{throw Error('Fixed damage must not roll');});
  assert.deepEqual(f.opponents.map(o=>o.health),[97,97,0]);assert.equal(f.hero.health,26);
  assert.equal(f.effects.some(effect=>effect.kind==='bleed'),false);
  assert.equal(f.phase,'speed');
});

test('From shadows uses only main-hand Speed and Brawn for both chosen targets',()=>{
  const equipment={mainHand:{type:'sword',speed:2,brawn:4},leftHand:{type:'dagger',speed:99,brawn:99}};
  let f=configureDestinyAbilities(createDestinyFight(hero,[foe,{...foe,name:'Second'},{...foe,name:'Third'}]),
    {'from-shadows':1},equipment,{catalog});
  f=startDestinyRound(f,0);const before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'from-shadows',{targets:[1,1]}),/distinct/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'from-shadows',{targets:[1,2]},()=>{throw Error('Fixed damage must not roll');});
  assert.deepEqual(f.opponents.map(o=>o.health),[100,94,94]);assert.equal(f.hero.health,26);
});

test('Seraph protection works without Charm and restores a spent Charm when available',()=>{
  let f=startDestinyRound(setup({'seraphs-protection':1}),0);
  f=useDestinyAbility(f,'seraphs-protection');assert.equal(destinyStat(f,'hero','armour'),4);
  assert.equal(f.hero.health,26);assert.equal(f.used.charm,undefined);
  f=startDestinyRound(setup({'seraphs-protection':1,charm:1}),0);f.used.charm=1;
  const before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'seraphs-protection',{restore:'cunning'}),/specified ability/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'seraphs-protection');assert.equal(f.used.charm,0);
});

test('Trojan exploit grants a combat-local Charm charge without resetting spent charges',()=>{
  let f=startDestinyRound(setup({'trojan-exploit':1,charm:1}),0);f.used.charm=1;
  const before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'trojan-exploit',{attribute:'speed'}),/attribute/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'trojan-exploit',{attribute:'magic'});
  assert.equal(f.abilities.charm,2);assert.equal(f.used.charm,1);assert.equal(f.hero.health,26);
  assert.equal(destinyStat(f,'hero','magic'),4);assert.equal(destinyStat(f,'hero','brawn'),5);
  f=nextRound(losing(f));assert.equal(destinyStat(f,'hero','magic'),2);
  assert.equal(f.abilities.charm,2);assert.equal(f.used.charm,1);
  assert.equal(setup({'trojan-exploit':1,charm:1}).abilities.charm,1);
});

const sourceSetup=(inventory,opponents=[{...foe,speed:0}],heroInput={...hero,speed:20})=>
  configureDestinyAbilities(createDestinyFight(heroInput,opponents,{restoreOnVictory:false}),inventory,{},
    {catalog:RAIDERS_ABILITIES,bookRules:{deathMoves:false,deathPenalties:false}});
const sourceWin=f=>resolveDestinySpeed(rollDestinySpeed(f,()=>1));

test('Raider definitions use their source categories and omit foreign death moves',()=>{
  for(const [name,spec]of Object.entries(RAIDERS_ABILITIES)){
    assert.notEqual(spec.category,'dm',name);assert.equal(spec.phases.includes('death-move'),false,name);
  }
  assert.equal(RAIDERS_ABILITIES.burn.category,'co');assert.equal(RAIDERS_ABILITIES.reckless.limit,undefined);
  assert.deepEqual(RAIDERS_ABILITIES.drainage,RAIDERS_ABILITIES.fear);
  assert.deepEqual(RAIDERS_ABILITIES.dampen,RAIDERS_ABILITIES['mind-fumble']);
  assert.throws(()=>sourceSetup({getaway:1}),/Invalid ability inventory/);
});

test('Burn replaces a won attack with three armour-ignoring damage',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({burn:1}),0));
  f=useDestinyAbility(f,'burn',{},()=>{throw Error('Burn must not roll');});
  assert.equal(f.opponents[0].health,97);assert.equal(f.phase,'end');
  assert.equal(f.effects.some(effect=>effect.kind==='burn'),false);
});

test('Raider Immolation shares one die across two foes without reducing their armour',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({immolation:1},[{...foe,speed:0},{...foe,name:'Second',speed:0}]),0));
  f=useDestinyAbility(f,'immolation',{targets:[0,1],deferDamage:true},()=>3);f=resolveDestinyAbilityRoll(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[97,97]);
  assert.deepEqual(f.opponents.map((_,target)=>destinyStat(f,target,'armour')),[2,2]);
});

for(const name of ['overpower','deflect'])test(`${name} retaliates against the attacker when a different component is selected`,()=>{
  let f=sourceSetup({[name]:1},[foe,{...foe,name:'Component'}],hero);f.encounter={attackProxy:{1:0}};
  f=sourceWin(startDestinyRound(f,1));assert.equal(f.turn.winner,'opponent');
  f=useDestinyAbility(f,name,{deferDamage:true},()=>1);f=resolveDestinyAbilityRoll(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[98,100]);assert.equal(f.hero.health,30);
});

test('Slam slows the actual attacker next round and stops its current attack',()=>{
  let f=sourceSetup({slam:1},[foe,{...foe,name:'Component'}],hero);f.encounter={attackProxy:{1:0}};
  f=sourceWin(startDestinyRound(f,1));f=useDestinyAbility(f,'slam');assert.equal(f.phase,'end');
  f=startDestinyRound(endDestinyRound(f),1);
  assert.equal(destinyStat(f,0,'speed'),19);assert.equal(destinyStat(f,1,'speed'),20);assert.equal(f.hero.health,30);
});

test('Raider Reckless is once per combat, and magic costs do not become ability stat bonuses',()=>{
  let f=startDestinyRound(sourceSetup({reckless:1,'charged-shot':1,'inner-focus':1}),0);
  f=useDestinyAbility(f,'reckless');f=useDestinyAbility(f,'charged-shot');
  assert.equal(destinyStat(f,'hero','magic'),1);
  f=useDestinyAbility(f,'inner-focus',{attribute:'magic'});assert.equal(destinyStat(f,'hero','magic'),2);
  f=sourceWin(f);f=nextRound(f);
  assert.throws(()=>useDestinyAbility(f,'reckless'),/no uses/);assert.equal(destinyStat(f,'hero','magic'),1);
});

test('speed passives use main-hand Brawn and last only their printed duration',()=>{
  const gear={mainHand:{type:'sword',brawn:4},leftHand:{type:'sword',brawn:80}};
  let f=configureDestinyAbilities(createDestinyFight(hero,[{...foe,speed:0}],{restoreOnVictory:false}),
    {charge:1,whirlwind:1,'quick-cuts':1,bleed:1},gear,{catalog:RAIDERS_ABILITIES});
  f=startDestinyRound(f,0);f=useDestinyAbility(f,'charge');
  assert.equal(destinyStat(f,'hero','brawn'),7);assert.equal(f.opponents[0].health,96);
  assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
  f=nextRound(sourceWin(f));assert.equal(destinyStat(f,'hero','brawn'),5);
});

test('Sinister schemes reacts only to Warp and its bonus expires after the round',()=>{
  let f=startDestinyRound(sourceSetup({'dark-haze':1,'sinister-schemes':1,cunning:1},[foe],hero),0);
  f=useDestinyAbility(f,'dark-haze');assert.equal(destinyStat(f,'hero','brawn'),9);
  assert.equal(destinyStat(f,'hero','speed'),5);
  f=useDestinyAbility(f,'cunning');assert.equal(destinyStat(f,'hero','speed'),5);
  f=nextRound(losing(f));assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyStat(f,'hero','speed'),3);
});

test('Fast aid and Cutthroat react to Evade but not Dodge',()=>{
  for(const name of ['evade','dodge']){
    let f=sourceSetup({[name]:1,'fast-aid':1,cutthroat:1},[foe],{...hero,health:20});
    f=sourceWin(startDestinyRound(f,0));f=useDestinyAbility(f,name);
    assert.equal(f.hero.health,name==='evade'?23:20);
    assert.equal(destinyStat(f,'hero','brawn'),name==='evade'?6:5);
    f=nextRound(f);assert.equal(destinyStat(f,'hero','brawn'),name==='evade'?6:5);
  }
});

test('healing reactions stack, with Luck of the draw requiring a left-hand flintlock',()=>{
  for(const type of ['flintlock','sword']){
    let f=configureDestinyAbilities(createDestinyFight({...hero,health:20},[{...foe,armour:100}]),
      {heal:1,regrowth:1,'dark-mending':1,wrath:1,'luck-of-the-draw':1},{leftHand:{type}},{catalog:RAIDERS_ABILITIES});
    f=startDestinyRound(f,0);const before=structuredClone(f);
    assert.throws(()=>useDestinyAbility(f,'heal',{reactionTarget:99}),/living reaction target/);assert.deepEqual(f,before);
    f=useDestinyAbility(f,'heal');f=useDestinyAbility(f,'regrowth');
    assert.equal(f.hero.health,30);assert.equal(f.opponents[0].health,type==='flintlock'?86:90);
    assert.equal(f.turn.used.mo,undefined);
  }
});

for(const [name,armourLoss]of [['melt-armour',2],['scarab-swarm',3]])test(`${name} rolls two damage dice and applies the correct armour reduction`,()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({[name]:1},[{...foe,speed:0,armour:20}]),0));
  f=useDestinyAbility(f,name,{},()=>2);assert.equal(f.opponents[0].health,96);
  assert.equal(destinyStat(f,0,'armour'),20-armourLoss);assert.equal(f.phase,'end');
});

test('Leech strike heals four and Dancing rapier adds one to each rolled damage die',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'leech-strike':1,'dancing-rapier':1},[{...foe,speed:0}],{...hero,speed:20,health:15}),0));
  f=useDestinyAbility(f,'leech-strike',{},()=>2);
  assert.equal(f.hero.health,19);assert.equal(f.opponents[0].health,94);
});

test('Soul burst revives once without cleansing statuses, while Fire aura affects every opponent',()=>{
  let f=sourceSetup({'soul-burst':1,'fire-aura':1},[foe,{...foe,name:'Second'}],{...hero,health:1});
  f.encounter={heroStatuses:{venom:2}};
  f=sourceWin(startDestinyRound(f,0));f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
  assert.equal(f.hero.health,10);assert.equal(f.used['soul-burst'],1);
  assert.deepEqual(f.encounter.heroStatuses,{venom:2});
  f=endDestinyRound(f);assert.deepEqual(f.opponents.map(o=>o.health),[99,99]);
  f=sourceWin(startDestinyRound(f,0));f=resolveDestinyDamage(rollDestinyDamage(f,()=>6));
  assert.equal(f.hero.health,0);assert.equal(f.status,'loss');
});

test('Acid and Sear add once per score die regardless of item count, without boosting spell dice',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({acid:3,sear:2,'deep-wound':1},[{...foe,speed:0,armour:0}]),0));
  f=useDestinyAbility(f,'deep-wound');f=rollDestinyDamage(f,()=>2);assert.equal(destinyDamageScore(f),13);
  f=sourceWin(startDestinyRound(sourceSetup({acid:3,sear:2,'leech-strike':1}),0));
  f=useDestinyAbility(f,'leech-strike',{},()=>2);assert.equal(f.opponents[0].health,96);
});

test('Last defence and Rebuke track current Health rather than granting permanent bonuses',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'last-defence':1,rebuke:1,heal:1},[{...foe,speed:0}],{...hero,speed:20,health:10}),0));
  f=rollDestinyDamage(f,()=>2);assert.equal(destinyStat(f,'hero','brawn'),7);assert.equal(destinyDamageScore(f),10);
  f=useDestinyAbility(f,'heal');assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyDamageScore(f),7);
});

test('Blade finesse requires a main-hand sword and adds only to score sixes',()=>{
  for(const type of ['sword','axe']) {
    let f=configureDestinyAbilities(createDestinyFight({...hero,speed:20},[{...foe,speed:0}]),
      {'blade-finesse':1},{mainHand:{type}},{catalog:RAIDERS_ABILITIES});
    f=rollDestinyDamage(sourceWin(startDestinyRound(f,0)),()=>6);
    assert.equal(destinyDamageScore(f),type==='sword'?12:11);
  }
});

test('wounded-opponent bonuses exclude healthy and defeated opponents',()=>{
  let f=sourceSetup({'spring-strike':1,'bull-guard':1,unshakeable:1},
    [{...foe,speed:0},{...foe,speed:0,name:'Healthy'},{...foe,speed:0,name:'Defeated'}]);
  f.opponents[0].health=90;f.opponents[2].health=0;f=startDestinyRound(f,0);
  f=useDestinyAbility(f,'spring-strike');assert.equal(destinyStat(f,'hero','speed'),21);
  f=useDestinyAbility(f,'bull-guard');assert.equal(destinyStat(f,'hero','armour'),2);
  f=sourceWin(f);f=useDestinyAbility(f,'unshakeable');f=rollDestinyDamage(f,()=>2);
  assert.equal(destinyDamageScore(f),8);
});

test('Astute guardian grants the extra retaliation die only at six Armour or above',()=>{
  for(const armour of [5,6]) for(const [name,base]of [['counter',1],['overpower',2]]) {
    let f=sourceSetup({[name]:1,'astute-guardian':1},[foe],{...hero,armour});
    f=sourceWin(startDestinyRound(f,0));f=useDestinyAbility(f,name,{deferDamage:true},()=>1);
    assert.equal(f.turn.pendingAbility.groups[0].dice.length,base+(armour>=6?1:0));
  }
});

test('Acuity restores paid Magic only, reduces enemy Armour and replaces the normal attack',()=>{
  let f=sourceSetup({acuity:1,channel:1},[{...foe,speed:0,armour:5}],{...hero,speed:20,magic:4});
  f=startDestinyRound(f,0);f=useDestinyAbility(f,'channel');addDestinyStatEffect(f,'hero','magic',-1,null,'enemy-debuff');
  f=useDestinyAbility(sourceWin(f),'acuity');assert.equal(destinyStat(f,'hero','magic'),3);
  assert.equal(destinyStat(f,0,'armour'),2);assert.equal(f.opponents[0].health,100);assert.equal(f.phase,'end');
});

test('Blinding rays accepts up to three distinct targets and slows only those targets next round',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'blinding-rays':1},
    [{...foe,speed:2},{...foe,speed:2,name:'Second'},{...foe,speed:2,name:'Third'}]),0));
  const before=structuredClone(f);assert.throws(()=>useDestinyAbility(f,'blinding-rays',{targets:[0,0]}),/distinct/);assert.deepEqual(f,before);
  f=useDestinyAbility(f,'blinding-rays',{targets:[0,2]});assert.deepEqual(f.opponents.map(o=>o.health),[96,100,96]);
  f=startDestinyRound(endDestinyRound(f),0);assert.deepEqual(f.opponents.map((_,i)=>destinyStat(f,i,'speed')),[1,2,1]);
});

test('two-target abilities remain usable when only one opponent is present',()=>{
  for(const name of ['immolation','from-shadows']) {
    let f=sourceWin(startDestinyRound(sourceSetup({[name]:1}),0));
    f=useDestinyAbility(f,name,{},()=>2);assert.equal(f.phase,name==='immolation'?'end':'damage');
  }
});

for(const [name,diceCount,slow,cost]of [['deadsilver',3,2,0],['sunstroke',2,1,1]])test(`${name} uses its printed dice, Magic cost and next-round slow`,()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({[name]:1},[{...foe,speed:2,armour:20}]),0));
  f=useDestinyAbility(f,name,{},()=>2);assert.equal(f.opponents[0].health,100-2*diceCount);
  assert.equal(destinyStat(f,'hero','magic'),2-cost);assert.equal(destinyStat(f,0,'speed'),2);
  f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,0,'speed'),2-slow);
});

test('Augment adds two only to its extra score die and pays two Magic',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({augment:1},[{...foe,speed:0}],{...hero,speed:20,magic:4}),0));
  f=rollDestinyDamage(f,()=>2);f=useDestinyAbility(f,'augment',{},()=>3);
  assert.deepEqual(f.turn.damageDice,[2,3]);assert.equal(destinyDamageScore(f),12);assert.equal(destinyStat(f,'hero','magic'),2);
});

test('Gloom can avoid damage without a restore, or restore a spent Warp with Fast aid',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({gloom:1},[foe],hero),0));
  f=useDestinyAbility(f,'gloom');assert.equal(f.turn.avoidDamage,true);
  f=startDestinyRound(sourceSetup({gloom:1,'dark-haze':1,'fast-aid':1},[foe],hero),0);
  f=useDestinyAbility(f,'dark-haze');f=sourceWin(f);f=useDestinyAbility(f,'gloom',{restore:'dark-haze'});
  assert.equal(f.used['dark-haze'],0);assert.equal(f.hero.health,29);
});

test('Water jets is usable once each round, while Consume changes only the current speed dice',()=>{
  let f=startDestinyRound(sourceSetup({'water-jets':1,consume:1}),0),values=[1,1,1,6];
  f=rollDestinySpeed(f,()=>values.shift());f=useDestinyAbility(f,'consume');assert.deepEqual(f.turn.opponentSpeedDice,[1,5]);
  f=useDestinyAbility(f,'water-jets',{},()=>4);assert.deepEqual(f.turn.opponentSpeedDice,[4,4]);
  assert.throws(()=>useDestinyAbility(f,'water-jets'),/already been used this round/);
  f=nextRound(resolveDestinySpeed(f));f=rollDestinySpeed(f,()=>6);
  assert.deepEqual(f.turn.opponentSpeedDice,[6,6]);f=useDestinyAbility(f,'water-jets',{},()=>2);
  assert.equal(f.used['water-jets'],2);assert.deepEqual(f.turn.opponentSpeedDice,[2,2]);
});

test('Blood mark, activated Gouge, Rapid pulse and Toxic blades stack without granting Gouge early',()=>{
  let f=configureDestinyAbilities(createDestinyFight({...hero,speed:20,health:10},[{...foe,speed:0}],{restoreOnVictory:false}),
    {'blood-mark':1,'first-cut':1,bleed:1,gouge:1,'rapid-pulse':1,'toxic-blades':1},
    {mainHand:{type:'dagger'},leftHand:{type:'dagger'}},{catalog:RAIDERS_ABILITIES});
  f=useDestinyAbility(f,'blood-mark',{target:0});f=useDestinyAbility(f,'first-cut',{target:0});
  assert.equal(f.effects.find(e=>e.kind==='bleed').amount,1);assert.equal(f.bleedBonus,undefined);
  assert.equal(f.effects.find(e=>e.status==='toxic-blades').amount,1);
  f=sourceWin(startDestinyRound(f,0));f=useDestinyAbility(f,'gouge');
  f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));const health=f.opponents[0].health;
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,health-5);
});

test('Toxic blades requires a dagger in each hand',()=>{
  let f=configureDestinyAbilities(createDestinyFight(hero,[foe]),{'first-cut':1,'toxic-blades':1},
    {mainHand:{type:'dagger'},leftHand:{type:'sword'}},{catalog:RAIDERS_ABILITIES});
  f=useDestinyAbility(f,'first-cut',{target:0});assert.equal(f.effects.some(e=>e.status==='toxic-blades'),false);
});

test('Virulence spreads harmful passives but respects immunity and does not copy stat debuffs',()=>{
  let f=sourceSetup({virulence:1,bleed:1,'first-cut':1},
    [{...foe,speed:0},{...foe,speed:0,name:'Second'},{...foe,speed:0,name:'Immune'}]);
  f.encounter={passiveImmuneTargets:[2]};f=useDestinyAbility(f,'first-cut',{target:0});
  addDestinyStatEffect(f,0,'armour',-1,null,'prior-spell');
  f=sourceWin(startDestinyRound(f,0));f=useDestinyAbility(f,'virulence',{target:0});
  assert.deepEqual(f.effects.filter(e=>e.kind==='bleed').map(e=>e.target),[0,1]);
  assert.equal(f.effects.some(e=>e.kind==='stat'&&e.target===1),false);assert.equal(f.phase,'end');
});

test('Healing spring and Scalding geyser apply their continuing effect in the casting round',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'healing-spring':1},[{...foe,speed:0}],{...hero,speed:20,health:15}),0));
  f=useDestinyAbility(f,'healing-spring');assert.equal(f.hero.health,19);f=endDestinyRound(f);assert.equal(f.hero.health,20);
  f=sourceWin(startDestinyRound(sourceSetup({'scalding-geyser':1}),0));
  f=useDestinyAbility(f,'scalding-geyser');assert.equal(f.opponents[0].health,96);f=endDestinyRound(f);
  assert.equal(f.opponents[0].health,95);
});

test('Combustion applies its extra damage die at the end of the next round only',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({combustion:1}),0));f=useDestinyAbility(f,'combustion',{},()=>2);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,96);
  f=sourceWin(startDestinyRound(f,0));f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
  const health=f.opponents[0].health;f=endDestinyRound(f,[],()=>4);assert.equal(f.opponents[0].health,health-4);
  f=sourceWin(startDestinyRound(f,0));f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
  const after=f.opponents[0].health;f=endDestinyRound(f,[],()=>{throw Error('Delayed die already expired');});assert.equal(f.opponents[0].health,after);
});

test('Ghost blocks this round end damage and restores paid Magic only for a mage',()=>{
  for(const path of ['mage','warrior']) {
    let f=sourceSetup({ghost:1,channel:1},[{...foe,speed:0}],{...hero,speed:20,magic:4,health:20});f.character={path};
    f=startDestinyRound(f,0);f=useDestinyAbility(f,'channel');f=useDestinyAbility(f,'ghost');
    assert.equal(destinyStat(f,'hero','magic'),path==='mage'?3:2);
    f=sourceWin(f);f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
    f=endDestinyRound(f,[{target:'hero',amount:5,ignoreArmour:true}]);assert.equal(f.hero.health,20);
    f=sourceWin(startDestinyRound(f,0));f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
    f=endDestinyRound(f,[{target:'hero',amount:5,ignoreArmour:true}]);assert.equal(f.hero.health,15);
  }
});

test('Fireball splashes only neighbouring opponents and applies hit statuses only to the dice target',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({fireball:1,bleed:1},
    [0,1,2,3].map(i=>({...foe,name:'Foe'+i,speed:0,armour:99}))),1));
  f=useDestinyAbility(f,'fireball',{target:1},()=>2);
  assert.deepEqual(f.opponents.map(o=>o.health),[97,94,97,100]);
  assert.deepEqual(f.effects.filter(e=>e.kind==='bleed').map(e=>e.target),[1]);
});

test('Shock blast adds target Armour once, and Rend uses only the stronger main-hand damage attribute',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'shock-blast':1},[{...foe,speed:0,armour:7}],{...hero,speed:20,magic:4}),0));
  f=useDestinyAbility(f,'shock-blast',{},()=>2);assert.equal(f.opponents[0].health,89);assert.equal(destinyStat(f,'hero','magic'),2);
  f=configureDestinyAbilities(createDestinyFight({...hero,speed:20},[{...foe,speed:0,armour:20}]),{rend:1},
    {mainHand:{type:'wand',brawn:2,magic:4},leftHand:{type:'sword',brawn:99}},{catalog:RAIDERS_ABILITIES});
  f=useDestinyAbility(sourceWin(startDestinyRound(f,0)),'rend',{},()=>2);
  assert.equal(f.opponents[0].health,94);assert.equal(destinyStat(f,0,'armour'),19);
});

test('Storm shock retaliates against all opponents after an enemy health hit',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'storm-shock':1},[foe,{...foe,name:'Second'}],hero),0));
  f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));f=useDestinyAbility(f,'storm-shock');
  assert.deepEqual(f.opponents.map(o=>o.health),[97,97]);
});

test('Quick draw and Throwing knives do not inflict bleed, while Spark daggers does',()=>{
  for(const [name,targets,damage,statusTargets]of [
    ['quick-draw',undefined,[2,2,2],[]],['throwing-knives',undefined,[3,0,0],[]],['spark-daggers',[0,2],[2,0,2],[0,2]],
  ]) {
    let f=sourceSetup({[name]:1,bleed:1},[0,1,2].map(i=>({...foe,name:'Foe'+i,speed:0,armour:99})));
    f=useDestinyAbility(f,name,{target:0,...(targets?{targets}:{})});
    assert.deepEqual(f.opponents.map(o=>100-o.health),damage);
    assert.deepEqual(f.effects.filter(e=>e.kind==='bleed').map(e=>e.target),statusTargets);
  }
});

test('start-of-round passives accept separate targets and Armour breaker persists between rounds',()=>{
  let f=sourceSetup({'armour-breaker':1,'fire-starter':1},[{...foe,speed:0},{...foe,name:'Second',speed:0}]);
  const options={roundStartTargets:{'armour-breaker':1,'fire-starter':0}};
  f=startDestinyRound(f,0,()=>1,options);assert.equal(f.opponents[0].health,98);
  assert.equal(destinyStat(f,0,'armour'),2);assert.equal(destinyStat(f,1,'armour'),1);
  f=resolveDestinyDamage(rollDestinyDamage(sourceWin(f),()=>1));f=endDestinyRound(f);
  f=startDestinyRound(f,0,()=>1,options);assert.equal(destinyStat(f,1,'armour'),0);
});

test('a lethal Fire starter ends the fight without asking later passives to target a corpse',()=>{
  const f=startDestinyRound(sourceSetup({'fire-starter':1,'armour-breaker':1},[{...foe,health:2}]),0);
  assert.equal(f.status,'win');assert.equal(f.opponents[0].health,0);
});

test('Freerunner modifies the rolled Speed result and grants Brawn only when that round is won',()=>{
  for(const enemySpeed of [6,20]) {
    let f=sourceSetup({freerunner:1},[{...foe,speed:enemySpeed}],hero);
    f=rollDestinySpeed(startDestinyRound(f,0),()=>1);f=useDestinyAbility(f,'freerunner');
    assert.equal(destinyStat(f,'hero','speed'),4);f=resolveDestinySpeed(f);
    assert.equal(f.turn.winner,enemySpeed===6?'hero':'opponent');
    assert.equal(destinyStat(f,'hero','brawn'),enemySpeed===6?7:5);
    f=nextRound(f);assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyStat(f,'hero','speed'),4);
  }
});

test('a reaction defeating one pending Cleave target preserves damage to the other targets',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({cleave:1,charm:1,'luck-of-the-draw':1},
    [{...foe,speed:0,health:2},{...foe,speed:0}]),0));
  f.equipment.leftHand={type:'flintlock'};
  f=useDestinyAbility(f,'cleave',{deferDamage:true},()=>3);
  f=useDestinyAbility(f,'charm',{die:0,reactionTarget:0},()=>4);
  assert.equal(f.opponents[0].health,0);assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyAbilityRoll(f);assert.equal(f.opponents[1].health,96);
  assert.equal(f.phase,'end');
});

test('Cyclone adds one shared Cleave die before or during its pending roll',()=>{
  for(const deferred of [false,true]) {
    let f=sourceWin(startDestinyRound(sourceSetup({cleave:1,cyclone:1},[{...foe,speed:0},{...foe,speed:0}]),0));
    if(deferred) {
      f=useDestinyAbility(f,'cleave',{deferDamage:true},()=>2);
      f=useDestinyAbility(f,'cyclone',{},()=>3);
      assert.deepEqual(f.turn.pendingAbility.groups[0].dice,[2,3]);f=resolveDestinyAbilityRoll(f);
    } else {
      f=useDestinyAbility(f,'cyclone');f=useDestinyAbility(f,'cleave',{},()=>2);
    }
    assert.deepEqual(f.opponents.map(o=>o.health),[deferred?95:96,deferred?95:96]);
    assert.equal(f.used.cyclone,1);assert.equal(f.used.cleave,1);
  }
});

test('Cyclone rejects another pending spell without spending its charge',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({cleave:1,cyclone:1,fireball:1}),0));
  f=useDestinyAbility(f,'fireball',{deferDamage:true},()=>2);const before=structuredClone(f);
  assert.throws(()=>useDestinyAbility(f,'cyclone'),/matching ability/);assert.deepEqual(f,before);
});

test('Somersault copies a chosen rolled Speed die into a damage score without rolling again',()=>{
  let f=startDestinyRound(sourceSetup({somersault:1}),0);const dice=[2,5,1,1];
  f=resolveDestinySpeed(rollDestinySpeed(f,()=>dice.shift()));f=rollDestinyDamage(f,()=>1);
  assert.throws(()=>useDestinyAbility(f,'somersault',{speedDie:9,die:0}),/available die/);
  const speed=[...f.turn.heroSpeedDice];f=useDestinyAbility(f,'somersault',{speedDie:1,die:0},()=>{throw Error('No new roll');});
  assert.equal(f.turn.damageDice[0],5);assert.deepEqual(f.turn.heroSpeedDice,speed);
  assert.equal(f.used.somersault,1);
});

test('Somersault respects locked score dice and cannot change replacement spell dice',()=>{
  let f=rollDestinyDamage(sourceWin(startDestinyRound(sourceSetup({somersault:1,cleave:1}),0)),()=>1);
  f.turn.lockedDamageDice=[0];assert.throws(()=>useDestinyAbility(f,'somersault',{speedDie:0,die:0}),/Saved dice/);
  f=sourceWin(startDestinyRound(sourceSetup({somersault:1,cleave:1}),0));
  f=useDestinyAbility(f,'cleave',{deferDamage:true},()=>1);
  assert.throws(()=>useDestinyAbility(f,'somersault',{speedDie:0,die:0}),/phase|available/i);
});

test('Unbowed heals by a positive hero Armour modifier, capped at maximum and never revives',()=>{
  let f=startDestinyRound(sourceSetup({unbowed:1,'frost-guard':1},undefined,{...hero,health:15}),0);
  f=useDestinyAbility(f,'frost-guard');assert.equal(f.hero.health,18);
  addDestinyStatEffect(f,0,'armour',3,1,'enemy-boost');assert.equal(f.hero.health,18);
  addDestinyStatEffect(f,'hero','brawn',3,1,'strength');assert.equal(f.hero.health,18);
  addDestinyStatEffect(f,'hero','armour',-3,1,'penalty');assert.equal(f.hero.health,18);
  addDestinyStatEffect(f,'hero','armour',20,1,'blessing');assert.equal(f.hero.health,30);
  f.hero.health=0;addDestinyStatEffect(f,'hero','armour',3,1,'too-late');assert.equal(f.hero.health,0);
});

test('Volatile mix applies each instructed die, preserving permanent and round-only modifiers',()=>{
  let f=startDestinyRound(sourceSetup({'volatile-mix':1},undefined,{...hero,speed:20,health:10}),0);
  const dice=[1,2,3,4,5,6];f=useDestinyAbility(f,'volatile-mix',{count:6},()=>dice.shift());
  assert.equal(f.phase,'ability-rolled');assert.equal(f.hero.health,10);
  f=resolveDestinyAbilityRoll(f);assert.equal(f.hero.health,21);
  assert.equal(destinyStat(f,'hero','brawn'),6);assert.equal(destinyStat(f,'hero','magic'),3);
  f=nextRound(sourceWin(f));assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(destinyStat(f,'hero','magic'),1);
});

test('Volatile mix allows Charm before acceptance and validates the requested dice count atomically',()=>{
  let f=startDestinyRound(sourceSetup({'volatile-mix':1,charm:1},undefined,{...hero,health:10}),0);
  for(const count of [undefined,0,-1,1.5,101]) assert.throws(()=>useDestinyAbility(f,'volatile-mix',{count}),/number of dice/);
  f=useDestinyAbility(f,'volatile-mix',{count:1},()=>2);
  f=useDestinyAbility(f,'charm',{die:0},()=>6);f=resolveDestinyAbilityRoll(f);
  assert.equal(f.hero.health,16);assert.equal(f.phase,'speed');
});

test('a lethal Volatile mix health loss is not undone by a later healing die',()=>{
  let f=startDestinyRound(sourceSetup({'volatile-mix':1},undefined,{...hero,health:1}),0);
  const dice=[2,6];f=useDestinyAbility(f,'volatile-mix',{count:2},()=>dice.shift());f=resolveDestinyAbilityRoll(f);
  assert.equal(f.hero.health,0);assert.equal(f.status,'loss');
});

test('Sinking sand repeats the whole attack Speed result despite expiring enemy stat bonuses',()=>{
  let f=startDestinyRound(sourceSetup({'sinking-sand':1,boneshaker:1},[{...foe,speed:2}]),0);
  addDestinyStatEffect(f,0,'speed',6,1,'temporary-speed');
  f=rollDestinySpeed(f,()=>2);assert.equal(destinyOpponentSpeedResult(f),12);
  f=useDestinyAbility(f,'sinking-sand');assert.equal(destinyStat(f,'hero','magic'),1);
  f=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(f),()=>1));f=endDestinyRound(f);
  f=JSON.parse(JSON.stringify(f));f=startDestinyRound(f,0);let rolls=0;
  f=rollDestinySpeed(f,()=>{rolls++;return 3;});assert.equal(rolls,2);
  assert.equal(destinyStat(f,0,'speed'),2);assert.equal(destinyOpponentSpeedResult(f),12);
  assert.throws(()=>useDestinyAbility(f,'boneshaker'),/Frozen dice/);
  f=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(f),()=>1));f=endDestinyRound(f);
  f=rollDestinySpeed(startDestinyRound(f,0),()=>3);assert.equal(destinyOpponentSpeedResult(f),8);
});

test('Sinking sand only freezes the rolled attacker and does not follow a different selected opponent',()=>{
  let f=rollDestinySpeed(startDestinyRound(sourceSetup({'sinking-sand':1},[{...foe,speed:2},{...foe,speed:1}]),0),()=>2);
  assert.throws(()=>useDestinyAbility(f,'sinking-sand',{target:1}),/whose attack speed/);
  f=useDestinyAbility(f,'sinking-sand');f=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(f),()=>1));f=endDestinyRound(f);
  f=rollDestinySpeed(startDestinyRound(f,1),()=>3);assert.equal(destinyOpponentSpeedResult(f),7);
  assert.equal(f.turn.lockedOpponentDice,undefined);
});

test('Backlash uses paid Magic, ignores Armour and can target a different foe',()=>{
  let f=startDestinyRound(sourceSetup({backlash:1,channel:1,'life-charge':1},
    [{...foe,armour:99},{...foe,name:'Other',armour:99}],{...hero,magic:6,health:20}),0);
  f=useDestinyAbility(f,'channel',{magicReactionTarget:1});assert.deepEqual(f.opponents.map(o=>o.health),[100,96]);
  assert.equal(destinyStat(f,'hero','magic'),4);
  f=useDestinyAbility(f,'life-charge',{magicReactionTarget:0});assert.deepEqual(f.opponents.map(o=>o.health),[98,96]);
  assert.equal(f.hero.health,24);
});

test('Corona triggers once per round on three Magic spent, stacks across rounds and works with Unbowed',()=>{
  let f=startDestinyRound(sourceSetup({corona:1,unbowed:1,channel:2,'life-charge':1,'charged-shot':1,'mind-fumble':1},
    undefined,{...hero,speed:20,magic:10,health:10}),0);
  f=useDestinyAbility(f,'channel');assert.equal(destinyStat(f,'hero','armour'),1);
  f=useDestinyAbility(f,'charged-shot');assert.equal(destinyStat(f,'hero','armour'),2);assert.equal(f.hero.health,11);
  f=useDestinyAbility(f,'life-charge');assert.equal(destinyStat(f,'hero','armour'),2);assert.equal(f.hero.health,15);
  f=nextRound(sourceWin(f));f=useDestinyAbility(f,'channel');assert.equal(destinyStat(f,'hero','armour'),2);
  f=useDestinyAbility(f,'mind-fumble');assert.equal(destinyStat(f,'hero','armour'),3);assert.equal(f.hero.health,16);
});

test('health sacrifices do not count as spent Magic for Backlash or Corona',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({backlash:1,corona:1,'dark-pact':1}),0));
  f=useDestinyAbility(f,'dark-pact');assert.equal(f.opponents[0].health,100);
  assert.equal(destinyStat(f,'hero','armour'),1);assert.equal(f.turn.magicSpent,undefined);
});

test('Forked strike checks each opponent separately and rolls two damage dice for each success',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'forked-strike':1},[0,1,2].map(i=>({...foe,speed:0,armour:99,name:'Foe'+i}))),0));
  let dice=[2,3,6];f=useDestinyAbility(f,'forked-strike',{},()=>dice.shift());
  assert.deepEqual(f.turn.pendingAbility.dice,[2,3,6]);dice=[1,2,5,6];f=resolveDestinyAbilityRoll(f,()=>dice.shift());
  assert.deepEqual(f.turn.pendingAbility.groups.map(g=>g.targets),[[1],[2]]);
  assert.deepEqual(f.turn.pendingAbility.groups.map(g=>g.dice),[[1,2],[5,6]]);
  f=resolveDestinyAbilityRoll(f);assert.deepEqual(f.opponents.map(o=>o.health),[100,97,89]);assert.equal(f.phase,'end');
});

test('Ricochet handles misses, one-die and two-die hits, with Charm usable at both stages',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({ricochet:1,charm:2},[0,1,2].map(i=>({...foe,speed:0,name:'Foe'+i}))),0));
  let dice=[1,4,5];f=useDestinyAbility(f,'ricochet',{},()=>dice.shift());
  f=useDestinyAbility(f,'charm',{die:0},()=>2);dice=[1,2,3,4];f=resolveDestinyAbilityRoll(f,()=>dice.shift());
  assert.deepEqual(f.turn.pendingAbility.groups.map(g=>g.dice),[[1],[2],[3,4]]);
  f=useDestinyAbility(f,'charm',{group:2,die:0},()=>6);f=resolveDestinyAbilityRoll(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[99,98,90]);assert.equal(f.used.ricochet,1);assert.equal(f.used.charm,2);
});

test('all missed Forked strikes finish the replacement attack without an empty damage roll',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'forked-strike':1}),0));
  f=useDestinyAbility(f,'forked-strike',{},()=>1);f=resolveDestinyAbilityRoll(f,()=>{throw Error('No damage on a miss');});
  assert.equal(f.phase,'end');assert.equal(f.turn.pendingAbility,undefined);assert.equal(f.opponents[0].health,100);
});

test('Fists of the tempest distributes its three rolled dice and reduces Armour once per struck opponent',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'fists-of-the-tempest':1,charm:1},[{...foe,speed:0,armour:10},{...foe,speed:0,armour:10}],{...hero,speed:20,magic:4}),0));
  const dice=[1,2,3];f=useDestinyAbility(f,'fists-of-the-tempest',{},()=>dice.shift());
  assert.equal(destinyStat(f,'hero','magic'),2);f=useDestinyAbility(f,'charm',{die:0},()=>6);
  const before=structuredClone(f);assert.throws(()=>resolveDestinyAbilityRoll(f,()=>1,{targets:[0,9,1]}),/Assign each/);assert.deepEqual(f,before);
  f=resolveDestinyAbilityRoll(f,()=>1,{targets:[0,0,1]});
  assert.deepEqual(f.opponents.map(o=>o.health),[92,97]);assert.deepEqual(f.opponents.map((_,i)=>destinyStat(f,i,'armour')),[8,8]);
  assert.equal(f.phase,'end');
});

test('Fists of the tempest retains damage modifiers by die when dice are allocated',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'fists-of-the-tempest':1,tactics:1}),0));
  f=useDestinyAbility(f,'fists-of-the-tempest',{},()=>1);f=useDestinyAbility(f,'tactics',{die:1},()=>4);
  f=resolveDestinyAbilityRoll(f,()=>1,{targets:[0,0,0]});assert.equal(f.opponents[0].health,92);
  assert.equal(destinyStat(f,0,'armour'),0);
});

test('Sand dance sums only equipped swords and grants a free speed ability in the next round',()=>{
  let f=sourceSetup({'sand-dance':1,haste:1},[{...foe,speed:0},{...foe,speed:0}]);
  f.equipment={mainHand:{type:'sword',brawn:3},leftHand:{type:'dagger',brawn:99}};
  f=useDestinyAbility(sourceWin(startDestinyRound(f,0)),'sand-dance');
  assert.deepEqual(f.opponents.map(o=>o.health),[97,97]);f=startDestinyRound(endDestinyRound(f),0);
  f=useDestinyAbility(f,'haste');assert.equal(f.used.haste||0,0);assert.equal(f.turn.used.sp,true);
  assert.throws(()=>useDestinyAbility(f,'haste'),/Only one ability/);
  f=nextRound(sourceWin(f));f=useDestinyAbility(f,'haste');assert.equal(f.used.haste,1);
});

test('Sand dance includes a left-hand sword and rejects a hero without swords',()=>{
  let f=sourceSetup({'sand-dance':1});f.equipment={mainHand:{type:'sword',brawn:2},leftHand:{type:'sword',brawn:3}};
  f=useDestinyAbility(sourceWin(startDestinyRound(f,0)),'sand-dance');assert.equal(f.opponents[0].health,95);
  f=sourceWin(startDestinyRound(sourceSetup({'sand-dance':1}),0));
  assert.throws(()=>useDestinyAbility(f,'sand-dance'),/Required weapon/);
});

test('Winds of fate rolls before payment and free spells do not trigger spent-Magic passives',()=>{
  for(const face of [4,5,6]) {
    let f=startDestinyRound(sourceSetup({'winds-of-fate':1,channel:1,backlash:1,corona:1},undefined,{...hero,magic:4}),0);
    f=useDestinyAbility(f,'channel',{},()=>face);
    assert.equal(f.turn.pendingAbility.type,'magic-payment');assert.equal(f.used.channel||0,0);assert.equal(destinyStat(f,'hero','magic'),4);
    f=resolveDestinyAbilityRoll(f);
    assert.equal(destinyStat(f,'hero','magic'),face>=5?4:2);
    assert.equal(f.opponents[0].health,face>=5?100:96);assert.equal(f.turn.magicSpent||0,face>=5?0:2);
    assert.equal(f.used.channel,1);assert.equal(f.turn.passedMagicPayment,undefined);assert.equal(f.phase,'speed');
  }
});

test('Charm can reroll Winds of fate before the spell is cast, without granting a reusable free-payment flag',()=>{
  let f=startDestinyRound(sourceSetup({'winds-of-fate':1,channel:2,charm:1},undefined,{...hero,magic:4}),0);
  f=useDestinyAbility(f,'channel',{},()=>1);assert.throws(()=>useDestinyAbility(f,'channel'),/payment roll/);
  f=useDestinyAbility(f,'charm',{die:0},()=>6);f=resolveDestinyAbilityRoll(f);
  assert.equal(destinyStat(f,'hero','magic'),4);
  f=useDestinyAbility(f,'channel',{},()=>1);assert.equal(f.turn.pendingAbility.type,'magic-payment');
  f=resolveDestinyAbilityRoll(f);assert.equal(destinyStat(f,'hero','magic'),2);assert.equal(f.used.channel,2);
});

test('Winds of fate retains the deferred spell damage roll and its modifiers',()=>{
  let f=sourceWin(startDestinyRound(sourceSetup({'winds-of-fate':1,'shock-blast':1},undefined,{...hero,speed:20,magic:4}),0));
  f=useDestinyAbility(f,'shock-blast',{deferDamage:true},()=>5);
  f=resolveDestinyAbilityRoll(f,()=>3);assert.equal(f.turn.pendingAbility.type,'damage');
  assert.equal(destinyStat(f,'hero','magic'),4);assert.equal(f.used['shock-blast'],1);
  f=resolveDestinyAbilityRoll(f);assert.equal(f.opponents[0].health,92);assert.equal(f.phase,'end');
});

test('Veiled strike permits one chosen-target damage die for each qualifying avoidance',()=>{
  let f=startDestinyRound(sourceSetup({'veiled-strike':1,evade:1,sidestep:1},
    [{...foe,armour:99},{...foe,armour:99}],hero),0);f=losing(f);
  assert.throws(()=>useDestinyAbility(f,'veiled-strike'),/evade, sidestep or vanish/);
  f=useDestinyAbility(f,'evade');f=useDestinyAbility(f,'veiled-strike',{target:1,deferDamage:true},()=>4);
  assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[100,96]);
  assert.throws(()=>useDestinyAbility(f,'veiled-strike'),/evade, sidestep or vanish/);
  f=nextRound(f);f=losing(f);f=useDestinyAbility(f,'sidestep');f=useDestinyAbility(f,'veiled-strike',{target:0},()=>3);
  assert.deepEqual(f.opponents.map(o=>o.health),[97,96]);assert.equal(f.used['veiled-strike'],2);
});

test('Cheat death deals its chosen-target die before restoring three Health and can only revive once',()=>{
  let f=losing(startDestinyRound(sourceSetup({'cheat-death':1,charm:1},[foe,{...foe,name:'Other'}],{...hero,health:1}),0));
  f=resolveDestinyDamage(rollDestinyDamage(f,()=>1),()=>4);
  assert.equal(f.hero.health,0);assert.equal(f.status,'active');assert.equal(f.turn.pendingAbility.type,'hero-revival');
  f=useDestinyAbility(f,'charm',{die:0},()=>6);assert.equal(f.hero.health,0);
  f=resolveDestinyAbilityRoll(f,()=>1,{target:1});assert.deepEqual(f.opponents.map(o=>o.health),[100,94]);
  assert.equal(f.hero.health,3);assert.equal(f.phase,'end');
  f=startDestinyRound(endDestinyRound(f),0);f=losing(f);f=resolveDestinyDamage(rollDestinyDamage(f,()=>1));
  assert.equal(f.status,'loss');assert.equal(f.hero.health,0);
});

test('Cheat death can defeat the final opponent before the hero returns to life',()=>{
  let f=losing(startDestinyRound(sourceSetup({'cheat-death':1},[{...foe,health:2}],{...hero,health:1}),0));
  f=resolveDestinyDamage(rollDestinyDamage(f,()=>1),()=>4);f=resolveDestinyAbilityRoll(f);
  assert.equal(f.status,'win');assert.equal(f.hero.health,3);assert.equal(f.opponents[0].health,0);
});

test('Cheat death resumes a damage score interrupted by a lethal accepted-die hazard without applying it twice',()=>{
  let f=sourceSetup({'cheat-death':1},undefined,{...hero,speed:30,health:1});
  f.encounter={acceptedHeroRollFaces:[{kinds:['damage'],faces:[1],amount:1,name:'Source hazard'}]};
  f=resolveDestinyDamage(rollDestinyDamage(sourceWin(startDestinyRound(f,0)),()=>1),()=>4);
  assert.equal(f.turn.pendingAbility.type,'hero-revival');f=resolveDestinyAbilityRoll(f);
  assert.equal(f.hero.health,3);assert.equal(f.phase,'damage-rolled');assert.equal(f.opponents[0].health,96);
  f=resolveDestinyDamage(f);assert.equal(f.hero.health,3);assert.equal(f.phase,'end');
  assert.equal(f.history.filter(e=>e.type==='roll-hazard'&&e.name==='Source hazard').length,1);
});

test('a single-target ward blocks selecting its protected foe and single-target spells but allows Cleave',()=>{
  let f=sourceSetup({rend:1,cleave:1},[{...foe,speed:0},{...foe,speed:0}]);
  f.encounter={restrictProtectedTargets:true,damageShieldWhileAlive:[{target:1,protectors:[0],kinds:['score','single-ability']}]};
  assert.throws(()=>startDestinyRound(f,1),/guards first/);
  f=sourceWin(startDestinyRound(f,0));assert.throws(()=>useDestinyAbility(f,'rend',{target:1}),/single target first/);
  f=useDestinyAbility(f,'cleave',{},()=>3);assert.deepEqual(f.opponents.map(o=>o.health),[97,97]);
});

test('a ward applying to all attacks still blocks multi-target damage until its protectors are dead',()=>{
  let f=sourceSetup({cleave:1},[{...foe,speed:0},{...foe,speed:0}]);
  f.encounter={damageShieldWhileAlive:[{target:1,protectors:[0]}]};
  f=useDestinyAbility(sourceWin(startDestinyRound(f,0)),'cleave',{},()=>3);
  assert.deepEqual(f.opponents.map(o=>o.health),[97,100]);
});

test('face-triggered piercing checks the final damage faces and still respects evasion',()=>{
  for(const [face,evade,damage]of [[5,false,0],[6,false,11],[6,true,0]]) {
    let f=sourceSetup({evade:1},[foe],{...hero,armour:20});
    f.encounter={opponentArmourIgnoringFacesByTarget:{0:{faces:[6],ability:'piercing'}}};
    f=rollDestinyDamage(losing(startDestinyRound(f,0)),()=>face);
    if(evade)f=useDestinyAbility(f,'evade');
    f=resolveDestinyDamage(f);assert.equal(f.hero.health,30-damage);
  }
});

test('required ability loss cannot be declined while an unused ability remains and cannot be restored',()=>{
  let f=sourceSetup({cunning:1,'shadow-well':1});f.encounter={startTests:[{kind:'ability-sacrifice',name:'Source melody',required:true}]};
  f=startDestinyRound(f,0);assert.equal(f.phase,'ability-choice');
  assert.throws(()=>resolveDestinyAbilitySacrifice(f),/ability to lose/);
  f=resolveDestinyAbilitySacrifice(f,'cunning');assert.equal(f.phase,'speed');
  assert.throws(()=>useDestinyAbility(f,'cunning'),/unavailable/);
  assert.throws(()=>useDestinyAbility(f,'shadow-well',{restore:'cunning'}),/already used/);
  f=sourceSetup({});f.encounter={startTests:[{kind:'ability-sacrifice',name:'Source melody',required:true}]};
  f=resolveDestinyAbilitySacrifice(startDestinyRound(f,0));assert.equal(f.hero.health,30);assert.equal(f.phase,'speed');
});

test('a replacement challenge ends the enemy attack on success and failure, with its unconditional next-round penalty',()=>{
  for(const face of [1,6]) {
    let f=sourceSetup({},[foe],hero);f.encounter={enemyWinTest:{kind:'damage-if-low',name:'Source balance challenge',dice:2,
      heroRoll:'challenge',attribute:'speed',limit:12,amount:10,ignoreArmour:false,replacesAttack:true,
      alwaysChanges:[{target:'hero',attribute:'speed',amount:-1,duration:1,delay:1}]}};
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),()=>1),()=>face);
    assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(f);assert.equal(f.phase,'end');
    assert.equal(f.hero.health,face===1?21:30);
    f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,'hero','speed'),3);
  }
});

test('a defeated-foe damage bonus applies to every hero damage die, including combat abilities',()=>{
  let f=sourceSetup({cleave:1},[{...foe,speed:0},{...foe,speed:0,health:2}]);
  f.encounter={damagePerDieWhenDefeated:[{target:1,amount:1}]};f=sourceWin(startDestinyRound(f,0));
  assert.equal(destinyPassiveDamageBonus(f),0);destinyStrike(f,1,2,'source-check','fixed-ability');
  assert.equal(destinyPassiveDamageBonus(f),1);f=useDestinyAbility(f,'cleave',{},()=>3);
  assert.equal(f.opponents[0].health,96);
});

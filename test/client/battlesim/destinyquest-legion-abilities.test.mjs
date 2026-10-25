import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGION_ABILITIES as catalog,LEGION_SOURCE_ABILITIES,LEGION_PENDING_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,
  resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use,resolveDestinyDamageChoice} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,healDestinyHero} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {queueDestinyEncounterEvent} from '../../../public/js/battlesim/engines/destinyquest/encounter-events.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected random roll');return values.shift();};
const resume=value=>JSON.parse(JSON.stringify(value));
const rules={deathPenalties:false,deathMoves:false};
const foe={name:'Foe',speed:0,brawn:2,armour:5,health:100};
const hero={speed:20,brawn:3,magic:1,armour:4,health:20,maxHealth:30};
function setup(abilities={},options={}){
  const fight=configureDestinyAbilities(createDestinyFight({...hero,...options.hero},options.foes||[foe]),abilities,
    options.equipment||{}, {catalog,bookRules:rules});
  return options.character?attachDestinyCharacter(fight,options.character):fight;
}
const start=(abilities,options)=>startDestinyRound(setup(abilities,options),0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,6,1,1)));
const hit=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(4)));

test('Bolt replaces one winning attack with a saved charge, then releases three dice on a later win',()=>{
  let f=use(win(start({bolt:1})),'bolt',{},rolls());assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,100);
  f=win(startDestinyRound(endDestinyRound(resume(f)),0));f=use(f,'bolt',{deferDamage:true},rolls(2,3,4));
  assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(resume(f),rolls());assert.equal(f.opponents[0].health,91);assert.equal(f.chargedAttacks.bolt,undefined);
  f=win(startDestinyRound(endDestinyRound(f),0));assert.throws(()=>use(f,'bolt'),/no uses left/);
});

test('Haunt inflicts two each round until a hero double dispels the saved spirit',()=>{
  let f=use(win(start({haunt:1})),'haunt',{},rolls());f=endDestinyRound(f);assert.equal(f.opponents[0].health,98);
  f=startDestinyRound(resume(f),0);f=rollDestinySpeed(f,rolls(6,6,1,2));assert.equal(f.effects.some(e=>e.source==='haunt'),false);
  f=endDestinyRound(hit(resolveDestinySpeed(f)));assert.equal(f.opponents[0].health,96);
});

test('Life Spark heals rolled doubles but never heals an opponent double or a die merely changed by a modifier',()=>{
  let f=rollDestinySpeed(start({'life-spark':2},{hero:{health:10}}),rolls(3,3,1,2));assert.equal(f.hero.health,14);
  f=rollDestinySpeed(start({'life-spark':1},{hero:{health:10}}),rolls(3,4,2,2));assert.equal(f.hero.health,10);
});

test('Kick Start revives once, clears current passive statuses and preserves unrelated stat boosts',()=>{
  let f=start({'kick-start':1},{hero:{health:1},foes:[{...foe,speed:50,brawn:30}]});
  f.effects.push({kind:'bleed',target:'hero',amount:1,from:1,until:99},{kind:'stat',target:'hero',attribute:'brawn',amount:2,from:1,until:99});
  f.encounter={heroStatuses:{venom:2},growingStatus:{name:'disease',increment:1,from:1}};
  f=hit(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,1,6,6))));assert.equal(f.hero.health,15);assert.equal(f.status,'active');
  assert.deepEqual(f.effects.map(e=>e.kind),['stat']);assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(f.encounter.heroStatuses,undefined);
  f=startDestinyRound(endDestinyRound(resume(f)),0);f=hit(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,1,6,6))));assert.equal(f.status,'loss');
});

test('Shades boost damage dice including unmodified attacks, then Sacrifice absorbs a rolled enemy attack',()=>{
  let f=use(win(start({shades:1,rake:1})),'rake',{},rolls(1,2,3));assert.equal(f.opponents[0].health,88);
  f=start({shades:1,sacrifice:1},{hero:{speed:10},foes:[{...foe,speed:9,brawn:10}]});
  f=rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5))),rolls(6));
  f=resolveDestinyDamage(use(f,'sacrifice'));assert.equal(f.hero.health,20);assert.deepEqual(f.sacrificedSummons,['shades']);
  f=win(startDestinyRound(endDestinyRound(resume(f)),0));f=hit(f);assert.equal(f.turn.damageScore,7);
});

test('Raining Blows explodes every rolled damage-score six, including a reroll but not a modifier changing a face',()=>{
  let f=rollDestinyDamage(win(start({'raining-blows':1})),rolls(6,6,2));assert.deepEqual(f.turn.damageDice,[6,6,2]);
  f=resolveDestinyDamage(f);assert.equal(f.turn.damageScore,17);
  f=rollDestinyDamage(win(start({'raining-blows':1,charm:1})),rolls(1));f=use(f,'charm',{die:0},rolls(6,3));assert.deepEqual(f.turn.damageDice,[6,3]);
  f=rollDestinyDamage(win(start({'raining-blows':1,'critical-strike':1})),rolls(1));f=use(f,'critical-strike',{},rolls());assert.deepEqual(f.turn.damageDice,[6]);
});

test('Execution requires a main-hand sword, checks current Speed and can execute only one opponent per round',()=>{
  const options={foes:[{...foe,health:10},foe],equipment:{mainHand:{type:'sword'}}};
  let f=use(start({execution:1},options),'execution',{target:0});assert.equal(f.opponents[0].health,0);
  assert.throws(()=>use(f,'execution',{target:1}),/category per round/);
  assert.throws(()=>use(start({execution:1}),'execution'),/main-hand/);
  assert.throws(()=>use(start({execution:1},options),'execution',{target:1}),/threshold/);
});

test('Stake is restricted to a wounded vampire and wins combat instead of executing an unrelated enemy',()=>{
  let f=start({stake:1},{foes:[{...foe,health:10},foe]});f.encounter={traitsByTarget:{0:['vampire']}};
  assert.throws(()=>use(f,'stake',{target:1}),/required trait/);
  f=use(f,'stake',{target:0});assert.equal(f.status,'win');assert.equal(f.opponents[0].health,0);
});

test('Swift Strikes queues a separate freely chosen opponent for each speed six and preserves choices through reload',()=>{
  const options={foes:[foe,foe],equipment:{mainHand:{type:'sword',speed:2},leftHand:{type:'sword',speed:5}}};
  let f=rollDestinySpeed(start({'swift-strikes':1},options),rolls(6,6,1,2));assert.equal(f.phase,'ability-choice');
  f=resolveDestinyDamageChoice(resume(f),1,rolls());assert.equal(f.phase,'ability-choice');assert.equal(f.opponents[1].health,95);
  f=resolveDestinyDamageChoice(resume(f),0,rolls());assert.equal(f.phase,'speed-rolled');assert.equal(f.opponents[0].health,95);
});

test('Ensnare and Hamstring cancel an actual dodge and restore the ordinary winning attack',()=>{
  for(const name of ['ensnare','hamstring']){
    let f=win(start({[name]:1}));queueDestinyEncounterEvent(f,{kind:'opponent-dodge',name:'Evade',dice:0},'damage',rolls());
    f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.phase,'end');f=use(f,name);assert.equal(f.phase,'damage');f=hit(f);assert.equal(f.opponents[0].health,98);
  }
  assert.throws(()=>use(hit(win(start({ensnare:1}))),'ensnare'),/must dodge/);
});

test('Expertise ignores a queued counterstrike while leaving an unrelated enemy attack in place',()=>{
  let f=win(start({expertise:1}));queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Riposte',owner:'opponent',damageDice:true,counterstrike:true},'end',rolls(6));
  f=use(f,'expertise');assert.equal(f.hero.health,20);assert.equal(f.phase,'end');
  f=win(start({expertise:1}));queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Ordinary attack',owner:'opponent',damageDice:true},'end',rolls(6));
  assert.throws(()=>use(f,'expertise'),/not an opponent counterstrike/);
});

test('Reflect returns only the health damage the attacking vampire would cause and prevents the original hit',()=>{
  let f=start({reflect:1},{foes:[{...foe,speed:50,brawn:10}]});f.encounter={traitsByTarget:{0:['vampire']}};
  f=rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5))),rolls(4));
  f=resolveDestinyDamage(use(f,'reflect',{},rolls()));assert.equal(f.hero.health,20);assert.equal(f.opponents[0].health,90);
});

test('Second Skin and Steadfast ignore only their named enemy abilities',()=>{
  let f=start({'second-skin':1,steadfast:1});
  queueDestinyEncounterEvent(f,{kind:'opponent-ability',name:'Piercing',ability:'piercing',ignoreArmour:true,dice:0},'speed',rolls());assert.equal(f.phase,'speed');
  queueDestinyEncounterEvent(f,{kind:'opponent-ability',name:'Knockdown',ability:'knockdown',heroSpeedCount:1,dice:0},'speed',rolls());assert.equal(f.turn.heroSpeedCount,undefined);
  queueDestinyEncounterEvent(f,{kind:'opponent-ability',name:'Other',ability:'other',heroSpeedCount:1,dice:0},'speed',rolls());f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.turn.heroSpeedCount,1);
});

test('Ice Shield and Shield Wall use rolled or doubled current armour for one round',()=>{
  let f=use(start({'ice-shield':1}),'ice-shield',{},rolls(5));assert.equal(destinyStat(f,'hero','armour'),9);
  f=startDestinyRound(endDestinyRound(hit(win(f))),0);assert.equal(destinyStat(f,'hero','armour'),4);
  f=use(start({'shield-wall':1,'iron-will':1},{equipment:{leftHand:{type:'shield'}}}),'iron-will');
  f=use(f,'shield-wall',{},rolls(3));assert.equal(destinyStat(f,'hero','armour'),14);assert.equal(f.opponents[0].health,97);
  assert.throws(()=>use(start({'shield-wall':1}),'shield-wall',{},rolls(3)),/left-hand equipment/);
});

test('Steal raises only the chosen attribute and Time Shift locks speed abilities for three rounds',()=>{
  const options={hero:{speed:1},foes:[{...foe,speed:3,brawn:12}]};
  let f=use(start({steal:1},options),'steal',{attribute:'brawn'});assert.equal(destinyStat(f,'hero','brawn'),12);
  assert.throws(()=>use(start({steal:1},options),'steal',{attribute:'magic'}),/only raise/);
  f=use(start({'time-shift':1,courage:1},options),'time-shift');
  for(let round=1;round<=3;round++){
    assert.equal(destinyStat(f,'hero','speed'),3);
    assert.throws(()=>use(f,'courage'),round===1?/category per round/:/not faded/);
    f=startDestinyRound(endDestinyRound(hit(win(f))),0);
  }
  assert.equal(destinyStat(f,'hero','speed'),1);assert.equal(destinyStat(use(f,'courage'),'hero','speed'),5);
});

test('Brain Drain spends at most five available Magic, restores it next combat and adds the same score bonus',()=>{
  let f=win(start({'brain-drain':1},{hero:{brawn:12,magic:7}}));
  assert.throws(()=>use(f,'brain-drain',{amount:6}),/available amount/);
  f=use(f,'brain-drain',{amount:5});assert.equal(destinyStat(f,'hero','magic'),2);
  f=hit(f);assert.equal(f.turn.damageScore,21);
  f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,'hero','magic'),2);
  assert.equal(destinyStat(setup({}, {hero:{magic:7}}),'hero','magic'),7);
});

test('Second Sight reduces each enemy damage die without reducing enemy Brawn',()=>{
  let f=use(start({'second-sight':1},{foes:[{...foe,speed:50,brawn:10}]}),'second-sight');
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,1,6,6)));
  f=rollDestinyDamage(f,rolls(1));assert.equal(destinyDamageScore(f),10);
  f=resolveDestinyDamage(f);assert.equal(f.hero.health,14);
});

test('Last Laugh rerolls the whole opponent speed or damage roll once',()=>{
  let f=rollDestinySpeed(start({'last-laugh':1}),rolls(2,3,4,5));
  f=use(f,'last-laugh',{},rolls(1,6));assert.deepEqual(f.turn.opponentSpeedDice,[1,6]);assert.deepEqual(f.turn.heroSpeedDice,[2,3]);
  assert.throws(()=>use(f,'last-laugh',{},rolls()),/no uses left/);
  f=resolveDestinySpeed(rollDestinySpeed(start({'last-laugh':1},{foes:[{...foe,speed:50,brawn:10}]}),rolls(1,1,6,6)));
  f=rollDestinyDamage(f,rolls(6));f=use(f,'last-laugh',{},rolls(2));assert.deepEqual(f.turn.damageDice,[2]);
});

test('Martyr replaces an already rolled hit with exactly five health, ignoring armour',()=>{
  let f=start({martyr:1},{foes:[{...foe,speed:50,brawn:100}]});
  f=rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,1,6,6))),rolls(6));
  f=resolveDestinyDamage(use(f,'martyr'));assert.equal(f.hero.health,15);
});

test('Shadow Speed changes all rolled ones to threes only for its active round',()=>{
  let f=use(start({'shadow-speed':1}),'shadow-speed');f=rollDestinySpeed(f,rolls(1,1,2,2));
  assert.deepEqual(f.turn.heroSpeedDice,[3,3]);
  f=startDestinyRound(endDestinyRound(hit(resolveDestinySpeed(f))),0);f=rollDestinySpeed(f,rolls(1,1,2,2));assert.deepEqual(f.turn.heroSpeedDice,[1,1]);
});

test('Shock uses half the enemy current armour rounded up after a damaging score',()=>{
  let f=hit(win(start({shock:1},{hero:{brawn:20},foes:[{...foe,armour:15}]})));const hp=f.opponents[0].health;
  f=use(f,'shock',{},rolls());assert.equal(f.opponents[0].health,hp-8);
});

test('Backfire saves both rolls across reload and hurts the hero despite armour',()=>{
  let f=use(win(start({backfire:1},{hero:{armour:100}})),'backfire',{deferDamage:true},rolls(2,3,4,5,6));
  assert.equal(f.phase,'ability-rolled');assert.equal(f.hero.health,20);
  f=resolveDestinyAbilityRoll(resume(f),rolls());assert.equal(f.opponents[0].health,91);assert.equal(f.hero.health,9);assert.equal(f.phase,'end');
});

test('Ignite shares two unmodified dice and Burn/Embers apply only to opponents it actually hurt',()=>{
  for(const[extra,amount]of[[{},0],[{burn:1},1],[{burn:2,embers:2},2]]){
    let f=win(start({ignite:1,acid:1,...extra},{foes:[foe,foe]}));f.encounter={passiveImmuneTargets:[1]};
    f=use(f,'acid');f=use(f,'ignite',{deferDamage:true},rolls(2,3));
    assert.equal(f.phase,'end');assert.deepEqual(f.opponents.map(o=>o.health),[95,95]);
    f=endDestinyRound(resume(f));assert.deepEqual(f.opponents.map(o=>o.health),[95-amount,95]);
  }
});

test('Seeing Red responds immediately to crossing twenty health in either direction',()=>{
  const f=start({'seeing-red':2});assert.equal(destinyStat(f,'hero','speed'),22);
  healDestinyHero(f,1);assert.equal(destinyStat(f,'hero','speed'),20);f.hero.health=20;assert.equal(destinyStat(f,'hero','speed'),22);
});

test('Merciless adds one per damage-score die only after a qualifying status is present',()=>{
  let f=rollDestinyDamage(win(start({merciless:2,venom:1})),rolls(4));assert.equal(destinyDamageScore(f),7);
  f=resolveDestinyDamage(f);f=startDestinyRound(endDestinyRound(f),0);f=rollDestinyDamage(win(f),rolls(4));assert.equal(destinyDamageScore(f),8);
});

test('Blood Rage needs health damage on consecutive rounds and boosts Brawn only once',()=>{
  let f=hit(win(start({'blood-rage':2})));assert.equal(destinyStat(f,'hero','brawn'),3);
  f=startDestinyRound(endDestinyRound(f),0);f=hit(win(f));assert.equal(destinyStat(f,'hero','brawn'),5);
  f=startDestinyRound(endDestinyRound(f),0);f=hit(win(f));assert.equal(destinyStat(f,'hero','brawn'),5);
});

test('Vampirism heals half actual health lost, rounded up, for either a score or damage dice',()=>{
  let f=hit(win(start({vampirism:1})));f=use(f,'vampirism');assert.equal(f.hero.health,21);
  f=use(win(start({vampirism:1,cleave:1})),'cleave',{},rolls(5));f=use(f,'vampirism');assert.equal(f.hero.health,23);
});

test('Shield Spin strikes for every enemy speed one before a later reroll can avoid it',()=>{
  let f=start({'shield-spin':1,'last-laugh':1},{equipment:{leftHand:{type:'shield'}}});
  f=rollDestinySpeed(f,rolls(3,4,1,1,2,3));assert.equal(f.opponents[0].health,95);
  f=use(resume(f),'last-laugh',{},rolls(5,6));assert.equal(f.opponents[0].health,95);
});

test('the unreleased catalog contains source abilities only and never invents working specs for pending rules',()=>{
  assert.equal(LEGION_SOURCE_ABILITIES.length,141);
  assert.equal(new Set(LEGION_SOURCE_ABILITIES).size,141);
  for(const[name,spec]of Object.entries(catalog)){
    assert.ok(LEGION_SOURCE_ABILITIES.includes(name));
    assert.notEqual(spec.category,'dm');assert.ok(!spec.phases.includes('death-move'));
    assert.equal(Object.isFrozen(spec),true);
  }
  for(const name of LEGION_PENDING_ABILITIES)assert.throws(()=>setup({[name]:1}),/Invalid ability inventory/);
});

for(const[name,attribute,amount,duration]of[
  ['adrenaline','speed',2,2],['click-your-heels','speed',2,1],['fearless','speed',2,1],
  ['courage','speed',4,1],['vanquish','brawn',2,1],['focus','magic',3,1],['might-of-stone','armour',3,1],
])test(name+' applies its printed boost and expires at the correct round',()=>{
  let fight=use(start({[name]:1}),name);assert.equal(destinyStat(fight,'hero',attribute),hero[attribute]+amount);
  fight=startDestinyRound(endDestinyRound(hit(win(fight))),0);
  assert.equal(destinyStat(fight,'hero',attribute),hero[attribute]+(duration===2?amount:0));
  if(duration===2){fight=startDestinyRound(endDestinyRound(hit(win(fight))),0);assert.equal(destinyStat(fight,'hero',attribute),hero[attribute]);}
});

test('Savagery, Fortitude and Eureka permit their printed attribute choices only',()=>{
  for(const[name,attribute,amount]of[['savagery','magic',2],['fortitude','armour',3],['eureka','speed',1]]){
    const fight=start({[name]:1}),before=structuredClone(fight);
    const changed=use(fight,name,{attribute});assert.equal(destinyStat(changed,'hero',attribute),hero[attribute]+amount);
    assert.throws(()=>use(fight,name,{attribute:'health'}),/allowed attribute/);assert.deepEqual(fight,before);
  }
});

test('Zapped changes all three enemy attributes, while Demolish permanently removes armour and reduces one speed die',()=>{
  const enemies=[{...foe,speed:8,brawn:7,magic:6,damageStat:'brawn'}];
  let fight=use(start({zapped:1},{foes:enemies}),'zapped');
  assert.deepEqual(['speed','brawn','magic'].map(a=>destinyStat(fight,0,a)),[5,4,3]);
  fight=startDestinyRound(endDestinyRound(hit(win(fight))),0);
  assert.deepEqual(['speed','brawn','magic'].map(a=>destinyStat(fight,0,a)),[8,7,6]);
  let demolished=use(start({demolish:1}),'demolish');assert.equal(destinyStat(demolished,0,'armour'),4);
  demolished=resolveDestinySpeed(rollDestinySpeed(demolished,rolls(6,6,1)));
  demolished=startDestinyRound(endDestinyRound(hit(demolished)),0);
  assert.equal(destinyStat(demolished,0,'armour'),4);
});

test('healing aliases cap health, and Fallen Hero combines healing with a temporary Brawn boost',()=>{
  for(const[name,expected]of[['heal',24],['regrowth',26],['mend',30]])assert.equal(use(start({[name]:1}),name).hero.health,expected);
  const fight=use(start({'fallen-hero':1}),'fallen-hero');
  assert.equal(fight.hero.health,30);assert.equal(destinyStat(fight,'hero','brawn'),6);
});

test('Pound, Surge and Shadow Fury use their printed score or equipment bonuses',()=>{
  let fight=use(win(start({pound:1})),'pound');fight=hit(fight);
  assert.equal(fight.turn.damageScore,10);fight=startDestinyRound(endDestinyRound(fight),0);assert.equal(destinyStat(fight,'hero','speed'),19);
  fight=use(win(start({surge:1})),'surge');fight=hit(fight);assert.equal(fight.turn.damageScore,8);
  fight=startDestinyRound(endDestinyRound(fight),0);assert.equal(destinyStat(fight,'hero','magic'),1);assert.equal(destinyStat(fight,'hero','speed'),19);
  fight=hit(use(win(start({'shadow-fury':1},{equipment:{mainHand:{speed:2},leftHand:{speed:3}}})),'shadow-fury'));
  assert.equal(fight.turn.damageScore,12);
});

test('fixed-stat Ice Shards uses Magic, ignores armour and never opens an empty dice editor',()=>{
  let fight=win(start({'ice-shards':1,focus:1}));fight=use(fight,'focus');
  fight=use(fight,'ice-shards',{deferDamage:true},rolls());
  assert.equal(fight.opponents[0].health,96);assert.equal(fight.phase,'end');assert.equal(fight.turn.pendingAbility,undefined);
});

test('fixed-stat damage is not a damage roll and cannot trigger bleed, venom, Leech or damage-dice retaliation',()=>{
  let fight=win(start({'ice-shards':1,bleed:1,venom:1,leech:1}));
  fight.encounter={reflectDamage:[{target:0,amount:4}]};
  fight=use(fight,'ice-shards',{},rolls());
  assert.equal(fight.opponents[0].health,99);assert.equal(fight.hero.health,20);
  assert.equal(fight.effects.some(effect=>['bleed','venom'].includes(effect.kind)),false);
});

test('Judgement and Avenging Spirit return the source amount after taking health damage',()=>{
  for(const[name,expected]of[['judgement',11],['avenging-spirit',4]]){
    let fight=start({[name]:1},{hero:{speed:21},foes:[{...foe,speed:50,brawn:10}]});
    fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));fight=hit(fight);
    fight=use(fight,name,{},rolls());assert.equal(fight.opponents[0].health,100-expected);
  }
});

test('Avenging Spirit cannot increase its damage using an armour modifier',()=>{
  let fight=use(start({'avenging-spirit':1,'iron-will':1},{foes:[{...foe,speed:50,brawn:10}]}),'iron-will');
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));fight=hit(fight);
  assert.equal(fight.hero.health,13);assert.equal(destinyStat(fight,'hero','armour'),7);
  fight=use(fight,'avenging-spirit',{},rolls());assert.equal(fight.opponents[0].health,96);
});

test('Brutality and Parry prevent the enemy damage roll, with Brutality inflicting two damage dice',()=>{
  for(const name of['brutality','parry','head-butt']){
    let fight=start({[name]:1},{foes:[{...foe,speed:50}]});fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));
    fight=use(fight,name,{},name==='brutality'?rolls(2,3):rolls());
    assert.equal(fight.phase,'end');assert.equal(fight.hero.health,20);assert.equal(fight.opponents[0].health,name==='brutality'?95:100);
  }
});

test('Black Rain uses a left-hand bow, preserves the combat slot and respects passive immunity',()=>{
  const options={foes:[foe,foe],equipment:{leftHand:{type:'bow'}}};
  let fight=win(start({'black-rain':1,'thorn-armour':1},options));fight.encounter={passiveImmuneTargets:[0]};
  fight=use(fight,'black-rain',{},rolls(3));assert.equal(fight.turn.used.co,false);
  assert.deepEqual(fight.opponents.map(e=>e.health),[100,97]);
  fight=use(fight,'thorn-armour',{},rolls(2));assert.equal(fight.turn.used.co,true);
  assert.deepEqual(fight.opponents.map(e=>e.health),[98,95]);
  assert.throws(()=>use(win(start({'black-rain':1})),'black-rain',{},rolls(3)),/left-hand equipment/);
});

test('Leech heals for each actual damaging strike, including against a passive-immune enemy',()=>{
  let fight=win(start({cleave:1,leech:1},{foes:[foe,foe]}));fight.encounter={passiveImmuneTargets:[0]};
  fight=use(fight,'cleave',{},rolls(2));assert.equal(fight.hero.health,24);
  let blocked=win(start({leech:1}));blocked.encounter={damageShieldWhileAlive:[{target:0,protectors:[0]}]};
  blocked=hit(blocked);assert.equal(blocked.hero.health,20);
});

test('disease hurts at the end of the current round in Legion while the legacy timing stays unchanged',()=>{
  let fight=hit(win(start({disease:1})));const afterHit=fight.opponents[0].health;
  fight=endDestinyRound(fight);assert.equal(fight.opponents[0].health,afterHit-2);
  let legacy=configureDestinyAbilities(createDestinyFight(hero,[foe]),{disease:1});
  legacy=hit(win(startDestinyRound(legacy,0)));const legacyHit=legacy.opponents[0].health;
  legacy=endDestinyRound(legacy);assert.equal(legacy.opponents[0].health,legacyHit);
});

test('Venom upgrades apply the printed two, three or four damage without stacking duplicate items',()=>{
  for(const[extra,amount]of[[{},2],[{'deadly-poisons':1},3],[{'poison-mastery':1},3],[{'deadly-poisons':2,'poison-mastery':2},4]]){
    let fight=hit(win(start({venom:2,...extra})));const afterHit=fight.opponents[0].health;
    fight=endDestinyRound(resume(fight));assert.equal(fight.opponents[0].health,afterHit-amount);
  }
});

test('Fire Aura and Vitriol affect all opponents, and Cleansing Light cannot revive a dead hero',()=>{
  let fight=use(setup({'fire-aura':1,vitriol:1,'cleansing-light':1},{foes:[foe,foe]}),'vitriol');
  fight=hit(win(startDestinyRound(fight,0)));
  const hp=fight.opponents.map(e=>e.health);fight=endDestinyRound(fight);
  assert.deepEqual(fight.opponents.map(e=>e.health),hp.map(value=>value-2));assert.equal(fight.hero.health,21);
  let lethal=use(setup({vitriol:1,'cleansing-light':1},{hero:{health:1}}),'vitriol');
  lethal=hit(win(startDestinyRound(lethal,0)));
  lethal=endDestinyRound(lethal);assert.equal(lethal.status,'loss');assert.equal(lethal.hero.health,0);
});

test('owning Vitriol never forces its harmful coating and its opening activation survives reload',()=>{
  let inactive=hit(win(start({vitriol:1})));const hp=inactive.opponents[0].health;
  inactive=endDestinyRound(inactive);assert.equal(inactive.hero.health,20);assert.equal(inactive.opponents[0].health,hp);
  let active=use(setup({vitriol:1}),'vitriol');active=hit(win(startDestinyRound(resume(active),0)));
  const before=active.opponents[0].health;active=endDestinyRound(active);
  assert.equal(active.hero.health,19);assert.equal(active.opponents[0].health,before-1);
  assert.throws(()=>use(active,'vitriol'),/before combat/);
});

test('Cauterise removes harmful statuses but does not grant immunity to a later venomous hit',()=>{
  let fight=start({cauterise:1},{foes:[{...foe,speed:50,brawn:5}]});
  fight.encounter={heroStatuses:{venom:2,bleed:1,disease:2},heroStatusOnHit:{name:'venom',amount:2}};
  fight.effects.push({kind:'bleed',target:'hero',amount:1,from:1,until:99},{kind:'bleed',target:0,amount:1,from:1,until:99});
  fight=use(fight,'cauterise');assert.deepEqual(fight.encounter.heroStatuses,{});assert.equal(fight.effects.length,1);
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));fight=hit(fight);
  assert.equal(fight.encounter.heroStatuses.venom,2);assert.throws(()=>use(fight,'cauterise'),/no uses/);
});

test('First Cut is fixed damage without bleed or venom and cannot be used by an assassin',()=>{
  const fight=use(setup({'first-cut':1,bleed:1,venom:1}),'first-cut',{target:0},rolls());
  assert.equal(fight.opponents[0].health,99);assert.equal(fight.effects.length,0);
  assert.throws(()=>use(setup({'first-cut':1},{character:{career:'assassin'}}),'first-cut',{target:0}),/career/);
});

test('First Strike requires a dagger, applies on-hit passives and preserves a modified opening roll through reload',()=>{
  let fight=setup({'first-strike':1,venom:1,'critical-strike':1},{equipment:{mainHand:{type:'dagger'}}});
  fight=use(fight,'first-strike',{target:0,deferDamage:true},rolls(2));
  fight=use(resume(fight),'critical-strike',{group:0});fight=resolveDestinyAbilityRoll(resume(fight),rolls());
  assert.equal(fight.opponents[0].health,94);assert.equal(fight.phase,'start');assert.equal(fight.effects[0].kind,'venom');
  assert.throws(()=>use(setup({'first-strike':1}),'first-strike',{target:0},rolls(2)),/main-hand/);
});

test('assassins cannot combine Bull\'s Eye and First Strike, while opening kills never introduce a death move',()=>{
  const options={character:{career:'assassin'},equipment:{mainHand:{type:'dagger'}},foes:[{...foe,health:1},foe]};
  let fight=use(setup({'first-strike':1,'bulls-eye':1},options),'first-strike',{target:0},rolls(2));
  assert.equal(fight.phase,'start');assert.equal(fight.status,'active');
  assert.throws(()=>use(fight,'bulls-eye',{target:1},rolls(2)),/cannot be combined/);
  fight=use(setup({'first-strike':1,'bulls-eye':1},options),'bulls-eye',{target:0},rolls(2));
  assert.throws(()=>use(fight,'first-strike',{target:1},rolls(2)),/cannot be combined/);
  const won=use(setup({'first-cut':1},{foes:[{...foe,health:1}]}),'first-cut',{target:0},rolls());
  assert.equal(won.status,'win');assert.equal(won.phase,'finished');
});

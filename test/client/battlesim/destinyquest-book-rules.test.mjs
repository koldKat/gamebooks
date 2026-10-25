import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight, startDestinyRound, retargetDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities, useDestinyAbility, destinyAbilitySpec} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat, hasDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {createDestinySession, beginDestinySession, applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected random roll');return values.shift();};
const resume=value=>JSON.parse(JSON.stringify(value));
const bookRules={deathPenalties:false,deathMoves:false};
// Printed rules from The Legion of Shadow, used here to exercise shared options.
const catalog={
  adrenaline:{category:'sp',phases:['speed'],attribute:'speed',amount:2,duration:2},
  savagery:{category:'mo',phases:['speed','damage','end'],chooseAttribute:['brawn','magic'],amount:2},
  webbed:{category:'sp',phases:['speed'],opponentSpeedDiceReduction:1},
  cripple:{category:'co',phases:['end'],afterHit:true,afterHitStats:[{attribute:'speed',amount:-1,duration:3,delay:1}]},
  disrupt:{category:'co',phases:['end'],afterHit:true,afterHitStats:[{attribute:'magic',amount:-3,duration:null}]},
  'black-rain':{category:'pa',phases:['damage'],heroWon:true,replacement:true,hit:'all',dice:1,shared:true,requires:'bow'},
};
const hero={speed:20,brawn:3,magic:1,armour:0,health:20,maxHealth:30};
const enemy={name:'Foe',speed:0,brawn:0,magic:4,armour:0,health:100,damageStat:'magic'};
const configure=(inventory={},options={},opponents=[enemy])=>configureDestinyAbilities(createDestinyFight(hero,opponents),inventory,
  options.equipment||{}, {catalog,bookRules,...options});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,6,1,1)));
const hit=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('book ability choices and two-round boosts survive JSON resume without changing global rules',()=>{
  const options=structuredClone(catalog),before=structuredClone(options);
  let fight=configure({adrenaline:1,savagery:1},{catalog:options});
  options.adrenaline.amount=99;
  assert.equal(fight.abilityCatalog.adrenaline.amount,2);
  fight=startDestinyRound(fight,0);fight=useDestinyAbility(fight,'adrenaline');
  fight=useDestinyAbility(resume(fight),'savagery',{attribute:'magic'});
  assert.equal(destinyStat(fight,'hero','magic'),3);
  assert.equal(destinyStat(fight,'hero','brawn'),3);
  assert.equal(destinyStat(fight,'hero','speed'),22);
  fight=endDestinyRound(hit(win(fight)));
  fight=startDestinyRound(resume(fight),0);
  assert.equal(destinyStat(fight,'hero','magic'),1);
  assert.equal(destinyStat(fight,'hero','speed'),22);
  fight=endDestinyRound(hit(win(fight)));fight=startDestinyRound(fight,0);
  assert.equal(destinyStat(fight,'hero','speed'),20);
  const legacy=configureDestinyAbilities(createDestinyFight(hero,[enemy]),{savagery:1});
  assert.equal(destinyAbilitySpec(legacy,'savagery').attribute,'brawn');
  assert.deepEqual(catalog,before);
});

test('an explicit book catalog rejects foreign inventory and gear instead of falling back to Winter abilities',()=>{
  const fight=createDestinyFight(hero,[enemy]),before=structuredClone(fight);
  assert.throws(()=>configureDestinyAbilities(fight,{getaway:1},{},{catalog}),/Invalid ability inventory/);
  assert.throws(()=>configureDestinyAbilities(fight,{},{feet:{abilities:['getaway']}},{catalog}),/Invalid item abilities/);
  const configured=configure({});configured.abilities.getaway=1;
  assert.equal(destinyAbilitySpec(configured,'getaway'),undefined);
  assert.equal(hasDestinyAbility(configured,'getaway'),false);
  assert.deepEqual(fight,before);
});

test('explicit encounter grants remain usable outside a book catalog and take priority over its definition',()=>{
  let fight=startDestinyRound(configure({savagery:1}),0);
  fight.encounter={grantedAbilities:{savagery:{spec:{category:'mo',phases:['speed'],heal:4}},gift:{spec:{category:'mo',phases:['speed'],heal:2}}}};
  fight.abilities.gift=1;
  assert.equal(hasDestinyAbility(fight,'gift'),true);
  fight=useDestinyAbility(fight,'savagery');assert.equal(fight.hero.health,24);
  fight=useDestinyAbility(fight,'gift');assert.equal(fight.hero.health,26);
});

test('invalid book options cannot mutate an existing fight',()=>{
  const fight=createDestinyFight(hero,[enemy]),before=structuredClone(fight);
  for(const options of [{catalog:null},{catalog:[]},{catalog:{bad:{category:'invalid',phases:[]}}},
    {catalog:{bad:{category:'mo',phases:['invalid']}}},{bookRules:{deathPenalties:'false'}},{bookRules:{unknown:false}}]){
    assert.throws(()=>configureDestinyAbilities(fight,{}, {},options));
  }
  assert.throws(()=>configureDestinyAbilities(fight,{'shadow-thorns':1},{},{bookRules}),/Invalid ability inventory/);
  assert.deepEqual(fight,before);
});

test('Webbed reduces a three-die opponent to two dice and retargeting preserves the other foe\'s dice',()=>{
  let fight=startDestinyRound(configure({webbed:1}),0);fight.encounter={speedDiceByTarget:{0:3}};
  fight=rollDestinySpeed(fight,rolls(6,6,1,2,3));assert.deepEqual(fight.turn.opponentSpeedDice,[1,2,3]);
  let reduced=startDestinyRound(configure({webbed:1}),0);reduced.encounter={speedDiceByTarget:{0:3}};
  reduced=useDestinyAbility(reduced,'webbed');reduced=rollDestinySpeed(resume(reduced),rolls(6,6,1,2));
  assert.deepEqual(reduced.turn.opponentSpeedDice,[1,2]);
  let legacy=configureDestinyAbilities(createDestinyFight(hero,[enemy]),{webbed:1});
  legacy=startDestinyRound(legacy,0);legacy.encounter={speedDiceByTarget:{0:3}};
  legacy=useDestinyAbility(legacy,'webbed');legacy=rollDestinySpeed(legacy,rolls(6,6,1));
  assert.deepEqual(legacy.turn.opponentSpeedDice,[1]);
  let retargeted=startDestinyRound(configure({webbed:1},{},[enemy,enemy]),0);
  retargeted.encounter={speedDiceByTarget:{0:3,1:3}};
  retargeted=retargetDestinyRound(useDestinyAbility(retargeted,'webbed'),1);
  retargeted=rollDestinySpeed(retargeted,rolls(6,6,1,2,3));
  assert.deepEqual(retargeted.turn.opponentSpeedDice,[1,2,3]);
});

test('Cripple lasts the next three rounds and Disrupt lasts the rest of combat',()=>{
  for(const [name,attribute,amount]of[['cripple','speed',-1],['disrupt','magic',-3]]){
    let fight=configure({[name]:1},{},[{...enemy,speed:5}]);fight=startDestinyRound(fight,0);
    fight=useDestinyAbility(hit(win(fight)),name);fight=resume(fight);
    assert.equal(destinyStat(fight,0,attribute),name==='cripple'?5:1);
    for(let round=2;round<=5;round++){
      fight=startDestinyRound(endDestinyRound(fight),0);
      assert.equal(destinyStat(fight,0,attribute),(name==='cripple'?5:4)+(name==='cripple'&&round===5?0:amount));
      fight=hit(win(fight));
    }
  }
});

test('a penalty-free saved fight ignores bleeding wounds, head blows and chronic convulsions without deleting them',()=>{
  const profile={penalties:['weeping-wounds','head-blow','chronic-convulsions'],notes:'preserve'};
  let fight=configure({adrenaline:1});fight.hero.health=5;
  fight=attachDestinyCharacter(fight,profile);fight=startDestinyRound(fight,0);
  fight=useDestinyAbility(resume(fight),'adrenaline',{},rolls());
  assert.equal(fight.phase,'speed');assert.equal(destinyStat(fight,'hero','speed'),22);
  fight=endDestinyRound(hit(win(fight)));
  assert.equal(fight.hero.health,5);assert.deepEqual(fight.character.penalties,profile.penalties);
});

test('death moves stay absent after normal, immediate and deferred ability kills in books without that category',()=>{
  for(const kind of ['normal','immediate','deferred']){
    let fight=configure(kind==='normal'?{}:{'black-rain':1},{equipment:{leftHand:{type:'bow'}}},[{...enemy,health:1},enemy]);
    fight=win(startDestinyRound(fight,0));
    if(kind==='normal')fight=hit(fight);
    else{
      fight=useDestinyAbility(fight,'black-rain',{deferDamage:kind==='deferred'},rolls(2));
      if(kind==='deferred')fight=resolveDestinyAbilityRoll(resume(fight),rolls());
    }
    assert.equal(fight.status,'active');assert.equal(fight.phase,'end');
    fight=endDestinyRound(resume(fight));assert.equal(fight.phase,'start');
  }
});

test('the session retains its book defeat rule after reload and records the fifth loss once without a penalty roll',()=>{
  let session=createDestinySession({character:{defeats:4,notes:'keep',penalties:[]}});
  session=beginDestinySession(session,{hero,opponents:[enemy]}, {outcomeId:'loss-five',catalog,bookRules});
  session=applyDestinySessionAction(session,'concede');session=resume(session);
  session=applyDestinySessionAction(session,'record-outcome',{}, {roll:rolls(),timestamp:1});
  assert.equal(session.character.defeats,5);assert.equal(session.character.nextPenaltyAt,10);
  assert.deepEqual(session.character.penalties,[]);assert.equal(session.character.notes,'keep');
  assert.deepEqual(applyDestinySessionAction(resume(session),'record-outcome',{}, {roll:rolls()}),session);
});

test('book factories and actions are transient dependencies and never become saved functions',()=>{
  let called=0;const source=createDestinySession();
  const session=beginDestinySession(source,{hero,section:'book-encounter'}, {outcomeId:'other-book',catalog,bookRules,
    createFight:(actor,section,options)=>{called++;assert.equal(section,'book-encounter');return configureDestinyAbilities(createDestinyFight(actor,[enemy]),{}, {},options);}});
  assert.equal(called,1);assert.deepEqual(resume(session),session);
  const result=applyDestinySessionAction(session,'book-action',{name:'test'}, {useBookAction:(fight,name)=>{
    assert.equal(name,'test');fight.hero.health=19;return fight;}});
  assert.equal(result.fight.hero.health,19);assert.equal(session.fight.hero.health,20);
  assert.equal(source.fight,null);
});

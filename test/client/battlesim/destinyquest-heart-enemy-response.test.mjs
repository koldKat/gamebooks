import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {captureDestinyAbsorbedAbility} from '../../../public/js/battlesim/engines/destinyquest/enemy-absorption.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {destinyStat,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const act=(s,name,payload={},...dice)=>applyDestinySessionAction(s,name,payload,{roll:rolls(...dice)});
function setup(name='cleave',abilities={}){
  const f=configureDestinyAbilities(createDestinyFight({speed:20,brawn:0,magic:0,armour:20,health:30,maxHealth:60},[{speed:15,brawn:12,magic:null,armour:16,health:100}]),abilities,{mainHand:{type:'sword'}},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  f.encounter={enemyAbsorption:{target:0,categories:['sp','co'],delayRounds:1,ignoreWeaponCareerRequirements:true},growingStatusOnHit:{target:0,kinds:['score','dice'],name:'Boiling blood',increment:1,maximum:4}};
  f.round=1;captureDestinyAbsorbedAbility(f,name,catalog[name]);
  return createDestinySession({fight:f,fightId:'enemy-response',character:{owner:'Player',gold:7},setup:{hero:f.hero}});
}
function pending(s,die=4){s=act(s,'start-round',{target:0});s=act(s,'roll-speed',{},1,2,6,6);return act(s,'resolve-speed',{},die);}

test('healing and its spent charge survive resolution of an opponent damage roll',()=>{
  let s=pending(setup('cleave',{heal:1}));const before=structuredClone(s);
  s=act(s,'ability',{name:'heal'});assert.equal(s.fight.phase,'enemy-ability');assert.equal(s.fight.hero.health,34);
  assert.deepEqual(before.fight.hero.health,30);s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');
  assert.equal(s.fight.hero.health,30);assert.equal(s.fight.used.heal,1);assert.throws(()=>act(s,'ability',{name:'heal'}),/uses left/);
  assert.equal(s.character.owner,'Player');assert.equal(s.character.gold,7);assert.equal(s.fight.equipment.mainHand.type,'sword');
});

test('player buffs and score effects remain on the player side after an opponent action projects',()=>{
  for(const name of ['cunning','fear']){
    let s=pending(setup('cleave',{[name]:1}));s=act(s,'ability',{name});s=act(s,'resolve-enemy-ability');
    assert.equal(s.fight.used[name],1);assert.equal(s.fight.opponents[0].brawn,12);
    if(name==='cunning')assert.equal(destinyStat(s.fight,'hero','brawn'),3);
    else assert.equal(s.fight.effects.find(e=>e.source==='fear').hero,false);
  }
});

test('a legal player counter-action can pause for its own dice without losing the original opponent action',()=>{
  let s=pending(setup('cleave',{'thorn-armour':1}),3);
  s=act(s,'ability',{name:'thorn-armour',options:{deferDamage:true}},4);assert.equal(s.fight.phase,'ability-rolled');
  assert.equal(s.fight.turn.pendingAbility.type,'damage');assert.equal(s.fight.enemyAbilityState.pending.view.turn.pendingAbility.groups[0].dice[0],3);
  s=act(JSON.parse(JSON.stringify(s)),'resolve-ability');assert.equal(s.fight.phase,'enemy-ability');assert.equal(s.fight.opponents[0].health,96);
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');assert.equal(s.fight.hero.health,27);assert.equal(s.fight.opponents[0].health,96);
  assert.equal(destinyStat(s.fight,'hero','armour'),23);assert.equal(s.fight.used['thorn-armour'],1);
  assert.equal(s.fight.enemyAbilityState.queue.at(-1).name,'thorn-armour');assert.equal(s.fight.enemyAbilityState.queue.at(-1).availableRound,3);
});

test('native healing and player healing each apply once across a table roll followed by a damage roll',()=>{
  let s=setup('ley-line-infusion',{heal:1});s.fight.opponents[0].health=60;s=pending(s,6);
  s=act(s,'ability',{name:'heal'});s=act(s,'resolve-enemy-ability',{},4);assert.equal(s.fight.phase,'enemy-ability');
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');assert.equal(s.fight.hero.health,30);assert.equal(s.fight.opponents[0].health,68);
  assert.equal(s.fight.used.heal,1);
});

test('hero dice modifiers cannot change the opponent roll but remain usable on the player counter-action dice',()=>{
  let s=pending(setup('cleave',{charm:1,'high-five':1,finesse:1,'thorn-armour':1}),3),before=structuredClone(s);
  for(const name of ['charm','high-five','finesse'])assert.throws(()=>act(s,'ability',{name,options:{die:0}},6),/opponent roll/);
  assert.deepEqual(s,before);
  s=act(s,'ability',{name:'thorn-armour',options:{deferDamage:true}},4);
  s=act(s,'ability',{name:'charm',options:{group:0,die:0}},6);s=act(s,'resolve-ability');s=act(s,'resolve-enemy-ability');
  assert.equal(s.fight.opponents[0].health,94);assert.equal(s.fight.hero.health,27);assert.equal(s.fight.used.charm,1);
});

test('a player counter-action which ends the battle clears the deferred opponent roll',()=>{
  let s=setup('cleave',{'thorn-armour':1});s.fight.opponents[0].health=2;s=pending(s,3);
  s=act(s,'ability',{name:'thorn-armour',options:{deferDamage:true}},4);s=act(s,'resolve-ability');
  assert.equal(s.fight.status,'win');assert.equal(s.fight.enemyAbilityState.pending,undefined);
  assert.throws(()=>act(s,'resolve-enemy-ability'),/pending/);
});

test('cleansing an existing player status during the opponent pause does not resurrect it later',()=>{
  let s=setup('cleave',{cauterise:1});s.fight.effects.push({kind:'bleed',target:'hero',amount:2,from:0,until:100,source:'test'});
  s=pending(s);s=act(s,'ability',{name:'cauterise'});s=act(s,'resolve-enemy-ability');
  assert.equal(s.fight.effects.some(e=>e.kind==='bleed'),false);assert.equal(s.fight.used.cauterise,1);
});

test('effects retain their identities after cleansing and saving between two opponent roll stages',()=>{
  let s=setup('ley-line-infusion',{cauterise:1,cunning:1,fear:1});
  s.fight.effects.push({kind:'bleed',target:'hero',amount:2,from:0,until:100,source:'test'});
  addDestinyStatEffect(s.fight,'hero','brawn',2,null,'existing-buff');
  s=pending(s,6);s=act(s,'ability',{name:'cunning'});s=act(s,'ability',{name:'fear'});
  s=act(s,'ability',{name:'cauterise'});
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability',{},4);
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');
  assert.equal(s.fight.effects.some(e=>e.kind==='bleed'),false);
  assert.equal(s.fight.effects.filter(e=>e.source==='cunning').length,1);
  assert.equal(s.fight.effects.filter(e=>e.source==='fear').length,1);
  assert.equal(destinyStat(s.fight,'hero','brawn'),5);
  for(const name of ['cauterise','cunning','fear'])assert.equal(s.fight.used[name],1);
});

test('a response used only after the copied table resolves still survives the final damage roll',()=>{
  let s=pending(setup('ley-line-infusion',{heal:1}),6);
  s=act(s,'resolve-enemy-ability',{},4);s=act(s,'ability',{name:'heal'});
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');
  assert.equal(s.fight.hero.health,30);assert.equal(s.fight.used.heal,1);
});

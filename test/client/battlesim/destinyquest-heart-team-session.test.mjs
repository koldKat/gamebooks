import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinySession as create,beginDestinySession as begin,applyDestinySessionAction as action} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const bookRules={deathMoves:false,deathPenalties:false};
const hero={speed:20,brawn:4,magic:0,armour:0,health:20,maxHealth:30};
const foe={name:'Monster',speed:0,brawn:2,armour:0,health:200};
const act=(s,a,p={},dice=[])=>action(clone(s),a,p,{roll:rolls(...dice),timestamp:1234});

test('starting a configured team builds separate native actors in one immutable session update',()=>{
  const source=create({character:{ownerMarker:'player',gold:7},history:[{keep:true}]}),before=clone(source);
  const config={hero,opponents:[foe],abilities:{heal:1},equipment:{mainHand:{type:'dagger'}},teamEnabled:true,
    ally:{hero:{...hero,name:'Companion'},abilities:{regrowth:2},equipment:{mainHand:{type:'staff',magic:5}},character:{career:'medic',gold:99}}};
  const result=begin(source,config,{outcomeId:'configured-team',catalog,bookRules});
  assert.deepEqual(source,before);assert.equal(result.fight.team.active,0);assert.equal(result.character.ownerMarker,'player');
  assert.equal(result.fight.allies[0].hero.name,'Companion');assert.equal(result.fight.allies[0].abilities.regrowth,2);
  assert.equal(result.fight.allies[0].character.gold,99);assert.equal(result.character.gold,7);
  assert.equal(result.fight.allies[0].equipment.mainHand.type,'staff');assert.equal(result.fight.equipment.mainHand.type,'dagger');
  assert.deepEqual(result.history,[{keep:true}]);
  assert.throws(()=>begin(source,{...config,ally:undefined},{outcomeId:'missing-ally',catalog,bookRules}),/second hero/);
  assert.throws(()=>begin(source,{...config,teamEnabled:'false'},{outcomeId:'invalid-team',catalog,bookRules}),/solo or two/);
  assert.deepEqual(source,before);
});

test('disabling a saved ally setup starts solo without discarding that setup',()=>{
  const config={hero,opponents:[foe],abilities:{heal:1},teamEnabled:false,ally:{hero,abilities:{regrowth:2}}};
  const result=begin(create(),config,{outcomeId:'configured-solo',catalog,bookRules});
  assert.equal(result.fight.team,undefined);assert.equal(result.setup.ally.abilities.regrowth,2);
});
function setup(){
  let s=begin(create({character:{ownerMarker:'player',gold:7}}),{hero,opponents:[foe],abilities:{heal:1},equipment:{mainHand:{type:'dagger',brawn:2}}},{outcomeId:'team-1',catalog,bookRules});
  const ally=attachDestinyCharacter(configureDestinyAbilities(createDestinyFight({...hero,name:'Ally'},[foe]),{heal:1},{mainHand:{type:'staff',magic:5}},{catalog,bookRules}),{ownerMarker:'ally',gold:99});
  return act(s,'team-attach',{ally});
}

test('team session actions preserve the player character and equipment while the ally is selected',()=>{
  let s=setup();s=act(s,'team-select',{actor:1});
  assert.equal(s.character.ownerMarker,'player');assert.equal(s.character.gold,7);assert.equal(s.setup.equipment.mainHand.type,'dagger');
  assert.equal(s.fight.character.ownerMarker,'ally');assert.equal(s.fight.character.gold,99);
  s=act(s,'start-round',{roles:['attack','support'],target:0});
  s=act(s,'ability',{actor:1,name:'heal',options:{ally:0}});
  assert.equal(s.character.ownerMarker,'player');assert.equal(s.fight.character.ownerMarker,'ally');
  s=act(s,'roll-speed',{actor:0},[6,5,1,2]);s=act(s,'resolve-speed');
  s=act(s,'roll-damage',{},[1]);s=act(s,'resolve-damage');s=act(s,'end-round');
  assert.equal(s.fight.round,1);assert.equal(s.character.gold,7);assert.equal(s.fight.opponents[0].health,195);
});

test('outcome recording projects the player before persisting and never records the ally as the account character',()=>{
  let s=setup();s=act(s,'team-select',{actor:1});s=act(s,'concede');
  assert.equal(s.fight.team.active,1);
  s=act(s,'record-outcome');
  assert.equal(s.fight.team.active,0);assert.equal(s.character.ownerMarker,'player');assert.equal(s.character.defeats,1);
  assert.equal(s.character.gold,7);assert.equal(s.setup.equipment.mainHand.type,'dagger');
  assert.equal(s.fight.allies[0].character.ownerMarker,'ally');assert.equal(s.fight.allies[0].character.defeats,1);
  const again=act(s,'record-outcome');assert.equal(again.character.defeats,1);assert.equal(again.history.length,1);
});

test('post-combat story actions use the player catalog and character when the ally was selected',()=>{
  let s=setup();s=act(s,'team-select',{actor:1});s=act(s,'concede');
  s=act(s,'story-action',{name:'reward-gold',options:{amount:3}});
  assert.equal(s.character.gold,10);assert.equal(s.character.ownerMarker,'player');assert.equal(s.fight.team.active,0);
  assert.equal(s.fight.allies[0].character.gold,99);
});

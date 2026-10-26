import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {resolveDestinyAbilityRoll as resolve} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function setup(extra={}){
  return configureDestinyAbilities(createDestinyFight({speed:20,brawn:40,magic:0,armour:30,health:10,maxHealth:30},[{name:'Opponent',speed:0,brawn:0,armour:90,health:100}]),{'ley-line-infusion':1,...extra},{},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,1,2)));

test('Ley Line Infusion resolves all six outcomes with separate armourless damage and capped healing',()=>{
  for(let face=1;face<=6;face++){
    let f=use(win(setup()),'ley-line-infusion',{},rolls(face));
    assert.equal(f.phase,'ability-rolled');assert.equal(f.opponents[0].health,100);
    f=resolve(clone(f),face===1?rolls(3,4):rolls(3));
    assert.equal(f.hero.health,face===1?6:face<=3?15:18);
    assert.equal(f.opponents[0].health,97);assert.equal(f.phase,'end');assert.equal(f.used['ley-line-infusion'],1);
    assert.equal(f.turn.used.co,true);
  }
});

test('six heals one living ally independently, caps both Health pools and remains valid for a solo hero',()=>{
  let f=attachDestinyAlly(setup(),setup());f.hero.health=28;f.allies[0].hero.health=29;
  f=resolve(use(win(f),'ley-line-infusion',{},rolls(6)),rolls(1));
  assert.equal(f.hero.health,30);assert.equal(f.allies[0].hero.health,30);
  let invalid=win(attachDestinyAlly(setup(),setup()));invalid.allies[0].hero.health=0;
  assert.throws(()=>use(invalid,'ley-line-infusion',{ally:0},rolls()),/living ally/);
});

test('Wild Child modifies only its pending outcome and can turn five into ally healing',()=>{
  let f=win(attachDestinyAlly(setup({'call-of-nature-set':1}),setup()));
  assert.throws(()=>use(f,'wild-child'),/combat stage/);
  const gear=clone(f.equipment);
  f=use(f,'ley-line-infusion',{},rolls(5));f=use(clone(f),'wild-child');
  assert.deepEqual(f.turn.pendingAbility.dice,[5]);assert.equal(f.turn.pendingAbility.resultBonus,1);
  f=resolve(f,rolls(2));assert.equal(f.hero.health,18);assert.equal(f.allies[0].hero.health,18);assert.deepEqual(f.equipment,gear);
  f=resolve(use(use(win(setup({'wild-child':1})),'ley-line-infusion',{},rolls(6)),'wild-child'),rolls(2));
  assert.equal(f.history.find(e=>e.type==='ability-roll').result,6);
});

test('Wild Child passes its own Elysium check and a failed modifier preserves the original outcome',()=>{
  for(const face of [1,2]){
    let f=use(win(setup({'wild-child':1,'elysium-soaked':1})),'ley-line-infusion',{},rolls(1));
    f=use(f,'wild-child',{},rolls(face));assert.equal(f.turn.pendingAbility.type,'ability-check');
    f=resolve(clone(f),rolls());assert.equal(f.turn.pendingAbility.type,'catalog-table');
    f=resolve(f,face===1?rolls(2,3):rolls(2));
    assert.equal(f.hero.health,face===1?7:15);assert.equal(f.used['wild-child'],face===1?undefined:1);
  }
});

test('the outcome roll and deferred damage dice remain separately modifiable across save and resume',()=>{
  let f=use(win(setup({charm:2,'wild-child':1})),'ley-line-infusion',{deferDamage:true},rolls(1));
  f=use(f,'charm',{die:0},rolls(4));f=resolve(clone(f),rolls(1));
  assert.equal(f.hero.health,18);assert.equal(f.turn.pendingAbility.type,'damage');assert.equal(f.opponents[0].health,100);
  assert.throws(()=>use(f,'wild-child'),/matching ability roll/);
  f=use(f,'charm',{die:0},rolls(6));f=resolve(clone(f),rolls());
  assert.equal(f.opponents[0].health,94);assert.equal(f.phase,'end');
});

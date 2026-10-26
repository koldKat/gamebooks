import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {setDestinyPassiveActivation as activate} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {destinyDamageScore,destinyStat,destinyPassiveEffects,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {queueDestinyEncounterEvent} from '../../../public/js/battlesim/engines/destinyquest/encounter-events.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const equipment={mainHand:{type:'dagger',brawn:3},leftHand:{type:'dagger',brawn:4}};
const clone=f=>JSON.parse(JSON.stringify(f));
function setup(abilities,gear=equipment){
  return configureDestinyAbilities(createDestinyFight({speed:20,brawn:50,magic:0,armour:0,health:30},[{name:'Opponent',speed:0,brawn:0,armour:80,health:200}]),abilities,gear,{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,1,2)));

test('Double Punch adds only both daggers Brawn to two armourless dice, once per combat',()=>{
  let f=use(win(setup({'double-punch':1})),'double-punch',{},rolls(2,3));
  assert.equal(f.opponents[0].health,188);assert.equal(f.phase,'end');
  f=win(endDestinyRound(clone(f)));
  assert.throws(()=>use(f,'double-punch',{},rolls(6,6)),/no uses left/);
  const invalid=win(setup({'double-punch':1},{...equipment,leftHand:{type:'sword',brawn:4}}));
  const before=clone(invalid);
  assert.throws(()=>use(invalid,'double-punch',{},rolls()),/leftHand/);assert.deepEqual(invalid,before);
});

test('Vindicator grants two Double Punch uses and adds two to each complete hit',()=>{
  let f=setup({'double-punch':1,'pagan-s-spirit-set':1});
  const originalGear=clone(f.equipment);
  for(let i=0;i<2;i++){
    f=use(win(f),'double-punch',{},rolls(2,3));
    assert.equal(f.opponents[0].health,200-14*(i+1));
    f=endDestinyRound(clone(f));
  }
  assert.deepEqual(f.equipment,originalGear);
  assert.throws(()=>use(win(f),'double-punch',{},rolls()),/no uses left/);
});

test('Hexed Vindicator applies only after explicit passive activation',()=>{
  let f=setup({hexed:1,'double-punch':1,vindicator:1});
  f=use(win(f),'double-punch',{},rolls(2,3));assert.equal(f.opponents[0].health,188);
  f=activate(endDestinyRound(f),'vindicator');
  f=use(win(clone(f)),'double-punch',{},rolls(2,3));assert.equal(f.opponents[0].health,174);
  assert.deepEqual(f.abilityQuota.used,['double-punch','vindicator']);
});

test('Thorn Cage deals its die immediately and its passive damage at every round end',()=>{
  let f=use(win(setup({'thorn-cage':1})),'thorn-cage',{},rolls(4));
  assert.equal(f.opponents[0].health,196);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,195);
  f=win(clone(f));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,194);
});

test('named passive immunity stops Thorn Cage ticks without blocking the initial combat die',()=>{
  let f=win(setup({'thorn-cage':1}));f.encounter={passiveImmunityByTarget:{0:['thorn-cage']}};
  f=use(f,'thorn-cage',{},rolls(4));assert.equal(f.opponents[0].health,196);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,196);
});

test('Charm Offensive counts worn Charm items even after their reroll charges are spent',()=>{
  let f=win(setup({'charm-offensive':1,charm:4}));f.used.charm=4;
  f=rollDestinyDamage(f,rolls(2));assert.equal(destinyDamageScore(f),52);
  f=use(f,'charm-offensive');assert.equal(destinyDamageScore(f),60);
  assert.deepEqual(f.turn.damageDice,[2]);assert.equal(f.used.charm,4);
});

test('Heart Mangle is a spent modifier for one damage score, rather than an automatic combat-wide passive',()=>{
  let f=rollDestinyDamage(win(setup({mangle:1})),rolls(6));
  assert.equal(destinyDamageScore(f),56);
  f=use(f,'mangle');assert.equal(destinyDamageScore(f),58);
  f=clone(f);f.turn.damageDice=[6,6];assert.equal(destinyDamageScore(f),66);
  f.turn.damageDice=[2,3];assert.equal(destinyDamageScore(f),55);
  f=endDestinyRound(resolveDestinyDamage(f));
  f=rollDestinyDamage(win(f),rolls(6));assert.equal(destinyDamageScore(f),56);
  assert.throws(()=>use(f,'mangle'),/no uses left/);
});

test('Convulsions requires actual score Health damage and only affects later doubles by that opponent',()=>{
  let f=win(setup({convulsions:1}));f.opponents[0].armour=0;
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.effects.filter(e=>e.source==='convulsions').length,1);
  f=endDestinyRound(clone(f));f.opponents[0].speed=100;
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,6)));
  assert.equal(f.turn.winner,'hero');
  let blocked=resolveDestinyDamage(rollDestinyDamage(win(setup({convulsions:1})),rolls(1)));
  assert.equal(blocked.effects.some(e=>e.source==='convulsions'),false);
  let dice=win(setup({convulsions:1,'double-punch':1}));
  dice=use(dice,'double-punch',{},rolls(2,3));
  assert.equal(dice.effects.some(e=>e.source==='convulsions'),false);
});

test('Convulsions respects named passive immunity and never transfers to an unaffected opponent',()=>{
  let f=win(setup({convulsions:1}));f.opponents[0].armour=0;
  f.encounter={passiveImmunityByTarget:{0:['convulsions']}};
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.effects.some(e=>e.source==='convulsions'),false);
  f=endDestinyRound(f);f.opponents[0].speed=100;
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,6)));
  assert.equal(f.turn.winner,'opponent');
});

test('Spirit Mark applies only to subsequent scores against the marked opponent and is once per combat',()=>{
  let f=win(setup({'spirit-mark':1}));f.opponents[0].armour=0;
  f.opponents.push({...f.opponents[0],name:'Unmarked'});
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  const before=clone(f);
  assert.throws(()=>use(f,'spirit-mark',{target:1}),/current opponent/);assert.deepEqual(f,before);
  f=use(f,'spirit-mark');assert.equal(destinyDamageScore(f),51);
  f=endDestinyRound(f);f=rollDestinyDamage(win(clone(f)),rolls(1));
  assert.equal(destinyDamageScore(f),53);
  const other=clone(f);other.target=1;assert.equal(destinyDamageScore(other),51);
  f=resolveDestinyDamage(f);assert.throws(()=>use(f,'spirit-mark'),/no uses left/);
  const blocked=resolveDestinyDamage(rollDestinyDamage(win(setup({'spirit-mark':1})),rolls(1)));
  assert.throws(()=>use(blocked,'spirit-mark'),/health damage/);
});

test('Toxicology suppresses all three named conditions while retaining unrelated damage and penalties',()=>{
  let f=win(setup({toxicology:1}));
  f.encounter={heroStatuses:{venom:2,disease:2,bleed:1},growingStatus:{name:'disease',increment:3,from:1}};
  f.effects.push({kind:'ongoing-damage',status:'venom',target:'hero',amount:7,from:1,until:10});
  addDestinyStatEffect(f,'hero','speed',-3,null,'delirium');
  addDestinyStatEffect(f,'hero','speed',-1,null,'unrelated');
  assert.equal(destinyStat(f,'hero','speed'),19);
  assert.deepEqual(destinyPassiveEffects(f).filter(e=>e.target==='hero').map(e=>e.source),['bleed']);
  const phase=f.phase;
  queueDestinyEncounterEvent(f,{kind:'stat-if-low',name:'Delirium',ability:'delirium',limit:6,attribute:'speed',amount:-1},phase,rolls());
  assert.equal(f.phase,phase);assert.equal(f.turn.pendingAbility,undefined);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));f=endDestinyRound(f);assert.equal(f.hero.health,29);
});

test('Hexed Toxicology protects only while selected and blocks new venom from enemy Health hits',()=>{
  let f=setup({hexed:1,toxicology:1});
  f.encounter={heroStatuses:{venom:2}};
  assert.equal(destinyPassiveEffects(f).filter(e=>e.source==='venom').length,1);
  f=activate(f,'toxicology');assert.equal(destinyPassiveEffects(f).filter(e=>e.source==='venom').length,0);
  delete f.encounter.heroStatuses;
  f.encounter.heroStatusOnHit={name:'venom',amount:2};
  f.opponents[0].speed=100;f.opponents[0].brawn=2;
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,5)));
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.hero.health,27);assert.equal(f.encounter.heroStatuses,undefined);
});

test('Backstab requires either-hand dagger and one of four qualifying controls, preserving normal damage',()=>{
  for(const control of ['immobilise','knockdown','stun','webbed']){
    let f=startDestinyRound(setup({[control]:1,backstab:1}),0);
    assert.throws(()=>use(f,'backstab',{},rolls()),/qualifying control/);
    f=use(f,control);f=use(clone(f),'backstab',{},rolls(2,3));
    assert.equal(f.opponents[0].health,195);assert.equal(f.phase,'speed');
    f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1)));
    assert.equal(f.turn.winner,'hero');assert.equal(f.phase,'damage');
    f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));assert.equal(f.phase,'end');
    assert.equal(f.used.backstab,1);
  }
  let noDagger=use(startDestinyRound(setup({webbed:1,backstab:1},{mainHand:{type:'sword'}}),0),'webbed');
  assert.throws(()=>use(noDagger,'backstab',{},rolls()),/Required weapon/);
  for(const hand of ['mainHand','leftHand']){
    let f=use(startDestinyRound(setup({webbed:1,backstab:1},{[hand]:{type:'dagger'}}),0),'webbed');
    f=use(f,'backstab',{},rolls(1,1));assert.equal(f.opponents[0].health,198);
  }
});

test('Blind Strike rejects unrelated controls, shares the combat slot and cannot reuse last round trigger',()=>{
  for(const control of ['curse','blind','windblast']){
    const f=use(startDestinyRound(setup({[control]:1,'blind-strike':1}),0),control);
    assert.throws(()=>use(f,'blind-strike',{},rolls()),/qualifying control/);
  }
  let f=use(startDestinyRound(setup({webbed:1,'blind-strike':1,backstab:1}),0),'webbed');
  f=use(f,'blind-strike',{},rolls(1,2));
  assert.throws(()=>use(f,'backstab',{},rolls()),/category per round/);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1)));
  f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(1))));
  f=startDestinyRound(clone(f),0);
  assert.throws(()=>use(f,'backstab',{},rolls()),/qualifying control/);
});

test('conditional strikes are restricted to the affected target and immunity prevents creating a trigger',()=>{
  let f=startDestinyRound(setup({webbed:1,backstab:1}),0);
  f.opponents.push({...f.opponents[0],name:'Unaffected'});
  f=use(f,'webbed');
  assert.throws(()=>use(f,'backstab',{target:1},rolls()),/qualifying control/);
  const immune=startDestinyRound(setup({webbed:1,backstab:1}),0);immune.encounter={speedDiceReductionImmune:[0]};
  assert.throws(()=>use(immune,'webbed'),/immune/);assert.equal(immune.turn.controlTriggers,undefined);
});

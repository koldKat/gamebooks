import test from 'node:test';
import assert from 'node:assert/strict';
import {startD20Fight,d20Action} from '../../../public/js/battlesim/engines/d20/core.js';

const actor = extra => ({name:'Combatant',hp:100,maxHp:100,ac:12,
  abilities:{str:0,dex:0,con:0,int:0,wis:0,cha:0},saves:{str:0,dex:0,con:0,int:0,wis:0,cha:0},
  attacks:[{name:'Weapon',bonus:5,reach:15,damage:[{formula:'5',type:'slashing'}]}],...extra});
const fire = extra => actor({name:'Elemental',hp:55,maxHp:55,
  attacks:[{name:'Touch',bonus:3,reach:5,damage:[{formula:'1d6+1',type:'fire'}]}],
  features:{ignition:{formula:'1d10',type:'fire'},
    fireForm:{contactDamage:{formula:'1d10',type:'fire',meleeDistance:5},enterSpaceDamage:{formula:'1d10',type:'fire',ignites:true}},
    waterSusceptibility:{coldDamagePerFiveFeet:1,coldDamagePerGallon:1},
    mergeIntoFire:{damageAbove:20,absentRounds:1,reappearPerceptionDc:12,failedCheckSurpriseAttack:true,spawnDistanceDie:6}},...extra});
const fight = (enemy,player=actor(),options={},setup={}) => startD20Fight(player,{name:'Encounter',profiles:[enemy],options},[],setup);
const act = (f,kind,extra={}) => d20Action(f,{kind,expectedRevision:f.revision,actor:'player',target:'enemy0',...extra});

test('touch ignites once, burns at turn start, and dousing ends the ongoing damage',()=>{
  let f=fight(fire());
  f=act(f,'attack',{actor:'enemy0',target:'player',attackIndex:0,distance:5,dice:[12],damageDice:[[1]]});
  assert.equal(f.player.hp,98);
  assert.equal(f.player.conditions.filter(c=>c.name==='burning').length,1);
  f=act(f,'startTurn',{burningDice:[5]});assert.equal(f.player.hp,93);
  f=act(f,'douse');assert.equal(f.player.conditions.length,0);
  f=act(f,'startTurn');assert.equal(f.player.hp,93);
});

test('fire damage respects immunity without modifying original source data',()=>{
  const original=fight(fire(),actor({defenses:{immunities:['fire']}}));
  const f=act(original,'touchFire',{distance:5,dice:[10]});
  assert.equal(f.player.hp,100);assert.equal(original.revision,0);
  assert.throws(()=>act(original,'touchFire',{distance:6,dice:[1]}));
});

test('melee contact deals fire damage even when the hit defeats the elemental',()=>{
  const original=fight(fire({hp:5}));
  const f=act(original,'attack',{attackIndex:0,distance:5,dice:[10],contactDamageDice:[7]});
  assert.equal(f.status,'win');assert.equal(f.player.hp,93);
  assert.equal(original.player.hp,100);
});

test('space-entry damage is once per target per turn and does not stack burning',()=>{
  let f=fight(fire());
  f=act(f,'enterFireSpace',{actor:'enemy0',target:'player',distance:0,dice:[3]});
  assert.equal(f.player.hp,97);
  assert.throws(()=>act(f,'enterFireSpace',{actor:'enemy0',target:'player',distance:0,dice:[3]}));
  f=act(f,'startTurn',{actor:'enemy0'});
  f=act(f,'enterFireSpace',{actor:'enemy0',target:'player',distance:0,dice:[4]});
  assert.equal(f.player.hp,93);assert.equal(f.player.conditions.filter(c=>c.name==='burning').length,1);
});

test('water susceptibility uses complete five-foot intervals and gallon counts',()=>{
  let f=fight(fire());
  f=act(f,'water',{actor:'enemy0',amount:9,unit:'feet'});assert.equal(f.groups[0].hp,54);
  f=act(f,'water',{actor:'enemy0',amount:4,unit:'gallons'});assert.equal(f.groups[0].hp,50);
  assert.throws(()=>act(f,'water',{actor:'enemy0',amount:-1,unit:'gallons'}));
});

test('damage must exceed twenty to trigger merging, and the round delay cannot be bypassed',()=>{
  const player=actor({attacks:[{name:'Weapon',bonus:5,reach:15,damage:[{formula:'21',type:'force'}]}]});
  let f=fight(fire(),player);
  f=act(f,'attack',{attackIndex:0,distance:10,dice:[10]});
  assert.equal(f.groups[0].sourceMergedUntilRound,1);
  assert.throws(()=>act(f,'attack',{attackIndex:0,distance:10,dice:[20]}));
  assert.throws(()=>act(f,'reappear',{actor:'enemy0',target:'player',dice:[20]}));
  f=act(f,'round');f=act(f,'reappear',{actor:'enemy0',target:'player',dice:[1],spawnRoll:4});
  assert.equal(f.groups[0].sourceMergedUntilRound,undefined);
  assert.deepEqual(f.openingAttacks,['enemy0']);assert.equal(f.events.at(-1).roll,4);
  const exactlyTwenty=actor({attacks:[{name:'Weapon',bonus:5,reach:15,damage:[{formula:'20',type:'force'}]}]});
  assert.equal(act(fight(fire(),exactlyTwenty),'attack',{attackIndex:0,distance:10,dice:[10]}).groups[0].sourceMergedUntilRound,undefined);
});

test('successful reappearance perception grants no surprise attack',()=>{
  let f=fight(fire());f.groups[0].sourceMergedUntilRound=0;
  f=act(f,'reappear',{actor:'enemy0',target:'player',dice:[12]});
  assert.deepEqual(f.openingAttacks,[]);
});

test('shifting darkness affects player attacks for the whole turn and leaves rats unaffected',()=>{
  const rat=actor({features:{shiftingDarkness:{die:6,maximum:3}}});
  let f=fight(rat);
  f=act(f,'startTurn',{darknessRoll:3});assert.equal(f.player.sourceTurnDisadvantage,true);
  f=act(f,'attack',{attackIndex:0,distance:5,dice:[20,1]});assert.equal(f.groups[0].hp,100);
  f=act(f,'startTurn',{actor:'enemy0'});assert.equal(f.groups[0].sourceTurnDisadvantage,false);
  f=act(f,'startTurn',{darknessRoll:4});assert.equal(f.player.sourceTurnDisadvantage,false);
  f=act(f,'attack',{attackIndex:0,distance:5,dice:[10]});assert.equal(f.groups[0].hp,95);
});

test('first-hit corrosion affects later weapon damage once and exempts magical weapons',()=>{
  const rat=actor({features:{firstSuccessfulHitCorrosion:{damagePenalty:1}}});
  let f=fight(rat);
  f=act(f,'attack',{attackIndex:0,distance:5,dice:[10],metalWeapon:true});
  assert.equal(f.groups[0].hp,95);assert.equal(f.player.attacks[0].damagePenalty,1);
  f=act(f,'attack',{attackIndex:0,distance:5,dice:[10],metalWeapon:true});
  assert.equal(f.groups[0].hp,91);assert.equal(f.player.attacks[0].damagePenalty,1);
  const magical=actor();magical.attacks[0].magical=true;
  assert.equal(act(fight(rat,magical),'attack',{attackIndex:0,distance:5,dice:[10],metalWeapon:true}).player.attacks[0].damagePenalty,undefined);
});

test('wounded approach applies only its two-turn poison and does not repeat earlier damage',()=>{
  let f=fight(actor(),actor({hp:80}),{initialPoisonTurns:2,previousStoryDamageAlreadyApplied:true});
  assert.equal(f.player.hp,80);assert.equal(f.player.conditions[0].remainingTurns,2);
  f=act(f,'endTurn');f=act(f,'endTurn');assert.equal(f.player.conditions.length,0);
});

test('prior damage applies only to the first group member without repeating corrosion',()=>{
  const f=startD20Fight(actor(),{name:'Rats',profiles:[{...actor(),count:3}],options:{previousDamageEntryRequired:true}},[],
    {priorEnemyDamage:9,corrosionAlreadyResolved:true});
  assert.deepEqual(f.groups.map(a=>a.hp),[91,100,100]);assert.equal(f.sourceCorrosionResolved,true);
});

test('the printed advantaged opening attack consumes the opening only once',()=>{
  let f=fight(actor(),actor(),{enemyOpeningAttack:true,openingAttackAdvantage:true});
  f=act(f,'attack',{actor:'enemy0',target:'player',attackIndex:0,distance:5,dice:[1,10]});
  assert.equal(f.player.hp,95);assert.deepEqual(f.openingAttacks,[]);
  f=act(f,'attack',{actor:'enemy0',target:'player',attackIndex:0,distance:5,dice:[1]});assert.equal(f.player.hp,95);
});

const unseen = () => actor({name:'Unseen enemy',attacks:[
  {name:'Bite',bonus:4,reach:5,damage:[{formula:'1d6+2',type:'piercing'},{formula:'2d8',type:'poison'}]},
  {name:'Tendril',bonus:4,reach:10,damage:[{formula:'1d4+1',type:'piercing'}]},
],features:{encounterEscape:{skills:['athletics','acrobatics'],dc:19,failureOpportunitySequence:[0,1,1]}}});

test('successful escape takes no opportunity attacks and preserves the original fight',()=>{
  const original=fight(unseen(),actor({skillBonuses:{acrobatics:9}}));
  const f=act(original,'flee',{escapeSkill:'acrobatics',dice:[10]});
  assert.equal(f.status,'fled');assert.equal(f.player.hp,100);assert.equal(original.status,'fighting');
  assert.equal(f.events.length,1);assert.equal(f.events[0].check.success,true);
});

test('failed escape resolves the entire printed multiattack in one committed revision',()=>{
  const original=fight(unseen());
  const f=d20Action(original,{kind:'flee',expectedRevision:0,actor:'player',escapeSkill:'athletics',dice:[1]},()=>.5);
  assert.equal(f.status,'fled');assert.ok(f.player.hp<100);
  assert.deepEqual(f.events.filter(e=>e.kind==='attack').map(e=>e.attack),['Bite','Tendril','Tendril']);
  assert.equal(f.revision,1);assert.equal(original.player.hp,100);
});

test('a fatal opportunity attack records a loss instead of a successful escape',()=>{
  const original=fight(unseen(),actor({hp:1}));
  const f=d20Action(original,{kind:'flee',expectedRevision:0,dice:[1]},()=>.5);
  assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
  assert.equal(f.events.filter(e=>e.kind==='attack').length,1);
});

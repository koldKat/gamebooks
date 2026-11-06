import test from 'node:test';
import assert from 'node:assert/strict';
import {startD20Fight,d20Action} from '../../../public/js/battlesim/engines/d20/core.js';
import {addCondition,resolveDamageFeatures} from '../../../public/js/battlesim/engines/d20/effects.js';
import {reflectedSpell} from '../../../public/js/battlesim/engines/d20/source-spells.js';

const actor = extra => ({name:'Combatant',hp:100,maxHp:100,ac:12,conditions:[],
  abilities:{str:0,dex:0,con:0,int:0,wis:0,cha:0},saves:{str:0,dex:0,con:0,int:0,wis:0,cha:0},
  attacks:[{name:'Weapon',bonus:5,reach:5,damage:[{formula:'5',type:'slashing'}]}],...extra});
const displacement={rechargesAfterIllusionSpellMinimumLevel:1,illusionSpells:['greater invisibility','color spray','phantasmal force']};
const illusions=[['weapon',1,'1d6','fire'],['stone',1,'2d6','bludgeoning'],['spider',2,'1d8','piercing'],['fire',3,'2d6','fire']].map(([key,stage,formula,type])=>({key,stage,spell:'phantasmal force',level:2,save:{ability:'int',dc:13},damage:{formula,type}}));
const illusionist = () => actor({ac:15,spellcasting:{slots:{'1':3,'2':3,'3':3,'4':0},
  spells:{'1':['mage armor','color spray','magic missile'],'2':['phantasmal force'],'4':['greater invisibility']}},features:{displacement,
    scriptedInvisibility:{turn:1,spell:'greater invisibility',durationTurns:10,firstMoveFeet:30,concentrationMinimum:10},
    printedMageArmour:{spell:'mage armor',level:1,moveFeetWhileInvisible:30},printedIllusions:illusions}});
const mirror = extra => actor({features:{reflectSpell:{die:100,maximum:60,attackPenalty:-2,damageFraction:.5}},...extra});
const fight = (enemy=illusionist(),player=actor()) => startD20Fight(player,{name:'Encounter',profiles:[enemy]});
const act = (f,kind,extra={}) => d20Action(f,{kind,expectedRevision:f.revision,actor:'enemy0',target:'player',...extra});
function open(f=fight()) { f=act(f,'scriptedInvisibility');return act(f,'printedMageArmour'); }

test('the explicit printed opening preserves zero fourth-level slots',()=>{
  const original=fight(),f=act(original,'scriptedInvisibility');
  assert.equal(f.groups[0].spellSlots['4'],0);
  assert.equal(f.groups[0].conditions[0].name,'invisible');
  assert.equal(f.groups[0].conditions[0].remainingTurns,10);
  assert.equal(f.groups[0].conditions[0].concentrationMinimum,10);
  assert.equal(original.groups[0].conditions.length,0);
  assert.throws(()=>act(f,'scriptedInvisibility'));
  assert.throws(()=>act(f,'cast',{spell:'greater invisibility',level:4}));
});

test('printed Mage Armour spends one slot without adding AC twice',()=>{
  const f=open();assert.equal(f.groups[0].ac,15);assert.equal(f.groups[0].spellSlots['1'],2);
  assert.equal(f.events.at(-1).movement,30);assert.throws(()=>act(f,'printedMageArmour'));
});

test('the two first-illusion alternatives occupy the same stage and spend one slot',()=>{
  let f=open(fight(illusionist(),actor({defenses:{resistances:['fire']}})));
  f=act(f,'printedIllusion',{illusion:'weapon',saveDice:[1],damageDice:[6]});
  assert.equal(f.player.hp,97);assert.equal(f.groups[0].spellSlots['2'],2);
  assert.throws(()=>act(f,'printedIllusion',{illusion:'stone',saveDice:[1],damageDice:[1,1]}));
  assert.throws(()=>act(f,'printedIllusion',{illusion:'fire',saveDice:[1],damageDice:[1,1]}));
  f=act(f,'printedIllusion',{illusion:'spider',saveDice:[13]});assert.equal(f.player.hp,97);
  f=act(f,'printedIllusion',{illusion:'fire',saveDice:[1],damageDice:[3,4]});
  assert.equal(f.player.hp,94);assert.equal(f.groups[0].spellSlots['2'],0);
});

test('displacement ends on actual damage and recharges only after a resolved illusion spell',()=>{
  let f=fight();f=act(f,'displacement');
  f=act(f,'attack',{actor:'player',target:'enemy0',attackIndex:0,distance:5,dice:[10,20]});
  assert.equal(f.groups[0].conditions.some(c=>c.name==='displaced'),false);
  assert.throws(()=>act(f,'displacement'));
  f=act(f,'cast',{spell:'color spray',level:1});
  f=act(f,'cancelCast',{results:[],note:'Canceled'});
  assert.equal(f.groups[0].sourceDisplacementReady,false);
  f=act(f,'cast',{spell:'color spray',level:1});
  f=act(f,'resolveCast',{results:[],note:'Resolved'});
  assert.equal(f.groups[0].sourceDisplacementReady,true);
  assert.throws(()=>act(f,'displacement'));
  f=act(f,'startTurn');f=act(f,'displacement');
  assert.equal(f.groups[0].conditions.some(c=>c.name==='displaced'),true);
});

test('incapacitation and zero speed end displacement without resetting charges',()=>{
  let f=act(fight(),'displacement');
  f=act(f,'combatSpeed',{amount:0});assert.equal(f.groups[0].conditions.length,0);
  assert.equal(f.groups[0].sourceDisplacementReady,false);
  const a=actor({conditions:[{name:'displaced',endsIfIncapacitated:true},{name:'invisible',concentrationMinimum:10}]});
  assert.deepEqual(addCondition(a,{name:'stunned'}).actor.conditions.map(c=>c.name),['stunned']);
});

test('concentration damage can end the printed invisibility before its ten-turn duration',()=>{
  const f=act(fight(),'scriptedInvisibility');
  const result=resolveDamageFeatures(f.groups[0],1,{dice:{concentration:{0:[1]}}});
  assert.equal(result.actor.conditions.length,0);assert.equal(result.events[0].dc,10);
});

test('reflection includes sixty, uses the minus-two attack modifier and halves original damage once',()=>{
  const r=reflectedSpell(mirror(),actor({defenses:{resistances:['fire']}}),[{amount:11,type:'fire'}],
    {attackSpell:true,reflectionRoll:60,spellAttackBonus:5,reflectedAttackDice:[9]});
  assert.equal(r.event.check.total,12);assert.equal(r.event.amount,2);assert.equal(r.caster.hp,98);
  const critical=reflectedSpell(mirror(),actor(),[{amount:11,type:'fire'}],
    {attackSpell:true,reflectionRoll:1,spellAttackBonus:0,reflectedAttackDice:[20]});
  assert.equal(critical.event.amount,5);
});

test('failed reflection consumes the reaction without rolling a spell attack',()=>{
  const r=reflectedSpell(mirror(),actor(),[{amount:20,type:'fire'}],{attackSpell:true,reflectionRoll:61},()=>{throw Error('No attack roll');});
  assert.equal(r.event.amount,0);assert.equal(r.reactor.sourceReflectionTurn,0);
  assert.throws(()=>reflectedSpell(r.reactor,actor(),[{amount:20,type:'fire'}],{attackSpell:true,reflectionRoll:60}));
  assert.throws(()=>reflectedSpell(mirror(),actor(),[{amount:20,type:'fire'}],{attackSpell:false}));
  assert.throws(()=>reflectedSpell(mirror(),actor(),[{amount:20,type:'invalid'}],{attackSpell:true,reflectionRoll:61}));
});

function pendingRay() {
  const pc=actor({hp:1,spellcasting:{slots:{'1':1},spells:{'1':['Ray']}}});
  return act(fight(mirror({hp:5}),pc),'cast',{actor:'player',target:'enemy0',spell:'Ray',level:1});
}
const ray = {kind:'damage',target:'enemy0',amount:10,type:'fire',magical:true,isAttack:true,reason:'Ray'};

test('reflection resolves atomically on a fatal incoming hit and mutual defeat is a loss',()=>{
  const original=pendingRay();
  const f=act(original,'resolveCast',{actor:'player',results:[ray],note:'Ray',attackSpell:true,
    reflectionRoll:60,spellAttackBonus:5,reflectedAttackDice:[10]});
  assert.equal(f.groups[0].hp,0);assert.equal(f.player.hp,0);assert.equal(f.status,'loss');
  assert.equal(f.player.spellSlots['1'],0);assert.equal(f.player.pendingCast,undefined);
  assert.equal(original.groups[0].hp,5);assert.ok(original.player.pendingCast);
  assert.equal(f.events.at(-1).effects.at(-1).kind,'reflectSpell');
});

test('invalid reflection data cannot commit incoming damage or lose the pending cast',()=>{
  const original=pendingRay(),before=structuredClone(original);
  assert.throws(()=>act(original,'resolveCast',{actor:'player',results:[ray],note:'Ray',attackSpell:true,
    reflectionRoll:60,spellAttackBonus:NaN,reflectedAttackDice:[10]}));
  assert.deepEqual(original,before);
});

test('save-based spells do not trigger reflection',()=>{
  const original=pendingRay();
  const f=act(original,'resolveCast',{actor:'player',results:[ray],note:'Save-based spell',attackSpell:false});
  assert.equal(f.status,'win');assert.equal(f.player.hp,1);
  assert.equal(f.groups[0].sourceReflectionTurn,undefined);
});

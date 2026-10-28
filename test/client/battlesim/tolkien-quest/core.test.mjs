import test from 'node:test';
import assert from 'node:assert/strict';
import {attackResult,character,beginFight,round,missileRound,approach,openingAction,resolveCalm,modifiers,step,applyLuck,acceptNumbers,luckAvailable} from '../../../../public/js/battlesim/engines/tolkien-quest/core.js';
const hero=extra=>character({endurance:30,...extra});
const enemy=extra=>({name:'Custom foe',ob:0,db:0,endurance:20,kind:'normal',...extra});
const rolls=(...values)=>()=>{assert.ok(values.length,'unexpected roll');return values.shift();};
const melee=(h={},e={},opts={})=>beginFight(hero(h),[enemy(e)],opts);
const advanced=(h={},e={},opts={})=>melee(h,e,{mode:'advanced',...opts});
const engage=f=>approach(missileRound(f,'skip',rolls(2)),false);

test('original table breakpoints, excess OB and lower clamp are preserved',()=>{
  for(const [raw,ob,db,result]of [[2,0,0,0],[3,5,0,2],[7,0,0,3],[7,0,3,1],[8,0,3,2],[10,0,0,7],[11,0,0,'U'],[12,0,0,'K'],[12,0,4,'U'],[12,0,100,'U'],[2,6,0,2],[11,6,0,'K']])assert.equal(attackResult({raw,ob,db}).result,result);
  assert.equal(attackResult({raw:2,ob:99,db:0,unmodifiedTwo:true}).damage,0);
});
test('optional formula distinguishes no damage, unconsciousness and death',()=>{
  for(const [raw,ob,expected]of [[2,100,0],[12,-4,'U'],[10,3,'U'],[10,5,'K']])assert.equal(attackResult({raw,ob,db:0,formula:true}).result,expected);
  assert.equal(attackResult({raw:8,ob:0,db:0,damageBonus:-3,doubleDamage:true}).damage,2);
  assert.equal(attackResult({raw:2,ob:0,db:0,damageBonus:3,doubleDamage:true}).damage,0);
});
test('equal endurance stays conscious and terminal results stop retaliation',()=>{
  let f=melee({endurance:4},{endurance:4});f=round(f,'attack',rolls(8,8));assert.equal(f.status,'active');assert.equal(f.hero.damage,4);assert.equal(f.enemies[0].damage,4);
  f=round(f,'attack',rolls(8));assert.equal(f.status,'win');assert.equal(f.hero.damage,4);
  const surprised=round(melee({}, {},{surprised:true}),'attack',rolls(12));assert.equal(surprised.status,'loss');assert.deepEqual(surprised.events.map(e=>e.who),['enemy']);
});
test('groups are sequential and engine actions preserve input snapshots',()=>{
  const f=beginFight(hero(),[enemy({endurance:1}),enemy({endurance:1})]);const saved=JSON.stringify(f);let n=round(f,'attack',rolls(8));assert.equal(n.index,1);assert.equal(n.hero.damage,0);assert.equal(n.status,'active');assert.equal(JSON.stringify(f),saved);n=round(n,'attack',rolls(8));assert.equal(n.status,'win');
});
test('random variants and no-fight results do not become multi-foe combats',()=>{
  const options={rules:{groupMode:'random-variant',selectionRanges:[[2,3],[4,7],[8,11]],noFightRoll:12}};
  const enemies=[enemy({name:'First'}),enemy({name:'Second'}),enemy({name:'Third'})];
  const selected=beginFight(hero(),enemies,options,rolls(4));assert.equal(selected.enemies.length,1);assert.equal(selected.enemies[0].name,'Second');assert.equal(beginFight(hero(),enemies,options,rolls(12)).status,'avoided');
});
test('escape follows the enemy attack and applies source penalties and thresholds',()=>{
  let f=melee({}, {},{rules:{escapeBonus:-2}});f=round(f,'escape',rolls(8,9));assert.equal(f.hero.damage,4);assert.equal(f.status,'active');f=round(f,'escape',rolls(2,10));assert.equal(f.status,'escaped');
  assert.equal(round(melee({endurance:1}),'escape',rolls(12)).status,'loss');
  const locked=melee({}, {},{rules:{escapeBlockedUntilEnemiesDefeated:1}});assert.throws(()=>round(locked,'escape',rolls()),/first opponent/);
});
test('advanced range, repeated bow shots and surprise use the printed phases',()=>{
  let f=advanced({missile:'bow'},{missileOb:0});f=missileRound(f,'shoot',rolls(7,7));assert.equal(f.hero.damage,3);assert.equal(f.enemies[0].damage,3);assert.equal(f.stage,'approach');f=approach(f,true,rolls(10));assert.equal(f.stage,'missile');assert.equal(f.missileAvailable,true);
  f=advanced({}, {},{surprised:true});assert.equal(f.stage,'melee');for(let i=0;i<2;i++){f=round(f,'attack',rolls(2,2));assert.deepEqual(f.events.map(e=>e.who),['enemy','player']);}
  assert.throws(()=>approach(advanced({}, {},{rules:{escapeBlockedUntilEnemiesDefeated:1},surprised:false}),true,rolls()),/closing range/);
});
test('thrown weapons cannot be reused in melee and basic ignores gear modifiers',()=>{
  let f=advanced({weapon:'spear',missile:'spear'});f=missileRound(f,'shoot',rolls(2));assert.equal(f.hero.weapon,'unarmed');assert.equal(f.missileAvailable,false);f=approach(f,true,rolls(12));assert.throws(()=>missileRound(f,'shoot',rolls()),/missile weapon/);
  assert.equal(round(melee({weapon:'sword',armour:'plate',shield:true}),'attack',rolls(7,2)).enemies[0].damage,3);
  const gear=engage(advanced({weapon:'sword',armour:'plate',shield:true}));assert.equal(modifiers(gear).db,4);assert.equal(modifiers(gear).running,-3);assert.equal(round(gear,'attack',rolls(7,2)).enemies[0].damage,4);
  assert.equal(modifiers(advanced({weapon:'axe',shield:true})).db,0);
});
test('mace armour bonus and first-melee bonus survive an opening missile',()=>{
  assert.equal(round(engage(advanced({weapon:'mace'},{armour:'chain'})),'attack',rolls(7,2)).enemies[0].damage,5);
  assert.equal(round(engage(advanced({weapon:'mace'})),'attack',rolls(7,2)).enemies[0].damage,3);
  let f=advanced({weapon:'none',missile:'bow'}, {},{rules:{firstPlayerAttackObBonus:2}});f=approach(missileRound(f,'shoot',rolls(2)),false);assert.equal(round(f,'attack',rolls(7,2)).enemies[0].damage,5);
});
test('spells cost strain only after success and cannot act after unconsciousness',()=>{
  let f=advanced({spells:['firebolt']});f=missileRound(f,'firebolt',rolls(6));assert.equal(f.hero.damage,0);assert.equal(f.enemies[0].damage,0);
  f=missileRound(advanced({spells:['firebolt'],endurance:5}),'firebolt',rolls(7));assert.equal(f.status,'loss');assert.equal(f.enemies[0].damage,0);
  f=missileRound(advanced({spells:['firebolt'],magic:-2,deviceCharges:1}),'firebolt',rolls(9,2,2));assert.equal(f.hero.damage,0);assert.equal(f.hero.deviceCharges,0);assert.equal(f.enemies[0].damage,0);
  assert.throws(()=>missileRound(advanced(),'firebolt',rolls()),/not learned/);
});
test('Shield and Strength have opening restrictions and Speed assists escape',()=>{
  let f=missileRound(advanced({spells:['shield']}),'shield',rolls(7));assert.equal(f.effects.shield,true);assert.equal(f.hero.damage,4);assert.equal(modifiers(f).db,2);
  assert.throws(()=>missileRound(advanced({spells:['shield'],shield:true}),'shield',rolls()),/Normal shield/);
  f=approach(missileRound(advanced({spells:['strength'],weapon:'sword'}),'strength',rolls(7)),false);assert.equal(round(f,'attack',rolls(7,2)).enemies[0].damage,8);
  f=engage(advanced({spells:['speed']}));f=round(f,'escape',rolls(2,7,6),{speed:true});assert.equal(f.status,'escaped');assert.equal(f.hero.damage,3);
});
test('source action checks preserve the optional raw-two rule and thresholds',()=>{
  assert.equal(openingAction(hero({trickery:100}),'steal',{unmodifiedTwo:true},rolls(2)).success,false);
  assert.equal(openingAction(hero(),'steal',{},rolls(8)).surprised,true);
  assert.equal(openingAction(hero({trickery:2}),'sneakAttack',{},rolls(6)).firstAttackObBonus,2);
  assert.equal(openingAction(hero({running:1}),'escape',{},rolls(7)).success,true);
});
test('Calm pauses for manual source interpretation and rejects undead or groups',()=>{
  let f=missileRound(advanced({spells:['calm']},{missileOb:0}),'calm',rolls(7,8));assert.equal(f.manualEffect,'calm');assert.equal(f.hero.damage,5);assert.throws(()=>approach(f,false),/closing range/);assert.equal(resolveCalm(f,true).status,'calmed');assert.equal(resolveCalm(f,false,rolls(8)).hero.damage,9);
  for(const target of [{kind:'undead'},{combinedCount:6}])assert.throws(()=>missileRound(advanced({spells:['calm']},target),'calm',rolls()),/one normal/);
});
test('a charmed animal fights once and its defeat does not kill the player',()=>{
  const charmed=missileRound(advanced({spells:['charm']},{kind:'animal',endurance:5}),'charm',rolls(7));assert.equal(charmed.status,'charmed');assert.equal(charmed.hero.charmedAnimal.endurance,5);
  let f=beginFight(charmed.hero,[enemy({endurance:50})],{mode:'advanced',useAlly:true});assert.equal(f.stage,'melee');assert.equal(f.hero.charmedAnimal,undefined);f=round(f,'attack',rolls(2,12));assert.equal(f.status,'active');assert.equal(f.allyActive,false);assert.equal(f.hero.damage,6);assert.equal(charmed.hero.charmedAnimal.endurance,5);
  assert.throws(()=>missileRound(advanced({spells:['charm']},{kind:'animal',combinedCount:12}),'charm',rolls()),/one normal/);
});
test('invalid setup and terminal fights cannot mutate or start another action',()=>{
  assert.throws(()=>melee({damage:31}),/unconscious/);assert.throws(()=>melee({}, {endurance:0}));assert.throws(()=>character({ob:NaN}));assert.throws(()=>attackResult({raw:13,ob:0,db:0}));assert.throws(()=>round({...melee(),status:'win'},'attack',rolls()));
});

test('thrown weapon damage, recovery and optional Basic equipment follow source rules',()=>{
  let f=advanced({weapon:'axe',missile:'axe',missileOb:4},{endurance:100});f=missileRound(f,'shoot',rolls(7));assert.equal(f.enemies[0].damage,5);assert.equal(f.hero.weapon,'unarmed');assert.equal(f.hero.missile,'none');
  f=missileRound(advanced({weapon:'sword',missile:'sword',missileOb:3},{endurance:1}),'shoot',rolls(8));assert.equal(f.status,'win');assert.equal(f.hero.weapon,'sword');assert.equal(f.hero.missile,'sword');
  f=round(melee({weapon:'sword',armour:'plate'}, {},{equipmentModifiers:true}),'attack',rolls(7,2));assert.equal(f.enemies[0].damage,4);assert.equal(modifiers(f).db,3);assert.equal(f.stage,'melee');
  f=missileRound(advanced({weapon:'sword',missile:'sword',missileOb:3,orcSlayer:true},{kind:'orc',endurance:100}),'shoot',rolls(7));assert.equal(f.status,'win');
});

test('Luck changes only the chosen picked number and charges strain at that point',()=>{
  const original=step(advanced({missile:'bow',spells:['luck']},{endurance:50,missileOb:0}),'shoot',rolls(2,8));
  const saved=JSON.stringify(original),requested=[];
  const rerolled=applyLuck(original,0,role=>{requested.push(role);return role==='spell'?7:8;});
  assert.deepEqual(requested,['spell','replacement']);assert.equal(rerolled.enemies[0].damage,4);assert.equal(rerolled.hero.damage,9);assert.equal(JSON.stringify(original),saved);assert.equal(luckAvailable(rerolled),false);assert.throws(()=>applyLuck(rerolled,0,rolls()),/pending/);
});
test('Luck can replace a terminal enemy roll before it takes effect',()=>{
  const original=step(advanced({missile:'bow',spells:['luck']},{endurance:50,missileOb:0}),'shoot',rolls(8,12));assert.equal(original.status,'loss');
  const rerolled=applyLuck(original,1,rolls(7,2));assert.equal(rerolled.status,'active');assert.equal(rerolled.hero.damage,5);assert.equal(rerolled.enemies[0].damage,4);
  const accepted=acceptNumbers(original);assert.equal(accepted.status,'loss');assert.equal(luckAvailable(accepted),false);
});
test('failed Luck costs nothing, new consequences get fresh rolls, and strain can end combat',()=>{
  const original=step(advanced({missile:'bow',spells:['luck']},{endurance:50,missileOb:0}),'shoot',rolls(12));
  assert.equal(applyLuck(original,0,rolls(6)).status,'win');assert.equal(applyLuck(original,0,rolls(6)).hero.damage,0);
  const changed=applyLuck(original,0,rolls(7,2,8));assert.equal(changed.status,'active');assert.equal(changed.hero.damage,9);
  const fragile=step(advanced({missile:'bow',spells:['luck'],endurance:4}),'shoot',rolls(2));const lost=applyLuck(fragile,0,rolls(7));assert.equal(lost.status,'loss');assert.equal(lost.enemies[0].damage,0);
});
test('Luck respects missile-only spell timing, one spell per opportunity and free charges',()=>{
  assert.equal(luckAvailable(step(melee({spells:['luck']}),'attack',rolls(2,2))),false);
  assert.equal(luckAvailable(step(advanced({spells:['luck','firebolt']}),'firebolt',rolls(7,2,2))),false);
  const free=step(advanced({missile:'bow',spells:['luck'],deviceCharges:1}),'shoot',rolls(2));const f=applyLuck(free,0,rolls(7,8));assert.equal(f.hero.damage,0);assert.equal(f.hero.deviceCharges,0);
  assert.throws(()=>applyLuck(free,2,rolls()),RangeError);
});

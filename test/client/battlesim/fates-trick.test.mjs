import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {definition} from '../../../public/js/battlesim/books/1303/definition.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';

const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1303.json','utf8'));
const entries=roster.enemies.filter(row=>row.stats.slot===0).map(row=>row.stats.entry);
const entry=key=>entries.find(row=>row.section===String(key));
const start=(key,hero={},weapon={dice:1,add:0})=>startCrossroadsFight({...definition.defaultHero,...hero},entry(key).enemies,entry(key).rules,weapon);
function step(fight,values,options={}){
  let used=0;
  const next=crossroadsRound(fight,{...options,roll(){assert.ok(used<values.length,'unexpected die');return values[used++];}});
  assert.equal(used,values.length,'unused dice');return next;
}

test('Fate’s Trick uses the printed Alex record and fifteen DB-backed source sequences',()=>{
  assert.equal(entries.length,15);assert.equal(roster.enemies.length,19);
  assert.deepEqual(definition.defaultHero,{strength:13,intelligence:15,wisdom:12,constitution:11,dexterity:15,charisma:11,hp:16,maxHp:16,attackBonus:0,defenceBonus:0});
  for(const row of entries){assert.ok(row.printedRules.length);assert.ok(row.sourcePages.length);}
  for(const key of ['71','78','79','84','86','97','102'])assert.ok(entry(key).enemies.every(enemy=>enemy.hp===null));
});

test('alligator hero wounds end the turn before a counterattack and preserve accumulated wounds',()=>{
  const original=start(21);
  let fight=step(original,[3,3,3,2]);
  assert.equal(fight.status,'active');assert.equal(fight.destination,'22');assert.equal(fight.enemies[0].hp,6);assert.equal(fight.hero.hp,16);
  fight=step(JSON.parse(JSON.stringify(fight)),[3,3,3,2]);
  assert.equal(fight.status,'win');assert.equal(fight.destination,'37');assert.equal(fight.enemies[0].hp,4);
  assert.equal(original.enemies[0].hp,8);
});

test('alligator wounds route36 while zero hero HP routes29 without resetting the fight',()=>{
  let fight=step(start(21),[1,1,1,3,3,3,4]);
  assert.equal(fight.destination,'36');assert.equal(fight.status,'active');assert.equal(fight.hero.hp,12);
  fight=step(fight,[1,1,1,6,6,6,6]);assert.equal(fight.hero.hp,6);
  fight=step(fight,[1,1,1,6,6,6,6]);assert.equal(fight.destination,'29');assert.equal(fight.status,'loss');
});

test('Horned Ghost hit branches use the Dexterity check before another enemy attack',()=>{
  let fight=step(start(32),[3,3,3,2,6,6,6]);
  assert.equal(fight.status,'active');assert.equal(fight.hero.hp,16);assert.equal(fight.enemies[0].hp,10);
  fight=step(fight,[3,3,3,1,1,1,1]);assert.equal(fight.status,'win');assert.equal(fight.destination,'33');
  const low=start(32);low.enemies[0].hp=1;
  assert.equal(step(low,[3,3,3,1,6,6,6]).destination,'40');
});

test('Horned Ghost dodge distinguishes low roll, reduced damage and full two-die damage',()=>{
  let fight=step(start(32),[1,1,1,3,3,3,1,1,1]);
  assert.equal(fight.hero.hp,16);assert.equal(fight.encounter.nextDexterityBonus,1);
  fight=step(fight,[3,3,3,1,6,5,5]);assert.equal(fight.destination,'33');assert.equal(fight.hero.dexterity,15);
  const reduced=step(start(32),[1,1,1,3,3,3,3,3,3,4]);assert.equal(reduced.hero.hp,12);
  const full=step(start(32),[1,1,1,3,3,3,6,6,6,5,4]);assert.equal(full.hero.hp,9);
});

test('entry bonuses affect their printed roll once without changing saved character abilities',()=>{
  const ghost=entry(32),rules=structuredClone(ghost.rules);
  rules.mechanics.heroAttackBonus=ghost.weapons[0].attackBonus;
  const fight=startCrossroadsFight(definition.defaultHero,ghost.enemies,rules);
  assert.equal(step(fight,[3,3,2,1,1,1,1]).destination,'33');
  const lightning=entry(71),boosted=structuredClone(lightning.rules);
  Object.assign(boosted.mechanics.sequence,lightning.weapons[1].sequenceOverrides);
  const dodged=step(startCrossroadsFight(definition.defaultHero,lightning.enemies,boosted),[3,3,3,6,5,5]);
  assert.equal(dodged.hero.hp,16);assert.equal(dodged.hero.dexterity,15);assert.equal(dodged.encounter.misses,1);
});

test('solo dragon low roll exits64, ordinary kill65 and three rounds route61',()=>{
  assert.equal(step(start(52),[1,1,1]).destination,'64');
  const low=start(52);low.enemies[0].hp=1;
  assert.equal(step(low,[6,6,6,1]).destination,'65');
  let fight=start(52);
  for(let i=0;i<3;i++)fight=step(fight,[3,3,3,1,1,1]);
  assert.equal(fight.status,'draw');assert.equal(fight.destination,'61');assert.equal(fight.hero.hp,16);
});

test('entry54 has a separate enemy opening then simultaneous rounds including a slain dragon’s attack',()=>{
  let fight=step(start('52-54'),[4,4,4,2]);
  assert.equal(fight.round,0);assert.equal(fight.hero.hp,14);assert.equal(fight.encounter.openingPending,false);
  fight.enemies[0].hp=1;
  fight=step(fight,[6,6,6,1,4,4,4,3]);
  assert.equal(fight.status,'win');assert.equal(fight.hero.hp,11);assert.equal(fight.round,1);
  const dead=step(start('52-54',{hp:1}),[4,4,4,2]);assert.equal(dead.destination,'29');assert.equal(dead.round,0);
});

test('the knight party permits independent shared targets and preserves simultaneous attacks',()=>{
  let fight=start(69,{}, {dice:0,add:7});
  fight=step(fight,[6,6,6,6,6,6,6,6,6,1,1,1,1,3,1,1,1,5,1,1,1],{target:0,allyTargets:[1,2]});
  assert.equal(fight.status,'win');assert.equal(fight.destination,'75');assert.deepEqual(encounterTargets(fight),[]);
  assert.equal(fight.events.filter(event=>event.side==='enemy').length,3);
  assert.equal(fight.events.filter(event=>event.kind==='targetRoll').length,3);
  const original=start(69);
  const shared=step(original,[1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,1,1,5,1,1,1],{target:0,allyTargets:[0,0]});
  assert.equal(shared.status,'active');assert.deepEqual(shared.encounter.allies.map(ally=>ally.hits),[0,0]);
});

test('party ally hit counters use no invented HP and survive serialization',()=>{
  let fight=start(69);
  const misses=[1,1,1,1,1,1,1,1,1];
  fight=step(fight,[...misses,3,3,3,3,1,1,1,1,1,1,1,1]);
  assert.equal(fight.encounter.allies[0].hits,1);assert.equal(fight.status,'active');
  fight=step(JSON.parse(JSON.stringify(fight)),[...misses,3,3,3,3,1,1,1,1,1,1,1,1]);
  assert.equal(fight.destination,'73');assert.equal(fight.hero.hp,16);
  const tam=step(start(69),[...misses,5,3,3,3,1,1,1,1,1,1,1,1]);assert.equal(tam.destination,'68');
});

test('dragon with allies uses their own hit thresholds and attacks Alex exclusively',()=>{
  const fight=step(start(70),[4,4,4,1,4,4,4,4,4,4,1,4,4,4,2]);
  assert.equal(fight.enemies[0].hp,9);assert.equal(fight.hero.hp,14);
  assert.deepEqual(fight.encounter.allies.map(ally=>ally.hits),[0,0]);
});

test('lightning counts two total misses with an intervening hit and successful dodges',()=>{
  let fight=step(start(71),[1,1,1]);assert.equal(fight.encounter.misses,1);
  fight=step(fight,[3,3,3,6,6,6,2,3]);assert.equal(fight.hero.hp,11);assert.equal(fight.encounter.misses,1);
  fight=step(fight,[3,3,3,1,1,1]);assert.equal(fight.destination,'63');assert.equal(fight.status,'win');
});

test('eel sword ends on a zero-damage hero hit or any enemy hit even when fatal',()=>{
  const harmless=start(77);harmless.weaponDamage={dice:0,add:0};
  assert.equal(step(harmless,[4,4,4]).destination,'80');
  assert.equal(step(start(77,{hp:1}),[1,1,1,4,4,4,1]).destination,'81');
});

test('ray shots use roll-under ten without invented HP or damage, and the explicit second-round84 route',()=>{
  for(const key of [78,79,84,97]){
    assert.equal(step(start(key),[3,3,4]).status,'win');
    assert.equal(start(key).enemies[0].hp,null);assert.equal(start(key).weaponDamage,null);
  }
  let eel=step(start(79),[4,4,4]);assert.equal(eel.status,'active');eel=step(eel,[4,4,4]);assert.equal(eel.destination,'81');
  let william=step(start(84),[4,4,4]);william=step(william,[4,4,4]);assert.equal(william.destination,'97');
  assert.equal(step(start(97),[4,4,4]).destination,'102');
});

test('arriving guards attack after missed shots but the third-shot route stops further attacks',()=>{
  let fight=step(start(86),[4,4,4,3,3,3,1]);assert.equal(fight.hero.hp,14);
  fight=step(fight,[4,4,4,3,3,3,1,3,3,3,1]);assert.equal(fight.hero.hp,10);
  fight=step(fight,[4,4,4]);assert.equal(fight.destination,'97');assert.equal(fight.hero.hp,10);
  assert.equal(step(start(86),[3,3,4]).destination,'99');
});

test('section102 knight always attacks before the shot and stops it on fatal damage',()=>{
  const dead=step(start(102,{hp:1}),[3,3,3,1]);assert.equal(dead.destination,'29');
  let fight=step(start(102),[3,3,3,1,4,4,4]);assert.equal(fight.status,'active');assert.equal(fight.hero.hp,14);
  fight=step(fight,[1,1,1,3,3,4]);assert.equal(fight.destination,'99');
});

test('invalid sequence actions are atomic and shared state writes only the simulator slot',()=>{
  const original=start(69),copy=structuredClone(original);
  assert.throws(()=>step(original,[],{target:99}),RangeError);assert.deepEqual(original,copy);
  assert.throws(()=>step(original,[],{healing:1}),RangeError);assert.deepEqual(original,copy);
  const run={inventory:[{name:'keepsake'}],equipment:{hand:'shared'},otherSim:{history:[1]}};
  const preserved=structuredClone(run);let saves=0;
  const state=createCrossroadsState(definition,()=>({getBookId:()=>1303,getRun:()=>run,saveState:()=>saves++}));
  state.change(data=>{data.character=structuredClone(definition.defaultHero);data.fight=step(start(97),[3,3,4]);data.encounterName='William';});
  assert.equal(saves,1);assert.equal(run.sim1303.history.length,1);
  assert.deepEqual(run.inventory,preserved.inventory);assert.deepEqual(run.equipment,preserved.equipment);assert.deepEqual(run.otherSim,preserved.otherSim);
});

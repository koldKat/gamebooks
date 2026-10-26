import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound,settleDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat,destinyStrike,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:20,magic:2,armour:3,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Erkil sets Armour to exactly 28 at round five and clears earlier armour debuffs',()=>{
  let f=fight(379);addDestinyStatEffect(f,0,'armour',-2,null,'rust');
  for(let round=1;round<=4;round++){
    f=win(startDestinyRound(f,0));assert.equal(destinyStat(f,0,'armour'),8);
    assert.throws(()=>useLegionAction(f,'chip-away',{roster}),/not available/);
    f=score(f);f=endDestinyRound(f);
  }
  f=startDestinyRound(JSON.parse(JSON.stringify(f)),0);
  assert.equal(f.round,5);assert.equal(destinyStat(f,0,'armour'),28);
  assert.equal(destinyStrike(f,0,7,'monkey-mob','passive'),0);
  f=win(f);const hp=f.hero.health,enemyHp=f.opponents[0].health;
  f=useLegionAction(f,'chip-away',{roster});
  assert.equal(f.phase,'end');assert.equal(f.hero.health,hp-4);assert.equal(f.opponents[0].health,enemyHp);
  assert.equal(destinyStat(f,0,'armour'),24);
  f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,0,'armour'),24);
});

test('stone shards can defeat the hero and a zero-armour target cannot be chipped further',()=>{
  let f=fight(379);f.round=4;f=win(startDestinyRound(f,0));f.hero.health=4;
  f=useLegionAction(f,'chip-away',{roster});assert.equal(f.status,'loss');
  f=fight(379);f.round=4;f=win(startDestinyRound(f,0));
  addDestinyStatEffect(f,0,'armour',-28,null,'test');
  assert.throws(()=>useLegionAction(f,'chip-away',{roster}),/No armour/);
});

test('three separate pillars preserve null combat stats and winning damage can be redirected',()=>{
  let f=fight(392);assert.equal(f.opponents.length,4);
  for(const pillar of f.opponents.slice(1))assert.deepEqual([pillar.speed,pillar.brawn,pillar.magic,pillar.armour,pillar.health],[null,null,null,3,10]);
  f=retargetDestinyRound(win(startDestinyRound(f,0)),1);f=score(f);
  assert.equal(f.opponents[1].health,0);assert.equal(f.opponents[0].health,35);
  assert.equal(destinyStat(f,0,'armour'),8);assert.equal(f.hero.health,57);
  assert.equal(f.status,'active');
  settleDestinyFight(f);assert.equal(f.hero.health,57,'explosion only happens once');
});

test('Charged reflects score/dice Health damage only and Insulated prevents it',()=>{
  for(const abilities of [{},{insulated:1}]){
    let f=startDestinyRound(fight(392,{abilities}),0);const hp=f.hero.health;
    destinyStrike(f,0,1,'barbs','passive');assert.equal(f.hero.health,hp);
    destinyStrike(f,0,0,'test','dice');assert.equal(f.hero.health,hp);
    destinyStrike(f,0,1,'test','dice');assert.equal(f.hero.health,hp-(abilities.insulated?0:2));
    const before=f.hero.health;f=score(win(f));assert.equal(f.hero.health,before-(abilities.insulated?0:2));
  }
});

test('enchanted rock blocks only the printed abilities and intact pillars unlock section 188',()=>{
  let f=startDestinyRound(fight(392,{hero:{brawn:0,magic:0},abilities:{bleed:1,barbs:1,'fire-aura':1}}),0);
  f=endDestinyRound(score(win(f)));
  assert.equal(f.opponents[0].health,34,'Barbs is not a printed immunity');
  assert.equal(destinyStrike(f,0,6,'sear','dice'),0);
  assert.equal(destinyStrike(f,1,6,'thorn-cage','dice'),0);
  f.hero.brawn=100;f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'188');
  assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[9,9,9]);
});

test('destroying a pillar uses normal victory section and armour can absorb the whole explosion',()=>{
  let f=fight(392,{hero:{brawn:100,armour:7}});
  f=score(retargetDestinyRound(win(startDestinyRound(f,0)),2));assert.equal(f.hero.health,60);
  f=score(win(startDestinyRound(endDestinyRound(f),0)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'44');
});

test('Saw end roll damages the hero on one/two and soldiers on three through six',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(398,{abilities:{bleed:1}}),0)));
    assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
    f=endDestinyRound(f,[],rolls(face));assert.equal(f.phase,'ability-rolled');
    f=resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)),rolls(),{roster});
    f=endDestinyRound(f,[],rolls());
    assert.equal(f.hero.health,face<=2?54:58);
    assert.equal(f.opponents[1].health,face<=2?25:21);
    assert.equal(f.turn.lastHeroDamage?.[1],undefined,'workshop damage is not a hero attack');
  }
});

test('destroyed soldiers stop stabbing and further saw hits without winning before Saw falls',()=>{
  let f=score(win(startDestinyRound(fight(398),0)));f.opponents[1].health=4;
  f=endDestinyRound(f,[],rolls(3));f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  f=endDestinyRound(f,[],rolls());assert.equal(f.hero.health,60);assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');
  f=score(win(startDestinyRound(f,0)));f=endDestinyRound(f,[],rolls(6));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f,[],rolls());
  assert.equal(f.hero.health,60);assert.equal(f.status,'active');
});

test('Saw can be defeated with living soldiers, while winning scores can target soldiers first',()=>{
  let f=score(retargetDestinyRound(win(startDestinyRound(fight(398,{hero:{brawn:100}}),0)),1));
  assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');
  f=endDestinyRound(f,[],rolls(4));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f,[],rolls());
  f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'219');
  f=score(win(startDestinyRound(fight(398,{hero:{brawn:100}}),0)));
  assert.equal(f.status,'win');assert.equal(f.opponents[1].health,0);
});

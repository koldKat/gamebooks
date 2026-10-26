import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinyApproachTest,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {destinyStat,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:0,brawn:8,magic:0,armour:20,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const dodge=(f,...values)=>resolveDestinyAbilityRoll(rollDestinyApproachTest(f,rolls(...values)),rolls(),{roster});

test('Konga requires three consecutive dodges, a failed climb resets progress and ignores Armour',()=>{
  let f=startDestinyRound(fight(363),0);
  assert.deepEqual([f.opponents[0].speed,f.opponents[0].brawn,f.opponents[0].magic],[null,null,null]);
  assert.equal(f.phase,'encounter-start');assert.throws(()=>rollDestinySpeed(f),/stage/);
  f=dodge(f,3,4);f=dodge(f,6,1);assert.equal(f.encounter.approachSuccesses,2);
  f=dodge(clone(f),2,4);assert.equal(f.hero.health,26);assert.equal(f.encounter.approachSuccesses,0);assert.equal(f.round,1);
  for(let i=0;i<3;i++)f=dodge(f,4,3);
  assert.equal(f.phase,'damage');assert.equal(f.turn.winner,'hero');assert.deepEqual(f.turn.opponentSpeedDice,[]);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));assert.equal(f.opponents[0].health,23);
  f=startDestinyRound(endDestinyRound(f),0);
  assert.equal(f.round,2);assert.equal(f.encounter.approachSuccesses,0);assert.equal(f.phase,'encounter-start');
  assert.throws(()=>rollDestinyDamage(f),/stage/);
});

test('Konga uses hero Speed in the threshold, permits Charm and preserves pending dice through saves',()=>{
  let f=startDestinyRound(fight(363,{hero:{speed:2},abilities:{charm:1}}),0);
  f=rollDestinyApproachTest(f,rolls(1,2));
  f=useDestinyAbility(f,'charm',{die:0},rolls(3));
  assert.deepEqual(f.turn.pendingAbility.dice,[3,2]);
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
  assert.equal(f.encounter.approachSuccesses,1);assert.equal(f.hero.health,30);
  assert.throws(()=>useDestinyAbility(rollDestinyApproachTest(f,rolls(1,2)),'charm',{die:0},rolls(6)),/no uses left/);
});

test('boulder damage can defeat the hero, while a lethal attack ends the encounter at section 336',()=>{
  let f=startDestinyRound(fight(363,{hero:{health:4}}),0);f=dodge(f,1,2);assert.equal(f.status,'loss');
  f=startDestinyRound(fight(363,{hero:{brawn:100},abilities:{bleed:1}}),0);
  for(let i=0;i<3;i++)f=dodge(f,4,3);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'336');assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
});

test('Faith and Elysium suspend and resume a boulder roll without losing challenge progress',()=>{
  let f=startDestinyRound(fight(363,{hero:{health:10},abilities:{faith:1,'elysium-soaked':1}}),0);
  f=rollDestinyApproachTest(f,rolls(4,4,2));
  assert.equal(f.turn.pendingAbility.type,'automatic-modifier');assert.equal(f.hero.health,10);
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
  assert.equal(f.hero.health,12);assert.equal(f.turn.pendingAbility.event.kind,'approach-challenge');
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.encounter.approachSuccesses,1);
});

test('session approach action retains the owner character and can resume after serialization',()=>{
  let session={fight:startDestinyRound(fight(363),0)};
  session=applyDestinySessionAction(session,'approach-roll',{}, {roster,roll:rolls(3,4)});
  assert.equal(session.fight.phase,'ability-rolled');
  session=applyDestinySessionAction(clone(session),'resolve-ability',{}, {roster,roll:rolls()});
  assert.equal(session.fight.encounter.approachSuccesses,1);
});

const bellonaStart=(f,face)=>resolveDestinyAbilityRoll(startDestinyRound(f,0,rolls(face)),rolls(),{roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Bellona larvae accumulate on one through three, persist on other rolls and damage each round',()=>{
  let f=fight(307,{hero:{speed:20,brawn:0}});
  for(const [face,larvae] of [[3,1],[4,1],[1,2]]){
    f=bellonaStart(f,face);assert.equal(f.encounter.resources.larvae,larvae);
    const hp=f.hero.health;f=endDestinyRound(score(win(f)));assert.equal(f.hero.health,hp-larvae,'blocked score causes no reflected damage');
  }
});

test('Bellona reflects every actual Health hit including passive damage but no blocked score',()=>{
  let f=bellonaStart(fight(307,{hero:{speed:20,brawn:0},abilities:{barbs:1}}),6);
  f=score(win(f));assert.equal(f.hero.health,30);f=endDestinyRound(f);assert.equal(f.hero.health,29);
  assert.equal(f.opponents[0].health,39);
  destinyStrike(f,0,2,'test','fixed-ability');assert.equal(f.hero.health,28);
});

test('Bug blaster spends a declared source charge, replaces the score and never edits shared inventory',()=>{
  const character={items:['borehole charge'],equipment:{mainHand:{name:'Unchanged blade'}}};
  let f=win(bellonaStart(fight(307,{hero:{speed:20},character,encounterOptions:{boreholeCharges:1}}),6));
  const savedCharacter=clone(f.character);f=useLegionAction(f,'bug-blaster',{roster});
  assert.equal(f.encounter.resources.boreholeCharges,0);assert.equal(f.opponents[0].health,30);
  assert.equal(destinyStat(f,0,'armour'),1);assert.equal(f.hero.health,29);assert.equal(f.phase,'end');
  assert.deepEqual(f.character,savedCharacter);assert.deepEqual(character.items,['borehole charge']);
  f=win(bellonaStart(endDestinyRound(f),6));
  assert.throws(()=>useLegionAction(clone(f),'bug-blaster',{roster}),/No source consumables/);
  assert.throws(()=>fight(307,{encounterOptions:{boreholeCharges:-1}}),/Invalid source consumable/);
});

test('defeating Bellona clears remaining larvae, and reflection can still kill the hero',()=>{
  let f=win(bellonaStart(fight(307,{hero:{speed:20,brawn:100}}),1));
  f=score(f);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'381');assert.equal(f.encounter.resources.larvae,0);
  f=win(bellonaStart(fight(307,{hero:{speed:20,health:1},encounterOptions:{boreholeCharges:1}}),6));
  f=useLegionAction(f,'bug-blaster',{roster});assert.equal(f.status,'loss');
});

test('Fisher King requires an island choice before rolling and all six island outcomes map correctly',()=>{
  const initial=fight(408,{hero:{speed:20}});assert.throws(()=>startDestinyRound(initial,0,rolls()),/position/);
  assert.equal(initial.round,0);
  for(const [face,island] of [[1,'north'],[2,'north'],[3,'centre'],[4,'centre'],[5,'south'],[6,'south']]){
    let f=startDestinyRound(initial,0,rolls(face),{island});
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
    assert.equal(f.phase,'speed');assert.equal(f.encounter.opponentPosition,island);
    assert.equal(f.hero.health,30);assert.equal(win(f).phase,'damage');
  }
});

test('different islands lead to an editable Speed challenge then passives, without a normal attack',()=>{
  for(const [faces,speed,damage] of [[[6,6],1,6],[[6,6],2,0]]){
    let f=startDestinyRound(fight(408,{hero:{speed},abilities:{barbs:1}}),0,rolls(1),{island:'south'});
    f=resolveDestinyAbilityRoll(f,rolls(...faces),{roster});
    assert.equal(f.turn.pendingAbility.name,'Tongue lashing');
    assert.throws(()=>rollDestinySpeed(f),/stage/);
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(f.phase,'end');
    f=endDestinyRound(f);assert.equal(f.hero.health,30-damage);assert.equal(f.opponents[0].health,79);
  }
});

test('islands can be chosen anew each round and Fisher King victory routes to section 575',()=>{
  let f=startDestinyRound(fight(408,{hero:{speed:20,brawn:100}}),0,rolls(1),{island:'south'});
  f=resolveDestinyAbilityRoll(f,rolls(1,2),{roster});f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f);
  f=startDestinyRound(f,0,rolls(3),{island:'centre'});f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  f=score(win(f));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'575');
});

test('Bill Buckshot uses Speed with the 14/15 boundary and allows Armour against ten damage',()=>{
  for(const [speed,armour,damage] of [[2,3,7],[3,3,0],[2,20,0]]){
    let f=score(win(startDestinyRound(fight(466,{hero:{speed:30,brawn:0,armour}}),0)));
    f.hero.speed=speed;f=endDestinyRound(f,[],rolls(6,6));
    assert.equal(f.turn.pendingAbility.name,'Buckshot barrage');
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});f=endDestinyRound(f,[],rolls());
    assert.equal(f.hero.health,30-damage);
  }
});

test('pheromone replaces a winning score and only a freed rhinosaur causes recurring damage',()=>{
  for(const rhinosaurFreed of [true,false]){
    let f=win(startDestinyRound(fight(466,{hero:{speed:30,brawn:0},encounterOptions:{hasRhinosaurPheromone:true,rhinosaurFreed}}),0));
    f=useLegionAction(f,'animal-attraction',{roster});assert.equal(f.opponents[0].health,90);
    for(let round=1;round<=2;round++){
      f=endDestinyRound(f,[],rolls(1,2));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f,[],rolls());
      assert.equal(f.opponents[0].health,90-(rhinosaurFreed?round*4:0));
      f=win(startDestinyRound(f,0));assert.throws(()=>useLegionAction(f,'animal-attraction',{roster}),/already applied/);
      f=score(f);
    }
  }
  let f=win(startDestinyRound(fight(466,{hero:{speed:30}}),0));
  assert.throws(()=>useLegionAction(f,'animal-attraction',{roster}),/required source item/);
});

test('Strength in Numbers is disabled against Bill, whose win/loss routes remain distinct',()=>{
  let f=win(startDestinyRound(fight(466,{hero:{speed:30,brawn:100},abilities:{'strength-in-numbers':1}}),0));
  assert.throws(()=>useDestinyAbility(f,'strength-in-numbers'),/unavailable/);
  f=score(f);assert.equal(f.encounter.outcomeSection,'479');
  f=score(win(startDestinyRound(fight(466,{hero:{speed:30,brawn:0,health:1,armour:0}}),0)));
  f.hero.speed=0;f=endDestinyRound(f,[],rolls(1,2));f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  f=endDestinyRound(f,[],rolls());assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'664');
});

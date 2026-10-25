import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyAttackerTarget} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:100,maxHealth:100};
const placements={north:'slowing',east:'rending',west:'enfeeblement'};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options,encounterOptions:{rodPlacements:placements,...options.encounterOptions}});
const round=(f,target=0)=>startDestinyRound(f,target);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=(f,choice)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls(...(choice===undefined?[]:[choice])));
const hit=(f,...faces)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(...(faces.length?faces:[4]))));
const resume=f=>JSON.parse(JSON.stringify(f));

test('both opponents attack after a loss, with separate damage rolls and no second Speed roll',()=>{
  let f=hit(lose(round(make('717',{hero:{speed:0}}))));assert.equal(f.hero.health,88);
  f=endDestinyRound(resume(f));assert.equal(f.phase,'damage');assert.equal(f.round,1);assert.equal(destinyAttackerTarget(f),1);
  f=hit(f,2,5);assert.equal(f.turn.damageScore,14);assert.deepEqual(f.turn.damageDice,[2,5]);assert.equal(f.hero.health,74);
  f=endDestinyRound(f);assert.equal(f.phase,'start');assert.equal(f.round,1);
});

test('Frenzy ends with the packmasters and dead additional attackers are skipped',()=>{
  let f=make('717',{hero:{speed:0}});f.opponents[0].health=0;
  f=hit(lose(round(f,1)),4);assert.deepEqual(f.turn.damageDice,[4]);assert.equal(f.hero.health,87);
  f=hit(lose(round(make('717',{hero:{speed:0}}))));f.opponents[1].health=0;
  f=endDestinyRound(f);assert.equal(f.phase,'start');
});

test('avoiding the first group attack does not silently avoid the next attack',()=>{
  let f=lose(round(make('717',{hero:{speed:0},abilities:{dodge:1}})));
  f=hit(useDestinyAbility(f,'dodge'));assert.equal(f.hero.health,100);
  f=endDestinyRound(f);assert.equal(f.turn.used.co,true);assert.equal(f.turn.avoidDamage,undefined);
  f=hit(f,3,5);assert.equal(f.hero.health,86);
});

test('Ghoulash has distinct outcomes for destroying bracelets first or killing the creature first',()=>{
  let f=make('720',{hero:{brawn:100}});
  for(let target=1;target<=4;target++){
    f=hit(retargetDestinyRound(win(round(f)),target));
    if(target<4){assert.equal(f.status,'active');f=endDestinyRound(f);}
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'736');assert.equal(f.opponents[0].health,100);
  f=hit(win(round(make('720',{hero:{brawn:200}}))));assert.equal(f.encounter.outcomeSection,'702');
});

test('Silleer shock requires Health damage and rounds half of current Armour upward',()=>{
  let f=hit(lose(round(make('734',{hero:{speed:0,armour:5}}))));assert.equal(f.hero.health,85);
  f=hit(lose(round(make('734',{hero:{speed:0,armour:100}}))));assert.equal(f.hero.health,100);
});

test('fire sprites deal their own end damage and crumble when Magmageddon dies',()=>{
  let f=endDestinyRound(hit(win(round(make('738')))));assert.equal(f.hero.health,92);
  f=hit(win(round(make('738',{hero:{brawn:100}}))));assert.equal(f.status,'win');assert.ok(f.opponents.every(o=>o.health===0));
});

test('the doctor has three source-defined attacks and applies slowdowns to the next round only',()=>{
  for(const face of [1,3,5]){
    let f=lose(round(make('752',{hero:{speed:0}})),face);assert.equal(f.phase,'ability-rolled');
    f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});
    if(face===1){assert.equal(f.phase,'end');assert.equal(f.hero.health,100);}
    else{f=hit(f,...(face===5?[2,5]:[4]));assert.equal(f.hero.health,face===5?83:86);}
    f=round(endDestinyRound(f));
    assert.equal(destinyStat(f,face===1?0:'hero','speed'),face===1?14:0);
  }
});

test('late duelists use their printed dice and do not share optional Shadow Infusion',()=>{
  let f=make('746');assert.equal(destinyStat(f,0,'brawn'),12);
  f=make('746',{encounterOptions:{shadowInfusion:true}});assert.equal(destinyStat(f,0,'brawn'),14);
  f=rollDestinySpeed(round(f),rolls(6,5,2,2));assert.equal(f.hero.health,96);
  f=hit(lose(round(make('753',{hero:{speed:0}}))),2,5);assert.equal(f.turn.damageScore,20);
  assert.throws(()=>useDestinyAbility(make('753',{abilities:{evade:1}}),'evade'),/unavailable/);
});

test('Packmaster Whiplash responds to each raw Speed six',()=>{
  const f=rollDestinySpeed(round(make('756')),rolls(6,5,6,6));assert.equal(f.hero.health,96);
});

test('necromancers grow and restore their horde while alive, with no artificial Health cap',()=>{
  let f=make('768');f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[1].health,90);
  f.opponents[1].health=0;f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[1].health,10);
  f.opponents[0].health=0;f=endDestinyRound(hit(win(round(f,1))));assert.equal(f.opponents[1].health,10);
});

test('bone construct keeps one of two damage dice and the later Tor knight retains Dismantle',()=>{
  let f=hit(lose(round(make('772',{hero:{speed:0}}))),2,6);assert.equal(f.turn.damageScore,18);assert.equal(f.hero.health,86);
  f=endDestinyRound(f);assert.equal(f.hero.health,84);
  f=useLegionAction(win(round(make('773'))),'dismantle',{roster});assert.equal(destinyStat(f,0,'armour'),20);
});

test('boss-chain outcome recording carries actual Armour and restores the checkpoint on defeat',()=>{
  let s=beginDestinySession({character:{notes:'keep'}},{hero:{...hero,brawn:20,armour:8},section:'764'}, {roster,outcomeId:'horrors',createFight:createLegionFight});
  let f=hit(win(round(s.fight)));f=endDestinyRound(f,[],rolls(1));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f);
  assert.equal(destinyStat(f,'hero','armour'),7);f.opponents[0].health=1;f=hit(win(round(f)));
  s.fight=f;s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1,roll:rolls()});
  assert.equal(s.setup.hero.armour,7);assert.equal(s.character.attributes.armour,7);assert.equal(s.character.combatRecovery.armour,8);
  s=beginDestinySession(s,{hero:{...hero,speed:0,health:1,armour:7},section:'746'}, {roster,outcomeId:'snaide',createFight:createLegionFight});
  s.fight=hit(lose(round(s.fight)),6);assert.equal(s.fight.status,'loss');
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:2,roll:rolls()});
  assert.equal(s.setup.hero.armour,8);assert.equal(s.setup.hero.health,100);assert.equal(s.character.notes,'keep');
});

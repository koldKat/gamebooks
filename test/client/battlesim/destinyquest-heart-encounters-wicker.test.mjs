import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {createDestinyFight,settleDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {destinyStat,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select,destinyTeamHero as actor} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {startDestinyTeamRound,rollDestinyTeamSpeed,resolveDestinyTeamSpeed,rollDestinyTeamDamage,resolveDestinyTeamDamage,useDestinyTeamAbility,resolveDestinyTeamAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
import {endDestinyTeamRound} from '../../../public/js/battlesim/engines/destinyquest/team-end.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:80,maxHealth:80};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function team({first={},second={},abilities={},allyAbilities={}}={}){
  const f=createHeartFight({...hero,...first},163,{roster,abilities});
  const ally=configureDestinyAbilities(createDestinyFight({...hero,speed:10,...second},[{speed:1,brawn:1,armour:1,health:1}]),allyAbilities,{}, {catalog:HEART_ABILITIES,bookRules:{deathMoves:false,deathPenalties:false}});
  return enableDestinyTeam(attachDestinyAlly(f,ally));
}
const start=f=>startDestinyTeamRound(f,['attack','attack'],0);
const speed=(f,id,dice=[6,5,1,2])=>resolveDestinyTeamSpeed(rollDestinyTeamSpeed(f,id,rolls(...dice)),{actor:id});
const score=f=>resolveDestinyTeamDamage(rollDestinyTeamDamage(f,rolls(1)),rolls());

test('fastest hero fights Wicker Man and slowest fights the cage, with stable assignments after buffs',()=>{
  const original=team({first:{speed:5},second:{speed:30}}),before=JSON.parse(JSON.stringify(original));
  assert.throws(()=>startDestinyTeamRound(original,['support','attack'],0),/Each paired/);assert.deepEqual(original,before);
  let f=start(original);assert.equal(f.team.pairing.bossActor,1);assert.equal(f.team.pairing.prisonActor,0);
  assert.equal(select(f,0).target,1);assert.equal(select(f,1).target,0);
  f=score(speed(f,0));f=score(speed(f,1));f=endDestinyTeamRound(f);
  f.hero.speed=50;f=start(f);assert.equal(f.team.pairing.bossActor,1);
});

test('two separate Speed rolls and scores complete before one shared round of end effects',()=>{
  let f=start(team());f=rollDestinyTeamSpeed(f,0,rolls(6,5,6,6));f=rollDestinyTeamSpeed(f,1,rolls(6,5,1,1));
  assert.deepEqual(actor(f,0).turn.opponentSpeedDice,[6,6]);assert.deepEqual(actor(f,1).turn.opponentSpeedDice,[1,1]);
  f=resolveDestinyTeamSpeed(f,{actor:0});f=score(f);assert.equal(f.team.stage,'speed');assert.equal(f.team.active,1);
  assert.equal(actor(f,1).hero.health,80);
  assert.throws(()=>endDestinyTeamRound(select(f,0)),/Finish every independent/);
  f=resolveDestinyTeamSpeed(JSON.parse(JSON.stringify(f)),{actor:1});f=score(f);assert.equal(f.team.stage,'end');
  f=endDestinyTeamRound(f);assert.equal(f.round,1);assert.equal(actor(f,0).hero.health,80);assert.equal(actor(f,1).hero.health,76);
});

test('destroying the cage lowers Wicker stats once and joins the rescued hero to normal team combat',()=>{
  let f=start(team({second:{brawn:1000}}));f=score(speed(f,0));f=score(speed(f,1));
  assert.equal(f.opponents[1].health,0);assert.equal(f.team.pairing.freed,true);
  assert.deepEqual(['speed','brawn','armour'].map(a=>destinyStat(f,0,a)),[13,11,8]);
  settleDestinyFight(f);assert.deepEqual(['speed','brawn','armour'].map(a=>destinyStat(f,0,a)),[13,11,8]);
  f=endDestinyTeamRound(f);assert.equal(actor(f,1).hero.health,80,'no stings once the cage breaks');
  f=startDestinyTeamRound(f,['attack','support'],0);assert.equal(f.team.independentRound,undefined);
  f=rollDestinyTeamSpeed(f,0,rolls(6,5,1,2));f=resolveDestinyTeamSpeed(f);assert.equal(f.target,0);
});

test('captive defeat strengthens Wicker once while the other hero continues alone',()=>{
  let f=start(team({second:{speed:0,armour:0,health:1}}));f=score(speed(f,0));
  f=score(speed(f,1,[1,2,6,6]));assert.equal(actor(f,1).hero.health,0);assert.equal(f.status,'active');
  assert.deepEqual(['speed','brawn','armour'].map(a=>destinyStat(f,0,a)),[17,15,12]);
  f=endDestinyTeamRound(f);f=startDestinyTeamRound(f,['attack','fallen'],0);
  assert.equal(f.team.independentRound,undefined);assert.equal(f.status,'active');
  assert.deepEqual(['speed','brawn','armour'].map(a=>destinyStat(f,0,a)),[17,15,12]);
});

test('defeating Wicker wins immediately even with the cage intact',()=>{
  let f=start(team({first:{brawn:1000}}));f=score(speed(f,0));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'155');assert.equal(f.opponents[1].health,90);
  assert.deepEqual(f.team.winners,[0,1]);
});

test('Cleave hits both opponents and pending damage saves retain their caster and assigned target',()=>{
  let f=speed(start(team({abilities:{cleave:1}})),0);
  f=useDestinyTeamAbility(f,0,'cleave',{deferDamage:true},rolls(6));assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyTeamAbilityRoll(JSON.parse(JSON.stringify(f)),rolls(),{roster});
  assert.deepEqual(f.opponents.map(o=>o.health),[244,84]);assert.equal(f.team.active,1);assert.equal(f.target,1);
  f=score(speed(f,1));f=endDestinyTeamRound(f);assert.equal(actor(f,1).hero.health,76);
});

test('each hero passive may hit both opponents and both opponents retain their printed immunities',()=>{
  let f=start(team({abilities:{thorns:1,bleed:1},allyAbilities:{'fire-aura':1,disease:1}}));
  for(const target of [0,1])for(const name of ['bleed','disease','venom'])assert.equal(destinyStrike(f,target,2,name,'dice'),0);
  f=score(speed(f,0));f=score(speed(f,1));f=endDestinyTeamRound(f);
  assert.deepEqual(f.opponents.map(o=>o.health),[248,88]);
});

test('Defender takes the paired opponent hit and then retains its own unresolved attack',()=>{
  let f=start(team({first:{speed:1,armour:0},second:{speed:0,armour:0},allyAbilities:{defender:1}}));
  f=speed(f,0,[1,2,6,5]);assert.equal(f.turn.winner,'opponent');assert.equal(f.target,0);
  f=useDestinyTeamAbility(f,1,'defender');assert.equal(f.team.active,1);
  f=score(f);assert.equal(actor(f,0).hero.health,80);assert.equal(actor(f,1).hero.health,66,'Wicker Brawn applies, not cage Brawn');
  assert.equal(f.team.stage,'speed');assert.equal(f.team.active,1);assert.equal(f.target,1);assert.equal(f.used.defender,1);
  f=score(speed(f,1,[6,5,1,2]));assert.equal(f.team.stage,'end');
  f=endDestinyTeamRound(f);assert.equal(actor(f,1).hero.health,62);
});

test('a surviving captive keeps fighting the cage if the Wicker opponent defeats the faster hero',()=>{
  let f=start(team({first:{speed:1,health:1,armour:0},second:{speed:0,armour:20}}));
  f=score(speed(f,0,[1,2,6,5]));assert.equal(actor(f,0).hero.health,0);assert.equal(f.status,'active');
  f=score(speed(f,1));f=endDestinyTeamRound(f);
  f=startDestinyTeamRound(f,['fallen','attack'],1);assert.equal(f.team.independentRound.done.length,0);assert.equal(f.target,1);
});

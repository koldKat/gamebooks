import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {destinyStat,destinyStrike,addDestinyStatEffect,onDestinyOpponentHealthHit,cleanseDestinyStatuses} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {prepareDestinyDamage} from '../../../public/js/battlesim/engines/destinyquest/damage.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select,destinyTeamHero as actor} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {startDestinyTeamRound,rollDestinyTeamSpeed,resolveDestinyTeamSpeed,rollDestinyTeamDamage,resolveDestinyTeamDamage} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
import {endDestinyTeamRound} from '../../../public/js/battlesim/engines/destinyquest/team-end.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:80,maxHealth:80};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function team({first={},second={},abilities={},allyAbilities={}}={}){
  const f=createHeartFight({...hero,...first},662,{roster,abilities});
  const ally=configureDestinyAbilities(createDestinyFight({...hero,speed:10,...second},[{speed:1,brawn:1,armour:1,health:1}]),allyAbilities,{}, {catalog:HEART_ABILITIES,bookRules:{deathMoves:false,deathPenalties:false}});
  return enableDestinyTeam(attachDestinyAlly(f,ally));
}
const start=(f,shrine=1)=>startDestinyTeamRound(f,['attack','attack'],{0:0,1:shrine});
const speed=(f,win=true)=>resolveDestinyTeamSpeed(rollDestinyTeamSpeed(f,0,rolls(...(win?[6,5,1,2]:[1,2,6,5]))),{actor:0});
const score=f=>resolveDestinyTeamDamage(rollDestinyTeamDamage(f,rolls(1)),rolls());
const shrine=f=>score(resolveDestinyTeamSpeed(f,{actor:1},rolls()));

test('Issakhar retains absent Magic and shrines have no invented combat attributes',()=>{
  const f=team();assert.equal(f.opponents[0].magic,null);
  for(const shrine of f.opponents.slice(1))assert.deepEqual([shrine.speed,shrine.brawn,shrine.magic,shrine.armour,shrine.health],[null,null,null,7,30]);
});

test('one hero must attack Issakhar while the other shrine attack wins without rolling Speed',()=>{
  const f=team();assert.throws(()=>startDestinyTeamRound(f,['attack','attack'],{0:1,1:2}),/boss/);
  let n=start(f);assert.throws(()=>rollDestinyTeamSpeed(n,1,rolls()),/automatically/);
  n=score(speed(n));assert.equal(n.team.active,1);n=shrine(n);assert.equal(n.team.stage,'end');
  assert.equal(actor(n,1).turn.winner,'hero');assert.deepEqual(actor(n,1).turn.heroSpeedDice,[]);
  n=endDestinyTeamRound(n);assert.deepEqual([actor(n,0).hero.health,actor(n,1).hero.health],[75,75]);
});

test('Fire shrine activation stops Headstrong for both heroes immediately and Fire Shield protects only its owner',()=>{
  let f=start(team({abilities:{'fire-shield':1}}));f=endDestinyTeamRound(shrine(score(speed(f))));
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[80,75]);
  f=team({second:{brawn:1000}});f.opponents[1].health=1;
  f=endDestinyTeamRound(shrine(score(speed(start(f)))));assert.equal(f.opponents[1].health,0);
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[80,80]);
});

test('Water shrine heals each living hero at round end and does not exceed their own starting Health',()=>{
  let f=team({first:{health:20},second:{health:30,brawn:1000}});f.opponents[1].health=0;
  f=endDestinyTeamRound(shrine(score(speed(start(f,2)))));
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[22,32]);
  f=select(f,0);f.hero.health=79;f.allies[0].hero.health=80;f.allies[0].hero.brawn=0;
  f=endDestinyTeamRound(shrine(score(speed(start(f,3)))));
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[80,80]);
});

test('Air shrine selects the lowest current Speed, including prior modifiers, once',()=>{
  let f=start(team());addDestinyStatEffect(f,'hero','speed',-25,null,'test');
  destinyStrike(f,3,30,'test','dice');assert.equal(destinyStat(f,'hero','speed'),9);
  f=select(f,1);assert.equal(destinyStat(f,'hero','speed'),10);
  f=team({first:{speed:10},second:{speed:10}});f=start(f);f=select(f,1);destinyStrike(f,3,30,'test','dice');
  assert.equal(destinyStat(f,'hero','speed'),10);f=select(f,0);assert.equal(destinyStat(f,'hero','speed'),14);
});

test('Lightning shrine increases every score die for both heroes and never increases ability damage dice',()=>{
  let f=start(team({first:{brawn:20},second:{brawn:20}}));destinyStrike(f,4,30,'test','dice');
  f=score(speed(f));assert.equal(actor(f,0).turn.damageScore,22);
  f=shrine(f);assert.equal(actor(f,1).turn.damageScore,22);
  const hp=f.opponents[0].health;f=select(f,0);
  prepareDestinyDamage(f,'test',{hit:'one',dice:1},{target:0},rolls(4));assert.equal(f.opponents[0].health,hp-4);
});

test('Deadly Bite requires actual score damage, inflicts one combined three-damage status and never stacks',()=>{
  let f=start(team({first:{speed:0,armour:0}}));f=score(speed(f,false));
  assert.equal(actor(f,0).hero.health,67);assert.equal(actor(f,0).effects.filter(e=>e.kind==='combined-status').length,1);
  f=shrine(f);f=endDestinyTeamRound(f);assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[59,75]);
  f=select(f,0);onDestinyOpponentHealthHit(f,0,2,'score');assert.equal(f.effects.filter(e=>e.kind==='combined-status').length,1);
  const fresh=start(team());onDestinyOpponentHealthHit(fresh,0,0,'score');onDestinyOpponentHealthHit(fresh,0,2,'dice');
  assert.equal(fresh.effects.some(e=>e.kind==='combined-status'),false);
});

test('combined bite preserves its printed total under partial cleansing and ends when both statuses are removed',()=>{
  let f=start(team({abilities:{toxicology:1}}));onDestinyOpponentHealthHit(f,0,2,'score');
  assert.deepEqual(f.effects.find(e=>e.kind==='combined-status').statuses,['bleed']);
  f=score(speed(f));f=shrine(f);f=endDestinyTeamRound(f);assert.equal(actor(f,0).hero.health,72);
  f=select(f,0);cleanseDestinyStatuses(f,['bleed','venom']);assert.equal(f.effects.some(e=>e.kind==='combined-status'),false);
  onDestinyOpponentHealthHit(f,0,2,'score');cleanseDestinyStatuses(f,['venom']);assert.deepEqual(f.effects.find(e=>e.kind==='combined-status').statuses,['bleed']);
  cleanseDestinyStatuses(f,['bleed']);assert.equal(f.effects.some(e=>e.kind==='combined-status'),false);
});

test('shrines reject exactly the printed damage abilities and the boss can be defeated without activating shrines',()=>{
  let f=start(team({first:{brawn:1000}}));
  for(const target of [1,2,3,4])for(const name of ['barbs','bleed','disease','fire-aura','thorns','thorn-cage','venom'])assert.equal(destinyStrike(f,target,2,name,'dice'),0);
  assert.equal(destinyStrike(f,1,1,'lightning','dice'),1);
  f=score(speed(f));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'551');
  assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[29,30,30,30]);
});

test('two boss attackers use the normal shared contest, and one survivor cannot abandon Issakhar to attack a shrine',()=>{
  let dead=start(team());dead.allies[0].hero.health=0;
  assert.throws(()=>resolveDestinyTeamSpeed(dead,{actor:1}),/living paired attacker/);
  let f=team();f=startDestinyTeamRound(f,['attack','attack'],{0:0,1:0});assert.equal(f.team.independentRound,undefined);
  f=team();f.allies[0].hero.health=0;
  assert.throws(()=>startDestinyTeamRound(f,['attack','fallen'],{0:1}),/boss/);
  f=startDestinyTeamRound(f,['attack','fallen'],0);assert.equal(f.team.independentRound,undefined);
});

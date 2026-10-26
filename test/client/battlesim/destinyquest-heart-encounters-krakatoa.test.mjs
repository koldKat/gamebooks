import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {createDestinyFight,startDestinyRound,settleDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {destinyStat,destinyStrike,addDestinyStatEffect,onDestinyOpponentHealthHit} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select,destinyTeamHero as actor} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {startDestinyTeamRound,rollDestinyTeamSpeed,resolveDestinyTeamSpeed,rollDestinyTeamDamage,resolveDestinyTeamDamage,continueDestinyTeamCombat} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
import {endDestinyTeamRound} from '../../../public/js/battlesim/engines/destinyquest/team-end.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={name:'Primary',speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function team(section='610',{first={},second={},abilities={},allyAbilities={}}={}){
  const f=createHeartFight({...hero,...first},section,{roster,abilities});
  const ally=configureDestinyAbilities(createDestinyFight({...hero,name:'Ally',speed:28,...second},[{speed:1,brawn:1,armour:1,health:1}]),allyAbilities,{mainHand:{name:'Original ally sword',type:'sword'}},{catalog:LEGION_ABILITIES,bookRules:{deathMoves:false,deathPenalties:false}});
  return enableDestinyTeam(attachDestinyAlly(f,ally));
}
function speed(f,target=0,win=true){
  f=startDestinyTeamRound(f,['attack','attack'],target);
  f=rollDestinyTeamSpeed(f,0,rolls(...(win?[6,5,1,2]:[1,2,6,5])));
  f=rollDestinyTeamSpeed(f,1,rolls(...(win?[6,5]:[1,2])));
  return resolveDestinyTeamSpeed(f);
}
const score=f=>resolveDestinyTeamDamage(rollDestinyTeamDamage(f,rolls(1)),rolls());

test('Krakatoa requires a team and both heroes take current Magic damage at round end',()=>{
  const single=createHeartFight(hero,'610',{roster});assert.throws(()=>startDestinyRound(single,0),/team battle/);
  let f=endDestinyTeamRound(score(speed(team())));assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[55,55]);
  addDestinyStatEffect(f,0,'magic',-3,null,'disrupt');
  f=endDestinyTeamRound(score(speed(f)));assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[53,53]);
});

test('phase transition preserves both heroes Health, abilities, catalogs, equipment and quota',()=>{
  let f=team('610',{first:{brawn:1000},abilities:{hexed:1,heal:1},allyAbilities:{heal:1}});
  f.hero.health=23;f.used.heal=1;f.abilityQuota.used=['heal'];f.abilityQuota.everUsed=['heal'];f.allies[0].hero.health=17;f.allies[0].used.heal=1;
  const equipment=JSON.parse(JSON.stringify(f.allies[0].equipment));
  f=score(speed(f));assert.equal(f.phase,'between-combats');assert.equal(f.team.stage,'between-combats');assert.equal(f.status,'active');
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[23,17]);assert.equal(f.history.filter(e=>e.type==='outcome').length,0);
  f=continueDestinyTeamCombat(JSON.parse(JSON.stringify(f)));
  assert.equal(f.encounter.sourceSection,'793');assert.equal(f.round,0);assert.equal(f.target,1);assert.equal(f.team.stage,'start');
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[23,17]);
  assert.equal(actor(f,0).used.heal,1);assert.equal(actor(f,1).used.heal,1);
  assert.deepEqual(actor(f,0).abilityQuota.used,['heal']);assert.deepEqual(actor(f,1).equipment,equipment);
  assert.equal(actor(f,1).abilityCatalog.heal.category,LEGION_ABILITIES.heal.category);assert.deepEqual(f.encounter.inactiveTargets,[]);
  f=score(speed(f,1));assert.equal(f.status,'active','all three elementals must be destroyed');
  f=endDestinyTeamRound(f);f=score(speed(f,2));f=endDestinyTeamRound(f);f=score(speed(f,3));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'651');assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[60,60]);
});

test('session next-combat resets the inactive actor too when the ally wins phase one',()=>{
  let f=team('610',{second:{speed:40,brawn:1000}});f.hero.health=19;f.allies[0].hero.health=21;
  f=score(speed(f));assert.equal(f.team.active,1);assert.equal(f.phase,'between-combats');
  const s=applyDestinySessionAction(createDestinySession({fight:f,fightId:'phase'}),'next-combat');
  assert.equal(s.fight.team.active,0);assert.equal(actor(s.fight,0).phase,'start');assert.equal(actor(s.fight,1).phase,'start');
  assert.equal(actor(s.fight,0).turn,null);assert.equal(actor(s.fight,1).turn,null);
  assert.deepEqual([actor(s.fight,0).hero.health,actor(s.fight,1).hero.health],[19,21]);
});

test('the surviving ally enters phase two when passive damage kills Krakatoa and the primary hero together',()=>{
  let f=team('610',{first:{health:5},second:{health:20},abilities:{barbs:1}});f.opponents[0].health=1;
  f=endDestinyTeamRound(score(speed(f)));assert.equal(f.phase,'between-combats');assert.equal(f.status,'active');
  assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[0,15]);
  f=continueDestinyTeamCombat(f);assert.deepEqual([actor(f,0).hero.health,actor(f,1).hero.health],[0,15]);
  f=startDestinyTeamRound(f,['fallen','attack'],1);assert.equal(f.team.active,1);assert.equal(f.status,'active');
});

test('a failed second phase records Health recovery for both characters without changing historical fight Health',()=>{
  let f=team('793',{first:{health:7},second:{health:9}});
  const before=[actor(f,0).hero.health,actor(f,1).hero.health];
  let s=createDestinySession({fight:f,fightId:'failed-phase',setup:{hero},character:{gold:7}});
  s=applyDestinySessionAction(s,'concede');s=applyDestinySessionAction(s,'record-outcome',{}, {roll:rolls()});
  assert.equal(s.outcome.recorded,true);assert.equal(s.character.attributes.health,60);
  assert.equal(s.fight.allies[0].character.attributes.health,60);
  assert.deepEqual([actor(s.fight,0).hero.health,actor(s.fight,1).hero.health],before);
});

test('a score Health hit stuns its target for the next round but absorbed damage does not',()=>{
  for(const [armour,stunned] of [[20,false],[10,true]]){
    let f=score(speed(team('610',{first:{speed:0,armour},second:{speed:0,armour:0}}),0,false));
    // The fallback enemy target is the hero with greater Armour.
    assert.equal(f.team.stunnedUntil?.[0]===f.round+1,stunned);
    f=endDestinyTeamRound(f);
    if(stunned)assert.throws(()=>startDestinyTeamRound(f,['attack','attack'],0),/stunned/);
    f=startDestinyTeamRound(f,stunned?['support','attack']:['attack','attack'],0);
    assert.equal(f.status,'active');
  }
});

test('stun comes only from score hits and the sole surviving stunned hero loses',()=>{
  let f=startDestinyTeamRound(team(),['attack','attack'],0);
  onDestinyOpponentHealthHit(f,0,2,'dice');assert.equal(f.team.stunnedUntil,undefined);
  f.allies[0].hero.health=0;onDestinyOpponentHealthHit(f,0,2,'score');settleDestinyFight(f);
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'610');
});

test('a killed hero does not cause the unstunned surviving ally to lose',()=>{
  let f=team('610',{first:{speed:0,health:1,armour:1},second:{speed:0,armour:0}});
  f=score(speed(f,0,false));assert.equal(actor(f,0).hero.health,0);assert.equal(f.status,'active');
  f=endDestinyTeamRound(f);f=startDestinyTeamRound(f,['fallen','attack'],0);assert.equal(f.status,'active');
});

test('a stun expires after one round and also loses if the other hero dies before the next round',()=>{
  let f=score(speed(team('610',{first:{speed:0,armour:10},second:{speed:0,armour:0}}),0,false));
  f=endDestinyTeamRound(f);f=startDestinyTeamRound(f,['support','attack'],0);
  f=select(f,1);f.hero.speed=40;f=rollDestinyTeamSpeed(f,1,rolls(6,5,1,2));f=resolveDestinyTeamSpeed(f);f=endDestinyTeamRound(score(f));
  f=startDestinyTeamRound(f,['attack','attack'],0);assert.equal(f.status,'active');
  f=score(speed(team('610',{first:{speed:0,armour:10},second:{speed:0,armour:0}}),0,false));
  f=select(f,1);f.hero.health=1;f=endDestinyTeamRound(f);
  f=startDestinyTeamRound(f,['support','fallen'],0);assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'610');
});

test('Stone Dust reduces both heroes Speed once, independent of which hero destroys the first elemental',()=>{
  let f=startDestinyTeamRound(team('793'),['attack','attack'],0);f=select(f,1);
  destinyStrike(f,0,50,'test','dice');assert.equal(destinyStat(f,'hero','speed'),26);
  f=select(f,0);assert.equal(destinyStat(f,'hero','speed'),28);
  destinyStrike(f,1,50,'test','dice');assert.equal(destinyStat(f,'hero','speed'),28);
  f=select(JSON.parse(JSON.stringify(f)),1);assert.equal(destinyStat(f,'hero','speed'),26);
});

test('elemental lightning reflects only actual score/dice Health damage to its attacker and Insulated prevents it',()=>{
  let f=startDestinyTeamRound(team('793',{abilities:{insulated:1}}),['attack','attack'],0);
  destinyStrike(f,0,2,'test','dice');assert.equal(actor(f,0).hero.health,60);assert.equal(actor(f,1).hero.health,60);
  f=select(f,1);destinyStrike(f,0,0,'test','dice');destinyStrike(f,0,1,'barbs','passive');assert.equal(f.hero.health,60);
  destinyStrike(f,0,1,'test','dice');assert.equal(f.hero.health,58);assert.equal(actor(f,0).hero.health,60);
});

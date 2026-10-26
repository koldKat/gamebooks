import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,settleDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyAlly,destinyHeroRecipient,healDestinyRecipient} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select,setDestinyTeamRoles as roles,destinyTeamEnemyTarget as target} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {addDestinyStatEffect,destinyOnHeroHit,destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {startDestinyTeamRound,rollDestinyTeamSpeed,resolveDestinyTeamSpeed,useDestinyTeamAbility} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
const clone=f=>JSON.parse(JSON.stringify(f));
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function actor(name,armour,abilities={}){
  return configureDestinyAbilities(createDestinyFight({name,speed:10,brawn:4,magic:0,armour,health:20,maxHealth:30},[{name:'Monster',speed:8,brawn:4,armour:2,health:200}]),abilities,{mainHand:{type:name==='First'?'dagger':'staff',brawn:2}},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const team=()=>enableDestinyTeam(attachDestinyAlly(actor('First',2,{bleed:1}),actor('Second',8,{bleed:1,heal:1})));

test('team selection preserves each hero, charges, equipment, curses and sustained modes across save/resume',()=>{
  let f=team();f.used.heal=2;f.scoreRerollAbility='bright-spark';
  f.bearForm=true;f.autoWinRound=4;f.opponentFaceCounts={faith:3};
  f.encounter={heroStatuses:{venom:2},sourceSection:'Team',resources:{shared:3}};
  addDestinyStatEffect(f,'hero','brawn',3,null,'Self buff');addDestinyStatEffect(f,0,'armour',-1,null,'Shared debuff');
  f=select(clone(f),1);assert.equal(f.hero.name,'Second');assert.equal(f.used.heal,undefined);assert.equal(f.equipment.mainHand.type,'staff');
  assert.equal(f.scoreRerollAbility,undefined);assert.equal(f.encounter.heroStatuses,undefined);assert.equal(f.encounter.resources.shared,3);
  assert.equal(f.bearForm,undefined);assert.equal(f.autoWinRound,undefined);assert.equal(f.opponentFaceCounts,undefined);
  assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(destinyStat(f,0,'armour'),1);
  f.used.heal=1;f.sustainedDamage={name:'stone-rain',round:1,target:0,index:0};
  healDestinyRecipient(f,destinyHeroRecipient(f,{ally:0}),4);
  f=select(clone(f),0);assert.equal(f.hero.health,24);assert.equal(f.used.heal,2);assert.equal(f.equipment.mainHand.type,'dagger');
  assert.equal(f.scoreRerollAbility,'bright-spark');assert.equal(f.sustainedDamage,undefined);assert.equal(destinyStat(f,'hero','brawn'),7);
  assert.equal(f.bearForm,true);assert.equal(f.autoWinRound,4);assert.deepEqual(f.opponentFaceCounts,{faith:3});
  assert.deepEqual(f.encounter.heroStatuses,{venom:2});assert.equal(f.encounter.resources.shared,3);
  f=select(f,1);assert.equal(f.used.heal,1);assert.equal(f.sustainedDamage.name,'stone-rain');
});

test('team role selection requires a living attacker and rejects using fallen heroes',()=>{
  const f=team();assert.throws(()=>roles(f,['support','support']),/At least one/);
  assert.deepEqual(roles(f,['attack','support']).team.roles,['attack','support']);
  f.allies[0].hero.health=0;
  assert.throws(()=>roles(f,['support','attack']),/fallen/);
  assert.deepEqual(roles(f,['attack','fallen']).team.roles,['attack','fallen']);
});

test('enemy targets the last non-passive Health damage dealer even when supporting, or highest current Armour',()=>{
  let f=startDestinyRound(roles(team(),['attack','support']),0);assert.equal(target(f,0),1);
  f=select(f,0);destinyOnHeroHit(f,0,3,'score');assert.equal(target(f,0),0);
  f=select(f,1);f.turn={winner:'hero'};destinyOnHeroHit(f,0,7,'passive');assert.equal(target(f,0),0);
  destinyOnHeroHit(f,0,0,'dice');assert.equal(target(f,0),0);
  destinyOnHeroHit(f,0,2,'dice');assert.equal(target(f,0),1);
  f.hero.health=0;assert.equal(target(f,0),0);
  f.hero.health=20;f.team.lastDamageByTarget={};addDestinyStatEffect(f,'hero','armour',-8,null,'Armour loss');
  assert.equal(target(f,0),0);
});

test('each hero can apply a separate bleed while shared effects and marks survive selection',()=>{
  let f=startDestinyRound(team(),0);f.turn.winner='hero';destinyOnHeroHit(f,0,2,'score');
  f.effects.push({kind:'score-flat',hero:true,opponent:0,amount:2,from:2,until:100,source:'spirit-mark'});
  f=select(f,1);f.turn={winner:'hero'};destinyOnHeroHit(f,0,3,'score');
  destinyOnHeroHit(f,0,3,'score');
  assert.deepEqual(f.effects.filter(e=>e.kind==='bleed').map(e=>e.teamOwner),[0,1]);
  f=select(clone(f),0);assert.equal(f.effects.filter(e=>e.source==='spirit-mark').length,1);
  assert.equal(f.effects.filter(e=>e.kind==='bleed').length,2);
});

test('one surviving hero keeps combat active and both win when the monster is defeated',()=>{
  let f=startDestinyRound(team(),0);f.hero.health=0;
  settleDestinyFight(f);assert.equal(f.status,'active');
  f.opponents[0].health=0;settleDestinyFight(f);
  assert.equal(f.status,'win');assert.deepEqual(f.team.winners,[0,1]);
  assert.equal(f.hero.health,30);assert.equal(f.allies[0].hero.health,30);
  f=startDestinyRound(team(),0);f.hero.health=0;f.allies[0].hero.health=0;settleDestinyFight(f);assert.equal(f.status,'loss');
});

test('team selection refuses to detach a pending action from its caster and never mutates the input',()=>{
  const f=team();f.turn={pendingAbility:{name:'Pending'}};const before=clone(f);
  assert.throws(()=>select(f,1),/pending action/);assert.deepEqual(f,before);
  assert.throws(()=>select(f,2),/Choose a team hero/);
});

test('two attacking heroes roll separately against one shared opponent roll and the fastest hero attacks',()=>{
  let f=startDestinyTeamRound(team(),['attack','attack'],0);
  f=rollDestinyTeamSpeed(f,0,rolls(1,2,3,4));
  f=rollDestinyTeamSpeed(clone(f),1,rolls(6,5));
  f=resolveDestinyTeamSpeed(clone(f));
  assert.equal(f.team.active,1);assert.equal(f.team.roundWinner,1);assert.equal(f.turn.winner,'hero');assert.equal(f.phase,'damage');
  assert.deepEqual(f.turn.opponentSpeedDice,[3,4]);assert.deepEqual(f.allies[0].turn.heroSpeedDice,[1,2]);
});

test('top hero/opponent ties end the round and tied winning heroes require an explicit choice',()=>{
  let f=startDestinyTeamRound(team(),['attack','attack'],0);
  f=rollDestinyTeamSpeed(f,0,rolls(3,3,4,4));f=rollDestinyTeamSpeed(f,1,rolls(3,3));
  f=resolveDestinyTeamSpeed(f);assert.equal(f.turn.winner,'standoff');assert.equal(f.phase,'end');
  f=startDestinyTeamRound(team(),['attack','attack'],0);
  f=rollDestinyTeamSpeed(f,0,rolls(6,5,1,2));f=rollDestinyTeamSpeed(f,1,rolls(5,6));
  f=resolveDestinyTeamSpeed(f);assert.equal(f.team.stage,'speed-choice');assert.deepEqual(f.team.speedChoices,[0,1]);
  f=resolveDestinyTeamSpeed(clone(f),{actor:0});assert.equal(f.team.active,0);assert.equal(f.turn.winner,'hero');
});

test('support heroes do not roll Speed but remain eligible enemy targets and can heal their ally',()=>{
  let f=startDestinyTeamRound(team(),['attack','support'],0);
  assert.throws(()=>rollDestinyTeamSpeed(f,1,rolls()),/attacker/);
  f=useDestinyTeamAbility(f,1,'heal',{ally:0});assert.equal(f.allies[0].hero.health,24);assert.equal(f.used.heal,1);
  f=rollDestinyTeamSpeed(f,0,rolls(1,2,6,6));f=resolveDestinyTeamSpeed(f);
  assert.equal(f.team.active,1);assert.equal(f.turn.winner,'opponent');assert.equal(f.phase,'damage');
});

test('accepted-roll hazards affect each attacker once, including when tied heroes choose after save/resume',()=>{
  let f=team();f.encounter={acceptedHeroRollFaces:[{kinds:['speed'],faces:[1],amount:2,name:'Hazard'}]};
  f=startDestinyTeamRound(f,['attack','attack'],0);f.opponents[0].speed=0;
  f=rollDestinyTeamSpeed(f,0,rolls(1,6,1,2));f=rollDestinyTeamSpeed(f,1,rolls(6,1));
  f=resolveDestinyTeamSpeed(f);assert.equal(f.team.stage,'speed-choice');
  assert.equal(f.hero.health,18);assert.equal(f.allies[0].hero.health,18);
  f=resolveDestinyTeamSpeed(clone(f),{actor:1});assert.equal(f.hero.health,18);assert.equal(f.allies[0].hero.health,18);
});

test('an ally control ability enables the other attacker’s conditional strike and applies its shared dice reduction',()=>{
  let f=enableDestinyTeam(attachDestinyAlly(actor('First',2,{backstab:1}),actor('Second',8,{webbed:1})));
  f=startDestinyTeamRound(f,['attack','attack'],0);
  f=useDestinyTeamAbility(f,1,'webbed');f=useDestinyTeamAbility(f,0,'backstab',{},rolls(2,3));
  assert.equal(f.opponents[0].health,195);
  f=rollDestinyTeamSpeed(f,0,rolls(6,5,2));assert.deepEqual(f.team.opponentDice,[2]);
  f=rollDestinyTeamSpeed(f,1,rolls(1,2));
  assert.throws(()=>useDestinyTeamAbility(f,1,'webbed'),/before the team rolls/);
});

test('changing the shared enemy Speed die updates both attackers rather than leaving the team contest stale',()=>{
  let f=enableDestinyTeam(attachDestinyAlly(actor('First',2,{sneak:1}),actor('Second',8,{})));
  f=startDestinyTeamRound(f,['attack','attack'],0);f=rollDestinyTeamSpeed(f,0,rolls(3,3,6,2));
  f=rollDestinyTeamSpeed(f,1,rolls(4,3));
  f=useDestinyTeamAbility(f,0,'sneak',{die:0},rolls());
  assert.deepEqual(f.team.opponentDice,[1,2]);assert.deepEqual(f.allies[0].turn.opponentSpeedDice,[1,2]);
  f=resolveDestinyTeamSpeed(f);assert.equal(f.turn.winner,'hero');assert.equal(f.team.roundWinner,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {startDestinyTeamRound as start,rollDestinyTeamSpeed as speed,resolveDestinyTeamSpeed as resolveSpeed,useDestinyTeamAbility as use,
  rollDestinyTeamDamage as damage,resolveDestinyTeamDamage as resolveDamage,resolveDestinyTeamAbilityRoll as resolveEvent} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
import {endDestinyTeamRound as end} from '../../../public/js/battlesim/engines/destinyquest/team-end.js';
import {queueDestinyEncounterEvent} from '../../../public/js/battlesim/engines/destinyquest/encounter-events.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function hero(name,armour,abilities){return configureDestinyAbilities(createDestinyFight({name,speed:10,brawn:4,magic:0,armour,health:20,maxHealth:30},[{name:'Monster',speed:30,brawn:6,armour:0,health:200}]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});}
const team=(extra={})=>enableDestinyTeam(attachDestinyAlly(hero('Protected',0,{}),hero('Defender',8,{defender:1,...extra})));
function lost(f=team()){
  f=start(f,['attack','support'],0);f.team.lastDamageByTarget[0]=0;
  return resolveSpeed(speed(f,0,rolls(1,2,6,5)));
}

test('a support Defender takes the rolled score using own Armour and receives its Health-hit status',()=>{
  let f=lost();f.encounter.heroStatusOnHit={name:'venom',amount:2};f=damage(f,rolls(6));
  f=use(clone(f),1,'defender');assert.equal(f.team.roundWinner,1);assert.equal(f.used.defender,1);
  f=resolveDamage(clone(f));assert.equal(f.hero.name,'Defender');assert.equal(f.hero.health,16);assert.equal(f.allies[0].hero.health,20);
  assert.deepEqual(f.encounter.heroStatuses,{venom:2});assert.equal(f.allies[0].encounter.heroStatuses,undefined);
  assert.equal(f.team.lastDamageByTarget[0],0);
  f=end(f);assert.equal(f.hero.health,14);
});

test('Defender works before the score is rolled and keeps the defender’s own category use',()=>{
  let f=lost();f.allies[0].turn.used.mo=true;
  f=use(f,1,'defender');assert.equal(f.turn.used.mo,true);assert.equal(f.turn.used.co,false);
  f=resolveDamage(damage(f,rolls(6)));assert.equal(f.hero.health,16);
  assert.throws(()=>use(f,1,'defender'),/unavailable/);
});

test('enemy damage dice ignore Armour when redirected, preserving the protected hero and resuming the event owner',()=>{
  let f=lost();queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Fireball',dice:1,owner:'opponent',damageDice:true},'damage',rolls(5));
  f=use(f,1,'defender',{type:'event'});assert.equal(f.team.active,1);
  f=resolveEvent(clone(f),rolls());assert.equal(f.team.active,0);assert.equal(f.hero.health,20);assert.equal(f.allies[0].hero.health,15);
  assert.equal(f.allies[0].used.defender,1);assert.equal(f.phase,'damage');
});

test('redirecting a nested enemy damage event restores the original caster’s suspended ability',()=>{
  let f=lost();f.phase='ability-rolled';f.turn.pendingAbility={type:'damage',name:'Original ability',spec:{category:'co'},groups:[{dice:[2],targets:[0],bonuses:{}}],options:{},returnPhase:'end'};
  queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Reflection',dice:1,owner:'opponent',damageDice:true,interruptsPending:true},'ability-rolled',rolls(4));
  f=use(f,1,'defender',{type:'event'});f=resolveEvent(clone(f),rolls());
  assert.equal(f.team.active,0);assert.equal(f.phase,'ability-rolled');assert.equal(f.turn.pendingAbility.name,'Original ability');
  assert.equal(f.hero.health,20);assert.equal(f.allies[0].hero.health,16);
});

test('Defender redirects one chosen passive packet, consumes one charge and respects armour handling',()=>{
  let f=resolveDamage(damage(lost(),rolls(1)));
  f.encounter.heroStatuses={venom:2};
  f=use(f,1,'defender',{type:'passive',source:'venom'});assert.equal(f.allies[0].used.defender,undefined);
  f=end(clone(f));assert.equal(f.hero.health,13);assert.equal(f.allies[0].hero.health,18);assert.equal(f.allies[0].used.defender,1);
  let armoured=resolveDamage(damage(lost(),rolls(1)));
  armoured.encounter.endEffects=[{target:'hero',amount:10,ignoreArmour:false}];
  armoured=use(armoured,1,'defender',{type:'passive',source:'encounter'});armoured=end(armoured);
  assert.equal(armoured.hero.health,13);assert.equal(armoured.allies[0].hero.health,16);
});

test('Defender remains once per combat under Hexed and rejects self, dead or unrelated damage selections atomically',()=>{
  let f=lost(team({hexed:1})),before=clone(f);
  assert.throws(()=>use(f,1,'defender',{type:'event'}),/enemy damage dice/);assert.deepEqual(f,before);
  assert.throws(()=>use(f,0,'defender'),/unavailable/);
  f=use(f,1,'defender');assert.deepEqual(f.abilityQuota.used,['defender']);
  f=resolveDamage(damage(f,rolls(6)));assert.throws(()=>use(f,1,'defender',{type:'passive',source:'venom'}),/unavailable/);
  f=lost();f.allies[0].hero.health=0;assert.throws(()=>use(f,1,'defender'),/unavailable/);
});

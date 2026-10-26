import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam,switchDestinyTeamHero as select} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {startDestinyTeamRound as start,rollDestinyTeamSpeed as speed,resolveDestinyTeamSpeed as resolveSpeed,
  useDestinyTeamAbility as use,rollDestinyTeamDamage as damage,resolveDestinyTeamDamage as resolveDamage,resolveDestinyTeamAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/team-combat.js';
import {endDestinyTeamRound as end} from '../../../public/js/battlesim/engines/destinyquest/team-end.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function hero(name,abilities={}){
  return configureDestinyAbilities(createDestinyFight({name,speed:20,brawn:4,magic:0,armour:0,health:20,maxHealth:30},[{name:'Monster',speed:0,brawn:2,armour:0,health:200}]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const team=(a={},b={})=>enableDestinyTeam(attachDestinyAlly(hero('First',a),hero('Second',b)));
const won=f=>resolveSpeed(speed(start(f,['attack','support'],0),0,rolls(6,5,1,2)));
const struck=f=>resolveDamage(damage(f,rolls(1)));

test('each hero passive and each caster-owned ongoing status ticks exactly once and enemy regeneration runs once',()=>{
  let f=won(team({barbs:1,'fire-aura':1},{barbs:1,'fire-aura':1}));
  f=struck(f);f.encounter={regeneration:[{target:0,amount:1}]};
  f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:100,teamOwner:0},{kind:'bleed',target:0,amount:1,from:1,until:100,teamOwner:1});
  f=end(clone(f));
  assert.equal(f.opponents[0].health,190,'195 after score, minus6 passives plus1 regeneration');
  assert.equal(f.phase,'start');assert.equal(f.team.stage,'start');
  assert.equal(f.history.filter(e=>e.type==='passive').length,6);
  assert.throws(()=>end(f),/Finish the team attack/);
});

test('poison, ongoing Health damage, shields and healing belong to their own hero',()=>{
  let f=won(team());f=struck(f);
  f.encounter.heroStatuses={venom:2};f.portableShieldHealth=1;
  f.effects.push({kind:'end-heal',amount:1,from:1,until:100});
  f=select(f,1);f.encounter.heroStatuses={disease:3};
  f.effects.push({kind:'ongoing-damage',target:'hero',amount:2,from:1,until:100,source:'Curse'},{kind:'end-heal',amount:2,from:1,until:100});
  f=end(clone(f));assert.equal(f.hero.health,20);assert.equal(f.portableShieldHealth,0);
  f=select(f,1);assert.equal(f.hero.health,17);
});

test('simultaneous lethal damage to both heroes cannot become a healed team victory',()=>{
  let f=struck(won(team()));f.restoreOnVictory=false;
  f.hero.health=1;f.encounter.heroStatuses={venom:2};
  f.effects.push({kind:'end-heal',amount:10,from:1,until:100},{kind:'bleed',target:0,amount:300,from:1,until:100,teamOwner:0});
  f=select(f,1);f.hero.health=1;f.encounter.heroStatuses={venom:2};
  f.effects.push({kind:'end-heal',amount:10,from:1,until:100});
  f=end(f);assert.equal(f.status,'loss');assert.equal(f.opponents[0].health,0);assert.equal(f.hero.health,0);assert.equal(f.allies[0].hero.health,0);
});

test('one surviving hero wins for both after passive damage and a fallen hero’s applied bleed remains active',()=>{
  let f=struck(won(team()));f.hero.health=0;f.opponents[0].health=1;
  f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:100,teamOwner:0});
  f=end(f);assert.equal(f.status,'win');assert.deepEqual(f.team.winners,[0,1]);assert.equal(f.hero.health,30);assert.equal(f.allies[0].hero.health,30);
});

test('support healing between roll and damage does not redirect the incoming enemy attack',()=>{
  let f=team({}, {heal:1});f.opponents[0].speed=100;
  f=start(f,['attack','support'],0);f=speed(f,0,rolls(1,2,6,5));f=resolveSpeed(f);
  assert.equal(f.team.roundWinner,0);
  f=damage(f,rolls(1));f=use(f,1,'heal',{ally:0});assert.equal(f.team.active,1);
  f=resolveDamage(clone(f));assert.equal(f.team.active,0);assert.equal(f.hero.health,21);assert.equal(f.allies[0].hero.health,20);
});

test('a second round can change roles and passive Health loss remains independent across save/resume',()=>{
  let f=end(struck(won(team())));
  f=start(clone(f),['support','attack'],0);f=speed(f,1,rolls(6,5,1,2));f=resolveSpeed(f);
  assert.equal(f.team.roundWinner,1);f=struck(f);f=end(clone(f));assert.equal(f.round,2);assert.equal(f.opponents[0].health,190);
});

test('paused end events resume before passives and never duplicate their damage',()=>{
  let f=struck(won(team({barbs:1},{barbs:1})));
  f.encounter.endTests=[{kind:'damage-if-high',name:'End hazard',limit:2,amount:3}];
  f=end(f,rolls(6));assert.equal(f.phase,'ability-rolled');assert.equal(f.opponents[0].health,195);
  f=resolveDestinyTeamAbilityRoll(clone(f),rolls());f=end(clone(f),rolls());
  assert.equal(f.hero.health,17);assert.equal(f.opponents[0].health,193);
});

test('passive reflection hits each effect’s caster and leaves the last direct attacker unchanged',()=>{
  let f=struck(won(team({barbs:1},{barbs:1})));
  f.encounter.reflectDamage=[{target:0,allDamage:true,amount:2}];
  f=end(clone(f));assert.equal(f.hero.health,18);assert.equal(f.allies[0].hero.health,18);
  assert.equal(f.team.lastDamageByTarget[0],0);
});

test('Turn Up the Heat improves both heroes Fire Aura while independent bleed bonuses stay with their caster',()=>{
  let f=struck(won(team({'fire-aura':1,'turn-up-the-heat':1},{'fire-aura':1})));
  f.bleedBonus=2;
  f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:100,teamOwner:0},{kind:'bleed',target:0,amount:1,from:1,until:100,teamOwner:1});
  f=end(f);assert.equal(f.opponents[0].health,187,'four Aura damage and independent bleed3+1');
});

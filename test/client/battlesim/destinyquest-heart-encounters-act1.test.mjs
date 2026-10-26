import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:20,brawn:4,magic:2,armour:0,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const resume=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const resolveTest=f=>resolveDestinyAbilityRoll(f,rolls(),{roster});

test('Ironclad blocks bleed, thorns and Thorn Cage but retains unrelated damage and its printed routes',()=>{
  let f=startDestinyRound(fight(208,{abilities:{bleed:1,thorns:1,'thorn-cage':1,'fire-aura':1}}),0);
  assert.deepEqual([f.opponents[0].speed,f.opponents[0].brawn,f.opponents[0].armour,f.opponents[0].health],[5,5,5,35]);
  f=win(f);assert.throws(()=>use(f,'thorn-cage',{},rolls()),/immune/);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(6)));assert.equal(f.opponents[0].health,30);
  assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,29);
  let lost=startDestinyRound(fight(208,{hero:{health:1,speed:0}}),0);
  lost=resolveDestinyDamage(rollDestinyDamage(lose(lost),rolls(6)));
  assert.equal(lost.status,'loss');assert.equal(lost.encounter.outcomeSection,'464');
});

test('roadside robbers stop at ten Health and use their separate defeat route',()=>{
  let f=startDestinyRound(fight(241,{hero:{brawn:24}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));
  assert.equal(f.opponents[0].health,10);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'278');
  f=startDestinyRound(fight(241,{hero:{health:1,speed:0}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(2)));
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'339');
});

test('Dagona uses only the highest of three damage dice and accepted hero Speed doubles lose even when faster',()=>{
  let f=startDestinyRound(fight(256),0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,6,1,2)));
  assert.equal(f.turn.winner,'opponent');
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1,6,3)));
  assert.equal(f.turn.damageScore,10);assert.equal(f.hero.health,20);
  f=startDestinyRound(fight(256,{abilities:{feint:1}}),0);
  f=rollDestinySpeed(f,rolls(3,3,1,2));
  f=use(f,'feint',{dice:[0,1]},rolls(6,5));
  f=resolveDestinySpeed(resume(f));assert.equal(f.turn.winner,'hero');
});

test('the trapped horde gives survival and defeat achievements their distinct source destinations',()=>{
  let f=fight(262,{hero:{speed:3},abilities:{barbs:1,haste:1}});
  for(let round=1;round<=5;round++){
    f=startDestinyRound(f,0);assert.throws(()=>use(f,'haste'),/unavailable/);
    f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
    assert.equal(f.opponents[0].health,28);assert.equal(f.status,round===5?'win':'active');
  }
  assert.equal(f.encounter.outcomeSection,'335');
  for(const priorRound of [0,4]){
    let killed=fight(262,{hero:{brawn:40}});killed.round=priorRound;
    killed=startDestinyRound(killed,0);killed=resolveDestinyDamage(rollDestinyDamage(win(killed),rolls(1)));
    assert.equal(killed.status,'win');assert.equal(killed.encounter.outcomeSection,'367');
  }
});

test('revealed poltergeist and archer ant presets retain their printed stats and victory destinations',()=>{
  for(const [section,name,stats,destination] of [[266,'Poltergeist',[5,null,3,3,35],'236'],[281,'Archer ants',[2,1,null,1,20],'311']]){
    let f=startDestinyRound(fight(section,{hero:{brawn:100}}),0),enemy=f.opponents[0];
    assert.equal(enemy.name,name);assert.deepEqual([enemy.speed,enemy.brawn,enemy.magic,enemy.armour,enemy.health],stats);
    f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,destination);
  }
});

test('Gutless start roll penalizes exactly the named combatant and only for that round',()=>{
  for(const [result,own,enemy]of [[1,19,3],[2,19,3],[3,20,2],[6,20,2]]){
    let f=startDestinyRound(fight(58),0,rolls(result));assert.equal(f.phase,'ability-rolled');
    f=resolveTest(resume(f));assert.equal(destinyStat(f,'hero','speed'),own);assert.equal(destinyStat(f,0,'speed'),enemy);
    f.round++;assert.equal(destinyStat(f,'hero','speed'),20);assert.equal(destinyStat(f,0,'speed'),3);
  }
});

test('the cannon fires at start of round six only if its crew remain alive',()=>{
  let f=fight(71,{hero:{speed:2}});
  for(let n=1;n<=5;n++){
    f=startDestinyRound(f,1);assert.equal(f.round,n);assert.equal(f.status,'active');
    f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
  }
  f=startDestinyRound(resume(f),0);assert.equal(f.round,6);assert.equal(f.status,'loss');
  f=fight(71,{hero:{speed:20,brawn:30}});f.round=4;f=startDestinyRound(f,1);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');
  f=startDestinyRound(endDestinyRound(f),0);assert.equal(f.round,6);assert.equal(f.status,'active');
});

test('Lazlo lightning hits each combatant for their own doubles and a low follow-up roll cancels the hero attack',()=>{
  let f=startDestinyRound(fight(102),0);f=rollDestinySpeed(f,rolls(3,3,4,4));
  assert.equal(f.hero.health,26);assert.equal(f.opponents[0].health,36);
  f=resolveDestinySpeed(f,rolls(1));assert.equal(f.phase,'ability-rolled');
  f=resolveTest(f);assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,36);
  f=startDestinyRound(fight(102,{abilities:{feint:1}}),0);f=rollDestinySpeed(f,rolls(3,3,4,5));
  f=use(f,'feint',{dice:[0,1]},rolls(2,2));assert.equal(f.hero.health,22);assert.equal(f.opponents[0].health,40);
});

test('Lazlo self-inflicted lightning is not player damage and cannot fund Vampirism after a missed attack',()=>{
  let f=startDestinyRound(fight(102,{abilities:{vampirism:1}}),0);
  f=rollDestinySpeed(f,rolls(6,5,4,4));assert.equal(f.opponents[0].health,36);
  f=resolveTest(resolveDestinySpeed(f,rolls(1)));assert.equal(f.phase,'end');
  assert.equal(f.turn.lastHeroDamage,undefined);assert.throws(()=>use(f,'vampirism'),/Cause health damage first/);
});

test('ranged archers prohibit Speed and Combat abilities and always use Magic for damage scores',()=>{
  let f=startDestinyRound(fight(103,{hero:{brawn:100},abilities:{haste:1,'deep-wound':1,'roll-with-it':1}}),0);
  assert.throws(()=>use(f,'haste'),/ability type is blocked/);f=win(f);
  assert.throws(()=>use(f,'deep-wound'),/ability type is blocked/);
  f=use(f,'roll-with-it',{die:0});assert.equal(destinyDamageScore(f),8);
  f=resolveDestinyDamage(f);assert.equal(f.turn.damageScore,8);
});

test('zombies may revive on one or two only once; a second defeat ends combat',()=>{
  let f=startDestinyRound(fight(138,{hero:{brawn:50}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)),rolls(2));assert.equal(f.phase,'ability-rolled');assert.equal(f.status,'active');
  f=resolveTest(resume(f));assert.equal(f.opponents[0].health,6);
  f=startDestinyRound(endDestinyRound(f),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)),rolls());
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'58');
  f=startDestinyRound(fight(138,{hero:{brawn:50}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)),rolls(3));
  f=resolveTest(f);assert.equal(f.status,'win');assert.equal(f.opponents[0].health,0);
});

test('hellhound reflects score/dice damage but not passives; its fifth-round boost occurs once',()=>{
  let f=startDestinyRound(fight(144,{abilities:{barbs:1}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));
  assert.equal(f.hero.health,27);f=endDestinyRound(f);assert.equal(f.hero.health,27);
  f=fight(144);f.round=4;f=startDestinyRound(f,0);assert.equal(destinyStat(f,0,'speed'),5);assert.equal(destinyStat(f,0,'brawn'),8);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));f=startDestinyRound(endDestinyRound(f),0);
  assert.equal(destinyStat(f,0,'speed'),5);assert.equal(destinyStat(f,0,'brawn'),8);
});

test('Stone Blood grows current Armour up to six even after a debuff, based on accepted damage faces',()=>{
  let f=startDestinyRound(fight(200,{hero:{speed:0,armour:100}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(4)));assert.equal(f.turn.healthDamage,0);assert.equal(destinyStat(f,0,'armour'),4);
  addDestinyStatEffect(f,0,'armour',-3,null,'rust');assert.equal(destinyStat(f,0,'armour'),1);
  for(let n=0;n<7;n++){
    f=startDestinyRound(endDestinyRound(resume(f)),0);f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(6)));
    assert.ok(destinyStat(f,0,'armour')<=6);
  }
  assert.equal(destinyStat(f,0,'armour'),6);
});

test('assassin ant Venom starts only after an actual Health hit and ticks at round end',()=>{
  let f=startDestinyRound(fight(229,{hero:{speed:0,armour:100}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(4)));assert.equal(f.encounter.heroStatuses,undefined);
  f=startDestinyRound(fight(229,{hero:{speed:0}}),0);f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(4)));
  assert.equal(f.hero.health,24);f=endDestinyRound(f);assert.equal(f.hero.health,22);
});

test('reverend ghouls accumulate at round end, deal damage only at the next start, and are all cleared by three or more',()=>{
  let f=startDestinyRound(fight(168,{hero:{speed:2,armour:100}}),0);
  const endWith=result=>{
    f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2)));
    f=endDestinyRound(f,[],rolls(result));f=resolveTest(resume(f));f=endDestinyRound(f,[],rolls());
  };
  endWith(1);assert.equal(f.hero.health,30);assert.equal(f.encounter.resources.ghouls,1);
  f=startDestinyRound(f,0);assert.equal(f.hero.health,28);
  endWith(2);assert.equal(f.encounter.resources.ghouls,2);assert.equal(f.hero.health,28);
  f=startDestinyRound(f,0);assert.equal(f.hero.health,24);
  endWith(3);assert.equal(f.encounter.resources.ghouls,0);f=startDestinyRound(f,0);assert.equal(f.hero.health,24);
});

test('reverend victory clears the ghouls, but lethal ghoul damage at round start ends combat first',()=>{
  let f=fight(168,{hero:{brawn:100}});f.encounter.resources.ghouls=3;f=startDestinyRound(f,0);
  assert.equal(f.hero.health,24);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)),rolls());
  assert.equal(f.status,'win');assert.equal(f.encounter.resources.ghouls,0);assert.equal(f.encounter.outcomeSection,'218');
  f=fight(168,{hero:{health:5,brawn:100}});f.encounter.resources.ghouls=3;f=startDestinyRound(f,0,rolls());
  assert.equal(f.status,'loss');assert.equal(f.hero.health,0);assert.equal(f.opponents[0].health,50);
});

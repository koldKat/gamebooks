import {loadFixtureRoster} from './roster-fixtures.mjs';
await loadFixtureRoster(700);
import test from 'node:test';
import assert from 'node:assert/strict';
import {MONEY_RULES,PLAYER_DEFAULTS,unarmedPresetOptions,unarmedEncounter} from '../../../public/js/battlesim/books/700/definition.js';
import {evaluateCheck,startUnarmedFight,stepUnarmedFight,startShootingFight,convertShootingToUnarmed} from '../../../public/js/battlesim/books/700/combat.js';
const player=()=>({...PLAYER_DEFAULTS,strength:100,dexterity:100,speed:100,damageCode:100,extension:{keep:true}});
const withRules=fn=>{const before=structuredClone(MONEY_RULES);try{fn();}finally{Object.assign(MONEY_RULES,before);}};

test('remaining-opponent damage uses metadata without changing the original player',()=>withRules(()=>{
 MONEY_RULES.damageRules[102].damage=30;MONEY_RULES.damageRules[102].otherwise=7;
 const p=player(),before=structuredClone(p),fight=startUnarmedFight(p,102,{count:2});
 assert.equal(fight.enemy.damageCode,30);
 stepUnarmedFight(fight,'begin');stepUnarmedFight(fight,'force');
 assert.equal(fight.enemyIndex,1);assert.equal(fight.enemy.damageCode,7);
 assert.deepEqual(p,before);assert.deepEqual(fight.player.extension,{keep:true});
 MONEY_RULES.damageRules[177]={kind:'remainingLinear',base:2,perExtra:3};
 assert.equal(startUnarmedFight(player(),177).enemy.damageCode,8);
}));

test('advisory thresholds, routes and casualty tables come from metadata',()=>withRules(()=>{
 MONEY_RULES.checkRules[42]={threshold:50,win:777,loss:888};
 assert.equal(evaluateCheck(42,{strength:10,speed:10,combatSkill:10}).destination,888);
 assert.equal(evaluateCheck(42,{strength:30,speed:10,combatSkill:10}).destination,777);
 MONEY_RULES.checkRules[242].losses=[1,0];
 assert.equal(evaluateCheck(242,{fighters:5,labDamage:0}).losses,1);
 assert.throws(()=>evaluateCheck(242,{fighters:5,labDamage:2}),/Invalid laboratory damage/);
}));

test('preset controls use roster variants and keep count choices isolated',()=>{
 assert.deepEqual(unarmedPresetOptions(102),{countOptions:[1,2],wounded:false,douglas:false});
 assert.equal(unarmedPresetOptions(193).wounded,true);
 assert.equal(unarmedPresetOptions(177).douglas,true);
 const options=unarmedPresetOptions(102);options.countOptions.push(100);
 assert.throws(()=>unarmedEncounter(102,{count:100}),/Invalid park pursuer count/);
});

test('saved shooting conversion reads loaded references and retains remaining counts and character fields',()=>withRules(()=>{
 MONEY_RULES.conversion.unarmedOrigin=6;MONEY_RULES.conversion.baseOrigin=6;
 const fight=startShootingFight(player(),143,{weapon:{power:5,range:5,weight:1}});
 fight.opponents.slice(1).forEach(e=>{e.defeated=true;});fight.defeated=3;fight.pending={kind:'conversion'};
 const saved=JSON.parse(JSON.stringify(fight)),converted=convertShootingToUnarmed(saved);
 assert.equal(converted.opponents.length,1);assert.equal(converted.enemy.strength,8);
 assert.equal(converted.returnRoutes.win,23);assert.equal(converted.shootingDefeated,3);
 assert.deepEqual(converted.player.extension,{keep:true});
 assert.equal(saved.mode,'shooting');assert.equal(saved.pending.kind,'conversion');
}));

test('advisory check lookup rejects inherited property names explicitly',()=>{
 for(const id of ['constructor','__proto__','toString'])assert.throws(()=>evaluateCheck(id,{}),/Unknown check/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAttackContext, combatSkillCheck} from '../../../public/js/battlesim/engines/d20/attack-context.js';
import {startD20Fight, d20Action} from '../../../public/js/battlesim/engines/d20/core.js';

const actor = extra => ({name:'Combatant', hp:20, maxHp:20, ac:10,
  abilities:{str:0,dex:0,con:0,int:0,wis:0,cha:0}, saves:{str:0,dex:0,con:0,int:0,wis:0,cha:0},
  attacks:[{name:'Weapon',bonus:2,reach:5,damage:[{formula:'1d6',type:'slashing'}]}], conditions:[], ...extra});
const location = {skill:'perception',dc:16,failure:'automaticMiss',successDisadvantage:true,areaSpellSaveAdvantage:true};

test('failed target location skips attack and damage rolls entirely', () => {
  const fight = startD20Fight(actor(), {name:'Unseen encounter',profiles:[actor({features:{targetLocation:location}})]});
  const result = d20Action(fight, {kind:'attack',expectedRevision:0,actor:'player',target:'enemy0',attackIndex:0,
    distance:5,locationDice:[1],dice:[20]}, () => { throw Error('Attack or damage should not roll'); });
  assert.equal(result.groups[0].hp,20);
  assert.equal(result.events.at(-1).check.reason,'targetLocation');
  assert.equal(fight.revision,0);
});

test('successful location retains disadvantage and area-spell save advantage', () => {
  const result = sourceAttackContext(actor(),actor({features:{targetLocation:location}}),{}, {locationDice:[16],areaSpell:true});
  assert.equal(result.automaticMiss,false);
  assert.equal(result.disadvantage,true);
  assert.equal(result.targetSaveAdvantage,true);
});

test('the printed wild-shot interval includes 90 through 100', () => {
  const target = actor({conditions:[{name:'invisible'}],features:{targetLocation:{...location,dc:18,whileInvisible:true,wildShot:{die:100,minimum:90}}}});
  for (const roll of [89,90,100]) {
    const result = sourceAttackContext(actor(),target,{}, {locationDice:[1],attemptWildShot:true,wildShotRoll:roll});
    assert.equal(result.automaticMiss,roll<90);
  }
  target.conditions=[];
  assert.equal(sourceAttackContext(actor(),target,{}, {}).events.length,0);
});

test('the unseen enemy grants advantage only after failed defender awareness', () => {
  const attacker = actor({features:{defenderAwareness:{skills:['perception','survival'],dc:15,failureAttackAdvantage:true}}});
  const defender = actor({skillBonuses:{survival:8}});
  assert.equal(sourceAttackContext(attacker,defender,{}, {awarenessSkill:'survival',awarenessDice:[7]}).advantage,false);
  assert.equal(sourceAttackContext(attacker,defender,{}, {awarenessSkill:'survival',awarenessDice:[6]}).advantage,true);
  assert.throws(() => sourceAttackContext(attacker,defender,{}, {awarenessSkill:'athletics'}));
});

test('water cover applies the printed penalty with the aquatic exception', () => {
  const target=actor({features:{submergedCover:{attackPenalty:-2,ignoredByTag:'aquatic'}}});
  assert.equal(sourceAttackContext(actor(),target,{}, {}).bonusAdjustment,-2);
  assert.equal(sourceAttackContext(actor({tags:['aquatic']}),target,{}, {}).bonusAdjustment,0);
});

test('camouflage opportunity attacks reuse the prior perception result without rerolling', () => {
  const target=actor({features:{camouflage:{skill:'perception',dc:16,failureAttackDisadvantage:true,invisibleWhileStill:true}}});
  for (const known of [false,true]) {
    const result=sourceAttackContext(actor({sourceAttackAwareness:{enemy0:known}}),target,{},
      {target:'enemy0',opportunity:true},()=>{throw Error('Must reuse the source check');});
    assert.equal(result.disadvantage,!known);
  }
  assert.equal(sourceAttackContext(actor(),target,{}, {locationDice:[15]}).disadvantage,true);
  assert.equal(sourceAttackContext(actor(),target,{}, {locationDice:[16]}).disadvantage,false);
});

test('flying sword retreat attacks remain at disadvantage', () => {
  assert.equal(sourceAttackContext(actor(),actor({features:{retreatOpportunityDisadvantage:true}}),{}, {opportunity:true}).disadvantage,true);
});

test('combat skill checks honor entered skill bonuses and poisoned disadvantage', () => {
  const result=combatSkillCheck(actor({skillBonuses:{perception:5},conditions:[{name:'poisoned'}]}),'perception',16,{dice:[20,10]});
  assert.equal(result.total,15);
  assert.equal(result.success,false);
  assert.throws(()=>combatSkillCheck(actor(),'unknown',10));
});

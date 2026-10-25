import {loadFixtureRoster} from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import {UROWEN_RULES,UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {createUrowenPossession,urowenPossessionHit,resolveUrowenCompanionHit,canUrowenCompanionAttack} from '../../../../public/js/battlesim/engines/urowen/forms.js';
import {createUrowenDrinkingContest,createUrowenPointContest,resolveUrowenPointRound,urowenBetPayout} from '../../../../public/js/battlesim/engines/urowen/contests.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {resolveUrowenOpening} from '../../../../public/js/battlesim/engines/urowen/openings.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
const rolls=values=>()=>{assert.ok(values.length);return values.shift();};

test('Urowen contest profiles and payout limits follow metadata without changing captured resistance',()=>{
  const saved=structuredClone(UROWEN_RULES);
  try{
    const old=JSON.parse(JSON.stringify(createUrowenDrinkingContest(20)));
    Object.assign(UROWEN_RULES.contests.drinking,{resistance:18,playerMultiplier:3,profitMultiplier:3});
    assert.equal(createUrowenDrinkingContest(20).enemyResistance,18);assert.equal(createUrowenDrinkingContest(20).playerResistance,60);assert.equal(old.enemyResistance,54);
    assert.equal(urowenBetPayout({section:391,stake:10,winner:'player',selected:'player'}).returned,40);
    UROWEN_RULES.contests.point.winPoints=2;UROWEN_RULES.contests.point.maxStake=4;
    assert.throws(()=>urowenBetPayout({section:53,stake:5}));
    const c=createUrowenPointContest(53);c.playerPoints=1;assert.equal(resolveUrowenPointRound(c,rolls([1,6])).contest.status,'finished');
  }finally{Object.assign(UROWEN_RULES,saved);}
});
test('Urowen possession and companion profiles use metadata while saved wounds remain captured',()=>{
  const saved=structuredClone(UROWEN_RULES);
  try{
    const old=createUrowenPossession(createUrowenCharacter());old.player.life=7;old.player.extension={keep:true};
    UROWEN_RULES.possession.player.life=40;UROWEN_RULES.possession.player.maxLife=40;UROWEN_RULES.possession.player.attributes.STR=9;
    const fresh=createUrowenPossession(createUrowenCharacter());assert.equal(fresh.player.life,40);assert.equal(fresh.player.attributes.STR,9);assert.equal(old.player.life,7);assert.deepEqual(old.player.extension,{keep:true});
    UROWEN_RULES.possession.hitRoll=5;UROWEN_RULES.possession.bleeding=3;assert.equal(urowenPossessionHit({rawDamage:5,location:1}).bleeding,3);
    UROWEN_RULES.companion={bonus:3,extraRoll:5,extra:4,belowLife:8};assert.equal(canUrowenCompanionAttack({life:7,used:false}),true);assert.equal(resolveUrowenCompanionHit(rolls([2,5]),[0,0,0,0,0,0]).damage,12);
  }finally{Object.assign(UROWEN_RULES,saved);}
});
test('Urowen opening uses captured enemy charge rules instead of fixed defaults',()=>{
  const spec=compileUrowenEncounters(UROWEN_SOURCE).find(s=>s.section===360);
  const state=prepareUrowenEncounter(createUrowenSimState(),spec);
  state.fight.enemies[0].rules.openingCharge={hitOn:[1],playerDodgeOn:[5],damageDice:1,damageBonus:7};
  const old=JSON.parse(JSON.stringify(state)),before=structuredClone(old);
  const result=resolveUrowenOpening(old,rolls([1,2,3]));
  assert.equal(result.result.playerDamage,10);assert.equal(result.state.fight.player.life,10);assert.deepEqual(old,before);
});

test('Urowen saved groups keep their own size after the master profile changes',()=>{
  const spec=compileUrowenEncounters(UROWEN_SOURCE).find(s=>s.section===224);
  const old=JSON.parse(JSON.stringify(startUrowenEncounter(prepareUrowenEncounter(createUrowenSimState(),spec))));
  const master=UROWEN_SOURCE.encounters.find(s=>s.section===224).enemyRules,copies=master.copies;
  try{
    master.copies=3;
    const next=resolveUrowenEncounterRound(old,()=>1);
    assert.equal(next.result.supportDamage,2);assert.equal(next.state.fight.enemies.length,5);assert.equal(old.fight.enemies.length,5);
  }finally{master.copies=copies;}
});
test('Urowen animal wager names retain strict string identity',()=>{
  assert.throws(()=>urowenBetPayout({section:56,stake:10,selected:{toString:()=> 'Hurg'}}));
  assert.equal(urowenBetPayout({section:56,stake:10,selected:'Hurg',winner:'Hurg'}).returned,20);
});

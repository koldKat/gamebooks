import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../../../public/js/battlesim/engines/urowen/core.js';

const rolls = values => {
  let index=0;
  return () => {assert.ok(index<values.length,'Unexpected extra die');return values[index++];};
};
const enemy = overrides => ({attribute:'SK',attributeValue:0,life:20,damageBonus:0,
  armorByLocation:[0,0,0,0,0,0],...overrides});
const character = options => rules.createUrowenCharacter(options);

for (const race of Object.keys(rules.UROWEN_RACES)) {
  for (const career of Object.keys(rules.UROWEN_CAREERS)) {
    test('printed starting character '+race+'/'+career,()=>{
      const p=character({race,career});
      assert.equal(Object.values(p.attributes).reduce((a,b)=>a+b),2);
      assert.ok(Object.values(p.attributes).every(value=>value===0||value===1));
      assert.equal(p.life,20); assert.equal(p.maxLife,20); assert.equal(p.coins,15);
      assert.equal(p.experience,0); assert.equal(p.earnedExperience,0);
      assert.equal(p.power,({sorcerer:3,monk:1,alchemist:2})[career]??0);
      assert.equal(p.bagSlots,career==='thief'?7:6);
      assert.deepEqual(p.armor,[0,0,0,0,0,0]);
      assert.equal(p.weapon.bonus,-3);
      if(rules.UROWEN_RACES[race]===rules.UROWEN_CAREERS[career]) assert.equal(p.attributes.PER,1);
    });
  }
}
test('every location, raw damage die, career and armor combination',()=>{
  let combinations=0;
  const locationBonus={1:-1,2:0,3:0,4:0,5:1,6:3};
  for(const career of Object.keys(rules.UROWEN_CAREERS)) {
    for(let rawDamage=1;rawDamage<=6;rawDamage++) {
      for(let location=1;location<=6;location++) {
        for(const bonus of [-4,-3,0,3,6]) {
          for(const armor of [0,1,3,5]) {
            let die=rawDamage;
            if(career==='sorcerer'&&rawDamage===1)die=3;
            if(career==='warrior'&&rawDamage===6)die=8;
            assert.equal(rules.urowenDamage({career,rawDamage,location,bonus,armor}),
              Math.max(0,die+bonus+locationBonus[location]-armor));
            combinations++;
          }
        }
      }
    }
  }
  assert.equal(combinations,5040);
});
test('negative weapon damage is not clamped before location',()=>{
  assert.equal(rules.urowenDamage({rawDamage:2,location:6,bonus:-3}),2);
  assert.equal(rules.urowenDamage({rawDamage:2,location:1,bonus:-3}),0);
});
test('ice crystal specific sorcerer conversion',()=>{
  const die=rules.rollUrowenDie(rolls([1]),{reroll:[1],convertOne:4});
  assert.equal(die.raw,1);assert.equal(die.value,4);assert.deepEqual(die.discarded,[]);
  assert.equal(rules.urowenDamage({rawDamage:1,location:2,bonus:4,career:'sorcerer',sorcererOne:4}),8);
});
test('rerolls retain discarded rolls and are bounded',()=>{
  assert.deepEqual(rules.rollUrowenDie(rolls([1,2,4]),{reroll:[1,2]}),{raw:4,value:4,discarded:[1,2]});
  assert.throws(()=>rules.rollUrowenDie(()=>1,{reroll:[1]}),RangeError);
  assert.throws(()=>rules.rollUrowenDie(()=>1,{reroll:[1,2,3,4,5,6]}),RangeError);
  for(const invalid of [0,7,1.5,NaN,Infinity])assert.throws(()=>rules.rollUrowenDie(()=>invalid),RangeError);
});
for(const [difficulty,power,life,primary,per] of [
  ['destroyer',2,8,6,2],['easy',4,10,6,2],['standard',4,10,8,2],
  ['difficult',4,10,8,2],['heroic',5,11,9,3],
]) {
  test('printed progression '+difficulty,()=>{
    const original=character({difficulty});
    const p=rules.changeUrowenExperience(original,life*power);
    assert.equal(p.power,life);assert.equal(p.maxLife,20+power);
    assert.equal(p.life,20);assert.equal(p.experience,life*power);
    assert.equal(original.experience,0);assert.equal(original.maxLife,20);
    assert.deepEqual(rules.urowenProgressThresholds(difficulty),{power,life});
    assert.equal(rules.urowenUpgradeCost(p,'STR'),primary);
    assert.equal(rules.urowenUpgradeCost(p,'PER'),per);
    const spent=rules.upgradeUrowenAttribute(p,'MAG');
    assert.equal(spent.attributes.MAG,1);assert.equal(spent.experience,p.experience-primary);
    assert.equal(spent.earnedExperience,p.earnedExperience);
    const lost=rules.changeUrowenExperience(spent,-1000);
    assert.equal(lost.experience,0);assert.equal(lost.power,p.power);
    assert.equal(lost.maxLife,p.maxLife);assert.equal(lost.earnedExperience,p.earnedExperience);
  });
}
test('experience boundaries and max attribute',()=>{
  let p=character();p=rules.changeUrowenExperience(p,3);assert.equal(p.power,0);
  p=rules.changeUrowenExperience(p,1);assert.equal(p.power,1);
  p=rules.changeUrowenExperience(p,6);assert.equal(p.maxLife,21);
  p.attributes.STR=6;
  assert.throws(()=>rules.upgradeUrowenAttribute(p,'STR'),RangeError);
  assert.throws(()=>rules.upgradeUrowenAttribute(character(),'MAG'),RangeError);
});
test('coin difficulty exceptions do not affect wagers',()=>{
  for(const amount of [10,99,100,300]) {
    for(const difficulty of ['destroyer','easy','standard','difficult','heroic']) {
      assert.equal(rules.urowenCoinReward(amount,difficulty,{bet:true}),amount);
      const delta=['easy','standard'].includes(difficulty)?0:
        (amount<100?20:40)*(difficulty==='destroyer'?1:-1);
      assert.equal(rules.urowenCoinReward(amount,difficulty),amount+delta);
    }
  }
});
test('printed simultaneous-death exception, including negative ties',()=>{
  for(let p=-4;p<=4;p++)for(let e=-4;e<=4;e++) {
    const expected=p<=0&&e<=0?(p===e?'fighting':p>e?'win':'loss'):
      e<=0?'win':p<=0?'loss':'fighting';
    assert.equal(rules.urowenCombatOutcome(p,e),expected);
  }
});
test('tie causes no hit but counts ongoing injuries',()=>{
  const f=rules.createUrowenDuel(character(),enemy({attributeValue:1}));
  f.playerOngoing=2;f.enemyOngoing=1;
  const {fight,result}=rules.resolveUrowenDuelRound(f,rolls([3,3]));
  assert.equal(fight.round,1);assert.equal(fight.player.life,18);assert.equal(fight.enemy.life,19);
  assert.equal(result.damage,0);assert.equal(result.dice.length,2);
  assert.equal(f.player.life,20);assert.equal(f.enemy.life,20);assert.equal(f.round,0);
});
test('victory restoration and mission no-restoration option',()=>{
  for(const restoreOnVictory of [true,false]) {
    const p=character({career:'thief'});p.life=7;p.weapon.bonus=0;
    const f=rules.createUrowenDuel(p,enemy({life:1}),{restoreOnVictory});
    const {fight}=rules.resolveUrowenDuelRound(f,rolls([6,1,2,6]));
    assert.equal(fight.status,'win');assert.equal(fight.player.life,restoreOnVictory?20:7);
    assert.equal(p.life,7);assert.equal(f.enemy.life,1);
  }
});
test('minstrel dodge consumes no damage dice',()=>{
  const f=rules.createUrowenDuel(character({career:'minstrel'}),enemy({attributeValue:5}));
  const {fight,result}=rules.resolveUrowenDuelRound(f,rolls([1,6,6]));
  assert.equal(fight.player.life,20);assert.equal(result.dodged,true);assert.equal(result.dice.length,3);
});
test('monk healing replaces a won hit and is once per combat',()=>{
  const p=character({career:'monk'});p.life=3;
  const f=rules.createUrowenDuel(p,enemy());
  const {fight,result}=rules.resolveUrowenDuelRound(f,rolls([6,1,6]),{monkHeal:true});
  assert.equal(result.healed,8);assert.equal(fight.player.life,11);assert.equal(fight.enemy.life,20);
  assert.equal(fight.monkUsed,true);assert.equal(f.monkUsed,false);
  assert.throws(()=>rules.resolveUrowenDuelRound(fight,rolls([6,1]),{monkHeal:true}),RangeError);
});
test('negative tied lives continue, with immutable round snapshots',()=>{
  const f=rules.createUrowenDuel(character(),enemy({attributeValue:1}));
  f.player.life=0;f.enemy.life=0;f.playerOngoing=1;f.enemyOngoing=1;
  const {fight}=rules.resolveUrowenDuelRound(f,rolls([3,3]));
  assert.equal(fight.status,'fighting');assert.equal(fight.player.life,-1);assert.equal(fight.enemy.life,-1);
  assert.equal(f.player.life,0);assert.equal(f.enemy.life,0);
});
test('invalid input and failed random stream never mutate the saved fight',()=>{
  const f=rules.createUrowenDuel(character(),enemy());
  const original=structuredClone(f);
  assert.throws(()=>rules.resolveUrowenDuelRound(f,rolls([6,1,7])),RangeError);
  assert.deepEqual(f,original);
  for(const options of [{race:'bogus'},{career:'bogus'},{difficulty:'bogus'}]) {
    assert.throws(()=>character(options),RangeError);
  }
});
test('alchemist potions add one die, not the sorcerer or warrior damage conversion',()=>{
  for(const career of ['alchemist','sorcerer','warrior']) {
    const p=character({career});p.life=2;
    const result=rules.healUrowenPotion(p,{dice:1,bonus:3},rolls(career==='alchemist'?[1,6]:[1]));
    assert.equal(result.healed,career==='alchemist'?10:4);
    assert.equal(p.life,2);assert.equal(result.rolls.length,career==='alchemist'?2:1);
  }
});
test('potions respect maximum life and do not revive a defeated character',()=>{
  const p=character({career:'alchemist'});p.life=19;
  assert.equal(rules.healUrowenPotion(p,{dice:1,bonus:4},rolls([6,6])).player.life,20);
  p.life=0;assert.throws(()=>rules.healUrowenPotion(p,{},rolls([])),RangeError);
});
test('multi-die special fights cannot silently use an ordinary one-die resolver',()=>{
  assert.throws(()=>rules.createUrowenDuel(character(),enemy({damageDice:4})),RangeError);
  const p=character();p.weapon.dice=2;
  assert.throws(()=>rules.createUrowenDuel(p,enemy()),RangeError);
});

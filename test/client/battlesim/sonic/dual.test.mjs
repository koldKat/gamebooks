import test from 'node:test';
import assert from 'node:assert/strict';
import { dualHeroes, dualRings, dualHit, dualAbilityCheck, startDualFight, dualRound, dualChaosBurst, resolveDualChaos, dualChaosEncounter } from '../../../../public/js/battlesim/engines/sonic/dual.js';

const heroes=()=>dualHeroes({a:{abilities:{speed:5,strength:2},lives:3,rings:0},b:{abilities:{speed:3,strength:2},lives:3,rings:0}});
const rules={soloCounterThreshold:10,jointCounterThreshold:15,jointAttackStrict:true,ringLifeThreshold:100,jointVictims:['b','b','b','a','a','a'],helperAbsorbsOn:[4,5,6]};
const encounter=extra=>({rules,enemies:[{name:'Opponent',rating:7,hero:'a',ability:'speed'}],...extra});
const dice=(...faces)=>()=>{assert(faces.length,'Unexpected roll');return faces.shift();};

test('joint ability tests succeed on equality without borrowing strict combat rules',()=>{
  const before=heroes();
  assert.equal(dualAbilityCheck(before,['a','b'],'speed',10,dice(2)).success,true);
  assert.equal(dualAbilityCheck(before,['a'],'speed',7,dice(1),1).success,true);
  assert.throws(()=>dualAbilityCheck(before,['a','a'],'speed',1,dice(1)));
  assert.deepEqual(before,heroes());
});

test('automatic extra lives require more than100rings and never spend the rings',()=>{
  const base=heroes(),at100=dualRings(base,'a',100,100),at101=dualRings(at100,'a',1,100),later=dualRings(at101,'a',1,100);
  assert.equal(at100.a.lives,3);assert.deepEqual([at101.a.rings,at101.a.lives],[101,4]);assert.equal(later.a.lives,4);assert.equal(base.a.rings,0);
  const cleared=dualHit(later,'a').heroes;assert.equal(dualRings(cleared,'a',101,100).a.lives,5);
});
test('heroes have independent rings, shields and lives;either death ends the adventure',()=>{
  const h=heroes();h.a.rings=5;h.b.lives=1;
  assert.deepEqual([dualHit(h,'a').heroes.a.rings,dualHit(h,'a').heroes.b.lives],[0,1]);
  assert.equal(dualHit(h,'b').gameOver,true);h.b.shield=true;assert.equal(dualHit(h,'b').gameOver,false);
});
test('a successful attack defeats the foe without any counterattack',()=>{
  const f=dualRound(startDualFight(heroes(),encounter()),{},dice(2));assert.equal(f.status,'win');assert.equal(f.history[0].counter,undefined);
});
test('joint equality misses and a counter of fifteen misses',()=>{
  const e=encounter({enemies:[{name:'Opponent',rating:10,heroes:['a','b'],ability:'speed'}]});
  const f=dualRound(startDualFight(heroes(),e),{},dice(2,5));assert.equal(f.status,'fighting');assert.equal(f.history[0].success,false);assert.equal(f.history[0].counter.hit,false);
});
test('joint counterattacks select the injured hero using the printed split',()=>{
  const e=encounter({enemies:[{name:'Opponent',rating:11,heroes:['a','b'],ability:'speed'}]});
  assert.equal(dualRound(startDualFight(heroes(),e),{},dice(1,5,3)).heroes.b.lives,2);
  assert.equal(dualRound(startDualFight(heroes(),e),{},dice(1,5,4)).heroes.a.lives,2);
});
test('a ring loss can continue where a lost life exits;actor-specific hit rules remain separate',()=>{
  const h=heroes();h.a.rings=1;const e=encounter({exits:{a:{when:'lifeLost',section:'retry'}}});
  const first=dualRound(startDualFight(h,e),{},dice(1,4));assert.equal(first.status,'fighting');
  const second=dualRound(first,{},dice(1,4));assert.equal(second.status,'loss');assert.equal(second.section,'retry');
  const any=encounter({exits:{a:{when:'hit',section:'caught'}}});assert.equal(dualRound(startDualFight(h,any),{},dice(1,4)).section,'caught');
});
test('each opponent uses its declared hero and ability in source order',()=>{
  const e=encounter({enemies:[{name:'First',rating:7,hero:'a',ability:'speed'},{name:'Second',rating:3,hero:'b',ability:'strength'}]});
  let f=dualRound(startDualFight(heroes(),e),{},dice(2));assert.equal(f.opponentIndex,1);f=dualRound(f,{},dice(1));assert.equal(f.status,'win');assert.equal(f.history[1].actors[0],'b');
});
test('companions add a changing bonus and can intercept hits;none cannot absorb a hit',()=>{
  const e=encounter({enemies:[{name:'Opponent',rating:12,hero:'a',ability:'speed'}],helperBonus:true,helperHitSplit:true});
  const f=dualRound(startDualFight(heroes(),e,[{name:'Helper'}]),{},dice(1,1,4));assert.equal(f.helpers[0].knockedOut,true);assert.equal(f.heroes.a.lives,3);
  const next=dualRound(f,{},dice(1,1));assert.equal(next.heroes.a.lives,2);assert.equal(next.history[1].total,6);
});
test('Chaos bolts strengthen the boss and suits stop five but not six',()=>{
  const r={countDice:2,blueOn:1,mutateOn:[5,6],suitProtectsOn:[5]};const burst=dualChaosBurst(r,dice(2,2,1,5,6,1));
  assert.deepEqual(burst,{faces:[1,5,6,1],blueBonus:2,greenFaces:[5,6]});
  const helpers=resolveDualChaos(r,burst,[{name:'Helper',suit:true}],[0,0]);assert.equal(helpers[0].mutated,true);
  const e=dualChaosEncounter({chaos:{mutant:{name:'Mutant',rating:7,hero:'a',ability:'speed'},boss:{name:'Boss',rating:10,hero:'a',ability:'strength'}}},burst,helpers);
  assert.deepEqual(e.enemies.map(x=>[x.rating,x.ability]),[[7,'speed'],[12,'strength']]);
});
test('missing source abilities and invalid green-bolt targets stay explicit',()=>{
  assert.throws(()=>startDualFight(heroes(),encounter({enemies:[{name:'Opponent',rating:7,hero:'a',ability:null}]})));
  assert.throws(()=>resolveDualChaos({suitProtectsOn:[5]},{greenFaces:[6]},[{name:'Helper'}],[2]));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim227.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? {sim227:structuredClone(saved)} : {};
  const dice = [];
  const context = vm.createContext({
    currentPlaythrough:()=>pt, saveState:()=>{}, showAlert:()=>{}, escapeHtml:v=>v,
    t:(key,params)=>JSON.stringify({key,params}),
    Math:Object.assign(Object.create(Math),{random:()=>{
      assert.ok(dice.length,'unexpected dice roll');
      return (dice.shift()-1)/6;
    }}),
  });
  vm.runInContext(source+'\n_renderAll = () => {};',context);
  const run = s=>vm.runInContext(s,context);
  const d = run('_data()');
  return {d,run,roll:(...values)=>{dice.push(...values);run('_runRound()');assert.equal(dice.length,0);}};
}

function ready(f) {
  Object.assign(f.d.player,{skill:6,skillInitial:6,stamina:20,staminaInitial:20,luck:6});
  Object.assign(f.d.enemy,{name:'Main',skill:6,stamina:12,staminaMax:12});
  Object.assign(f.d.sideEnemy,{name:'Side',skill:6,staminaMax:8});
  Object.assign(f.d.sideEnemy2,{name:'Third',skill:6,staminaMax:8});
  f.d.rolled=true;
  return f;
}

test('paired opponents share one player attack roll',()=>{
  const f=ready(fixture());f.d.pairedFight=true;
  f.roll(1,2,1,1,6,6);
  assert.equal(f.d.enemy.stamina,10);
  assert.equal(f.d.player.stamina,18);
  assert.equal(f.d.sideEnemy.staminaMax,8);
  assert.equal(f.d.pendingLuckQueue.length,2);
});

test('three opponents share the same player attack strength',()=>{
  const f=ready(fixture());f.d.pairedFight=true;f.d.tripleFight=true;
  f.roll(1,2,1,1,6,6,5,6);
  assert.equal(f.d.player.stamina,16);
  assert.equal(f.d.pendingLuckQueue.length,3);
});

test('fatal side damage overrides victory and clears pending luck',()=>{
  const f=ready(fixture());f.d.pairedFight=true;
  f.d.player.stamina=2;f.d.enemy.stamina=2;
  f.roll(1,2,1,1,6,6);
  assert.equal(f.d.enemy.stamina,0);
  assert.equal(f.d.player.stamina,0);
  assert.equal(f.d.history.length,1);
  assert.equal(f.d.history[0].outcome,'loss');
  assert.equal(f.d.pendingLuckQueue.length,0);
  f.run('_runRound()');assert.equal(f.d.history.length,1);
});

test('legacy fights retain independent rolls and saved statistics',()=>{
  const saved=ready(fixture()).d;delete saved.combatRulesVersion;
  saved.pairedFight=true;saved.player.attackModifier=-1;
  const f=fixture(saved);
  f.roll(2,2,1,1,6,6,1,1);
  assert.equal(f.d.player.stamina,20);
  assert.equal(f.d.enemy.stamina,10);
  f.run('_resetEncounterKnobs(_data())');
  assert.equal(f.d.combatRulesVersion,2);
  assert.equal(f.d.player.skill,6);
  assert.equal(f.d.player.stamina,20);
});

test('ties and configured main-enemy wounds remain unchanged',()=>{
  const f=ready(fixture());f.d.player.enemyWoundDamage=3;
  f.roll(1,2,1,2);
  assert.equal(f.d.player.stamina,20);
  assert.equal(f.d.enemy.stamina,12);
  f.roll(1,1,6,6);
  assert.equal(f.d.player.stamina,17);
});

for (const legacy of [false,true]) {
  test(`nonlethal victory blocks further combat (${legacy?'legacy':'source'})`,()=>{
    const saved=ready(fixture()).d;if(legacy)delete saved.combatRulesVersion;
    saved.player.enemyStaminaFloor=4;saved.enemy.stamina=4;saved.roundsThisBattle=5;
    saved.history.push({enemy:'Main',outcome:'win',ts:1});
    const f=fixture(saved),before=JSON.stringify(f.d);
    f.run('_runRound()');assert.equal(JSON.stringify(f.d),before);
  });
  test(`meal is available after nonlethal victory (${legacy?'legacy':'source'})`,()=>{
    const saved=ready(fixture()).d;if(legacy)delete saved.combatRulesVersion;
    Object.assign(saved.player,{enemyStaminaFloor:4,stamina:10,provisions:2,hitsLandedThisFight:3});
    saved.enemy.stamina=4;saved.roundsThisBattle=5;saved.extension={kept:true};
    const f=fixture(saved);f.run('_eatMeal()');
    assert.equal(f.d.player.stamina,14);assert.equal(f.d.player.provisions,1);
    assert.equal(f.d.enemy.stamina,4);assert.equal(f.d.roundsThisBattle,5);
    assert.equal(f.d.player.hitsLandedThisFight,3);assert.equal(f.d.extension.kept,true);
  });
}

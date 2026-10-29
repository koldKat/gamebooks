import { readRosterDocument } from '../../helpers/roster-db.cjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';
const roster = readRosterDocument(236);

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim236.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim236: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s, showAlert: () => {},
    createRosterLoader: (_id, dataset, install) => { install(roster.enemies.filter(row => row.stats.dataset === dataset).map(row => row.stats.entry)); return () => Promise.resolve(); } });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  return { run, d };
}

function ready() {
  const f = fixture();
  Object.assign(f.d.player, { skill: 8, skillInitial: 8, stamina: 12, staminaInitial: 20, luck: 8 });
  Object.assign(f.d.enemy, { name: 'Ogre', skill: 9, stamina: 10, staminaMax: 10 });
  f.d.rolled = true;
  return f;
}

test('new Heroism adds a temporary bonus without changing character SKILL', () => {
  const f = ready();
  f.run('_useHeroism()');
  assert.equal(f.d.player.skill, 8);
  assert.equal(f.d.player.stamina, 14);
  assert.equal(f.run('_effectiveSkill(_data())'), 10);
  f.d.player.demonSlayingSword = true;
  assert.equal(f.run('_effectiveSkill(_data())'), 14);
  f.run('_useHeroism()');
  assert.equal(f.d.player.stamina, 14);
  assert.equal(f.d.heroismSkillBonus, 2);
});

test('Heroism survives a reload of the same new fight', () => {
  const f = ready();
  f.run('_useHeroism()');
  const saved = JSON.parse(JSON.stringify(f.d));
  const loaded = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
  assert.equal(loaded.run('_effectiveSkill(_data())'), 10);
});

test('Heroism ends on victory, loss or a new encounter', () => {
  for (const end of ["_recordOutcome(_data(), 'win')", "_recordOutcome(_data(), 'loss')", '_resetEncounterKnobs(_data())']) {
    const f = ready();
    f.run('_useHeroism(); ' + end);
    assert.equal(f.d.heroismSkillBonus, 0);
    assert.equal(f.d.player.skill, 8);
    assert.equal(f.run('_effectiveSkill(_data())'), 8);
  }
});

test('existing saved character and fight remain unchanged on load', () => {
  const saved = JSON.parse(JSON.stringify(ready().d));
  delete saved.temporaryHeroism;
  delete saved.heroismSkillBonus;
  saved.player.skill = 10;
  saved.player.heroismUsedThisFight = true;
  saved.roundsThisBattle = 3;
  saved.pendingLuckQueue = [{ kind: 'enemy-hit' }];
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run("_recordOutcome(_data(), 'win')");
  assert.equal(f.d.player.skill, 10);
});

test('old fights keep the old rule until a new encounter starts', () => {
  const saved = JSON.parse(JSON.stringify(ready().d));
  delete saved.temporaryHeroism;
  delete saved.heroismSkillBonus;
  const f = fixture(saved);
  f.run('_useHeroism()');
  assert.equal(f.d.player.skill, 10);
  f.run('_resetEncounterKnobs(_data()); _useHeroism()');
  assert.equal(f.d.player.skill, 10);
  assert.equal(f.run('_effectiveSkill(_data())'), 12);
});

test('Heroism cannot be activated midfight', () => {
  const f = ready();
  f.d.roundsThisBattle = 1;
  const before = JSON.stringify(f.d);
  f.run('_useHeroism()');
  assert.equal(JSON.stringify(f.d), before);
});

test('combat uses the bonus and clears it when the enemy falls', () => {
  const f = ready();
  f.run('_roll2d6 = () => 7; _useHeroism(); _runRound()');
  assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.player.stamina, 14);
  assert.equal(f.d.player.skill, 8);
  f.run('_skipLuck()');
  f.d.enemy.stamina = 2;
  f.run('_runRound()');
  assert.equal(f.d.enemy.stamina, 0);
  assert.equal(f.d.heroismSkillBonus, 0);
  assert.equal(f.d.history.at(-1).outcome, 'win');
  assert.equal(f.d.player.skill, 8);
});

test('combat clears the bonus when the player falls', () => {
  const f = ready();
  f.run('_roll2d6 = () => 7; _useHeroism()');
  f.d.enemy.skill = 20;
  f.d.player.stamina = 2;
  f.run('_runRound()');
  assert.equal(f.d.player.stamina, 0);
  assert.equal(f.d.heroismSkillBonus, 0);
  assert.equal(f.d.history.at(-1).outcome, 'loss');
  assert.equal(f.d.player.skill, 8);
});

function servant() {
  const f = ready();
  Object.assign(f.d.enemy, { name: 'First Demonic Servant (§116)', skill: 6, stamina: 10, staminaMax: 10 });
  f.run('_roll2d6 = () => 7');
  return f;
}

for (const [name, matches] of [['DEMONIC SERVANT (§254)',true],['Custom demonic servant helper',true],['Notademonic Servant',false],['Demonic Servants',false]]) {
  test('metadata preserves custom-name word boundaries: ' + name, () => {
    const f = servant(); f.d.enemy.name = name;
    f.run('_runRound(); _skipLuck(); _runRound()');
    assert.equal(f.d.enemy.stamina,matches?0:6);
  });
}

test('Servant identification follows the installed metadata rather than a code fallback', () => {
  const f=servant(); f.run('SERVANT_NAME_RULES = [/custom sentinel/i]');
  f.run('_runRound(); _skipLuck(); _runRound()');assert.equal(f.d.enemy.stamina,6);
  const custom=servant();custom.d.enemy.name='Custom Sentinel';
  custom.run('SERVANT_NAME_RULES = [/custom sentinel/i]; _runRound(); _skipLuck(); _runRound()');
  assert.equal(custom.d.enemy.stamina,0);
});

test('two successive blows destroy a Servant, including through armour', () => {
  for (const armour of [false, true]) {
    const f = servant();
    f.d.player.thickArmour = armour;
    f.run('_runRound(); _skipLuck(); _runRound()');
    assert.equal(f.d.enemy.stamina, 0);
    assert.equal(f.d.pendingLuckQueue.length, 0);
    assert.equal(f.d.history.length, 1);
    assert.equal(f.d.history[0].outcome, 'win');
  }
});

test('a tied or lost round interrupts successive Servant blows', () => {
  for (const skill of [8, 9]) {
    const f = servant();
    f.run('_runRound(); _skipLuck()');
    f.d.enemy.skill = skill;
    f.run('_runRound(); _skipLuck()');
    f.d.enemy.skill = 6;
    f.run('_runRound()');
    assert.equal(f.d.enemy.stamina, 6);
    f.run('_skipLuck(); _runRound()');
    assert.equal(f.d.enemy.stamina, 0);
  }
});

test('successive blow tracking survives reload but never transfers opponents', () => {
  const f = servant();
  f.run('_runRound(); _skipLuck()');
  const loaded = fixture(JSON.parse(JSON.stringify(f.d)));
  loaded.run('_roll2d6 = () => 7; _runRound()');
  assert.equal(loaded.d.enemy.stamina, 0);
  f.d.enemy.name = 'Second Demonic Servant (§116)';
  f.run('_runRound()');
  assert.equal(f.d.enemy.stamina, 6);
});

test('ordinary enemies do not acquire the Servant instant-kill rule', () => {
  const f = ready();
  f.d.enemy.skill = 6;
  f.run('_roll2d6 = () => 7; _runRound(); _skipLuck(); _runRound()');
  assert.equal(f.d.enemy.stamina, 6);
  assert.equal(f.d.lastServantHit, null);
});

test('legacy Servant fights are unchanged until explicitly reset or replaced', () => {
  const saved = JSON.parse(JSON.stringify(servant().d));
  delete saved.consecutiveServantHits;
  delete saved.lastServantHit;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('_roll2d6 = () => 7; _runRound(); _skipLuck(); _runRound()');
  assert.equal(f.d.enemy.stamina, 6);
  assert.equal(f.d.consecutiveServantHits, undefined);
  f.run('_resetBattle()');
  assert.equal(f.d.consecutiveServantHits, true);
  assert.equal(f.d.lastServantHit, null);
  f.run('_runRound(); _skipLuck(); _runRound()');
  assert.equal(f.d.enemy.stamina, 0);
  const next = fixture(saved);
  next.run('_resetEncounterKnobs(_data())');
  assert.equal(next.d.consecutiveServantHits, true);
  assert.equal(next.d.lastServantHit, null);
});

test('Luck applies the printed ordinary and armoured wound amounts', () => {
  for (const armour of [false, true]) {
    for (const lucky of [false, true]) {
      const f = ready();
      f.d.player.thickArmour = armour;
      f.d.enemy.skill = 6;
      f.d.player.luck = lucky ? 12 : 1;
      f.run('_roll2d6 = () => 7; _runRound(); _testLuck()');
      const damage = armour ? (lucky ? 2 : 0) : (lucky ? 4 : 1);
      assert.equal(f.d.enemy.stamina, 10 - damage);
      assert.equal(f.d.player.luck, lucky ? 11 : 0);
      assert.equal(f.d.pendingLuckQueue.length, 0);
    }
  }
});

test('Luck reduces an enemy wound to one or increases it to three', () => {
  for (const lucky of [false, true]) {
    const f = ready();
    f.d.player.luck = lucky ? 12 : 1;
    f.run('_roll2d6 = () => 7; _runRound(); _testLuck()');
    assert.equal(f.d.player.stamina, lucky ? 11 : 9);
    assert.equal(f.d.player.luck, lucky ? 11 : 0);
  }
});

test('Myurr cannot be wounded with an ordinary weapon', () => {
  const f = ready();
  f.d.player.myurrFight = true;
  f.d.enemy.name = 'Myurr';
  f.d.enemy.skill = 6;
  f.run('_roll2d6 = () => 7; _runRound()');
  assert.equal(f.d.enemy.stamina, 10);
  assert.equal(f.d.player.stamina, 12);
  assert.equal(f.d.pendingLuckQueue.length, 0);
});

test('Myurr receives only one wound while making two attacks', () => {
  const f = ready();
  f.d.player.myurrFight = true;
  f.d.player.demonSlayingSword = true;
  f.d.enemy.name = 'Myurr';
  f.d.enemy.skill = 6;
  f.run('_roll2d6 = () => 7; _runRound()');
  assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.pendingLuckQueue.length, 1);
  const losing = ready();
  losing.d.player.myurrFight = true;
  losing.d.enemy.name = 'Myurr';
  losing.d.enemy.skill = 20;
  losing.run('_roll2d6 = () => 7; _runRound()');
  assert.equal(losing.d.player.stamina, 8);
  assert.equal(losing.d.pendingLuckQueue.length, 2);
});

test('Myurr extra attacks come from the installed database settings',()=>{
  for(const extra of [0,2]){
    const f=ready();f.d.player.myurrFight=true;f.d.enemy.skill=20;
    f.run(`MYURR_RULES.extraAttacks=${extra}; _roll2d6=()=>7; _runRound()`);
    assert.equal(f.d.player.stamina,12-2*(1+extra));
    assert.equal(f.d.pendingLuckQueue.length,1+extra);
  }
});

test('both database datasets share one roster fetch and parsed response',async()=>{
  const rules=await import('../../../public/js/battlesim/books/236/definition.js?single-fetch-check');let requests=0,parses=0;
  const fetcher=async path=>{requests++;assert.equal(path,'/api/books/236/enemies');return {ok:true,json:async()=>{parses++;return roster.enemies;}};};
  await rules.loadRoster(fetcher);assert.equal(requests,1);assert.equal(parses,1);
  assert.equal(rules.SERVANT_NAME_RULES.length,1);assert.equal(rules.MYURR_RULES.extraAttacks,1);
  await rules.loadRoster(fetcher);assert.equal(requests,1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';
const roster=JSON.parse(readFileSync(new URL('../../../data/simulator-rosters/240.json',import.meta.url),'utf8'));

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim240.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim240: structuredClone(saved) } : {};
  let saves = 0;
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() { saves++; }, t: k => k, escapeHtml: s => s, createRosterLoader: (_id,dataset,install)=>{install(roster.enemies.filter(row=>row.stats.dataset===dataset).map(row=>row.stats.entry));return ()=>Promise.resolve();} });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { d: run('_data()'), run, saves: () => saves };
}

test('new characters start without provisions and cannot eat an unowned meal', () => {
  const { d, run, saves } = fixture();
  assert.equal(d.player.provisionsLeft, 0);
  d.rolled = true;
  d.player.stamina = 10;
  d.player.staminaInitial = 20;
  run('_eatProvisions()');
  assert.equal(d.player.stamina, 10);
  assert.equal(d.player.provisionsLeft, 0);
  assert.equal(saves(), 0);
});

test('saved character and fight state are unchanged on repeated loading', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedCombatRules;
  saved.player.provisionsLeft = 7;
  saved.rolled = true;
  saved.enemy = { name: 'Clown', skill: 9, stamina: 6, staminaMax: 10 };
  saved.roundsThisBattle = 3;
  saved.log = ['Existing battle'];
  const { d, run, saves } = fixture(saved);
  run('_data(); _data()');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  assert.equal(saves(), 0);
});

function combat(legacy = false) {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  if (legacy) delete saved.correctedCombatRules;
  saved.rolled = true;
  Object.assign(saved.player, { skill: 6, stamina: 20, staminaInitial: 20, luck: 12, weapon: 'axe' });
  saved.enemy = { name: 'Clown', skill: 20, stamina: 20, staminaMax: 20 };
  const f = fixture(saved);
  f.run('_roll2d6 = () => 7');
  return f;
}

test('enemy damage is independent of the player axe in new fights only', () => {
  for (const legacy of [false, true]) {
    const { d, run } = combat(legacy);
    run('_runRound()');
    assert.equal(d.player.stamina, legacy ? 16 : 18);
  }
});

test('final chainmail hit keeps its Luck damage table after armour breaks', () => {
  for (const lucky of [false, true]) {
    const { d, run } = combat();
    Object.assign(d.player, { armour: 'chainmail', armourHitsLeft: 1, luck: lucky ? 12 : 1 });
    run('_runRound()');
    assert.equal(d.player.armour, 'none');
    assert.equal(d.player.stamina, 19);
    run('_testLuck()');
    assert.equal(d.player.stamina, lucky ? 20 : 18);
    assert.equal(d.player.armourHitsLeft, 0);
  }
});

test('unarmoured Lucky and Unlucky wounds total one and three points', () => {
  for (const lucky of [false, true]) {
    const { d, run } = combat();
    d.player.luck = lucky ? 12 : 1;
    run('_runRound(); _testLuck()');
    assert.equal(d.player.stamina, lucky ? 19 : 17);
  }
});

test('Luck refunds Voivod only the final damage actually inflicted', () => {
  const { d, run } = combat();
  d.voivodThrives = true;
  run('_runRound(); _testLuck()');
  assert.equal(d.player.stamina, 19);
  assert.equal(d.enemy.stamina, 21);
});

test('plate absorbs its final hit without queuing a phantom wound', () => {
  const { d, run } = combat();
  Object.assign(d.player, { armour: 'plate', armourHitsLeft: 1 });
  run('_runRound()');
  assert.equal(d.player.stamina, 20);
  assert.equal(d.player.armour, 'none');
  assert.equal(d.pendingLuckQueue.length, 0);
});

test('reset does not silently upgrade legacy combat rules', () => {
  const { d, run } = combat(true);
  run('_resetBattle()');
  assert.equal(d.correctedCombatRules, undefined);
});

test('legacy states without a provision field retain their existing fallback', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.player.provisionsLeft;
  const { d, run } = fixture(saved);
  assert.equal(d.player.provisionsLeft, 10);
  run('_data()');
  assert.equal(d.player.provisionsLeft, 10);
});

test('owned meals still heal four points and consume exactly one provision', () => {
  const { d, run, saves } = fixture();
  d.rolled = true;
  d.player.provisionsLeft = 2;
  d.player.stamina = 10;
  d.player.staminaInitial = 20;
  run('_eatProvisions()');
  assert.equal(d.player.stamina, 14);
  assert.equal(d.player.provisionsLeft, 1);
  assert.equal(saves(), 1);
});

test('resetting a fight does not grant or remove provisions', () => {
  for (const count of [0, 7]) {
    const { d, run } = fixture();
    d.player.provisionsLeft = count;
    run('_resetBattle()');
    assert.equal(d.player.provisionsLeft, count);
  }
});

for(const legacy of [false,true]){
  for(const method of ['_runRound','_rollForSkull','_empowerSpear','_useSpearAutoWin']){
    test(`pending Luck blocks ${method} (${legacy?'legacy':'current'})`,()=>{
      const {d,run}=combat(legacy);d.pendingLuckQueue=[{kind:'player-hit',extension:true}];d.immuneToWounds=d.voivodDefensive=true;
      Object.assign(d.player,{hasSpear:true,spearLifeForce:10,spearRolled:true});run('_roll1d6=()=>6');
      const saved=JSON.stringify(d);run(method+'()');assert.equal(JSON.stringify(d),saved);
    });
  }
  test(`skipping Luck persists the remaining queue (${legacy?'legacy':'current'})`,()=>{
    const {d,run,saves}=combat(legacy);d.pendingLuckQueue=[{kind:'player-hit'},{kind:'enemy-hit',extension:true}];
    const before=saves();run('_skipLuck()');assert.equal(saves(),before+1);assert.equal(d.pendingLuckQueue.length,1);assert.equal(d.pendingLuckQueue[0].extension,true);
  });
  test(`obsolete outgoing Luck cannot resurrect completed target (${legacy?'legacy':'current'})`,()=>{
    const {d,run}=combat(legacy);d.enemy.stamina=0;d.player.luck=1;d.history.push({outcome:'win',ts:1});
    d.pendingLuckQueue=[{kind:'player-hit',extension:true},{kind:'enemy-hit',extension:true}];run('_testLuck()');
    assert.equal(d.enemy.stamina,0);assert.equal(d.player.luck,1);assert.equal(d.history.length,1);assert.equal(d.pendingLuckQueue.length,0);
  });
  test(`Luck cannot revive an already defeated player (${legacy?'legacy':'current'})`,()=>{
    const {d,run}=combat(legacy);d.player.stamina=0;d.history.push({outcome:'loss',ts:1});d.pendingLuckQueue=[{kind:'enemy-hit'}];run('_testLuck()');
    assert.equal(d.player.stamina,0);assert.equal(d.player.luck,12);assert.equal(d.history.length,1);assert.equal(d.pendingLuckQueue.length,0);
  });
  test(`fatal side damage clears obsolete outgoing choices (${legacy?'legacy':'current'})`,()=>{
    const {d,run}=combat(legacy);d.player.stamina=1;d.enemy.skill=0;d.groupFight=true;d.sideEnemies=[{name:'Side',skill:99}];run('_runRound()');
    assert.equal(d.player.stamina,0);assert.equal(d.history.length,1);assert.equal(d.history[0].outcome,'loss');assert.equal(d.pendingLuckQueue.length,0);
  });
}

test('all six skull faces retain their result and metadata controls the winning face',()=>{
  for(let face=1;face<=6;face++){
    const {d,run}=combat();d.immuneToWounds=true;run('_roll1d6=()=>'+face+'; _rollForSkull()');
    assert.equal(d.enemy.stamina,face===6?0:20);assert.equal(d.history.length,face===6?1:0);
  }
  const {d,run}=combat();d.immuneToWounds=true;run('SHADOW_RULES.skullWinFace=2; _roll1d6=()=>2; _rollForSkull()');assert.equal(d.enemy.stamina,0);assert.equal(d.history.length,1);
});

for(const legacy of [false,true])for(const field of ['weapon','armour']){
  test(`pending Luck locks ${field} selection (${legacy?'legacy':'current'})`,()=>{
    const {d,run}=combat(legacy);d.player.armour='chainmail';d.player.armourHitsLeft=1;d.pendingLuckQueue=[{kind:'player-hit'}];
    const handler=source.match(new RegExp("document\\.getElementById\\('sim240-"+field+"'\\)\\.addEventListener\\('change', e => \\{([\\s\\S]*?)\\n  \\}\\);"))[1];
    run('_renderInputs=()=>{}');const saved=JSON.stringify(d);run('(function(e){'+handler+'})({target:{value:"'+(field==='weapon'?'sword':'plate')+'"}})');assert.equal(JSON.stringify(d),saved);
  });
}

for(const legacy of [false,true]){
  test(`pending Luck preserves Voivod damage-refund mode (${legacy?'legacy':'current'})`,()=>{
    const {d,run}=combat(legacy);d.voivodThrives=true;d.pendingLuckQueue=[{kind:'enemy-hit',damage:2,luckyDamage:1,unluckyDamage:3}];
    const handler=source.match(/document\.getElementById\('sim240-voivod-thrives'\)\.addEventListener\('change', e => \{([\s\S]*?)\n  \}\);/)[1];
    run('_renderInputs=()=>{}');const saved=JSON.stringify(d);run('(function(e){'+handler+'})({target:{checked:false}})');assert.equal(JSON.stringify(d),saved);
  });
}

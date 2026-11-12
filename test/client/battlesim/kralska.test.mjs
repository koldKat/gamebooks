import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';

function fixture(saved, preserveDeadPlayer = true, bookId = 481) {
  const stateKey = `sim${bookId}`;
  const pt = saved ? { [stateKey]: structuredClone(saved) } : {};
  const math = Object.create(Math);
  let rolls = [0, 0];
  math.random = () => rolls.shift() ?? 0;
  const source = readFileSync(new URL('../../../public/js/battlesim/engines/kralska.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
    .replace('return { init, render, setVisible };', 'return { data: _data, applyEnemy: _applyEnemy, round: _runRound, reset: _resetBattle };');
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key,
    escapeHtml: value => value, document: { getElementById: () => null } });
  vm.runInContext(source + '\nglobalThis.factory = createKralskaSim; globalThis.resolve = resolveRound;', context);
  const sim = context.factory({ bookId, idPrefix: stateKey, stateKey, i18nPrefix: `battlesim${bookId}`, startSila: 5, startIzd: 20, preserveDeadPlayer });
  return { sim, setRolls: values => { rolls = values; }, resolve: context.resolve };
}

test('Кралска кръв: all opposed dice totals use the printed one-point damage and harmless ties', () => {
  const f = fixture();
  for (let player = 1; player <= 6; player++) for (let enemy = 1; enemy <= 6; enemy++) {
    f.setRolls([(player - 0.5) / 6, (enemy - 0.5) / 6]);
    const result = f.resolve(5, 3);
    assert.equal(result.playerTotal, 5 + player);
    assert.equal(result.enemyTotal, 3 + enemy);
    assert.equal(result.playerLoss, 5 + player < 3 + enemy ? 1 : 0);
    assert.equal(result.enemyLoss, 5 + player > 3 + enemy ? 1 : 0);
  }
});

test('481: new characters start at 5/20 without changing saved characters or fights', () => {
  const fresh = fixture().sim.data();
  assert.deepEqual(JSON.parse(JSON.stringify(fresh.player)), { sila: 5, izd: 20 });
  const saved = JSON.parse(JSON.stringify(fresh));
  saved.player = { sila: 9, izd: 31 };
  saved.enemy = { name: 'saved', sila: 3, izd: 5, curIzd: 2, hasStats: true };
  saved.log = ['saved log'];
  saved.history = [{ enemy: 'saved', outcome: 'win', ts: 1 }];
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).sim.data())), saved);
});

test('481: selecting a future enemy cannot resurrect a dead player', () => {
  const f = fixture(), data = f.sim.data();
  data.player.izd = 0;
  f.sim.applyEnemy(data, { name: 'enemy', attack: 3, hp: 6 });
  assert.equal(data.player.izd, 0);
  f.sim.round();
  assert.equal(data.enemy.curIzd, 6);
  assert.equal(data.history.length, 0);
});

test('alternating group: all three opponents keep separate HP and victory requires defeating every one', () => {
  const f=fixture(),d=f.sim.data();d.player.sila=100;
  f.sim.applyEnemy(d,{name:'Three orcs',attack:3,hp:5,stats:{groupMode:'alternating',groupCount:3}});
  for(let round=1;round<=15;round++) {
    f.sim.round();
    assert.equal(d.history.length,round===15?1:0,'no partial group victories');
    assert.equal(d.enemy.group.reduce((sum,hp)=>sum+hp,0),15-round);
    if(round<13)assert.equal(d.enemy.activeIndex,round%3);
  }
  assert.deepEqual(Array.from(d.enemy.group),[0,0,0]);
  assert.equal(d.history[0].outcome,'win');assert.equal(d.history[0].enemy,'Three orcs');
  f.sim.round();assert.equal(d.history.length,1,'completed fight cannot award again');
});

test('alternating group: ties and losses advance turns, defeated opponents are skipped, reset and reload preserve fight semantics', () => {
  const f=fixture(),d=f.sim.data();d.player.sila=3;
  const preset={name:'Orcs',attack:3,hp:5,stats_json:{groupMode:'alternating',groupCount:3}};
  f.sim.applyEnemy(d,preset);f.sim.round();assert.equal(d.enemy.activeIndex,1);assert.deepEqual(Array.from(d.enemy.group),[5,5,5]);
  d.player.sila=0;f.sim.round();assert.equal(d.player.izd,19);assert.equal(d.enemy.activeIndex,2);
  d.enemy.group=[0,1,5];d.enemy.activeIndex=1;d.enemy.curIzd=1;d.player.sila=100;f.sim.round();
  assert.equal(d.enemy.activeIndex,2);assert.equal(d.enemy.curIzd,5);assert.equal(d.history.length,0);
  const resumed=fixture(d).sim.data();assert.deepEqual(JSON.parse(JSON.stringify(resumed)),JSON.parse(JSON.stringify(d)));
  f.sim.reset();assert.deepEqual(Array.from(d.enemy.group),[5,5,5]);assert.equal(d.enemy.activeIndex,0);assert.equal(d.player.izd,19);
  f.sim.applyEnemy(d,{name:'Single',attack:3,hp:5});assert.equal(d.enemy.group,undefined,'single fights retain their original behavior');
});

test('alternating group: player death records one loss and cannot resume by selecting an opponent', () => {
  const f=fixture(),d=f.sim.data();d.player.sila=0;d.player.izd=1;
  const preset={name:'Orcs',attack:3,hp:5,stats_json:{groupMode:'alternating',groupCount:3}};
  f.sim.applyEnemy(d,preset);f.sim.round();assert.equal(d.player.izd,0);assert.equal(d.history.length,1);
  assert.equal(d.history[0].outcome,'loss');f.sim.round();assert.equal(d.history.length,1);
  f.sim.applyEnemy(d,preset);f.sim.round();assert.equal(d.player.izd,0);assert.equal(d.history.length,1);
});

test('sequential group: five one-hit opponents require five victories and keep the current target on ties/losses', () => {
  const f=fixture(undefined,true,486),d=f.sim.data();d.player.sila=6;
  f.sim.applyEnemy(d,{name:'Five skeletons',attack:6,hp:1,stats:{groupMode:'sequential',groupCount:5}});
  f.sim.round();assert.equal(d.enemy.activeIndex,0,'tie keeps current duel');
  d.player.sila=0;f.sim.round();assert.equal(d.enemy.activeIndex,0);assert.equal(d.player.izd,19);
  d.player.sila=100;
  for(let defeated=1;defeated<=5;defeated++){
    f.sim.round();assert.equal(d.enemy.group.filter(hp=>hp===0).length,defeated);
    assert.equal(d.history.length,defeated===5?1:0,'all five are one completed encounter');
  }
  assert.equal(d.history[0].outcome,'win');
  const resumed=fixture(d,true,486).sim.data();assert.deepEqual(JSON.parse(JSON.stringify(resumed)),JSON.parse(JSON.stringify(d)));
});

test('existing alternating group saves without a mode keep their original turn order', () => {
  const f=fixture(),d=f.sim.data();d.player.sila=100;
  f.sim.applyEnemy(d,{name:'Orcs',attack:3,hp:5,stats:{groupMode:'alternating',groupCount:3}});
  delete d.enemy.groupMode;const old=JSON.stringify(d);
  const resumed=fixture(d);assert.equal(JSON.stringify(resumed.sim.data()),old);
  resumed.sim.round();assert.equal(resumed.sim.data().enemy.activeIndex,1);
});

test('491: two undead alternate through all twelve HP before one group victory', () => {
  const f=fixture(undefined,true,491),d=f.sim.data();d.player.sila=100;
  f.sim.applyEnemy(d,{name:'Two undead',attack:3,hp:6,stats:{groupMode:'alternating',groupCount:2}});
  for(let round=1;round<=12;round++){
    f.sim.round();
    assert.equal(d.enemy.group.reduce((sum,hp)=>sum+hp,0),12-round);
    assert.equal(d.history.length,round===12?1:0);
    if(round<11)assert.equal(d.enemy.activeIndex,round%2);
  }
});

test('491: dragon poison doubles only incoming damage; protection, ties and ordinary presets remain correct', () => {
  const f=fixture(undefined,true,491),d=f.sim.data();d.player.sila=0;
  f.sim.applyEnemy(d,{name:'Poison dragon',attack:4,hp:6,stats:{incomingDamage:2,damageProtectionLabel:'Protective herb'}});
  f.sim.round();assert.equal(d.player.izd,18);assert.equal(d.enemy.curIzd,6);
  d.enemy.damageProtected=true;f.sim.round();assert.equal(d.player.izd,17);
  const saved=JSON.stringify(d);assert.equal(JSON.stringify(fixture(d,true,491).sim.data()),saved);
  d.player.sila=4;f.sim.round();assert.equal(d.player.izd,17,'ties cause no poison damage');
  d.player.sila=100;f.sim.round();assert.equal(d.enemy.curIzd,5,'player hits remain one point');
  f.sim.applyEnemy(d,{name:'Ordinary duel',attack:4,hp:6});
  assert.equal(d.enemy.incomingDamage,undefined);assert.equal(d.enemy.damageProtected,undefined);
  d.player.sila=0;f.sim.round();assert.equal(d.player.izd,16);
});

test('unaudited serials retain their existing enemy-selection behavior', () => {
  const f = fixture(undefined, false), data = f.sim.data();
  data.player.izd = 0;
  f.sim.applyEnemy(data, { name: 'enemy', attack: 3, hp: 6 });
  assert.equal(data.player.izd, 20);
});

test('486: enemy selection preserves death and existing saved fights', () => {
  const wrapper = readFileSync(new URL('../../../public/js/battlesim/battlesim486.js', import.meta.url), 'utf8');
  assert.match(wrapper, /preserveDeadPlayer:\s*true/);
  const initial = JSON.parse(JSON.stringify(fixture(undefined, true, 486).sim.data()));
  initial.player = { sila: 7, izd: 0 };
  initial.enemy = { name: 'saved enemy', sila: 6, izd: 1, curIzd: 1, hasStats: true };
  initial.log = ['existing fight'];
  const f = fixture(initial, true, 486);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sim.data())), initial);
  f.sim.applyEnemy(f.sim.data(), { name: 'new enemy', attack: 5, hp: 12 });
  assert.equal(f.sim.data().player.izd, 0);
  f.sim.round();
  assert.equal(f.sim.data().enemy.curIzd, 12);
});

test('491: enemy selection preserves death and existing saved fights', () => {
  const wrapper = readFileSync(new URL('../../../public/js/battlesim/battlesim491.js', import.meta.url), 'utf8');
  assert.match(wrapper, /preserveDeadPlayer:\s*true/);
  const initial = JSON.parse(JSON.stringify(fixture(undefined, true, 491).sim.data()));
  initial.player = { sila: 7, izd: 0 };
  initial.enemy = { name: 'saved enemy', sila: 3, izd: 6, curIzd: 2, hasStats: true };
  initial.log = ['existing fight'];
  const f = fixture(initial, true, 491);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sim.data())), initial);
  f.sim.applyEnemy(f.sim.data(), { name: 'new enemy', attack: 4, hp: 7 });
  assert.equal(f.sim.data().player.izd, 0);
  f.sim.round();
  assert.equal(f.sim.data().enemy.curIzd, 7);
  assert.equal(f.sim.data().history.length, 0);
});

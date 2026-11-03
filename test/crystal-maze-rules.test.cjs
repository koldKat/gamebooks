const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('public/js/battlesim/books/1555/combat.js', 'utf8');
const rules = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const dice = values => () => { assert.ok(values.length, 'unexpected extra die'); return values.shift(); };
const stateSource = fs.readFileSync('public/js/battlesim/books/1555/state.js', 'utf8')
  .replace("import { definition } from './definition.js';", "const definition = {id: 1555, stateKey: 'sim1555'};");
const stateModule = import('data:text/javascript;base64,' + Buffer.from(stateSource).toString('base64'));

test('saved duel results award history once, while canceled duels and unrelated state are preserved', async () => {
  const {createState} = await stateModule;
  const run = {inventory: ['keep'], sim1544: {fight: 'keep'}};
  let saves = 0;
  const store = createState(() => ({currentBookId: 1555, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => { data.fight = {name: 'Custom opponent', outcome: 'win'}; });
  store.change(() => {});
  assert.equal(store.read().history.length, 1);
  store.change(data => { data.fight = {name: 'Canceled opponent', outcome: 'cancelled'}; });
  assert.equal(store.read().history.length, 1);
  assert.deepEqual(run.inventory, ['keep']);
  assert.deepEqual(run.sim1544, {fight: 'keep'});
  assert.equal(saves, 3);
});

test('saved state rejects a run or book change during an action', async () => {
  const {createState} = await stateModule;
  for (const target of ['run', 'book']) {
    let run = {}, book = 1555, saves = 0;
    const original = run;
    const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
    const changed = store.change(data => { data.fight = {outcome: 'win'}; if (target === 'run') run = {}; else book = 1; });
    assert.equal(changed, false);
    assert.deepEqual(original, {});
    assert.equal(saves, 0);
  }
});

test('opposed checks require one success and one failure; ties continue', async () => {
  const { startFight, advanceFight } = await rules;
  const start = startFight({ mode: 'opposed', playerRating: 7, enemyRating: 7 });
  for (const values of [[1, 1, 1, 1], [6, 6, 6, 6]]) {
    const next = advanceFight(start, dice(values));
    assert.equal(next.outcome, null);
    assert.equal(next.rounds, 1);
  }
  assert.equal(advanceFight(start, dice([3, 4, 4, 4])).outcome, 'win');
  assert.equal(advanceFight(start, dice([4, 4, 3, 4])).outcome, 'loss');
  assert.equal(start.rounds, 0);
});

test('dexterity duel uses the supplied current ratings without changing character stats', async () => {
  const { startFight, advanceFight } = await rules;
  const fight = startFight({ mode: 'opposed', attribute: 'dexterity', playerRating: 6, enemyRating: 9 });
  const result = advanceFight(fight, dice([3, 3, 5, 5]));
  assert.equal(result.outcome, 'win');
  assert.equal(result.playerRating, 6);
  assert.equal(result.enemyRating, 9);
});

test('crossbow initiative and yellow misses alternate without inventing damage', async () => {
  const { startFight, advanceFight } = await rules;
  const start = startFight({ mode: 'crossbow', playerRating: 3, enemyRating: 2, first: 'enemy' });
  const miss = advanceFight(start, dice([3]));
  assert.equal(miss.outcome, null);
  assert.equal(miss.next, 'player');
  const win = advanceFight(miss, dice([3]));
  assert.equal(win.outcome, 'win');
  assert.equal(advanceFight(start, dice([2])).outcome, 'loss');
  assert.equal(start.next, 'enemy');
});

test('all-red bolts always score a kill on the next shot', async () => {
  const { startFight, advanceFight } = await rules;
  const start = startFight({ mode: 'crossbow', playerRating: 6, enemyRating: 3, first: 'enemy' });
  const miss = advanceFight(start, dice([4]));
  assert.equal(advanceFight(miss, dice([6])).outcome, 'win');
});

test('cancelling has no combat reward outcome and cannot reroll a finished duel', async () => {
  const { startFight, advanceFight, cancelFight } = await rules;
  const fight = startFight({ mode: 'opposed', playerRating: 7, enemyRating: 7 });
  const cancelled = cancelFight(fight);
  assert.equal(cancelled.outcome, 'cancelled');
  assert.equal(fight.outcome, null);
  assert.throws(() => advanceFight(cancelled));
});

test('invalid ratings, modes and dice are rejected', async () => {
  const { startFight, advanceFight } = await rules;
  for (const playerRating of ['', null, -1, 7, 2.5]) {
    assert.throws(() => startFight({ mode: 'crossbow', playerRating, enemyRating: 3 }));
  }
  assert.throws(() => startFight({ mode: 'campaign', playerRating: 7, enemyRating: 7 }));
  const fight = startFight({ mode: 'opposed', playerRating: 7, enemyRating: 7 });
  assert.throws(() => advanceFight(fight, () => 0));
});

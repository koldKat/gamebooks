import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startFirearmFight, resolveFirearmTurn, firearmTurn, validateFirearmFight, firearmReport, cancelFirearmFight}
  from '../../../public/js/battlesim/engines/real-life-firearms/core.js';

const foe = (name = 'Synthetic opponent', skill = 7) => ({name, skill});
const start = (spec = {}, skill = 7) => startFirearmFight(skill,
  {opponents: [foe()], winTarget: '2', lossTarget: '3', ...spec});
const reload = fight => JSON.parse(JSON.stringify(fight));
const step = (fight, rolls = [3, 4], options = {}) => resolveFirearmTurn(reload(fight), rolls, options);

test('equality kills without Wounds, while a miss permits retaliation and leaves input unchanged', () => {
  const original = start();
  const won = step(original);
  assert.equal(won.status, 'win'); assert.equal(won.destination, '2');
  assert.equal(won.opponents[0].alive, false); assert.equal(original.opponents[0].alive, true);
  assert.equal(Object.hasOwn(won.hero, 'wounds'), false); assert.equal(Object.hasOwn(won.opponents[0], 'wounds'), false);
  const missed = step(original, [4, 4]); assert.equal(firearmTurn(missed).attackerId, 'enemy0');
  const lost = step(missed); assert.equal(lost.status, 'loss'); assert.equal(lost.hero.alive, false);
  assert.throws(() => step(lost));
});

test('double one has no automatic hit or critical rule when a roll penalty takes it above skill', () => {
  const f = step(start({heroRollPenalty: 1}, 2), [1, 1]);
  assert.equal(f.opponents[0].alive, true); assert.equal(f.log[0].hit, false);
  assert.equal(f.log[0].adjusted, 3); assert.equal(firearmTurn(f).attackerId, 'enemy0');
});

test('ordered guard shooting continues on a hit and stops on the first miss', () => {
  let f = start({chainHeroHits: true, opponents: [foe('First', 0), foe('Second', 0)],
    enemyRollPenalty: 2, enemyShotsEachLimit: 2, interruptionTarget: '4'});
  assert.throws(() => step(f, [3, 4], {target: 'enemy1'}));
  f = step(f); assert.deepEqual(firearmTurn(f).targets, ['enemy1']);
  f = step(f, [6, 6]); assert.equal(firearmTurn(f).attackerId, 'enemy1');
  f = step(f, [1, 1]); assert.equal(f.opponents[1].shots, 1); assert.equal(f.log.at(-1).adjusted, 4);
  f = step(f, [6, 6]); f = step(f, [1, 1]);
  assert.equal(f.status, 'interrupted'); assert.equal(f.destination, '4'); assert.equal(f.hero.alive, true);
  assert.equal(f.opponents[1].shots, 2); assert.equal(f.opponents[0].shots, 0);
});

test('two missed guard volleys stop after each living guard has fired twice', () => {
  let f = start({chainHeroHits: true, opponents: [foe('First', 0), foe('Second', 0)],
    enemyShotsEachLimit: 2, interruptionTarget: '4'});
  for (let round = 0; round < 2; round++) {
    f = step(f, [6, 6]); f = step(f, [6, 6]); f = step(f, [6, 6]);
  }
  assert.equal(f.status, 'interrupted'); assert.deepEqual(f.opponents.map(row => row.shots), [2, 2]);
  assert.equal(f.log.length, 6);
});

test('simultaneous mutual hits resolve both rolls and the hero loss takes priority', () => {
  const f = step(start({mode: 'simultaneous', heroRollPenalty: 1, enemyRollPenalty: 1}),
    {hero: [3, 3], enemy: [3, 3]});
  assert.equal(f.status, 'loss'); assert.equal(f.destination, '3'); assert.equal(f.log.length, 2);
  assert.equal(f.hero.alive, false); assert.equal(f.opponents[0].alive, false);
  assert.throws(() => step(start({mode: 'simultaneous'}), {hero: [3, 3]}));
});

test('simultaneous victory needs a hero hit and enemy miss; two misses start another round', () => {
  const spec = {mode: 'simultaneous', heroRollPenalty: 1, enemyRollPenalty: 1, opponents: [foe('Synthetic', 2)]};
  const f = step(start(spec), {hero: [3, 3], enemy: [1, 1]});
  assert.equal(f.status, 'win'); assert.equal(f.hero.alive, true); assert.equal(f.log[1].adjusted, 3);
  const missed = step(start(spec), {hero: [6, 6], enemy: [6, 6]});
  assert.equal(missed.status, 'fighting'); assert.equal(missed.round, 2);
});

test('Resistance odd and even successful totals kill one and two enemies in printed order', () => {
  let f = start({mode: 'ambush', resistanceParityKills: true, opponents: Array.from({length: 5}, (_, i) => foe('Enemy ' + i)),
    allies: [foe('Synthetic companion')]});
  f = step(f); assert.deepEqual(f.log[0].killed, ['enemy0']);
  f = step(f, [3, 3]); assert.deepEqual(f.log[1].killed, ['enemy1', 'enemy2']);
  assert.deepEqual(f.opponents.map(row => row.alive), [false, false, false, true, true]);
  assert.equal(firearmTurn(f).attackerId, 'enemy3'); assert.equal(firearmTurn(f).targetId, 'hero');
});

test('extra enemy shooters require an explicit target instead of inventing a repeated target cycle', () => {
  let f = start({mode: 'ambush', opponents: Array.from({length: 4}, (_, i) => foe('Enemy ' + i, 0)),
    allies: [foe('Companion A', 0), foe('Companion B', 0)]}, 0);
  for (let i = 0; i < 6; i++) f = step(f, [6, 6]);
  assert.equal(firearmTurn(f).attackerId, 'enemy3'); assert.equal(firearmTurn(f).requiresTarget, true);
  assert.deepEqual(firearmTurn(f).targets, ['hero', 'ally0', 'ally1']);
  assert.throws(() => step(f, [6, 6]));
  f = step(f, [6, 6], {target: 'ally1'}); assert.equal(f.round, 2);
  assert.equal(f.log.at(-1).target, 'ally1'); assert.equal(firearmTurn(f).attackerId, 'hero');
});

test('loss occurs when all companions die even if the hero is still alive', () => {
  let f = start({mode: 'ambush', opponents: [foe('First'), foe('Second')], allies: [foe('Companion', 0)]}, 0);
  f = step(f, [6, 6]); f = step(f, [6, 6]); f = step(f, [6, 6]); f = step(f, [1, 1]);
  assert.equal(f.hero.alive, true); assert.equal(f.allies[0].alive, false);
  assert.equal(f.status, 'loss'); assert.equal(f.destination, '3'); assert.equal(firearmTurn(f), null);
});

test('ordinary custom opponents are selectable, enemy initiative works, and snapshots/report/cancellation remain independent', () => {
  let f = start({opponents: [foe('First'), foe('Second')]});
  assert.equal(firearmTurn(f).requiresTarget, true); assert.throws(() => step(f));
  f = step(f, [3, 4], {target: 'enemy1'}); assert.equal(f.opponents[1].alive, false);
  assert.equal(firearmTurn(f).attackerId, 'enemy0');
  const first = start({opponentFirst: true}); assert.equal(firearmTurn(first).attackerId, 'enemy0');
  const restored = reload(f); validateFirearmFight(restored); assert.deepEqual(firearmReport(restored), firearmReport(f));
  const report = firearmReport(f); report.log[0].hit = false; assert.equal(f.log[0].hit, true);
  assert.equal(cancelFirearmFight(f).status, 'cancelled'); assert.equal(f.status, 'fighting');
  assert.throws(() => startFirearmFight('', {opponents: [foe()]}));
  assert.throws(() => step(start(), [0, 6])); assert.throws(() => start({enemyRollPenalty: -1}));
  assert.throws(() => validateFirearmFight({...f, queue: ['unknown']}));
});

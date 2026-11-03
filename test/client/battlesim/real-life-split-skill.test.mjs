import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startRealLifeFight, realLifeStep, realLifeTurn, skipRealLifeOpening} from '../../../public/js/battlesim/engines/real-life/core.js';

const start = (extra = {}, player = {}) => startRealLifeFight({strength: 8, sword: 8, firearm: 7, wounds: 10, ...player}, {
  name: 'Group combat', section: 'custom', splitSkillAttacks: true,
  opponents: [0, 1, 2].map(index => ({name: 'Foe ' + index, skill: 6, wounds: 4})), ...extra});
const step = (fight, options = {}, dice = [2, 2]) => realLifeStep(fight, options, () => {
  assert.ok(dice.length); return dice.shift();
});

test('split attacks roll independently against every foe and retain the original divisor after a kill', () => {
  let f = step(start(), {splitSkill: true, target: 'enemy0'}, [1, 1]);
  assert.equal(f.opponents[0].wounds, 0);
  assert.deepEqual(realLifeTurn(f).targets, ['enemy1', 'enemy2']);
  f = step(JSON.parse(JSON.stringify(f)), {target: 'enemy1'}, [1, 2]);
  assert.equal(f.opponents[1].wounds, 4);
  assert.equal(f.log.at(-1).skill, 8 / 3);
  assert.throws(() => step(f, {target: 'enemy1'}));
  assert.throws(() => step(f, {defensive: true}));
  f = step(f, {target: 'enemy2'}, [1, 1]);
  assert.equal(f.opponents[2].wounds, 0);
  assert.equal(realLifeTurn(f).attacker, 'enemy1');
  f = step(f, {}, [6, 6]);
  assert.equal(f.round, 1);
  f = step(f, {target: 'enemy1'}, [3, 4]);
  assert.equal(f.log.at(-1).skill, 8);
  assert.equal(f.opponents[1].wounds, 3);
});

test('full skill strikes only one foe and each surviving enemy then has one attack', () => {
  let f = step(start(), {target: 'enemy1'});
  assert.deepEqual(f.opponents.map(e => e.wounds), [4, 3, 4]);
  for (let index = 0; index < 3; index++) {
    assert.equal(realLifeTurn(f).attacker, 'enemy' + index);
    f = step(f, {}, [6, 6]);
  }
  assert.equal(f.round, 1);
  f = step(f, {splitSkill: true});
  assert.equal(f.log.at(-1).splitDivisor, 3);
  assert.equal(realLifeTurn(f).attacker, 'hero');
});

test('an optional opening shot can target only its printed foe and removes that foe on any success', () => {
  const spec = {openingFirearm: true, openingRemovesTarget: true, openingTargetIndex: 2};
  const original = start(spec);
  assert.deepEqual(realLifeTurn(original).targets, ['enemy2']);
  assert.throws(() => step(original, {target: 'enemy0'}));
  const hit = step(original, {target: 'enemy2'}, [3, 4]);
  assert.equal(hit.opponents[2].outOfFight, true);
  assert.equal(hit.opening, false);
  assert.equal(realLifeTurn(hit).attacker, 'hero');
  assert.equal(step(hit, {splitSkill: true}).log.at(-1).splitDivisor, 2);
  const missed = step(original, {}, [4, 4]);
  assert.ok(missed.opponents.every(e => !e.outOfFight));
  assert.equal(missed.opening, false);
  assert.equal(skipRealLifeOpening(original).opening, false);
  assert.equal(original.opening, true);
});

test('a failed split attack does not damage another foe and double one kills only its target', () => {
  let f = step(start(), {splitSkill: true}, [6, 6]);
  assert.deepEqual(f.opponents.map(e => e.wounds), [4, 4, 4]);
  f = step(f, {target: 'enemy1'}, [1, 1]);
  assert.deepEqual(f.opponents.map(e => e.wounds), [4, 0, 4]);
  assert.deepEqual(realLifeTurn(f).targets, ['enemy2']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOpponents} from '../../../public/js/battlesim/opponents.js';

const fields = [{key: 'skill'}, {key: 'stamina', min: 1}, {key: 'damage', step: 0.5}];
test('freeform opponent values are validated without mutating presets or saved objects', () => {
  const preset = {name: 'source-key', displayName: 'My opponent', skill: '7', stamina: '12', damage: '1.5', special: true};
  const before = JSON.stringify(preset);
  assert.deepEqual(validateOpponents([preset], fields), [{...preset, skill: 7, stamina: 12, damage: 1.5}]);
  assert.equal(JSON.stringify(preset), before);
  for (const value of ['', null, undefined, NaN, Infinity, '-1', '1.1']) {
    assert.throws(() => validateOpponents([{...preset, skill: value}], fields), RangeError);
  }
  assert.throws(() => validateOpponents([{...preset, stamina: 0}], fields), RangeError);
  assert.throws(() => validateOpponents([], fields), RangeError);
  assert.throws(() => validateOpponents(Array(101).fill(preset), fields), RangeError);
});

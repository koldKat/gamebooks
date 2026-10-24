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

test('explicitly derived stats stay unavailable without relaxing validation of fixed opponents', () => {
  const derived = {name: 'Living rage', dynamic: 'mirror', skill: null, stamina: '', damage: null};
  const unavailable = (_key, row) => row.dynamic === 'mirror';
  assert.deepEqual(validateOpponents([derived], fields, unavailable),
    [{...derived, skill: null, stamina: null, damage: null, displayName: 'Living rage'}]);
  assert.throws(() => validateOpponents([derived], fields), RangeError);
  assert.throws(() => validateOpponents([derived, {name: 'Fixed foe', skill: '', stamina: 12, damage: 1}], fields, unavailable), RangeError);
  assert.equal(derived.stamina, '', 'Preserve supplied setup');
});

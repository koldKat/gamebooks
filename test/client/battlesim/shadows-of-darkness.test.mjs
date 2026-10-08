import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import translations from '../../../public/js/i18n/en/battlesim/battlesim661.js';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim661.js', import.meta.url), 'utf8');
const resolveSource = source.slice(source.indexOf('function _resolve()'), source.indexOf('function _renderResolution()'));
const side = formType => ({ formType, sila: 8, lovkost: 7, barzina: 6, umenie: 5, formSila: 4, formLovkost: 3, formBarzina: 2 });

test('matching forms expose components instead of inventing a universal combat total', () => {
  for (const [type, stat] of [['rock', 'sila'], ['paper', 'lovkost'], ['scissors', 'barzina']]) {
    const data = { player: side(type), enemy: side(type) };
    const before = structuredClone(data);
    const resolve = new Function('_data', 'STAT_BY_TYPE', '_generalStat', '_formStat', `${resolveSource}; return _resolve;`)(
      () => data,
      { rock: 'sila', paper: 'lovkost', scissors: 'barzina' },
      (s, key) => s[key],
      (s, key) => s[{ sila: 'formSila', lovkost: 'formLovkost', barzina: 'formBarzina' }[key]],
    );
    const result = resolve();
    assert.equal(result.tie, true);
    assert.equal(result.statKey, stat);
    assert.equal(result.playerGeneral, data.player[stat]);
    assert.equal(result.playerSkill, 5);
    assert.equal(result.enemySkill, 5);
    assert.equal('playerTotal' in result, false);
    assert.equal('enemyTotal' in result, false);
    assert.deepEqual(data, before);
    for (const parameter of translations['battlesim661.resolve.tie'].matchAll(/\{(\w+)\}/g)) {
      assert.ok(parameter[1] === 'stat' || parameter[1] in result);
    }
  }
});

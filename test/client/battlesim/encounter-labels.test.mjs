import test from 'node:test';
import assert from 'node:assert/strict';
import { ARKHAM_ENCOUNTERS } from '../../../public/js/battlesim/engines/arkham-darkness.js';
import { KINGSPORT_ENCOUNTERS } from '../../../public/js/battlesim/engines/kingsport.js';

test('new encounter labels lead with enemy names, not section numbers', async () => {
  for (const id of [521, 522, 523, 524, 548, 555, 557]) {
    const { default: strings } = await import(`../../../public/js/i18n/en/battlesim/battlesim${id}.js`);
    assert.equal(strings[`battlesim${id}.encounter_label`], '{enemy} ({section})');
  }
});

test('every Arkham encounter has a descriptive, distinct display label', async () => {
  for (const [id, encounters] of [[555, ARKHAM_ENCOUNTERS], [557, KINGSPORT_ENCOUNTERS]]) {
    const { default: strings } = await import(`../../../public/js/i18n/en/battlesim/battlesim${id}.js`);
    const labels = encounters.map(({ section }) => {
      const name = strings[`battlesim${id}.enemy.${section}`];
      assert.ok(name && /[A-Za-z]/.test(name) && !/^Section\b/.test(name), `Missing enemy name for ${id}/${section}`);
      return `${name} (${section})`;
    });
    assert.equal(new Set(labels).size, encounters.length);
  }
});

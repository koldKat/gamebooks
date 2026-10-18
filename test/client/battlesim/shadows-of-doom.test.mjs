import test from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTERS} from '../../../public/js/battlesim/books/903/definition.js';
import {createCharacter, lookupCode, startFight, applyCode} from '../../../public/js/battlesim/books/903/combat.js';
import {createState} from '../../../public/js/battlesim/books/903/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim903.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim903.js';

test('all fifty codes preserve the original lookup symbols', () => {
  const rows = ['.-...', '-..+.', '..-.+', '..+--', '.+-.-', '+..-.', '-.--.', '..+..', '++-.-', '.-.-+'];
  for (const [row, symbols] of rows.entries()) for (const [column, symbol] of [...symbols].entries()) {
    const code = String.fromCharCode(65 + row) + (column + 1);
    assert.deepEqual(lookupCode(' ' + code.toLowerCase() + ' '), {
      code, result: {'.': 'continue', '+': 'win', '-': 'wounded'}[symbol],
    });
  }
  for (const code of ['', 'A0', 'K1', 'A6', 'А1', 'A1x']) assert.throws(() => lookupCode(code));
});

test('eighteen original cards keep printed strength and outcome destinations', () => {
  const expected = [[3,6,70,142],[6,5,75,110],[9,6,87,131],[14,2,96,105],[21,2,125,80],
    [29,1,79,145],[33,6,79,145],[39,6,96,105],[46,3,75,110],[61,3,87,131],
    [64,6,79,145],[77,6,125,80],[102,6,125,80],[116,1,70,142],[122,5,87,131],
    [128,5,70,142],[135,4,75,110],[144,5,96,105]];
  assert.deepEqual(ENCOUNTERS.map(card => [Number(card.id), card.strength, card.win, card.wounded]), expected);
  for (const card of ENCOUNTERS) {
    for (let strength = 1; strength <= 5; strength++) {
      const original = startFight({strength, notes: ['keep']}, {...card, displayName: 'Custom name'});
      const before = structuredClone(original), win = applyCode(original, 'B4'), wound = applyCode(original, 'A2');
      assert.deepEqual(original, before);
      assert.equal(win.outcome, 'win'); assert.equal(win.destination, card.win);
      assert.equal(win.player.strength, strength); assert.equal(win.enemy.displayName, 'Custom name');
      assert.equal(wound.player.strength, strength - 1);
      assert.equal(wound.outcome, strength === 1 ? 'dead' : 'wounded');
      assert.equal(wound.destination, strength === 1 ? null : card.wounded);
      assert.deepEqual(wound.player.notes, ['keep']);
      assert.throws(() => applyCode(win, 'A1'));
    }
  }
  assert.throws(() => startFight({strength: 0}, ENCOUNTERS[0]));
  assert.throws(() => startFight({strength: 6}, ENCOUNTERS[0]));
  assert.throws(() => startFight(createCharacter(), {id: '999'}));
});

test('unresolved codes never invent damage or extra card rows', () => {
  let fight = startFight(createCharacter(), ENCOUNTERS[0]);
  for (let i = 0; i < 200; i++) fight = applyCode(fight, 'A1');
  assert.equal(fight.round, 5); assert.equal(fight.player.strength, 5);
  assert.equal(fight.outcome, null); assert.equal(fight.finalContinuation, true);
  assert.equal(fight.turns.length, 50);
});

test('state updates isolate runs and record each outcome once', () => {
  let bookId = 903, run = {other: {keep: true}}, saves = 0;
  const store = createState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  store.ensure();
  store.change(data => {data.fight = applyCode(startFight(data.character, ENCOUNTERS[0]), 'B4');});
  store.change(() => {});
  assert.equal(store.read().history.length, 1); assert.equal(store.read().history[0].outcome, 'win');
  const previous = run, before = structuredClone(run), writes = saves;
  assert.equal(store.change(() => {run = {};}), false);
  assert.deepEqual(previous, before); assert.equal(saves, writes);
  bookId = 904; assert.equal(store.read(), null); assert.equal(store.change(() => {}), false);
  bookId = 903; store.ensure(); assert.equal(store.read().character.strength, 5);
  assert.equal(store.read().history.length, 0);
  const fresh = structuredClone(run);
  assert.throws(() => store.change(data => {data.character.strength = 0; throw Error('abort');}));
  assert.throws(() => store.change(() => Promise.resolve()));
  assert.deepEqual(run, fresh);
});

test('translations have matching keys and substitution fields', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  const fields = text => (text.match(/\{[^}]+\}/g) || []).sort();
  for (const key of Object.keys(en)) assert.deepEqual(fields(en[key]), fields(bg[key]), key);
  assert.equal(bg['battlesim903.title'], 'Сенки от Ада');
});

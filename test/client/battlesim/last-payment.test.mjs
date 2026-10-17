import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/833/combat.js';
import { encounterPreset, ENCOUNTERS } from '../../../public/js/battlesim/books/833/definition.js';
import { createState } from '../../../public/js/battlesim/books/833/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim833.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim833.js';

const start = (section = 7, changes = {}, opponent = {}, chip = false) => {
  const preset = encounterPreset(section);
  return combat.startFight({...combat.newCharacter(), ...changes}, {...preset, ...opponent}, preset, chip);
};
const attack = (fight, dice) => combat.resolveAttack(dice.reduce((f, die) => combat.rollPlayer(f, die), fight));

test('dictionaries match keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
});

test('printed starting values, skill limits and account death', () => {
  assert.deepEqual(combat.newCharacter(), {life: 100, money: 10000000, skills: []});
  assert.equal(combat.validateCharacter({...combat.newCharacter(), money: 0}).life, 100);
  assert.equal(combat.validateCharacter({...combat.newCharacter(), money: -1}).life, 0);
  assert.throws(() => start(7, {skills: ['hacking', 'hacking']}));
  assert.throws(() => start(7, {life: 101}));
});
test('all 23 encounters retain distinct printed exceptions', () => {
  assert.equal(ENCOUNTERS.length, 23);
  assert.equal(encounterPreset(51).multiplier, 4); assert.equal(encounterPreset(97).multiplier, 3);
  assert.equal(encounterPreset(18).hp, 60); assert.equal(encounterPreset(30).hp, 40);
  assert.equal(encounterPreset(20).repeatEnemyOnOne, true);
  assert.equal(encounterPreset(59).repeatEnemyOnOne, undefined);
});
test('first repeated die stops the roll and distinct count determines squared damage', () => {
  const f = attack(start(), [2, 4, 5, 4]);
  assert.equal(f.hp, 31); assert.equal(f.phase, 'enemy'); assert.equal(f.character.life, 100);
  assert.throws(() => combat.rollPlayer(f, 6));
  assert.throws(() => combat.resolveAttack(combat.rollPlayer(start(), 1)));
});
test('adrenaline rerolls a duplicate without losing the earlier unique results', () => {
  let f = [2, 3, 3].reduce((state, die) => combat.rollPlayer(state, die), start());
  f = combat.buyInFight(f, 'adrenaline');
  f = attack(f, [5, 6, 2]);
  assert.equal(f.hp, 24); assert.equal(f.character.money, 9000000);
  assert.throws(() => combat.buyInFight(f, 'adrenaline'));
});
test('mindhacks may exceed six unique results and are charged per use', () => {
  let f = [1, 2, 3, 4, 5, 6, 1].reduce((state, die) => combat.rollPlayer(state, die), start(3));
  f = combat.buyInFight(f, 'mindhack'); f = combat.resolveAttack(f);
  assert.equal(f.hp, 51); assert.equal(f.character.money, 7000000);
});
test('published three-round example preserves money, damage and brutality', () => {
  let f = combat.startFight(combat.newCharacter(), {displayName: 'Пазач', hp: 30, multiplier: 3, bonus: 0});
  f = attack(f, [2, 4, 5, 4]); f = combat.rollEnemy(f, 4);
  assert.equal(f.hp, 21); assert.equal(f.character.life, 88);
  f = [2, 3, 3].reduce((state, die) => combat.rollPlayer(state, die), f);
  f = combat.buyInFight(f, 'adrenaline'); f = attack(f, [5, 6, 2]); f = combat.rollEnemy(f, 2);
  assert.equal(f.hp, 5); assert.equal(f.character.life, 82);
  f = [2, 3, 4, 5, 4].reduce((state, die) => combat.rollPlayer(state, die), f);
  f = combat.buyInFight(f, 'mindhack'); f = combat.resolveAttack(f);
  assert.equal(f.hp, -20); assert.equal(f.outcome, 'win'); assert.equal(f.character.money, 8000000);
  assert.throws(() => combat.rollEnemy(f, 6));
});
test('each new turn resets only its dice and bonus counts', () => {
  let f = combat.buyInFight(combat.rollPlayer(start(), 1), 'mindhack');
  f = attack(f, [1]); f = combat.rollEnemy(f, 2);
  assert.deepEqual(f.seen, []); assert.equal(f.bonusCounts, 0);
  assert.equal(f.character.money, 7000000); assert.equal(f.hp, 36);
});
test('trikopter succeeds at 80 without requiring its destruction', () => {
  let f = attack(start(13), [1, 2, 3, 4, 5, 1]);
  assert.equal(f.hp, 75); assert.equal(f.outcome, 'win'); assert.equal(f.destination, '4');
  assert.equal(f.character.money, 10000000);
  f = attack(start(13), [1, 1]); f = combat.rollEnemy(f, 1);
  f = attack(f, [1, 1]); f = combat.rollEnemy(f, 1);
  assert.equal(f.outcome, 'loss'); assert.equal(f.destination, '57');
});
test('three-round survival requires surviving the final enemy response', () => {
  let f = start(6);
  for (let i = 0; i < 3; i++) { f = attack(f, [1, 1]); f = combat.rollEnemy(f, 1); }
  assert.equal(f.outcome, 'win'); assert.equal(f.hp, 97); assert.equal(f.destination, '17');
  let g = attack(start(6, {life: 5}), [1, 1]); g = combat.rollEnemy(g, 1);
  assert.equal(g.outcome, 'loss'); assert.equal(g.character.life, 0);
});
test('deadline loss and victory in the last permitted turn', () => {
  let f = start(32);
  f = attack(f, [1, 1]); f = combat.rollEnemy(f, 1);
  f = attack(f, [1, 1]); f = combat.rollEnemy(f, 1);
  assert.equal(f.outcome, 'loss'); assert.equal(f.character.life, 0);
  let g = start(32, {}, {hp: 26});
  g = attack(g, [1, 1]); g = combat.rollEnemy(g, 1);
  g = attack(g, [1, 2, 3, 4, 5, 1]);
  assert.equal(g.outcome, 'win'); assert.equal(g.destination, '45');
  let h = start(41);
  for (let i = 0; i < 3; i++) { h = attack(h, [1, 1]); h = combat.rollEnemy(h, 1); }
  assert.equal(h.outcome, 'loss'); assert.equal(h.destination, '23');
});
test('security chip grants two player attacks per enemy response', () => {
  let f = attack(start(51, {}, {}, true), [1, 1]);
  assert.equal(f.phase, 'rolling'); assert.equal(f.character.life, 100);
  f = attack(f, [1, 1]); assert.equal(f.phase, 'enemy');
  f = combat.rollEnemy(f, 2); assert.equal(f.character.life, 92);
  assert.throws(() => start(7, {}, {}, true));
});
test('razor die one repeats enemy turn without a forced loop or arbitrary cap', () => {
  let f = attack(start(20), [1, 1]);
  f = combat.rollEnemy(f, 1); assert.equal(f.phase, 'enemy'); assert.equal(f.character.life, 93);
  f = combat.rollEnemy(f, 1); assert.equal(f.character.life, 86);
  f = combat.rollEnemy(f, 2); assert.equal(f.phase, 'rolling'); assert.equal(f.character.life, 78);
});
test('services obey prices, cannot revive and cannot buy on an enemy turn', () => {
  assert.equal(combat.purchase({...combat.newCharacter(), life: 10}, 'codeine').life, 100);
  assert.equal(combat.purchase(combat.newCharacter(), 'subcontractor').money, 6000000);
  assert.equal(combat.purchase(combat.newCharacter(), 'premonition').money, 4000000);
  assert.throws(() => combat.purchase({...combat.newCharacter(), life: 0}, 'codeine'));
  assert.throws(() => combat.buyInFight(start(7, {money: 0}), 'mindhack'));
  assert.throws(() => combat.buyInFight(attack(start(), [1, 1]), 'mindhack'));
});
test('results are immutable and cancellation retains money already spent', () => {
  const initial = start(), before = structuredClone(initial);
  let f = combat.buyInFight(combat.rollPlayer(initial, 1), 'mindhack');
  assert.deepEqual(initial, before);
  f = combat.cancelFight(f); assert.equal(f.character.money, 7000000); assert.equal(f.outcome, 'cancelled');
  assert.throws(() => combat.rollPlayer(f, 2));
});

test('saved state records outcomes once and rejects stale books or runs', () => {
  let book = 833, run = {}, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => { data.fight = attack(start(7, {}, {hp: 1}), [1, 1]); });
  store.change(() => {}); assert.equal(run.sim833.history.length, 1);
  book = 1; assert.equal(store.change(() => {}), false); assert.equal(store.read(), null);
  book = 833; assert.equal(store.change(() => { run = {}; }), false); assert.deepEqual(run, {});
  assert.equal(saves, 2);
});

import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { warhammerCharacter, woundThreshold, warhammerRecovery, startWarhammerFight,
  warhammerRound, reloadWarhammerAfterFight } from '../../../../public/js/battlesim/engines/warhammer/core.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog = readRosterDocument(1454);
const entries = [...new Map(catalog.enemies.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
const source = section => structuredClone(entries.find(entry => entry.section === String(section)));
const defaults = entries[0].playerDefaults;
const gun = (values = {}) => ({ name: 'Test ranged weapon', s: 3, damage: 3, ammo: 10, capacity: 15, reserve: 1, ...values });
const hero = (values = {}) => warhammerCharacter({ ...defaults.basic, w: 50, maxW: 50,
  ranged: gun(), melee: { name: 'Test melee weapon', damage: 1 }, ...values });
const foe = (values = {}) => ({ name: 'Test opponent', ws: 1, s: 3, t: 3, w: 10,
  aRanged: 1, aClose: 1, armour: 0, cover: 0, ranged: null, melee: { name: 'Test weapon', damage: 1 }, ...values });
const custom = (values = {}) => ({ section: 'custom', initiative: 'you', enemies: [foe()], ...values });
function sequence(values) {
  let index = 0;
  const roll = () => { assert.ok(index < values.length, 'unexpected extra dice roll'); return values[index++]; };
  roll.used = () => index;
  return roll;
}

test('database roster reconstructs all 46 encounters and preserves their source exceptions', async () => {
  const rows = catalog.enemies.map(row => ({ name: row.name, stats: row.stats }));
  const loaded = await loadRosterDataset(1454, 'CATALOG', async () => ({ ok: true, json: async () => rows }));
  assert.equal(loaded.length, 46); assert.equal(rows.length, 109);
  assert.equal(new Set(loaded.map(entry => entry.section)).size, 46);
  assert.deepEqual(defaults.basic, { name: 'You', ws: 4, s: 3, t: 3, w: 12, maxW: 12,
    aRanged: 1, aClose: 1, purity: 5, armour: 0, cover: 0, ranged: null, melee: null, poisoned: false, burning: false });
  assert.equal(defaults.advanced.ws, 3); assert.equal(defaults.advanced.w, 10);
  assert.equal(source(120).stopWhenRemaining, 2); assert.equal(source(292).stopWhenRemaining, undefined);
  assert.equal(source(328).enemies[0].w, null);
  assert.equal(source(137).enemies[0].armour, 3);
  assert.deepEqual(source(219).enemies.map(enemy => enemy.ws), [2, 2, 3]);
  for (const entry of loaded) for (const mode of ['basic', 'advanced']) {
    const fight = startWarhammerFight(hero(), entry, mode);
    assert.equal(fight.status, 'fighting');
    assert.equal(fight.opponents.length, entry.kind === 'shooting-challenge' ? 0 : entry.enemies.length);
  }
});

test('advanced wound chart matches every printed cell, including auto and impossible', () => {
  const chart = [[4,5,6,Infinity,Infinity,Infinity], [3,4,5,6,Infinity,Infinity],
    [2,3,4,5,6,Infinity], [0,2,3,4,5,6], [0,0,2,3,4,5], [0,0,0,2,3,4]];
  chart.forEach((row,s) => row.forEach((expected,t) => assert.equal(woundThreshold(s+1,t+1), expected)));
});

test('basic combat pools unsaved hits before applying a fractional damage multiplier', () => {
  const initial = startWarhammerFight(hero({ aRanged: 2, s: 1, ranged: null, melee: { name:'Test', damage:0.5 } }), custom({ enemies: [foe({ t: 6 })] }));
  const snapshot = JSON.stringify(initial), roll = sequence([6,6,1]);
  const fight = warhammerRound(initial, { weapon:'melee' }, roll);
  assert.equal(fight.opponents[0].w, 9); assert.equal(fight.character.w, 50);
  assert.equal(roll.used(), 3); assert.equal(JSON.stringify(initial), snapshot);
  assert.equal(fight.history[0].damage[0].hits, 2);
});

test('each basic hit gets its own save and equality succeeds', () => {
  const initial = startWarhammerFight(hero({ aRanged: 2 }), custom({ enemies: [foe({ armour: 5 })] }));
  const roll = sequence([6,5,6,4,1]), fight = warhammerRound(initial, {}, roll);
  assert.equal(fight.opponents[0].w, 7); assert.equal(fight.history[0].attacks[0].saved, true);
  assert.equal(roll.used(), 5);
});

test('advanced ranged combat rolls hit then wound then only the best save', () => {
  let fight = startWarhammerFight(hero(), custom({ enemies: [foe({ armour: 6, cover: 5 })] }), 'advanced');
  fight = warhammerRound(fight, {}, sequence([6,4,5])); assert.equal(fight.opponents[0].w, 10);
  fight = warhammerRound(fight, {}, sequence([6,4,4])); assert.equal(fight.opponents[0].w, 7);
  assert.equal(fight.character.ranged.ammo, 8);
  assert.equal(fight.history[0].attacks[0].saveThreshold, 5);
});

test('advanced Close Combat uses own Strength and rounds up; cover is unavailable', () => {
  const initial = startWarhammerFight(hero({ ws: 3, melee: { name: 'Test', damage: 1.5 } }),
    custom({ skipRanged: true, enemies: [foe({ cover: 1 })] }), 'advanced');
  const fight = warhammerRound(initial, {}, sequence([4,4,1]));
  assert.equal(fight.opponents[0].w, 5); assert.equal(fight.history[0].attacks[0].saveThreshold, undefined);
});

test('all initiative enemies attack first and a dead player spends no ammunition', () => {
  const initial = startWarhammerFight(hero({ w: 1 }), source(101));
  const fight = warhammerRound(initial, { weapon: 'ranged' }, sequence([6]));
  assert.equal(fight.status, 'loss'); assert.equal(fight.section, '287');
  assert.equal(fight.character.ranged.ammo, 10);
  const alivePlayer = warhammerRound(startWarhammerFight(hero(), source(101)), {}, sequence([6,6,1]));
  assert.deepEqual(alivePlayer.history[0].attacks.map(event => event.attacker), ['Zombie Dogs','Zombie Dogs','You']);
});

test('advanced reload takes a full turn, allows enemy attacks, and does not refill automatically', () => {
  const character = hero({ ranged: gun({ ammo: 0 }) });
  let fight = startWarhammerFight(character, custom({ enemies: [foe({ ws: 3, ranged: { name: 'Test', s: 3, damage: 2 } })] }), 'advanced');
  fight = warhammerRound(fight, { reload: true }, sequence([4,4]));
  assert.equal(fight.character.w, 48); assert.equal(fight.character.ranged.ammo, 15);
  assert.equal(fight.character.ranged.reserve, 0); assert.equal(fight.history[0].attacks.length, 1);
  assert.equal(character.ranged.ammo, 0);
  const reloaded = reloadWarhammerAfterFight(character);
  assert.equal(reloaded.ranged.ammo, 15); assert.equal(character.ranged.ammo, 0);
  assert.throws(() => warhammerRound(fight, { reload: true }), /reload/);
});

test('insufficient ammunition stops extra attacks and never becomes negative', () => {
  const initial = startWarhammerFight(hero({ aRanged: 2, ranged: gun({ ammo: 1 }) }), custom(), 'advanced');
  const fight = warhammerRound(initial, {}, sequence([6,4]));
  assert.equal(fight.character.ranged.ammo, 0); assert.equal(fight.opponents[0].w, 7);
  assert.equal(fight.history[0].attacks.length, 1);
});

test('voluntary Close Combat is unavailable before round one and removes cover', () => {
  let fight = startWarhammerFight(hero({ cover: 1 }), custom({ enemies: [foe({ ws: 6 })] }), 'advanced');
  assert.throws(() => warhammerRound(fight, { close: true }), /Close Combat/);
  fight = warhammerRound(fight, {}, sequence([6,4]));
  fight = warhammerRound(fight, { close: true }, sequence([1,6,4]));
  assert.equal(fight.phase, 'close'); assert.equal(fight.character.w, 47);
  assert.equal(fight.history[1].attacks[1].saveThreshold, undefined);
});

test('Korpharact changes from bolter to knife only after dropping strictly below five Wounds', () => {
  const stillRanged = warhammerRound(startWarhammerFight(hero({ ws:6, s:6, t:6, ranged:gun({s:6,damage:1}) }), source(137), 'advanced'), {}, sequence([6,1,6,2,1]));
  assert.equal(stillRanged.opponents[0].w, 5); assert.equal(stillRanged.phase, 'ranged');
  let fight = startWarhammerFight(hero({ ws: 6, s: 6, t: 6, ranged: gun({ s: 6, damage: 2 }), melee: { name: 'Test', damage: 0.5 } }), source(137), 'advanced');
  fight = warhammerRound(fight, {}, sequence([6,1,6,2,1]));
  assert.equal(fight.opponents[0].w, 4); assert.equal(fight.phase, 'close');
  assert.equal(fight.history[0].attacks[0].weapon, 'Possessed Bolter');
  fight = warhammerRound(fight, {}, sequence([6,6,6,2,1]));
  assert.equal(fight.history[1].attacks[0].weapon, 'Plague Knife');
  assert.equal(fight.character.w, 46); assert.equal(fight.character.ranged.ammo, 9);
});

test('the seven cultists stop immediately with two survivors in section120', () => {
  const initial = startWarhammerFight(hero({ ws: 6, s: 6, aRanged: 7, ranged: gun({ s: 6 }) }), source(120), 'advanced');
  const roll = sequence([6,6,6,6,6]), fight = warhammerRound(initial, { targets: [0,1,2,3,4,5,6] }, roll);
  assert.equal(fight.status, 'win'); assert.equal(fight.section, '20');
  assert.equal(fight.opponents.filter(enemy => enemy.w > 0).length, 2);
  assert.equal(fight.character.ranged.ammo, 5); assert.equal(roll.used(), 5);
});

test('section286 forces Close Combat at round three only with fewer than three kills', () => {
  let successful = startWarhammerFight(hero({ ws: 6, s: 6, ranged: gun({ s: 6 }) }), source(286), 'advanced');
  for (let target = 0; target < 3; target++) successful = warhammerRound(successful, { targets: [target] }, sequence([6]));
  assert.equal(successful.phase, 'ranged');
  let unsuccessful = startWarhammerFight(hero(), source(286), 'advanced');
  for (let i = 0; i < 3; i++) unsuccessful = warhammerRound(unsuccessful, {}, sequence([1]));
  assert.equal(unsuccessful.phase, 'close');
  assert.equal(startWarhammerFight(hero({ ranged: gun({ ammo: 0 }) }), source(292), 'advanced').phase, 'close');
});

test('the Sentinel fight lasts three surviving rounds and never replaces the human sheet', () => {
  const human = hero({ w: 17, purity: 9 });
  let fight = startWarhammerFight(human, source(213), 'advanced');
  assert.equal(fight.vehicle.w, 14); assert.equal(fight.vehicle.armour, 4);
  for (let i = 0; i < 3; i++) fight = warhammerRound(fight, {}, () => 1);
  assert.equal(fight.status, 'win'); assert.equal(fight.section, '400');
  assert.deepEqual(fight.character, human); assert.equal(fight.opponents[0].w, 25);
  const failed = warhammerRound(startWarhammerFight(human, source(213), 'advanced'), {}, () => 6);
  // Saved blows do no damage; force a later explicit near-destroyed vehicle to test death precedence.
  failed.vehicle.w = 1;
  const doomed = warhammerRound(failed, {}, sequence([6,6,1]));
  assert.equal(doomed.status, 'loss'); assert.equal(doomed.section, '26');
  assert.deepEqual(doomed.character, human);
});

test('section328 uses its own two-pack shooting tally, without enemy HP or counterattacks', () => {
  const character = hero(); let win = startWarhammerFight(character, source(328));
  for (let i = 0; i < 20; i++) win = warhammerRound(win, {}, () => 6);
  assert.equal(win.kills, 60); assert.equal(win.shotsLeft, 10); assert.equal(win.status, 'win');
  assert.equal(win.section, '9'); assert.deepEqual(win.character, character); assert.equal(win.opponents.length, 0);
  let loss = startWarhammerFight(character, source(328), 'advanced');
  for (let i = 0; i < 30; i++) loss = warhammerRound(loss, {}, () => 1);
  assert.equal(loss.status, 'loss'); assert.equal(loss.section, '360'); assert.equal(loss.kills, 0);
});

test('burning ends with combat, poison persists until an explicit cure, and healing is capped', () => {
  const initial = startWarhammerFight(hero({ ranged: gun({ fire: true }) }), custom({ enemies: [foe()] }), 'advanced');
  const fight = warhammerRound(initial, {}, sequence([6,4]));
  assert.equal(fight.opponents[0].w, 6); assert.equal(fight.opponents[0].burning, true);
  const poisoned = hero({ w: 10, poisoned: true });
  const tick = warhammerRound(startWarhammerFight(poisoned, custom(), 'advanced'), {}, sequence([1]));
  assert.equal(tick.character.w, 9); assert.equal(tick.character.poisoned, true);
  const cured = warhammerRecovery(tick.character, { wounds: 100, curePoison: true });
  assert.equal(cured.w, 50); assert.equal(cured.poisoned, false); assert.equal(poisoned.w, 10);
  const winning = warhammerRound(startWarhammerFight(hero({ poisoned: true, ranged: gun({ damage: 20 }) }), custom(), 'advanced'), {}, sequence([6,4]));
  assert.equal(winning.status, 'win'); assert.equal(winning.character.w, 49);
  assert.equal(winning.character.poisoned, true);
});

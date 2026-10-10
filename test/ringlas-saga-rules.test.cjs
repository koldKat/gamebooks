const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../public/js/battlesim/engines/ringlas-saga.js'))).toString('base64'));
const state = (values = {}) => ({ enemyId: 'icedemon', playerStamina: 25, playerTarget: 6, playerBonus: 0, enemyPenalty: 0, history: [{ outcome: 'win' }], ...values });
const setup = (values = {}) => ({ target: 8, stamina: 10, multi: false, ...values });
const rolls = (...values) => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
const never = () => { throw Error('unexpected roll'); };
async function ready(values = {}, enemy = {}) { const d = state(values); assert.equal((await engine).startRinglasFight(d, setup(enemy)), true); return d; }
test('legacy fights remain inert in the new engine', async () => {
  const d = state({ started: true }); const old = JSON.stringify(d);
  assert.deepEqual((await engine).ringlasRound(d, never), []); assert.equal(JSON.stringify(d), old);
});
test('new fights preserve current endurance, history and custom enemy values', async () => {
  const d = await ready({ playerStamina: 11 }, { target: 7, stamina: 15 });
  assert.equal(d.playerStamina, 11); assert.equal(d.enemyStamina, 15); assert.equal(d.enemyTarget, 7); assert.equal(d.history.length, 1);
});
test('group encounter adds five permanent endurance without resetting it', async () => {
  const d = await ready({ playerStamina: 11 }, { multi: true }); assert.equal(d.playerStamina, 16);
  (await engine).ringlasRound(d, rolls(8, 8, 6)); assert.equal(d.playerStamina, 16);
});
test('a dead player cannot obtain the group bonus', async () => {
  const d = state({ playerStamina: 0 }); assert.equal((await engine).startRinglasFight(d, setup({ multi: true })), false); assert.equal(d.playerStamina, 0);
});
test('drunken loss is applied before the group bonus', async () => {
  const d = await ready({ enemyId: 'armoredknight', drunk: true, playerStamina: 8 }, { multi: true }); assert.equal(d.playerStamina, 8);
});
test('drunken death cannot be undone by the group bonus', async () => {
  const d = state({ enemyId: 'armoredknight', drunk: true, playerStamina: 5, started: true });
  assert.equal((await engine).startRinglasFight(d, setup({ multi: true })), false); assert.equal(d.playerStamina, 0); assert.equal(d.started, false); assert.equal(d.winner, 'enemy');
});
for (const bonus of [false, true]) test('optional Simaut bonus ' + bonus, async () => {
  const d = await ready({ enemyId: 'simaut', simautBonus: bonus }); assert.equal(d.playerStamina, bonus ? 30 : 25);
});
test('single enemies hit only below the player target', async () => {
  const d = await ready(); (await engine).ringlasRound(d, rolls(8, 5)); assert.equal(d.playerStamina, 24); assert.equal(d.enemyStamina, 10);
});
test('single-enemy target ties cause no damage', async () => {
  const d = await ready(); (await engine).ringlasRound(d, rolls(8, 6)); assert.equal(d.playerStamina, 25); assert.equal(d.enemyStamina, 10);
});
test('group enemies hit only above the player target', async () => {
  const d = await ready({}, { multi: true }); (await engine).ringlasRound(d, rolls(8, 8, 7)); assert.equal(d.playerStamina, 29); assert.equal(d.enemyStamina, 10);
});
test('group target ties cause no damage to either side', async () => {
  const d = await ready({}, { multi: true }); (await engine).ringlasRound(d, rolls(8, 8, 6)); assert.equal(d.playerStamina, 30); assert.equal(d.enemyStamina, 10);
});
test('horse hit requires a lower roll and removes two endurance', async () => {
  const d = await ready({}, { multi: true }); (await engine).ringlasRound(d, rolls(8, 7, 6)); assert.equal(d.enemyStamina, 8);
});
test('wolf torch bonus is included in the player attack', async () => {
  const d = await ready({ enemyId: 'wolf', playerBonus: 2 }, { multi: true, target: 6 }); (await engine).ringlasRound(d, rolls(5, 6, 6)); assert.equal(d.enemyStamina, 9);
});
test('wolf scarf penalty correctly reduces group enemy attacks', async () => {
  const d = await ready({ enemyId: 'wolf', enemyPenalty: 3 }, { multi: true }); (await engine).ringlasRound(d, rolls(8, 8, 8)); assert.equal(d.playerStamina, 30);
});
test('companion gets a separate attack and enemy attack', async () => {
  const d = await ready({ enemyId: 'armoredknight', allyEnabled: true }, { multi: true });
  const events = (await engine).ringlasRound(d, rolls(8, 8, 9, 6, 5)); assert.equal(d.enemyStamina, 9); assert.equal(d.playerStamina, 30); assert.equal(d.allyStamina, 5); assert.equal(events.length, 5);
});
test('dead companions cannot attack or receive additional hits', async () => {
  const d = await ready({ enemyId: 'armoredknight', allyEnabled: true, allyStamina: 0 }, { multi: true });
  const events = (await engine).ringlasRound(d, rolls(8, 8, 6)); assert.equal(events.length, 3); assert.equal(d.allyStamina, 0);
});
test('companion target ties are harmless', async () => {
  const d = await ready({ enemyId: 'armoredknight', allyEnabled: true }, { multi: true });
  (await engine).ringlasRound(d, rolls(8, 8, 8, 6, 4)); assert.equal(d.allyStamina, 6);
});
test('changing next-fight companion and group choices cannot change active fight rules', async () => {
  const d = await ready({ enemyId: 'armoredknight', allyEnabled: true }, { multi: true });
  d.multi = false; d.allyEnabled = false; (await engine).ringlasRound(d, rolls(8, 8, 9, 7, 5));
  assert.equal(d.playerStamina, 29); assert.equal(d.allyStamina, 5); assert.equal(d.enemyStamina, 9);
});
test('bandit stops after the first hit, before the counterattack', async () => {
  const d = await ready({ enemyId: 'bandit' }); (await engine).ringlasRound(d, rolls(9)); assert.equal(d.pausedSection, 130); assert.equal(d.enemyStamina, 9); assert.equal(d.over, false); assert.equal(d.history.length, 1);
});
test('paused fights cannot roll until resumed', async () => {
  const d = await ready({ enemyId: 'bandit' }); (await engine).ringlasRound(d, rolls(9)); assert.deepEqual((await engine).ringlasRound(d, never), []);
});
test('bandit resumes the same fight without resetting endurance or awarding bonuses', async () => {
  const d = await ready({ enemyId: 'bandit' }); (await engine).ringlasRound(d, rolls(9));
  assert.equal((await engine).resumeRinglasFight(d), true); (await engine).ringlasRound(d, rolls(9, 6)); assert.equal(d.enemyStamina, 8); assert.equal(d.playerStamina, 25); assert.equal(d.pausedSection, null);
});
for (const [id, hp, section] of [['knight', 3, 52], ['icelion', 5, 215], ['spider', 2, 244]]) test(id + ' stops at the printed threshold without recording death', async () => {
  const d = await ready({ enemyId: id }, { stamina: hp }); (await engine).ringlasRound(d, rolls(9)); assert.equal(d.pausedSection, section); assert.equal(d.over, false); assert.equal(d.enemyStamina, hp - 1); assert.equal(d.history.length, 1);
});
test('snow warriors stop after eight player endurance lost', async () => {
  const d = await ready({ enemyId: 'snowwarrior' }, { multi: true }); d.playerStamina -= 7;
  (await engine).ringlasRound(d, rolls(8, 8, 7)); assert.equal(d.pausedSection, 142); assert.equal(d.over, false);
});
test('lion threshold can be reached by the horse', async () => {
  const d = await ready({ enemyId: 'icelion' }, { multi: true, stamina: 6 }); (await engine).ringlasRound(d, rolls(8, 7)); assert.equal(d.pausedSection, 215); assert.equal(d.enemyStamina, 4);
});
test('enemy death stops further attacks', async () => {
  const d = await ready({}, { stamina: 1 }); (await engine).ringlasRound(d, rolls(9)); assert.equal(d.winner, 'player'); assert.equal(d.over, true);
});
test('player death takes priority over simultaneous zero endurance', async () => {
  const d = await ready(); d.playerStamina = d.enemyStamina = 0; (await engine).ringlasRound(d, never); assert.equal(d.winner, 'enemy');
});
test('finished fights do not consume dice or record another outcome', async () => {
  const d = await ready({}, { stamina: 1 }); (await engine).ringlasRound(d, rolls(9)); const old = JSON.stringify(d); assert.deepEqual((await engine).ringlasRound(d, never), []); assert.equal(JSON.stringify(d), old);
});
test('resume is limited to the bandit checkpoint', async () => {
  const d = await ready({ enemyId: 'knight' }, { stamina: 3 }); (await engine).ringlasRound(d, rolls(9)); assert.equal((await engine).resumeRinglasFight(d), false);
});

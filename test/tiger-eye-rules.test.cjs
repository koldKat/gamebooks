const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const engine = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../public/js/battlesim/engines/tiger-eye.js'))).toString('base64'));
const entity = (values = {}) => ({ s: 10, e: 20, m: 0, b: 10, sword: 4, shield: 'none', startE: 20, startB: 10, lostE: 0, skillLossExtra: 0, ...values });
const state = (id = 'dalgren', phase = 1) => ({ rivalId: id, phase, turn: 'opp', player: entity(), opp: entity(), started: true, over: false, options: { magicSpend: 2, enduranceSpend: 1, skillSpend: 0 } });
const rolls = (...values) => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
const never = () => { throw Error('unexpected roll'); };
async function resolve(d, idx, roll = never) { return (await engine).tigerResolve(d, idx, roll); }
test('constructing every menu, including pending defence, is inert', async () => {
  const { tigerOptions } = await engine;
  for (const id of ['dalgren', 'tindalin', 'uantor', 'smajtal', 'lestor', 'tejbrun', 'matual']) {
    for (const phase of [1, 2]) {
      const d = state(id, phase), before = JSON.stringify(d);
      assert.ok(tigerOptions(d).length); assert.equal(JSON.stringify(d), before);
      d.pendingDefense = true; const pending = JSON.stringify(d);
      assert.equal(tigerOptions(d).length, 5); assert.equal(JSON.stringify(d), pending);
    }
  }
});
test('standard attack loses the printed difference, not difference plus a die', async () => {
  const d = state(); d.turn = 'player'; d.player.b = d.player.startB = 14;
  await resolve(d, 0, rolls(2, 1, 1, 1, 1));
  assert.equal(d.opp.e, 14); assert.equal(d.opp.skillLossExtra, 3);
});
test('failed suicide attack harms player before the section 110 extra blow', async () => {
  const d = state(); d.turn = 'player';
  await resolve(d, 6, rolls(3, 1, 2, 1));
  assert.equal(d.player.e, 17); assert.equal(d.opp.e, 17); assert.equal(d.phase, 2);
});
test('successful suicide attack uses the selected amount, not all remaining endurance', async () => {
  const d = state(); d.turn = 'player'; d.player.e = d.player.startE = 25; d.options.enduranceSpend = 2;
  await resolve(d, 6, rolls(1, 1, 1));
  assert.equal(d.player.e, 23); assert.equal(d.opp.e, 14);
});
test('first Dalgren deceptive block makes skill ties harmless', async () => {
  const d = state(); await resolve(d, 2); assert.equal(d.player.e, 20); assert.equal(d.opp.e, 20);
});
test('first Dalgren block/counter first reduces enemy endurance', async () => {
  const d = state(); await resolve(d, 3); assert.equal(d.opp.e, 18); assert.equal(d.player.e, 20);
});
test('Dalgren direct low-endurance counter is the guaranteed section 158 hit', async () => {
  const d = state('dalgren', 2); d.opp.e = d.opp.startE = 4; d.opp.s = 99;
  await resolve(d, 1); assert.equal(d.winner, 'player'); assert.equal(d.opp.e, 0);
});
test('Tindalin magic counter does not also apply the ordinary block or shield hit', async () => {
  const d = state('tindalin'); d.player.m = 3; d.player.b = d.player.startB = 12;
  await resolve(d, 2); assert.equal(d.player.e, 20); assert.equal(d.player.m, 1); assert.equal(d.opp.e, 18);
});
test('Tindalin later counter damage is a die, not one point', async () => {
  const d = state('tindalin', 2); d.player.e = d.player.startE = 30;
  await resolve(d, 1, rolls(1, 1, 5)); assert.equal(d.opp.e, 15); assert.equal(d.player.e, 28);
});
test('Tindalin lower attack defence loses skill difference rather than missing threshold', async () => {
  const d = state('tindalin', 2); await resolve(d, 2, rolls(2)); assert.equal(d.player.e, 18);
});
test('Uantor block compares both endurance/skill totals', async () => {
  const d = state('uantor'); d.opp.e = d.opp.startE = 30;
  await resolve(d, 0, rolls(2, 4)); assert.equal(d.player.e, 14);
});
test('Uantor right counter has the section 144 trap, not an eight-point guard', async () => {
  const d = state('uantor', 2); d.player.s = 12;
  await resolve(d, 0, rolls(3)); assert.equal(d.opp.e, 16); assert.equal(d.player.e, 17);
});
test('Uantor later magic attack has damage and a strength-difference counterattack', async () => {
  const d = state('uantor', 2); d.player.m = 5; d.opp.m = 1; d.options.magicSpend = 2;
  await resolve(d, 3); assert.equal(d.opp.e, 16); assert.equal(d.opp.skillLossExtra, 2); assert.equal(d.player.m, 3);
});
test('Smajtal shield absorption is correct for the ordinary magic defence', async () => {
  const d = state('smajtal'); d.player.m = 3; d.player.shield = 'holy'; d.opp.m = 6;
  await resolve(d, 0); assert.equal(d.player.e, 17);
});
test('Smajtal right first counter deals the printed four-point magic damage', async () => {
  const d = state('smajtal'); d.player.m = 2; d.opp.m = 3;
  await resolve(d, 1); assert.equal(d.player.e, 16);
});
test('Smajtal disarm sends reader to 100 rather than silently continuing', async () => {
  const d = state('smajtal'); await resolve(d, 2, rolls(5));
  assert.equal(d.manualSection, 100); assert.equal(d.turn, 'manual');
});
test('Smajtal later right counter hurts player, not opponent', async () => {
  const d = state('smajtal', 2); d.options.enduranceSpend = 0;
  await resolve(d, 1, rolls(2)); assert.equal(d.player.e, 18); assert.equal(d.opp.e, 20); assert.equal(d.player.skillLossExtra, 2);
});
test('Smajtal later left counter rolls skill damage rather than a fixed point', async () => {
  const d = state('smajtal', 2); d.options.enduranceSpend = 0;
  await resolve(d, 2, rolls(2, 3, 4)); assert.equal(d.opp.e, 15); assert.equal(d.opp.skillLossExtra, 4);
});
test('Smajtal temporary magic converts selected endurance and skill only', async () => {
  const d = state('smajtal', 2); d.player.m = 1; d.opp.m = 3; d.options.enduranceSpend = 3; d.options.skillSpend = 3;
  await resolve(d, 0); assert.equal(d.player.e, 17); assert.equal(d.player.m, 1); assert.equal(d.player.skillLossExtra, 3);
});
test('Lestor stronger guard uses the skill difference instead of six-point deficit', async () => {
  const d = state('lestor'); d.opp.s = 20; d.opp.b = d.opp.startB = 15;
  await resolve(d, 0); assert.equal(d.player.e, 15);
});
test('Lestor attack bonus also affects the temporary guard skill comparison', async () => {
  const d = state('lestor'); d.opp.s = 20; d.opp.b = d.opp.startB = 15;
  await resolve(d, 2); assert.equal(d.player.e, 19);
});
test('Lestor second-phase basic block compares endurance and skill', async () => {
  const d = state('lestor', 2); d.opp.e = d.opp.startE = 30;
  await resolve(d, 0); assert.equal(d.player.e, 10);
});
test('Lestor second-phase magic and trick are available', async () => {
  const d = state('lestor', 2); d.player.m = 3;
  await resolve(d, 2); assert.equal(d.opp.e, 12); assert.equal(d.opp.skillLossExtra, 4); assert.equal(d.player.m, 1);
});
test('accepting Teybrun truce is a betrayal and unarmed route, not a peaceful win', async () => {
  const d = state('tejbrun', 2); await resolve(d, 0);
  assert.equal(d.player.e, 15); assert.equal(d.player.skillLossExtra, 3); assert.equal(d.turn, 'manual'); assert.equal(d.over, false); assert.equal(d.manualSection, 178);
});
test('attacking a seemingly helpless Teybrun or Matual goes to the printed choice', async () => {
  for (const id of ['tejbrun', 'matual']) { const d = state(id, 2); await resolve(d, 1); assert.equal(d.manualSection, 100); assert.equal(d.opp.e, 20); assert.equal(d.over, false); }
});
test('taking Matual sword records a spared opponent, not a dead one', async () => {
  const d = state('matual', 2); await resolve(d, 2); assert.equal(d.spared, true); assert.equal(d.opp.e, 20); assert.equal(d.winner, 'player');
});
test('Matual guard includes opponent endurance and doubles the difference', async () => {
  const d = state('matual'); d.opp.e = d.opp.startE = 24;
  await resolve(d, 0); assert.equal(d.player.e, 12);
});
test('a failed counter block still permits its selected follow-up', async () => {
  const d = state(); d.pendingDefense = true; d.player.e = d.player.startE = 4; d.player.b = d.player.startB = 14; d.player.m = 2;
  await resolve(d, 2, rolls(1, 3)); assert.equal(d.opp.e, 13); assert.equal(d.player.m, 0);
});
test('direct counterattack exchanges both printed hits', async () => {
  const d = state(); d.pendingDefense = true; d.player.b = d.player.startB = 14;
  await resolve(d, 0, rolls(2, 3)); assert.equal(d.opp.e, 14); assert.equal(d.player.e, 17);
});
test('counterattack skill ties defer to the source rather than inventing damage', async () => {
  const d = state(); d.pendingDefense = true; await resolve(d, 0); assert.equal(d.manualSection, 10); assert.equal(d.player.e, 20);
});
test('insufficient magic or sword leaves the entire combat state unchanged', async () => {
  const d = state('lestor'); const before = JSON.stringify(d); assert.equal((await resolve(d, 1)).valid, false); assert.equal(JSON.stringify(d), before);
});
test('death takes precedence over a simultaneous victory', async () => {
  const d = state(); d.turn = 'player'; d.player.e = d.player.startE = 25; d.options.enduranceSpend = 25;
  await resolve(d, 6); assert.equal(d.winner, 'opp'); assert.equal(d.over, true);
});
test('low endurance limits later attacks and dirty blows are first-phase only', async () => {
  const { tigerOptions } = await engine; const d = state('dalgren', 2); d.turn = 'player';
  assert.ok(!tigerOptions(d).includes('p.dirty')); d.player.e = 5;
  assert.deepEqual(tigerOptions(d), ['p.std', 'p.feint', 'p.stdmagic']);
});

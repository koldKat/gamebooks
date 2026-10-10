const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const engine = import('data:text/javascript;base64,' + Buffer.from(read('public/js/battlesim/engines/cellar-dragon.js')).toString('base64'));
const dice = values => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
async function subject() {
  const { resolveCellarDragon } = await engine;
  const saved = { encounterId: 'guard_unarmed', swordId: 'firfeld', player: { sila: 5, izd: 30 }, log: ['old'], history: [{ outcome: 'win', ts: 1 }] };
  const elements = Object.fromEntries(['dagger', 'poison', 'target', 'potion', 'knife-magic'].map(name => ['sim881-' + name, { value: name === 'target' ? '0' : '-1', checked: false }]));
  const context = vm.createContext({ currentPlaythrough: () => ({ sim881: saved }), saveState: () => {},
    document: { getElementById: id => elements[id] }, t: key => key, showAlert: () => {},
    resolveCellarDragon, Math: Object.create(Math) });
  const code = read('public/js/battlesim/battlesim881.js').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(code + '\n_renderAll=()=>{};globalThis.subject={data:_data,fight:_fight,roster:ROSTER};', context);
  return { saved, context, elements, ...context.subject, resolve: resolveCellarDragon };
}
async function fight(id, player, rolls, options = {}, previous, limit) {
  const s = await subject();
  return s.resolve(s.roster.find(encounter => encounter.id === id), player, { swordId: 'firfeld', ...options }, previous, rolls, limit);
}
test('opening legacy data preserves character, history and settings', async () => {
  const s = await subject(), original = JSON.stringify(s.saved);
  s.data(); assert.equal(JSON.stringify(s.saved), original);
});
test('both guards have harmless ties and pause without false victory', async () => {
  for (const [id, roll] of [['guard_unarmed', 4], ['guard_club', 3]]) {
    const r = await fight(id, { sila: 5, izd: 30 }, () => roll);
    assert.equal(r.outcome, 'pending'); assert.equal(r.state.rounds, 256);
    assert.equal(r.finalPlayerIzd, 30); assert.equal(r.state.enemies[0].remaining, 5);
  }
});
test('both guard fights stop after ten lost points, without killing the player', async () => {
  for (const id of ['guard_unarmed', 'guard_club']) {
    const r = await fight(id, { sila: 5, izd: 30 }, () => 1);
    assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 20); assert.equal(r.state.rounds, 10);
  }
});
test('night thief stops at ten endurance and never starts below that threshold', async () => {
  const r = await fight('night_thief1', { sila: 5, izd: 12 }, dice([1]));
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 10);
  const stopped = await fight('night_thief1', { sila: 5, izd: 10 }, dice([]));
  assert.equal(stopped.outcome, 'loss'); assert.equal(stopped.state.rounds, 0);
});
test('creature uses endurance eight, player-only tie damage and an eight-point retreat', async () => {
  const r = await fight('creature_unarmed', { sila: 5, izd: 9 }, dice([5]));
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 8); assert.equal(r.state.enemies[0].remaining, 8);
});
test('unarmed dwarf ties do not injure either fighter', async () => {
  const r = await fight('dwarf_unarmed', { sila: 5, izd: 30 }, () => 5, {}, undefined, 2);
  assert.equal(r.outcome, 'pending'); assert.equal(r.finalPlayerIzd, 30); assert.equal(r.state.enemies[0].remaining, 10);
});
test('unarmed mercenary stops after ten damage and has harmless ties', async () => {
  const r = await fight('mercenary_unarmed', { sila: 5, izd: 30 }, () => 1);
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 20);
  const tie = await fight('mercenary_unarmed', { sila: 5, izd: 30 }, () => 5, {}, undefined, 1);
  assert.equal(tie.finalPlayerIzd, 30); assert.equal(tie.state.enemies[0].remaining, 10);
});
test('wolfpack needs three kills and preserves unfinished fights instead of declaring victory', async () => {
  const r = await fight('wolfpack', { sila: 5, izd: 30 }, () => 6, {}, undefined, 2);
  assert.equal(r.outcome, 'pending'); assert.equal(r.state.killed, 2);
  const resumed = await fight('wolfpack', { sila: 5, izd: 30 }, dice([6]), {}, r.state);
  assert.equal(resumed.outcome, 'win'); assert.equal(resumed.state.killed, 3);
});
test('wolf miss costs three and respects sword modifiers', async () => {
  const r = await fight('wolfpack', { sila: 5, izd: 3 }, dice([5]));
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 0);
  const fast = await fight('wolfpack', { sila: 5, izd: 30 }, () => 3, { swordId: 'istrin' });
  assert.equal(fast.outcome, 'win'); assert.equal(fast.finalPlayerIzd, 30);
});
test('knife throws alternate with the strength-six dwarf after misses', async () => {
  const r = await fight('dwarf_knife', { sila: 5, izd: 30 }, dice([1, 1, 5]));
  assert.equal(r.outcome, 'win'); assert.equal(r.state.rounds, 2); assert.equal(r.finalPlayerIzd, 30);
  assert.deepEqual(r.events.map(event => event.key), ['knife_miss', 'knife_enemy_miss', 'knife_win']);
});
test('a successful enemy knife throw is fatal', async () => {
  const r = await fight('dwarf_knife', { sila: 5, izd: 30 }, dice([1, 4]));
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 0);
});
test('magical knife wins the knife duel without dice or damage', async () => {
  const r = await fight('dwarf_knife', { sila: 5, izd: 30 }, dice([]), { magicKnife: true });
  assert.equal(r.outcome, 'win'); assert.equal(r.events[0].key, 'knife_magic');
});
test('alley fights resolve one player-selected target per action', async () => {
  const r = await fight('alkein_thugs', { sila: 10, izd: 30 }, dice([1]), { target: 2 });
  assert.equal(r.outcome, 'pending'); assert.deepEqual(Array.from(r.state.enemies, e => e.remaining), [4, 6, 6]);
  const resumed = await fight('alkein_thugs', { sila: 10, izd: 30 }, dice([1]), { target: 0 }, r.state);
  assert.deepEqual(Array.from(resumed.state.enemies, e => e.remaining), [2, 6, 6]);
});
test('potion is fight-local and does not change saved strength', async () => {
  const player = { sila: 5, izd: 30 }, original = { ...player };
  const r = await fight('guard_unarmed', player, () => 1, { potion: true });
  assert.equal(r.outcome, 'win'); assert.deepEqual(player, original); assert.equal(r.state.strength, 10);
});
test('poison and dagger can remove separate wolfspiders before combat', async () => {
  const r = await fight('wolfspiders', { sila: 10, izd: 30 }, () => 6, { removed: [0, 2] });
  assert.equal(r.outcome, 'win'); assert.equal(r.state.rounds, 5); assert.equal(r.finalPlayerIzd, 30);
});
test('zero endurance takes precedence over simultaneous enemy death', async () => {
  const encounter = { enemies: [{ sila: 9, izd: 2 }], tieBoth2: true };
  const { resolveCellarDragon } = await engine;
  const r = resolveCellarDragon(encounter, { sila: 5, izd: 2 }, {}, undefined, dice([4]));
  assert.equal(r.outcome, 'loss'); assert.equal(r.finalPlayerIzd, 0);
});
test('resuming never mutates the previous fight object or recalculates its potion', async () => {
  const r = await fight('guard_unarmed', { sila: 5, izd: 30 }, () => 4, {}, undefined, 1);
  const original = JSON.stringify(r.state);
  const resumed = await fight('guard_unarmed', { sila: 999, izd: 999 }, () => 4, { potion: true }, r.state, 1);
  assert.equal(JSON.stringify(r.state), original); assert.equal(resumed.state.strength, 5); assert.equal(resumed.finalPlayerIzd, 30);
});
test('future controller records no history for a paused fight and resumes it', async () => {
  const s = await subject(); s.context.Math.random = () => .5;
  s.fight(); assert.equal(s.saved.history.length, 1); assert.equal(s.saved.pendingFight.rounds, 256);
  s.fight(); assert.equal(s.saved.history.length, 1); assert.equal(s.saved.pendingFight.rounds, 512);
});
test('night-thief roster and companion order match the printed columns', async () => {
  const s = await subject();
  assert.equal(JSON.stringify(s.roster.find(e => e.id === 'night_thieves5').enemies.map(e => [e.sila, e.izd])), JSON.stringify([[6,4],[8,12],[10,6],[6,6],[9,8]]));
  assert.equal(s.roster.find(e => e.id === 'orgfelt_gang').enemies[1].nameKey, 'battlesim881.enemy.companion');
});

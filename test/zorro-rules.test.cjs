const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const read = p => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
const engine = import('data:text/javascript;base64,' + Buffer.from(read('public/js/battlesim/engines/zorro.js')).toString('base64'));
const player = { zhivot: 50, sila: 3, barzina: 5, srachnost: 1, izdr: 2, rb: 3, fehtovka: 5, pronizvasht: 5, sechasht: 4, blok: 3, fint: 5, trikove: 5 };
const foe = { zhivot: 50, sila: 3, izdr: 2, rb: 3, fehtovka: 3, barzina: 2, srachnost: 1, pronizvasht: 3, sechasht: 2, blok: 3, fint: 4, trikove: 2, nameKey: 'foe' };
const dice = list => () => { assert.ok(list.length); return list.shift(); };
async function group(overrides = {}, p = player) {
  const api = await engine;
  return { ...api, state: api.startZorroFight(p, { id: 'test', type: 'rukopashna', enemies: [foe], ...overrides }) };
}
test('hand damage reuses winning die, not an extra roll', async () => {
  const s = await group();
  const r = s.advanceZorroFight(s.state, dice([4, 1]), false, 1);
  assert.equal(r.state.enemies[0].life, 45); assert.equal(r.state.playerLife, 50);
});
test('knife adds damage, never boosts attack comparison', async () => {
  const s = await group({ extraDamageBonus: 3 });
  const tie = s.advanceZorroFight(s.state, () => 3, false, 1);
  assert.equal(tie.state.enemies[0].life, 50); assert.equal(tie.state.playerLife, 50);
  const hit = s.advanceZorroFight(s.state, dice([4, 1]), false, 1);
  assert.equal(hit.state.enemies[0].life, 42);
});
test('sword uses speed and dexterity in damage only', async () => {
  const s = await group({ type: 'shpagi' });
  const r = s.advanceZorroFight(s.state, dice([4, 1]), false, 1);
  assert.equal(r.state.enemies[0].life, 39);
});
test('Gregorio gets ten extra damage without extra attack strength', async () => {
  const s = await group({ enemyDamageBonus: 10 });
  const r = s.advanceZorroFight(s.state, dice([1, 4]), false, 1);
  assert.equal(r.state.playerLife, 35);
});
test('ties pause indefinitely, never awarding a win or loss', async () => {
  const s = await group(); const before = JSON.stringify(s.state);
  const r = s.advanceZorroFight(s.state, () => 3);
  assert.equal(r.state.outcome, null); assert.equal(r.state.rounds, 128);
  const resumed = s.advanceZorroFight(r.state, () => 3);
  assert.equal(resumed.state.rounds, 256); assert.equal(resumed.state.outcome, null);
  assert.equal(JSON.stringify(s.state), before);
});
test('retreat uses cumulative damage from this fight, not total missing life', async () => {
  const s = await group({ retreatLoss: 15 }, { ...player, zhivot: 20 });
  const r = s.advanceZorroFight(s.state, dice([1, 4, 1, 4, 1, 4]));
  assert.equal(r.state.outcome, 'retreat'); assert.equal(r.state.playerLife, 5);
});
test('death takes precedence over retreat', async () => {
  const s = await group({ retreatLoss: 15 }, { ...player, zhivot: 5 });
  const r = s.advanceZorroFight(s.state, dice([1, 4]));
  assert.equal(r.state.outcome, 'loss'); assert.equal(r.state.playerLife, 0);
});
test('multiple opponents exchange in order and retain next opponent on pause', async () => {
  const s = await group({ enemies: [foe, { ...foe, nameKey: 'second' }] });
  const a = s.advanceZorroFight(s.state, dice([4, 1]), false, 1);
  assert.equal(a.state.nextEnemy, 1);
  const b = s.advanceZorroFight(a.state, dice([4, 1]), false, 1);
  assert.deepEqual(b.state.enemies.map(e => e.life), [45, 45]);
});
test('already disabled opponents are removed from bottom, input roster unchanged', async () => {
  const { startZorroFight } = await engine; const enemies = [foe, { ...foe, nameKey: 'second' }, { ...foe, nameKey: 'third' }];
  const s = startZorroFight(player, { type: 'shpagi', enemies }, 2);
  assert.equal(s.enemies.length, 1); assert.equal(s.enemies[0].nameKey, 'foe'); assert.equal(enemies.length, 3);
});
test('Rosario previous chair and bottle damage remain fight-local', async () => {
  const { startZorroFight } = await engine;
  for (const damage of [0, 4, 6]) {
    const enc = { id: 'rosario', type: 'rukopashna', enemies: [{ ...foe, zhivot: 24 }] };
    const s = startZorroFight(player, enc, 0, damage);
    assert.equal(s.enemies[0].life, 24 - damage); assert.equal(enc.enemies[0].zhivot, 24);
  }
});
test('duel pauses before an optional interruption, does not automatically spend it', async () => {
  const { startZorroFight, advanceZorroFight } = await engine;
  const s = startZorroFight(player, { type: 'duel', enemy: { ...foe, zhivot: 1000 } });
  const r = advanceZorroFight(s, () => 1);
  assert.equal(r.state.turn, false); assert.equal(r.state.playerInterrupts, 3);
  const kept = advanceZorroFight(r.state, () => 1);
  assert.equal(kept.state.playerInterrupts, 3);
  const used = advanceZorroFight(r.state, () => 1, true);
  assert.equal(used.state.playerInterrupts, 2);
  assert.equal(used.events.filter(e => e.kind === 'duel_hit' && !e.player).length, 1);
});
test('duel initiative ties reroll fairly and remain pending at the bounded limit', async () => {
  const { startZorroFight, advanceZorroFight } = await engine;
  const s = startZorroFight(player, { type: 'duel', enemy: { ...foe, fint: 5 } });
  const r = advanceZorroFight(s, () => 3);
  assert.equal(r.state.turn, null); assert.equal(r.state.outcome, null); assert.equal(r.events.length, 0);
  const next = advanceZorroFight(r.state, dice([1, 6, 1, 1, 1]), false, 1);
  assert.equal(next.events[0].player, false);
});
test('duel three-strike series uses stronger twice, weaker third', async () => {
  const { startZorroFight, advanceZorroFight } = await engine;
  const s = startZorroFight({ ...player, trikove: 2 }, { type: 'duel', enemy: foe });
  const r = advanceZorroFight(s, () => 1, false, 1);
  assert.deepEqual(r.events.filter(e => e.kind === 'duel_hit').map(e => e.dmg), [3, 3, 2]);
});
test('zero life never rolls or revives', async () => {
  const s = await group({}, { ...player, zhivot: 0 });
  const r = s.advanceZorroFight(s.state, () => { throw Error('rolled dead'); });
  assert.equal(r.state.outcome, 'loss');
});
test('legacy controller opens without modifying saved character or history', async () => {
  const { startZorroFight, advanceZorroFight } = await engine;
  const saved = { encounterId: 'galdos_mounted', player: { zhivot: 19 }, history: [{ outcome: 'win' }], log: ['old'] };
  const context = vm.createContext({ currentPlaythrough: () => ({ sim882: saved }), startZorroFight, advanceZorroFight });
  vm.runInContext(read('public/js/battlesim/battlesim882.js').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nglobalThis.audit={data:_data,roster:ROSTER};', context);
  const old = JSON.stringify(saved); context.audit.data(); assert.equal(JSON.stringify(saved), old);
  const roster = context.audit.roster;
  assert.equal(roster.find(e => e.id === 'galdos_mounted').enemy.sechasht, 5);
  assert.equal(roster.find(e => e.id === 'galdos_dismounted').enemy.blok, 4);
  assert.equal(roster.find(e => e.id === 'village_middle').enemies.length, 5);
  assert.equal(roster.find(e => e.id === 'village_last').enemies.length, 4);
  assert.equal(roster.find(e => e.id === 'village_whip').enemies.length, 3);
  assert.equal(roster.find(e => e.id === 'outer_guards').enemies[0].zhivot, 12);
});

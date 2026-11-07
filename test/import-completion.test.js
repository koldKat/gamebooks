const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const checks = ['paragraph_implosion_ck', 'paragraph_explosion_ck', 'section_glue_ck',
  'links_conservative_ck', 'graph_connectivity_ck', 'frontmatter_done',
  'enemy_roster_reported', 'prose_full_read', 'paragraph_structure_verified'];

function fixture() {
  let row = { has_live_reading: 1, has_sections: 1, is_container: 0, unimportable: 0,
    sim_applicable: 0, sim_registered: 0, has_battle_sim: 0,
    ...Object.fromEntries(checks.map(key => [key, 1])) };
  let queries = 0;
  const events = [], replies = [];
  const context = { module: { exports: {} }, require: name => {
    if (name === '../db/connection') return { db: { prepare: sql => {
      assert.match(sql, /^SELECT/); queries++;
      return { get: () => row };
    } } };
    if (name === '../request-helpers') return {
      requireLocalhost: req => req.local,
      send: (res, status, body) => replies.push({ status, body }),
    };
    if (name === '../sse') return { publicCatalogPush: event => events.push(JSON.parse(JSON.stringify(event))) };
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/routes/import-completion'), 'utf8'), context);
  return { call: (local = true) => context.module.exports.handleImportComplete({ local }, {}, 1073),
    matter: (local = true) => context.module.exports.handleReadingMatterUpdated({ local }, {}, 1073),
    set: value => { row = value; }, current: () => row, events, replies, queries: () => queries };
}

test('completed imports publish a catalog event without database writes', () => {
  const f = fixture(); f.call();
  assert.equal(f.replies[0].status, 200);
  assert.deepEqual(f.events, [{ type: 'public_catalog_changed', entity: 'book', id: 1073, action: 'import_complete' }]);
  assert.equal(f.queries(), 1);
});

test('unfinished imports and simulator registration never trigger a refresh', () => {
  for (const field of [...checks, 'has_live_reading', 'has_sections']) {
    const f = fixture(); f.set({ ...f.current(), [field]: 0 }); f.call();
    assert.equal(f.replies[0].status, 409, field); assert.equal(f.events.length, 0);
  }
  for (const changes of [{ unimportable: 1 }, { is_container: 1 }, { sim_applicable: null }, { sim_applicable: 1 }]) {
    const f = fixture(); f.set({ ...f.current(), ...changes }); f.call();
    assert.equal(f.replies[0].status, 409); assert.equal(f.events.length, 0);
  }
  const f = fixture(); f.set({ ...f.current(), sim_applicable: 1, sim_registered: 1, has_battle_sim: 1 }); f.call();
  assert.equal(f.replies[0].status, 200); assert.equal(f.events.length, 1);
});

test('missing books and nonlocal requests never broadcast', () => {
  const f = fixture(); f.call(false); assert.equal(f.queries(), 0); assert.equal(f.events.length, 0);
  f.set(null); f.call(); assert.equal(f.replies[0].status, 404); assert.equal(f.events.length, 0);
});

test('completion notifier refuses unfinished audits before contacting the server', async () => {
  const { notifyImportComplete } = require('../server/notify-import-complete');
  await assert.rejects(notifyImportComplete(1074, 'book-1074.md'), /completed _fixed/);
  await assert.rejects(notifyImportComplete(0, 'book-0_fixed.md'), /book ID/);
});

test('matter corrections notify readers without completing legacy story checks', () => {
  const f = fixture();
  f.set({ ...f.current(), enemy_roster_reported: 0, prose_full_read: 0, intro_text: '<p>Restored preface</p>' });
  f.matter();
  assert.equal(f.replies[0].status, 200);
  assert.deepEqual(f.events, [{ type: 'public_catalog_changed', entity: 'book', id: 1073, action: 'matter_updated' }]);
  assert.equal(f.current().enemy_roster_reported, 0);
  assert.equal(f.current().prose_full_read, 0);
  f.call();
  assert.equal(f.replies[1].status, 409);
  assert.equal(f.queries(), 2);
});

test('matter notifications require a local request and an existing prepared reader', () => {
  const f = fixture(); f.matter(false);
  assert.equal(f.queries(), 0);
  f.set(null); f.matter();
  assert.equal(f.replies[0].status, 404);
  for (const changes of [{ has_live_reading: 0 }, { has_sections: 0 }, { is_container: 1 },
    { frontmatter_done: 0 }, { intro_text: ' ', rules_text: null }]) {
    const g = fixture(); g.set({ ...g.current(), intro_text: '<p>Preface</p>', ...changes }); g.matter();
    assert.equal(g.replies[0].status, 409);
    assert.equal(g.events.length, 0);
  }
});

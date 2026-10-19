const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function setup() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE user_books (id INTEGER PRIMARY KEY, user_id, book_id, party_id, state_data, updated_at)');
  const add = db.prepare('INSERT INTO user_books VALUES (?,?,?,?,?,?)');
  for (const [id, user, book, party] of [[1,1,868,13],[2,17,868,13],[3,20,868,null],[4,1,972,null]]) {
    add.run(id, user, book, party, JSON.stringify({ graph: { 1: { choices: [2] } },
      playthroughs: [{ startedAt: user, path: [1,2], charSheet: { fields: ['keep'] } }],
      positions: { 1: { x: 0, y: 0 }, 2: { x: 100, y: 100 } }, viewport: { scale: user } }), 123);
  }
  const context = vm.createContext({ module: { exports: {} }, require: () => ({ db }) });
  vm.runInContext(readFileSync(join(__dirname, '../server/db/book-positions.js'), 'utf8'), context);
  return { db, patch: context.module.exports.patchBookPositions,
    rows: () => db.prepare('SELECT * FROM user_books ORDER BY id').all() };
}

test('node patches reach both party members and preserve every other state field and timestamp', () => {
  const s = setup();
  try {
    const before = s.rows();
    assert.equal(s.patch(1,868,{ 2: { x: 500, y: 400 }, '12-L': { x: -30, y: 60 } }).partyId,13);
    const after = s.rows();
    for (let i=0;i<2;i++) {
      const a=JSON.parse(after[i].state_data), b=JSON.parse(before[i].state_data);
      assert.deepEqual(a.positions['2'],{x:500,y:400});
      assert.deepEqual(a.positions['12-L'],{x:-30,y:60});
      delete a.positions; delete b.positions; assert.deepEqual(a,b);
      assert.equal(after[i].updated_at,before[i].updated_at);
    }
    assert.deepEqual(after.slice(2),before.slice(2));
    s.patch(17,868,{2:{x:800,y:600}});
    assert.deepEqual(JSON.parse(s.rows()[0].state_data).positions['2'],{x:800,y:600});
  } finally { s.db.close(); }
});

test('solo patches affect only that library entry and missing membership writes nothing', () => {
  const s=setup();
  try {
    const before=s.rows(); assert.equal(s.patch(99,868,{2:{x:1,y:2}}),null); assert.deepEqual(s.rows(),before);
    s.patch(1,972,{1:{x:50,y:60}}); assert.deepEqual(s.rows().slice(0,3),before.slice(0,3));
  } finally { s.db.close(); }
});

test('failed party patches roll back all members', () => {
  const s=setup();
  try {
    s.db.prepare('UPDATE user_books SET state_data=? WHERE id=2').run('broken');
    const before=s.rows(); assert.throws(()=>s.patch(1,868,{2:{x:1,y:2}})); assert.deepEqual(s.rows(),before);
  } finally { s.db.close(); }
});

test('coordinate route validates input and broadcasts only sanitized coordinates', async () => {
  const s=setup(); let body, response, event;
  const routes=readFileSync(join(__dirname,'../server/routes/books.js'),'utf8');
  const handler=routes.slice(routes.indexOf('async function handleSavePositions('),routes.indexOf('async function handleResetBookProgress('));
  const context=vm.createContext({ authenticate:async()=>1,readBody:async()=>body,
    patchBookPositions:s.patch,send:(_res,status,value)=>{response={status,value}},
    ssePush:(party,user,value)=>{event={party,user,value}} });
  vm.runInContext(handler,context);
  try {
    const before=s.rows();
    for (const positions of [null,[],{2:{x:NaN,y:1}},{2:{x:1,y:Infinity}},{constructor:{x:1,y:2}}]) {
      body={positions}; await context.handleSavePositions({}, {},868);
      assert.equal(response.status,400);assert.deepEqual(s.rows(),before);
    }
    body={positions:{2:{x:75,y:85,playthroughs:[]}}};await context.handleSavePositions({}, {},868);
    assert.equal(response.status,200);assert.equal(event.party,13);assert.equal(event.user,1);
    assert.equal(event.value.type,'positions_updated');
    assert.deepEqual(JSON.parse(JSON.stringify(event.value.positions)),{2:{x:75,y:85}});
  } finally {s.db.close()}
});

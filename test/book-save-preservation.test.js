const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../server/routes/books.js'), 'utf8');
const handler = source.slice(source.indexOf('async function handleSaveState('), source.indexOf('async function handleResetBookProgress('));
const existing = { graph: { 1: { choices: [2] } }, playthroughs: [{ startedAt: 1, path: [1, 2] }], activePtIndex: 0 };
async function save(oldState, incoming) {
  let response, writes = 0, fanouts = 0;
  const context = vm.createContext({
    authenticate: async () => 1, isRequestImpersonating: () => false,
    readBody: async () => incoming, send: (_res, status, body) => { response = { status, body }; },
    db: {
      getBookState: () => oldState,
      saveBookState: () => { writes++; return true; },
      getBookContainerFields: () => null, processStateXp() {},
      getPartyForBook: () => ({ partyId: 13 }), getPartyMemberIds: () => [],
      fanOutState: () => { fanouts++; return [17]; },
    },
    ssePush() {}, feedPush() {},
  });
  vm.runInContext(handler, context);
  await context.handleSaveState({}, {}, 868);
  return { response, writes, fanouts };
}

test('failed-load empty saves cannot erase existing runs or fan out to a partner', async () => {
  for (const incoming of [{}, { graph: {}, playthroughs: [], positions: { 1: { x: 0, y: 0 } } }]) {
    const r = await save(existing, incoming);
    assert.equal(r.response.status, 409);
    assert.equal(r.writes, 0); assert.equal(r.fanouts, 0);
  }
});

test('mapped progress without runs is also protected from an empty save', async () => {
  const r = await save({ ...existing, playthroughs: [] }, { graph: {}, playthroughs: [] });
  assert.equal(r.response.status, 409); assert.equal(r.writes, 0);
});

test('ordinary moves and deleting the final run while keeping the map remain valid', async () => {
  for (const incoming of [existing, { ...existing, playthroughs: [], activePtIndex: null }]) {
    const r = await save(existing, incoming);
    assert.equal(r.response.status, 200); assert.equal(r.writes, 1); assert.equal(r.fanouts, 1);
  }
});

test('new untouched books may save their initial empty layout', async () => {
  const empty = { graph: {}, playthroughs: [] };
  assert.equal((await save(empty, empty)).response.status, 200);
});

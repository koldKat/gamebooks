'use strict';
// Exercise the actual preference handler with isolated accounts and private push spies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('season preview saves only the authenticated account, preserves prefs and pushes privately', async () => {
  const saved = new Map([[1,{seasonalEvents:'1',feedFilters:{wins:true},favoriteBookIds:[7]}],[2,{seasonalEvents:'1'}]]);
  const untouched = JSON.stringify(saved.get(2)), pushes = [], writes = [];
  const context = vm.createContext({
    authenticate:async req=>req.userId ?? null, readBody:async req=>req.body,
    send:(res,status,body)=>{res.status=status;res.body=body;},
    userBadgePush:id=>pushes.push(id),
    db:{getUserPrefs:id=>structuredClone(saved.get(id)),setUserPrefs:(id,prefs)=>{writes.push(id);saved.set(id,prefs);},
      awardXp:()=>{throw Error('Preview must not award XP');}},
  });
  const source=fs.readFileSync('server/routes/profile.js','utf8');
  vm.runInContext(source.slice(source.indexOf('async function handleGetPrefs('),source.indexOf('async function handleUploadAvatar(')),context);
  const response={};await context.handleSetPrefs({userId:1,body:{seasonPreview:'diwali'}},response);
  assert.equal(response.status,200);assert.equal(saved.get(1).seasonPreview,'diwali');
  assert.equal(saved.get(1).seasonalEvents,'1');assert.deepEqual(saved.get(1).feedFilters,{wins:true});
  assert.equal(JSON.stringify(saved.get(2)),untouched);assert.deepEqual(pushes,[1]);assert.deepEqual(writes,[1]);
  await context.handleSetPrefs({userId:1,body:{seasonPreview:'automatic'}},{});
  assert.equal(saved.get(1).seasonPreview,'automatic');assert.deepEqual(pushes,[1,1]);
  await context.handleSetPrefs({body:{seasonPreview:'halloween'}},{});
  assert.deepEqual(writes,[1,1]);assert.equal(JSON.stringify(saved.get(2)),untouched);
});

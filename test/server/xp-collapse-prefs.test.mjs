import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import Database from 'better-sqlite3';

test('independent XP collapse settings persist in the account database and notify other devices', async t => {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,ui_prefs TEXT); INSERT INTO users VALUES(1,'{\"feedFilters\":{\"news\":false}}'),(2,'{}')");
  const auth = readFileSync('server/db/auth.js','utf8');
  const helpers={db};runInNewContext(auth.slice(auth.indexOf('function getUserPrefs('),auth.indexOf('async function createUser(')),helpers);
  const source = readFileSync('server/routes/profile.js','utf8');
  let patch, pushes=0, response;
  const scope={authenticate:async()=>1,readBody:async()=>patch,
    send:(_res,status,body)=>{assert.equal(status,200);response=body;},
    userBadgePush:id=>{assert.equal(id,1);pushes++;},
    db:{getUserPrefs:helpers.getUserPrefs,setUserPrefs:helpers.setUserPrefs}};
  runInNewContext(source.slice(source.indexOf('async function handleSetPrefs('),source.indexOf('async function handleUploadAvatar(')),scope);
  for(patch of [{booksXpCollapsed:'1'},{booksAppXpCollapsed:'1'},{booksXpCollapsed:'0'}])await scope.handleSetPrefs({},{});
  assert.deepEqual(JSON.parse(db.prepare('SELECT ui_prefs FROM users WHERE id=1').get().ui_prefs),
    {feedFilters:{news:false},booksXpCollapsed:'0',booksAppXpCollapsed:'1'});
  assert.equal(JSON.parse(JSON.stringify(response)).booksAppXpCollapsed,'1');
  assert.equal(db.prepare('SELECT ui_prefs FROM users WHERE id=2').get().ui_prefs,'{}');
  assert.equal(pushes,3);
});

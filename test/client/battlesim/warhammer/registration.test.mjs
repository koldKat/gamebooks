import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const bookId of [1454, 1456, 1457, 1467, 1468, 1469, 1470]) test(`Book ${bookId} outcomes award XP once while cancelled fights and repeated saves do not`, () => {
  const source = readFileSync('server/db/xp.js','utf8');
  const registry = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='),source.indexOf('function processStateXp('));
  const keys = runInNewContext(registry+'\nSIM_HISTORY_KEYS;',{});
  const stateKey = `sim${bookId}`;
  assert.equal(keys.filter(key => key === stateKey).length,1);
  const awards = [], refs = new Set();
  const context = {db:{prepare:sql => ({get:() => sql.includes('FROM books') ? {} : {n:100}})},
    awardXp(_user,event,ref) { if (refs.has(event+':'+ref)) return false; refs.add(event+':'+ref); awards.push({event,ref}); return true; },
    awardCoins(){},getXpAmount:() => 50,isCleanRun:() => false,_discoveredSet:() => new Set(),
    _visitedSet:() => new Set(),_mappedSet:() => new Set(),_checkGroupWonAll(){},SIM_HISTORY_KEYS:keys,_xpRefSeq:0};
  runInNewContext(source.slice(source.indexOf('function processStateXp('),source.indexOf('function migrateXpForUser(')),context);
  const state = history => ({playthroughs:[{startedAt:1,path:[],[stateKey]:{history}}]});
  const history = ['win','loss','cancelled'].map((outcome,index) => ({outcome,ts:100+index}));
  context.processStateXp(1,bookId,state([]),state(history),0);
  context.processStateXp(1,bookId,state(history),state(history),0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),[
    {event:'battlesim_win',ref:`${stateKey}:100`},{event:'battlesim_loss',ref:`${stateKey}:101`},
  ]);
});

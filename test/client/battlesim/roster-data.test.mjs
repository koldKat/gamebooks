import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createState as createMutatedState } from '../../../public/js/battlesim/books/781/state.js';
const seed=readRosterDocument(781);
const groupSeed=readRosterDocument(881);

test('generic roster loading reconstructs each complete source group once in source order',async()=>{
  const rows=await loadRosterDataset(881,'ROSTER',async()=>({ok:true,json:async()=>[...groupSeed.enemies].reverse()}));
  assert.equal(rows.length,18);
  assert.deepEqual(rows[0],groupSeed.enemies[0].stats.entry);
  rows[0].enemies[0].sila=999;
  assert.notEqual(groupSeed.enemies[0].stats.entry.enemies[0].sila,999);
});

test('grouped source rows cannot silently omit or duplicate one enemy',async()=>{
  const index=groupSeed.enemies.findIndex(row=>row.stats.partCount>1);
  await assert.rejects(loadRosterDataset(881,'ROSTER',async()=>({ok:true,json:async()=>groupSeed.enemies.filter((_,i)=>i!==index)})),/Incomplete/);
  await assert.rejects(loadRosterDataset(881,'ROSTER',async()=>({ok:true,json:async()=>[...groupSeed.enemies,groupSeed.enemies[0]]})),/Conflicting/);
});

test('book 781 loads exact seeded data once before initialization and shares concurrent requests',async()=>{
  const module=await import('../../../public/js/battlesim/books/781/definition.js?typed-test');
  assert.deepEqual(module.ROSTER,[]);
  let calls=0;
  const fetcher=async path=>{assert.equal(path,'/api/books/781/enemies');calls++;return {ok:true,json:async()=>seed.enemies};};
  await Promise.all([module.loadRoster(fetcher),module.loadRoster(fetcher)]);
  assert.equal(calls,1);
  assert.deepEqual(module.ROSTER,seed.enemies.map(row=>{const {support,...profile}=row.stats.entry;return profile;}));
  assert.deepEqual(module.FLESH_RULES,seed.enemies.find(row=>row.stats.entry.support).stats.entry.support.rules);
  await module.loadRoster(()=>{throw Error('must reuse loaded data');});
});

test('an obsolete API without encounter settings fails clearly and remains retryable',async()=>{
  const module=await import('../../../public/js/battlesim/books/781/definition.js?legacy-test');
  const rows=[...seed.enemies].reverse().map(({name,attack,hp})=>({name,attack,hp}));
  await assert.rejects(module.loadRoster(async()=>({ok:true,json:async()=>rows})),/Incomplete Mutated Flesh settings/);
  assert.deepEqual(module.ROSTER,[]);
  await module.loadRoster(async()=>({ok:true,json:async()=>seed.enemies}));
  assert.deepEqual(module.ROSTER.map(row=>row.id),seed.enemies.map(row=>row.stats.entry.id));
});

test('failed loading remains retryable without replacing a saved roster with partial data',async()=>{
  const module=await import('../../../public/js/battlesim/books/781/definition.js?retry-test');
  await assert.rejects(module.loadRoster(async()=>({ok:false})),/Could not load/);
  assert.deepEqual(module.ROSTER,[]);
  await assert.rejects(module.loadRoster(async()=>({ok:true,json:async()=>seed.enemies.slice(1)})),/Incomplete book/);
  await module.loadRoster(async()=>({ok:true,json:async()=>seed.enemies}));
  assert.equal(module.ROSTER.length,6);
});

test('new character state takes enemy defaults from the loaded roster and leaves existing fights alone',()=>{
  const run={};let currentEnemy={dmg:99,life:123};
  const store=createMutatedState(()=>({WEAPONS:[],_defaultAmmo:()=>({}),_enemy:()=>currentEnemy,currentPlaythrough:()=>run}));
  const data=store._data();assert.deepEqual(data.enemy,{dmg:99,life:123});
  const snapshot=structuredClone(data);currentEnemy={dmg:1,life:1};
  store._data();assert.deepEqual(data,snapshot);
});

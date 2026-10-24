import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDestinyRoster, loadDestinyRoster } from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import { createWinterFight } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
const seed=JSON.parse(readFileSync(new URL('../../../data/simulator-rosters/1285.json',import.meta.url),'utf8'));

test('the API roster preserves ordering, printed nulls, variants and defensive copies',async()=>{
  const calls=[];
  const roster=await loadDestinyRoster(1285,async path=>{calls.push(path);return {ok:true,json:async()=>[...seed.enemies].reverse()};});
  assert.deepEqual(calls,['/api/books/1285/enemies']);
  assert.equal(roster.length,99);
  assert.equal(roster.find(e=>e.section==='468').parts[0].health,null);
  assert.deepEqual(roster.find(e=>e.section==='135').parts[0].variants.armour,[2,5]);
  assert.equal(Object.isFrozen(roster[0].parts[0]),true);
  assert.throws(()=>createWinterFight({speed:2,brawn:3,armour:1,health:20},30),/Load the book roster/);
  const fight=createWinterFight({speed:2,brawn:3,armour:1,health:20},30,{roster});
  fight.opponents[0].health=1;
  assert.notEqual(roster[0].parts[0].health,1);
});

test('missing slots, duplicates and conflicting metadata cannot silently form an incomplete encounter',()=>{
  const slot=seed.enemies.findIndex(row=>row.stats.encounter.partCount>1);
  assert.throws(()=>decodeDestinyRoster(seed.enemies.filter((_,index)=>index!==slot)),/Incomplete/);
  assert.throws(()=>decodeDestinyRoster([...seed.enemies,seed.enemies[0]]),/Inconsistent/);
  const bad=structuredClone(seed.enemies);bad[0].stats.slot=999;
  assert.throws(()=>decodeDestinyRoster(bad),/Invalid encounter/);
});

test('HTTP failures remain retryable and legacy manual enemies do not become invented presets',async()=>{
  await assert.rejects(loadDestinyRoster(1285,async()=>({ok:false})),/Could not load/);
  assert.deepEqual(decodeDestinyRoster([{name:'Manual opponent',attack:5,hp:10}]),[]);
  assert.equal((await loadDestinyRoster(1285,async()=>({ok:true,json:async()=>seed.enemies}))).length,99);
});

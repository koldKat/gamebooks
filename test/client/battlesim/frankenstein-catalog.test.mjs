import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRoster} from '../../../public/js/battlesim/books/1576/definition.js';
import * as book from '../../../public/js/battlesim/books/1576/definition.js';
const require=createRequire(import.meta.url);
const {getRosterRows,readRosterDocument}=require('../../helpers/roster-db.cjs');

// Read the installed or rehearsal catalog; do not keep another roster in this test.
test('Frankenstein loads its complete source encounter and ally datasets through the catalog boundary',async()=>{
  const rows=getRosterRows(1576);
  await loadRoster(async()=>({ok:true,json:async()=>rows}));
  assert.equal(book.ENCOUNTERS.length,34);assert.equal(book.ALLIES.length,3);
  assert.deepEqual(book.RULES.combatRole,['monster','doctor']);
  assert.equal(book.RULES.createdAlly.lifePoints,25);
  assert.deepEqual(book.RULES.persistentStatuses,['poison']);
  const covered=new Set([...book.ENCOUNTERS.map(row=>row.section),...book.ALLIES.map(row=>row.sourceSection)]);
  assert.equal(covered.size,35);
  for(const row of book.ENCOUNTERS)assert.ok(row.sourcePdfPages.length);
  assert.equal(readRosterDocument(1576).family,'horror-classic');
});

test('Frankenstein preserves easily misread source values, absent PSI and statless machinery',async()=>{
  await loadRoster(async()=>({ok:true,json:async()=>getRosterRows(1576)}));
  const at=section=>book.ENCOUNTERS.find(row=>row.section===section);
  assert.equal(at(74).lifePoints,70);
  assert.equal(at(275).strength,12);
  assert.equal(at(275).rules.singleFatalShot,9);
  assert.equal(at(182).psi,null);assert.deepEqual(at(182).rules.unavailableStats,['psi']);
  assert.equal(at(260).mode,'machine');assert.equal(at(260).lifePoints,null);
  assert.equal(at(260).rules.machineDamage,7);assert.equal(at(260).rules.machineStopRoll,12);
  assert.equal(at(137).rules.groupOpeningDamage,40);
  assert.equal(at(247).rules.sequential,true);
  assert.equal(at(213).rules.fatalElement,'cold');
  assert.equal(at(144).rules.onRoll[0].element,'fire');
  assert.equal(book.ALLIES.some(row=>/wozrekk/i.test(row.name)),false);
  for(const scripted of [151,180,191,194,203,210,218,259,266,274])assert.equal(at(scripted),undefined);
});

import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import * as rules from '../../../public/js/battlesim/books/722/combat.js';

await loadFixtureRoster(722);
const hero=()=>({...rules.newCharacter('wizard',()=>6),luck:0,cakeHalves:1});
const dice=(...values)=>()=>{assert.ok(values.length,'unexpected die');return values.shift();};

test('old saved configurations retain first-hit transitions without new metadata fields',()=>{
  for(const section of [151,256]){
    const old=rules.startFight(section,hero());delete old.config.firstPlayerHitRule;
    const before=JSON.stringify(old);let next=rules.round(old,0,dice(6,6,1,1));
    while(next.pending.length)next=rules.resolveWound(next,'skip');
    assert.equal(JSON.stringify(old),before,'source save is immutable');
    if(section===151){
      assert.equal(next.noticeDestination,189);assert.equal(next.config.winningRoundLuckDestination,38);
      const decision=rules.round(next,0,dice(6,6,1,1));
      assert.equal(rules.decideWraithLuck(decision,'cake').destination,38);
    }else{
      assert.equal(next.noticeDestination,11);assert.equal(next.config.mode,'limbs');assert.equal(next.enemies.length,6);
    }
  }
  const textDestination=rules.startFight(151,hero());textDestination.config.firstPlayerHitDestination='189';
  const redirected=rules.round(textDestination,0,dice(6,6,1,1));
  assert.equal(redirected.outcome,'redirect');assert.equal(redirected.destination,'189');
});

test('renamed transitions, arrow outcomes and ally limits follow supplied metadata',async()=>{
  const seed=readRosterDocument(722);
  for(const row of seed.enemies){
    const entry=row.stats.entry;
    if(entry.section===151){entry.firstPlayerHitDestination=900;entry.firstPlayerHitRule.destination=901;}
    if(entry.section===256){entry.firstPlayerHitDestination=902;entry.firstPlayerHitRule.section=903;entry.firstPlayerHitRule.event='customSplit';}
    else if(entry.section===11)entry.section=903;
    if(entry.section===13){entry.openingArrowResults['1']={damage:2};entry.openingArrowResults['6']={fatal:true};}
    if(entry.section===118)entry.ally.stamina=6;
  }
  const definitionUrl=new URL('../../../public/js/battlesim/books/722/definition.js?custom-metadata',import.meta.url);
  const definition=await import(definitionUrl.href);
  await definition.loadRoster(async()=>({ok:true,json:async()=>seed.enemies}));
  const combatUrl=new URL('../../../public/js/battlesim/books/722/combat.js',import.meta.url);
  const source=readFileSync(combatUrl,'utf8')
    .replace("'./definition.js'",JSON.stringify(definitionUrl.href))
    .replace("'../../engines/fighting-fantasy/opponents.js'",JSON.stringify(new URL('../../engines/fighting-fantasy/opponents.js',combatUrl).href));
  const custom=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const first=custom.round(custom.startFight(151,hero()),0,dice(6,6,1,1));
  assert.equal(first.noticeDestination,900);assert.equal(first.config.winningRoundLuckDestination,901);
  const escaped=custom.decideWraithLuck(custom.round(first,0,dice(6,6,1,1)),'cake');
  assert.equal(escaped.destination,901);
  let split=custom.round(custom.startFight(256,hero()),0,dice(6,6,1,1));
  while(split.pending.length)split=custom.resolveWound(split,'skip');
  assert.equal(split.noticeDestination,902);assert.equal(split.config.section,903);
  assert.equal(split.events.at(-1).kind,'customSplit');assert.equal(split.enemies.length,6);
  assert.equal(custom.startFight(13,hero(),{},()=>1).player.stamina,22);
  assert.equal(custom.startFight(13,hero(),{},()=>6).outcome,'loss');
  assert.equal(custom.startFight(118,hero(),{beggarStamina:6}).allies[0].stamina,6);
  assert.throws(()=>custom.startFight(118,hero(),{beggarStamina:7}),/Invalid/);
});

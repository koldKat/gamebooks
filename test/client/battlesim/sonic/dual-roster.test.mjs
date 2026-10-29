import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRoster, getRoster, getPlayerDefaults } from '../../../../public/js/battlesim/books/1449/definition.js';
import { startDualFight, dualRound, dualChaosEncounter } from '../../../../public/js/battlesim/engines/sonic/dual.js';

const catalog=readRosterDocument(1449);
const fetcher=async()=>({ok:true,json:async()=>catalog.enemies});
test('Zone Rangers loads all source profiles and independent hero defaults',async()=>{
  await loadRoster(fetcher);
  assert.equal(getRoster().length,21);assert.equal(catalog.enemies.length,38);
  for(const hero of Object.values(getPlayerDefaults().heroes)){
    assert.deepEqual(Object.values(hero.abilities).sort((a,b)=>a-b),[2,2,2,3,4,5]);
    assert.equal(hero.lives,3);assert.equal(hero.rings,0);
  }
});
test('every source encounter can finish without changing roster metadata',async()=>{
  await loadRoster(fetcher);const before=JSON.stringify(getRoster());
  for(const source of getRoster()){
    let entry=structuredClone(source);
    if(entry.manualAbility)for(const enemy of entry.enemies)enemy.ability='strength';
    if(entry.chaos)entry=dualChaosEncounter(entry,{blueBonus:2},[{name:'Companion',mutated:true}]);
    const heroes=structuredClone(getPlayerDefaults().heroes);
    for(const hero of Object.values(heroes))for(const key of Object.keys(hero.abilities))hero.abilities[key]=20;
    let fight=startDualFight(heroes,entry),rounds=0;
    while(fight.status==='fighting'&&rounds++<10)fight=dualRound(fight,{},()=>1);
    assert.equal(fight.status,'win',entry.section);
  }
  assert.equal(JSON.stringify(getRoster()),before);
});
test('source exceptions preserve manual omissions and separate actor outcomes',async()=>{
  await loadRoster(fetcher);const at=section=>getRoster().find(entry=>entry.section===section);
  assert.equal(at('295').manualAbility,true);assert.equal(at('295').enemies[0].ability,null);
  assert.equal(at('106').exits.sonic.section,null);
  assert.deepEqual(at('181').exits,{sonic:{when:'lifeLost',section:'160'},tails:{when:'hit',section:'128'}});
  assert.deepEqual(at('81').enemies.map(enemy=>[enemy.hero,enemy.ability]),[['sonic','speed'],['tails','speed'],['sonic','strength'],['tails','strength']]);
  assert.equal(at('255').exits.sonic.section,'31');
  assert.deepEqual(at('142').victoryRings,{sonic:3,tails:3});
  assert.equal(at('93').helperHitSplit,undefined);
  assert.equal(at('295').helperHitSplit,false);
});

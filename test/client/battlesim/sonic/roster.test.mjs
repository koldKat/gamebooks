import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRoster, getPlayerDefaults, loadRoster } from '../../../../public/js/battlesim/books/1453/definition.js';
import { startSonicFight, sonicRound } from '../../../../public/js/battlesim/engines/sonic/core.js';

const catalog=JSON.parse(readFileSync('data/simulator-rosters/1453.json','utf8'));
const fetcher=async()=>({ok:true,json:async()=>catalog.enemies.map(row=>({name:row.name,stats:row.stats}))});

test('all sixty source encounters load only from complete database metadata',async()=>{
  await loadRoster(fetcher);
  assert.equal(getRoster().length,60);
  assert.equal(catalog.enemies.length,102);
  assert.deepEqual(Object.values(getPlayerDefaults().abilities).sort((a,b)=>a-b),[2,2,2,3,4,5]);
  assert.equal(getPlayerDefaults().lives,3);
  assert.equal(getPlayerDefaults().ringLifeCost,100);
});

test('every preset supports a complete ordinary victory without changing its source metadata',async()=>{
  await loadRoster(fetcher);
  const before=JSON.stringify(getRoster());
  for(const entry of getRoster()){
    const hero={...getPlayerDefaults(),abilities:Object.fromEntries(Object.keys(getPlayerDefaults().abilities).map(key=>[key,20]))};
    let f=startSonicFight(hero,entry),rounds=0;
    while(f.status==='fighting'&&rounds++<100)f=sonicRound(f,{},()=>1);
    assert.equal(f.status,'win',entry.section);
  }
  assert.equal(JSON.stringify(getRoster()),before);
});

test('exception presets keep their distinct source rules',async()=>{
  await loadRoster(fetcher);const entry=s=>getRoster().find(e=>e.section===s);
  assert.equal(entry('197').startEnemyRoll.defeatOn[0],6);
  assert.equal(entry('206').startEnemyRoll,undefined);
  assert.equal(entry('251').enemies.length,1);
  assert.equal(entry('168').entryEffects[0].kind,'hit');
  assert.equal(entry('209').entryEffects,undefined);
  assert.equal(entry('203').victoryEffects[0].kind,'randomRings');
  assert.equal(entry('228').victoryEffects,undefined);
  assert.equal(entry('254').firstAttackModifier,-2);
  assert.equal(entry('184').bonus,-2);
  assert.equal(entry('170').enemies[0].rating,12);
  assert.equal(entry('22').hitBranches,undefined);
  assert.equal(entry('285').hitBranches,undefined);
  assert.equal(entry('120').hitBranches[0].endFight,true);
});

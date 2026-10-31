import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../../helpers/roster-db.cjs';
import {getRoster,getPlayerDefaults,loadRoster} from '../../../../public/js/battlesim/books/1483/definition.js';
import {validateKnightmareCatalog} from '../../../../public/js/battlesim/engines/knightmare/catalog.js';

const document=readRosterDocument(1483);
await loadRoster(async()=>({ok:true,json:async()=>document.enemies}));

test('installed source roster supplies the single printed duel and shared rules',()=>{
  const roster=getRoster();assert.equal(roster.length,1);
  assert.equal(roster[0].section,'11');assert.equal(roster[0].setupSection,'46');
  assert.equal(roster[0].opponent.name,'Sir Aspen');assert.equal(roster[0].opponent.lifeForce,'GREEN');
  assert.deepEqual(getPlayerDefaults(),{rules:{dieSides:6,playerHitMax:2},player:{lifeForce:'GREEN'}});
  assert.deepEqual(roster[0].sourcePdfPages,[59,60,62,68]);
});

test('incomplete, contradictory or malformed database presets are rejected',()=>{
  const source=getRoster();assert.throws(()=>validateKnightmareCatalog([]));
  assert.throws(()=>validateKnightmareCatalog([...source,...source]));
  for(const edit of [r=>r[0].opponent.lifeForce='DEAD',r=>r[0].rules.dieSides=20,
    r=>r[0].rules.playerHitMax=0,r=>r[0].opponent.name='',r=>r[0].playerDefaults.lifeForce='blue']){
    const copy=structuredClone(source);edit(copy);assert.throws(()=>validateKnightmareCatalog(copy));
  }
  const copy=structuredClone(source);copy.push({...structuredClone(copy[0]),section:'2',rules:{dieSides:6,playerHitMax:3}});
  assert.throws(()=>validateKnightmareCatalog(copy));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import roster from '../../helpers/roster-db.cjs';
import {startFight} from '../../../public/js/battlesim/engines/lost-jedi/core.js';
import {attackProfile} from '../../../public/js/battlesim/engines/lost-jedi/targeting.js';

const document=roster.readRosterDocument(1578);
const entries=document.enemies.filter(row=>row.stats.dataset==='ENCOUNTERS').map(row=>row.stats.entry);
const entry=section=>entries.find(row=>row.section===String(section));
const player={blaster:3,lightsabre:3,technical:3,jediPoints:6,maxJediPoints:6,weapon:'blaster',ready:true};
const options={range:'range',initiative:'havet',survivingGuards:2,survivingRebels:1};
const start=(section,extra={})=>startFight({encounter:entry(section),player,...options,...extra});

test('every printed complete encounter and each explicit variant initializes from the database',()=>{
  assert.equal(document.family,'lost-jedi');assert.equal(entries.length,51);
  assert.equal(new Set(entries.map(row=>row.section)).size,51);
  let presets=0;
  for(const encounter of entries){
    assert.ok(encounter.sourcePdfPages.length);
    if(encounter.rules.modifierOnly || encounter.rules.reinforcements===true) {
      assert.throws(()=>start(encounter.section),/complete encounter/);continue;
    }
    presets++;
    const variants=encounter.rules.requireVariant?encounter.rules.storyVariants:[null];
    for(const variant of variants){
      const fight=start(encounter.section,{variant:variant?.section});
      assert.ok(fight.actors.length>1,encounter.section);assert.equal(fight.outcome,null);
      assert.equal(fight.pending,null);assert.ok(fight.queue.length);
    }
  }
  assert.equal(presets,41);
});

test('the jail cover, surviving guards and optional initial Imperial casualty remain distinct',()=>{
  const jail=start(524),guard=jail.actors.find(a=>a.team==='imperial');
  assert.equal(guard.target,8);assert.equal(guard.armoured,false);
  assert.equal(jail.actors.length,10);
  const counter=start(534);assert.equal(counter.actors.length,10);
  assert.equal(counter.actors.filter(a=>a.team==='rebels').length,2);
  for(const section of [517,518,520,521,531]){
    assert.equal(start(section,{oneFewerImperial:true}).actors.length,start(section).actors.length-1);
  }
});

test('stormtrooper variants require a deliberate choice and optional Rebel skills are never invented',()=>{
  assert.throws(()=>start(567),/variant/);
  assert.throws(()=>start(567,{variant:'572',extraRebels:true}),/Combat Skill/);
  const fight=start(567,{variant:'572',extraRebels:true,extraRebelSkill:2});
  assert.equal(fight.actors.length,10);
  assert.deepEqual(fight.rules.reinforcementWaves.map(w=>w.afterRound),[2,4]);
  assert.deepEqual(start(567,{variant:'577'}).rules.reinforcementWaves.map(w=>w.afterRound),[2,3]);
  assert.deepEqual(start(567,{variant:'582'}).rules.reinforcementWaves.map(w=>w.afterRound),[2]);
});

test('Fett armor, forced weapons and the printed desert zero retain their source profiles',()=>{
  for(const section of [601,602,610,611,634,635])assert.equal(start(section).actors.find(a=>a.tag==='fett').target,9);
  assert.equal(start(636).actors.find(a=>a.tag==='fett').target,8);
  assert.equal(start(580).player.weapon,'force-pike');
  assert.equal(start(584).player.weapon,'dart-launcher');
  const desert=start(631),havet=desert.actors[0],target=desert.actors[1];
  assert.equal(attackProfile(desert,havet,target).skill,0);
  assert.equal(start(544).player.weapon,'unarmed');
});

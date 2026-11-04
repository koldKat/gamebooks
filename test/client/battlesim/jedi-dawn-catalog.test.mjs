import test from 'node:test';
import assert from 'node:assert/strict';
import roster from '../../helpers/roster-db.cjs';
import {startFight} from '../../../public/js/battlesim/engines/lost-jedi/core.js';
import {attackProfile} from '../../../public/js/battlesim/engines/lost-jedi/targeting.js';

const document=roster.readRosterDocument(1577);
const entries=document.enemies.filter(row=>row.stats.dataset==='ENCOUNTERS').map(row=>row.stats.entry);
const entry=section=>entries.find(row=>row.section===String(section));
const player={blaster:3,lightsabre:3,technical:3,jediPoints:6,maxJediPoints:6,weapon:'blaster',ready:true};
const start=encounter=>startFight({encounter,player,range:'range',initiative:'havet'});

test('all source combat records are database backed and every complete preset initializes',()=>{
  assert.equal(document.family,'lost-jedi');assert.equal(entries.length,34);
  assert.equal(new Set(entries.map(row=>row.section)).size,34);
  for(const row of entries){
    assert.ok(row.sourcePdfPages.length);
    if(row.rules.modifierOnly || row.rules.reinforcements===true) continue;
    const fight=start(row);
    assert.ok(fight.actors.length>1);assert.equal(fight.pending,null);assert.equal(fight.outcome,null);
  }
});

test('the Wookiee needs a die six against Fett and uses the printed turn order',()=>{
  const f=start(entry(578)),fett=f.actors.find(actor=>actor.tag==='fett'),ally=f.actors.find(actor=>actor.tag==='wookiee');
  const profile=attackProfile(f,ally,fett);
  assert.equal(profile.skill,4);assert.equal(profile.target,10);
  assert.deepEqual(f.queue.map(id=>f.actors.find(actor=>actor.id===id).tag),['havet','fett','wookiee']);
});

test('Research Lab reinforcement count is three and later guards retain their source profiles',()=>{
  const labs=entry(612).rules;assert.equal(labs.reinforcementsAtRound,3);
  assert.equal(labs.reinforcements[0].count,3);assert.equal(labs.reinforcements[0].rangedSkill,1);
  assert.equal(entry(615).actors[0].count,2);assert.equal(entry(615).actors[0].rangedSkill,2);
  assert.equal(entry(607).rules.reinforcementAfterRound,2);
});

test('cantina cover, initial holster delay and fixed-range injury remain distinct',()=>{
  const cover=start(entry(559)),fett=cover.actors.find(actor=>actor.tag==='fett'),havet=cover.actors.find(actor=>actor.id==='havet');
  assert.equal(attackProfile(cover,havet,fett).target,11);
  assert.equal(attackProfile(cover,fett,havet).target,8);
  assert.equal(entry(583).actors[0].skipFirstRangedTurn,true);
  assert.equal(entry(536).rules.rangeLocked,true);
  assert.equal(entry(536).rules.printedReturn,'172');
});

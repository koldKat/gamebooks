import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument,getRosterRows} from '../../helpers/roster-db.cjs';
import {loadRoster,getRoster,getSettings} from '../../../public/js/battlesim/books/261/definition.js';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const document = readRosterDocument(261);
const entries = [...new Map(document.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const entry = section => entries.find(row=>row.section===String(section));
const hero = () => ({skill:12,skillInitial:12,stamina:24,staminaInitial:24,luck:12,luckInitial:12,
  gold:10,provisions:10,potion:'skill',potionUses:1,attackModifier:0,nextFightPenalty:0,items:{}});
const dice = values => {let i=0;return()=>{assert.ok(i<values.length,'Unexpected die');return values[i++];};};

test('database roster and real loader retain all34 encounters and54 NPC rows',async()=>{
  assert.equal(entries.length,34);assert.equal(document.enemies.length,54);
  for(const encounter of entries){assert.ok(encounter.sourcePages.length);assert.ok(encounter.printedRules.length);}
  await loadRoster(async url=>{assert.equal(url,'/api/books/261/enemies');return {ok:true,json:async()=>getRosterRows(261)};});
  assert.equal(getRoster().length,34);assert.deepEqual(getSettings().defaults,{gold:0,provisions:10});
});

test('printed exceptions remain attached to their exact encounter',()=>{
  assert.equal(entry(24).attacksPerRound,2);assert.equal(entry(342).simultaneous,true);
  assert.equal(entry(31).firstRoundOutcome,'outgoing');assert.equal(entry(338).firstRoundOutcome,'incoming');
  assert.equal(entry(336).outgoingDamage,1);assert.equal(entry(265).loseOnLostRound,true);
  assert.equal(entry(69).cleanWin,'208');assert.equal(entry(69).win,'354');
  for(const n of[107,278])assert.equal(entry(n).attackModifier,-3);
  assert.equal(entry(202).attackModifier,-4);assert.equal(entry(290).attackModifier,-2);
  for(const n of[261,290])assert.equal(entry(n).escape.gold,3);
  assert.equal(entry(259).escape.damage,0);assert.equal(entry(337).entry.skillChange,3);
  assert.equal(entry(160).entry.skillChange,-1);assert.equal(entry(160).entry.stamina,2);
});

test('every preset can complete through the shared combat engine without story automation',()=>{
  for(const encounter of entries){
    const original=hero();let fight=combat.startFight(original,encounter,{applyEntry:false}),steps=0;
    while(fight.status==='active'){
      assert.ok(++steps<200,'Encounter must finish');
      if(fight.pending)fight=combat.resolveWound(fight);
      else {
        const rolls=encounter.simultaneous
          ? fight.roundSequence?.length?[1,1]:[6,6,1,1]
          : [1,1,6,6];
        fight=combat.roundFight(fight,[],dice(rolls));
      }
    }
    assert.equal(fight.status,'win',encounter.section);assert.deepEqual(original,hero());
    assert.equal(fight.destination,encounter.cleanWin??encounter.win);
  }
});

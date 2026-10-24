import test from 'node:test';
import assert from 'node:assert/strict';
import { createArkhamCharacter, createArkhamFight, rollArkhamRound } from '../../../public/js/battlesim/engines/arkham-darkness.js';
import { createKingsportCharacter, createKingsportFight, rollKingsportRound } from '../../../public/js/battlesim/engines/kingsport.js';
import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(555);
await loadFixtureRoster(557);

const setup = {displayName: 'Manual encounter', roundsCount: 3, threshold1: 1, threshold2: 1,
  threshold3: 1, threshold4: 1, winsRequired: 2, modifier: 1};

test('custom threshold combat preserves the multi-round system without inventing enemy health', () => {
  const arkham = createArkhamCharacter('agnes', {willpower: 4, intellect: 3, combat: 2, health: 6, sanity: 6});
  for (const [player, start, step] of [[arkham, (p, options) => createArkhamFight(0, p, false, options), rollArkhamRound],
    [createKingsportCharacter('lucius'), (p, options) => createKingsportFight(0, p, options), rollKingsportRound]]) {
    const before = structuredClone(player), fight = start(player, {opponents: [setup]});
    assert.equal(fight.spec.custom, true);
    assert.equal(fight.enemies, undefined);
    for (let i = 0; i < 3; i++) step(fight, {}, () => .5);
    assert.equal(fight.status, 'win');
    assert.equal(fight.rounds.length, 3);
    assert.deepEqual(player, before);
    assert.throws(() => start(player, {opponents: [{...setup, roundsCount: 1}]}));
    assert.throws(() => start(player, {opponents: [{...setup, winsRequired: 4}]}));
  }
});

test('autocomplete presets do not give custom Arkham fights printed destinations', () => {
  const player=createArkhamCharacter('agnes',{willpower:4,intellect:3,combat:2,health:6,sanity:6});
  for(const threshold of [1,100]){
    const fight=createArkhamFight(0,player,false,{opponents:[{...setup,presetSection:62,
      threshold1:threshold,threshold2:threshold,threshold3:threshold}]});
    for(let i=0;i<3;i++)rollArkhamRound(fight,{},()=>.5);
    assert.equal(fight.status,threshold===1?'win':'loss');
    assert.equal(fight.destination,undefined);
    assert.deepEqual(fight.spec.stats,['combat','willpower']);
  }
  const printed=createArkhamFight(62,player);
  for(let i=0;i<3;i++)rollArkhamRound(printed,{},()=>.99);
  assert.equal(printed.destination,103);
});

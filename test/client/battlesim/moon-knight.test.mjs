import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startFight, combatAction, normalizeEncounter} from '../../../public/js/battlesim/books/603/combat.js';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const specs = [...new Map(getRosterRows(603).map(row => [row.stats.entryIndex,row.stats.entry.spec])).values()];
const spec = section => specs.find(entry => entry.section === String(section));
const hero = {might:3,mystic:3,mind:3};
const start = (section, params = {}, player = hero) => startFight(player,spec(section),{params});
const act = (fight,kind,extra = {}) => combatAction(fight,{kind,expectedRevision:fight.revision,...extra});
const round = (fight,die = 1) => act(act(fight,'roll',{
  playerDice:Array(fight.encounter.rounds[fight.round].dice).fill(die),
}),'resolve');

test('the roster contains combat encounters without pursuit or stealth utilities', () => {
  assert.equal(specs.length,36);assert.equal(new Set(specs.map(entry=>entry.key)).size,36);
  for(const entry of specs)normalizeEncounter(entry);
  for(const section of [139,205,235,240,275])assert.equal(spec(section),undefined);
  assert.equal(spec(168).rounds.length,1);
});
test('museum combat preserves the one-die encounter and distinct thresholds', () => {
  assert.deepEqual(spec(281).rounds.map(r=>[r.dice,r.target]),[[1,7],[1,8]]);
  assert.deepEqual(spec(179).rounds.map(r=>[r.dice,r.target]),[[2,10],[2,9]]);
  assert.deepEqual(spec(233).rounds.map(r=>[r.dice,r.target]),[[2,11],[2,10]]);
  assert.throws(()=>act(start(281),'roll',{playerDice:[6,6]}),RangeError);
  let fight=round(round(start(281),6),6);
  assert.deepEqual(fight.rounds.map(r=>r.total),[9,10]);
  assert.equal(act(fight,'finish').destination,129);
});
test('boss Might adjustments use wins minus one exactly once', () => {
  for(const dice of [[1,1,1],[6,6,1],[6,6,6]]){
    let fight=start(13);
    for(const die of dice)fight=round(fight,die);
    const wins=fight.rounds.filter(r=>r.won).length;
    assert.equal(fight.player.might,hero.might+wins-1);
    assert.deepEqual(act(fight,'finish').player,fight.player);
    assert.equal(fight.player.mystic,hero.mystic);
  }
});
test('the ambiguous Scarlet passage requires a manual overall result', () => {
  let fight=round(round(round(start(41,{unlocked:1}),6),6),1);
  assert.equal(fight.rounds.filter(r=>r.won).length,2);
  assert.equal(fight.result,'manual');assert.equal(fight.player.might,4);
  assert(spec(41).sourceNotes.join(' ').includes('overlap'));
  assert.equal(act(fight,'finish',{outcome:'win'}).destination,25);
  assert.equal(act(fight,'finish',{outcome:'loss'}).destination,107);
  assert.equal(spec(61).rules.goal.kind,'last');
});
test('Seth applies Dark power and each artifact only in its printed rounds', () => {
  const player={might:10,mystic:10,mind:10};
  let fight=start(192,{snakebite:4,darkPower:2,awed:1,khopesh:1,ankh:1,eyeOfHorus:1},player);
  for(let n=0;n<5;n++)fight=round(fight);
  assert.deepEqual(fight.rounds.map(r=>r.total),[15,26,27,26,38]);
  assert.deepEqual(fight.rounds.map(r=>r.target),[23,24,24,25,25]);
  assert.equal(fight.result,'win');assert.deepEqual(fight.player,player);
  assert.equal(act(fight,'finish').destination,128);
});
test('the horde uses all printed qualities and a single alternative weapon bonus', () => {
  let fight=round(start(168,{unlocked:1,granted:2,eclipsed:3,knighted:4,feared:5,weaponBonus:2}));
  assert.equal(fight.rounds[0].total,28);assert.equal(fight.result,'win');
  fight=round(round(start(163,{weaponBonus:2}),6),6);
  assert.deepEqual(fight.rounds.map(r=>r.total),[17,17]);
  assert.equal(act(fight,'finish').destination,112);
});
test('last-round results and chained bonuses remain encounter-specific', () => {
  let fight=round(round(start(37,{unlocked:1}),1),6);
  assert.equal(fight.rounds[0].won,false);assert.equal(fight.result,'win');
  assert.equal(act(fight,'finish').destination,148);
  assert.equal(spec(261).rules.win,196);
  fight=round(round(round(start(224),6),6),6);
  assert.deepEqual(fight.rounds.map(r=>r.total),[15,16,16]);
  fight=round(round(round(start(262,{inTheHeights:2}),6),6),6);
  assert.deepEqual(fight.rounds.map(r=>r.total),[13,13,13]);
  assert.deepEqual(fight.player,hero);
});

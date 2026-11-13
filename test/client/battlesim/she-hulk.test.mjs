import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startFight, combatAction, normalizeEncounter} from '../../../public/js/battlesim/books/602/combat.js';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const specs = [...new Map(getRosterRows(602).map(row => [row.stats.entryIndex,row.stats.entry.spec])).values()];
const spec = section => specs.find(entry => entry.section === String(section));
const hero = {power:3,charm:3,concentration:3};
const start = (section, params = {}, options = {}) => startFight(hero,spec(section),{params,...options});
const act = (fight,kind,extra = {}) => combatAction(fight,{kind,expectedRevision:fight.revision,...extra});
const roll = (fight,won = false,extra = {}) => act(act(fight,'roll',{playerDice:won?[6,6]:[1,1],...extra}),'resolve');

test('the installed roster contains the 35 reviewed combat phases and excludes item utilities', () => {
  assert.equal(specs.length,35); assert.equal(new Set(specs.map(entry=>entry.key)).size,35);
  for(const entry of specs){normalizeEncounter(entry);assert(entry.rounds.every(round=>round.dice===2));}
  assert.equal(spec(98),undefined);assert.equal(spec(288),undefined);
});
test('held combat item bonuses affect only their printed rounds', () => {
  let fight=start(49,{experimentalGauntlet:1,spikedKnuckles:1,stainedMachete:1});
  for(let n=0;n<3;n++)fight=roll(fight);
  assert.deepEqual(fight.rounds.map(round=>round.total),[7,7,7]);
  fight=roll(roll(start(87,{stainedMachete:1})));
  assert.deepEqual(fight.rounds.map(round=>round.total),[7,5]);
  assert(spec(87).sourceNotes.join(' ').includes('incomplete'));
});
test('breaking the stake expires its bonus before the third round', () => {
  let fight=start(268,{terribleStake:1});
  for(let n=0;n<3;n++)fight=roll(fight,true);
  assert.deepEqual(fight.rounds.map(round=>round.total),[17,16,15]);
  assert.equal(fight.params.terribleStake,0);assert.equal(fight.events.filter(e=>e.kind==='note').length,1);
  assert.deepEqual(spec(226).rounds.map(round=>round.target),[8,8,8]);
});
test('Walrus preserves all three result destinations without applying later story costs', () => {
  for(const [wins,destination]of [[2,284],[1,91],[0,213]]){
    let fight=start(120);
    for(let n=0;n<3;n++)fight=roll(fight,n<wins);
    fight=act(fight,'finish');assert.equal(fight.destination,destination);assert.deepEqual(fight.player,hero);
  }
});
test('the robot death branch skips the costs belonging to a surviving result', () => {
  let fight=roll(roll(start(287)));assert.deepEqual(fight.player,hero);
  assert.equal(act(fight,'finish').destination,7);
  fight=roll(roll(start(287),true));assert.deepEqual(fight.player,{power:3,charm:2,concentration:1});
  assert.equal(fight.result,'win');
});
test('bench fights adjust Power by wins minus one without inventing a victory condition', () => {
  for(const section of [79,115])for(let wins=0;wins<=3;wins++){
    let fight=start(section,{troublesome:1,nobbled:2});
    for(let n=0;n<3;n++)fight=roll(fight,n<wins);
    assert.equal(fight.player.power,2+wins);assert.equal(fight.result,'manual');
  }
});
test('combat-only item effects and continuation costs match the reviewed source', () => {
  let fight=act(start(86,{}, {consumables:{crystal:true}}),'consume',{key:'crystal'});
  assert.deepEqual(fight.player,{power:2,charm:2,concentration:2});
  fight=roll(fight);assert.equal(fight.rounds[1].total,5);assert.equal(act(fight,'finish').destination,55);
  fight=roll(roll(start(160,{stainedMachete:1,glop:1})));
  assert(fight.rounds.every(round=>round.won&&round.forced));assert.deepEqual(fight.player,hero);
  fight=roll(start(101));assert.deepEqual(fight.player,{power:2,charm:3,concentration:2});assert.equal(fight.encounter.rounds.length,1);
});
test('helmet protection and first-round pepper spray preserve their exact scope', () => {
  let fight=roll(roll(start(68,{oddHelmets:1})));assert.deepEqual(fight.player,hero);
  fight=roll(roll(start(68)));assert.deepEqual(fight.player,{power:3,charm:2,concentration:1});
  fight=act(start(33,{}, {consumables:{pepperSpray:true}}),'consume',{key:'pepperSpray'});
  fight=roll(fight);assert.equal(fight.consumables.pepperSpray,0);assert.equal(fight.player.concentration,2);
  assert.equal(spec(49).rules.consumables.pepperSpray,undefined);
});

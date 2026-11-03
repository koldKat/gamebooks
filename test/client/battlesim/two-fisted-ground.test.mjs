import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rollFists} from '../../../public/js/battlesim/engines/two-fisted/dice.js';
import {groundPlayer, startGroundFight, prepareGroundRound, advanceGroundFight,
  decideGroundReroll} from '../../../public/js/battlesim/engines/two-fisted/ground.js';

const enemy = (values = {}) => ({name: 'Opponent', expertise: 5, health: 3, fists: 1, ...values});
const crew = (values = {}) => ({name: 'Co-pilot', combat: 6, weapons: 3, shields: 4,
  fists: 1, injuries: 0, ...values});
const fight = (player = {}, opponents = [enemy()], mode = 'melee', options = {}) =>
  startGroundFight(groundPlayer(player), {mode, opponents, ...options});
function dice(...values) {
  return () => {assert.ok(values.length, 'Unexpected extra die'); return values.shift();};
}
const round = (f, action, roll) => advanceGroundFight(prepareGroundRound(f, {spend: 5, target: 0, ...action}), roll);

test('zero FISTS rolls no hidden die, while Chakold rerolls each six exactly once', () => {
  assert.equal(rollFists(0, () => {throw Error('No dice available');}).score, 0);
  assert.deepEqual(rollFists(2, dice(6, 6, 2), {luckySix: true}),
    {dice: [12, 2], rerolls: [6, null], score: 12});
});

test('melee ties and losses waste committed ENERGY without injuring the protagonist', () => {
  for (const expertise of [5, 6]) {
    const original = fight({}, [enemy({expertise})]);
    const next = round(original, {}, dice(3, 2, 3));
    assert.equal(next.player.energy, 55); assert.equal(next.player.expertise, 6);
    assert.equal(next.player.injuries, 0); assert.equal(next.opponents[0].health, 3);
    assert.equal(original.player.energy, 60, 'Pure resolution preserves the caller');
  }
});

test('a strict melee win damages the enemy and ENERGY zero is defeat', () => {
  const next = round(fight(), {}, dice(6, 1, 1));
  assert.equal(next.opponents[0].health, 2);
  const exhausted = prepareGroundRound(fight({energy: 5}), {spend: 5, target: 0});
  assert.equal(exhausted.status, 'loss'); assert.deepEqual(exhausted.queue, []);
});

test('ranged ties hurt both sides and injuries immediately reduce expertise', () => {
  const tied = round(fight({}, [enemy()], 'ranged'), {}, dice(3, 1, 3));
  assert.equal(tied.opponents[0].health, 2); assert.equal(tied.player.injuries, 1);
  assert.equal(tied.player.expertise, 5);
  const lost = round(fight({}, [enemy({expertise: 9})], 'ranged'), {}, dice(1, 1, 6));
  assert.equal(lost.opponents[0].health, 3); assert.equal(lost.player.expertise, 5);
});

test('True Grit and Nova armour protect against ordinary injuries without hiding lethal shots', () => {
  for (const protection of [{trueGrit: true}, {armour: 'nova'}, {traumaKit: true}]) {
    const next = round(fight(protection, [enemy({expertise: 20})], 'ranged'), {}, dice(1, 1, 6));
    assert.equal(next.player.expertise, 6); assert.equal(next.status, 'fighting');
  }
  const lethal = round(fight({armour: 'nova', trueGrit: true}, [enemy({expertise: 20, lethalOnHit: true})], 'ranged'), {}, dice(1, 1, 6));
  assert.equal(lethal.status, 'loss'); assert.equal(lethal.player.dead, true);
});

test('an unopposed ally is capped by the protagonist’s committed ENERGY and cannot be injured on a tie', () => {
  const next = round(fight({copilot: crew({combat: 12})}), {spend: 2, copilotTargets: [0]}, dice(1, 1, 6, 1, 6));
  const exchange = next.log.filter(e => e.type === 'exchange').at(-1);
  assert.equal(exchange.unopposed, 'ally'); assert.equal(exchange.profile.expertise, 2);
  assert.equal(next.player.copilot.injuries, 0);
});

test('unmatched enemies make unopposed attacks and take no return damage', () => {
  const next = round(fight({}, [enemy({expertise: 0}), enemy({expertise: 0})], 'ranged'), {}, dice(6, 1, 1, 6, 1, 1));
  assert.equal(next.opponents[0].health, 2); assert.equal(next.opponents[1].health, 3);
  const extra = next.log.filter(e => e.type === 'exchange').at(-1);
  assert.equal(extra.unopposed, 'enemy'); assert.equal(extra.outgoing, false);
});

test('Horizon-8 absorbs only the first injury penalty, and co-pilot injuries reduce every current skill', () => {
  let next = round(fight({copilot: crew({trait: 'horizon', combat: 2})},
    [enemy({expertise: 0}), enemy({expertise: 20})]), {copilotTargets: [1]}, dice(6, 1, 1, 1, 6));
  assert.equal(next.player.copilot.combat, 2); assert.equal(next.player.copilot.injuries, 1);
  next = round(next, {copilotTargets: [1]}, dice(6, 1, 1, 1, 6));
  assert.equal(next.player.copilot.combat, 1); assert.equal(next.player.copilot.weapons, 2);
  assert.equal(next.player.copilot.shields, 3);
});

test('Gocky can mutually fight two opponents, but a crippled Gocky cannot', () => {
  const base = fight({copilot: crew({trait: 'gocky'})}, [enemy(), enemy(), enemy()]);
  const ready = prepareGroundRound(base, {spend: 2, target: 0, copilotTargets: [1, 2]});
  assert.equal(ready.queue.filter(e => e.who === 'copilot').length, 2);
  assert.ok(ready.queue.every(e => e.unopposed === null));
  const crippled = fight({copilot: crew({trait: 'gocky', crippled: true})}, [enemy(), enemy(), enemy()]);
  assert.throws(() => prepareGroundRound(crippled, {spend: 2, target: 0, copilotTargets: [1, 2]}));
});

test('a laid-low co-pilot neither attacks nor attracts enemy attacks', () => {
  const ready = prepareGroundRound(fight({copilot: crew()}, [enemy(), enemy()]), {spend: 2, target: 0, copilotLow: true});
  assert.equal(ready.queue.length, 2); assert.equal(ready.queue[1].unopposed, 'enemy');
  const next = advanceGroundFight(ready, dice(1, 1, 6, 1, 1, 6));
  assert.equal(next.player.copilot.injuries, 0);
  assert.ok(next.log.filter(e => e.type === 'exchange').every(e => e.who === 'hero'));
});

test('Tarlee’s FIST-roll bonus starts in round two and caps at three', () => {
  let f = fight({copilot: crew({trait: 'tarlee'})}, [enemy({health: 30}), enemy({health: 30})]);
  for (let i = 0; i < 5; i++) {
    f = round(f, {spend: 0, copilotTargets: [1]}, () => 1);
    assert.equal(f.log.filter(e => e.type === 'exchange').at(-1).profile.bonus, Math.min(3, i));
  }
});

test('the Trilobear footnote rolls a d3 for the number of FISTS, not a d3 attack die', () => {
  const original = startGroundFight(groundPlayer(), {mode: 'melee', opponents: [enemy({fists: undefined, randomFists: '1d3'})]}, dice(5));
  const next = round(original, {}, dice(1, 1, 2, 3, 6));
  const exchange = next.log.find(e => e.type === 'exchange');
  assert.equal(exchange.opposing.fists, 3); assert.deepEqual(exchange.enemyDice.dice, [2, 3, 6]);
  const later = round(next, {}, dice(1, 1, 2, 3, 4));
  assert.equal(later.opponents[0].rolledFists, 3);
  assert.deepEqual(later.log.filter(e => e.type === 'exchange').at(-1).enemyDice.dice, [2, 3, 4]);
});

test('the enemy Chakold uses the same single six-reroll rule as the allied character', () => {
  const next = round(fight({}, [enemy({luckySix: true})]), {}, dice(1, 1, 6, 6));
  assert.deepEqual(next.log.at(-1).enemyDice.dice, [12]);
});

test('Bob’s lethal ranged hit also kills a co-pilot despite their armour', () => {
  const next = round(fight({copilot: crew({armour: 'nova'})},
    [enemy({expertise: 0}), enemy({expertise: 20, lethalOnHit: true})], 'ranged'),
  {copilotTargets: [1]}, dice(6, 1, 1, 1, 6));
  assert.equal(next.player.copilot.dead, true);
});

test('Right Stuff rerolls one failed protagonist roll, consumes no further ENERGY and leaves enemy dice intact', () => {
  const paused = round(fight({rightStuffAvailable: true}), {}, dice(1, 1, 2));
  assert.ok(paused.pending); assert.equal(paused.player.energy, 55);
  const next = decideGroundReroll(paused, true, dice(6, 1));
  assert.equal(next.player.energy, 55); assert.equal(next.player.rightStuffAvailable, false);
  assert.equal(next.opponents[0].health, 2); assert.deepEqual(next.log.at(-1).enemyDice.dice, [2]);
  assert.equal(paused.player.rightStuffAvailable, true);
});

test('declining a reroll preserves Right Stuff, and a two-round encounter stops without inventing a campaign outcome', () => {
  const pending = round(fight({rightStuffAvailable: true}), {}, dice(1, 1, 6));
  const accepted = decideGroundReroll(pending, false, () => {throw Error('No new dice');});
  assert.equal(accepted.player.rightStuffAvailable, true); assert.equal(accepted.pending, null);
  let limited = fight({}, [enemy({health: 30})], 'melee', {roundLimit: 2});
  limited = round(limited, {}, () => 1); limited = round(limited, {}, () => 1);
  assert.equal(limited.status, 'ended');
});

test('missing opponent FISTS and invalid matchups are rejected rather than silently repaired', () => {
  assert.throws(() => fight({}, [enemy({fists: undefined})]), /Enter opponent FISTS/);
  assert.throws(() => prepareGroundRound(fight({copilot: crew()}, [enemy(), enemy()]),
    {spend: 5, target: 0, copilotTargets: [0]}), /different opponent/);
});

test('the bartender’s printed lost-round condition overrides ordinary melee safety', () => {
  const next = round(fight({}, [enemy({expertise: 20, lethalOnLostRound: true})]), {}, dice(1, 1, 6));
  assert.equal(next.status, 'loss');
});

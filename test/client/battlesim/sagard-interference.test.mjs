import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, resolveSagardTurn, sagardTurn, validateSagardFight,
  canUseSagardDagger, canThrowSagardProjectile} from '../../../public/js/battlesim/engines/sagard/core.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 7}, (_, n) => [n, [0, 1, 2, 3]]))};
const start = (rule = {}, spec = {}, hero = {}, options = {}, ruleOptions = {}) => startSagardFight({level: 3, hp: 20, ...hero},
  {name: 'Synthetic interference', heroOpeningAttacks: 2, opponents: [
    {name: 'Synthetic host', level: 6, hp: 12},
    {name: 'Synthetic untargetable actor', level: null, hp: null, chart: [2, 3, 4, 5], canBeTargeted: false}],
  interference: {actorIndex: 1, targetFaces: ['opponent', 'hero', 'hero', 'none'], ...rule}, ...spec}, {...rules, ...ruleOptions}, options);
const step = (fight, die) => resolveSagardTurn(JSON.parse(JSON.stringify(fight)), die);

test('interference precedes two opening attacks and a miss needs no damage roll', () => {
  let fight = start();
  assert.equal(sagardTurn(fight).kind, 'interferenceTarget');
  assert.equal(fight.opponents.length, 1);
  fight = step(fight, 4);
  for (let n = 0; n < 2; n++) {assert.equal(sagardTurn(fight).attackerId, 'hero'); fight = step(fight, 1);}
  assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = step(fight, 1);
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'interferenceTarget');
  fight = step(fight, 4); fight = step(fight, 1);
  assert.equal(sagardTurn(fight).attackerId, 'enemy0');
});

test('activation is a separate roll and inactive rounds proceed without target or damage rolls', () => {
  for (const die of [1, 2, 3, 4]) {
    let fight = start({activationFaces: [4]});
    fight = step(fight, die);
    assert.equal(fight.phase, die === 4 ? 'interferenceTarget' : 'round');
    assert.equal(fight.hero.hp, 20); assert.equal(fight.opponents[0].hp, 12);
    if (die !== 4) assert.equal(sagardTurn(fight).attackerId, 'hero');
  }
});

test('target selection precedes an independent damage roll and both receives the same raw damage', () => {
  for (let target = 1; target <= 4; target++) {
    let fight = start({targetFaces: ['opponent', 'hero', 'hero', 'both']});
    fight = step(fight, target);
    assert.equal(fight.phase, 'interferenceDamage');
    fight = step(fight, 2);
    assert.equal(fight.hero.hp, [2, 3, 4].includes(target) ? 17 : 20);
    assert.equal(fight.opponents[0].hp, [1, 4].includes(target) ? 9 : 12);
    assert.equal(fight.encounter.opponents[1].level, null);
    assert.equal(fight.encounter.opponents[1].hp, null);
  }
});

test('host destruction ends the encounter and simultaneous fatal damage does not revive the hero', () => {
  let fight = start({}, {opponents: [{name: 'Host', level: 6, hp: 2},
    {name: 'Interferer', level: 5, hp: null, chart: [2, 3, 4, 5], canBeTargeted: false}], winTarget: 'won'});
  fight = step(fight, 1); fight = step(fight, 1);
  assert.equal(fight.status, 'win'); assert.equal(fight.destination, 'won');
  fight = start({targetFaces: ['both', 'hero', 'hero', 'none']}, {opponents: [
    {name: 'Host', level: 6, hp: 2}, {name: 'Interferer', hp: null, chart: [2, 3, 4, 5], canBeTargeted: false}]}, {hp: 2});
  fight = step(fight, 1); fight = step(fight, 1);
  assert.equal(fight.status, 'loss'); assert.equal(fight.hero.hp, 0); assert.equal(fight.opponents[0].hp, 0);
});

test('pending interference rolls survive reload and block ordinary weapon actions', () => {
  const itemRules = {magicDagger: {maximumPower: 3, defeatsLevelAtMost: 2}, projectiles: [
    {id: 'disc', label: 'Synthetic disc', kind: 'fixed', damage: 2, maxHeld: 1, shotsPerRound: 1, phases: ['round']}]};
  let fight = start({}, {}, {}, {magicDaggerPower: 3, ammo: {disc: 1}}, itemRules);
  assert.equal(canUseSagardDagger(fight), false); assert.equal(canThrowSagardProjectile(fight, 'disc'), false);
  fight = step(fight, 2);
  validateSagardFight(JSON.parse(JSON.stringify(fight)));
  const saved = JSON.stringify(fight);
  assert.throws(() => resolveSagardTurn(fight, 5)); assert.equal(JSON.stringify(fight), saved);
  fight = step(fight, 1);
  assert.equal(canUseSagardDagger(fight), true);
});

test('explicit unknown enemy levels retain known charts without inventing a fighting level', () => {
  const spec = {name: 'Synthetic known chart', unknownOpponentLevel: true,
    opponents: [{name: 'Unknown level', level: null, hp: 12, chart: [2, 3, 4, 5]}]};
  let fight = startSagardFight({level: 3, hp: 20}, spec, rules);
  fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.hero.hp, 15); assert.equal(fight.opponents[0].level, null);
  assert.throws(() => startSagardFight({level: 3, hp: 20}, {...spec, unknownOpponentLevel: false}, rules));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardEncounter, resolveSagardEncounter, sagardEncounterTurn, validateSagardEncounterFight} from '../../../public/js/battlesim/engines/sagard/encounter.js';
import {switchSagardStrategy} from '../../../public/js/battlesim/engines/sagard/strategy.js';
import {canUseSagardDagger, resolveSagardTurn} from '../../../public/js/battlesim/engines/sagard/core.js';
const rules = {maxHeroHp: 30, damageByLevel: Object.fromEntries(Array.from({length: 7}, (_, n) => [n, [1, 2, 3, 4]]))};
const start = (initialMode = 'normal') => startSagardEncounter({level: 3, hp: 30}, {
  opponents: [{name: 'Synthetic demon', level: null, hp: initialMode === 'normal' ? 40 : null, chart: [2, 3, 4, 5]}],
  allies: [{name: 'Synthetic companion', hp: 18, level: initialMode === 'normal' ? 3 : null, chart: null}],
  unknownOpponentLevel: true, escape: 'none', winTarget: 'ending', attackTargetOrder: ['ally0', 'hero'],
  strategy: {initialMode, normalMaxHp: 40, normalAlly: {name: 'Synthetic companion', level: 3, hp: 18, chart: [1, 2, 3, 4]},
    attempts: [{actor: 'hero', faces: [4], confirmFaces: [3, 4]}, {actor: 'ally0', faces: [4], confirmFaces: [4]}]}
}, rules);
const step = (fight, die) => resolveSagardEncounter(JSON.parse(JSON.stringify(fight)), die);

test('normal combat alternates enemy targets by round and falls back to the hero after companion death', () => {
  let fight = start();
  fight = step(fight, 1); fight = step(fight, 1);
  assert.deepEqual(sagardEncounterTurn(fight).targets, ['ally0']);
  fight = step(fight, 1); assert.equal(fight.allies[0].hp, 16);
  fight = step(fight, 1); fight = step(fight, 1);
  assert.deepEqual(sagardEncounterTurn(fight).targets, ['hero']);
  fight = step(fight, 1); fight.allies[0].hp = 0;
  fight = step(fight, 1);
  assert.deepEqual(sagardEncounterTurn(fight).targets, ['hero']);
});

test('switching strategies preserves damaged HP, rounds and the current action queue', () => {
  let fight = step(start(), 4), hp = fight.opponents[0].hp;
  const cursor = fight.cursor, queue = [...fight.queue];
  fight = switchSagardStrategy(fight, 'pendant');
  assert.equal(fight.opponents[0].hp, hp); assert.equal(fight.cursor, cursor); assert.deepEqual(fight.queue, queue);
  assert.equal(sagardEncounterTurn(fight).kind, 'pendant');
  fight = switchSagardStrategy(fight, 'normal');
  assert.equal(fight.opponents[0].hp, hp); assert.equal(sagardEncounterTurn(fight).attackerId, 'ally0');
});

test('pendant starts without invented HP and activates the paired normal HP only when switching', () => {
  let fight = start('pendant');
  assert.equal(fight.opponents[0].hp, null); assert.equal(fight.opponents[0].level, null);
  assert.equal(sagardEncounterTurn(fight).attackerId, 'enemy0');
  fight = step(fight, 1); fight = switchSagardStrategy(fight, 'normal');
  assert.equal(fight.opponents[0].hp, 40); assert.equal(fight.allies[0].hp, 16);
  assert.equal(sagardEncounterTurn(fight).attackerId, 'hero');
});

test('hero and companion use separate confirmation rolls and successes do not fabricate defeated HP', () => {
  for (const actor of ['hero', 'ally0']) {
    let fight = step(start('pendant'), 1);
    if (actor === 'ally0') fight = step(fight, 1);
    fight = step(fight, 4); assert.equal(sagardEncounterTurn(fight).kind, 'pendantConfirm');
    validateSagardEncounterFight(JSON.parse(JSON.stringify(fight)));
    fight = step(fight, actor === 'hero' ? 3 : 4);
    assert.equal(fight.status, 'win'); assert.equal(fight.destination, 'ending'); assert.equal(fight.opponents[0].hp, null);
  }
});

test('failed confirmations and abandoned attempts consume one action without granting a replacement', () => {
  let fight = step(step(start('pendant'), 1), 4);
  assert.equal(canUseSagardDagger(fight), false);
  assert.throws(() => resolveSagardTurn(fight, 1));
  const pending = JSON.stringify(fight);
  assert.throws(() => step(fight, 5)); assert.equal(JSON.stringify(fight), pending);
  let failed = step(fight, 2);
  assert.equal(sagardEncounterTurn(failed).attackerId, 'ally0'); assert.equal(failed.heroAttacksThisRound, 1);
  fight = switchSagardStrategy(fight, 'normal');
  assert.equal(sagardEncounterTurn(fight).attackerId, 'ally0'); assert.equal(fight.heroAttacksThisRound, 1);
});

test('pendant ally confirmation requires its own printed face and preserves the demon wound on failure', () => {
  let fight = switchSagardStrategy(step(start(), 4), 'pendant');
  const hp = fight.opponents[0].hp;
  fight = step(fight, 4); fight = step(fight, 3);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.opponents[0].hp, hp);
  assert.equal(sagardEncounterTurn(fight).attackerId, 'enemy0');
});

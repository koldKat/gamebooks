import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, resolveSagardTurn, useSagardDagger, canUseSagardDagger,
  useSagardStunStone, canThrowSagardProjectile, sagardTurn, validateSagardRules} from '../../../public/js/battlesim/engines/sagard/core.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';
import {startSagardForces, resolveSagardForces} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {useSagardEncounterDagger} from '../../../public/js/battlesim/engines/sagard/actions.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]])),
  magicDagger: {maximumPower: 7, defeatsLevelAtMost: 2}};
const foe = extra => ({name: 'Synthetic foe', level: 2, hp: 18, ...extra});
const reload = fight => JSON.parse(JSON.stringify(fight));
const start = (options = {}, spec = {}, hero = {}) => startSagardFight({level: 2, hp: 20, ...hero},
  {name: 'Synthetic', opponents: [foe()], ...spec}, rules, options);

test('dagger power defaults to zero and declines across fights without being replenished', () => {
  assert.equal(canUseSagardDagger(start()), false);
  let power = 3;
  for (const expected of [3, 2, 1]) {
    const original = start({magicDaggerPower: power});
    const fight = useSagardDagger(reload(original));
    assert.equal(fight.opponents[0].hp, 18 - expected);
    assert.equal(sagardTurn(fight).attackerId, 'enemy0');
    assert.equal(original.magicDaggerPower, power);
    const state = emptySagardState(); state.fight = reload(fight); rememberSagardFight(state);
    power = state.setup.magicDaggerPower;
    assert.equal(power, expected - 1);
  }
  assert.equal(canUseSagardDagger(start({magicDaggerPower: power})), false);
});

test('destroying an eligible opponent spends all remaining power and awards one result', () => {
  const original = start({magicDaggerPower: 7});
  const fight = useSagardDagger(reload(original), {mode: 'destroy'});
  assert.equal(fight.opponents[0].hp, 0);
  assert.equal(fight.magicDaggerPower, 0);
  assert.equal(fight.status, 'win');
  const state = emptySagardState(); state.fight = reload(fight);
  rememberSagardFight(state, 100); rememberSagardFight(state, 101);
  assert.equal(state.setup.magicDaggerPower, 0);
  assert.equal(state.history.length, 1);
  assert.throws(() => useSagardDagger(fight));
});

test('illegal targets and turns preserve both dagger power and all combatants', () => {
  const fight = start({magicDaggerPower: 4}, {opponents: [foe({level: 3})]});
  const snapshot = JSON.stringify(fight);
  assert.throws(() => useSagardDagger(fight, {mode: 'destroy'}));
  assert.throws(() => useSagardDagger(fight, {target: 'hero'}));
  assert.throws(() => useSagardDagger(fight, {mode: 'unknown'}));
  assert.equal(JSON.stringify(fight), snapshot);
  assert.throws(() => useSagardDagger(start({magicDaggerPower: 4}, {initiative: 'enemy'})));
  for (const value of [-1, 8]) assert.throws(() => start({magicDaggerPower: value}));
  assert.throws(() => validateSagardRules({...rules, magicDagger: {maximumPower: 0, defeatsLevelAtMost: 2}}));
});

test('an explicitly unarmed encounter disables weapon bonuses, missiles and dagger use', () => {
  const projectileRules = {...rules, projectiles: [{id: 'disc', label: 'Synthetic disc', kind: 'fixed',
    maxHeld: 1, shotsPerRound: 1, damage: 2, phases: ['round']}]};
  let fight = startSagardFight({level: 2, hp: 20, damageBonus: 9, damageOverrides: {4: 10}},
    {name: 'Unarmed synthetic', heroWeaponDisabled: true, opponents: [foe()]}, projectileRules,
    {magicDaggerPower: 7, ammo: {disc: 1}});
  assert.equal(fight.hero.damageBonus, 0);
  assert.equal(fight.hero.damageOverrides, undefined);
  assert.equal(canUseSagardDagger(fight), false);
  assert.equal(canThrowSagardProjectile(fight, 'disc'), false);
  assert.equal(fight.magicDaggerPower, 7);
  fight = resolveSagardTurn(reload(fight), 4);
  assert.equal(fight.opponents[0].hp, 15);
});

test('a dagger action consumes one free stun attack without also consuming the normal hero action', () => {
  const stunRules = {...rules, stunStoneEnabled: true};
  let fight = startSagardFight({level: 2, hp: 20}, {name: 'Synthetic', opponents: [foe()]}, stunRules,
    {magicDaggerPower: 3, stunStone: true});
  fight = useSagardStunStone(fight, 1);
  fight = useSagardDagger(reload(fight));
  assert.equal(fight.stoneAttacksRemaining, 1);
  assert.equal(fight.cursor, 0);
  fight = useSagardDagger(reload(fight));
  assert.equal(fight.phase, 'round');
  assert.equal(sagardTurn(fight).attackerId, 'hero');
  assert.equal(fight.magicDaggerPower, 1);
  assert.equal(fight.heroAttacksThisRound, 0);
});

test('a dagger victory in a force duel updates the parent holding and settles the battle', () => {
  const spec = {name: 'Synthetic force', opponents: [foe()],
    forces: {allies: 2, enemies: 1, allyKillFaces: [4], enemyKillFaces: [4], duelEncounter: {opponents: [foe()]}}};
  let fight = startSagardForces({level: 2, hp: 20}, spec, rules, {magicDaggerPower: 5});
  fight = resolveSagardForces(reload(fight), null, {decision: 'duel'});
  assert.equal(fight.duel.magicDaggerPower, 5);
  fight = useSagardEncounterDagger(reload(fight), {mode: 'destroy'});
  assert.equal(fight.status, 'win');
  assert.equal(fight.magicDaggerPower, 0);
  assert.equal(fight.enemiesRemaining, 0);
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state, 100);
  assert.equal(state.setup.magicDaggerPower, 0);
});

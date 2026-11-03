import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, resolveSagardTurn, throwSagardProjectile, canThrowSagardProjectile,
  healSagardFight, sagardTurn, validateSagardRules} from '../../../public/js/battlesim/engines/sagard/core.js';
import {validateSagardProjectiles, sagardProjectileEffect} from '../../../public/js/battlesim/engines/sagard/effects.js';
import {startSagardForces, resolveSagardForces} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {healSagardEncounter, throwSagardEncounterProjectile} from '../../../public/js/battlesim/engines/sagard/actions.js';
import {startSagardBeast} from '../../../public/js/battlesim/engines/sagard/beast.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

// Synthetic item values test mechanics; book values are loaded from the database catalog.
const base = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const missile = {id: 'disc', label: 'Synthetic disc', kind: 'fixed', maxHeld: 8,
  shotsPerRound: 2, damage: 3, hitDice: [2, 3, 4], phases: ['round']};
const dart = {id: 'dart', label: 'Synthetic dart', kind: 'poison', maxHeld: 4,
  shotsPerRound: 1, damage: 4, defeatsLevelAtMost: 1, firstRoundOnly: true, phases: ['round']};
const foe = (name = 'Synthetic foe', level = 2) => ({name, level, hp: 12});
const reload = value => JSON.parse(JSON.stringify(value));
const start = (options = {}, spec = {}, rules = {}) => startSagardFight({level: 2, hp: 20},
  {name: 'Synthetic', opponents: [foe()], ...spec}, {...base, projectiles: [missile, dart], ...rules}, options);

test('fixed missiles damage low-level targets without becoming poison or gaining weapon damage', () => {
  let fight = start({ammo: {disc: 2}}, {opponents: [foe('A', 0), foe('B', 0)]});
  fight.hero.damageBonus = 9;
  fight = throwSagardProjectile(reload(fight), 'disc', 2, {target: 'enemy0'});
  assert.equal(fight.opponents[0].hp, 9);
  assert.equal(sagardTurn(fight).kind, 'projectile');
  fight = throwSagardProjectile(reload(fight), 'disc', 4, {target: 'enemy1'});
  assert.equal(fight.opponents[1].hp, 9);
  assert.equal(fight.ammo.disc, 0);
  assert.equal(sagardTurn(fight).attackerId, 'enemy0');
});

test('a missed missile consumes one holding and one shot, including after reload', () => {
  const original = start({ammo: {disc: 3}});
  let fight = throwSagardProjectile(reload(original), 'disc', 1);
  assert.equal(fight.opponents[0].hp, 12);
  assert.equal(fight.ammo.disc, 2);
  assert.equal(original.ammo.disc, 3);
  fight = throwSagardProjectile(reload(fight), 'disc', 1);
  assert.equal(fight.missilesThisRound.disc, 2);
  assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  const state = emptySagardState(); state.fight = reload(fight);
  rememberSagardFight(state);
  assert.equal(state.setup.ammo.disc, 1);
  assert.equal(state.history.length, 0);
});

test('first-round darts stop being available in later rounds even when ammunition remains', () => {
  let fight = start({ammo: {dart: 3}});
  assert.equal(canThrowSagardProjectile(fight, 'dart'), true);
  fight = throwSagardProjectile(reload(fight), 'dart', null);
  assert.equal(fight.opponents[0].hp, 8);
  fight = resolveSagardTurn(reload(fight), 1);
  assert.equal(fight.round, 2);
  assert.equal(fight.ammo.dart, 2);
  assert.equal(canThrowSagardProjectile(reload(fight), 'dart'), false);
  assert.throws(() => throwSagardProjectile(reload(fight), 'dart', null));
});

test('a first-round dart can follow enemy initiative and low-level poison defeat is explicit', () => {
  let fight = start({ammo: {dart: 1}}, {initiative: 'enemy', opponents: [foe('Low-level foe', 1)]});
  assert.equal(canThrowSagardProjectile(fight, 'dart'), false);
  fight = resolveSagardTurn(reload(fight), 1);
  fight = throwSagardProjectile(reload(fight), 'dart', null);
  assert.equal(fight.status, 'win');
  assert.equal(fight.opponents[0].hp, 0);
  const unknown = sagardProjectileEffect(dart, {hp: 12, level: null}, null);
  assert.equal(unknown.knockout, false);
  assert.equal(unknown.damage, 4);
});

test('malformed new missile and recovery options are rejected', () => {
  for (const rule of [{...missile, damage: null}, {...dart, firstRoundOnly: 'yes'}, {...missile, kind: 'unknown'}]) {
    assert.throws(() => validateSagardProjectiles([rule]));
  }
  for (const amounts of [{fang: 0}, {fang: '5'}, {fang: -1}, {unknown: 5}, [], 'full']) {
    assert.throws(() => validateSagardRules({...base, healingAmounts: amounts}));
  }
});

test('fixed recovery consumes its item, clamps at maximum HP and leaves the combat turn unchanged', () => {
  for (const hp of [7, 19]) {
    let fight = startSagardFight({level: 2, hp}, {name: 'Synthetic', opponents: [foe()], initiative: 'enemy'},
      {...base, healingAmounts: {fang: 4, moss: 'full'}}, {fang: true, moss: true});
    const original = reload(fight), turn = sagardTurn(fight);
    fight = healSagardFight(reload(fight), 'fang');
    assert.equal(fight.hero.hp, Math.min(20, hp + 4));
    assert.equal(fight.healing.fang, false);
    assert.deepEqual(sagardTurn(fight), turn);
    assert.equal(original.hero.hp, hp);
    assert.throws(() => healSagardFight(reload(fight), 'fang'));
    const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
    assert.equal(state.setup.fang, false);
    if (fight.hero.hp < 20) {
      fight = healSagardFight(reload(fight), 'moss');
      assert.equal(fight.hero.hp, 20);
    }
  }
});

test('group recovery uses the same amount both outside and inside an optional duel', () => {
  const spec = {name: 'Synthetic force', forces: {allies: 2, enemies: 2, allyKillFaces: [4], enemyKillFaces: [4],
    duelEncounter: {opponents: [foe()]}}, opponents: [foe()]};
  for (const inDuel of [false, true]) {
    let fight = startSagardForces({level: 2, hp: 7}, spec, {...base, healingAmounts: {fang: 4}}, {fang: true});
    if (inDuel) fight = resolveSagardForces(fight, null, {decision: 'duel'});
    const phase = fight.phase;
    fight = healSagardEncounter(reload(fight), 'fang');
    assert.equal(fight.hero.hp, 11);
    assert.equal(fight.healing.fang, false);
    assert.equal(fight.phase, phase);
    assert.equal(fight.alliesRemaining, 2);
    if (inDuel) assert.equal(fight.duel.hero.hp, 11);
  }
});

test('monster recovery changes character HP without changing crew or monster strength', () => {
  let fight = startSagardBeast({level: 2, hp: 7}, {name: 'Synthetic monster', opponents: [foe()],
    beast: {crew: 2, swallowedDamage: 2, swallowFaces: [4], swallowConfirmFaces: [4],
      crewChart: [0, 0, 1, 1], crewCasualties: [0, 0, 0, 1]}}, {...base, healingAmounts: {fang: 4}}, {fang: true});
  const monsterHp = fight.monster.hp;
  fight = healSagardEncounter(reload(fight), 'fang');
  assert.equal(fight.hero.hp, 11);
  assert.equal(fight.monster.hp, monsterHp);
  assert.equal(fight.crewRemaining, 2);
});

test('missile victories settle group duels once and remaining ammunition carries into the next duel', () => {
  const spec = {name: 'Synthetic force', winTarget: 'won', opponents: [{...foe(), hp: 2}],
    forces: {allies: 2, enemies: 2, allyKillFaces: [4], enemyKillFaces: [4],
      duelEncounter: {opponents: [{...foe(), hp: 2}]}}};
  let fight = startSagardForces({level: 2, hp: 20}, spec, {...base, projectiles: [missile]}, {ammo: {disc: 2}});
  assert.throws(() => throwSagardEncounterProjectile(fight, 'disc', 2));
  fight = resolveSagardForces(reload(fight), null, {decision: 'duel'});
  fight = throwSagardEncounterProjectile(reload(fight), 'disc', 2);
  assert.equal(fight.enemiesRemaining, 1);
  assert.equal(fight.ammo.disc, 1);
  assert.equal(fight.phase, 'enemyVolley');
  for (let n = 0; n < 3; n++) fight = resolveSagardForces(reload(fight), 1);
  fight = resolveSagardForces(reload(fight), null, {decision: 'duel'});
  assert.equal(fight.duel.ammo.disc, 1);
  fight = throwSagardEncounterProjectile(reload(fight), 'disc', 2);
  assert.equal(fight.status, 'win');
  assert.equal(fight.enemiesRemaining, 0);
  assert.equal(fight.ammo.disc, 0);
  const state = emptySagardState(); state.fight = reload(fight);
  rememberSagardFight(state, 100); rememberSagardFight(state, 101);
  assert.equal(state.setup.ammo.disc, 0);
  assert.equal(state.history.length, 1);
  assert.throws(() => throwSagardEncounterProjectile(fight, 'disc', 2));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startRealLifeFight, realLifeStep, realLifeTurn, skipRealLifeOpening, validateRealLifeFight}
  from '../../../public/js/battlesim/engines/real-life/core.js';
import {validateRealLifeCatalog} from '../../../public/js/battlesim/engines/real-life/catalog.js';

const hero = {strength: 7, sword: 7, firearm: 7, agility: 7, horsemanship: 7, wounds: 5};
const foe = changes => ({name: 'Foe', skill: 7, wounds: 4, ...changes});
const start = (spec = {}, player = {}) => startRealLifeFight({...hero, ...player},
  {name: 'Synthetic encounter', section: '1', weapon: 'sword', opponents: [foe()], winTarget: '2', lossTarget: '3', ...spec});
const step = (fight, a = 3, b = 3, options = {}) => {
  const values = [a, b];
  return realLifeStep(JSON.parse(JSON.stringify(fight)), options, () => {assert.ok(values.length); return values.shift();});
};

test('conditional opening Agility grants a shot on equality and never deals damage itself', () => {
  const spec = {openingFirearm: true, openingAgilityTest: true};
  let f = start(spec);
  assert.equal(realLifeTurn(f).kind, 'opening-agility');
  assert.throws(() => skipRealLifeOpening(f));
  f = step(f, 3, 4); assert.equal(realLifeTurn(f).kind, 'opening'); assert.equal(f.opponents[0].wounds, 4);
  f = step(f); assert.equal(f.opponents[0].wounds, 2); assert.equal(realLifeTurn(f).kind, 'attack');
  assert.equal(f.heroAttacks, 0);
  const failed = step(start(spec), 4, 4);
  assert.equal(failed.opening, false); assert.equal(realLifeTurn(failed).kind, 'attack');
  assert.equal(failed.hero.wounds, 5); assert.equal(failed.opponents[0].wounds, 4);
});

test('two target-removing shots preserve printed Wounds, including a raw double one', () => {
  let f = start({openingFirearm: true, openingShots: 2, openingRemovesTarget: true,
    openingDistinctTargets: true, opponents: [foe(), foe(), foe()]});
  f = step(f, 1, 1, {target: 'enemy1'});
  assert.equal(f.opponents[1].wounds, 4); assert.equal(f.opponents[1].outOfFight, true);
  assert.equal(f.log.at(-1).critical, false); assert.equal(f.log.at(-1).lost, 0);
  assert.equal(f.openingShotsRemaining, 1); assert.deepEqual(realLifeTurn(f).targets, ['enemy0', 'enemy2']);
  f = step(f, 3, 3, {target: 'enemy2'});
  assert.equal(f.opening, false); assert.equal(f.heroAttacks, 0);
  assert.deepEqual(realLifeTurn(f).targets, ['enemy0']);
  assert.equal(f.hero.wounds, 5);
});

test('distinct opening targets cannot be retried after a miss; optional remainder can be skipped', () => {
  let f = start({openingFirearm: true, openingShots: 2, openingDistinctTargets: true, opponents: [foe(), foe()]});
  f = step(f, 6, 6, {target: 'enemy0'});
  assert.deepEqual(realLifeTurn(f).targets, ['enemy1']);
  assert.throws(() => step(f, 3, 3, {target: 'enemy0'}));
  f = skipRealLifeOpening(f); assert.equal(f.openingShotsRemaining, 0); assert.equal(realLifeTurn(f).attacker, 'hero');
});

test('modified opening shots precede compulsory enemy-shot Agility without changing melee skill', () => {
  let f = start({openingFirearm: true, openingShots: 2, openingSkillModifier: -2, enemyOpeningAgility: true,
    openingDistinctTargets: true, opponents: [foe(), foe()]});
  f = step(f, 3, 3, {target: 'enemy0'}); assert.equal(f.log.at(-1).skill, 5); assert.equal(f.log.at(-1).success, false);
  f = skipRealLifeOpening(f); assert.equal(realLifeTurn(f).kind, 'avoid-pistol');
  const failed = step(f, 4, 4); assert.equal(failed.status, 'loss'); assert.equal(failed.destination, '3');
  assert.equal(failed.hero.wounds, 5); assert.equal(failed.reason, 'pistol');
  f = step(f, 3, 4); assert.equal(realLifeTurn(f).kind, 'attack');
  f = step(f, 3, 4); assert.equal(f.log.at(-1).skill, 7); assert.equal(f.opponents[0].wounds, 3);
});

test('compulsory enemy-shot check is retained even after both opening targets are defeated', () => {
  let f = start({openingFirearm: true, openingShots: 2, enemyOpeningAgility: true, opponents: [foe(), foe()]});
  f = step(f, 1, 1, {target: 'enemy0'}); f = step(f, 1, 1, {target: 'enemy1'});
  assert.equal(f.status, 'fighting'); assert.equal(realLifeTurn(f).kind, 'avoid-pistol');
  assert.equal(step(f, 3, 4).status, 'win'); assert.equal(step(f, 6, 6).status, 'loss');
});

test('ordinary knockout and critical death have different printed destinations', () => {
  const spec = {nonlethalZero: true, criticalLossTarget: '274', opponentFirst: true};
  const unconscious = step(start(spec, {wounds: 1}));
  assert.equal(unconscious.status, 'loss'); assert.equal(unconscious.destination, '3');
  assert.equal(unconscious.reason, 'unconscious');
  const dead = step(start(spec), 1, 1);
  assert.equal(dead.destination, '274'); assert.equal(dead.reason, 'death');
  const victory = step(start({...spec, opponentFirst: false, opponents: [foe({wounds: 1})]}));
  assert.equal(victory.status, 'win'); assert.equal(victory.opponents[0].wounds, 0);
});

test('knife possession uses strict-under alternating Strength without wounds or critical kills', () => {
  const spec = {weapon: 'strength', knifePossession: true, cannotDefend: true,
    opponents: [foe({skill: 8, wounds: null, noWoundsPrinted: true})]};
  validateRealLifeCatalog([{...spec, section: '196', name: 'Dell'}]);
  let f = start(spec); assert.equal(realLifeTurn(f).kind, 'knife-possession');
  f = step(f, 3, 4); assert.equal(f.status, 'fighting'); assert.equal(realLifeTurn(f).attacker, 'enemy0');
  f = step(f, 4, 4); assert.equal(f.status, 'fighting'); assert.equal(realLifeTurn(f).attacker, 'hero');
  f = step(f); assert.equal(f.status, 'win'); assert.equal(f.reason, 'knife-possession');
  assert.equal(f.hero.wounds, 5); assert.equal(f.opponents[0].wounds, 1);
  const lost = step(step(start(spec), 6, 6), 3, 4); assert.equal(lost.status, 'loss');
  const noCritical = step(start(spec, {strength: 2}), 1, 1); assert.equal(noCritical.status, 'fighting');
  assert.throws(() => start({...spec, knifePossession: false}));
});

test('fleeing at one Wound preserves that Wound and skips the opponent reply', () => {
  let f = start({enemyFleeAtWounds: 1, opponents: [foe({wounds: 2}), foe()]});
  f = step(f); assert.equal(f.opponents[0].wounds, 1); assert.equal(f.opponents[0].exitReason, 'fled');
  assert.equal(realLifeTurn(f).attacker, 'enemy1'); assert.equal(f.hero.wounds, 5);
  const critical = step(start({enemyFleeAtWounds: 1}), 1, 1);
  assert.equal(critical.opponents[0].wounds, 0); assert.equal(critical.opponents[0].exitReason, undefined);
  const shot = step(start({enemyFleeAtWounds: 1, openingFirearm: true, opponents: [foe({wounds: 3})]}));
  assert.equal(shot.status, 'win'); assert.equal(shot.opponents[0].wounds, 1);
});

test('knife Swordsmanship penalty precedes defensive halving and affects only hero melee', () => {
  let f = start({playerSkillModifier: -1});
  f = step(f, 1, 3, {defensive: true}); assert.equal(f.log.at(-1).skill, 3);
  assert.equal(f.log.at(-1).success, false);
  f = step(f, 2, 2); assert.equal(f.log.at(-1).skill, 4);
});

test('new phases and remaining shots survive JSON saved-state reload', () => {
  let f = start({openingFirearm: true, openingShots: 2, openingAgilityTest: true, enemyOpeningAgility: true,
    opponents: [foe(), foe()]});
  for (const [a, b] of [[3, 3], [6, 6], [6, 6], [3, 3], [3, 3]]) {
    f = JSON.parse(JSON.stringify(f)); validateRealLifeFight(f); f = step(f, a, b);
  }
  assert.equal(f.opening, false); assert.equal(f.openingShotsRemaining, 0);
  assert.equal(f.enemyOpeningAgilityPending, false); assert.equal(f.openingAgilityPending, false);
});

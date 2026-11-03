import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startRealLifeFight, realLifeStep, realLifeTurn, canTestRealLifeLuck, testRealLifeLuck,
  endRealLifeFight, validateRealLifeFight} from '../../../public/js/battlesim/engines/real-life/core.js';
import {emptyRealLifeState, rememberRealLifeFight} from '../../../public/js/battlesim/engines/real-life/state.js';
import {validateRealLifeCatalog, realLifeEditorRows} from '../../../public/js/battlesim/engines/real-life/catalog.js';

const hero = changes => ({strength: 7, sword: 7, javelin: 7, agility: 7, luck: 7, horsemanship: 7, wounds: 10, ...changes});
const foe = changes => ({name: 'Test foe', skill: 7, wounds: 10, ...changes});
const start = (spec = {}, player = {}, options = {}) => startRealLifeFight(hero(player),
  {section: '1', name: 'Synthetic encounter', weapon: 'sword', opponents: [foe()], ...spec}, options);
const roll = (a, b) => {const dice = [a, b]; return () => {assert.ok(dice.length); return dice.shift();};};
const step = (fight, a = 6, b = 6, options = {}) => realLifeStep(JSON.parse(JSON.stringify(fight)), options, roll(a, b));

test('round horse checks run once before every combatant, and failure skips only the hero attack', () => {
  let f = start({horseRule: 'hero-before-round-fall', mountedStart: true, mountedCombat: true,
    opponents: [foe({mounted: true}), foe({mounted: true})]});
  assert.equal(realLifeTurn(f).kind, 'round-horsemanship');
  f = step(f, 3, 3); assert.equal(realLifeTurn(f).kind, 'attack');
  f = step(f); f = step(f); f = step(f);
  assert.equal(f.round, 1); assert.equal(realLifeTurn(f).kind, 'round-horsemanship');
  f = step(f); assert.equal(f.hero.mounted, false); assert.equal(realLifeTurn(f).attacker, 'enemy0');
  f = step(f, 4, 4); assert.equal(f.log.at(-1).skill, 8); assert.equal(f.hero.wounds, 9);
  f = step(f); assert.equal(f.round, 2); assert.equal(realLifeTurn(f).kind, 'attack');
  f = step(f, 3, 4); assert.equal(f.log.at(-1).skill, 7);
});

test('dead last opponents do not postpone a new round horse check', () => {
  let f = start({horseRule: 'hero-before-round-fall', mountedStart: true,
    opponents: [foe(), foe({wounds: 1})]});
  f = step(f, 3, 3); f = step(f, 3, 3, {target: 'enemy1'}); f = step(f);
  assert.equal(f.round, 1); assert.equal(realLifeTurn(f).kind, 'round-horsemanship');
});

test('post-round horse checks change the bonus without a fall or skipped attack', () => {
  let f = start({horseRule: 'hero-after-round-bonus', mountedStart: true, playerSkillBonus: 1});
  assert.equal(realLifeTurn(f).kind, 'attack');
  f = step(f, 4, 4); assert.equal(f.log.at(-1).skill, 8); assert.equal(f.opponents[0].wounds, 9);
  f = step(f); assert.equal(realLifeTurn(f).kind, 'round-horsemanship');
  f = step(f); assert.equal(f.hero.mounted, true); assert.equal(f.cursor, 0);
  f = step(f, 4, 4); assert.equal(f.log.at(-1).skill, 7); assert.equal(f.opponents[0].wounds, 9);
  f = step(f); f = step(f, 3, 3); f = step(f, 4, 4);
  assert.equal(f.log.at(-1).skill, 8); assert.equal(f.hero.mounted, true);
});

test('mounted charge removes only the selected foe without inventing wounds or a death', () => {
  const spec = {optionalCharge: true, mountedStart: true, playerSkillBonus: 1, opponents: [foe(), foe()]};
  let f = start(spec, {}, {charge: true}); assert.equal(realLifeTurn(f).kind, 'charge');
  f = step(f, 3, 3, {target: 'enemy1'});
  assert.equal(f.opponents[1].outOfFight, true); assert.equal(f.opponents[1].wounds, 10);
  assert.deepEqual(realLifeTurn(f).targets, ['enemy0']);
  f = step(f, 4, 4); assert.equal(f.log.at(-1).skill, 8);
  f = step(f); assert.equal(f.round, 1);
  assert.equal(start(spec).chargePending, undefined);
  const failed = step(start(spec, {}, {charge: true})); assert.equal(realLifeTurn(failed).targets.length, 2);
});

test('initiative Agility survives reload and changes the queue without an attack or injury', () => {
  for (const [a, b, first] of [[3, 3, 'hero'], [6, 6, 'enemy0']]) {
    const f = step(start({initiativeTest: 'agility'}), a, b);
    assert.equal(realLifeTurn(f).attacker, first); assert.equal(f.hero.wounds, 10);
    assert.equal(f.opponents[0].wounds, 10); assert.equal(f.heroAttacks, 0);
    assert.equal(realLifeTurn(JSON.parse(JSON.stringify(f))).kind, 'attack');
  }
});

test('optional Luck is unavailable until a full round and cannot be retried in the same round', () => {
  let f = start({optionalRoundLuckTarget: '9', opponents: [foe(), foe()]});
  assert.equal(canTestRealLifeLuck(f), false); assert.throws(() => testRealLifeLuck(f, roll(1, 1)));
  f = step(f); f = step(f); assert.equal(canTestRealLifeLuck(f), false); f = step(f);
  assert.equal(canTestRealLifeLuck(f), true);
  f = testRealLifeLuck(f, roll(6, 6)); assert.equal(canTestRealLifeLuck(f), false);
  assert.throws(() => testRealLifeLuck(JSON.parse(JSON.stringify(f)), roll(1, 1)));
  f = step(f); f = step(f); f = step(f); f = testRealLifeLuck(f, roll(3, 3));
  assert.equal(f.status, 'interrupted'); assert.equal(f.destination, '9');
  const state = emptyRealLifeState(); state.fight = f; rememberRealLifeFight(state);
  assert.equal(state.history.length, 0); assert.equal(state.player.luck, 7);
});

test('Luck opportunity closes when the next attack starts and never follows a fatal result', () => {
  let f = step(step(start({optionalRoundLuckTarget: '9'})));
  assert.equal(canTestRealLifeLuck(f), true); f = step(f); assert.equal(canTestRealLifeLuck(f), false);
  const win = step(start({optionalRoundLuckTarget: '9'}), 1, 1);
  assert.equal(canTestRealLifeLuck(win), false);
  const loss = step(step(start({optionalRoundLuckTarget: '9'}, {wounds: 1})), 1, 1);
  assert.equal(loss.status, 'loss'); assert.equal(canTestRealLifeLuck(loss), false);
});

test('a simultaneous hit wounds both foes at half skill and prevents their replies that round', () => {
  let f = start({simultaneousAttack: true, opponents: [foe(), foe()]});
  f = step(f, 2, 2, {attackBoth: true});
  assert.equal(f.log[0].skill, 4); assert.deepEqual(f.opponents.map(e => e.wounds), [9, 9]);
  assert.equal(f.hero.wounds, 10); assert.equal(f.round, 1); assert.equal(realLifeTurn(f).attacker, 'hero');
  assert.throws(() => step(f, 2, 2, {attackBoth: true, defensive: true}));
  f = step(f, 3, 3, {attackBoth: true}); assert.equal(realLifeTurn(f).attacker, 'enemy0');
  f = step(f, 3, 3); f = step(f, 3, 3); assert.equal(f.hero.wounds, 8); assert.equal(f.round, 2);
});

test('a simultaneous double one kills both targets immediately with no retaliation', () => {
  const f = step(start({simultaneousAttack: true, opponents: [foe(), foe()]}), 1, 1, {attackBoth: true});
  assert.equal(f.status, 'win'); assert.deepEqual(f.opponents.map(e => e.wounds), [0, 0]);
  assert.equal(f.hero.wounds, 10); assert.equal(f.log.filter(e => e.type === 'attack').length, 1);
});

test('the deliberately skill-less boar uses Agility avoidance and has no fatal double-one attack', () => {
  const spec = {enemyAttackMode: 'agility-avoidance', cannotDefend: true,
    opponents: [foe({skill: null, noSkillPrinted: true, damage: 2})]};
  validateRealLifeCatalog([{section: '1', name: 'Synthetic boar', ...spec}]);
  assert.equal(realLifeEditorRows(spec.opponents)[0].skill, '');
  let f = step(start(spec)); assert.equal(realLifeTurn(f).kind, 'agility');
  f = step(f, 1, 1); assert.equal(f.hero.wounds, 10); assert.equal(f.status, 'fighting');
  f = step(f); f = step(f); assert.equal(f.hero.wounds, 8);
  assert.equal(f.opponents[0].skill, null); validateRealLifeFight(JSON.parse(JSON.stringify(f)));
  assert.throws(() => step(start(spec), 3, 3, {defensive: true}));
  const fatal = step(step(start(spec, {wounds: 1}))); assert.equal(fatal.hero.wounds, 0); assert.equal(fatal.status, 'loss');
  assert.throws(() => start({opponents: spec.opponents}));
});

test('normal defensive attacks halve exactly one enemy, with all other replies unchanged', () => {
  let f = start({opponents: [foe(), foe(), foe()]});
  f = step(f, 2, 2, {target: 'enemy1', defensive: true});
  f = step(f, 2, 3); assert.equal(f.log.at(-1).skill, 7);
  f = step(f, 2, 3); assert.equal(f.log.at(-1).skill, 4);
  f = step(f, 2, 3); assert.equal(f.log.at(-1).skill, 7); assert.equal(f.hero.wounds, 8);
});

test('unharmed survival checks this encounter alone and uses the separate wounded destination', () => {
  const spec = {requireUnharmed: true, winTarget: '8', lossTarget: '9'};
  let f = step(start(spec, {wounds: 4}), 1, 1); assert.equal(f.status, 'win'); assert.equal(f.destination, '8');
  f = step(start(spec)); f = step(f, 3, 3); f = step(f, 1, 1);
  assert.equal(f.hero.wounds, 9); assert.equal(f.status, 'loss'); assert.equal(f.destination, '9');
});

test('custom javelins use their own skill and two Wounds without a Firearm field', () => {
  const f = step(start({weapon: 'javelin'}, {javelin: 6, sword: 0}), 3, 3);
  assert.equal(f.opponents[0].wounds, 8); assert.equal(f.log[0].skill, 6);
  assert.throws(() => step(start({weapon: 'javelin'}), 3, 3, {defensive: true}));
  const state = emptyRealLifeState(); state.fight = endRealLifeFight(f); rememberRealLifeFight(state);
  assert.equal(state.player.javelin, 6); assert.equal(state.player.agility, 7); assert.equal(state.history.length, 0);
});

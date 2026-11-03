import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startRealLifeFight, realLifeStep, realLifeTurn, skipRealLifeOpening, endRealLifeFight,
  validateRealLifeFight, realLifeInteger} from '../../../public/js/battlesim/engines/real-life/core.js';
import {emptyRealLifeState, rememberRealLifeFight, createRealLifeState} from '../../../public/js/battlesim/engines/real-life/state.js';
import {validateRealLifeCatalog, realLifeEditorRows} from '../../../public/js/battlesim/engines/real-life/catalog.js';

const player = changes => ({strength: 7, sword: 7, firearm: 7, horsemanship: 7, wounds: 5, ...changes});
const enemy = changes => ({name: 'Opponent', skill: 7, wounds: 4, ...changes});
const encounter = changes => ({name: 'Test encounter', section: '1', weapon: 'sword', opponents: [enemy()], ...changes});
const fight = (spec = {}, hero = {}, options = {}) => startRealLifeFight(player(hero), encounter(spec), options);
const roll = (...values) => () => {assert.ok(values.length, 'Unexpected extra die'); return values.shift();};
const step = (f, a = 3, b = 3, options = {}) => realLifeStep(f, options, roll(a, b));
const reload = value => JSON.parse(JSON.stringify(value));

test('ordinary combat uses the current weapon skill and immediate one-Wound hits', () => {
  const original = fight(); const next = step(original, 3, 4);
  assert.equal(next.opponents[0].wounds, 3); assert.equal(original.opponents[0].wounds, 4);
  assert.equal(realLifeTurn(next).attacker, 'enemy0');
  const missed = step(next, 4, 4); assert.equal(missed.hero.wounds, 5); assert.equal(missed.round, 1);
});

test('pistols cause two Wounds and use Firearm, while fixed encounters reject other weapons', () => {
  assert.throws(() => fight({}, {}, {weapon: 'firearm'}));
  const f = fight({weapon: 'firearm'}, {firearm: 6, sword: 0});
  assert.equal(step(f).opponents[0].wounds, 2);
  assert.equal(step(step(f)).hero.wounds, 3);
});

test('double one kills immediately even with a low skill and does not permit retaliation', () => {
  const next = step(fight({opponents: [enemy({wounds: 50})]}, {sword: 0}), 1, 1);
  assert.equal(next.status, 'win'); assert.equal(next.hero.wounds, 5);
  assert.throws(() => step(next));
  const lost = step(fight({opponentFirst: true}), 1, 1); assert.equal(lost.status, 'loss');
});

test('a zero-Wound protagonist dies before an ally or later opponent can act', () => {
  const next = step(fight({opponentFirst: true}, {wounds: 1}));
  assert.equal(next.status, 'loss'); assert.equal(next.log.filter(e => e.type === 'attack').length, 1);
});

test('defensive attacks halve the current skill rounded up and the targeted next attack only', () => {
  let next = step(fight(), 2, 3, {defensive: true});
  assert.equal(next.log[0].skill, 4); assert.equal(next.opponents[0].wounds, 4);
  next = step(next, 2, 3); assert.equal(next.log.at(-1).skill, 4); assert.equal(next.hero.wounds, 5);
  next = step(step(next, 6, 6), 2, 3); assert.equal(next.log.at(-1).skill, 7); assert.equal(next.hero.wounds, 4);
  assert.throws(() => step(fight({weapon: 'firearm'}), 3, 3, {defensive: true}));
});

test('two player attacks precede each heavy opponent attack without double halving', () => {
  let f = fight({playerAttacks: 2, opponents: [enemy({damage: 2})]});
  f = step(f, 2, 2, {defensive: true}); assert.equal(realLifeTurn(f).attacker, 'hero');
  f = step(f, 2, 2, {defensive: true}); assert.equal(realLifeTurn(f).attacker, 'enemy0');
  f = step(f, 2, 2); assert.equal(f.hero.wounds, 3); assert.equal(f.log.at(-1).skill, 4); assert.equal(f.round, 1);
});

test('an attack limit interrupts immediately after the last unsuccessful player attack', () => {
  let f = fight({attackLimit: 2, interruptionTarget: '9'});
  f = step(step(step(f, 6, 6), 6, 6), 6, 6);
  assert.equal(f.status, 'interrupted'); assert.equal(f.destination, '9'); assert.equal(f.hero.wounds, 5);
  let win = fight({attackLimit: 2, opponents: [enemy({wounds: 2})]});
  win = step(step(step(win), 6, 6)); assert.equal(win.status, 'win');
});

test('first blood ends the duel and critical deaths use their separate printed destination', () => {
  const spec = {firstBlood: true, firstBloodTarget: '2', opponentDeathTarget: '3', heroDeathTarget: '4'};
  assert.equal(step(fight(spec)).destination, '2');
  assert.equal(step(fight(spec), 1, 1).destination, '3');
  assert.equal(step(fight({...spec, opponentFirst: true}), 1, 1).destination, '4');
  const loss = step(fight({...spec, opponentFirst: true})); assert.equal(loss.status, 'loss'); assert.equal(loss.hero.wounds, 4);
});

test('round limits count complete combat rounds and preserve victory on the final attack', () => {
  let f = fight({roundLimit: 2, interruptionTarget: '9'});
  for (let i = 0; i < 4; i++) f = step(f, 6, 6);
  assert.equal(f.round, 2); assert.equal(f.status, 'interrupted'); assert.equal(f.destination, '9');
  f = fight({roundLimit: 1, opponents: [enemy({wounds: 1})]}); assert.equal(step(f).status, 'win');
});

test('multiple foes attack once per round and the player can choose each target', () => {
  let f = fight({opponents: [enemy({name: 'A'}), enemy({name: 'B'})]});
  f = step(f, 3, 3, {target: 'enemy1'}); assert.equal(f.opponents[1].wounds, 3);
  f = step(step(f)); assert.equal(f.round, 1); assert.equal(f.hero.wounds, 3);
  assert.throws(() => step(f, 3, 3, {target: 'ally0'}));
});

test('allies fight assigned opponents and their survivors redirect after an ally dies', () => {
  let f = fight({opponents: [enemy({skill: 0}), enemy({target: 'ally0'})], allies: [enemy({name: 'Companion', skill: 0, wounds: 1})]});
  f = step(step(step(step(f, 6, 6), 6, 6), 6, 6));
  assert.equal(f.allies[0].wounds, 0); assert.equal(f.hero.wounds, 5); assert.equal(f.round, 1);
  f = step(step(step(f, 6, 6), 6, 6));
  assert.equal(f.hero.wounds, 4); assert.equal(f.log.at(-1).target, 'You');
});

test('survival requires full rounds, while eliminating every attacker also succeeds', () => {
  let f = fight({survivalRounds: 2, survivalTarget: '7'});
  for (let i = 0; i < 4; i++) f = step(f, 6, 6);
  assert.equal(f.status, 'win'); assert.equal(f.destination, '7');
  assert.equal(step(fight({survivalRounds: 4, survivalTarget: '7'}), 1, 1).destination, '7');
});

test('timed victories distinguish the final allowed round from a later kill without stopping combat', () => {
  const spec = {winWithinRounds: 2, winTarget: '39', lateWinTarget: '184', lossTarget: '212', opponents: [enemy({wounds: 2})]};
  let early = step(fight(spec));
  early = step(step(early, 6, 6));
  assert.equal(early.status, 'win'); assert.equal(early.destination, '39');
  let late = fight(spec);
  for (let i = 0; i < 4; i++) late = step(late, 6, 6);
  assert.equal(late.status, 'fighting');
  late = step(reload(late), 1, 1);
  assert.equal(late.status, 'win'); assert.equal(late.destination, '184');
  let loss = fight({...spec, opponentFirst: true});
  loss = step(loss, 1, 1);
  assert.equal(loss.status, 'loss'); assert.equal(loss.destination, '212');
  assert.throws(() => fight({...spec, lateWinTarget: null}));
  assert.throws(() => fight({...spec, winWithinRounds: 0}));
});

test('the optional opening firearm shot uses its chosen target and can be skipped', () => {
  const spec = {openingFirearm: true, opponents: [enemy(), enemy()]};
  let f = step(fight(spec), 3, 3, {target: 'enemy1'});
  assert.equal(f.opponents[1].wounds, 2); assert.equal(f.heroAttacks, 0); assert.equal(f.cursor, 0);
  assert.equal(skipRealLifeOpening(fight(spec)).opening, false);
  assert.throws(() => skipRealLifeOpening(f));
});

test('the mounted-opponent penalty changes the protagonist roll only', () => {
  let f = step(fight({playerRollPenalty: 1}), 3, 4);
  assert.equal(f.opponents[0].wounds, 4);
  f = step(f, 3, 4); assert.equal(f.hero.wounds, 4);
});

test('mounted attacks preserve the successful horse test across reload before weapon dice', () => {
  let f = step(fight({mountedCombat: true, opponents: [enemy({horsemanship: 8})]}), 3, 3, {defensive: true});
  assert.equal(f.pending.attacker, 'hero'); assert.equal(f.opponents[0].wounds, 4);
  f = step(reload(f), 2, 2, {target: 'invalid', defensive: false});
  assert.equal(f.log.at(-1).defensive, true); assert.equal(f.opponents[0].wounds, 3);
  assert.equal(realLifeTurn(f).kind, 'horsemanship');
});

test('failed Horsemanship dismounts without a weapon roll and foot versus mounted loses one skill', () => {
  let f = step(fight({mountedCombat: true, opponents: [enemy({horsemanship: 8})]}), 6, 6);
  assert.equal(f.hero.mounted, false); assert.equal(f.cursor, 1);
  f = step(step(f, 3, 3), 6, 6);
  assert.equal(realLifeTurn(f).kind, 'attack');
  f = step(f, 3, 4); assert.equal(f.log.at(-1).skill, 6); assert.equal(f.opponents[0].wounds, 4);
});

test('strict-under wrestling stops at its own threshold and double one inflicts only one Wound', () => {
  for (const threshold of [0, 1]) {
    let f = fight({weapon: 'strength', grapple: true, stopAtWounds: threshold, opponents: [enemy({wounds: threshold + 2})]});
    f = step(f, 3, 4); assert.equal(f.opponents[0].wounds, threshold + 2);
    f = step(f, 6, 6); f = step(f, 1, 1); assert.equal(f.opponents[0].wounds, threshold + 1); assert.equal(f.status, 'fighting');
    f = step(step(f, 6, 6), 1, 1); assert.equal(f.status, 'win'); assert.equal(f.opponents[0].wounds, threshold);
  }
  assert.throws(() => fight({weapon: 'strength', grapple: true, stopAtWounds: 1}, {wounds: 1}));
});

test('weapon variants use edited skills and pistol damage without changing the printed preset', () => {
  const spec = {weapon: undefined, weaponChoices: ['sword', 'firearm'], opponents: [enemy({skill: undefined, skills: {sword: 7, firearm: 8}})]};
  const f = fight(spec, {}, {weapon: 'firearm'}); assert.equal(f.opponents[0].skill, 8); assert.equal(f.opponents[0].damage, 2);
  const edited = fight(spec, {}, {weapon: 'firearm', opponents: [enemy({skill: 3, skills: {firearm: 8}})]});
  assert.equal(edited.opponents[0].skill, 3);
});

test('unprinted skills remain blank in the editor and require a chosen numeric value', () => {
  const spec = encounter({opponents: [enemy({skill: null, unprintedSkill: true})]});
  validateRealLifeCatalog([spec]); assert.equal(realLifeEditorRows(spec.opponents)[0].skill, '');
  assert.throws(() => fight(spec));
  assert.throws(() => realLifeInteger('')); assert.throws(() => step(fight(), 0, 1));
});

test('cancellation and allowed exits retain Wounds and cannot create combat reward history', () => {
  const state = emptyRealLifeState();
  state.fight = endRealLifeFight(step(fight({opponentFirst: true})), 'cancelled');
  rememberRealLifeFight(state); assert.equal(state.player.wounds, 4); assert.equal(state.history.length, 0);
  assert.equal(endRealLifeFight(fight({escapeTarget: '8'}), 'escaped').destination, '8');
  assert.equal(endRealLifeFight(fight({surrenderTarget: '9'}), 'surrendered').destination, '9');
  assert.throws(() => endRealLifeFight(fight(), 'escaped'));
});

test('completed encounter history is monotonic and recorded once across reloads', () => {
  let state = emptyRealLifeState(); state.fight = step(fight(), 1, 1);
  rememberRealLifeFight(state, 100); state = reload(state); rememberRealLifeFight(state, 100);
  assert.equal(state.history.length, 1);
  state.fight = step(fight(), 1, 1); rememberRealLifeFight(state, 100);
  assert.deepEqual(state.history.map(h => h.ts), [100, 101]); assert.equal(state.setup.wounds, 5);
  validateRealLifeFight(state.fight);
});

test('state updates reject stale callbacks, other books and changed playthroughs', () => {
  let saves = 0, run = {}, bookId = 10;
  const definition = {id: 10, stateKey: 'sim10'};
  const store = createRealLifeState(() => ({run, bookId, definition, saveState: () => saves++}));
  const original = store.snapshot();
  assert.equal(store.update(state => state, original), true);
  assert.equal(store.update(state => state, original), false);
  const previous = store.snapshot(); run = {};
  assert.equal(store.update(state => state, previous), false);
  const switched = store.snapshot(); bookId = 11;
  assert.equal(store.update(state => state, switched), false); assert.equal(store.snapshot(), null); assert.equal(saves, 1);
});

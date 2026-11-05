import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMartialEncounter, startMartialFight, martialAction, validateMartialFight}
  from '../../../public/js/battlesim/engines/martial-quest/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const player = {hp:30, maxHp:35, prowess:17, perception:17, kenjutsu:20, experience:5};
const encounter = (steps, extra = {}) => ({name:'Training opponent', section:steps[0].section,
  training:true, defeatSection:'117', steps, ...extra});
const finish = (section, outcome = 'win', extra = {}) => ({section, kind:'outcome', outcome, ...extra});
const act = (fight, action, random) => martialAction(fight, {expectedEvent:fight.events.length, ...action}, random);
const advance = fight => act(fight, {kind:'continue', destination:fight.pending});
const check = (target = 21) => encounter([
  {section:'25', kind:'check', skill:'kenjutsu', target, pass:'51', fail:'35'},
  finish('51'), finish('35', 'loss'),
]);

test('the original >=21 and >21 checks stay different, with no outcome for an intermediate hit', () => {
  let a = act(startMartialFight(player, check(21)), {kind:'roll', die:1, spent:0});
  const b = act(startMartialFight(player, check(22)), {kind:'roll', die:1, spent:0});
  assert.equal(a.destination, '51'); assert.equal(b.destination, '35');
  assert.equal(a.status, 'fighting'); assert.equal(a.phase, 'continue');
  a = advance(a); assert.equal(a.status, 'fighting'); assert.equal(a.phase, 'finish');
  a = advance(a); assert.equal(a.status, 'win');
});

test('experience is declared before randomness and spent on either success or failure', () => {
  for (const [target, success] of [[22, true], [30, false]]) {
    const start = startMartialFight(player, check(target));
    const fight = act(start, {kind:'roll', spent:1}, () => 0);
    assert.equal(fight.player.experience, 4); assert.equal(fight.events[0].success, success);
    assert.equal(start.player.experience, 5);
  }
  let called = false;
  assert.throws(() => act(startMartialFight(player, check()), {kind:'roll', spent:6},
    () => {called = true; return 0;}), RangeError);
  assert.equal(called, false);
});

test('separate damage instructions require separate actions and stop when HP reaches zero', () => {
  const preset = encounter([{section:'38', kind:'continue', damage:[{fixed:6}, {fixed:3}], next:'51'}, finish('51')]);
  let fight = startMartialFight({...player, hp:8}, preset);
  assert.equal(fight.player.hp, 8);
  fight = act(fight, {kind:'damage'}); assert.equal(fight.player.hp, 2); assert.equal(fight.phase, 'damage');
  fight = act(fight, {kind:'damage'}); assert.equal(fight.player.hp, 0); assert.equal(fight.status, 'loss');
  assert.equal(fight.destination, '117'); assert.equal(fight.opponent.training, true);
  assert.deepEqual(fight.events.map(event => event.amount), [6, 3]);
});

test('random damage uses one die and supports the printed any-roll experience rule', () => {
  const preset = encounter([{section:'150', kind:'continue', damage:[{dice:1}], next:'51'}, finish('51')]);
  const fight = act(startMartialFight(player, preset), {kind:'damage', die:4, spent:1});
  assert.equal(fight.player.hp, 25); assert.equal(fight.player.experience, 4);
  assert.equal(fight.events[0].amount, 5); assert.equal(fight.phase, 'continue');
  assert.throws(() => act(startMartialFight(player, preset), {kind:'damage', die:7}), RangeError);
});

test('opening damage acknowledgment skips only initial damage, never later damage', () => {
  const preset = encounter([
    {section:'8', kind:'continue', damage:[{fixed:5}], next:'97'},
    {section:'97', kind:'continue', damage:[{fixed:2}], next:'134'}, finish('134'),
  ], {training:false, defeatSection:'58'});
  let fight = startMartialFight(player, preset, true);
  assert.equal(fight.phase, 'continue'); assert.equal(fight.player.hp, 30);
  fight = advance(fight); fight = act(fight, {kind:'damage'}); assert.equal(fight.player.hp, 28);
});

test('bokken and karate HP gates retain their different boundaries', () => {
  for (const [threshold, lowHp, highHp] of [[4,4,5], [6,6,7]]) {
    const preset = encounter([{section:'218', kind:'hp', threshold, low:'181', high:'130'},
      finish('181', 'loss', {zeroHp:true}), finish('130')]);
    for (const [hp, destination] of [[lowHp,'181'],[highHp,'130']]) {
      let fight = startMartialFight({...player, hp}, preset); assert.equal(fight.pending, destination);
      fight = advance(fight); fight = advance(fight);
      assert.equal(fight.status, destination === '181' ? 'loss' : 'win');
      assert.equal(fight.player.hp, destination === '181' ? 0 : hp);
    }
  }
});

test('tactical decisions remain explicit and forfeit is a loss without invented HP damage', () => {
  const preset = encounter([{section:'2', kind:'choice', choices:[
    {label:'Attack', to:'51'}, {label:'Leave the dueling ground', to:'147'}]}, finish('51'), finish('147', 'loss')]);
  let fight = startMartialFight(player, preset);
  assert.throws(() => act(fight, {kind:'continue', destination:'51'}), RangeError);
  assert.throws(() => act(fight, {kind:'choice', destination:'999'}), RangeError);
  fight = act(fight, {kind:'choice', destination:'147'}); assert.equal(fight.status, 'fighting');
  fight = advance(advance(fight)); assert.equal(fight.status, 'loss'); assert.equal(fight.player.hp, 30);
});

test('weak fighters cannot bypass the HP gate to choose an attack or retreat', () => {
  for (const threshold of [4, 6]) {
    const preset = encounter([{section:'218', kind:'choice', hpGate:{threshold, low:'181'}, choices:[
      {label:'Attack', to:'130'}, {label:'Retreat', to:'147'}]},
    finish('181', 'loss', {zeroHp:true}), finish('130'), finish('147', 'loss')]);
    const weak = startMartialFight({...player, hp:threshold}, preset);
    assert.equal(weak.phase, 'continue'); assert.equal(weak.pending, '181');
    assert.throws(() => act(weak, {kind:'choice', destination:'130'}), RangeError);
    assert.equal(advance(advance(weak)).player.hp, 0);
    const strong = startMartialFight({...player, hp:threshold + 1}, preset);
    assert.equal(strong.phase, 'choice');
    assert.equal(act(strong, {kind:'choice', destination:'147'}).pending, '147');
    assert.equal(validateMartialFight(strong), strong);
    const invalid = structuredClone(preset); invalid.steps[0].hpGate.low = '999';
    assert.throws(() => normalizeMartialEncounter(invalid), RangeError);
  }
});

test('mutual death and retreat are distinct terminal outcomes', () => {
  for (const [outcome, zeroHp] of [['loss',true],['fled',false]]) {
    let fight = startMartialFight(player, encounter([finish('58', outcome, zeroHp ? {zeroHp} : {})],
      {training:false, defeatSection:'58'}));
    fight = advance(fight); assert.equal(fight.status, outcome); assert.equal(fight.player.hp, zeroHp ? 0 : 30);
  }
});

test('saved state is replayed and stale, altered or unavailable actions are rejected', () => {
  let fight = act(startMartialFight(player, check()), {kind:'roll', die:1, spent:0});
  assert.equal(validateMartialFight(fight), fight);
  const altered = structuredClone(fight); altered.player.hp++;
  assert.throws(() => validateMartialFight(altered), RangeError);
  assert.throws(() => martialAction(fight, {kind:'continue', destination:'51', expectedEvent:0}), RangeError);
  assert.throws(() => act(fight, {kind:'continue', destination:'35'}), RangeError);
  assert.throws(() => act(fight, {kind:'roll', die:6}), RangeError);
  fight = act(fight, {kind:'cancel'}); assert.equal(fight.status, 'cancelled');
  assert.throws(() => act(fight, {kind:'cancel'}), RangeError);
});

test('invalid graphs, damage dice and made-up character values are rejected', () => {
  assert.throws(() => normalizeMartialEncounter(encounter([{section:'1', kind:'continue', next:'2'}])), RangeError);
  assert.throws(() => normalizeMartialEncounter(encounter([{...finish('1'), damage:[{dice:2}]}])), RangeError);
  assert.throws(() => startMartialFight({...player, kenjutsu:undefined}, check()), RangeError);
  assert.throws(() => startMartialFight({...player, hp:36}, check()), RangeError);
});

test('history records one terminal outcome and stale run callbacks cannot change another run', () => {
  let run = {}, bookId = 1591, saves = 0;
  const store = createQuestState(() => ({run, bookId, definition:{id:1591, stateKey:'sim1591'},
    saveState:() => saves++}), {validateFight:validateMartialFight});
  const update = action => store.update(state => {state.fight = action(state.fight); return state;});
  update(() => startMartialFight(player, check()));
  update(fight => act(fight, {kind:'roll', die:1, spent:0})); assert.equal(run.sim1591.history.length, 0);
  update(advance); assert.equal(run.sim1591.history.length, 0);
  update(advance); assert.equal(run.sim1591.history.length, 1);
  store.update(state => state); assert.equal(run.sim1591.history.length, 1);
  const oldRun = run, token = store.snapshot(); run = {};
  assert.equal(store.update(state => {state.player.hp = 1; return state;}, token), false);
  assert.equal(oldRun.sim1591.player.hp, 30); assert.equal(run.sim1591, undefined); assert.equal(saves, 5);
});

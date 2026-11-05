import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProcedure, startProcedure, procedureAction, validateProcedureFight,
  availableProcedureChoices} from '../../../public/js/battlesim/engines/procedural-quest/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const v = key => ['var', key];
const plus = (a, b) => ['add', a, b];
const minus = (a, b) => ['sub', a, b];
const clamp = expr => ['max', 0, expr];
const fx = (key, value) => ({key, value});
const field = (key, min = 0, max = 1000) => ({key, label:key, min, max});
const variables = ['hp', 'maxHp', 'experience', 'fighting', 'dexterity', 'level', 'enemyHp', 'remaining',
  'charges', 'previousLevel', 'skillModifier', 'damageModifier'].map(key => field(key, key.endsWith('Modifier') ? -1 : 0));
const player = {hp:40, maxHp:50, experience:6, fighting:12, dexterity:10, level:15,
  enemyHp:20, remaining:4, charges:1, previousLevel:15, skillModifier:0, damageModifier:0};
const outcome = (id, status = 'win', extra = {}) => ({id, section:'9', kind:'outcome', label:status, outcome:status, ...extra});
const roll = (id, extra = {}) => ({id, section:'1', kind:'roll', label:'Combat check', dice:2,
  experience:true, bonus:v('fighting'), routes:[{to:'end'}], ...extra});
const effect = (id, effects, to = 'end') => ({id, section:'2', kind:'effect', label:'Apply combat damage', effects, routes:[{to}]});
const procedure = (steps, extra = {}) => ({name:'Test opponent', section:'1', entry:steps[0].id,
  defeatSection:'8', variables:structuredClone(variables), steps, ...extra});
const act = (fight, action, random) => procedureAction(fight, {expectedEvent:fight.events.length, ...action}, random);
const advance = fight => act(fight, {kind:'continue', destination:fight.pending});

test('two dice, current skill and declared experience produce a pending combat reference, not a win', () => {
  const preset = procedure([roll('attack', {bonus:plus(v('fighting'), 2), routes:[
    {when:['ge', v('total'), 20], to:'end'}, {to:'miss'}]}), outcome('end'), outcome('miss', 'loss')]);
  let fight = startProcedure(player, preset);
  fight = act(fight, {kind:'roll', dice:[2, 3], spent:1});
  assert.deepEqual(fight.lastRoll, {roll:5, spent:1, total:20});
  assert.equal(fight.player.experience, 5);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.pending, 'end');
  fight = advance(fight); assert.equal(fight.phase, 'finish'); assert.equal(fight.status, 'fighting');
  fight = act(fight, {kind:'finish'}); assert.equal(fight.status, 'win');
  assert.equal(fight.player.hp, 40);
});

test('invalid experience and invalid modifiers are rejected before randomness or state mutation', () => {
  const preset = procedure([roll('attack'), outcome('end')]);
  const original = startProcedure(player, preset), before = structuredClone(original);
  let calls = 0;
  assert.throws(() => act(original, {kind:'roll', spent:7}, () => {calls++; return 0;}), RangeError);
  assert.equal(calls, 0); assert.deepEqual(original, before);
  const noXp = startProcedure(player, procedure([roll('attack', {experience:false}), outcome('end')]));
  assert.throws(() => act(noXp, {kind:'roll', spent:1}, () => {calls++; return 0;}), RangeError);
  const badBonus = startProcedure(player, procedure([roll('attack', {bonus:['mod', 1, 0]}), outcome('end')]));
  assert.throws(() => act(badBonus, {kind:'roll'}, () => {calls++; return 0;}), RangeError);
  assert.equal(calls, 0);
  const random = act(original, {kind:'roll', spent:2}, () => {calls++; return .5;});
  assert.equal(calls, 2); assert.deepEqual(random.events[0].dice, [4, 4]);
  assert.equal(random.player.experience, 4); assert.deepEqual(original, before);
});

test('an explicit remaining-experience bonus counts the balance after a declared spend', () => {
  const preset = procedure([roll('charges', {dice:1, bonus:v('experience'), bonusAfterSpending:true,
    effects:[fx('charges', clamp(minus(v('total'), 3)))]}), outcome('end')]);
  for (const spent of [0, 2]) {
    const fight = act(startProcedure(player, preset), {kind:'roll', dice:[4], spent});
    assert.equal(fight.lastRoll.total, 10); assert.equal(fight.player.charges, 7);
    assert.equal(fight.player.experience, 6 - spent);
    assert.equal(validateProcedureFight(fight), fight);
  }
  let called = false;
  assert.throws(() => act(startProcedure(player, preset), {kind:'roll', spent:7},
    () => {called = true; return 0;}), RangeError);
  assert.equal(called, false);
});

test('separate damage rolls remain separate and lethal damage stops the next combat action', () => {
  const preset = procedure([
    roll('damage', {dice:1, bonus:0, effects:[fx('hp', clamp(minus(v('hp'), v('total'))))], routes:[{to:'second'}]}),
    roll('second', {dice:1, bonus:0, effects:[fx('hp', clamp(minus(v('hp'), v('total'))))]}), outcome('end'),
  ]);
  let fight = startProcedure({...player, hp:5}, preset);
  fight = act(fight, {kind:'roll', dice:[3], spent:0});
  assert.equal(fight.player.hp, 2); assert.equal(fight.pending, 'second');
  fight = advance(fight); fight = act(fight, {kind:'roll', dice:[2], spent:1});
  assert.equal(fight.player.hp, 0); assert.equal(fight.status, 'loss'); assert.equal(fight.destination, '8');
  assert.equal(fight.player.experience, 5);
  assert.throws(() => act(fight, {kind:'finish'}), RangeError);
});

test('group casualties repeat the attack with a new casualty die rather than invented enemy HP', () => {
  const preset = procedure([
    roll('attack', {routes:[{when:['ge', v('total'), 18], to:'casualties'}, {to:'damage'}]}),
    roll('casualties', {dice:1, bonus:0, effects:[fx('remaining', clamp(minus(v('remaining'), v('total'))))],
      routes:[{when:['eq', v('remaining'), 0], to:'end'}, {to:'attack'}]}),
    roll('damage', {dice:1, bonus:0, effects:[fx('hp', clamp(minus(v('hp'), v('total'))))], routes:[{to:'attack'}]}),
    outcome('end'),
  ]);
  let fight = startProcedure(player, preset);
  fight = act(fight, {kind:'roll', dice:[3, 3]}); fight = advance(fight);
  fight = act(fight, {kind:'roll', dice:[2]});
  assert.equal(fight.player.remaining, 2); assert.equal(fight.player.enemyHp, 20);
  fight = advance(fight); fight = act(fight, {kind:'roll', dice:[6, 6]}); fight = advance(fight);
  fight = act(fight, {kind:'roll', dice:[4]}); assert.equal(fight.player.remaining, 0);
  assert.equal(fight.pending, 'end'); assert.equal(fight.status, 'fighting');
  assert.equal(act(advance(fight), {kind:'finish'}).status, 'win');
});

test('drain changes current dexterity before a combined-skill check', () => {
  const preset = procedure([
    effect('drain', [fx('dexterity', clamp(minus(v('dexterity'), 2)))], 'attack'),
    roll('attack', {bonus:plus(v('fighting'), v('dexterity')), routes:[
      {when:['ge', v('total'), 28], to:'end'}, {to:'miss'}]}), outcome('end'), outcome('miss', 'loss'),
  ]);
  let fight = act(startProcedure(player, preset), {kind:'effect'});
  assert.equal(fight.player.dexterity, 8); assert.equal(fight.player.fighting, 12);
  fight = act(advance(fight), {kind:'roll', dice:[4, 3]});
  assert.equal(fight.lastRoll.total, 27); assert.equal(fight.pending, 'miss');
});

test('crossing a class threshold causes extra HP loss once, and effects run in printed order', () => {
  const crossed = ['and', ['gt', v('previousLevel'), 13], ['le', v('level'), 13]];
  const preset = procedure([
    effect('drain', [fx('previousLevel', v('level')), fx('level', clamp(minus(v('level'), 2))),
      fx('fighting', clamp(minus(v('fighting'), 2))),
      fx('hp', clamp(minus(v('hp'), ['if', crossed, 6, 0])))], 'drain'),
    outcome('end'),
  ]);
  let fight = act(startProcedure(player, preset), {kind:'effect'});
  assert.equal(fight.player.hp, 34); assert.equal(fight.player.level, 13); assert.equal(fight.player.fighting, 10);
  fight = act(advance(fight), {kind:'effect'});
  assert.equal(fight.player.hp, 34); assert.equal(fight.player.level, 11);
  assert.equal(validateProcedureFight(fight), fight);
});

test('combat powers require available charges and explicit choice; consumption cannot be bypassed', () => {
  const preset = procedure([
    {id:'weapon', section:'1', kind:'choice', label:'Choose an attack', choices:[
      {id:'charged', label:'Energy drain', to:'attack', when:['gt', v('charges'), 0],
        effects:[fx('charges', minus(v('charges'), 1))]},
      {id:'ordinary', label:'Ordinary attack', to:'attack'},
    ]}, roll('attack', {routes:[{to:'weapon'}]}), outcome('end'),
  ]);
  let fight = startProcedure(player, preset);
  assert.equal(availableProcedureChoices(fight).length, 2);
  fight = act(fight, {kind:'choice', choice:'charged'});
  assert.equal(fight.player.charges, 0);
  fight = act(advance(fight), {kind:'roll', dice:[1, 1]}); fight = advance(fight);
  assert.deepEqual(availableProcedureChoices(fight).map(choice => choice.id), ['ordinary']);
  assert.throws(() => act(fight, {kind:'choice', choice:'charged'}), RangeError);
});

test('healing is capped at current maximum and then yields the opponent attack', () => {
  const preset = procedure([
    roll('heal', {dice:2, bonus:0, effects:[fx('hp', ['min', v('maxHp'), plus(v('hp'), v('total'))])],
      routes:[{to:'enemy'}]}),
    effect('enemy', [fx('hp', clamp(minus(v('hp'), 4)))]), outcome('end'),
  ]);
  let fight = act(startProcedure({...player, hp:48}, preset), {kind:'roll', dice:[6, 6]});
  assert.equal(fight.player.hp, 50); assert.equal(fight.pending, 'enemy');
  fight = act(advance(fight), {kind:'effect'}); assert.equal(fight.player.hp, 46);
});

test('terminal conditions retain distinct HP death, level death and opponent defeat references', () => {
  const terminalRules = [
    {when:['eq', v('level'), 0], outcome:'loss', destination:'6'},
    {when:['eq', v('enemyHp'), 0], outcome:'win', destination:'7'},
  ];
  for (const [key, status, destination] of [['hp','loss','8'], ['level','loss','6'], ['enemyHp','win','7']]) {
    const preset = procedure([effect('hit', [fx(key, 0)]), outcome('end')], {terminalRules});
    const fight = act(startProcedure(player, preset), {kind:'effect'});
    assert.equal(fight.status, status); assert.equal(fight.destination, destination);
  }
  const preset = procedure([effect('hit', [fx('hp', 0), fx('enemyHp', 0)]), outcome('end')], {terminalRules});
  assert.equal(act(startProcedure(player, preset), {kind:'effect'}).status, 'loss');
  assert.throws(() => startProcedure({...player, level:0}, preset), RangeError);
});

test('an uncovered printed result can explicitly stop unresolved without inventing a win', () => {
  const preset = procedure([
    roll('mirror', {dice:1, bonus:1, routes:[{when:['le', v('total'), 6], to:'end'}, {to:'unresolved'}]}),
    outcome('end'), outcome('unresolved', 'cancelled', {label:'Printed rule does not cover this result; continue in the reader.'}),
  ]);
  let fight = act(startProcedure(player, preset), {kind:'roll', dice:[6]});
  assert.equal(fight.lastRoll.total, 7); assert.equal(fight.pending, 'unresolved');
  fight = act(advance(fight), {kind:'finish'}); assert.equal(fight.status, 'cancelled');
});

test('replay catches changed dice, modifiers, stats, routes and stale or duplicate actions', () => {
  let fight = act(startProcedure(player, procedure([roll('attack'), outcome('end')])), {kind:'roll', dice:[2, 3]});
  assert.equal(validateProcedureFight(fight), fight);
  for (const mutate of [f => f.player.hp++, f => f.events[0].dice[0]++, f => f.lastRoll.total++,
    f => f.pending = 'wrong', f => f.opponent.steps[0].bonus = 99]) {
    const altered = structuredClone(fight); mutate(altered);
    assert.throws(() => validateProcedureFight(altered), RangeError);
  }
  assert.throws(() => procedureAction(fight, {kind:'continue', destination:'end', expectedEvent:0}), RangeError);
  assert.throws(() => act(fight, {kind:'roll', dice:[1, 1]}), RangeError);
  fight = act(fight, {kind:'cancel'}); assert.equal(fight.status, 'cancelled');
  assert.throws(() => act(fight, {kind:'cancel'}), RangeError);
});

test('malformed programs and out-of-range effects fail without partial player changes', () => {
  for (const mutate of [p => p.steps[0].routes[0].to = 'missing', p => p.variables.push(p.variables[0]),
    p => p.steps[0].bonus = ['var', 'unknown'], p => p.variables[0].key = '__proto__',
    p => p.steps[0].routes[0].when = 1, p => p.steps[0].dice = 3]) {
    const preset = procedure([roll('attack'), outcome('end')]); mutate(preset);
    assert.throws(() => normalizeProcedure(preset), RangeError);
  }
  const fight = startProcedure(player, procedure([effect('invalid', [fx('hp', -1)]), outcome('end')]));
  assert.throws(() => act(fight, {kind:'effect'}), RangeError); assert.equal(fight.player.hp, 40);
});

test('a lethal encounter without a printed death destination does not invent one', () => {
  const preset = procedure([effect('hit', [fx('hp', 0)]), outcome('end')], {defeatSection:null});
  const fight = act(startProcedure(player, preset), {kind:'effect'});
  assert.equal(fight.status, 'loss'); assert.equal(fight.destination, null);
  assert.equal(validateProcedureFight(fight), fight);
});

test('internal counters have explicit defaults and malformed terminal lists are rejected', () => {
  const preset = procedure([effect('count', [fx('remaining', minus(v('remaining'), 1))]), outcome('end')]);
  const counter = preset.variables.find(row => row.key === 'remaining');
  counter.internal = true; counter.default = 17;
  const input = {...player}; delete input.remaining;
  const fight = act(startProcedure(input, preset), {kind:'effect'});
  assert.equal(fight.player.remaining, 16);
  const invalid = structuredClone(preset); delete invalid.variables.find(row => row.key === 'remaining').default;
  assert.throws(() => normalizeProcedure(invalid), RangeError);
  assert.throws(() => normalizeProcedure({...preset, terminalRules:{}}), RangeError);
  assert.throws(() => normalizeProcedure({...preset, terminalRules:Array(17).fill({})}), RangeError);
});

test('neutral combat completion preserves stats and a missing printed terminal destination', () => {
  let fight = startProcedure(player, procedure([outcome('end', 'ended')]));
  fight = act(fight, {kind:'finish'});
  assert.equal(fight.status, 'ended'); assert.equal(fight.player.hp, 40);
  assert.equal(validateProcedureFight(fight), fight);
  const preset = procedure([effect('drain', [fx('level', 0)]), outcome('end')], {
    terminalRules:[{when:['eq', v('level'), 0], outcome:'loss', destination:null}],
  });
  fight = act(startProcedure(player, preset), {kind:'effect'});
  assert.equal(fight.status, 'loss'); assert.equal(fight.destination, null);
});

test('an explicitly fatal passage retains its own reference instead of the general HP-death reference', () => {
  const preset = procedure([outcome('fatal-spell', 'loss', {section:'7', zeroHp:true})]);
  const fight = act(startProcedure(player, preset), {kind:'finish'});
  assert.equal(fight.player.hp, 0); assert.equal(fight.status, 'loss');
  assert.equal(fight.destination, '7'); assert.equal(validateProcedureFight(fight), fight);
  assert.throws(() => normalizeProcedure(procedure([outcome('invalid', 'win', {zeroHp:true})])), RangeError);
});

test('optional shared-state merging retains unused combat resources across different procedures', () => {
  for (const preservePlayerFields of [false, true]) {
    const run = {}, definition = {id:999999, stateKey:'simTest'};
    const store = createQuestState(() => ({run, bookId:999999, definition, saveState() {}}),
      {validateFight:validateProcedureFight, preservePlayerFields});
    const first = procedure([outcome('end', 'win', {effects:[fx('talisman', 0)]})]);
    first.variables.push({key:'talisman', label:'Available talisman', min:0, max:1, default:1});
    store.update(state => ({...state, fight:startProcedure(player, first)}));
    store.update(state => ({...state, fight:act(state.fight, {kind:'finish'})}));
    assert.equal(run.simTest.player.talisman, 0);
    store.update(state => ({...state, fight:startProcedure(state.player, procedure([outcome('end', 'ended')]))}));
    store.update(state => ({...state, fight:act(state.fight, {kind:'finish'})}));
    assert.equal(run.simTest.player.talisman, preservePlayerFields ? 0 : undefined);
    assert.equal(run.simTest.history.length, 2);
    assert.deepEqual(run.simTest.history.map(row => row.outcome), ['win', 'ended']);
  }
});

test('run replacement invalidates delayed actions and completed outcomes are recorded once', () => {
  let run = {}, saves = 0;
  const definition = {id:999999, stateKey:'simTest'};
  const store = createQuestState(() => ({run, bookId:999999, definition, saveState:() => saves++}),
    {validateFight:validateProcedureFight});
  const preset = procedure([outcome('end')]);
  store.update(state => ({...state, fight:startProcedure(player, preset)}));
  const stale = store.snapshot(); run = {};
  assert.equal(store.update(state => ({...state, fight:act(state.fight, {kind:'finish'})}), stale), false);
  assert.equal(saves, 1); assert.deepEqual(run, {});
  store.update(state => ({...state, fight:startProcedure(player, preset)}));
  store.update(state => ({...state, fight:act(state.fight, {kind:'finish'})}));
  store.update(state => state);
  assert.equal(run.simTest.history.length, 1); assert.equal(run.simTest.history[0].outcome, 'win');
  assert.equal(run.simTest.player.hp, player.hp);
});

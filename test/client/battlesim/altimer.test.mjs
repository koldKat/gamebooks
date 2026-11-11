import test from 'node:test';
import assert from 'node:assert/strict';
import {startAltimerFight, altimerAction, validateAltimerFight} from '../../../public/js/battlesim/engines/altimer/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const start = (body = 5, hp = 7, enemies = [{name: 'Enemy', body: 4, hp: 8}], options) =>
  startAltimerFight({name: 'Player', body, hp}, {name: 'Encounter', enemies}, options);
const attack = (fight, dice, weakSpot) => altimerAction(fight,
  {kind: 'attack', expectedRevision: fight.revision, dice, weakSpot});

test('printed example deals seven SPIRIT, then the living opponent retaliates', () => {
  const original = start(), saved = structuredClone(original);
  let fight = attack(original, [3, 3]);
  assert.equal(fight.enemies[0].hp, 1); assert.equal(fight.phase, 'enemy');
  fight = attack(fight, [3, 3]);
  assert.equal(fight.player.hp, 2); assert.equal(fight.round, 2);
  fight = attack(fight, [1, 1]);
  assert.equal(fight.status, 'win'); assert.equal(fight.player.hp, 2);
  assert.deepEqual(original, saved);
});

test('every two-dice result follows the damage formula without healing', () => {
  for (let first = 1; first <= 6; first++) for (let second = 1; second <= 6; second++) {
    const fight = attack(start(2, 50, [{name: 'Strong enemy', body: 12, hp: 50}]), [first, second]);
    assert.equal(fight.enemies[0].hp, 50 - Math.max(0, first + second + 2 - 12));
  }
});

test('two printed enemies fight sequentially and dead enemies do not counterattack', () => {
  let fight = start(5, 20, [{name: 'First', body: 5, hp: 7}, {name: 'Second', body: 4, hp: 8}]);
  fight = attack(fight, [6, 6]);
  assert.equal(fight.target, 1); assert.equal(fight.phase, 'player'); assert.equal(fight.player.hp, 20);
  fight = attack(fight, [6, 6]);
  assert.equal(fight.status, 'win'); assert.equal(fight.target, 2);
});

test('sucker loses BODY after each surviving turn, not SPIRIT or an enemy dice roll', () => {
  let fight = start(3, 8, [{name: 'Sucking monstrosity', body: 4, hp: 100}], {sucker: true});
  fight = attack(fight, [1, 1]); assert.equal(fight.player.body, 2);
  fight = altimerAction(fight, {kind: 'attack', expectedRevision: fight.revision}, () => {throw Error('No enemy dice');});
  assert.equal(fight.player.body, 1); assert.equal(fight.player.hp, 8);
  fight = attack(fight, [1, 1]);
  assert.equal(fight.status, 'loss'); assert.equal(fight.player.body, 0); assert.equal(fight.player.hp, 8);
});

test('killing the sucker restores temporary BODY and prevents a posthumous attack', () => {
  let fight = start(3, 8, [{name: 'Sucking monstrosity', body: 4, hp: 15}], {sucker: true});
  fight = attack(fight, [6, 6]); fight = attack(fight);
  assert.equal(fight.player.body, 1);
  fight = attack(fight, [6, 6]);
  assert.equal(fight.status, 'win'); assert.equal(fight.player.body, 3); assert.equal(fight.player.hp, 8);
});

test('weak spots damage enemy BODY and apply the same defense penalty that round', () => {
  let fight = start(5, 30, [{name: 'Purple mass', body: 4, hp: 9}], {allowWeakSpot: true});
  fight = attack(fight, [1, 1], true);
  assert.equal(fight.enemies[0].body, 3); assert.equal(fight.enemies[0].hp, 9);
  fight = attack(fight, [1, 1]);
  assert.equal(fight.player.hp, 28); assert.equal(fight.weakSpot, false);
  fight = attack(fight, [1, 1]);
  assert.equal(fight.enemies[0].hp, 5); assert.equal(fight.enemies[0].body, 3);
});

test('the energy baton still damages SPIRIT on a weak-spot attack', () => {
  const fight = attack(start(5, 30, [{name: 'Purple mass', body: 4, hp: 9}],
    {allowWeakSpot: true, damageBonus: 1}), [1, 1], true);
  assert.equal(fight.enemies[0].body, 3); assert.equal(fight.enemies[0].hp, 8);
});

test('explicit attack modifiers and armor reduction affect only their combat terms', () => {
  let fight = start(5, 30, [{name: 'Enemy', body: 4, hp: 50}],
    {attackModifier: 5, damageReduction: 2});
  fight = attack(fight, [1, 1]); assert.equal(fight.enemies[0].hp, 42);
  fight = attack(fight, [3, 3]); assert.equal(fight.player.hp, 27);
  const invisible = attack(start(5, 7, undefined, {attackModifier: -2}), [3, 3]);
  assert.equal(invisible.enemies[0].hp, 3);
});

test('stale or malformed actions cannot alter a fight', () => {
  const original = start(), saved = structuredClone(original);
  assert.throws(() => altimerAction(original, {kind: 'attack', expectedRevision: 1, dice: [1, 1]}));
  for (const dice of [[1], [0, 1], [7, 1], [1.5, 1], ['1', 2]]) assert.throws(() => attack(original, dice));
  assert.throws(() => attack(original, [1, 1], true));
  for (const value of [0, 1, 11, NaN]) assert.throws(() => start(value));
  const damaged = structuredClone(original); damaged.phase = 'invalid';
  assert.throws(() => validateAltimerFight(damaged)); assert.deepEqual(original, saved);
});

test('cancel and terminal outcomes cannot be replayed or awarded twice by shared run storage', () => {
  const run = {path: [1], inventory: [{name: 'Kept'}]}, preserved = structuredClone(run);
  let bookId = 409, saves = 0;
  const store = createQuestState(() => ({run, bookId, definition: {id: 409, stateKey: 'sim409'},
    saveState: () => saves++}), {validateFight: validateAltimerFight});
  assert.equal(store.update(state => {state.fight = start(5, 7, [{name: 'Enemy', body: 4, hp: 1}]); return state;}), true);
  const token = store.snapshot();
  assert.equal(store.update(state => {state.fight = attack(state.fight, [1, 1]); return state;}, token), true);
  assert.equal(run.sim409.history.length, 1); assert.equal(run.sim409.history[0].outcome, 'win');
  assert.equal(store.update(state => state, token), false);
  assert.equal(store.update(state => state), true); assert.equal(run.sim409.history.length, 1);
  bookId = 410; assert.equal(store.update(state => state), false);
  const {sim409, ...rest} = run; assert.deepEqual(rest, preserved); assert.equal(saves, 3);
  const cancelled = altimerAction(start(), {kind: 'cancel', expectedRevision: 0});
  assert.equal(cancelled.status, 'cancelled'); assert.throws(() => attack(cancelled, [1, 1]));
});

test('supporting guards add damage only on a hit and stop contributing when dead', () => {
  const enemies=[{name:'First',body:7,hp:1},{name:'Second',body:7,hp:50},{name:'Third',body:6,hp:50}];
  let fight=attack(start(5,30,enemies,{supportDamage:'others'}),[6,6]);
  assert.equal(fight.target,1);
  fight=attack(fight,[1,1]);fight=attack(fight,[1,1]);
  assert.equal(fight.player.hp,25); // 2+7−5, plus the third guard.
  fight=attack(fight,[1,1]);fight=attack(fight,[1,1]);assert.equal(fight.player.hp,20);
  let miss=attack(start(10,30,[{name:'A',body:1,hp:50},{name:'B',body:1,hp:50}],{supportDamage:'others'}),[1,1]);
  miss=attack(miss,[1,1]);assert.equal(miss.player.hp,30);
});

test('section 99 explicitly counts the attacking assassin among survivors', () => {
  const enemies=[{name:'First',body:6,hp:50},{name:'Second',body:6,hp:50},{name:'Third',body:7,hp:50}];
  let fight=attack(start(5,30,enemies,{supportDamage:'all'}),[1,1]);
  fight=attack(fight,[1,1]);assert.equal(fight.player.hp,24); // 2+6−5, plus all three.
});

test('Dammler damage reaches every living opponent and skips all defeated targets', () => {
  let fight=start(5,30,[{name:'A',body:5,hp:20},{name:'B',body:4,hp:5},{name:'C',body:6,hp:7}],{areaDamage:true});
  fight=attack(fight,[3,3]);assert.deepEqual(fight.enemies.map(e=>e.hp),[14,0,1]);
  fight=attack(fight,[1,1]);fight=attack(fight,[6,6]);
  assert.deepEqual(fight.enemies.map(e=>e.hp),[2,0,0]);
  fight=attack(fight,[1,1]);fight=attack(fight,[1,1]);
  assert.equal(fight.status,'win');assert.equal(fight.target,3);
});

test('vest outcomes, shield and healing patch retain exact half-point SPIRIT', () => {
  for(let die=1;die<=6;die++) {
    let fight=attack(start(5,30,[{name:'Enemy',body:6,hp:50}],{vest:true,shield:true,healingPatch:true}),[1,1]);
    fight=altimerAction(fight,{kind:'attack',expectedRevision:fight.revision,dice:[3,3],vestDie:die});
    assert.equal(fight.player.hp,die<=3?27:29); // Seven damage, shield to six, vest to two, then halve.
    assert.equal(fight.events.at(-1).vestDie,die);
  }
  let half=attack(start(5,7,[{name:'Enemy',body:4,hp:50}],{healingPatch:true}),[1,1]);
  half=attack(half,[3,3]);assert.equal(half.player.hp,4.5);
  assert.equal(startAltimerFight({...half.player,body:5},half.opponent,{healingPatch:true}).player.hp,4.5);
  assert.throws(()=>start(5,4.25));
});

test('equipment rolls do not consume hidden extra dice and cancellation retains equipment setup', () => {
  let fight=attack(start(5,30,[{name:'Enemy',body:4,hp:50}],{vest:true}),[1,1]);let rolls=0;
  fight=altimerAction(fight,{kind:'attack',expectedRevision:fight.revision,dice:[3,3]},()=>{rolls++;return 0.5;});
  assert.equal(rolls,1);assert.equal(fight.events.at(-1).vestDie,4);assert.equal(fight.player.hp,29);
  const cancelled=altimerAction(fight,{kind:'cancel',expectedRevision:fight.revision});
  assert.equal(cancelled.options.vest,true);assert.equal(cancelled.player.hp,29);
});

test('legacy saved fights remain valid without new equipment options', () => {
  const original=start(5,30,[{name:'Enemy',body:4,hp:50}]);
  for(const key of ['supportDamage','areaDamage','shield','vest','healingPatch'])delete original.options[key];
  const saved=structuredClone(original);validateAltimerFight(original);assert.deepEqual(original,saved);
  const fight=attack(attack(original,[1,1]),[3,3]);assert.equal(fight.player.hp,25);
  assert.deepEqual(original,saved);
});

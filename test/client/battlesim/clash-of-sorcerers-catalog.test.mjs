import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1597/definition.js';
import {startProcedure, procedureAction, validateProcedureFight}
  from '../../../public/js/battlesim/engines/procedural-quest/core.js';
import {compileCustomProcedure} from '../../../public/js/battlesim/engines/procedural-quest/custom.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const stats = {hp:3, maxHp:14, intelligence:22, experience:0};
const act = (fight, action) => procedureAction(fight, {expectedEvent:fight.events.length, ...action});
const ready = fight => fight.phase === 'continue'
  ? act(fight, {kind:'continue', destination:fight.pending}) : fight;
const roll = (fight, dice) => act(ready(fight), {kind:'roll', dice, spent:0});
const wound = fight => act(ready(fight), {kind:'effect'});
const start = (player = stats) => startProcedure(player, ENCOUNTERS[0]);

test('the installed duel loads once with printed references and no experience rule', async () => {
  let requests = 0;
  await Promise.all([loadRoster(async url => {
    requests++; assert.equal(url, '/api/books/1597/enemies');
    return {ok:true, json:async () => getRosterRows(1597)};
  }), loadRoster(() => { throw Error('duplicate roster fetch'); })]);
  assert.equal(requests, 1); assert.equal(ENCOUNTERS.length, 1);
  assert.equal(ENCOUNTERS[0].section, '176');
  assert.deepEqual(ENCOUNTERS[0].sourcePdfPages, [162,163]);
  assert.equal(RULES.experienceEnabled, false);
  assert.equal(RULES.storyProgressionAutomatic, false);
  assert.equal(ENCOUNTERS[0].steps.length, 3);
});

test('exactly 34 wins without HP loss; 33 costs exactly one HP before retrying', () => {
  let fight = roll(start(), [6,5]);
  assert.equal(fight.lastRoll.total, 33); assert.equal(fight.player.hp, 3);
  assert.throws(() => roll(fight, [6,6]), RangeError);
  fight = wound(fight);
  assert.equal(fight.player.hp, 2); assert.equal(fight.player.intelligence, 22);
  fight = roll(fight, [6,6]);
  assert.equal(fight.lastRoll.total, 34); assert.equal(fight.player.hp, 2);
  fight = act(ready(fight), {kind:'finish'});
  assert.equal(fight.status, 'win'); assert.equal(fight.destination, '205');
  assert.equal(fight.player.experience, 0);
  assert.deepEqual(validateProcedureFight(fight), fight);
  assert.throws(() => act(fight, {kind:'finish'}), RangeError);
});

test('failed rolls exhaust HP and stop at zero without invented enemy stats or routes', () => {
  let fight = start({...stats, intelligence:21});
  for (let hp = 2; hp >= 0; hp--) {
    fight = wound(roll(fight, [6,6]));
    assert.equal(fight.player.hp, hp);
    assert.equal(fight.status, hp ? 'fighting' : 'loss');
  }
  assert.equal(fight.destination, null);
  assert.deepEqual(validateProcedureFight(fight), fight);
  assert.throws(() => roll(fight, [6,6]), RangeError);
});

test('dice and current stats are checked; experience cannot be added or spent', () => {
  const fight = start();
  for (const dice of [[6], [0,6], [6,7], [6,6,6]]) assert.throws(() => roll(fight,dice), RangeError);
  assert.throws(() => act(fight, {kind:'roll', dice:[6,6], spent:1}), RangeError);
  assert.throws(() => start({...stats, experience:1}), RangeError);
  assert.throws(() => start({...stats, hp:15}), RangeError);
  assert.throws(() => start({...stats, intelligence:-1}), RangeError);
});

test('custom opponents use editable targets and the same two-die, one-HP rule', () => {
  const custom = compileCustomProcedure([{displayName:'Custom rival', target:30, damageDice:'1'}], RULES);
  let fight = startProcedure({...stats, intelligence:20}, custom);
  fight = wound(roll(fight, [4,5])); assert.equal(fight.player.hp, 2);
  fight = act(ready(roll(fight, [5,5])), {kind:'finish'});
  assert.equal(fight.status, 'win'); assert.equal(fight.opponent.name, 'Custom rival');
  assert.equal(ENCOUNTERS[0].steps.find(s => s.kind === 'roll').routes[0].when[2], 34);
  assert.throws(() => compileCustomProcedure([{displayName:'Rival', target:0, damageDice:'1'}], RULES), RangeError);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/718/definition.js';
import { newCharacter, startFight, targets, round, resolveWound, escapeFight, freeFoot, decideMercy }
  from '../../../public/js/battlesim/books/718/combat.js';
import { eat, restoreStrength, restoreFortune, sauna, testLuck }
  from '../../../public/js/battlesim/books/718/effects.js';
import { createState } from '../../../public/js/battlesim/books/718/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim718.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim718.js';

test('718: both languages cover all named source encounters and combatants', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const language of [en, bg]) {
    for (const encounter of ENCOUNTERS) {
      assert.ok(language['battlesim718.encounter.' + encounter.section]);
      for (const enemy of encounter.enemies) assert.ok(language['battlesim718.enemy.' + enemy.key]);
    }
    for (const [key, value] of Object.entries(language)) {
      assert.ok(value.trim(), key);
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(),
        [...en[key].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), key);
    }
  }
});

const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected extra die');
  return values.shift();
};
const character = changes => ({ ...newCharacter(() => 6), luck: 0, ...changes });

test('718: actual backend awards each win/loss once and excludes abandoned fights', () => {
  const events = [], db = {exec() {}, transaction: fn => () => fn(), prepare: () => ({run() {}, all: () => [],
    get: () => ({id: 718, total_sections: 400, is_container: 0})})};
  const context = {module: {exports: {}}, events, require(name) {
    if (name === './connection') return {db};
    if (name === './auth') return {generateToken: () => 'test-only'};
    if (name === '../impersonation-context') return {isImpersonatingContext: () => false};
    if (name === '../clean-run') return {isCleanRun: () => false};
    throw Error('Unexpected dependency: ' + name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8') + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim718').length, 1);
  const state = history => ({graph: {}, playthroughs: [{startedAt: 123, path: [1], sim718: {history}}]});
  const after = state(['win', 'loss', 'cancelled'].map((outcome, i) => ({outcome, ts: i + 10})));
  context.module.exports.processStateXp(1, 718, state([]), after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim718:10'], [1, 'battlesim_loss', 'sim718:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 718, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});

test('718: recovery and sauna preserve equipment, provisions, gold and the source caps', () => {
  const original = character({ stamina: 23, gold: 18, provisions: 2, swiftstinger: true, talisman: true });
  const fed = eat(original);
  assert.equal(fed.stamina, 24); assert.equal(fed.provisions, 1);
  assert.equal(original.provisions, 2);
  const rerolled = sauna(original, rolls(1, 2, 3, 4));
  assert.deepEqual([rerolled.skill, rerolled.stamina, rerolled.luck], [7, 17, 10]);
  for (const key of ['gold', 'provisions', 'swiftstinger', 'talisman']) assert.equal(rerolled[key], original[key]);
  assert.equal(restoreStrength(character({ stamina: 1 })).stamina, 24);
  assert.equal(restoreFortune(character()).luck, 13);
  const token = testLuck(original, () => assert.fail('Talisman must not roll'), { talisman: true });
  assert.equal(token.lucky, true); assert.equal(token.character.luck, 0); assert.equal(token.character.talisman, false);
  for (const effect of [eat, restoreStrength, restoreFortune, sauna, testLuck]) {
    assert.throws(() => effect(character({ dead: true, stamina: 1 })), /living/);
  }
});

test('718: state is run-scoped, records outcomes once and retains lifetime history', () => {
  let run = {}, currentBookId = 718, saves = 0;
  const state = createState(() => ({ currentBookId, currentPlaythrough: () => run, saveState: () => saves++ }));
  state.ensure();
  state.change(next => { next.history = Array.from({ length: 35 }, (_, ts) => ({ enemy: 'Old fight', outcome: 'win', ts })); });
  state.change(next => {
    next.fight = round(startFight(69, character({ swiftstinger: true })), 0, undefined, { swiftstinger: true });
    next.fight.name = 'Merman';
  });
  assert.equal(state.read().history.length, 36);
  state.change(() => {});
  assert.equal(state.read().history.length, 36);
  const firstRun = run, priorSaves = saves;
  assert.equal(state.change(() => { run = {}; }), false);
  assert.equal(saves, priorSaves);
  assert.equal(firstRun.sim718.history.length, 36);
  currentBookId = 215;
  assert.equal(state.read(), null);
  assert.equal(state.change(() => assert.fail('Wrong book must not be changed')), false);
});

test('718: source defaults, encounter variants and isolated fight initialization', () => {
  const rolled = newCharacter(rolls(1, 2, 3, 4));
  assert.deepEqual([rolled.skill, rolled.stamina, rolled.luck, rolled.provisions, rolled.gold], [7, 17, 10, 10, 0]);
  assert.equal(ENCOUNTERS.length, 40);
  assert.deepEqual(startFight(168, character()).enemies.map(e => [e.skill, e.stamina]), [[9, 6], [7, 6], [4, 8]]);
  const original = character({ stamina: 13, gold: 8, nextFightModifier: -2 });
  const saved = JSON.stringify(original), fight = startFight(25, original);
  assert.equal(JSON.stringify(original), saved);
  assert.equal(fight.player.stamina, 13);
  assert.equal(fight.nextFightModifier, -2);
  assert.equal(fight.player.nextFightModifier, 0);
  assert.equal(startFight(13, original, { remainingBatFish: 2 }).enemies.length, 2);
  assert.equal(startFight(109, original, { previousOgreStamina: 7 }).enemies[0].stamina, 11);
  const kraken = startFight(253, original, { axeFish: true, sawFish: true });
  assert.deepEqual([kraken.enemies[0].skill, kraken.enemies[0].stamina], [8, 16]);
  assert.throws(() => startFight(13, original, { remainingBatFish: 0 }), /Invalid/);
  assert.throws(() => startFight(25, original, { enemyStamina: [-1, 5] }), /Invalid/);
});

test('718: sequential and rolling-pair fights preserve survivors, health and serialization', () => {
  const before = startFight(274, character());
  before.enemies[1].stamina = 2;
  const saved = JSON.stringify(before);
  const after = round(JSON.parse(saved), 1, rolls(6, 6, 1, 1, 1, 1));
  assert.deepEqual(targets(after), [0, 2]);
  assert.equal(after.enemies[0].stamina, 13);
  assert.equal(after.enemies[1].stamina, 0);
  assert.equal(after.outcome, null);
  assert.equal(JSON.stringify(before), saved);
  const damaged = round(startFight(25, character({ stamina: 17 })), 0, rolls(1, 1, 6, 6));
  assert.equal(damaged.player.stamina, 15);
  assert.equal(startFight(69, damaged.player).player.stamina, 15);
  const tied = round(startFight(69, character({ skill: 9 })), 0, rolls(3, 3, 3, 3));
  assert.equal(tied.player.stamina, 24);
  assert.equal(tied.enemies[0].stamina, 10);
});

test('718: Swiftstinger consumes once and does not suppress other simultaneous attacks', () => {
  const initial = startFight(168, character({ swiftstinger: true }));
  const after = round(initial, 0, rolls(1, 1, 6, 6, 6, 6), { swiftstinger: true });
  assert.equal(after.enemies[0].stamina, 0);
  assert.equal(after.player.stamina, 18);
  assert.equal(after.player.swiftstinger, false);
  assert.deepEqual(after.events.filter(e => e.kind === 'attack').map(e => e.enemy), [1, 2]);
  assert.equal(after.outcome, null);
  assert.throws(() => round(after, 1, undefined, { swiftstinger: true }), /Invalid/);
  const single = round(startFight(69, character({ swiftstinger: true })), 0,
    () => assert.fail('Single Swiftstinger attack must not roll dice'), { swiftstinger: true });
  assert.equal(single.outcome, 'win');
});

test('718: poison and doubled axe damage apply the printed Luck values', () => {
  for (const [luck, dice, expected] of [[12, [1, 1], 1], [1, [6, 6], 4]]) {
    const hit = round(startFight(122, character({ skill: 0, luck })), 0, rolls(1, 1, 6, 6));
    assert.equal(hit.player.stamina, 24);
    assert.throws(() => round(hit, 0), /pending/);
    const after = resolveWound(hit, 'luck', rolls(...dice));
    assert.equal(after.player.stamina, 24 - expected);
    assert.equal(after.player.luck, luck - 1);
  }
  for (const [luck, expected] of [[12, 2], [1, 6]]) {
    const initial = startFight(168, character({ skill: 0, luck }));
    initial.enemies[0].stamina = initial.enemies[1].stamina = 0;
    const hit = round(initial, 2, rolls(1, 1, 6, 6));
    const after = resolveWound(hit, 'luck', rolls(1, 1));
    assert.equal(after.player.stamina, 24 - expected);
  }
});

test('718: talisman works at zero Luck and Witch curses cannot be mitigated', () => {
  const hit = round(startFight(69, character({ skill: 0, talisman: true })), 0, rolls(1, 1, 6, 6));
  const protectedFight = resolveWound(hit, 'talisman', () => assert.fail('Talisman must not roll'));
  assert.equal(protectedFight.player.stamina, 23);
  assert.equal(protectedFight.player.luck, 0);
  assert.equal(protectedFight.player.talisman, false);
  for (const [curse, key, expected] of [[1, 'stamina', 22], [3, 'skill', 4], [5, 'luck', 10]]) {
    const fight = round(startFight(254, character({ skill: 5, luck: 12 })), 0, rolls(1, 1, 6, 6, curse));
    assert.equal(fight.player[key], expected);
    assert.equal(fight.pending.length, 0);
    if (curse !== 5) assert.equal(fight.player.luck, 12);
  }
});

test('718: practice and retreat thresholds are nonfatal; Ogre injuries carry forward', () => {
  let practice = startFight(22, character({ stamina: 5 }));
  assert.equal(practice.player.stamina, 10);
  for (let i = 0; i < 3; i++) practice = round(practice, 0, rolls(6, 6, 1, 1));
  assert.equal(practice.outcome, 'win');
  assert.equal(practice.enemies[0].stamina, 4);
  assert.equal(practice.player.skill, 13);
  assert.equal(practice.player.skillInitial, 13);
  const dagger = round(startFight(22, character({ swiftstinger: true })), 0, undefined, { swiftstinger: true });
  assert.equal(dagger.enemies[0].stamina, 1);
  assert.equal(dagger.landedHits, 1);
  assert.equal(dagger.outcome, null, 'practice still requires three landed wounds, not one large hit');
  let loss = startFight(137, character({ skill: 0, stamina: 5 }));
  for (let i = 0; i < 3; i++) loss = round(loss, 0, rolls(1, 1, 6, 6));
  assert.equal(loss.outcome, 'loss');
  assert.equal(loss.player.stamina, 4);
  assert.equal(loss.player.dead, false);
  const capture = round(startFight(383, character({ skill: 0, stamina: 3 })), 0, rolls(1, 1, 6, 6));
  assert.equal(capture.destination, 256);
  assert.equal(capture.player.stamina, 2);
  assert.equal(capture.player.dead, false);
  assert.equal(capture.ogreStamina, 18);
  let grouper = startFight(119, character());
  for (let i = 0; i < 2; i++) grouper = round(grouper, 0, rolls(6, 6, 1, 1));
  assert.equal(grouper.destination, 340);
  assert.equal(grouper.enemies[0].stamina, 8);
});

test('718: Dolphin death does not kill the player or prematurely finish the Shark', () => {
  const initial = startFight(218, character(), { allyStamina: 1 });
  const deadAlly = round(initial, 0, rolls(1, 1, 1, 1, 1, 6, 6));
  assert.equal(deadAlly.ally.stamina, 0);
  assert.equal(deadAlly.player.stamina, 24);
  assert.equal(deadAlly.outcome, null);
  const alone = round(deadAlly, 0, rolls(1, 1, 6, 6));
  assert.equal(alone.player.stamina, 22);
  assert.equal(alone.ally.stamina, 0);
});

test('718: trapped-foot, mercy, no-wound escape and fatal escape decisions', () => {
  const trapped = startFight(123, character());
  assert.equal(trapped.player.stamina, 23);
  assert.throws(() => escapeFight(trapped), /unavailable/);
  const freed = freeFoot(trapped);
  assert.equal(freed.player.stamina, 21);
  assert.equal(freed.trapped, false);
  assert.equal(escapeFight(freed).destination, 222);
  const spirit = startFight(210, character());
  spirit.enemies[0].stamina = 4;
  const begging = round(spirit, 0, rolls(6, 6, 1, 1));
  assert.equal(begging.mercyPending, true);
  assert.throws(() => round(begging, 0), /pending/);
  assert.equal(decideMercy(begging, true).destination, 15);
  const killed = round(decideMercy(begging, false), 0, rolls(6, 6, 1, 1));
  assert.equal(killed.destination, 386);
  for (const section of [314, 387]) {
    const escaped = escapeFight(startFight(section, character()));
    assert.equal(escaped.player.stamina, 24);
    assert.equal(escaped.outcome, 'escape');
  }
  const dead = escapeFight(startFight(253, character()));
  assert.equal(dead.destination, 309);
  assert.equal(dead.player.dead, true);
  assert.throws(() => startFight(69, dead.player), /living/);
});

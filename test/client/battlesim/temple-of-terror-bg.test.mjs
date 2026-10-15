import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/710/definition.js';
import { newCharacter, startFight, targets, round, resolveLuck } from '../../../public/js/battlesim/books/710/combat.js';
import { eat, castSpell, testLuck } from '../../../public/js/battlesim/books/710/effects.js';
import { createState } from '../../../public/js/battlesim/books/710/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim710.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim710.js';

const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected extra die');
  return values.shift();
};
const character = changes => ({ skill: 12, skillInitial: 12, stamina: 24, staminaInitial: 24,
  luck: 0, luckInitial: 12, provisions: 10, gold: 25, attackModifier: 0, dagger: false, dead: false, ...changes });
const settle = fight => {
  while (fight.pending.length && !fight.outcome) fight = resolveLuck(fight, false);
  return fight;
};

test('710: source defaults, all roster variants and required unreadable-value override', () => {
  assert.deepEqual(newCharacter(rolls(1, 2, 3, 4)), character({skill: 7, skillInitial: 7,
    stamina: 17, staminaInitial: 17, luck: 10, luckInitial: 10}));
  assert.equal(ENCOUNTERS.length, 32);
  assert.equal(ENCOUNTERS.reduce((n, e) => n + e.enemies.length + Number(Boolean(e.ally)), 0), 50);
  assert.equal(ENCOUNTERS.find(e => e.section === 291).enemies[0].skill, 8);
  assert.deepEqual([311, 363].map(n => ENCOUNTERS.find(e => e.section === n).enemies[0].skill), [7, 8]);
  assert.throws(() => startFight(346, character()), /Invalid/);
  assert.equal(startFight(346, character(), {manualStamina: 8}).enemies[1].stamina, 8);
  assert.throws(() => startFight(346, character(), {manualStamina: 0}), /Invalid/);
  assert.equal(ENCOUNTERS.find(e => e.section === 346).win, 96);
  assert.ok(!('potion' in newCharacter()));
});

test('710: serialized player fights preserve current health and immutable inputs', () => {
  const original = startFight(7, character({skill: 7, stamina: 20}));
  const before = JSON.stringify(original), saved = JSON.parse(before);
  const after = round(saved, 0, rolls(1, 1, 6, 6));
  assert.equal(after.player.stamina, 18);
  assert.equal(JSON.stringify(original), before);
  assert.equal(saved.player.stamina, 20);
  assert.equal(startFight(45, after.player).player.stamina, 18);
});

test('710: one player attack total, target switching and both simultaneous enemies must die', () => {
  let fight = startFight(274, character());
  fight.enemies[1].stamina = 2;
  fight = round(fight, 1, rolls(6, 6, 1, 1, 1, 1));
  assert.equal(fight.enemies[0].stamina, 5);
  assert.equal(fight.enemies[1].stamina, 0);
  assert.equal(fight.outcome, null);
  assert.deepEqual(targets(fight), [0]);
  assert.deepEqual(fight.events.filter(e => e.kind === 'attack').map(e => e.playerAttack), [24, 24]);
  for (let i = 0; i < 3; i++) fight = round(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.outcome, 'win'); assert.equal(fight.destination, 310);
  const tied = round(startFight(7, character({skill: 9})), 0, rolls(3, 3, 3, 3));
  assert.equal(tied.player.stamina, 24); assert.equal(tied.enemies[0].stamina, 8);
});

test('710: Luck precedes final damage, uses current Luck and cannot revive a corpse', () => {
  let fight = startFight(7, character({luck: 6}));
  fight.enemies[0].stamina = 4;
  fight = round(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.enemies[0].stamina, 4); assert.equal(fight.outcome, null);
  fight = resolveLuck(fight, true, rolls(3, 3));
  assert.equal(fight.player.luck, 5); assert.equal(fight.enemies[0].stamina, 0); assert.equal(fight.outcome, 'win');
  let unlucky = startFight(7, character({luck: 1}));
  unlucky = round(unlucky, 0, rolls(6, 6, 1, 1));
  unlucky = resolveLuck(unlucky, true, rolls(1, 1));
  assert.equal(unlucky.enemies[0].stamina, 7); assert.equal(unlucky.player.luck, 0);
  assert.throws(() => eat(character({dead: true, stamina: 10})), /dead/);
  assert.throws(() => castSpell(character({stamina: 0}), 'water', 0), /Invalid/);
  assert.equal(castSpell(character(), 'water', 0).stamina, 24);
  assert.equal(castSpell(character({stamina: 1}), 'fire', 1).dead, true);
  assert.equal(eat(character({stamina: 23})).stamina, 24);
  assert.equal(testLuck(character({luck: 2}), rolls(1, 1)).character.luck, 1);
});

test('710: drowning, poisonous first hit, paralysis and the protected final battle', () => {
  let drowned = startFight(13, character({skill: 1}));
  drowned = round(drowned, 0, rolls(6, 6, 2, 3));
  assert.equal(drowned.outcome, 'loss'); assert.equal(drowned.reason, 'drowning');
  for (const section of [240, 377]) {
    const lost = round(startFight(section, character({skill: 0, luck: 12})), 0, rolls(1, 1, 6, 6));
    assert.equal(lost.outcome, 'loss'); assert.equal(lost.reason, 'fatalHit');
    assert.equal(lost.pending.length, 0); assert.equal(lost.player.dead, true);
    assert.throws(() => startFight(7, lost.player), /dead/);
  }
  let unprotected = startFight(103, character({skill: 0}));
  let protectedFight = startFight(380, character({skill: 0}));
  for (let i = 0; i < 3; i++) {
    unprotected = round(unprotected, 0, rolls(1, 1, 6, 6));
    protectedFight = round(protectedFight, 0, rolls(1, 1, 6, 6));
  }
  assert.equal(unprotected.reason, 'paralysis'); assert.equal(protectedFight.outcome, null);
});

test('710: fire, lightning and immunity use printed ranges; simultaneous death is loss', () => {
  const immune = round(startFight(85, character()), 0, rolls(6, 6, 1, 1, 3));
  assert.equal(immune.enemies[0].stamina, 10);
  const wounded = round(startFight(85, character()), 0, rolls(6, 6, 1, 1, 4));
  assert.equal(wounded.enemies[0].stamina, 8);
  const shocked = round(startFight(339, character({skill: 0})), 0, rolls(1, 1, 6, 6, 3));
  assert.equal(shocked.player.stamina, 20);
  const noShock = round(startFight(339, character({skill: 0})), 0, rolls(1, 1, 6, 6, 4));
  assert.equal(noShock.player.stamina, 22);
  let mutual = startFight(216, character({stamina: 1})); mutual.enemies[0].stamina = 2;
  mutual = round(mutual, 0, rolls(6, 6, 1, 1, 2));
  assert.equal(mutual.enemies[0].stamina, 0); assert.equal(mutual.outcome, 'loss');
  const noFire = round(startFight(216, character()), 0, rolls(6, 6, 1, 1, 3));
  assert.equal(noFire.player.stamina, 24);
});

test('710: eagle duels never use or overwrite player stats or Luck', () => {
  const hero = character({skill: 99, stamina: 23, luck: 12, attackModifier: 100});
  let fight = startFight(363, hero);
  fight = round(fight, 0, rolls(1, 1, 6, 6));
  assert.equal(fight.ally.stamina, 9); assert.equal(fight.pending.length, 0);
  assert.deepEqual(fight.player, hero);
  assert.equal(fight.events[0].playerAttack, 8);
  assert.equal(settle(fight).ally.stamina, 9);
});

test('710: state is transactional, run scoped, bounded and records outcomes once', () => {
  let book = 710, run = {sim210: {saved: true}}, saves = 0;
  const state = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  state.ensure(); state.change(d => {d.fight = {name: 'Pirate', outcome: 'win'};});
  state.change(() => {}); assert.equal(state.read().history.length, 1);
  state.change(d => {d.fight = {name: 'Cancelled', outcome: 'cancelled'};});
  assert.equal(state.read().history.length, 1);
  const oldRun = run, before = JSON.stringify(run);
  assert.equal(state.change(() => {run = {};}), false);
  assert.equal(JSON.stringify(oldRun), before); assert.deepEqual(oldRun.sim210, {saved: true});
  book = 210; assert.equal(state.change(() => {}), false); assert.equal(saves, 4);
});

test('710: both languages cover every encounter, enemy and spell', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const encounter of ENCOUNTERS) {
    assert.ok(en['battlesim710.encounter.' + encounter.section]);
    for (const enemy of [...encounter.enemies, ...(encounter.ally ? [encounter.ally] : [])]) {
      assert.ok(en['battlesim710.enemy.' + enemy.key]);
    }
  }
  for (const key of Object.keys(en)) {
    assert.ok(bg[key].trim());
    assert.deepEqual(en[key].match(/\{\w+\}/g), bg[key].match(/\{\w+\}/g), key);
  }
});

test('710: actual backend rewards wins and losses once, never abandoned fights', () => {
  const events = [], db = {exec() {}, transaction: fn => () => fn(), prepare: () => ({run() {}, all: () => [],
    get: () => ({id: 710, total_sections: 400, is_container: 0})})};
  const context = {module: {exports: {}}, events, require(name) {
    if (name === './connection') return {db};
    if (name === './auth') return {generateToken: () => 'test-only'};
    if (name === '../impersonation-context') return {isImpersonatingContext: () => false};
    if (name === '../clean-run') return {isCleanRun: () => false};
    throw Error('Unexpected dependency: ' + name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8') + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim710').length, 1);
  const state = history => ({graph: {}, playthroughs: [{startedAt: 123, path: [1], sim710: {history}}]});
  const after = state(['win', 'loss', 'cancelled'].map((outcome, i) => ({outcome, ts: i + 10})));
  context.module.exports.processStateXp(1, 710, state([]), after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim710:10'], [1, 'battlesim_loss', 'sim710:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 710, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});

import { loadFixtureRoster } from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ENCOUNTERS, WHEEL_PAGE_COUNT, WHEEL_PRIZES } from '../../../public/js/battlesim/books/722/definition.js';
import { newCharacter, validateCharacter, startFight, targets, round, resolveWound, chooseTarget, chooseGlove,
  decideWraithLuck, throwPebble, useDart, bindEnemy, recoverChain, chooseDestination, castLimbSpell }
  from '../../../public/js/battlesim/books/722/combat.js';
import { eat, nextDay, useLibra, healingSpell, herbs, scaldedMeal, prediction, wheel, placeBet, settleBet, testLuck }
  from '../../../public/js/battlesim/books/722/effects.js';
import { createState } from '../../../public/js/battlesim/books/722/state.js';
import english from '../../../public/js/i18n/en/battlesim/battlesim722.js';
import bulgarian from '../../../public/js/i18n/bg/battlesim/battlesim722.js';

await loadFixtureRoster(722);

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die'); return values.shift(); };
const hero = changes => ({ ...newCharacter('wizard', () => 6), luck: 0, ...changes });

test('722: Wheel follows all verified original pages, charging book gold once and stopping after a win', () => {
  const expected = {39:5,47:10,57:5,67:20,87:5,95:5,101:20,119:5,129:10,145:20,153:5,173:5,181:20,187:10,199:5};
  assert.equal(WHEEL_PAGE_COUNT, 212);
  assert.deepEqual(WHEEL_PRIZES, expected);
  for (let page = 1; page <= 212; page++) {
    const original = hero(), snapshot = structuredClone(original);
    const result = wheel(original, sides => { assert.equal(sides, 212); return page; });
    const prize = expected[page] ?? 0;
    assert.deepEqual(original, snapshot);
    assert.deepEqual(result.character, {...original, gold: 19 + prize, wheelWon: prize > 0});
    assert.equal(result.page, page);
    assert.equal(result.prize, prize);
    assert.equal(result.destination, prize ? 39 : null);
    if (prize) assert.throws(() => wheel(result.character, () => 39), /unavailable/);
  }
  for (const page of [0, 213, 1.5, NaN]) assert.throws(() => wheel(hero(), () => page), /Invalid/);
  assert.throws(() => wheel(hero({gold:0}), () => 39), /unavailable/);
  assert.throws(() => wheel(hero({dead:true,stamina:0}), () => 39), /living/);
  const lastGold = wheel(hero({gold:1}), () => 1);
  assert.equal(lastGold.character.gold, 0);
  assert.throws(() => wheel(lastGold.character), /unavailable/);
});

test('722: actual backend rewards only fresh player wins/losses, never spectator or redirect outcomes', () => {
  const events = [], db = {exec() {}, transaction: fn => () => fn(), prepare: () => ({run() {}, all: () => [],
    get: () => ({id: 722, total_sections: 511, is_container: 0})})};
  const context = {module: {exports: {}}, events, require(name) {
    if (name === './connection') return {db};
    if (name === './diamonds') return {diamondInfoForUser: () => ({})};
    if (name === './rubies') return {rubyInfoForUser: () => ({}), createRubyCompletionChecker: () => () => 0};
    if (name === './heartbeat-coins') return {advanceHeartbeatCoins: () => 0};
    if (name === './job-xp') return {getJobTitle: () => 'test'};
    if (name === './auth') return {generateToken: () => 'test-only'};
    if (name === '../impersonation-context') return {isImpersonatingContext: () => false};
    if (name === '../clean-run') return {isCleanRun: () => false};
    throw Error('Unexpected dependency: ' + name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8')
    + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim722').length, 1);
  const state = history => ({graph: {}, playthroughs: [{startedAt: 123, path: [1], sim722: {history}}]});
  const after = state(['win', 'loss', 'cancelled', 'resolved', 'redirect', 'escape'].map((outcome, i) => ({outcome, ts: i + 10})));
  context.module.exports.processStateXp(1, 722, state([]), after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim722:10'], [1, 'battlesim_loss', 'sim722:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 722, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});

test('722: bilingual keys, interpolation and every encounter actor are covered', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(bulgarian).sort());
  for (const key of Object.keys(english)) {
    assert.ok(english[key].trim() && bulgarian[key].trim(), key);
    const placeholders = value => [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(english[key]), placeholders(bulgarian[key]), key);
  }
  for (const encounter of ENCOUNTERS) {
    assert.ok(english['battlesim722.encounter.' + encounter.section]);
    for (const actor of [...encounter.enemies, encounter.ally, encounter.goblin, encounter.reinforcement].filter(Boolean)) {
      assert.ok(english['battlesim722.enemy.' + actor.key], actor.key);
    }
  }
});

test('722: source character defaults, validation and isolated encounter creation', () => {
  const warrior = newCharacter('warrior', rolls(1, 2, 3, 4));
  const wizard = newCharacter('wizard', rolls(1, 2, 3, 4));
  assert.deepEqual([warrior.skill, warrior.stamina, warrior.luck, warrior.gold, warrior.provisions], [7, 17, 10, 20, 2]);
  assert.equal(wizard.skill, 5);
  assert.equal(ENCOUNTERS.length, 46);
  assert.equal(new Set(ENCOUNTERS.map(item => item.section)).size, 46);
  const original = hero(), fight = startFight(77, original);
  fight.player.gold = 1;
  assert.equal(original.gold, 20);
  assert.throws(() => startFight(393, warrior), /wizard/);
  assert.throws(() => startFight(722, original), /encounter/);
  assert.throws(() => validateCharacter({ ...original, stamina: 25 }), /initial/);
});

test('722: ordinary damage, ties, and the Chainmaker low-STAMINA exception', () => {
  const original = startFight(77, hero());
  const won = round(original, 0, rolls(6, 6, 1, 1));
  assert.equal(won.enemies[0].stamina, 9);
  assert.equal(original.enemies[0].stamina, 11);
  const tied = round(startFight(77, hero({ skill: 7 })), 0, () => 1);
  assert.equal(tied.player.stamina, 24);
  const hurt = round(startFight(119, hero({ skill: 8, stamina: 5 })), 0, () => 1);
  assert.equal(hurt.player.stamina, 3);
  const safe = round(startFight(119, hero({ skill: 8, stamina: 6 })), 0, () => 1);
  assert.equal(safe.player.stamina, 6);
});

test('722: the assassin opening arrow can kill or injure SKILL without resetting the character', () => {
  const dead = startFight(13, hero(), {}, () => 1);
  assert.equal(dead.outcome, 'loss'); assert.equal(dead.player.dead, true);
  for (const [value, stamina, skill] of [[2, 19, 10], [3, 21, 10], [4, 22, 10], [5, 23, 8], [6, 24, 10]]) {
    const fight = startFight(13, hero(), {}, () => value);
    assert.deepEqual([fight.player.stamina, fight.player.skill], [stamina, skill]);
    assert.equal(fight.player.skillInitial, 10);
  }
});

test('722: the brush cannot hurt the player and the mantis grab is strictly below SKILL', () => {
  let brush = startFight(44, hero({ skill: 0 }));
  for (let count = 0; count < 5; count++) brush = round(brush, 0, rolls(1, 1, 6, 6));
  assert.deepEqual([brush.player.stamina, brush.outcome, brush.destination], [24, 'redirect', 67]);
  const grabbed = round(startFight(55, hero()), 0, rolls(1, 1));
  assert.equal(grabbed.reason, 'mantisGrab'); assert.equal(grabbed.player.stamina, 0);
  const escaped = round(startFight(76, hero()), 0, rolls(3, 3, 6, 6, 1, 1));
  assert.equal(escaped.enemies[0].stamina, 3);
  assert.equal(escaped.player.stamina, 24);
});

test('722: smoking affects the player only if they smoked, with self-injury on one', () => {
  const sober = round(startFight(58, hero()), 0, rolls(6, 6, 1, 1));
  assert.equal(sober.enemies[0].stamina, 3);
  const intoxicated = round(startFight(58, hero({ intoxicated: true })), 0, rolls(6, 6, 1, 1, 1));
  assert.equal(intoxicated.player.stamina, 22);
  assert.equal(intoxicated.enemies[0].stamina, 5);
});

test('722: dead corpse parts remain on the random-target die and the original corpse splits', () => {
  const first = round(startFight(11, hero()), 0, rolls(6, 6, 1, ...Array(12).fill(1)));
  assert.equal(first.enemies[0].stamina, 0);
  const second = round(first, 1, rolls(6, 6, 1, ...Array(10).fill(1)));
  assert.equal(second.enemies.filter(enemy => enemy.stamina === 0).length, 1);
  assert.ok(second.events.some(event => event.kind === 'disabledTarget'));
  const split = round(startFight(256, hero()), 0, rolls(6, 6, 1, 1));
  assert.equal(split.config.mode, 'limbs'); assert.equal(split.enemies.length, 6);
  assert.equal(split.noticeDestination, 11); assert.equal(split.outcome, null);
  const illusions = round(startFight(435, hero({ skill: 0 })), 0, () => 1);
  assert.equal(illusions.events.filter(event => event.kind === 'damage' && event.target.team === 'player').length, 5);
});

test('722: explosive pebbles hit on equal SKILL, darts miss on equal SKILL', () => {
  const stone = throwPebble(startFight(441, hero({ pebbles: 1 })), 0, rolls(5, 5));
  assert.equal(stone.enemies[0].stamina, 0); assert.equal(stone.player.pebbles, 0);
  const dart = useDart(startFight(77, hero({ explosiveDarts: 2 })), 0, rolls(5, 5));
  assert.equal(dart.enemies[0].stamina, 11); assert.equal(dart.player.explosiveDarts, 1);
  assert.throws(() => throwPebble(round(stone, 1, () => 6), 1, () => 1), /pebble/);
});

test('722: duplicates copy pre-spell values and temporary weakening does not change saved player stats', () => {
  const original = hero({ stamina: 19, nextFightSkill: 1 });
  const fight = startFight(385, original);
  assert.deepEqual([fight.enemies[0].skill, fight.enemies[0].stamina, fight.player.stamina], [8, 19, 17]);
  assert.equal(fight.player.nextFightSkill, 0); assert.equal(original.nextFightSkill, 1);
  const failed = startFight(508, hero());
  assert.deepEqual([failed.enemies[0].stamina, failed.player.stamina], [24, 21]);
});

test('722: silver-arrow accuracy, opening shot and exhaustion preserve the final lethal hit', () => {
  const first = startFight(147, hero({ silverArrows: 10 }), {}, rolls(5, 5));
  assert.deepEqual([first.enemies[0].stamina, first.player.silverArrows], [6, 9]);
  const next = round(first, 0, rolls(6, 6, 1, 1, 5, 5));
  assert.deepEqual([next.enemies[0].stamina, next.player.silverArrows], [4, 8]);
  const won = startFight(147, hero({ silverArrows: 1 }), { enemyStamina: [2] }, rolls(5, 5));
  assert.equal(won.outcome, 'win'); assert.equal(won.destination, 54); assert.equal(won.player.silverArrows, 0);
  const dead = startFight(147, hero({ silverArrows: 1, skill: 1 }), {}, rolls(6, 6));
  assert.equal(dead.reason, 'arrowsExhausted'); assert.equal(dead.player.dead, true);
  const bow = startFight(147, hero({ weapon: 'broadsword', skill: 9, silverArrows: 10, explosiveDarts: 1 }), {}, rolls(6, 6));
  const dart = useDart(bow, 0, rolls(1, 1));
  assert.equal(dart.enemies[0].stamina, 8);
  const tied = round(dart, 0, rolls(3, 3, 3, 3));
  assert.equal(tied.player.stamina, 24);
});

test('722: ordinary weapons cannot kill a Deathwraith and the winning-round escape costs Luck', () => {
  const first = round(startFight(151, hero({ cakeHalves: 1 })), 0, rolls(6, 6, 1, 1));
  assert.equal(first.enemies[0].stamina, 8); assert.equal(first.noticeDestination, 189);
  const second = round(first, 0, rolls(6, 6, 1, 1));
  assert.equal(second.decision.kind, 'wraithLuck');
  const escaped = decideWraithLuck(second, 'cake');
  assert.deepEqual([escaped.outcome, escaped.destination, escaped.player.cakeHalves], ['escape', 38, 0]);
  assert.equal(escaped.enemies[0].stamina, 8);
});

test('722: shields consume a coin, missing equipment wounds and wax doubles damage after Luck', () => {
  const shield = startFight(450, hero());
  assert.equal(shield.player.gold, 19); assert.equal(shield.shieldActive, true);
  const missing = startFight(450, hero({ gold: 0 }));
  assert.equal(missing.player.stamina, 21); assert.equal(missing.shieldActive, false);
  const wax = round(startFight(370, hero({ wax: true, luck: 12 })), 0, rolls(6, 6, 1, 1));
  assert.equal(wax.pending.length, 1);
  const lucky = resolveWound(wax, 'luck', rolls(1, 1));
  assert.equal(lucky.events.find(event => event.kind === 'damage').damage, 8);
  assert.equal(lucky.player.wax, true); assert.equal(lucky.outcome, 'win');
  const flayer = round(startFight(243, hero({ skill: 0 })), 0, rolls(1, 1, 6, 6));
  assert.equal(flayer.player.stamina, 21); assert.equal(flayer.noticeDestination, 114);
});

test('722: the two street attackers allow post-roll target choice and surrender individually', () => {
  const both = round(startFight(311, hero()), 0, rolls(6, 6, 1, 1, 1, 1));
  assert.equal(both.decision.kind, 'target');
  const hit = chooseTarget(both, 1);
  assert.equal(hit.enemies[1].stamina, 3); assert.equal(hit.enemies[0].stamina, 6);
  const again = chooseTarget(round(hit, 0, rolls(6, 6, 1, 1, 1, 1)), 1);
  assert.equal(again.enemies[1].stamina, 2); assert.deepEqual(targets(again), [0]);
  assert.equal(again.outcome, null);
  const one = round(startFight(311, hero({ skill: 6 })), 0, rolls(1, 1, 6, 6, 1, 1));
  assert.equal(one.enemies[1].stamina, 3); assert.equal(one.player.stamina, 22);
});

test('722: harpies fight the player and beggar, while summoned goblins are not enemy targets', () => {
  const fight = round(startFight(118, hero()), 0, rolls(6, 6, 1, 1, 1, 1, 1, 1));
  assert.deepEqual([fight.enemies[0].stamina, fight.allies[0].stamina, fight.player.stamina], [4, 6, 24]);
  const goblins = round(startFight(365, hero({ goblinTeeth: 2 }), { summonCount: 2 }), 0,
    rolls(6, 6, 1, 1, 1, 1, 1, 1, 6, 6, 6, 6), { goblinTargets: [0, 1] });
  assert.deepEqual(goblins.enemies.map(enemy => enemy.stamina), [2, 4]);
  assert.deepEqual(goblins.allies.slice(1).map(ally => ally.stamina), [5, 5]);
  assert.equal(goblins.player.stamina, 22); assert.equal(goblins.player.goblinTeeth, 0);
  const confused = startFight(473, hero({ cakeHalves: 1 }), { confuse: 'cake' }, () => 2);
  assert.equal(confused.enemies[0].disabled, true); assert.deepEqual(targets(confused), [1]);
});

test('722: a dwarf joins the alliance after two unresolved rounds and must be defeated', () => {
  let fight = startFight(321, hero({ skill: 0 }), { ally: 'sprite' });
  fight = round(fight, 0, () => 1);
  assert.equal(fight.enemies.length, 1);
  fight = round(fight, 0, () => 1);
  assert.equal(fight.enemies.length, 2); assert.deepEqual(targets(fight), [1]);
  assert.equal(fight.enemies[1].key, 'dwarf');
  fight.enemies[0].stamina = 0; fight.enemies[1].stamina = 2; fight.player.skill = 10;
  const won = round(fight, 1, rolls(6, 6, 1, 1));
  assert.equal(won.outcome, 'win'); assert.equal(won.destination, 293);
});

test('722: a summoned giant uses its own life and leaves the statue wounded when it dies', () => {
  const fight = startFight(411, hero({ giantTeeth: 1 }));
  fight.allies[0].stamina = 1;
  const lost = round(fight, 0, rolls(1, 1, 6, 6));
  assert.equal(lost.config.mode, 'statue-after-giant'); assert.equal(lost.giantActive, false);
  assert.equal(lost.player.stamina, 23); assert.equal(lost.enemies[0].stamina, 15);
  const strike = round(lost, 0, rolls(6, 6, 1, 1));
  assert.equal(strike.outcome, 'redirect'); assert.equal(strike.destination, 326);
  const won = round(startFight(411, hero({ giantTeeth: 1 }), { enemyStamina: [2] }), 0, rolls(6, 6, 1, 1));
  assert.equal(won.outcome, 'win'); assert.equal(chooseDestination(won, 56).destination, 56);
  assert.equal(won.player.stamina, 23);
});

test('722: champion blessing grants the prize once and giant defeat does not kill the player', () => {
  const blessed = round(startFight(323, hero({ libraChampion: true })), 0, rolls(6, 6, 1, 1));
  assert.equal(blessed.outcome, 'win'); assert.equal(blessed.player.gold, 35);
  assert.equal(blessed.player.libraChampion, false);
  const giant = startFight(451, hero({ giantTeeth: 1 }), { champion: 'barbarian' });
  giant.allies[0].stamina = 1;
  const lost = round(giant, 0, rolls(1, 1, 6, 6));
  assert.equal(lost.outcome, 'loss'); assert.equal(lost.player.dead, false); assert.equal(lost.player.stamina, 23);
});

test('722: spectator magic uses the printed fighter dice and does not wound the player', () => {
  const fight = startFight(507, hero(), {}, () => 6);
  assert.deepEqual(fight.clumsyActors, [0, 1]);
  const next = round(fight, 0, rolls(1, 6));
  assert.equal(next.enemies[0].stamina, 6); assert.equal(next.player.stamina, 20);
  const protectedFight = startFight(416, hero({ sunJewel: true }), { favoured: 0 });
  const protectedRound = round(protectedFight, 0, rolls(1, 1, 6, 6));
  assert.equal(protectedRound.enemies[0].stamina, 7);
  const exhausted = structuredClone(protectedFight); exhausted.rounds = 3;
  assert.equal(round(exhausted, 0, rolls(1, 1, 6, 6)).enemies[0].stamina, 6);
});

test('722: the helpful glove exposes a one-die choice only below five STAMINA', () => {
  const first = round(startFight(77, hero({ stamina: 4, helpfulGlove: true })), 0, rolls(1, 1));
  assert.equal(first.decision.kind, 'glove'); assert.equal(first.rounds, 1);
  const chosen = chooseGlove(first, 0, rolls(6, 1, 1));
  assert.equal(chosen.enemies[0].stamina, 9); assert.equal(chosen.rounds, 1);
  assert.throws(() => chooseGlove(chosen, 0), /decision/);
  const five = round(startFight(77, hero({ stamina: 5, helpfulGlove: true })), 0, rolls(6, 6, 1, 1));
  assert.equal(five.decision, null);
});

test('722: charms, cake and chain recovery have separate costs and recovery cannot repeat', () => {
  const failed = testLuck(hero({ luck: 3, luckCharm: true }), rolls(6, 6));
  assert.equal(failed.lucky, false); assert.equal(failed.character.luck, 3);
  const shifted = testLuck(hero({ luck: 3, luckRollCharm: true }), rolls(2, 2));
  assert.equal(shifted.lucky, true); assert.equal(shifted.character.luck, 2);
  const cake = testLuck(hero({ cakeHalves: 1 }), () => assert.fail('Cake must not roll'), { cake: true });
  assert.equal(cake.character.luck, 0); assert.equal(cake.character.cakeHalves, 0);
  const bound = bindEnemy(startFight(77, hero({ magicChain: true, luck: 3 }), { enemyStamina: [3] }), 0);
  assert.equal(bound.outcome, 'win'); assert.equal(bound.player.magicChain, false);
  const recovered = recoverChain(bound, rolls(1, 1, 1, 1));
  assert.equal(recovered.player.magicChain, true); assert.equal(recovered.player.luck, 1);
  assert.throws(() => recoverChain(recovered), /recovery/);
  const lost = recoverChain(bound, rolls(6, 6, 1, 1));
  assert.equal(lost.player.magicChain, false); assert.equal(lost.player.luck, 1);
});

test('722: meals, shared food, daily restrictions, herbs and Libra preserve equipment', () => {
  const original = hero({ stamina: 10, provisions: 3, gold: 17, wax: true });
  const first = eat(original), second = eat(first);
  assert.deepEqual([first.stamina, second.stamina, second.provisions], [12, 13, 1]);
  assert.equal(eat(original, { shared: true }).stamina, 12);
  assert.equal(eat({ ...original, provisions: 1 }, { shared: true }).stamina, 11);
  assert.throws(() => eat(scaldedMeal(original)), /Eating/);
  assert.equal(eat(nextDay(scaldedMeal(original))).stamina, 11);
  const confident = herbs(original, () => 2);
  assert.equal(confident.character.nextFightSkill, 1); assert.equal(confident.character.intoxicated, true);
  const restored = useLibra(original);
  assert.equal(restored.stamina, 24); assert.equal(restored.wax, true); assert.equal(restored.gold, 17);
  assert.throws(() => useLibra(restored), /Libra/);
  assert.equal(healingSpell({ ...original, medicines: 1 }).stamina, 24);
  assert.equal(healingSpell({ ...original, stamina: 1, medicines: 1 }).dead, true);
  assert.equal(original.stamina, 10);
});

test('722: gambling uses in-book gold, one optional reroll and source wager payouts', () => {
  const game = prediction(hero({ luck: 12 }), 3, 2, rolls(1, 1, 2, 3));
  assert.equal(game.rerolled, true); assert.equal(game.won, true); assert.equal(game.character.gold, 29);
  const fifth = prediction(hero({ predictionBets: 4 }), 3, null, () => 1);
  assert.equal(fifth.destination, 39);
  assert.throws(() => prediction(fifth.character, 3, null, () => 3), /unavailable/);
  const bet = placeBet(hero(), 'barbarian', 2), paid = settleBet(bet.character, bet.ticket, 'barbarian');
  assert.equal(paid.character.gold, 26);
  assert.throws(() => settleBet(paid.character, paid.ticket, 'barbarian'), /unsettled/);
  const ogre = placeBet(hero(), 'ogre', 3);
  assert.equal(settleBet(ogre.character, ogre.ticket, 'ogre').character.gold, 21);
});

test('722: state is run-scoped, records real outcomes once and retains lifetime history', () => {
  let run = {}, currentBookId = 722, saves = 0;
  const store = createState(() => ({ currentBookId, currentPlaythrough: () => run, saveState: () => saves++ }));
  store.ensure();
  store.change(next => { next.history = Array.from({ length: 45 }, (_, ts) => ({ outcome: 'win', ts })); });
  store.change(next => { next.fight = round(startFight(77, hero(), { enemyStamina: [2] }), 0, rolls(6, 6, 1, 1)); });
  assert.equal(store.read().history.length, 46);
  store.change(() => {}); assert.equal(store.read().history.length, 46);
  store.change(next => { next.fight = round(startFight(234, hero(), { enemyStamina: [8, 2] }), 0, rolls(6, 6, 1, 1)); });
  assert.equal(store.read().fight.outcome, 'resolved'); assert.equal(store.read().history.length, 46);
  const old = run, prior = saves;
  assert.equal(store.change(() => { run = {}; }), false); assert.equal(saves, prior);
  assert.equal(old.sim722.history.length, 46);
  currentBookId = 273;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => assert.fail('Wrong book')), false);
});

test('722: every declared encounter supports valid initialization and combat decisions', () => {
  for (const spec of ENCOUNTERS) {
    let fight = startFight(spec.section, hero({ giantTeeth: 1, goblinTeeth: 2, silverArrows: 10,
      pebbles: 3, wax: true, sunJewel: true, boneBracelet: true }), {}, () => 6);
    for (let turn = 0; turn < 3 && !fight.outcome; turn++) {
      while (fight.pending.length) fight = resolveWound(fight, 'skip');
      if (fight.outcome) break;
      if (fight.decision?.kind === 'target') fight = chooseTarget(fight, fight.decision.targets[0]);
      else if (fight.decision?.kind === 'wraithLuck') fight = decideWraithLuck(fight, 'skip');
      else if (fight.decision?.kind === 'glove') fight = chooseGlove(fight, null, () => 6);
      else fight = round(fight, targets(fight)[0], () => 6);
      validateCharacter(fight.player);
    }
    assert.equal(fight.rulesRevision, 1, String(spec.section));
  }
});

test('722: returning through corpse spells preserves disabled parts and never restarts the fight', () => {
  const original = round(startFight(11, hero({ pebbles: 1 })), 0, rolls(6, 6, 1, ...Array(12).fill(1)));
  const wall = castLimbSpell(original, 373);
  assert.equal(wall.rounds, 1); assert.equal(wall.player.stamina, 20);
  assert.equal(wall.enemies[0].stamina, 0); assert.equal(original.player.stamina, 24);
  const failed = castLimbSpell(wall, 357);
  assert.equal(failed.player.stamina, 16); assert.equal(failed.enemies[0].stamina, 0);
  const pebbles = throwPebble(castLimbSpell(failed, 441), 1, rolls(1, 1));
  assert.equal(pebbles.enemies[0].stamina, 0); assert.equal(pebbles.enemies[1].stamina, 0);
  assert.equal(pebbles.rounds, 1); assert.equal(pebbles.player.pebbles, 0);
  const illusion = castLimbSpell(pebbles, 435);
  const shield = castLimbSpell(illusion, 450);
  assert.equal(shield.config.headIllusions, true); assert.equal(shield.shieldActive, true);
  assert.equal(shield.player.gold, 19); assert.equal(shield.rounds, 1);
});

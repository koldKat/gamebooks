import { loadFixtureRoster } from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../../../public/js/battlesim/engines/sorcery/core.js';
import { CHARACTER_DEFAULTS, ENCOUNTERS, SPELL_ENCOUNTERS, SUMMONED_ALLIES, encounterFor } from '../../../public/js/battlesim/books/724/definition.js';
import * as effects from '../../../public/js/battlesim/books/724/effects.js';
import * as combat from '../../../public/js/battlesim/books/724/combat.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import en from '../../../public/js/i18n/en/battlesim/battlesim724.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim724.js';
import { SPELL_LABELS } from '../../../public/js/battlesim/books/724/definition.js';

await loadFixtureRoster(724);

const hero = changes => ({ ...newCharacter('wizard', () => 6), ...CHARACTER_DEFAULTS, ...changes });
const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die'); return values.shift(); };
const settle = (fight, roll = () => 1) => {
  while (fight.pending.length) fight = combat.resolveHit(fight, false, roll);
  return fight;
};
const winRound = (fight, target = null) => settle(combat.round(fight, target, rolls(6, 6, ...Array(20).fill(1))));

test('724: backend awards fresh wins/losses once, never handoffs or cancellations', () => {
  const events = [], db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({ run() {}, all: () => [], get: () => ({ id: 724, total_sections: 800, is_container: 0 }) }) };
  const scope = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './diamonds') return {diamondInfoForUser: () => ({})};
    if (name === './rubies') return {rubyInfoForUser: () => ({}), createRubyCompletionChecker: () => () => 0};
    if (name === './heartbeat-coins') return {advanceHeartbeatCoins: () => 0};
    if (name === './job-xp') return {getJobTitle: () => 'test'};
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    throw Error(name);
  } };
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8') + '\nawardXp=(...args)=>events.push(args);', scope);
  assert.equal(scope.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim724').length, 1);
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim724: { history } }] });
  const after = state(['win', 'loss', 'cancelled', 'continue'].map((outcome, index) => ({ outcome, ts: index + 10 })));
  scope.module.exports.processStateXp(1, 724, state([]), after);
  assert.deepEqual(events.filter(row => row[1].startsWith('battlesim_')).map(row => [...row]), [[1, 'battlesim_win', 'sim724:10'], [1, 'battlesim_loss', 'sim724:11']]);
  events.length = 0; scope.module.exports.processStateXp(1, 724, after, after);
  assert.ok(events.every(row => !row[1].startsWith('battlesim_')));
});

test('724: both locales cover every encounter, spell and opponent with matching placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual((en[key].match(/\{\w+\}/g) ?? []).sort(), (bg[key].match(/\{\w+\}/g) ?? []).sort(), key);
    assert.ok(en[key].trim() && bg[key].trim(), key);
  }
  for (const entry of [...ENCOUNTERS, ...SPELL_ENCOUNTERS]) {
    const config = encounterFor(entry.section);
    for (const labels of [en, bg]) {
      assert.ok(labels['battlesim724.encounter.' + config.key]);
      assert.ok(labels['battlesim724.note.' + config.mode]);
      for (const enemy of config.enemies) assert.ok(labels['battlesim724.enemy.' + enemy.key]);
      if (config.spell) assert.ok(labels['battlesim724.spell.' + SPELL_LABELS[entry.section]], String(entry.section));
    }
  }
});

test('724: encounter data keeps source-specific rules and no invented WOK guard fight', () => {
  const entries = [...ENCOUNTERS, ...SPELL_ENCOUNTERS];
  assert.equal(entries.length, new Set(entries.map(entry => entry.section)).size);
  assert.equal(encounterFor(40).activeLimit, 2);
  assert.equal(encounterFor(133).mode, 'sequential');
  assert.deepEqual(encounterFor(391).carryEnemyIndices, [2]);
  assert.equal(encounterFor(563).carryPlayerOnly, true);
  assert.equal(encounterFor(715).enemies[0].skill + encounterFor(715).enemySkillModifier, 4);
  assert.equal(encounterFor(627).success.playerAttackModifier, 3);
  assert.equal(encounterFor(787).success.mindRead, true);
  assert.throws(() => encounterFor(650), RangeError);
});

test('724: recovery respects meal order, starvation, fever and one-use outside-only Libra', () => {
  const original = hero({ stamina: 10, fruits: 1, medicines: 1 });
  assert.equal(effects.eat(original).stamina, 12);
  assert.equal(effects.eat({ ...original, mealsToday: 1 }).stamina, 11);
  assert.equal(effects.nextDay(original).stamina, 9);
  assert.equal(effects.nextDay({ ...original, mealsToday: 1 }).stamina, 12);
  assert.equal(effects.fruit(original).stamina, 14);
  assert.throws(() => effects.fruit(original, true), RangeError);
  assert.equal(effects.healingSpell(original).stamina, 24);
  assert.equal(effects.healingSpell({ ...original, stamina: 1 }).dead, true);
  assert.equal(effects.eat({ ...original, afflictions: ['fever'] }).stamina, 10);
  assert.throws(() => effects.useLibra({ ...original, insideFortress: true }), RangeError);
  const restored = effects.useLibra(original);
  assert.equal(restored.stamina, 24);
  assert.throws(() => effects.useLibra(restored), RangeError);
  assert.deepEqual(effects.useLibra({ ...original, afflictions: ['fever'] }, 'cure').afflictions, []);
  assert.equal(original.stamina, 10);
  assert.equal(original.fruits, 1);
});

test('724: the two doors have distinct boundaries and every attempt costs stamina', () => {
  const character = hero({ skill: 8 });
  assert.equal(effects.doorCheck(character, 53, rolls(4, 4)).destination, 112);
  const strict = effects.doorCheck(character, 454, rolls(4, 4));
  assert.equal(strict.success, false);
  assert.equal(strict.destination, 454);
  assert.equal(strict.character.stamina, 23);
  assert.equal(effects.doorCheck(character, 454, rolls(3, 4)).destination, 102);
  assert.equal(effects.doorCheck({ ...character, stamina: 1 }, 53, rolls(1, 1)).destination, null);
  assert.equal(effects.spearEscape(character, rolls(1, 1, 6, 5)).fatal, true);
  const wounded = effects.spearEscape(character, rolls(1, 2, 2, 3));
  assert.equal(wounded.character.stamina, 18);
  assert.equal(wounded.destination, 441);
});

test('724: all mutation outcomes preserve the printed initial/current-stat distinctions', () => {
  const character = hero();
  assert.equal(effects.mutation(character, rolls(1, 1)).character.dead, true);
  assert.equal(effects.mutation(character, rolls(1, 2)).character.twoWeapons, true);
  const heavy = effects.mutation(character, rolls(1, 3)).character;
  assert.equal(heavy.skillInitial, 8);
  assert.equal(heavy.stamina, 21);
  assert.equal(effects.mutation(character, rolls(1, 4)).character.forgottenMagic, true);
  assert.equal(effects.mutation(character, rolls(1, 5)).character.reptileFear, true);
  assert.deepEqual(effects.mutation(character, rolls(1, 6)).character, character);
  const nose = effects.mutation(character, rolls(2, 6)).character;
  assert.equal(nose.stamina, 22);
  assert.equal(nose.staminaInitial, 22);
  assert.equal(effects.mutation({ ...character, stamina: 10 }, rolls(2, 6)).character.stamina, 8);
  assert.equal(effects.mutation(character, rolls(3, 6)).character.skillInitial, 7);
  assert.equal(effects.mutation(character, rolls(4, 6)).character.disguised, true);
  assert.equal(effects.mutation(character, rolls(5, 6)).character.horn, true);
  assert.equal(effects.mutation(character, rolls(6, 6)).character.dead, true);
  assert.equal(character.stamina, 24);
});

test('724: fever and time travel follow their printed tables without changing books', () => {
  const character = hero({ afflictions: ['fever'] });
  assert.equal(effects.feverChoice(character, () => 1).choiceIndex, 0);
  assert.equal(effects.feverChoice(character, () => 5).choiceIndex, 4);
  assert.equal(effects.feverChoice(character, () => 6).choiceIndex, null);
  assert.equal(effects.timeTravel(rolls(1, 1)).destination, 447);
  assert.equal(effects.timeTravel(rolls(2, 6)).destination, 631);
  assert.equal(effects.timeTravel(rolls(6, 6)).destination, 420);
});

test('724: darts use manual signed board hits, one shared score and exactly ten', () => {
  const original = hero({ gold: 1 });
  let game = effects.startDarts(original, true);
  assert.equal(game.character.gold, 1);
  assert.equal(game.character.dartsGames, 1);
  game = effects.dart(game, 6);
  game = effects.dart(game, 5);
  assert.equal(game.total, 11);
  assert.equal(game.winner, null);
  game = effects.dart(game, -3);
  game = effects.dart(game, 0);
  game = effects.dart(game, 2);
  assert.equal(game.winner, 0);
  assert.equal(game.character.gold, 5);
  assert.throws(() => effects.dart(game, 1), RangeError);
  const second = effects.startDarts(game.character);
  assert.equal(second.character.gold, 3);
  const lost = effects.dart(effects.dart(second, -4), -6);
  assert.equal(lost.winner, 1);
  assert.equal(lost.character.gold, 3);
  assert.throws(() => effects.startDarts(lost.character), RangeError);
  assert.equal(original.gold, 1);
  assert.equal(original.dartsGames, 0);
});

test('724: every declared encounter can initialize, with both component branches and explicit carried wounds', () => {
  const character = hero({ gold: 20, goblinTeeth: 3, giantTeeth: 3, pebbles: 5, medicines: 3 });
  const entries = [...ENCOUNTERS, ...SPELL_ENCOUNTERS];
  const fields = { coin: 'gold', medicine: 'medicines', giantTooth: 'giantTeeth' };
  for (const entry of entries) {
    const config = encounterFor(entry.section), field = fields[config.component] ?? config.component;
    if (field && typeof character[field] === 'boolean') character[field] = true;
  }
  for (const entry of entries) {
    const config = encounterFor(entry.section);
    const options = { itemRemovedManually: true, remainingStamina: (config.carryEnemyIndices ?? config.enemies.map((_, index) => index))
      .map((_, index) => Math.min(2, config.carriedStaminaMaximum?.[index] ?? config.enemies[index].stamina)) };
    const before = structuredClone(character);
    assert.doesNotThrow(() => combat.startFight(entry.section, character, options, () => 1), 'Entry ' + entry.section);
    if (config.component) assert.doesNotThrow(() => combat.startFight(entry.section, character, { ...options, hasComponent: false }, () => 1), 'Missing component ' + entry.section);
    assert.deepEqual(character, before);
  }
});

test('724: gate guards replace losses only in the next round; ordinary group ties cannot hit', () => {
  let fight = combat.startFight(40, hero());
  fight.enemies[0].stamina = 2;
  assert.deepEqual(combat.activeEnemies(fight), [0, 1]);
  fight = winRound(fight, 0);
  assert.deepEqual(combat.activeEnemies(fight), [1, 2]);
  assert.equal(fight.enemies[1].stamina, 7);
  assert.equal(fight.enemies[2].stamina, 8);
  assert.equal(fight.player.stamina, 24);
  const tied = combat.round(combat.startFight(29, hero({ skill: 7 })), 0, () => 1);
  assert.equal(tied.pending.length, 0);
  assert.equal(tied.enemies[0].stamina, 7);
});

test('724: mind reading protects one target only and optional retargeting costs one stamina', () => {
  let fight = combat.startFight(588, hero({ skullcap: true, skill: 1 }));
  fight = combat.round(fight, 0, rolls(1, 1, 6, 6, 6, 6, 6, 6));
  assert.deepEqual(fight.pending.map(hit => hit.enemy), [1, 2]);
  fight = settle(fight);
  assert.equal(fight.player.stamina, 19);
  assert.throws(() => combat.recastMindRead(fight), RangeError);
  fight = combat.startFight(787, hero({ skullcap: true }));
  fight.enemies[0].stamina = 2;
  fight = winRound(fight, 0);
  const before = fight.player.stamina;
  const retargeted = combat.recastMindRead(fight);
  assert.equal(retargeted.mindReadTarget, 1);
  assert.equal(retargeted.player.stamina, before - 1);
  assert.equal(fight.mindReadTarget, 0);
});

test('724: blessed spear is an explicit section-394 option, not a global instant win', () => {
  const character = hero();
  const fight = combat.startFight(394, character, { useHolySpear: true });
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 495);
  assert.equal(fight.player.stamina, character.stamina);
  assert.equal(fight.rounds, 0);
  assert.equal(combat.startFight(394, character).outcome, null);
  assert.throws(() => combat.startFight(29, character, { useHolySpear: true }), RangeError);
  assert.throws(() => combat.startFight(646, character, { useHolySpear: true }), RangeError);
});

test('724: timed guard handoffs preserve wounds and fresh second guards, without healing the player', () => {
  let fight = combat.startFight(264, hero({ skill: 7, stamina: 15 }));
  fight.enemies[0].stamina = 1;
  fight = combat.round(fight, 0, () => 1);
  fight = combat.round(fight, 0, () => 1);
  assert.equal(fight.destination, 487);
  const next = combat.startFight(487, fight.player, { carryFrom: fight });
  assert.deepEqual(next.enemies.map(enemy => enemy.stamina), [1, 6]);
  assert.equal(next.player.stamina, 15);
  assert.throws(() => combat.startFight(487, { ...fight.player, stamina: 16 }, { carryFrom: fight }), RangeError);
  let quick = winRound(combat.startFight(264, hero({ stamina: 15 })));
  assert.equal(quick.destination, 387);
  quick = combat.startFight(387, quick.player, { carryFrom: quick });
  assert.equal(quick.enemies[0].stamina, 6);
  assert.equal(quick.player.stamina, 15);
});

test('724: captain continuation copies the captain, not a dead guard, and mercy waits for three stamina', () => {
  let fight = combat.startFight(145, hero({ stamina: 18 }));
  fight.enemies[0].stamina = 0;
  fight.enemies[1].stamina = 0;
  fight = winRound(winRound(fight, 2), 2);
  assert.equal(fight.destination, 391);
  assert.equal(fight.mercyDestination, 347);
  fight = combat.startFight(391, fight.player, { carryFrom: fight });
  assert.equal(fight.enemies[0].stamina, 5);
  assert.equal(fight.player.stamina, 18);
  assert.throws(() => combat.spare(fight), RangeError);
  fight = winRound(fight);
  assert.equal(combat.spare(fight).destination, 445);
  assert.throws(() => combat.startFight(391, hero(), { remainingStamina: [9] }), RangeError);
});

test('724: Hydra illusion hits do no ordinary damage; BIG and wounds survive its staged rounds', () => {
  let illusion = combat.startFight(65, hero({ skill: 1 }));
  illusion = settle(combat.round(illusion, 0, () => 1));
  assert.equal(illusion.destination, 305);
  assert.equal(illusion.player.stamina, 23);
  let fight = winRound(combat.startFight(689, hero()));
  assert.equal(fight.destination, 458);
  assert.equal(fight.enemies[0].stamina, 22);
  fight = combat.startFight(458, fight.player, { carryFrom: fight });
  assert.equal(fight.config.playerAttackModifier, 4);
  assert.equal(fight.enemies[0].stamina, 22);
  fight = winRound(fight);
  assert.equal(fight.destination, 398);
  fight = combat.startFight(398, fight.player, { carryFrom: fight });
  assert.equal(fight.config.playerAttackModifier, 4);
  assert.equal(fight.enemies[0].stamina, 20);
  assert.equal(fight.player.stamina, 17);
});

test('724: skunk slowing and wounds survive the spray handoff; the first-hit escape window is limited', () => {
  let fight = combat.startFight(638, hero());
  fight = winRound(fight);
  assert.equal(combat.flee(fight).destination, 469);
  fight = winRound(fight);
  assert.equal(fight.destination, 346);
  fight = combat.startFight(346, fight.player, { carryFrom: fight });
  assert.equal(fight.enemies[0].skill, 4);
  assert.equal(fight.enemies[0].stamina, 2);
  assert.equal(fight.config.entrySkillModifier, -2);
  fight = winRound(fight);
  assert.equal(fight.destination, 558);
  assert.equal(fight.player.stamina, 22);
});

test('724: confused excluded guard hurts exactly once after four rounds', () => {
  let fight = combat.startFight(656, hero({ skill: 7 }), { enemyIndex: 3 });
  for (let i = 0; i < 4; i++) fight = combat.round(fight, 0, () => 1);
  assert.equal(fight.player.stamina, 20);
  assert.equal(fight.scheduledDamageApplied, true);
  fight = combat.round(fight, 0, () => 1);
  assert.equal(fight.player.stamina, 20);
});

test('724: red-eye gaze escalates per creature and two burns kill the player', () => {
  let fight = combat.startFight(159, hero());
  fight = combat.round(fight, 0, rolls(6, 6, 1, 1, 1, 1, 1, 1));
  fight = combat.resolveHit(fight, false, rolls(6, 1));
  assert.equal(fight.gazeBurns, 1);
  assert.equal(fight.player.stamina, 23);
  fight = combat.round(fight, 1, rolls(6, 6, 1, 1, 1, 1, 1, 1));
  fight = combat.resolveHit(fight, false, rolls(6, 1));
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.player.stamina, 0);
  assert.equal(fight.events.find(event => event.kind === 'gaze').threshold, 6);
});

test('724: allies fight instead of the player, mirror copies vanish, and allies cannot spend player Luck', () => {
  let army = combat.startFight(646, hero({ goblinTeeth: 2 }), { summonCount: 2 });
  assert.equal(army.player.stamina, 22);
  assert.equal(army.player.goblinTeeth, 0);
  assert.deepEqual(army.allies.map(({key, skill, stamina}) => ({key, skill, stamina})),
    [SUMMONED_ALLIES.goblin, SUMMONED_ALLIES.goblin]);
  const giant = combat.startFight(789, hero({giantTeeth: 1}));
  assert.deepEqual(giant.allies.map(({key, skill, stamina}) => ({key, skill, stamina})), [SUMMONED_ALLIES.giant]);
  assert.equal(giant.player.giantTeeth, 0);
  assert.equal(giant.player.stamina, 23);
  giant.allies[0].stamina = 1;
  assert.equal(SUMMONED_ALLIES.giant.stamina, 9);
  army = combat.round(army, 0, rolls(1, 1, 6, 6));
  assert.equal(army.pending[0].actor, 'ally');
  assert.throws(() => combat.resolveHit(army, true), RangeError);
  army = settle(army);
  assert.equal(army.player.stamina, 22);
  assert.equal(army.enemies[0].stamina, 4);
  let mirrors = combat.startFight(748, hero({ mirror: true }), { copyEnemies: [0, 1, 2], helpCopies: true });
  assert.equal(mirrors.player.stamina, 21);
  mirrors = combat.round(mirrors, 0, rolls(6, 6, 1, 1, 6, 6, 1, 1, 1, 1, 1, 1, 1, 1));
  mirrors = combat.resolveHit(mirrors, true, rolls(1, 1, 1));
  assert.equal(mirrors.enemies[0].stamina, 0);
  assert.equal(mirrors.allies[0].vanished, true);
  assert.equal(mirrors.pending.length, 0);
  assert.equal(mirrors.allies[1].stamina, 2);
});

test('724: stone volleys retain their different dice, damage, miss limits and fear outcomes', () => {
  let ogre = combat.startFight(651, hero({ pebbles: 3, skill: 1 }));
  ogre = combat.throwPebble(ogre, 0, () => 6);
  ogre = combat.throwPebble(ogre, 0, () => 6);
  assert.equal(ogre.volleyActive, false);
  assert.equal(ogre.player.pebbles, 1);
  assert.equal(ogre.enemies[0].stamina, 11);
  let elves = combat.startFight(775, hero({ pebbles: 2 }));
  elves = combat.throwPebble(elves, 0, rolls(1, 1));
  assert.equal(elves.enemies[0].stamina, 3);
  let guards = combat.startFight(784, hero({ pebbles: 3 }));
  assert.throws(() => combat.stopVolley(guards), RangeError);
  for (let i = 0; i < 3; i++) guards = combat.throwPebble(guards, 0, () => 1);
  assert.equal(guards.destination, 397);
  assert.equal(guards.outcome, 'continue');
  guards = combat.startFight(784, hero({ pebbles: 2 }));
  guards = combat.throwPebble(combat.throwPebble(guards, 0, () => 1), 0, () => 1);
  assert.equal(guards.destination, 401);
});

test('724: Luck resolves before wound limits and wax; temporary weapon effects cannot stack or revive', () => {
  let fight = combat.startFight(765, hero({ wax: true }));
  fight = combat.round(fight, 0, rolls(6, 6, 1, 1, 1, 1));
  fight = combat.resolveHit(fight, true, rolls(1, 1));
  assert.equal(fight.events.find(event => event.kind === 'hit').damage, 8);
  let character = effects.coatWeapon(hero({ wax: true }));
  character.nextFightSkillLoss = 1;
  fight = combat.startFight(29, character);
  assert.equal(fight.config.doubleWeaponDamage, true);
  assert.equal(fight.config.playerAttackModifier, -1);
  assert.equal(fight.player.nextFightDoubleDamage, false);
  assert.equal(fight.player.nextFightSkillLoss, 0);
  assert.equal(effects.coatWeapon(hero({ stamina: 1, wax: true })).dead, true);
  fight = combat.startFight(29, hero({ twoWeapons: true }), { secondWeaponEquipped: true });
  fight = settle(combat.round(fight, 0, rolls(6, 6, 6, 6, 1, 1)));
  assert.equal(fight.enemies[0].stamina, 3);
});

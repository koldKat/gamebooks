import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENCOUNTERS } from '../../public/js/battlesim/books/773/definition.js';
import * as combat from '../../public/js/battlesim/books/773/combat.js';
import { createState } from '../../public/js/battlesim/books/773/state.js';

const character = (skill = 10, stamina = 24, luck = 12) => ({
  skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
  attackModifier: 0, dead: false,
});
const rolls = (...values) => () => {
  assert.ok(values.length, 'unexpected extra die');
  return values.shift();
};
const settle = fight => {
  while (fight.pending.length && !fight.outcome) fight = combat.resolveLuck(fight, false);
  return fight;
};
const start = (section, hero = character(), options = {}) => combat.startFight(section, hero, { applyEntry: false, ...options });

test('complete source roster and initial rolls, without invented food or potion', () => {
  assert.equal(ENCOUNTERS.length, 38);
  assert.equal(new Set(ENCOUNTERS.map(entry => entry.section)).size, 38);
  const hero = combat.newCharacter(rolls(1, 2, 3, 4));
  assert.deepEqual([hero.skill, hero.stamina, hero.luck], [7, 17, 10]);
  assert.equal(hero.provisions, undefined);
  assert.equal(hero.potion, undefined);
  assert.deepEqual(ENCOUNTERS.find(entry => entry.section === 146).enemies.map(enemy => enemy.skill), [3, 2, 3, 3, 4]);
  assert.equal(ENCOUNTERS.find(entry => entry.section === 259).enemies[2].stamina, 11);
  for (const [section, skill, stamina] of [[247, 11, 12], [340, 10, 11], [383, 11, 10]]) {
    const enemy = ENCOUNTERS.find(entry => entry.section === section).enemies[0];
    assert.deepEqual([enemy.skill, enemy.stamina], [skill, stamina]);
  }
});

test('custom opponents, immutable input, harmless ties and four Luck damage values', () => {
  const input = start(0, character(), { opponents: [{ displayName: 'Тест', skill: 10, stamina: 10 }] });
  const before = structuredClone(input);
  const tied = combat.round(input, 0, rolls(3, 3, 3, 3));
  assert.equal(tied.pending.length, 0);
  assert.deepEqual(input, before);
  for (const [win, damage] of [[true, 4], [false, 1]]) {
    const pending = combat.round(input, 0, win ? rolls(6, 6, 1, 1) : rolls(1, 1, 6, 6));
    const result = combat.resolveLuck(pending, true, rolls(1, 1));
    assert.equal(result.character.luck, 11);
    assert.equal(win ? input.enemies[0].stamina - result.enemies[0].stamina : input.character.stamina - result.character.stamina, damage);
  }
  for (const win of [true, false]) {
    const lowLuck = start(0, character(10, 24, 2), { opponents: [{ displayName: 'Тест', skill: 10, stamina: 10 }] });
    const pending = combat.round(lowLuck, 0, win ? rolls(6, 6, 1, 1) : rolls(1, 1, 6, 6));
    const result = combat.resolveLuck(pending, true, rolls(6, 6));
    assert.equal(win ? 10 - result.enemies[0].stamina : 24 - result.character.stamina, win ? 1 : 3);
  }
});

test('Bone Demon fear occurs before attacks, while the talisman prevents it', () => {
  const failed = combat.round(start(29), 0, rolls(2));
  assert.equal(failed.destination, 265);
  assert.equal(failed.character.dead, true);
  const protectedFight = combat.round(start(63), 0, rolls(3, 3, 3, 3));
  assert.equal(protectedFight.outcome, null);
  assert.equal(protectedFight.events.some(event => event.kind === 'fear'), false);
});

test('Bonecrusher is fatal on the first lost round, without an inappropriate Luck prompt', () => {
  const fight = combat.round(start(56), 0, rolls(1, 1, 6, 6));
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.destination, 343);
  assert.equal(fight.pending.length, 0);
});

test('rat interruption resumes only remaining rats, including the last-rat victory', () => {
  let fight = settle(combat.round(start(146, character(3)), 0, rolls(1, 1, 6, 6)));
  assert.equal(fight.outcome, 'paused');
  assert.equal(fight.destination, 165);
  const resumed = combat.resumeFight(fight);
  assert.equal(resumed.enemies[0].stamina, 0);
  assert.deepEqual(combat.targets(resumed), [1]);
  assert.equal(resumed.character.stamina, 22);
  fight.enemies.slice(1).forEach(enemy => { enemy.stamina = 0; });
  const won = combat.resumeFight(fight);
  assert.equal(won.outcome, 'win');
  assert.equal(won.destination, 18);
  assert.throws(() => combat.resumeFight(won));
});

test('spider pauses after five rounds and retains damage on return from section108', () => {
  let fight = start(118, character(7));
  fight = settle(combat.round(fight, 0, rolls(6, 6, 1, 1)));
  for (let i = 0; i < 4; i++) fight = combat.round(fight, 0, rolls(3, 3, 3, 3));
  assert.equal(fight.outcome, 'paused');
  assert.equal(fight.destination, 64);
  const updated = { ...fight.character, stamina: 20 };
  const resumed = combat.resumeFight(fight, updated);
  assert.equal(resumed.enemies[0].stamina, 6);
  assert.equal(resumed.character.stamina, 20);
  assert.equal(combat.round(resumed, 0, rolls(3, 3, 3, 3)).outcome, null);
});

test('fire and companion draining apply on tied rounds and cannot use Luck', () => {
  for (const [section, skill, extra, values] of [[127, 10, 2, [3, 3, 3, 3, 1]], [374, 7, 1, [3, 3, 3, 3, 2]],
    [186, 5, 1, [3, 3, 3, 3]]]) {
    const input = start(section, character(skill));
    const pending = combat.round(input, 0, rolls(...values));
    assert.equal(pending.pending[0].kind, 'automatic');
    assert.throws(() => combat.resolveLuck(pending, true, rolls(1, 1)));
    assert.equal(settle(pending).character.stamina, 24 - extra);
  }
  const fight = start(186, character(5));
  fight.enemies[0].stamina = 0;
  assert.equal(combat.round(fight, 1, rolls(3, 3, 3, 3)).pending.length, 0);
});

test('Bloodworm drains two per round, not an invented double charge on lost rounds', () => {
  let fight = start(234, character(4));
  fight = settle(combat.round(fight, 0, rolls(1, 1, 6, 6)));
  assert.equal(fight.character.stamina, 22);
  assert.equal(fight.bleeding, true);
  fight = settle(combat.round(fight, 0, rolls(1, 1, 6, 6)));
  assert.equal(fight.character.stamina, 20);
  fight = settle(combat.round(fight, 0, rolls(3, 3, 3, 3)));
  assert.equal(fight.character.stamina, 18);
  assert.equal(settle(combat.round(start(325, character(4)), 0, rolls(1, 1, 6, 6))).character.stamina, 22);
});

test('two-headed dog requires beating both attacks and can deliver two wounds', () => {
  const input = start(294, character(6));
  const tiedHead = combat.round(input, 0, rolls(3, 3, 1, 1, 3, 3));
  assert.equal(tiedHead.pending.length, 0);
  assert.equal(settle(combat.round(input, 0, rolls(1, 1, 6, 6, 6, 6))).character.stamina, 20);
  assert.equal(settle(combat.round(input, 0, rolls(6, 6, 1, 1, 1, 1))).enemies[0].stamina, 3);
});

test('underwater fight requires a win within each three consecutive rounds', () => {
  let fight = start(356, character(8));
  for (let i = 0; i < 2; i++) fight = combat.round(fight, 0, rolls(3, 3, 3, 3));
  assert.equal(fight.outcome, null);
  assert.equal(combat.round(fight, 0, rolls(3, 3, 3, 3)).character.dead, true);
  fight = settle(combat.round(fight, 0, rolls(6, 6, 1, 1)));
  assert.equal(fight.airlessRounds, 0);
  assert.equal(combat.round(fight, 0, rolls(3, 3, 3, 3)).outcome, null);
});

test('tug-of-war counts four wins without applying wounds or Luck', () => {
  let fight = start(369, character(7));
  fight = combat.round(fight, 0, rolls(3, 3, 3, 3));
  for (let i = 0; i < 4; i++) fight = combat.round(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 352);
  assert.equal(fight.character.stamina, 24);
  let lost = start(369, character(7));
  for (let i = 0; i < 4; i++) lost = combat.round(lost, 0, rolls(1, 1, 6, 6));
  assert.equal(lost.destination, 99);
});

test('equipment, temporary penalties, entry losses/healing and group mode remain explicit', () => {
  assert.equal(start(311).destination, 55);
  assert.equal(start(311, character(), { magicSword: true }).outcome, null);
  assert.equal(settle(combat.round(start(329, character(9)), 0, rolls(6, 6, 1, 1))).enemies[0].stamina, 6);
  assert.equal(settle(combat.round(start(329, character(9), { hammer: true }), 0, rolls(6, 6, 1, 1))).enemies[0].stamina, 5);
  const hero = character(); hero.stamina = 10; hero.skill = 8;
  const healed = combat.startFight(188, hero);
  assert.deepEqual([healed.character.skill, healed.character.stamina], [10, 16]);
  assert.equal(hero.stamina, 10);
  assert.equal(combat.startFight(80, character()).character.stamina, 20);
  const penalized = combat.round(start(80, character(12)), 0, rolls(3, 3, 3, 3));
  assert.equal(penalized.events[0].playerAttack, 15);
  assert.equal(penalized.character.skill, 12);
  assert.deepEqual(combat.targets(start(259)), [0]);
  assert.deepEqual(combat.targets(start(259, character(), { groupMode: true })), [0, 1, 2, 3]);
  assert.throws(() => start(259, character(), { opponents: [{ skill: 3, stamina: 2 }] }));
});

test('saved-state writes are isolated, transactional and record each outcome once', () => {
  let run = {}, bookId = 773, saves = 0;
  const store = createState(() => ({ currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++ }));
  store.change(data => { data.character = character(); });
  const initialized = structuredClone(run);
  store.read(); store.read();
  assert.deepEqual(run, initialized);
  assert.equal(saves, 1);
  assert.throws(() => store.change(data => { data.character.stamina = -1; throw Error('Invalid edit'); }));
  assert.deepEqual(run, initialized);
  const won = start(0, character(), { opponents: [{ displayName: 'Тест', skill: 0, stamina: 1 }] });
  const result = settle(combat.round(won, 0, rolls(6, 6, 1, 1)));
  store.change(data => { data.encounterName = 'Тест'; data.fight = result; });
  store.change(data => { data.fight = structuredClone(data.fight); });
  assert.equal(store.read().history.length, 1);
  const originalRun = run;
  const before = structuredClone(run);
  assert.equal(store.change(() => { run = {}; }), false);
  assert.deepEqual(originalRun, before);
  bookId = 217;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => { throw Error('Wrong book'); }), false);
});

test('interrupted saved fights accept narrative stat edits without resetting opponents', () => {
  const run = {};
  const store = createState(() => ({ currentBookId: 773, currentPlaythrough: () => run, saveState() {} }));
  const paused = settle(combat.round(start(146, character(3)), 0, rolls(1, 1, 6, 6)));
  store.change(data => { data.fight = paused; });
  const enemies = structuredClone(store.read().fight.enemies);
  store.change(data => { data.character = { ...data.character, stamina: 18 }; });
  assert.deepEqual(store.read().fight.enemies, enemies);
  store.change(data => { data.fight = combat.resumeFight(data.fight, data.character); });
  assert.equal(store.read().character.stamina, 18);
  assert.equal(store.read().fight.enemies[0].stamina, 0);
  assert.throws(() => store.change(data => { data.character = { ...data.character, stamina: 24 }; }));
  assert.equal(store.read().character.stamina, 18);
});

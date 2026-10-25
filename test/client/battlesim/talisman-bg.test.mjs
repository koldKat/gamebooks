import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTERS, encounterFor, TALISMAN_RULES} from '../../../public/js/battlesim/books/904/definition.js';
import {newCharacter, startFight, round, resolveLuck, recover} from '../../../public/js/battlesim/books/904/combat.js';
import {createState} from '../../../public/js/battlesim/books/904/state.js';

const character = extra => ({...newCharacter(() => 6), ...extra});
const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected dice roll');
  return values.shift();
};
const finishExchange = fight => resolveLuck(fight, false);

await loadFixtureRoster(904);

test('Bulgarian roster retains distinct printed setups and sequential groups', () => {
  assert.equal(new Set(ENCOUNTERS.map(row => row.section)).size, ENCOUNTERS.length);
  assert.deepEqual(encounterFor(282).enemies.map(row => [row.skill, row.stamina]), [[5, 6], [5, 4], [7, 7]]);
  assert.deepEqual(encounterFor(245).groups, [[0], [1]]);
  assert.equal(encounterFor(245).enemies[1].skill, 7);
  assert.equal(encounterFor(286).enemies[1].skill, 5);
  assert.equal(encounterFor(387).enemies[0].skill, 9);
  assert.equal(encounterFor(395).enemies[0].skill, 8);
  assert.equal(encounterFor(348).enemies[0].skill, 7);
  assert.equal(encounterFor(208).enemies[0].skill, 9);
  for (const row of ENCOUNTERS) assert.doesNotThrow(() => startFight(row.section, character()));
});

test('Luck preserves 4/1 outgoing and 1/3 incoming wound values', () => {
  const hit = round(startFight(25, character()), 0, rolls(6, 6, 1, 1));
  assert.equal(hit.enemies[0].stamina, 16);
  assert.equal(resolveLuck(hit, true, rolls(1, 1)).enemies[0].stamina, 14);
  assert.equal(resolveLuck({...hit, character: {...hit.character, luck: 0}}, true, rolls(6, 6)).enemies[0].stamina, 17);
  const wound = round(startFight(25, character({skill: 1})), 0, rolls(1, 1, 6, 6));
  assert.equal(resolveLuck(wound, true, rolls(1, 1)).character.stamina, 23);
  assert.equal(resolveLuck({...wound, character: {...wound.character, luck: 0}}, true, rolls(6, 6)).character.stamina, 21);
});

test('a pending fatal wound can be reduced, but a completed death cannot be revived', () => {
  const fight = round(startFight(25, character({skill: 1, stamina: 2})), 0, rolls(1, 1, 6, 6));
  assert.equal(fight.character.stamina, 0);
  assert.equal(fight.outcome, null);
  const saved = resolveLuck(fight, true, rolls(1, 1));
  assert.equal(saved.character.stamina, 1);
  assert.equal(saved.character.dead, false);
  const lost = finishExchange(fight);
  assert.equal(lost.outcome, 'loss');
  assert.equal(lost.character.dead, true);
  assert.throws(() => recover(lost.character, 'potion'));
  assert.throws(() => resolveLuck(lost, true));
});

test('each simultaneous attacker gets a fresh player roll', () => {
  let fight = startFight(286, character());
  const original = structuredClone(fight);
  fight = round(fight, 0, rolls(6, 6, 1, 1, 1, 1, 6, 6));
  assert.deepEqual(original, startFight(286, character()));
  fight = finishExchange(fight);
  assert.equal(fight.pending.kind, 'incoming');
  fight = finishExchange(fight);
  assert.equal(fight.character.stamina, 22);
  const attacks = fight.events.filter(event => event.kind === 'attack');
  assert.equal(attacks.length, 0);
  assert.equal(fight.enemies[0].stamina, 5);
  assert.equal(fight.enemies[1].stamina, 6);
});

test('sequential enemies do not attack before their own group', () => {
  const preset = encounterFor(245);
  let fight = startFight(245, character(), {opponents: preset.enemies.map(row => ({...row, stamina: 1}))});
  fight = finishExchange(round(fight, 0, rolls(6, 6, 1, 1)));
  assert.equal(fight.group, 1);
  assert.equal(fight.outcome, null);
  assert.equal(fight.character.stamina, 24);
  fight = finishExchange(round(fight, 1, rolls(6, 6, 1, 1)));
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 329);
});

test('three-round Triceratops combat ends in its printed Luck test', () => {
  let fight = startFight(4, character({skill: 8}));
  for (let i = 0; i < 3; i++) fight = round(fight, 0, () => 3);
  assert.equal(fight.pending.kind, 'route');
  const result = resolveLuck(fight, true, rolls(1, 1));
  assert.equal(result.destination, 40);
  assert.equal(result.character.luck, 11);
  assert.equal(result.character.stamina, 24);
});

test('four successful Willow hits and the first Tyutchev hit interrupt without fabricated kills', () => {
  let fight = startFight(36, character());
  for (let i = 0; i < 4; i++) fight = finishExchange(round(fight, 0, rolls(6, 6, 1, 1)));
  assert.equal(fight.destination, 26);
  assert.equal(fight.enemies[0].stamina, 12);
  const tyutchev = finishExchange(round(startFight(265, character()), 0, rolls(6, 6, 1, 1)));
  assert.equal(tyutchev.destination, 301);
  assert.equal(tyutchev.enemies[0].stamina, 10);
});

test('Roc and monk special rolls use their printed outcomes', () => {
  const roc = round(startFight(9, character()), 0, rolls(6, 6, 1, 1, 1));
  assert.equal(roc.outcome, 'interrupted');
  assert.equal(roc.destination, 55);
  const monk = round(startFight(288, character({skill: 1})), 0, rolls(1, 1, 6, 6, 5));
  assert.equal(monk.destination, 366);
  assert.equal(monk.character.stamina, 24);
});

test('opening losses are opt-in once per fight and never mutate caller values', () => {
  const player = character(), original = structuredClone(player);
  const fight = startFight(81, player, {applyOpening: true});
  assert.equal(fight.character.skill, 11);
  assert.equal(fight.character.stamina, 22);
  assert.deepEqual(player, original);
  assert.equal(startFight(81, player).character.stamina, 24);
});

test('saved skill-draining wounds apply catalog loss once before Luck resolves', () => {
  const amount = TALISMAN_RULES.skillDrainAmount;
  try {
    for (const loss of [amount, 2]) {
      TALISMAN_RULES.skillDrainAmount = loss;
      for (const spec of ENCOUNTERS.filter(row => row.enemies.some(enemy => enemy.skillDrain))) {
        const input = startFight(spec.section, character({skill: 1, extension: {kept: true}}));
        input.extension = {preserved: true};
        const original = structuredClone(input);
        const wounded = round(input, 0, rolls(1, 1, 6, 6));
        assert.equal(wounded.pending.kind, 'incoming');
        assert.equal(wounded.character.skill, 0);
        assert.deepEqual(input, original);
        const saved = JSON.parse(JSON.stringify(wounded));
        const resolved = resolveLuck(saved, true, rolls(1, 1));
        assert.equal(resolved.character.skill, 0);
        assert.equal(resolved.character.stamina, 23);
        assert.deepEqual(resolved.extension, {preserved: true});
        assert.deepEqual(resolved.character.extension, {kept: true});
        assert.deepEqual(saved, wounded);
      }
      const wound = round(startFight(81, character({skill: 5})), 0, rolls(1, 1, 6, 6));
      assert.equal(wound.character.skill, 5 - loss);
      assert.equal(resolveLuck(JSON.parse(JSON.stringify(wound)), false).character.skill, 5 - loss);
    }
  } finally {
    TALISMAN_RULES.skillDrainAmount = amount;
  }
});

test('one-dose Fortune increases maximum Luck and meals restore four', () => {
  const potion = recover(character({potion: 'fortune', luck: 1}), 'potion');
  assert.equal(potion.luckInitial, 13);
  assert.equal(potion.luck, 13);
  assert.equal(potion.potionUses, 0);
  assert.throws(() => recover(potion, 'potion'));
  const meal = recover(character({stamina: 21}), 'meal');
  assert.equal(meal.stamina, 24);
  assert.equal(meal.provisions, 9);
});

test('state records each outcome once and refuses stale run or book writes', () => {
  let bookId = 904, run = {sim207: {keep: true}}, saves = 0;
  const store = createState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => {
    data.encounterName = 'Тютчев';
    data.fight = finishExchange(round(startFight(265, character()), 0, rolls(6, 6, 1, 1)));
  });
  store.change(() => {});
  assert.equal(store.read().history.length, 1);
  assert.deepEqual(run.sim207, {keep: true});
  const oldRun = run, before = structuredClone(run), beforeSaves = saves;
  assert.equal(store.change(() => {run = {};}), false);
  assert.deepEqual(oldRun, before);
  assert.equal(saves, beforeSaves);
  bookId = 207;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => {}), false);
});

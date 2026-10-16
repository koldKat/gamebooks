import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/735/definition.js';
import { prepareEncounter } from '../../../public/js/battlesim/books/735/combat.js';
import { createState } from '../../../public/js/battlesim/books/735/state.js';
import { newCharacter } from '../../../public/js/battlesim/engines/space-assassin/core.js';
import { buyLoadout, rollCharacter, useNerveGas, useGravityBomb, replaceSuit, eatEnergyBar } from '../../../public/js/battlesim/books/735/effects.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim735.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim735.js';

const player = () => ({ ...newCharacter(() => 1), stamina: 8 });

test('custom opponents and preset overrides use the existing combat rules', () => {
  const enemies = [{displayName: 'Manual robot', skill: 0, stamina: 3}];
  const custom = prepareEncounter(player(), 0, {weapon: 'lash', mode: 'melee', opponents: enemies});
  assert.equal(custom.fight.enemies[0].name, 'Manual robot');
  assert.equal(custom.fight.enemies[0].skill, 0);
  assert.equal(custom.fight.encounterSection, 0);
  const preset = prepareEncounter(player(), 95, {weapon: 'blaster', ballBearings: true, opponents: [{...enemies[0], skill: 5}]});
  assert.equal(preset.fight.enemies[0].skill, 4);
  assert.equal(preset.fight.winDestination, 400);
  assert.throws(() => prepareEncounter(player(), 61, {weapon: 'lash', opponents: enemies}));
  assert.equal(enemies[0].skill, 0);
});

test('both locales cover encounters and preserve interpolation parameters', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual((en[key].match(/\{\w+\}/g) ?? []).sort(), (bg[key].match(/\{\w+\}/g) ?? []).sort(), key);
  }
  for (const entry of ENCOUNTERS) assert.ok(en['battlesim735.encounter.' + entry.section]);
});

test('actual backend awards fresh wins and losses once, not avoidance, escapes or cancellation', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const registry = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('function processStateXp('));
  const processor = source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser('));
  const awards = [], ledger = new Set();
  const scope = {
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    isCleanRun: () => false, awardCoins() {}, getXpAmount: () => 50,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, _xpRefSeq: 0,
    awardXp(_user, event, ref) {
      const key = event + ':' + ref;
      if (ledger.has(key)) return false;
      ledger.add(key); awards.push({ event, ref }); return true;
    },
  };
  runInNewContext(registry + '\nglobalThis.keys = SIM_HISTORY_KEYS;\n' + processor, scope);
  assert.equal(scope.keys.filter(key => key === 'sim735').length, 1);
  const state = history => ({ playthroughs: [{ startedAt: 1, path: [1], sim735: { history } }] });
  const before = state([]), after = state(['win', 'loss', 'avoided', 'escape', 'cancelled', 'continue'].map((outcome, i) => ({ outcome, ts: i + 11 })));
  scope.processStateXp(1, 735, before, after, 0);
  scope.processStateXp(1, 735, after, after, 0);
  assert.deepEqual(awards, [{ event: 'battlesim_win', ref: 'sim735:11' }, { event: 'battlesim_loss', ref: 'sim735:12' }]);
});

test('all 26 reviewed encounters prepare without healing or mutating roster/character', () => {
  const original = player(), roster = structuredClone(ENCOUNTERS);
  for (const entry of ENCOUNTERS) {
    const result = prepareEncounter(original, entry.section, { weapon: 'blaster', mode: entry.mode ?? 'gunfire', enemyWeapon: 'none' }, () => 6);
    assert.equal(result.player.stamina, 8);
    assert.equal(result.fight.encounterSection, entry.section);
    assert.equal(result.fight.winDestination, entry.win);
  }
  assert.deepEqual(ENCOUNTERS, roster);
  assert.deepEqual(original, player());
  assert.throws(() => prepareEncounter(original, 20, { weapon: 'blaster', mode: 'melee' }));
  assert.throws(() => prepareEncounter(original, 338, { weapon: 'blaster' }));
  assert.throws(() => prepareEncounter(original, 338, { weapon: 'blaster', mode: 'gunfire' }));
});

test('opening Luck is paid once and harmless avoidance is not a fabricated win', () => {
  const lucky = prepareEncounter(player(), 239, { weapon: 'lash' }, () => 1);
  assert.equal(lucky.player.luck, 6);
  assert.equal(lucky.fight.openingShots, 1);
  assert.equal(lucky.fight.openingPending, true);
  const unlucky = prepareEncounter(player(), 239, { weapon: 'lash' }, () => 6);
  assert.equal(unlucky.fight.openingShots, 2);
  const avoided = prepareEncounter(player(), 359, { weapon: 'blaster', mode: 'gunfire' }, () => 1);
  assert.equal(avoided.outcome, 'avoided');
  assert.equal(avoided.destination, 8);
  assert.equal(avoided.fight, null);
  assert.equal(avoided.player.luck, 6);
  assert.equal(prepareEncounter(player(), 74, { weapon: 'blaster', knowledge: true }).fight.playerDamageBonus, 1);
  assert.equal(prepareEncounter(player(), 95, { weapon: 'blaster', ballBearings: true }).fight.enemies[0].skill, 8);
  assert.equal(prepareEncounter(player(), 211, { weapon: 'lash', openingHit: true }).player.armour, 6);
  assert.equal(prepareEncounter(player(), 220, { weapon: 'lash', openingHit: true }).player.armour, 6);
  assert.throws(() => prepareEncounter(player(), 20, { weapon: 'blaster', openingHit: true }));
  assert.throws(() => prepareEncounter(player(), 20, { weapon: 'blaster', knowledge: true }));
});

test('state changes are run-local, atomic and record each actual outcome only once', () => {
  const run = { untouched: { id: 208 } };
  let current = run, book = 735, saves = 0;
  const store = createState(() => ({ currentBookId: book, currentPlaythrough: () => current, saveState: () => saves++ }));
  assert.equal(store.read(), null);
  store.change(data => { data.character = player(); });
  store.change(data => { data.encounterName = 'Robot'; data.fight = prepareEncounter(data.character, 20, { weapon: 'blaster' }).fight; });
  const before = structuredClone(run);
  assert.throws(() => store.change(data => { data.character = player(); }));
  assert.deepEqual(run, before);
  store.change(data => { data.fight = { ...data.fight, outcome: 'win' }; });
  assert.equal(store.read().history.length, 1);
  store.change(data => { data.note = 'unchanged outcome'; });
  assert.equal(store.read().history.length, 1);
  store.change(data => { data.character = { ...data.character, stamina: 6 }; });
  assert.equal(store.read().character.stamina, 6, 'A completed fight must not overwrite a manual score edit');
  const saved = run.sim735;
  assert.equal(store.change(data => { data.note = 'stale'; current = {}; }), false);
  assert.equal(run.sim735, saved);
  current = run; book = 208;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => {}), false);
  assert.deepEqual(run.untouched, { id: 208 });
  assert.equal(saves, 5);
});

test('starting equipment uses the printed budget, mandatory weapon and half-point armour cost once', () => {
  const original = rollCharacter(() => 3);
  assert.equal(original.equipmentBudget, 3);
  assert.equal(original.weapon, 'unarmed');
  const armed = buyLoadout(original, { weapon: 'lash', grenades: 1, armour: 2 });
  assert.equal(armed.equipmentSpent, 3);
  assert.equal(armed.armour, original.armour + 2);
  assert.equal(armed.stamina, original.stamina);
  assert.equal(armed.grenades, 1);
  assert.equal(buyLoadout(original, { weapon: 'blaster' }).equipmentSpent, 3);
  assert.throws(() => buyLoadout(original, { weapon: 'unarmed', armour: 6 }));
  assert.throws(() => buyLoadout(original, { weapon: 'blaster', grenades: 1 }));
  assert.throws(() => buyLoadout(armed, { weapon: 'lash' }));
  assert.equal(original.loadoutPurchased, false);
});

test('gas shares one roll across guards, fails against mutants and consumes its flask', () => {
  const character = { ...player(), nerveGas: 1 };
  const guards = prepareEncounter(character, 108, { weapon: 'blaster' }).fight;
  let rolls = 0;
  const wounded = useNerveGas(guards, () => { rolls++; return 2; });
  assert.equal(rolls, 1);
  assert.deepEqual(wounded.enemies.map(enemy => enemy.stamina), [2, 2]);
  assert.equal(wounded.player.nerveGas, 0);
  assert.equal(wounded.player.stamina, character.stamina);
  assert.equal(guards.player.nerveGas, 1);
  assert.throws(() => useNerveGas(wounded));
  assert.equal(useNerveGas(guards, () => 4).outcome, 'win');
  const mutants = prepareEncounter(character, 312, { weapon: 'lash' }).fight;
  const failed = useNerveGas(mutants, () => { throw Error('No mutant gas roll'); });
  assert.equal(failed.player.nerveGas, 0);
  assert.deepEqual(failed.enemies, mutants.enemies);
  assert.equal(failed.outcome, null);
});

test('gravity bomb, replacement suit and food obey their printed scopes without resetting scores', () => {
  const character = { ...player(), gravityBombs: 1, energyBars: 1 };
  const robots = prepareEncounter(character, 267, { weapon: 'blaster' }).fight;
  const destroyed = useGravityBomb(robots);
  assert.equal(destroyed.outcome, 'win');
  assert.equal(destroyed.player.gravityBombs, 0);
  assert.equal(destroyed.enemies.filter(enemy => !enemy.stamina).length, 8);
  assert.equal(destroyed.player.stamina, 8);
  assert.throws(() => useGravityBomb(destroyed));
  assert.throws(() => useGravityBomb(prepareEncounter(character, 20, { weapon: 'blaster' }).fight));
  assert.throws(() => useGravityBomb({ ...robots, rounds: 1 }));
  const suit = replaceSuit(character);
  assert.equal(suit.armour, 14);
  assert.equal(suit.armourInitial, character.armourInitial);
  assert.equal(suit.skill, character.skill - 1);
  assert.equal(suit.stamina, 8);
  assert.throws(() => replaceSuit(suit), 'Equipping the same replacement suit twice is not a second reward');
  const healed = eatEnergyBar(character);
  assert.equal(healed.stamina, 13);
  assert.equal(healed.energyBars, 0);
  assert.throws(() => eatEnergyBar({ ...character, stamina: 0 }));
  assert.deepEqual(character, { ...player(), gravityBombs: 1, energyBars: 1 });
});

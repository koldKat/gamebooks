import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as combat from '../../../public/js/battlesim/books/769/combat.js';
import * as effects from '../../../public/js/battlesim/books/769/effects.js';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/769/definition.js';
import { createState } from '../../../public/js/battlesim/books/769/state.js';

const player = changes => ({ ...combat.newCharacter(() => 6), ...changes });
const sequence = (...values) => () => {
  assert.ok(values.length, 'Unexpected additional die');
  return values.shift();
};
const winRoll = () => sequence(6, 6, 1, 1);

test('initial rolls, single-use potions and meals preserve their inputs and caps', () => {
  const initial = combat.newCharacter(() => 1);
  assert.deepEqual([initial.skill, initial.stamina, initial.luck, initial.provisions, initial.potionUses], [7, 14, 7, 10, 1]);
  const injured = player({ stamina: 23, potion: 'fortune' }), before = structuredClone(injured);
  assert.equal(effects.eat(injured).stamina, 24);
  const potion = effects.drinkPotion(injured);
  assert.equal(potion.luckInitial, 13); assert.equal(potion.luck, 13); assert.equal(potion.potionUses, 0);
  assert.throws(() => effects.drinkPotion(potion));
  assert.throws(() => effects.eat(player({ stamina: 0 })));
  assert.deepEqual(injured, before);
});

test('all 32 source encounters and the distinct Manticore entries are represented', () => {
  assert.equal(ENCOUNTERS.length, 32);
  assert.equal(new Set(ENCOUNTERS.map(entry => entry.section)).size, 32);
  const injured = player({ stamina: 20 });
  assert.equal(combat.startFight(6, injured).character.stamina, 18);
  assert.equal(combat.startFight(6, injured, { applyEntry: false }).character.stamina, 20);
  assert.equal(combat.startFight(196, injured).character.stamina, 20);
  assert.equal(combat.startFight(247, injured, {}, () => 3).character.stamina, 14);
  assert.equal(injured.stamina, 20);
});

test('harmless ties and printed optional Luck damage', () => {
  const fight = combat.startFight(387, player({ skill: 7 }));
  const tied = combat.round(fight, 0, () => 1);
  assert.equal(tied.pending.length, 0); assert.equal(tied.character.stamina, 24);
  const hit = combat.round(fight, 0, winRoll());
  assert.equal(combat.resolveLuck(hit, true, () => 1).enemies[0].stamina, 3);
  assert.equal(combat.resolveLuck(hit, false).enemies[0].stamina, 5);
  const unlucky = structuredClone(hit); unlucky.character.luck = 0;
  assert.equal(combat.resolveLuck(unlucky, true, () => 6).enemies[0].stamina, 6);
  assert.equal(fight.enemies[0].stamina, 7);
});

test('simultaneous Goblins permit damage only to the selected target', () => {
  const fight = combat.startFight(124, player());
  const result = combat.round(fight, 1, sequence(6, 6, 1, 1, 1, 1));
  assert.equal(result.pending.length, 1); assert.equal(result.pending[0].enemy, 1);
  const hit = combat.resolveLuck(result, false);
  assert.equal(hit.enemies[0].stamina, 4); assert.equal(hit.enemies[1].stamina, 3);
});

test('Scorpion claws share one body and either exact 22 attack is fatal', () => {
  const fight = combat.startFight(143, player());
  const result = combat.round(fight, 1, sequence(6, 6, 1, 1, 1, 1));
  assert.equal(combat.resolveLuck(result, false).enemies[0].stamina, 8);
  const dead = combat.round(fight, 0, sequence(6, 6, 1, 1, 6, 6));
  assert.equal(dead.outcome, 'loss'); assert.equal(dead.destination, 2);
  assert.equal(dead.character.dead, true);
  assert.throws(() => combat.startFight(387, dead.character));
  assert.throws(() => effects.drinkPotion(dead.character));
});

test('Bloodbeast mandatory Luck retains the dagger penalty and permits exactly one retry', () => {
  const fight = combat.startFight(294, player({ luck: 0 }));
  const hit = combat.round(fight, 0, winRoll());
  assert.throws(() => combat.resolveLuck(hit, false));
  const failed = combat.resolveLuck(hit, true, () => 6);
  assert.equal(failed.outcome, 'continue'); assert.equal(failed.destination, 21);
  const next = combat.continueWeakPoint(failed);
  assert.equal(next.config.skillModifier, -2); assert.equal(next.weakPointAttempts, 1);
  assert.equal(next.character.luck, 0); assert.equal(next.character.stamina, 24);
  const second = combat.resolveLuck(combat.round(next, 0, winRoll()), true, () => 6);
  assert.equal(second.outcome, 'loss'); assert.equal(second.destination, 116);
  assert.throws(() => effects.eat(second.character));
  assert.throws(() => combat.continueWeakPoint(second));
});

test('knowledge and Mimic branches stop at printed winning rounds; Mirror Demon captures without a wound', () => {
  let known = combat.startFight(172, player());
  known = combat.resolveLuck(combat.round(known, 0, winRoll()), false);
  assert.equal(known.outcome, null);
  known = combat.round(known, 0, winRoll());
  assert.equal(known.outcome, 'win'); assert.equal(known.destination, 278);
  const mimic = combat.round(combat.startFight(236, player()), 0, winRoll());
  assert.equal(mimic.outcome, 'win'); assert.equal(mimic.destination, 314);
  const captured = combat.round(combat.startFight(327, player()), 0, sequence(1, 1, 6, 6));
  assert.equal(captured.outcome, 'captured'); assert.equal(captured.destination, 8);
  assert.equal(captured.character.stamina, 24);
});

test('Worm escape requires two rounds and applies one Luck-adjustable escape wound', () => {
  let fight = combat.startFight(254, player({ skill: 7 }));
  assert.equal(combat.canEscape(fight), false);
  fight = combat.round(fight, 0, () => 1);
  assert.equal(combat.canEscape(fight), false);
  fight = combat.round(fight, 0, () => 1);
  assert.equal(combat.canEscape(fight), true);
  const escaped = combat.resolveLuck(combat.escapeFight(fight), true, () => 1);
  assert.equal(escaped.outcome, 'escaped'); assert.equal(escaped.destination, 117);
  assert.equal(escaped.character.stamina, 23);
});

test('editable preset stats preserve special rules and custom opponents remain available', () => {
  const edited = combat.startFight(143, player(), { opponents: [{ displayName: 'Test', skill: 8, stamina: 6 }] });
  assert.equal(edited.enemies[0].skill, 8); assert.equal(edited.enemies[0].stamina, 6);
  assert.equal(edited.config.mode, 'two-claws');
  const custom = combat.startFight(0, player(), { opponents: [{ displayName: 'Custom', skill: 6, stamina: 8 }] });
  assert.equal(custom.enemies[0].displayName, 'Custom'); assert.deepEqual(combat.targets(custom), [0]);
  assert.throws(() => combat.startFight(124, player(), { opponents: [{ displayName: 'Test', skill: 5, stamina: 4 }] }));
});

test('saved state changes are atomic, run-isolated and never seed on read', () => {
  const first = {}, second = {};
  let run = first, saves = 0;
  const store = createState(() => ({ currentBookId: 769, currentPlaythrough: () => run, saveState: () => saves++ }));
  assert.equal(store.read(), null); assert.deepEqual(first, {});
  store.change(data => { data.character = player(); });
  const snapshot = structuredClone(first);
  assert.throws(() => store.change(data => { data.character.stamina = 0; throw new Error('Abort'); }));
  assert.deepEqual(first, snapshot);
  assert.equal(store.change(data => { data.character.stamina = 1; run = second; }), false);
  assert.deepEqual(first, snapshot); assert.deepEqual(second, {}); assert.equal(saves, 1);
});

test('backend XP accepts new wins/losses exactly once, excluding narrative continuations', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const registry = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('function processStateXp('));
  const processor = source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser('));
  const awards = [], ledger = new Set();
  const context = { db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    isCleanRun: () => false, awardCoins() {}, getXpAmount: () => 50,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, _xpRefSeq: 0,
    awardXp(_user, event, ref) {
      const key = event + ':' + ref;
      if (ledger.has(key)) return false;
      ledger.add(key); awards.push({ event, ref }); return true;
    } };
  runInNewContext(registry + '\nglobalThis.registeredKeys = SIM_HISTORY_KEYS;\n' + processor, context);
  assert.equal(context.registeredKeys.filter(key => key === 'sim769').length, 1);
  const state = history => ({ playthroughs: [{ startedAt: 1, path: [1], sim769: { history } }] });
  const before = state([]), after = state(['win', 'loss', 'continue', 'captured', 'cancelled'].map((outcome, i) => ({ outcome, ts: i + 10 })));
  context.processStateXp(1, 769, before, after, 0);
  context.processStateXp(1, 769, after, after, 0);
  assert.deepEqual(awards, [{ event: 'battlesim_win', ref: 'sim769:10' }, { event: 'battlesim_loss', ref: 'sim769:11' }]);
});

import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(671);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { newShamutantiCharacter, startShamutantiFight, shamutantiRound,
  resolveShamutantiLuck, spareShamutanti, canSpareShamutanti,
  healShamutantiCharacter, shamutantiOtherSpell, setShamutantiEnemySkill }
  from '../../../public/js/battlesim/engines/shamutanti/core.js';
import { SHAMUTANTI_FIGHTS } from '../../../public/js/battlesim/engines/shamutanti/roster.js';

const constant = value => () => value;
const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected die roll');
  return values.shift();
};
const character = changes => ({ ...newShamutantiCharacter('wizard', constant(6)), ...changes });
const start = (section, changes = {}, options = {}, roll) =>
  startShamutantiFight(section, character(changes), { applyEntry: false, ...options }, roll);
const settle = fight => fight.pending ? resolveShamutantiLuck(fight, false) : fight;

test('desktop registration and shortcut overlay include this simulator once', () => {
  const loader = readFileSync(new URL('../../../public/js/battlesim/loader.js', import.meta.url), 'utf8');
  const ids = loader.match(/const SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/\d+/g).map(Number);
  assert.equal(ids.filter(id => id === 671).length, 1);
  const overlays = readFileSync(new URL('../../../public/js/core/util.js', import.meta.url), 'utf8');
  assert.equal(overlays.match(/'sim671-overlay'/g)?.length, 1);
});

test('backend awards each win/loss once and excludes noncombat outcomes', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 671, total_sections: 456, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    if (name === './diamonds') return { diamondInfoForUser: () => ({}) };
    if (name === './rubies') return { rubyInfoForUser: () => ({}), createRubyCompletionChecker: () => () => 0 };
    if (name === './heartbeat-coins') return { advanceHeartbeatCoins: () => 0 };
    throw new Error('Unexpected dependency: ' + name);
  } };
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8')
    + '\nawardXp = (...args) => events.push(args);', { ...context, events });
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim671').length, 1);
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim671: { history } }] });
  const before = state([]);
  const after = state(['win', 'loss', 'escaped', 'bypassed', 'cancelled', 'fled'].map((outcome, i) => ({ outcome, ts: i + 10 })));
  context.module.exports.processStateXp(1, 671, before, after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim671:10'], [1, 'battlesim_loss', 'sim671:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 671, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});

test('printed class rolls, two meals, twenty gold and no invented potion', () => {
  const warrior = newShamutantiCharacter('warrior', constant(1));
  const wizard = newShamutantiCharacter('wizard', constant(6));
  assert.deepEqual([warrior.skill, warrior.stamina, warrior.luck], [7, 14, 7]);
  assert.deepEqual([wizard.skill, wizard.stamina, wizard.luck], [10, 24, 12]);
  assert.deepEqual([wizard.provisions, wizard.gold], [2, 20]);
  assert.equal('potion' in wizard, false);
  assert.throws(() => newShamutantiCharacter('wizard', constant(7)), RangeError);
});

test('all encounter IDs are unique and normal sequential rosters finish completely', () => {
  assert.equal(SHAMUTANTI_FIGHTS.length, 32);
  assert.equal(new Set(SHAMUTANTI_FIGHTS.map(x => x.section)).size, 32);
  for (const spec of SHAMUTANTI_FIGHTS.filter(x => !x.night && !x.morale && !x.summon)) {
    let fight = start(spec.section, { skill: 100, skillInitial: 100, luck: 0 });
    const before = structuredClone(fight);
    let rounds = 0;
    while (fight.status === 'fighting') {
      assert.ok(rounds++ < 100);
      fight = shamutantiRound(fight, constant(6));
    }
    assert.equal(fight.status, 'win');
    assert.equal(fight.destination, spec.win);
    assert.ok(fight.enemies.every(x => x.stamina === 0));
    assert.equal(before.rounds, 0);
    assert.equal(before.character.stamina, 24);
  }
});

test('ties never deal damage, even after many rounds', () => {
  let fight = start(47, { skill: 7, skillInitial: 7, luck: 0 });
  for (let i = 0; i < 30; i++) fight = shamutantiRound(fight, constant(3));
  assert.equal(fight.character.stamina, 24);
  assert.equal(fight.enemies[0].stamina, 6);
});

test('sequential goblins retain separate stamina and do not announce early victory', () => {
  let fight = start(217, { skill: 100, skillInitial: 100, luck: 0 });
  fight.enemies[0].stamina = 2;
  fight = shamutantiRound(fight, constant(1));
  assert.equal(fight.status, 'fighting');
  assert.equal(fight.enemy, 1);
  assert.equal(fight.enemies[1].stamina, 4);
});

test('ordinary player hit applies printed Luck damage and preserves its input', () => {
  const before = start(47, { skill: 100, skillInitial: 100 });
  const pending = shamutantiRound(before, constant(1));
  assert.equal(pending.pending.damage, 2);
  assert.equal(before.enemies[0].stamina, 6);
  const lucky = resolveShamutantiLuck(pending, true, constant(1));
  assert.equal(lucky.enemies[0].stamina, 2);
  assert.equal(lucky.character.luck, 11);
  assert.equal(pending.character.luck, 12);
  const unlucky = resolveShamutantiLuck({ ...pending, character: { ...pending.character, luck: 1 } }, true, constant(6));
  assert.equal(unlucky.enemies[0].stamina, 5);
});

test('troll charm subtracts one from Luck dice without changing the initial score', () => {
  const pending = shamutantiRound(start(47, { skill: 100, skillInitial: 100, luck: 6, luckCharm: true }), constant(1));
  const lucky = resolveShamutantiLuck(pending, true, rolls(3, 4));
  assert.equal(lucky.enemies[0].stamina, 2);
  assert.equal(lucky.character.luck, 5);
  assert.equal(lucky.character.luckInitial, 12);
  assert.deepEqual(lucky.events.find(event => event.kind === 'luck'), { kind: 'luck', roll: 6, rawRoll: 7, modifier: -1, lucky: true });
  assert.equal(pending.character.luck, 6);
  assert.equal(pending.enemies[0].stamina, 6);
});

test('characters without the new charm flag retain their previous Luck behaviour', () => {
  const old = character({ luck: 6 });
  delete old.luckCharm;
  const pending = shamutantiRound(startShamutantiFight(47, { ...old, skill: 100, skillInitial: 100 }, { applyEntry: false }), constant(1));
  const unlucky = resolveShamutantiLuck(pending, true, rolls(3, 4));
  assert.equal(unlucky.enemies[0].stamina, 5);
  assert.equal(unlucky.events.find(event => event.kind === 'luck').modifier, 0);
  assert.equal('luckCharm' in unlucky.character, false);
  assert.throws(() => start(47, { luckCharm: 1 }), RangeError);
});

test('Jan blocks spell encounters without blocking ordinary combat or changing the character', () => {
  const withJan = character({ janPresent: true });
  const before = structuredClone(withJan);
  for (const spec of SHAMUTANTI_FIGHTS.filter(spec => spec.spell)) {
    assert.throws(() => startShamutantiFight(spec.section, withJan), RangeError);
  }
  assert.deepEqual(withJan, before);
  const normal = startShamutantiFight(47, withJan, { applyEntry: false });
  assert.equal(normal.status, 'fighting');
  assert.equal(normal.character.janPresent, true);
});

test('missing companion setting stays compatible and invalid settings are rejected', () => {
  const old = character();
  delete old.janPresent;
  const spell = startShamutantiFight(411, old, { applyEntry: false });
  assert.equal(spell.status, 'fighting');
  assert.equal('janPresent' in spell.character, false);
  assert.equal(newShamutantiCharacter().janPresent, false);
  assert.throws(() => start(47, { janPresent: 1 }), RangeError);
});

test('charm improves incoming Luck but cannot bypass exhausted Luck', () => {
  const pending = shamutantiRound(start(47, { skill: 1, skillInitial: 1, luck: 5, luckCharm: true }), rolls(1, 1, 6, 6));
  const lucky = resolveShamutantiLuck(pending, true, rolls(3, 3));
  assert.equal(lucky.character.stamina, 23);
  assert.equal(lucky.character.luck, 4);
  assert.throws(() => resolveShamutantiLuck({ ...pending, character: { ...pending.character, luck: 0 } }, true, constant(1)), RangeError);
});

test('Manticore poison costs six, or ordinary lucky damage, and cannot revive a dead player', () => {
  const pending = shamutantiRound(start(227, { skill: 1, skillInitial: 1 }), rolls(1, 1, 6, 6, 5));
  assert.equal(pending.pending.poison, true);
  assert.equal(settle(pending).character.stamina, 18);
  assert.equal(resolveShamutantiLuck(pending, true, constant(1)).character.stamina, 23);
  const fatal = settle({ ...pending, character: { ...pending.character, stamina: 1 } });
  assert.equal(fatal.status, 'loss');
  assert.throws(() => healShamutantiCharacter(fatal.character, 'libra'), RangeError);
});

test('section325 halves ENEMY skill for four rounds, never player base skill', () => {
  let fight = start(325, { luck: 0 });
  for (let i = 1; i <= 5; i++) {
    fight = shamutantiRound(fight, rolls(1, 1, 6, 6, 1));
    assert.equal(fight.events.find(x => x.kind === 'attack').enemySkill, i <= 4 ? 6 : 12);
    assert.equal(fight.character.skill, 10);
  }
});

test('wood monster penalty ends after four rounds', () => {
  let fight = start(383, { skill: 1, skillInitial: 1, luck: 0 });
  for (let i = 1; i <= 5; i++) {
    fight = shamutantiRound(fight, constant(3));
    assert.equal(fight.events.find(x => x.kind === 'attack').enemySkill, i <= 4 ? 4 : 8);
  }
});

test('weapon recovery uses the printed per-round odd/even check after round four', () => {
  let fight = start(317, { skill: 1, skillInitial: 1, luck: 0 });
  for (let i = 0; i < 4; i++) fight = shamutantiRound(fight, constant(3));
  fight = shamutantiRound(fight, rolls(2, 1, 1, 1, 1));
  assert.equal(fight.events.find(x => x.kind === 'attack').enemySkill, 8);
  fight = shamutantiRound(fight, rolls(3, 1, 1, 1, 1));
  assert.equal(fight.events.find(x => x.kind === 'attack').enemySkill, 4);
});

test('explicit enemy override keeps wounds, skips automatic recovery dice and can be cleared', () => {
  let fight = start(317, { skill: 1, skillInitial: 1, luck: 0 });
  for (let i = 0; i < 4; i++) fight = shamutantiRound(fight, constant(3));
  const snapshot = structuredClone(fight);
  const manual = setShamutantiEnemySkill(fight, 8);
  assert.deepEqual(fight, snapshot);
  assert.equal(manual.rounds, 4);
  assert.equal(manual.enemies[0].stamina, fight.enemies[0].stamina);
  assert.equal(manual.enemies[0].skill, 4);
  fight = shamutantiRound(manual, rolls(1, 1, 1, 1));
  assert.equal(fight.events.find(event => event.kind === 'attack').enemySkill, 8);
  fight = setShamutantiEnemySkill(fight, null);
  fight = shamutantiRound(fight, rolls(3, 1, 1, 1, 1));
  assert.equal(fight.events.find(event => event.kind === 'attack').enemySkill, 4);
  assert.throws(() => setShamutantiEnemySkill(fight, -1), RangeError);
});

test('enemy override is target-local and cannot bypass a pending Luck decision', () => {
  let fight = start(217, { skill: 100, skillInitial: 100, luck: 0 });
  fight.enemies[0].stamina = 2;
  fight = setShamutantiEnemySkill(fight, 0);
  fight = shamutantiRound(fight, constant(1));
  assert.equal(fight.enemy, 1);
  fight = shamutantiRound(fight, constant(1));
  assert.equal(fight.events.find(event => event.kind === 'attack').enemySkill, 6);
  const pending = shamutantiRound(start(47, { skill: 100, skillInitial: 100 }), constant(1));
  assert.throws(() => setShamutantiEnemySkill(pending, 8), RangeError);
});

test('BIG doubles fight skill without modifying saved skill; manual override is explicit', () => {
  const original = character();
  const pending = shamutantiRound(startShamutantiFight(411, original, { applyEntry: false }), constant(1));
  assert.equal(pending.events.find(x => x.kind === 'attack').playerAttack, 22);
  assert.equal(pending.character.skill, 10);
  assert.equal(original.skill, 10);
  const manual = shamutantiRound(start(47, {}, { skillOverride: 15 }), constant(1));
  assert.equal(manual.events.find(x => x.kind === 'attack').playerAttack, 17);
});

test('summoned giant absorbs damage and surviving enemy persists into player fallback', () => {
  let fight = start(361);
  fight.allies[0].stamina = 2;
  fight.enemies[0].stamina = 7;
  fight = shamutantiRound(fight, rolls(1, 1, 6, 6));
  assert.equal(fight.ally, 1);
  assert.equal(fight.enemies[0].stamina, 7);
  assert.equal(fight.character.stamina, 24);
  fight = shamutantiRound(fight, rolls(1, 1, 6, 6));
  assert.equal(fight.pending.ally, false);
});

test('poison kills summoned goblin outright but costs giant six stamina', () => {
  let goblins = start(369, {}, { summonCount: 2 });
  goblins = shamutantiRound(goblins, rolls(1, 1, 6, 6, 6));
  assert.equal(goblins.allies[0].stamina, 0);
  assert.equal(goblins.allies[1].stamina, 5);
  assert.equal(goblins.ally, 1);
  const giant = shamutantiRound(start(388), rolls(1, 1, 6, 6, 6));
  assert.equal(giant.allies[0].stamina, 3);
  assert.equal(giant.character.stamina, 24);
});

test('summoning charges per ally, and wolfhound missing-teeth fallback costs five', () => {
  assert.equal(start(369, {}, { applyEntry: true, summonCount: 3 }).character.stamina, 21);
  assert.equal(start(425, {}, { applyEntry: true, summonCount: 0 }).character.stamina, 19);
  assert.equal(start(425, {}, { applyEntry: true, summonCount: 2 }).character.stamina, 22);
  assert.throws(() => start(361, {}, { summonCount: 0 }), RangeError);
  assert.throws(() => start(369, {}, { summonCount: 0 }), RangeError);
});

test('morale tests each survivor separately and all fleeing is not a battle win', () => {
  const all = start(407, {}, {}, constant(6));
  assert.equal(all.status, 'allFled');
  assert.equal(all.destination, 202);
  const one = start(407, {}, {}, rolls(6, 6, 1, 1));
  assert.equal(one.enemy, 1);
  assert.equal(one.enemies[0].fled, true);
  assert.equal(one.enemies[1].fled, false);
});

test('night encounter uses actual caller and modified die, not a fixed destination', () => {
  assert.throws(() => start(123), RangeError);
  const bat = start(123, {}, { previousSection: 108, nightResult: 1 });
  assert.equal(bat.enemies[0].skill, 5);
  assert.equal(bat.config.win, 108);
  const none = start(123, {}, { previousSection: 283, nightResult: 4, nightModifier: 2 });
  assert.equal(none.status, 'noEncounter');
  assert.equal(none.destination, 283);
  assert.throws(() => start(123, {}, { previousSection: 108, nightModifier: 1 }), RangeError);
});

test('every summoned encounter carries enemy wounds through allies to a complete victory', () => {
  for (const spec of SHAMUTANTI_FIGHTS.filter(item => item.summon)) {
    let fight = start(spec.section, { skill: 100, skillInitial: 100, luck: 0 },
      { summonCount: spec.summon.multiple ? 2 : 1 });
    const snapshot = JSON.stringify(fight);
    let rounds = 0;
    while (fight.status === 'fighting') {
      assert.ok(rounds++ < 100);
      const enemyStamina = fight.enemies[0].stamina;
      fight = shamutantiRound(fight, constant(6));
      assert.ok(fight.enemies[0].stamina <= enemyStamina);
    }
    assert.equal(fight.status, 'win');
    assert.equal(fight.destination, spec.win);
    assert.equal(fight.character.stamina, 24);
    assert.equal(JSON.parse(snapshot).rounds, 0);
    assert.equal(fight.character.skill, 100);
  }
});

test('all spell encounters reject warrior characters without mutating them', () => {
  const warrior = newShamutantiCharacter('warrior', constant(6));
  const snapshot = JSON.stringify(warrior);
  for (const spec of SHAMUTANTI_FIGHTS.filter(item => item.spell)) {
    assert.throws(() => startShamutantiFight(spec.section, warrior, { summonCount: 1 }), RangeError);
    assert.equal(JSON.stringify(warrior), snapshot);
  }
});

test('a successful final hit remains pending until Luck is resolved, then finishes once', () => {
  const before = start(47, { skill: 100, skillInitial: 100 });
  before.enemies[0].stamina = 1;
  const pending = shamutantiRound(before, constant(1));
  assert.equal(pending.status, 'fighting');
  assert.throws(() => shamutantiRound(pending, constant(1)), RangeError);
  assert.equal(pending.enemies[0].stamina, 1);
  const win = resolveShamutantiLuck(pending, false);
  assert.equal(win.status, 'win');
  assert.equal(win.destination, 186);
  assert.throws(() => resolveShamutantiLuck(win, false), RangeError);
});

test('a lethal spell-entry cost cannot start an ally or generate a phantom victory', () => {
  const before = character({ stamina: 1 });
  const fight = startShamutantiFight(361, before);
  assert.equal(fight.status, 'loss');
  assert.equal(fight.character.stamina, 0);
  assert.equal(fight.rounds, 0);
  assert.equal(before.stamina, 1);
  assert.throws(() => shamutantiRound(fight), RangeError);
});

test('shield consumes book gold once and subtracts enemy attack strength, not damage', () => {
  const fight = start(441, {}, { applyEntry: true });
  assert.equal(fight.character.gold, 19);
  assert.equal(fight.character.stamina, 23);
  const pending = shamutantiRound(fight, rolls(1, 1, 6, 6));
  assert.equal(pending.events.find(x => x.kind === 'attack').enemyAttack, 18);
  assert.equal(pending.pending.damage, 2);
  assert.equal(start(400, {}, { applyEntry: true }).character.stamina, 19);
  assert.throws(() => start(386, { gold: 0 }, { applyEntry: true }), RangeError);
  assert.equal(start(386, { gold: 0 }, { applyEntry: false }).character.gold, 0);
});

test('wax doubles resolved outgoing damage, special sword hits for three, Ragnar requires sword', () => {
  const wax = shamutantiRound(start(328, { skill: 100, skillInitial: 100 }), constant(1));
  assert.equal(resolveShamutantiLuck(wax, true, constant(1)).enemies[0].stamina, 0);
  const sword = settle(shamutantiRound(start(47, { skill: 100, skillInitial: 100, weapon: 'specialSword' }), constant(1)));
  assert.equal(sword.enemies[0].stamina, 3);
  const scimitar = shamutantiRound(start(47, { weapon: 'scimitar', ragnarBand: true }), constant(1));
  assert.equal(scimitar.events.find(x => x.kind === 'attack').playerAttack, 13);
  assert.throws(() => start(328, { weapon: 'axe' }), RangeError);
});

test('curse adds one to non-spell wounds, not spell costs or allied damage', () => {
  assert.equal(start(2, { cursed: true }, { applyEntry: true }).character.stamina, 22);
  assert.equal(start(411, { cursed: true }, { applyEntry: true }).character.stamina, 22);
  const wound = settle(shamutantiRound(start(47, { cursed: true, skill: 1, skillInitial: 1 }), rolls(1, 1, 6, 6)));
  assert.equal(wound.character.stamina, 21);
  const ally = shamutantiRound(start(361, { cursed: true }), rolls(1, 1, 6, 6));
  assert.equal(ally.allies[0].stamina, 7);
  assert.equal(ally.character.stamina, 24);
});

test('mercy requires resolved wounds and both printed thresholds', () => {
  const fight = start(117);
  fight.enemies[0].stamina = 3;
  assert.equal(canSpareShamutanti(fight), true);
  assert.equal(spareShamutanti(fight).destination, 187);
  fight.character.stamina = 5;
  assert.equal(canSpareShamutanti(fight), false);
});

test('other spell choice waits for allied fighters to die and preserves enemy wounds', () => {
  const fight = start(388);
  assert.throws(() => shamutantiOtherSpell(fight), RangeError);
  fight.ally = 1;
  fight.enemies[0].stamina = 3;
  const next = shamutantiOtherSpell(fight);
  assert.equal(next.destination, 420);
  assert.equal(next.enemies[0].stamina, 3);
  const continuation = startShamutantiFight(227, next.character, { applyEntry: false, carryFrom: next });
  assert.equal(continuation.enemies[0].stamina, 3);
  assert.equal(next.enemies[0].stamina, 3);
  const newSummon = startShamutantiFight(388, next.character, { applyEntry: false, carryFrom: next });
  assert.equal(newSummon.enemies[0].stamina, 3);
  assert.equal(newSummon.allies[0].stamina, 9);
  assert.throws(() => startShamutantiFight(47, next.character, { carryFrom: next }), RangeError);
  assert.throws(() => startShamutantiFight(227, next.character, { carryFrom: fight }), RangeError);
});

test('first/later meals and one-use Libra preserve the original character', () => {
  const original = character({ stamina: 10 });
  assert.equal(healShamutantiCharacter(original, 'meal', 2).stamina, 12);
  assert.equal(healShamutantiCharacter(original, 'meal', 1).stamina, 11);
  const restored = healShamutantiCharacter(original, 'libra');
  assert.equal(restored.stamina, 24);
  assert.equal(original.stamina, 10);
  assert.throws(() => healShamutantiCharacter(restored, 'libra'), RangeError);
});

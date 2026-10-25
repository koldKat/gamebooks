import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(665);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { newThievesCharacter, validateThievesCharacter, startThievesFight,
  thievesTargets, thievesRound, resolveThievesLuck, canEscapeThieves,
  escapeThievesFight, bypassThievesFight, healThievesCharacter, testThievesLuck }
  from '../../../public/js/battlesim/engines/city-of-thieves/core.js';
import { THIEVES_FIGHTS, THIEVES_RULES, thievesHasRule, thievesRandomEncounter } from '../../../public/js/battlesim/engines/city-of-thieves/roster.js';

const constant = value => () => value;
const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected extra die');
  return values.shift();
};
const character = changes => ({ ...newThievesCharacter(constant(6)), ...changes });
const settle = fight => {
  while (fight.pending.length) fight = resolveThievesLuck(fight, false);
  return fight;
};

test('panel help and random-opponent lookup follow loaded roster settings', () => {
  const rules=structuredClone(THIEVES_RULES),first=THIEVES_FIGHTS[0];
  const hadFlag=Object.hasOwn(first,'randomEnemy'),flag=first.randomEnemy;
  try {
    assert.equal(thievesRandomEncounter().section,201);
    assert.equal(thievesRandomEncounter().enemies.length,6);
    THIEVES_RULES.ruleSections=[10];
    assert.equal(thievesHasRule(10),true);assert.equal(thievesHasRule('10'),false);
    assert.equal(thievesHasRule(73),false);
    first.randomEnemy=true;assert.equal(thievesRandomEncounter(),first);
  } finally {
    Object.assign(THIEVES_RULES,rules);
    if(hadFlag)first.randomEnemy=flag;else delete first.randomEnemy;
  }
});

test('backend registers wins and losses once, without awarding escape, bypass or cancellation', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 665, total_sections: 400, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    if (name === './diamonds') return { diamondInfoForUser: () => ({}) };
    if (name === './rubies') return { rubyInfoForUser: () => ({}), createRubyCompletionChecker: () => () => 0 };
    if (name === './heartbeat-coins') return { advanceHeartbeatCoins: () => 0 };
    if (name === './job-xp') return { getJobTitle: () => 'test' };
    throw new Error('Unexpected dependency: ' + name);
  } };
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8')
    + '\nawardXp = (...args) => events.push(args);', context);
  assert.ok(context.module.exports.SIM_HISTORY_KEYS.includes('sim665'));
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim665').length, 1);
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim665: { history } }] });
  const before = state([]), after = state(['win', 'loss', 'escaped', 'bypassed', 'cancelled'].map((outcome, index) => ({ outcome, ts: index + 10 })));
  context.module.exports.processStateXp(1, 665, before, after);
  assert.deepEqual(events.filter(event => event[1].startsWith('battlesim_')).map(event => [...event]),
    [[1, 'battlesim_win', 'sim665:10'], [1, 'battlesim_loss', 'sim665:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 665, after, after);
  assert.ok(events.every(event => !event[1].startsWith('battlesim_')));
});

test('printed starting rolls, ten meals, thirty gold and one selected single-use potion', () => {
  const minimum = newThievesCharacter(constant(1)), maximum = newThievesCharacter(constant(6));
  assert.deepEqual([minimum.skill, minimum.stamina, minimum.luck], [7, 14, 7]);
  assert.deepEqual([maximum.skill, maximum.stamina, maximum.luck], [12, 24, 12]);
  assert.deepEqual([minimum.provisions, minimum.gold, minimum.potionUses], [10, 30, 1]);
  assert.equal(validateThievesCharacter(maximum), maximum);
  assert.throws(() => newThievesCharacter(constant(7)), RangeError);
});

test('all 43 encounters and 72 source opponent rows have valid full group coverage', () => {
  assert.equal(THIEVES_FIGHTS.length, 43);
  assert.equal(THIEVES_FIGHTS.flatMap(fight => fight.enemies).length, 72);
  assert.equal(new Set(THIEVES_FIGHTS.map(fight => fight.section)).size, 43);
  for (const spec of THIEVES_FIGHTS) {
    assert.deepEqual(spec.groups.flat().sort((a, b) => a - b), spec.enemies.map((_, index) => index));
    assert.ok(spec.win >= 1 && spec.win <= 400);
    for (const enemy of spec.enemies) assert.ok(enemy.skill > 0 && enemy.stamina > 0);
  }
});

test('every printed combat finishes only after every required enemy is defeated', () => {
  for (const spec of THIEVES_FIGHTS) {
    const choices = spec.randomEnemy ? [1, 2, 3, 4, 5, 6] : [0];
    for (const randomEnemy of choices) {
      let fight = startThievesFight(spec.section,
        character({ skill: 100, skillInitial: 100, luck: 0 }), { applyEntry: false, randomEnemy });
      const original = structuredClone(fight);
      let rounds = 0;
      while (fight.status === 'fighting') {
        assert.ok(rounds++ < 100, 'Fight did not terminate');
        fight = thievesRound(fight, thievesTargets(fight)[0], constant(6));
      }
      assert.equal(fight.status, 'win');
      assert.ok(fight.config.groups.flat().every(index => fight.enemies[index].stamina === 0));
      assert.equal(original.rounds, 0);
      assert.ok(original.enemies.every(enemy => enemy.stamina > 0));
      assert.equal(fight.destination, spec.section === 10 ? 212 : spec.win);
    }
  }
});

test('sequential guards cannot turn the first kill into a completed victory', () => {
  let fight = startThievesFight(130, character({ skill: 100, skillInitial: 100, luck: 0 }));
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, constant(1));
  assert.equal(fight.status, 'fighting');
  assert.deepEqual(thievesTargets(fight), [1]);
  assert.equal(fight.destination, null);
});

test('311 requires the first guard, then both simultaneous guards, with target switching', () => {
  let fight = startThievesFight(311, character({ luck: 0 }));
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1));
  assert.deepEqual(thievesTargets(fight), [1, 2]);
  fight.enemies[1].stamina = 2;
  fight = thievesRound(fight, 1, rolls(6, 6, 1, 1, 1, 1));
  assert.equal(fight.status, 'fighting');
  assert.equal(fight.enemies[2].stamina, 5);
  assert.deepEqual(thievesTargets(fight), [2]);
});

test('326 shares player Attack Strength but only the chosen enemy can be wounded', () => {
  const original = startThievesFight(326, character({ luck: 0 }));
  const fight = thievesRound(original, 0, rolls(6, 6, 1, 1, 1, 1));
  assert.equal(fight.enemies[0].stamina, 2);
  assert.equal(fight.enemies[1].stamina, 3);
  const attacks = fight.events.filter(event => event.kind === 'attack');
  assert.equal(attacks[0].playerAttack, attacks[1].playerAttack);
  assert.equal(original.enemies[0].stamina, 4);
});

test('ties are harmless and club/unarmed penalties apply to the printed encounters', () => {
  let fight = startThievesFight(5, character({ skill: 8, luck: 0 }));
  fight = thievesRound(fight, 0, constant(1));
  assert.equal(fight.enemies[0].stamina, 5);
  assert.equal(fight.character.stamina, 24);
  assert.equal(startThievesFight(152, character()).config.attackModifier, -2);
  assert.equal(startThievesFight(157, character()).config.attackModifier, -3);
});

test('Luck can save a player from an otherwise fatal wound without reviving a dead character', () => {
  const original = startThievesFight(5, character({ stamina: 2 }));
  const pending = thievesRound(original, 0, rolls(1, 1, 6, 6));
  assert.equal(pending.character.stamina, 2);
  assert.equal(pending.status, 'fighting');
  const saved = resolveThievesLuck(pending, true, constant(1));
  assert.equal(saved.character.stamina, 1);
  assert.equal(saved.character.luck, 11);
  const dead = resolveThievesLuck(pending, false);
  assert.equal(dead.status, 'loss');
  assert.throws(() => resolveThievesLuck(dead, true, constant(1)), RangeError);
  assert.throws(() => healThievesCharacter(dead.character, 'potion'), RangeError);
});

test('Luck resolves before an apparent final enemy kill is certified', () => {
  let fight = startThievesFight(5, character({ luck: 1 }));
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.status, 'fighting');
  fight = resolveThievesLuck(fight, true, constant(6));
  assert.equal(fight.enemies[0].stamina, 1);
  assert.equal(fight.status, 'fighting');
});

test('fire breath still resolves on a final blow and simultaneous death is a loss', () => {
  let fight = startThievesFight(392, character({ stamina: 1 }));
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1, 1));
  fight = resolveThievesLuck(fight, false);
  assert.equal(fight.enemies[0].stamina, 0);
  assert.equal(fight.status, 'fighting');
  assert.equal(resolveThievesLuck(fight, false).status, 'loss');
  const survived = resolveThievesLuck(fight, true, constant(1));
  assert.equal(survived.status, 'win');
  assert.equal(survived.character.stamina, 1);
});

test('poisonous snakes and blacksmith deal their printed four and three damage', () => {
  for (const [section, damage] of [[253, 4], [323, 3]]) {
    let fight = startThievesFight(section, character({ skill: 1, luck: 0 }));
    fight = thievesRound(fight, 0, rolls(1, 1, 6, 6));
    assert.equal(fight.character.stamina, 24 - damage);
  }
});

test('snake-queen entry effects can be explicitly skipped if already entered manually', () => {
  const original = character();
  const fight = startThievesFight(88, original);
  assert.equal(fight.character.stamina, 20);
  assert.equal(fight.character.skill, 11);
  assert.equal(startThievesFight(88, original, { applyEntry: false }).character.stamina, 24);
  assert.equal(original.stamina, 24);
  assert.equal(startThievesFight(79, character({ stamina: 3 })).status, 'loss');
});

test('escape requires printed permission and timing, and its wound permits Luck', () => {
  assert.equal(canEscapeThieves(startThievesFight(5, character())), false);
  let fight = startThievesFight(140, character({ skill: 8 }));
  assert.equal(canEscapeThieves(fight), false);
  for (let round = 0; round < 3; round++) fight = thievesRound(fight, 0, constant(1));
  assert.equal(canEscapeThieves(fight), true);
  fight = escapeThievesFight(fight);
  assert.equal(fight.status, 'fighting');
  fight = resolveThievesLuck(fight, true, constant(1));
  assert.equal(fight.status, 'escaped');
  assert.equal(fight.destination, 282);
  assert.equal(fight.character.stamina, 23);
});

test('troll escape is unavailable until Sourbelly dies and discards the shield', () => {
  let fight = startThievesFight(73, character({ magicShield: true, luck: 0 }));
  assert.equal(canEscapeThieves(fight), false);
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(canEscapeThieves(fight), true);
  fight = escapeThievesFight(fight);
  assert.equal(fight.status, 'escaped');
  assert.equal(fight.character.skill, 11);
  assert.equal(fight.character.magicShield, false);
  assert.equal(fight.destination, 239);
});

test('six-round guard threshold selects the correct victory destination', () => {
  let fight = startThievesFight(10, character({ luck: 0 }));
  fight.rounds = 6; fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.destination, 130);
});

test('meals heal four, single-dose potions restore stats, fortune increases initial Luck', () => {
  const original = character({ stamina: 10, luck: 2, potion: 'fortune' });
  assert.equal(healThievesCharacter(original, 'provisions').stamina, 14);
  const restored = healThievesCharacter(original, 'potion');
  assert.deepEqual([restored.luck, restored.luckInitial, restored.potionUses], [13, 13, 0]);
  assert.throws(() => healThievesCharacter(restored, 'potion'), RangeError);
  assert.equal(original.potionUses, 1);
  assert.equal(healThievesCharacter(character({ skill: 1 }), 'potion').skill, 12);
  assert.equal(healThievesCharacter(character({ stamina: 1, potion: 'strength' }), 'potion').stamina, 24);
});

test('mummy fire-ring route is a bypass, not an XP-producing combat victory', () => {
  const fight = startThievesFight(193, character({ fireRing: true }));
  const bypassed = bypassThievesFight(fight);
  assert.equal(bypassed.status, 'bypassed');
  assert.equal(bypassed.destination, 286);
  assert.equal(fight.status, 'fighting');
  assert.throws(() => bypassThievesFight(startThievesFight(193, character())), RangeError);
});

test('healing brooch triggers once after surviving the complete encounter, never on death', () => {
  let fight = startThievesFight(130, character({ stamina: 10, healingBrooch: true, luck: 0 }));
  fight.enemies[0].stamina = 2;
  fight = thievesRound(fight, 0, rolls(6, 6, 1, 1));
  assert.equal(fight.character.stamina, 10);
  fight.enemies[1].stamina = 2;
  fight = thievesRound(fight, 1, rolls(6, 6, 1, 1));
  assert.equal(fight.character.stamina, 11);
  let death = startThievesFight(5, character({ stamina: 1, healingBrooch: true, luck: 0 }));
  death = thievesRound(death, 0, rolls(1, 1, 6, 6));
  assert.equal(death.status, 'loss');
  assert.equal(death.character.stamina, 0);
});

test('random encounter roll, standalone Luck and invalid input preserve caller state', () => {
  const original = character();
  const fight = startThievesFight(201, original, {}, constant(6));
  assert.deepEqual(thievesTargets(fight), [5]);
  assert.equal(fight.enemies[5].name, 'caveTroll');
  assert.equal(testThievesLuck(original, constant(1)).character.luck, 11);
  assert.equal(original.luck, 12);
  assert.throws(() => startThievesFight(999, original), RangeError);
  assert.throws(() => thievesRound(fight, 0, constant(1)), RangeError);
  assert.throws(() => startThievesFight(201, original, { randomEnemy: 7 }), RangeError);
  assert.equal(fight.rounds, 0);
});


test('captured fire-breath rules and legacy boolean saves preserve wounds and source state', () => {
  for (const legacy of [false,true]) {
    const original=JSON.parse(JSON.stringify(startThievesFight(392,character({stamina:5,luck:0}))));
    original.config.fireBreath=legacy?true:{maxRoll:6,damage:3};
    original.legacyExtension={retained:true};
    const next=thievesRound(original,0,rolls(6,6,1,1,1));
    assert.equal(next.character.stamina,legacy?4:2);
    assert.equal(original.character.stamina,5);
    assert.deepEqual(next.legacyExtension,{retained:true});
    if (legacy) assert.equal(next.config.fireBreath,true);
  }
});

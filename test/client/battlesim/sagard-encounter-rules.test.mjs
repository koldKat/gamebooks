import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, sagardTurn, resolveSagardTurn, fleeSagardFight, healSagardFight,
  withdrawSagardFight, throwSagardProjectile, validateSagardFight, grappleSagardFight,
  useSagardStunStone} from '../../../public/js/battlesim/engines/sagard/core.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

// Synthetic values exercise mechanics; installed books remain the source of actual encounter data.
const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, level) =>
  [level, [0, 1, 2, level + 1]]))};
const foe = (name = 'Synthetic foe', hp = 20, extra = {}) => ({name, level: 2, hp, ...extra});
const reload = value => JSON.parse(JSON.stringify(value));
const start = (spec = {}, hero = {}, options = {}, ruleOptions = {}) => startSagardFight({level: 3, hp: 20, ...hero},
  {name: 'Synthetic encounter', opponents: [foe()], restartOnLoss: true, ...spec}, {...rules, ...ruleOptions}, options);
const step = (fight, die = 1, target) => resolveSagardTurn(reload(fight), die, {target});

test('a grapple replaces the hero attack and even a successful attempt permits the enemy reply', () => {
  for (const die of [1, 4]) {
    let fight = grappleSagardFight(start({grappleTarget: 'taken'}), die);
    assert.equal(fight.opponents[0].hp, 20); assert.equal(fight.status, 'fighting');
    assert.equal(sagardTurn(fight).attackerId, 'enemy0');
    fight = step(fight, 2); assert.equal(fight.hero.hp, 19);
    assert.equal(fight.status, die === 4 ? 'win' : 'fighting');
    if (die === 4) assert.equal(fight.destination, 'taken');
  }
  let lost = grappleSagardFight(start({grappleTarget: 'taken'}, {hp: 1}), 4);
  lost = step(lost, 2); assert.equal(lost.status, 'loss');
  assert.throws(() => grappleSagardFight(start(), 4));
});

test('a manually held stun stone grants two free attacks before the ordinary hero action', () => {
  let fight = start({}, {}, {stunStone: true}, {stunStoneEnabled: true});
  fight = useSagardStunStone(fight, 1); assert.equal(fight.phase, 'stoneAttack');
  assert.equal(sagardTurn(fight).canFlee, false); assert.throws(() => useSagardStunStone(fight, 1));
  fight = step(fight, 2); assert.equal(fight.stoneAttacksRemaining, 1); assert.equal(fight.cursor, 0);
  fight = step(fight, 2); assert.equal(fight.phase, 'round'); assert.equal(fight.cursor, 0);
  fight = step(fight, 2); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  assert.equal(fight.opponents[0].hp, 17); assert.equal(fight.heroAttacksThisRound, 1);
});

test('stone breakage needs its confirming roll and remains unavailable in saved setup', () => {
  for (const confirm of [1, 2, 3, 4]) {
    let fight = start({}, {}, {stunStone: true}, {stunStoneEnabled: true});
    fight = useSagardStunStone(fight, 4); assert.equal(fight.phase, 'stoneConfirm');
    fight = step(fight, confirm); assert.equal(fight.stunStone.broken, confirm >= 3);
    assert.equal(fight.phase, confirm >= 3 ? 'round' : 'stoneAttack');
    if (confirm >= 3) {
      assert.throws(() => useSagardStunStone(fight, 1));
      const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
      assert.equal(state.setup.stunStone, false); assert.equal(state.setup.stunStoneBroken, true);
    }
  }
});

test('a four creates a lamp opportunity after damage, while a failed or declined attempt resumes the correct turn', () => {
  const damaged = step(start({lampTarget: 'lamp'}), 4);
  assert.equal(damaged.opponents[0].hp, 16); assert.equal(damaged.phase, 'lamp');
  const won = step(damaged, 4); assert.equal(won.status, 'win'); assert.equal(won.destination, 'lamp');
  const failed = step(damaged, 2); assert.equal(sagardTurn(failed).attackerId, 'enemy0');
  const skipped = resolveSagardTurn(damaged, null, {decision: 'skip'});
  assert.equal(sagardTurn(skipped).attackerId, 'enemy0');
});

test('a successful stone stun also grants a lamp attempt, then retains both free attacks on failure', () => {
  let fight = start({lampTarget: 'lamp'}, {}, {stunStone: true}, {stunStoneEnabled: true});
  fight = useSagardStunStone(fight, 2); assert.equal(fight.phase, 'lamp');
  fight = step(fight, 1); assert.equal(fight.phase, 'stoneAttack'); assert.equal(fight.stoneAttacksRemaining, 2);
  fight = step(fight, 4); assert.equal(fight.phase, 'lamp');
  fight = step(fight, 1); assert.equal(fight.phase, 'stoneAttack'); assert.equal(fight.stoneAttacksRemaining, 1);
  fight = step(fight, 1); assert.equal(fight.phase, 'round'); assert.equal(sagardTurn(fight).attackerId, 'hero');
});

test('an unarmed penalty follows the current hero level and preserves the permanent setup level', () => {
  for (let level = 0; level <= 5; level++) {
    const fight = start({heroLevelPenalty: 1}, {level});
    assert.equal(fight.hero.level, Math.max(0, level - 1)); assert.equal(fight.baseHeroLevel, level);
    assert.deepEqual(fight.hero.chart, rules.damageByLevel[Math.max(0, level - 1)]);
    const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
    assert.equal(state.setup.level, level);
  }
});

test('explicit weapon faces override bonuses while a hit-only bonus leaves misses unchanged', () => {
  let fight = start({}, {damageBonus: 2, damageOverrides: {4: 0}});
  fight = step(fight, 4); assert.equal(fight.opponents[0].hp, 20);
  fight = step(fight); fight = step(fight, 3); assert.equal(fight.opponents[0].hp, 16);
  fight = start({}, {damageBonus: 2, damageOverrides: {4: 5}});
  fight = step(fight, 4); assert.equal(fight.opponents[0].hp, 15);
  fight = start({initiative: 'enemy', opponents: [foe('Synthetic sword carrier', 20, {damageBonus: 1, bonusOnHitOnly: true})]});
  fight = step(fight, 1); assert.equal(fight.hero.hp, 20);
  fight = step(fight); fight = step(fight, 2); assert.equal(fight.hero.hp, 18);
  assert.throws(() => start({}, {damageOverrides: {5: 8}}));
});

test('alternating group attacks put a hero action between enemies and omit defeated opponents next round', () => {
  let fight = start({initiative: 'enemy', alternateEnemyHero: true, opponents: [foe('First', 1), foe('Second')]});
  const order = [];
  for (let n = 0; n < 4; n++) {
    order.push(sagardTurn(fight).attackerId); fight = step(fight, n === 1 ? 2 : 1, n === 1 ? 'enemy0' : undefined);
  }
  assert.deepEqual(order, ['enemy0', 'hero', 'enemy1', 'hero']);
  assert.equal(fight.round, 2); assert.deepEqual(fight.queue, ['enemy1', 'hero']);
});

test('repeated double attacks apply in every round and a separate opening override applies only once', () => {
  let fight = start({heroAttacksPerRound: 2});
  for (let round = 1; round <= 3; round++) {
    for (let n = 0; n < 2; n++) {assert.equal(sagardTurn(fight).attackerId, 'hero'); fight = step(fight);}
    assert.equal(sagardTurn(fight).attackerId, 'enemy0'); fight = step(fight);
    assert.equal(fight.round, round + 1);
  }
  fight = start({heroAttacksPerRound: 2, heroOpeningAttacks: 1});
  fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy0'); fight = step(fight);
  fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'hero');
});

test('remaining HP updates a conditional enemy level and damage chart before its reply', () => {
  let fight = start({opponents: [foe('Synthetic weakening enemy', 8, {hpBands: [
    {minHp: 6, maxHp: 8, level: 4}, {minHp: 1, maxHp: 5, level: 1}]
  })]});
  assert.equal(fight.opponents[0].level, 4);
  fight = step(fight, 3); assert.equal(fight.opponents[0].hp, 6); assert.equal(fight.opponents[0].level, 4);
  fight = step(fight); fight = step(fight, 2);
  assert.equal(fight.opponents[0].hp, 5); assert.equal(fight.opponents[0].level, 1);
  fight = step(fight, 4); assert.equal(fight.hero.hp, 18);
  assert.deepEqual(validateSagardFight(reload(fight)), fight);
});

test('explicit initiative faces distinguish low-half initiative from the ordinary even-number rule', () => {
  for (const die of [1, 2, 3, 4]) {
    const low = step(start({initiative: 'random', heroInitiativeDice: [1, 2]}), die);
    assert.equal(sagardTurn(low).attackerId, die < 3 ? 'hero' : 'enemy0');
    const parity = step(start({initiative: 'random'}), die);
    assert.equal(sagardTurn(parity).attackerId, die % 2 === 0 ? 'hero' : 'enemy0');
  }
});

test('a required first round blocks escape, and a one-only attempt has the printed probability', () => {
  let fight = start({escape: 'one', escapeAfterRounds: 1, escapeTarget: '9'});
  assert.equal(sagardTurn(fight).canFlee, false); assert.throws(() => fleeSagardFight(fight, 1));
  fight = step(fight); fight = step(fight); assert.equal(sagardTurn(fight).canFlee, true);
  const failed = fleeSagardFight(reload(fight), 2);
  assert.equal(failed.status, 'fighting'); assert.equal(sagardTurn(failed).attackerId, 'hero');
  assert.equal(sagardTurn(failed).canFlee, false);
  const escaped = fleeSagardFight(reload(fight), 1); assert.equal(escaped.status, 'fled'); assert.equal(escaped.destination, '9');
});

test('automatic valuables escape and a jump report reading destinations without awarding combat results', () => {
  const automatic = fleeSagardFight(start({escape: 'automatic', escapeTarget: '6'}), null);
  assert.equal(automatic.status, 'fled'); assert.equal(automatic.destination, '6');
  for (const [die, destination] of [[1, '8'], [2, '7']]) {
    const fight = fleeSagardFight(start({escape: 'jump', jumpEvenTarget: '7', jumpOddTarget: '8'}), die);
    assert.equal(fight.status, 'withdrawn'); assert.equal(fight.destination, destination);
    const state = emptySagardState(); state.fight = fight; rememberSagardFight(state); assert.equal(state.history.length, 0);
    assert.equal(fight.hero.hp, 20);
  }
});

test('a fleeing dagger volley rolls once per survivor, survives reload and completes only after all rolls', () => {
  let fight = start({opponents: [foe('A', 1), foe('B'), foe('C')], escapeVolley: 3, escapeTarget: '5'});
  fight = step(fight, 2, 'enemy0'); fight = step(fight); fight = step(fight);
  fight = fleeSagardFight(reload(fight), 2);
  assert.deepEqual(fight.escapeQueue, ['enemy1', 'enemy2']); assert.equal(fight.status, 'fighting');
  assert.equal(sagardTurn(fight).kind, 'escapeVolley');
  fight = step(fight, 2); assert.equal(fight.hero.hp, 17); assert.equal(fight.status, 'fighting');
  fight = step(fight, 1); assert.equal(fight.hero.hp, 17); assert.equal(fight.status, 'fled');
  assert.equal(fight.destination, '5'); assert.equal(fight.log.filter(e => e.kind === 'escapeVolley').length, 2);
});

test('an escape attack can kill before escape completes; Spirit luck offers a decision before history is written', () => {
  let fight = fleeSagardFight(start({escapeAttack: true, escapeTarget: '6'}, {hp: 1}, {spiritLuck: true}, {spiritLuckEnabled: true}), 2);
  assert.equal(sagardTurn(fight).kind, 'escapeAttack'); fight = step(fight, 2);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.phase, 'recovery'); assert.equal(fight.hero.hp, 0);
  const state = emptySagardState(); state.fight = reload(fight); rememberSagardFight(state); assert.equal(state.history.length, 0);
  const rescued = healSagardFight(reload(fight), 'spiritLuck');
  assert.equal(rescued.status, 'fled'); assert.equal(rescued.destination, '6'); assert.equal(rescued.hero.hp, 20);
  assert.equal(rescued.healing.spiritLuck, false); assert.throws(() => healSagardFight(rescued, 'spiritLuck'));
  const declined = resolveSagardTurn(reload(fight), null, {decision: 'decline'});
  assert.equal(declined.status, 'loss'); assert.equal(declined.destination, '1');
  state.fight = declined; rememberSagardFight(state, 100); rememberSagardFight(state, 200);
  assert.equal(state.history.length, 1);
});

test('a normal fatal attack resumes the interrupted queue after Spirit luck and preserves its spent availability', () => {
  let fight = start({initiative: 'enemy'}, {hp: 1}, {spiritLuck: true}, {spiritLuckEnabled: true});
  fight = step(fight, 2); assert.equal(sagardTurn(fight).kind, 'recovery');
  fight = healSagardFight(reload(fight), 'spiritLuck'); assert.equal(sagardTurn(fight).attackerId, 'hero');
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
  assert.equal(state.setup.spiritLuck, false); assert.equal(state.history.length, 0);
});

test('an immortal map guardian has no fabricated HP; each retrieval or escape attempt is followed by its attack', () => {
  let fight = start({opponents: [foe('Synthetic immortal', null, {immortal: true})], mapRetrieval: 1, escapeAttack: true});
  assert.equal(fight.opponents[0].hp, null); assert.equal(fight.opponents[0].maxHp, null);
  assert.equal(sagardTurn(fight).kind, 'retrieve'); assert.equal(sagardTurn(fight).canFlee, false);
  fight = step(fight, 2); assert.equal(fight.mapRetrieved, false); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = step(fight); fight = step(fight, 1); assert.equal(fight.mapRetrieved, true);
  assert.equal(sagardTurn(fight).attackerId, 'enemy0'); fight = step(fight);
  assert.equal(sagardTurn(fight).kind, 'escape'); fight = step(fight, 1);
  assert.equal(sagardTurn(fight).attackerId, 'enemy0'); fight = step(fight);
  fight = step(fight, 2); assert.equal(sagardTurn(fight).kind, 'escapeAttack');
  fight = step(fight); assert.equal(fight.status, 'fled'); assert.equal(fight.opponents[0].hp, null);
});

test('assigned attacks hit their printed hero/companion targets and transfer to the hero when that companion dies', () => {
  let fight = start({opponents: [foe('A', 20, {attackTarget: 'hero'}), foe('B', 20, {attackTarget: 'ally0'}), foe('C', 20, {attackTarget: 'ally1'})],
    allies: [foe('First companion', 1), foe('Second companion', 20)]});
  for (let n = 0; n < 3; n++) fight = step(fight, 1, 'enemy0');
  assert.deepEqual(sagardTurn(fight).targets, ['hero']); fight = step(fight);
  assert.deepEqual(sagardTurn(fight).targets, ['ally0']); assert.throws(() => step(fight, 1, 'hero'));
  fight = step(fight, 2); assert.equal(fight.allies[0].hp, 0);
  assert.deepEqual(sagardTurn(fight).targets, ['ally1']); fight = step(fight);
  fight = step(fight, 1, 'enemy0'); fight = step(fight, 1, 'enemy0'); fight = step(fight);
  assert.equal(sagardTurn(fight).attackerId, 'enemy1'); assert.deepEqual(sagardTurn(fight).targets, ['hero']);
});

test('reinforcement waits outside the fight, attacks first once on joining, and never prevents an earlier victory', () => {
  const opponents = [foe('A'), foe('B'), foe('Reserve', 7, {joinsRound: 7, joinsFirst: true})];
  let fight = start({opponents}); assert.deepEqual(sagardTurn(fight).targets, ['enemy0', 'enemy1']);
  for (let round = 1; round <= 6; round++) {
    fight = step(fight, 1, 'enemy0'); fight = step(fight); fight = step(fight);
  }
  assert.equal(fight.round, 7); assert.equal(sagardTurn(fight).attackerId, 'enemy2');
  fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'hero');
  fight = step(fight, 1, 'enemy0'); fight = step(fight); fight = step(fight);
  assert.equal(fight.round, 8); assert.equal(sagardTurn(fight).attackerId, 'hero');
  assert.equal(fight.log.filter(e => e.attacker === 'enemy2').length, 1);
  fight = start({opponents: [foe('A', 1), foe('B', 1), opponents[2]]});
  fight = step(fight, 2, 'enemy0'); fight = step(fight); fight = step(fight, 2, 'enemy1');
  assert.equal(fight.status, 'win'); assert.equal(fight.opponents[2].hp, 7);
});

test('a first-damage threshold stops a fight as a reading transition, while absorbed damage does not trigger it', () => {
  let fight = start({firstDamageTarget: '9'}, {damageReduction: 1});
  fight = step(fight); fight = step(fight, 2); assert.equal(fight.status, 'fighting');
  fight = step(fight); fight = step(fight, 3); assert.equal(fight.status, 'withdrawn'); assert.equal(fight.destination, '9');
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state); assert.equal(state.history.length, 0);
});

test('armor-ignoring foes bypass reduction, while an explicit finite shield remains separately consumed', () => {
  let fight = start({initiative: 'enemy', opponents: [foe('Synthetic fire', 20, {damageIgnoresArmor: true})]}, {damageReduction: 10, shield: 1});
  fight = step(fight, 4); assert.equal(fight.hero.hp, 18); assert.equal(fight.hero.shield, 0);
});

test('temporary fighting levels do not overwrite current level and printed HP exceptions do not change other encounters', () => {
  const state = emptySagardState(); state.fight = start({temporaryHeroLevel: 1});
  assert.equal(state.fight.hero.level, 1); rememberSagardFight(state); assert.equal(state.setup.level, 3);
  assert.equal(start({maxHeroHp: 25}, {hp: 25}).hero.maxHp, 25);
  assert.throws(() => start({}, {hp: 21}));
});

test('a pre-melee phase preserves HP and waits for an explicit decision; surrender preserves casualties', () => {
  let fight = start({precombatMissiles: true}); assert.equal(sagardTurn(fight).kind, 'prelude');
  assert.throws(() => step(fight));
  fight = resolveSagardTurn(reload(fight), null, {decision: 'continue'});
  assert.equal(sagardTurn(fight).attackerId, 'hero'); assert.equal(fight.hero.hp, 20);
  fight = step(start({withdrawTarget: '8'}), 3);
  const left = withdrawSagardFight(reload(fight)); assert.equal(left.status, 'withdrawn');
  assert.equal(left.opponents[0].hp, 18); assert.equal(left.destination, '8');
  assert.throws(() => withdrawSagardFight(start()));
});

test('invalid optional encounter data and forged immortal HP are rejected', () => {
  for (const spec of [{mapRetrieval: 0}, {escapeVolley: -1}, {heroInitiativeDice: [1, 1]}, {temporaryHeroLevel: 6}]) assert.throws(() => start(spec));
  const fight = start({opponents: [foe('Synthetic immortal', null, {immortal: true})], mapRetrieval: 1});
  fight.opponents[0].hp = 1; assert.throws(() => validateSagardFight(fight));
});

const missiles = [
  {id: 'needle', label: 'Synthetic poison needle', kind: 'poison', maxHeld: 3, shotsPerRound: 2,
    defeatsLevelAtMost: 1, damage: 3, phases: ['round', 'prelude']},
  {id: 'dart', label: 'Synthetic disabling dart', kind: 'knockout', maxHeld: 4, shotsPerRound: 2,
    hitDice: [1, 2, 3], phases: ['round', 'prelude']},
  {id: 'arrow', label: 'Synthetic arrow', kind: 'knockout', maxHeld: 4, shotsPerRound: 1,
    hitDice: [1, 2, 3], phases: []}
];
const missileStart = (spec = {}, hero = {}, options = {}) => start(spec, hero, options, {projectiles: missiles});
const throwMissile = (fight, item, die, target) => throwSagardProjectile(reload(fight), item, die, {target});

test('missile holdings default to zero and are supplied manually, bounded and spent on misses', () => {
  let fight = missileStart(); assert.deepEqual(fight.ammo, {needle: 0, dart: 0, arrow: 0});
  assert.throws(() => throwMissile(fight, 'dart', 1));
  assert.throws(() => missileStart({}, {}, {ammo: {needle: 4}}));
  fight = missileStart({}, {}, {ammo: {dart: 2}}); const original = reload(fight);
  fight = throwMissile(fight, 'dart', 4); assert.equal(fight.ammo.dart, 1); assert.equal(fight.opponents[0].hp, 20);
  assert.equal(fight.log.at(-1).success, false); assert.deepEqual(original.ammo, {needle: 0, dart: 2, arrow: 0});
  assert.equal(sagardTurn(fight).kind, 'projectile'); assert.equal(sagardTurn(fight).canFlee, false);
  assert.throws(() => step(fight, 4));
  fight = resolveSagardTurn(reload(fight), null, {decision: 'continue'});
  assert.equal(sagardTurn(fight).attackerId, 'enemy0');
});

test('poison thresholds use the current enemy level and fixed damage ignores sword bonuses', () => {
  let fight = missileStart({opponents: [foe('Synthetic high-level enemy', 6, {hpBands: [
    {minHp: 4, maxHp: 6, level: 3}, {minHp: 1, maxHp: 3, level: 1}]
  })]}, {damageBonus: 9}, {ammo: {needle: 3}});
  fight = throwMissile(fight, 'needle', null); assert.equal(fight.opponents[0].hp, 3);
  assert.equal(fight.opponents[0].level, 1); assert.equal(fight.ammo.needle, 2);
  fight = throwMissile(fight, 'needle', null); assert.equal(fight.status, 'win'); assert.equal(fight.ammo.needle, 1);
  assert.equal(fight.log.at(-1).knockout, true);
});

test('two missiles share one ordinary turn, require valid foe selection, and persist remaining ammunition', () => {
  let fight = missileStart({opponents: [foe('A'), foe('B'), foe('C')]}, {}, {ammo: {dart: 4, needle: 1}});
  assert.throws(() => throwMissile(fight, 'dart', 1));
  assert.throws(() => throwMissile(fight, 'dart', 1, 'hero'));
  fight = throwMissile(fight, 'dart', 1, 'enemy0'); assert.equal(fight.opponents[0].hp, 0);
  assert.throws(() => throwMissile(fight, 'needle', null, 'enemy1'));
  fight = throwMissile(fight, 'dart', 2, 'enemy1'); assert.equal(fight.opponents[1].hp, 0);
  assert.equal(sagardTurn(fight).attackerId, 'enemy2');
  const state = emptySagardState(); state.fight = reload(fight); state.unrelated = {keep: true};
  rememberSagardFight(state); assert.equal(state.setup.ammo.dart, 2); assert.deepEqual(state.unrelated, {keep: true});
});

test('per-round missile limits survive extra hero attacks and reset only in the next round', () => {
  let fight = missileStart({heroAttacksPerRound: 2, opponents: [foe('A'), foe('B'), foe('C')]}, {}, {ammo: {dart: 4}});
  fight = throwMissile(fight, 'dart', 4, 'enemy0'); fight = throwMissile(fight, 'dart', 4, 'enemy0');
  assert.equal(sagardTurn(fight).attackerId, 'hero');
  assert.throws(() => throwMissile(fight, 'dart', 1, 'enemy0'));
  fight = step(fight, 1, 'enemy0'); for (let n = 0; n < 3; n++) fight = step(fight);
  assert.equal(fight.round, 2); fight = throwMissile(fight, 'dart', 1, 'enemy0');
  assert.equal(fight.ammo.dart, 1);
});

test('a pre-melee arrow rule uses its own hit faces and oil requirement; ordinary melee arrows use a separate rule', () => {
  const opponents = [foe('A'), foe('B')];
  const pre = {precombatMissiles: true, opponents, projectileOverrides: {arrow: {phases: ['prelude'], hitDice: [2, 4], requiresOil: true}}};
  let fight = missileStart(pre, {}, {ammo: {arrow: 3}});
  assert.throws(() => throwMissile(fight, 'arrow', 2, 'enemy0'));
  fight = missileStart(pre, {}, {ammo: {arrow: 3}, dahliaOil: true});
  fight = throwMissile(fight, 'arrow', 1, 'enemy0'); assert.equal(fight.opponents[0].hp, 20);
  fight = throwMissile(fight, 'arrow', 2, 'enemy0'); assert.equal(fight.opponents[0].hp, 0);
  assert.equal(fight.round, 1); assert.equal(fight.hero.hp, 20);
  fight = resolveSagardTurn(reload(fight), null, {decision: 'continue'});
  assert.throws(() => throwMissile(fight, 'arrow', 4, 'enemy1'));
  fight = missileStart({opponents, projectileOverrides: {arrow: {phases: ['round']}}}, {}, {ammo: {arrow: 1}});
  fight = throwMissile(fight, 'arrow', 3, 'enemy0'); assert.equal(fight.opponents[0].hp, 0);
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
});

test('all enemies disabled by missiles finish the encounter once, without granting any new inventory', () => {
  let fight = missileStart({precombatMissiles: true, opponents: [foe()]}, {}, {ammo: {dart: 1}});
  fight = throwMissile(fight, 'dart', 1); assert.equal(fight.status, 'win'); assert.equal(fight.ammo.dart, 0);
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state, 100); rememberSagardFight(state, 101);
  assert.equal(state.history.length, 1); assert.deepEqual(state.setup.ammo, {needle: 0, dart: 0, arrow: 0});
  assert.throws(() => throwMissile(fight, 'dart', 1));
});

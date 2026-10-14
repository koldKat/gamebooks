import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { VOYAGE_ENCOUNTERS, VOYAGE_DREAMS, VOYAGE_NAVIGATION, VOYAGE_ARGONAUTS,
} from '../../../public/js/battlesim/engines/grailquest/voyage-of-terror-roster.js';
import { createVoyageCharacter, initialVoyageLife, VOYAGE_WEAPONS,
  voyageStrike, voyageFriendlyReaction, voyageArmourShatter, voyageNavigation,
  createVoyageFight, rollVoyageRound, voyageTargets, voyageFriendly, voyageCast,
  recruitVoyageArgonauts,
  voyageShadowRound, voyageThrowWeakening, voyageSowTeeth, voyageGuardChallenge,
  visitVoyageSection,
  voyageBribe, voyageSleepingRex, voyageLeaveFight, voyageAfterSerpent,
  useVoyageHealing, cureVoyageAilment, exchangeVoyageExperience, voyageDream,
  voyageSleep, resolveVoyageLimerick, voyageNavigationMishap, navigateVoyage,
  escapeVoyageCannibals,
  voyageCombatStats, callVoyageGnurlbash,
} from '../../../public/js/battlesim/engines/grailquest/voyage-of-terror.js';

const rolls = (...values) => {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected dice roll');
    return (values[index++] - 0.5) / 6;
  };
};

test('arrival grants no sword, money, spells or consumables', () => {
  const p = createVoyageCharacter();
  assert.equal(p.weapon, 'unarmed');
  assert.equal(p.hit, 6);
  assert.equal(p.bonus, 0);
  assert.equal(p.armour, 0);
  for (const key of ['gold', 'bolts', 'poisonHits', 'potions', 'salves', 'dragonTeeth']) {
    assert.equal(p[key], 0, key);
  }
  for (const key of ['crystalBlade', 'wallbanger', 'illusion', 'pigSpell', 'vulcanArmour']) {
    assert.equal(p[key], false, key);
  }
  assert.deepEqual(p.sprainSections, []);
  assert.deepEqual(p.limpSections, []);
});

test('initial LIFE uses the best of three double rolls times four', () => {
  assert.deepEqual(initialVoyageLife(0, rolls(1, 1, 6, 6, 3, 4)), {
    life: 48, maxLife: 48, permanent: 0, rolls: [2, 12, 7],
  });
  assert.equal(initialVoyageLife(0, rolls(1, 1, 1, 1, 1, 1)).life, 8);
});

test('the detailed adventure rule permits forty carried permanent LIFE', () => {
  assert.equal(initialVoyageLife(40, rolls(1, 1, 1, 1, 1, 1)).life, 48);
  const result = initialVoyageLife(50, rolls(1, 1, 1, 1, 1, 1));
  assert.equal(result.permanent, 40);
  assert.equal(result.life, 48);
  for (const value of [-1, 1.5, NaN, Infinity]) assert.throws(() => initialVoyageLife(value));
});

test('an exact unarmed hit does no above-threshold damage', () => {
  assert.deepEqual(voyageStrike(6), { hit: true, damage: 0, score: 6 });
  assert.deepEqual(voyageStrike(5), { hit: false, damage: 0, score: 5 });
  assert.equal(voyageStrike(12).damage, 6);
});

test('weapon bonus follows a successful hit, with armour deducted afterwards', () => {
  assert.equal(voyageStrike(6, 6, 3, 2).damage, 1);
  assert.equal(voyageStrike(5, 6, 10, 0).damage, 0);
  assert.equal(voyageStrike(6, 6, 1, 6).damage, 0);
});

test('printed weapons do not acquire the absent EJ defaults', () => {
  assert.deepEqual(VOYAGE_WEAPONS.sword, { hit: 6, bonus: 3 });
  assert.deepEqual(VOYAGE_WEAPONS.rustyDagger, { hit: 6, bonus: 2 });
  assert.deepEqual(VOYAGE_WEAPONS.spearJab, { hit: 6, bonus: 5 });
  assert.deepEqual(VOYAGE_WEAPONS.spearThrow, { hit: 8, bonus: 10 });
});

test('full-dice damage is distinct from ordinary above-threshold damage', () => {
  assert.equal(voyageStrike(4, 4, 0, 0, { fullDice: true }).damage, 4);
  assert.equal(voyageStrike(6, 6, 0, 0, { fullDice: true }).damage, 6);
  assert.equal(voyageStrike(3, 4, 0, 0, { fullDice: true }).damage, 0);
});

test('the crossbow has fixed fifteen damage on a successful roll', () => {
  assert.equal(voyageStrike(3, 3, 0, 0, { fixedDamage: 15 }).damage, 15);
  assert.equal(voyageStrike(12, 3, 0, 5, { fixedDamage: 15 }).damage, 10);
  assert.equal(voyageStrike(2, 3, 0, 0, { fixedDamage: 15 }).damage, 0);
});

test('Harpy and Mummy penalties affect hit and damage, not only threshold', () => {
  assert.equal(voyageStrike(7, 6, 3, 0, { penalty: 2 }).hit, false);
  assert.equal(voyageStrike(10, 6, 3, 0, { penalty: 2 }).damage, 5);
  assert.equal(voyageStrike(10, 6, 0, 0, { penalty: 5 }).hit, false);
  assert.equal(voyageStrike(12, 6, 0, 0, { penalty: 5 }).damage, 1);
});

test('Superlizard multiplier is six times dice damage, not a flat six bonus', () => {
  assert.equal(voyageStrike(10, 9, 0, 0, { multiplier: 6 }).damage, 6);
  assert.equal(voyageStrike(12, 9, 0, 0, { multiplier: 6 }).damage, 18);
  assert.equal(voyageStrike(10, 9, 0, 4, { multiplier: 6 }).damage, 2);
});

test('friendly reaction compares one enemy die against three player dice', () => {
  assert.deepEqual(voyageFriendlyReaction(rolls(6, 1, 1, 1)), { enemy: 6, player: 3, success: true });
  assert.equal(voyageFriendlyReaction(rolls(3, 1, 1, 1)).success, false);
});

test('Greek armour follows the three printed shatter ranges', () => {
  for (let pieces = 0; pieces <= 3; pieces++) {
    for (let roll = 2; roll <= 12; roll++) {
      const shattered = pieces > 0 && roll >= [13, 12, 11, 9][pieces];
      assert.deepEqual(voyageArmourShatter(pieces, roll), {
        shattered, damage: shattered ? 20 : 0, armour: shattered ? 0 : pieces * 2,
      });
    }
  }
  assert.throws(() => voyageArmourShatter(4, 12));
});

test('navigation reaches its intended destination on five through twelve', () => {
  assert.deepEqual(voyageNavigation(rolls(2, 3)), { roll: 5, arrived: true });
  assert.deepEqual(voyageNavigation(rolls(2, 2)), { roll: 4, arrived: false });
});

test('malformed strike values cannot quietly produce invalid damage', () => {
  for (const value of [NaN, Infinity, -1, 1, 13, 3.5]) assert.throws(() => voyageStrike(value));
  assert.throws(() => voyageStrike(6, 6, 0, 0, { multiplier: 0 }));
});

test('new-character state does not share mutable arrays', () => {
  const a = createVoyageCharacter(), b = createVoyageCharacter();
  a.sprainSections.push('35');
  assert.deepEqual(b.sprainSections, []);
});

test('all thirty-three printed story encounters are present without invented challenge foes', () => {
  const expected = [6, 26, 33, 47, 57, 59, 65, 67, 77, 80, 84, 87, 90, 101,
    108, 109, 113, 121, 133, 134, 140, 144, 151, 157, 169, 171, 175, 179, 181,
    188, 189, 200, 203];
  assert.deepEqual(VOYAGE_ENCOUNTERS.map(spec => spec.section), expected);
  assert.equal(VOYAGE_DREAMS.length, 4);
  assert.equal(VOYAGE_NAVIGATION.length, 3);
});

test('Boar and barred guard stats match their own passages', () => {
  const boar = VOYAGE_ENCOUNTERS.find(spec => spec.section === 65).foes[0];
  assert.deepEqual([boar.life, boar.hit, boar.bonus], [35, 5, 3]);
  const guards = VOYAGE_ENCOUNTERS.find(spec => spec.section === 67);
  assert.equal(guards.foes.length, 3);
  assert.ok(guards.foes.every(guard => guard.hit === 6 && guard.armour === 2));
  assert.equal(guards.sequential, true);
});

test('thirteen Argonauts include Achilles with his separate attack frequency', () => {
  assert.equal(VOYAGE_ARGONAUTS.length, 13);
  const achilles = VOYAGE_ARGONAUTS.at(-1);
  assert.deepEqual([achilles.life, achilles.hit, achilles.bonus, achilles.attackEvery], [30, 2, 1, 2]);
});

test('Shadows have no invented LIFE and group-specific rules remain explicit', () => {
  const shadows = VOYAGE_ENCOUNTERS.find(spec => spec.section === 109);
  assert.deepEqual(shadows.foes, []);
  assert.equal(shadows.shadows, true);
  const hydra = VOYAGE_ENCOUNTERS.find(spec => spec.section === 179);
  assert.equal(hydra.foes.length, 7);
  assert.equal(hydra.simultaneous, true);
  assert.equal(hydra.deathRequired, true);
  const silver = VOYAGE_ENCOUNTERS.find(spec => spec.section === 133);
  assert.equal(silver.alternating, true);
  assert.equal(silver.foes[0].pistol, true);
});

const character = overrides => ({ ...createVoyageCharacter(), life: 48, maxLife: 48, ...overrides });
const fight = (section, p = {}, options = {}) => createVoyageFight(section,
  character(p), options, rolls(1, 1, 6, 6));

test('fight state is isolated from character, options and the source roster', () => {
  const p = character(), options = { assignments: [0] }, f = createVoyageFight(26, p, options, rolls(1, 1, 6, 6));
  f.player.sprainSections.push(35); f.foes[0].life--; f.options.assignments[0] = 1;
  assert.deepEqual(p.sprainSections, []);
  assert.deepEqual(options.assignments, [0]);
  assert.equal(VOYAGE_ENCOUNTERS.find(s => s.section === 26).foes[0].life, 30);
});

test('wounded characters enter combat without healing or invented weapons', () => {
  const f = fight(26, { life: 17 });
  assert.equal(f.player.life, 17);
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1));
  assert.equal(f.foes[0].life, 30);
  assert.equal(f.player.weapon, 'unarmed');
});

test('crossbow consumes bolts even on misses and switches to unarmed when empty', () => {
  const f = fight(26, { weapon: 'crossbow', bolts: 1 });
  assert.equal(f.first, 'player');
  rollVoyageRound(f, 0, rolls(1, 1, 1, 1));
  assert.equal(f.player.bolts, 0);
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1));
  assert.equal(f.foes[0].life, 30);
});

test('the poisonous spider kills on a hit, even an exact-threshold hit', () => {
  const f = fight(47);
  rollVoyageRound(f, 0, rolls(1, 1, 2, 3));
  assert.equal(f.player.life, 0);
  assert.equal(f.status, 'loss');
});

test('a dead spider cannot take a final counterattack', () => {
  const f = fight(47, { weapon: 'sword' });
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.status, 'win');
  assert.equal(f.enemyBlows, 0);
  assert.equal(f.player.experience, 1);
  assert.equal(rollVoyageRound(f), false);
  assert.equal(f.player.experience, 1);
});

test('dream fights ignore armour, weapons and carried potion effects', () => {
  const f = fight('dream3', { weapon: 'crossbow', bolts: 8, armour: 100,
    playerHalfNext: true, enemyHalfNext: true });
  rollVoyageRound(f, 0, rolls(3, 3, 6, 6));
  assert.equal(f.foes[0].life, 12);
  assert.equal(f.player.life, 41);
  assert.equal(f.player.bolts, 8);
  assert.equal(f.player.playerHalfNext, true);
});

test('the rogue kills Pip after three unsuccessful player strikes', () => {
  const f = fight('dream3');
  for (let i = 0; i < 2; i++) rollVoyageRound(f, 0, rolls(1, 1, 1, 1));
  rollVoyageRound(f, 0, rolls(1, 1));
  assert.equal(f.status, 'loss');
  assert.equal(f.player.life, 0);
});

test('the dream rogue must die, not merely become unconscious', () => {
  const f = fight('dream3');
  f.foes[0].life = 6;
  rollVoyageRound(f, 0, rolls(5, 5, 1, 1));
  assert.equal(f.foes[0].life, 2);
  assert.equal(f.status, 'fighting');
});

test('all seven living Hydra heads attack once in a round', () => {
  const f = fight(179); f.first = 'enemy';
  rollVoyageRound(f, 0, rolls(...Array(14).fill(1), 1, 1));
  assert.equal(f.enemyBlows, 7);
  assert.equal(f.playerStrikes, 1);
});

test('a dead Hydra head is excluded from subsequent rounds', () => {
  const f = fight(179); f.first = 'enemy'; f.foes[0].life = 0;
  rollVoyageRound(f, 1, rolls(...Array(12).fill(1), 1, 1));
  assert.equal(f.enemyBlows, 6);
});

test('Silver fires his pistol once and alternates attacks with the parrot', () => {
  const f = fight(133); f.first = 'enemy';
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1));
  assert.equal(f.player.life, 23);
  rollVoyageRound(f, 0, rolls(2, 2, 1, 1));
  assert.equal(f.player.life, 19);
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1));
  assert.equal(f.player.life, 15);
  assert.equal(f.foes[0].attacksMade, 2);
});

test('the Mummy poison starts on subsequent rounds and stops on death', () => {
  const f = fight(203); f.first = 'enemy';
  rollVoyageRound(f, 0, rolls(2, 2, 1, 1));
  assert.equal(f.player.life, 44);
  rollVoyageRound(f, 0, rolls(1, 1, 1, 1));
  assert.equal(f.player.life, 39);
  f.player.crystalBlade = true;
  voyageCast(f, 'crystalBlade', 0, rolls(3, 3));
  assert.equal(f.status, 'win');
  assert.equal(rollVoyageRound(f), false);
  assert.equal(f.player.life, 39);
});

test('ordinary Mummy attacks require both the penalty and a real kill', () => {
  const f = fight(203); f.foes[0].life = 6;
  rollVoyageRound(f, 0, rolls(6, 6, 1, 1));
  assert.equal(f.foes[0].life, 5);
  assert.equal(f.status, 'fighting');
});

test('the crystal blade breaks on an unsuccessful magical Mummy attack', () => {
  const f = fight(203, { crystalBlade: true });
  assert.equal(voyageCast(f, 'crystalBlade', 0, rolls(1, 1)).success, false);
  assert.equal(f.player.crystalBlade, false);
  assert.equal(f.foes[0].life, 33);
});

test('Vulcan is immune to the crystal blade and blocks the first two blows', () => {
  const f = fight(144, { crystalBlade: true }); f.first = 'enemy';
  assert.equal(voyageCast(f, 'crystalBlade', 0), null);
  assert.equal(f.player.crystalBlade, true);
  for (let i = 0; i < 2; i++) rollVoyageRound(f, 0, rolls(6, 6, 1, 1));
  assert.equal(f.player.life, 48);
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.player.life, 0);
  assert.equal(f.status, 'loss');
});

test('Greek armour shatters after the first player strike and only once', () => {
  const f = fight(26, { armourPieces: 1 });
  rollVoyageRound(f, 0, rolls(1, 1, 6, 6, 1, 1));
  assert.equal(f.player.life, 28);
  assert.equal(f.player.armourPieces, 0);
  rollVoyageRound(f, 0, rolls(1, 1, 1, 1));
  assert.equal(f.player.life, 28);
});

test('a collapsing roof kills both combatants without awarding a win', () => {
  const f = fight(169);
  rollVoyageRound(f, 0, rolls(1, 1));
  assert.equal(f.status, 'loss');
  assert.equal(f.player.life, 0);
  assert.equal(f.foes[0].life, 0);
  assert.equal(f.player.experience, 0);
});

test('Rock Them permits two attacks but checks the roof before each blow', () => {
  const f = fight(169);
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1, 3, 3, 1, 1, 3, 3, 1, 1));
  assert.equal(f.playerStrikes, 2);
  assert.equal(f.enemyBlows, 1);
  assert.equal(f.events.filter(e => e.kind === 'roof').length, 3);
});

test('friendly guards are removed individually and cannot be tested repeatedly', () => {
  const f = fight(6);
  assert.equal(voyageFriendly(f, 0, rolls(6, 1, 1, 1)).success, true);
  assert.equal(voyageTargets(f).length, 5);
  assert.equal(voyageFriendly(f, 1, rolls(1, 6, 6, 6)).success, false);
  assert.equal(voyageFriendly(f, 1), null);
});

test('unfriendly Babysaurus encounters forbid friendly reactions', () => {
  assert.equal(voyageFriendly(fight(108), 0), null);
});

test('one-fight half-damage effects are consumed by story combat only', () => {
  const f = fight(26, { playerHalfNext: true, enemyHalfNext: true, weapon: 'sword' });
  assert.equal(f.player.playerHalfNext, false);
  assert.equal(f.player.enemyHalfNext, false);
  rollVoyageRound(f, 0, rolls(6, 6, 6, 6));
  assert.equal(f.foes[0].life, 26);
  assert.equal(f.player.life, 43);
});

test('Illusion disbelievers are immune in this fight without consuming the spell', () => {
  const f = fight(26, { illusion: true });
  assert.equal(voyageCast(f, 'illusion', 0, rolls(6, 6, 1)).success, false);
  assert.equal(voyageCast(f, 'illusion', 0), null);
  assert.equal(f.player.illusion, true);
  assert.equal(f.foes[0].life, 30);
});

test('the Pig spell is consumed even when the cast fails', () => {
  const f = fight(26, { pigSpell: true });
  assert.equal(voyageCast(f, 'pigSpell', 0, rolls(1, 1)).success, false);
  assert.equal(f.player.pigSpell, false);
});

test('an already-wounded pig is not healed when selecting Hecate again', () => {
  const f = fight(171, { shape: 'pig', life: 9 });
  assert.equal(f.player.life, 9);
});

test('return journeys halve fresh enemy LIFE without changing old fights or source data', () => {
  const normal = fight(26), returned = fight(26, {}, { returnJourney: true });
  assert.equal(returned.foes[0].life, 15);
  assert.equal(normal.foes[0].life, 30);
});

test('Jason must already be present for his joint fights', () => {
  assert.throws(() => fight(59), /Jason/);
  const p = character();
  assert.equal(recruitVoyageArgonauts(p), true);
  assert.equal(recruitVoyageArgonauts(p), false);
  const f = createVoyageFight(59, p, {}, rolls(1, 1, 6, 6));
  assert.equal(f.allies.length, 1);
  rollVoyageRound(f, 0, rolls(1, 1, 1, 1, 1, 1));
  assert.equal(f.rounds, 1);
  assert.equal(f.events.filter(e => ['player', 'ally', 'enemy'].includes(e.kind)).length, 3);
});

test('party combat continues after Pip dies and Jason can resurrect him', () => {
  const f = fight(113, { companions: [{ name: 'Jason', life: 25, hit: 5, bonus: 30, armour: 0 }] });
  f.player.life = 0;
  for (const foe of f.foes.slice(1)) foe.life = 0;
  f.first = 'player';
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.status, 'win');
  assert.equal(f.player.life, 48);
  assert.equal(f.events.some(e => e.kind === 'resurrection'), true);
});

test('the next sequential guard does not attack in the previous guard’s round', () => {
  const f = fight(67, { weapon: 'sword' });
  f.foes[0].life = 6;
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.foes[0].life, 0);
  assert.equal(f.enemyBlows, 0);
  assert.equal(f.status, 'fighting');
});

test('Greek armour is checked after an enemy-first opening blow too', () => {
  const f = fight(77, { armourPieces: 1 });
  rollVoyageRound(f, 0, rolls(1, 1, 6, 6, 1, 1));
  assert.equal(f.player.life, 28);
  assert.equal(f.player.armourPieces, 0);
});

test('an already-dead player cannot win through a later surrender check', () => {
  const f = fight(144); f.first = 'enemy'; f.enemyBlows = 2; f.enemyLoss = 18;
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.status, 'loss');
  assert.equal(f.player.experience, 0);
});

test('party combat carries companion wounds back to the saved character copy', () => {
  const f = fight(113, { companions: [{ name: 'Jason', life: 25, hit: 5, bonus: 0, armour: 0 }] },
    { assignments: Array(10).fill(1) });
  f.first = 'enemy';
  for (const foe of f.foes.slice(1)) foe.life = 0;
  rollVoyageRound(f, 0, rolls(3, 3, 1, 1, 1, 1));
  assert.equal(f.allies[0].life, 22);
  assert.equal(f.player.companions[0].life, 22);
});

test('malformed party assignments are rejected before any dice are rolled', () => {
  assert.throws(() => fight(113, {}, { assignments: [0] }), /assignments/);
  assert.throws(() => fight(113, {}, { assignments: Array(10).fill(1) }), /assignments/);
});

test('Shadows use grips and light, never fabricated LIFE values', () => {
  const f = createVoyageFight(109, character({ light: true }), {}, rolls(2, 1, 1, 6, 6));
  assert.equal(f.shadows.length, 2);
  assert.equal(f.status, 'fighting');
  voyageShadowRound(f, 0, rolls(2, 2, 3, 3));
  assert.equal(f.shadows[0].banished, true);
  assert.equal(f.shadows[1].gripped, true);
  assert.equal(f.player.life, 42);
  voyageShadowRound(f, 1, rolls(2, 2));
  assert.equal(f.status, 'win');
  assert.equal(f.player.life, 42);
  assert.equal(f.player.experience, 1);
});

test('without an owned light source physical attacks cannot hurt Shadows', () => {
  const f = createVoyageFight(109, character(), {}, rolls(1, 1, 1, 6, 6));
  assert.throws(() => rollVoyageRound(f), /shadow/);
  voyageShadowRound(f, 0, rolls(3, 3));
  assert.equal(f.player.life, 42);
  voyageShadowRound(f, 0, rolls());
  assert.equal(f.player.life, 36);
});

test('Shadows do not consume the next ordinary fight’s half-damage effects', () => {
  const f = createVoyageFight(109, character({ playerHalfNext: true, enemyHalfNext: true }), {},
    rolls(1, 1, 1, 6, 6));
  assert.equal(f.player.playerHalfNext, true);
  assert.equal(f.player.enemyHalfNext, true);
});

test('a successful weakening throw halves only the targeted enemy damage', () => {
  const f = fight(26, { weakeningPotion: true });
  assert.equal(voyageThrowWeakening(f, 0, rolls(3, 3)).success, true);
  assert.equal(f.player.weakeningPotion, false);
  rollVoyageRound(f, 0, rolls(1, 1, 6, 6));
  assert.equal(f.player.life, 43);
});

test('a missed weakening throw prevents a later friendly reaction', () => {
  const f = fight(26, { weakeningPotion: true });
  assert.equal(voyageThrowWeakening(f, 0, rolls(1, 1)).success, false);
  assert.equal(voyageFriendly(f, 0), null);
});

test('sowing teeth uses the opening strike and enemy attack before germination', () => {
  const f = fight(26, { dragonTeeth: 3 });
  assert.equal(voyageSowTeeth(f, 2, rolls(3, 3, 3, 3)).success, true);
  assert.equal(f.player.life, 44);
  assert.equal(f.player.dragonTeeth, 1);
  assert.equal(f.playerStrikes, 0);
  assert.equal(f.allies.length, 2);
  assert.ok(f.allies.every(a => a.temporary && a.life === 30 && a.armour === 3));
  assert.equal(f.player.companions.length, 0);
  assert.equal(voyageSowTeeth(f, 1), null);
});

test('teeth cannot grow warriors if the opening enemy blow kills Pip', () => {
  const f = fight(47, { dragonTeeth: 1 });
  assert.deepEqual(voyageSowTeeth(f, 1, rolls(3, 3)), { success: false, roll: null });
  assert.equal(f.status, 'loss');
  assert.equal(f.allies.length, 0);
});

test('the mongoose bypasses serpents but not unrelated enemies', () => {
  assert.equal(fight(179, { mongoose: true }).status, 'win');
  assert.equal(fight(26, { mongoose: true }).status, 'fighting');
});

test('a new visited section advances ailments and pays the mongoose without negative gold', () => {
  const p = character({ gold: 15, mongoose: true, sectionPoison: 2,
    sprainSections: Array(12).fill(35), limpSections: Array(3).fill('dream9') });
  visitVoyageSection(p, 36);
  assert.equal(p.life, 46);
  assert.equal(p.gold, 5);
  assert.equal(p.sprainSections.length, 11);
  assert.equal(p.limpSections.length, 2);
  visitVoyageSection(p, 37);
  assert.equal(p.gold, 5);
  assert.equal(p.mongoose, false);
});

test('the impossible guard challenge requires all six sixes, otherwise fate is rolled', () => {
  assert.deepEqual(voyageGuardChallenge(rolls(6, 6, 6, 6, 6, 6)),
    { rolls: [6, 6, 6, 6, 6, 6], status: 'win' });
  assert.equal(voyageGuardChallenge(rolls(6, 6, 6, 6, 6, 5, 1, 1)).status, 'death');
  const captive = voyageGuardChallenge(rolls(1, 1, 1, 1, 1, 1, 6, 6));
  assert.equal(captive.status, 'captured');
  assert.equal(captive.section, 114);
});

test('guard bribes deduct gold on refusal and bypass only an accepting guard', () => {
  const f = fight(57, { gold: 1000 });
  assert.equal(voyageBribe(f, 0, rolls(1, 1)).success, false);
  assert.equal(f.player.gold, 500);
  assert.equal(voyageBribe(f, 0), null);
  assert.equal(voyageBribe(f, 1, rolls(4, 4)).success, true);
  assert.equal(f.player.gold, 0);
  assert.equal(voyageTargets(f).length, 11);
  assert.equal(voyageBribe(f, 2), null);
});

test('offering everything to the Tyrannosaurus loses equipment even on refusal but retains keys', () => {
  const f = fight(101, { weapon: 'sword', gold: 3500, goldenKeys: 2, crystalBlade: true,
    wallbanger: true, talisman: true, potions: 6 });
  assert.equal(voyageBribe(f, 0, rolls(1, 1)).success, false);
  for (const key of ['gold', 'potions']) assert.equal(f.player[key], 0);
  for (const key of ['crystalBlade', 'wallbanger', 'talisman']) assert.equal(f.player[key], false);
  assert.equal(f.player.weapon, 'unarmed');
  assert.equal(f.player.goldenKeys, 2);
});

test('sleeping Rex bypass checks are one attempt, not a combat or healing action', () => {
  const f = fight(101, { life: 20 });
  assert.equal(voyageSleepingRex(f, rolls(4, 5)).success, true);
  assert.equal(f.status, 'avoided');
  assert.equal(f.player.life, 20);
  assert.equal(f.player.experience, 0);
  assert.equal(voyageSleepingRex(f), null);
});

test('Kimono Dragon egg bribes consume eggs, not gold or an invented acceptance roll', () => {
  const f = fight('navigation6', { cricriEggs: 8, gold: 100 });
  assert.deepEqual(voyageBribe(f, 0, rolls(2, 3)), { cost: 5, success: true });
  assert.equal(f.player.cricriEggs, 3);
  assert.equal(f.player.gold, 100);
  assert.equal(f.status, 'win');
});

test('leaving the guardroom applies the printed ten LIFE loss once', () => {
  const f = fight(57, { life: 9 });
  assert.equal(voyageLeaveFight(f), true);
  assert.equal(f.status, 'loss');
  assert.equal(f.player.life, 0);
  assert.equal(voyageLeaveFight(f), false);
});

test('sea serpent equipment loss needs an explicit post-victory action', () => {
  const f = fight(33, { weapon: 'sword', potions: 6 });
  f.foes[0].life = 1;
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.player.weapon, 'sword');
  assert.equal(voyageAfterSerpent(f), true);
  assert.equal(f.player.weapon, 'driftwood');
  assert.equal(f.player.potions, 0);
  assert.equal(voyageAfterSerpent(f), false);
});

test('healing restores wounds but does not cure poison or resurrect the dead', () => {
  const p = character({ life: 40, potions: 2, salves: 1, sectionPoison: 2 });
  assert.deepEqual(useVoyageHealing(p, 'potions', rolls(6, 6)), { amount: 8, rolled: 12 });
  assert.equal(p.sectionPoison, 2);
  p.life = 0;
  assert.equal(useVoyageHealing(p, 'salves'), null);
  assert.equal(p.salves, 1);
});

test('printed poison and malaria cures consume the correct supplies', () => {
  const p = character({ sectionPoison: 10, cricriEggs: 1, spinach: 1,
    malaria: true, potions: 6, salves: 1 });
  assert.equal(cureVoyageAilment(p, 'eggSpinach'), true);
  assert.equal(p.sectionPoison, 0);
  assert.equal(p.cricriEggs, 0);
  assert.equal(cureVoyageAilment(p, 'malariaSupplies'), true);
  assert.equal(p.malaria, false);
  assert.equal(p.potions, 0);
  assert.equal(p.salves, 0);
});

test('twenty in-book experience points buy one permanent LIFE, never app XP', () => {
  const p = character({ experience: 40, life: 20 });
  assert.equal(exchangeVoyageExperience(p), true);
  assert.deepEqual([p.experience, p.permanent, p.life, p.maxLife], [20, 1, 21, 49]);
});

test('Dreamtime requires a strict higher roll to break bonds', () => {
  assert.equal(voyageDream(character(), 10, 74, rolls(3, 3, 3, 3)).status, 'loss');
  const result = voyageDream(character(), 10, 74, rolls(3, 3, 3, 4));
  assert.equal(result.status, 'return');
  assert.equal(result.section, 74);
});

test('Dreamtime coffin stops rolling when rescued, with at most five attempts', () => {
  const escaped = voyageDream(character(), 11, 74, rolls(2, 6));
  assert.deepEqual(escaped.rolls, [2, 6]);
  assert.equal(escaped.status, 'return');
  const dead = voyageDream(character(), 11, 74, rolls(1, 1, 1, 1, 1));
  assert.equal(dead.status, 'loss');
  assert.equal(dead.player.life, 0);
});

test('the unusual dream Gnurlbash companion is the explicit exception to no carried dream items', () => {
  const p = character();
  const result = voyageDream(p, 7, 74, rolls(6, 6));
  assert.equal(result.player.gnurlbash, true);
  assert.equal(p.gnurlbash, false);
  assert.equal(result.section, 74);
});

test('Dreamtime fights retain the actual sleeping section and saved equipment', () => {
  const result = voyageDream(character({ weapon: 'sword', life: 18 }), 4, 74, rolls());
  assert.equal(result.status, 'fight');
  assert.equal(result.fight.returnSection, 74);
  assert.equal(result.fight.player.life, 18);
  assert.equal(result.fight.player.weapon, 'sword');
  assert.equal(result.fight.spec.playerHit, 4);
});

test('sleep heals on five or six and otherwise enters the rolled dream', () => {
  const p = character({ life: 20 });
  assert.equal(voyageSleep(p, 74, rolls(5, 3, 3)).player.life, 26);
  const result = voyageSleep(p, 74, rolls(1, 6, 6, 5));
  assert.equal(result.status, 'dream-again');
  assert.equal(result.section, 74);
  assert.equal(p.life, 20);
});

test('failing the limerick costs five LIFE without changing equipment', () => {
  const p = character({ life: 9 });
  assert.equal(resolveVoyageLimerick(p, false), true);
  assert.equal(p.life, 4);
});

test('successful sea navigation arrives without an extra mishap roll', () => {
  const result = navigateVoyage(character(), 122, rolls(2, 3));
  assert.equal(result.status, 'return');
  assert.equal(result.destination, 122);
});

test('failed sea navigation preserves the intended destination after a survived mishap', () => {
  const result = navigateVoyage(character(), 122, rolls(1, 1, 5, 4));
  assert.equal(result.status, 'return');
  assert.equal(result.destination, 122);
  assert.equal(result.player.cricriEggs, 4);
});

test('navigation malaria costs one LIFE, not the seabird’s ten', () => {
  const result = voyageNavigationMishap(character(), 122, 3, rolls(3, 3));
  assert.equal(result.player.life, 47);
  assert.equal(result.player.malaria, true);
});

test('being knocked out by the cannibal’s daughter is captivity, not victory', () => {
  const f = fight('navigation2', { life: 10 }); f.first = 'enemy';
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.player.life, 0);
  assert.equal(f.status, 'loss');
  const captive = fight('navigation2', { life: 10 }); captive.first = 'enemy';
  rollVoyageRound(captive, 0, rolls(4, 4));
  assert.equal(captive.player.life, 4);
  assert.equal(captive.status, 'captured');
});

test('killing the cannibal’s daughter still requires the escape roll', () => {
  const f = fight('navigation2', { weapon: 'sword' });
  f.foes[0].life = 1;
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.status, 'win');
  assert.equal(escapeVoyageCannibals(f, rolls(2, 2)).success, false);
  assert.equal(f.player.life, 0);
  assert.equal(f.status, 'loss');
  assert.equal(escapeVoyageCannibals(f), null);
});

test('Jason continues fighting his remaining ferrets when Pip has finished his six', () => {
  const p = character(); recruitVoyageArgonauts(p);
  const f = createVoyageFight(140, p, {}, rolls(1, 1, 6, 6));
  for (const foe of f.foes.slice(0, 6)) foe.life = 0;
  f.allies[0].life = 4;
  rollVoyageRound(f, 6, rolls(6, 6));
  assert.equal(f.foes[6].life, 0);
  assert.equal(f.playerStrikes, 0);
  assert.equal(f.rounds, 1);
  assert.equal(f.status, 'fighting');
});

test('a thrown spear stays unavailable for three complete subsequent rounds', () => {
  const f = fight(26, { weapon: 'spearThrow' });
  rollVoyageRound(f, 0, rolls(1, 1, 1, 1));
  for (let i = 0; i < 3; i++) rollVoyageRound(f, 0, rolls(4, 4, 1, 1));
  assert.equal(f.foes[0].life, 24);
  rollVoyageRound(f, 0, rolls(4, 4, 1, 1));
  assert.equal(f.foes[0].life, 14);
});

test('guard gold is collected once upon a kill, not for an unconscious or friendly guard', () => {
  const f = fight(57, { weapon: 'sword' }, { killEnemies: true });
  f.foes[0].life = 6;
  rollVoyageRound(f, 0, rolls(6, 6));
  assert.equal(f.player.gold, 10);
  assert.equal(f.status, 'fighting');
  const merciful = fight(57, { weapon: 'sword' });
  merciful.foes[0].life = 7;
  rollVoyageRound(merciful, 0, rolls(3, 3, 1, 1));
  assert.equal(merciful.player.gold, 0);
  assert.equal(merciful.foes[0].life, 6);
});

test('combat display includes Mummy and Harpy roll penalties without rewriting the sheet', () => {
  const f = fight(203, { weapon: 'sword', armour: 2 });
  assert.deepEqual(voyageCombatStats(f), { hit: 11, bonus: 3, armour: 2, protectedBlows: 0 });
  assert.equal(f.player.hit, 6);
  assert.equal(f.player.bonus, 0);
  assert.equal(voyageCombatStats(fight(157)).hit, 8);
});

test('Dreamtime does not inherit the beetle transformation’s hit rule or protection', () => {
  const f = fight('dream3', { shape: 'beetle' });
  assert.equal(voyageCombatStats(f).hit, 6);
  rollVoyageRound(f, 0, rolls(3, 3, 6, 6));
  assert.equal(f.player.life, 41);
  assert.equal(f.player.shape, 'beetle');
});

test('Gnurlbash can leave Dreamtime for only one enemy and does not become permanent crew', () => {
  const f = fight(67, { gnurlbash: true });
  assert.equal(callVoyageGnurlbash(f), true);
  assert.equal(f.player.gnurlbash, false);
  assert.equal(f.allies[0].expiresOnEnemy, 0);
  assert.equal(callVoyageGnurlbash(f), false);
  f.foes[0].life = 6;
  rollVoyageRound(f, 0, rolls(6, 6, 6, 6));
  assert.equal(f.allies.length, 0);
  assert.equal(f.player.companions.length, 0);
});

test('pirates facing a fallen fighter switch to a living crew member, not an idle turn', () => {
  const f = fight(113, { life: 6, companions: [{ name: 'Jason', life: 100, hit: 5, bonus: 0, armour: 0 }] },
    { assignments: Array(10).fill(0) });
  f.first = 'enemy';
  for (const foe of f.foes.slice(2)) foe.life = 0;
  rollVoyageRound(f, 0, rolls(6, 6, 6, 6, 1, 1));
  assert.equal(f.player.life, 0);
  assert.equal(f.allies[0].life, 91);
  assert.equal(f.enemyBlows, 2);
  assert.equal(f.options.assignments[1], 1);
  assert.equal(f.status, 'fighting');
});

test('the three barred-door guards accept one group bribe, not three individual payments', () => {
  const f = fight(67, { gold: 500 });
  assert.equal(voyageBribe(f, 0, rolls(4, 4)).success, true);
  assert.equal(f.player.gold, 0);
  assert.equal(f.status, 'win');
  assert.equal(voyageTargets(f).length, 0);
});

test('a refused group bribe cannot be retried against another member of that group', () => {
  const f = fight(67, { gold: 1000 });
  assert.equal(voyageBribe(f, 0, rolls(1, 1)).success, false);
  assert.equal(voyageBribe(f, 1), null);
  assert.equal(f.player.gold, 500);
});

const xpSource = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
const xpKeys = xpSource.match(/const SIM_HISTORY_KEYS = (\[[^;]+\]);/)[1];
const xpStart = xpSource.indexOf('    for (const simKey of SIM_HISTORY_KEYS) {');
const xpEnd = xpSource.indexOf('\n  }\n\n  // Award every increase', xpStart);
const processHistory = (oldHistory, newHistory) => {
  assert.ok(xpStart > 0 && xpEnd > xpStart);
  const awards = [];
  runInNewContext('const SIM_HISTORY_KEYS = ' + xpKeys + ';\n' + xpSource.slice(xpStart, xpEnd), {
    oldPt: { sim529: { history: oldHistory } }, newPt: { sim529: { history: newHistory } },
    userId: 123, awardXp: (...args) => awards.push(args),
  });
  return awards;
};

test('the actual server history loop awards Voyage wins and losses using registered sim529 refs', () => {
  assert.deepEqual(processHistory([], [{ ts: 100, outcome: 'win' }, { ts: 101, outcome: 'loss' }]), [
    [123, 'battlesim_win', 'sim529:100'], [123, 'battlesim_loss', 'sim529:101'],
  ]);
});

test('saving unchanged Voyage history cannot award simulator XP twice', () => {
  const history = [{ ts: 100, outcome: 'win' }, { ts: 101, outcome: 'loss' }];
  assert.deepEqual(processHistory(history, history), []);
  assert.deepEqual(processHistory(history, [...history, { ts: 102, outcome: 'win' }]), [
    [123, 'battlesim_win', 'sim529:102'],
  ]);
});

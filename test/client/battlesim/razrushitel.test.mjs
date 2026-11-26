import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canFlee, canSpare, flee, recordOutcome, resolveRound, spare, startFight, woundLevel, woundPenalty,
} from '../../../public/js/battlesim/books/3558/combat.js';

// The appendix labels 5 as fatal for the hero. Encounter limits are tracked separately.
const exampleWounds = [[0, 1, 2, 3, 4, 5], [0, 2, 3, 4, 5], [0, 3, 4, 5]];
const hero = { skill: 2, wounds: [0, 0, 0], battles: 0, escapes: 0, skillBonus: false };
const opponent = { skill: 3, limit: 5, techniques: { sand: [6, 2], mist: [2, 6] }, win: 118 };

test('Разрушител matches both printed opening rolls', () => {
  const sand = resolveRound(startFight(hero, opponent, 'sand', exampleWounds), exampleWounds, 3, 4);
  assert.deepEqual(sand.lastRound, {
    round: 1, heroDie: 3, enemyDie: 4, heroBonus: 6, enemyBonus: 2, heroTotal: 11,
    heroDiePenalty: 0, enemyTotal: 9, wounded: 'enemy', level: 1, heroDamage: 0, enemyDamage: 1,
  });
  const mist = resolveRound(startFight(hero, opponent, 'mist', exampleWounds), exampleWounds, 5, 3);
  assert.deepEqual(mist.heroWounds, [0, 1, 0]);
  assert.equal(mist.lastRound.heroTotal, 9);
  assert.equal(mist.lastRound.enemyTotal, 12);
  assert.equal(mist.lastRound.heroDamage, 2);
});

test('wound values replace repeated wounds at the same level and add across levels', () => {
  assert.deepEqual([-6, -4, -2, 0, 1, 3, 5].map(woundLevel), [3, 2, 1, 0, 1, 2, 3]);
  assert.equal(woundPenalty([1, 2, 0], exampleWounds), 4);
  assert.equal(woundPenalty([2, 1, 0], exampleWounds), 4);
  const first = resolveRound(startFight(hero, opponent, 'sand', exampleWounds), exampleWounds, 3, 4);
  const second = resolveRound(first, exampleWounds, 4, 4);
  assert.equal(second.lastRound.heroTotal, 6);
  assert.equal(second.lastRound.enemyTotal, 6);
  assert.equal(second.lastRound.wounded, null);
  assert.equal(second.lastRound.heroBonus, 0);
  assert.equal(second.lastRound.enemyBonus, 0);
  assert.deepEqual(second.enemyWounds, [1, 0, 0]);
});

test('severe wounds and higher enemy limits follow the wound progression', () => {
  assert.equal(woundPenalty([0, 0, 1], exampleWounds), 3);
  assert.equal(woundPenalty([0, 0, 2], exampleWounds), 4);
  assert.equal(woundPenalty([0, 0, 3], exampleWounds), 5);
  const fight = startFight(hero, { ...opponent, limit: 7 }, 'sand', exampleWounds);
  const nearEnd = { ...fight, round: 5, enemyWounds: [5, 0, 0] };
  const round = resolveRound(nearEnd, exampleWounds, 1, 4);
  assert.equal(round.lastRound.enemyDamage, 6);
  assert.equal(round.outcome, null);
  assert.equal(resolveRound(round, exampleWounds, 1, 5).outcome, 'win');
  const woundedHero = { ...fight, round: 2, heroWounds: [0, 0, 2] };
  assert.equal(resolveRound(woundedHero, exampleWounds, 1, 3).outcome, 'loss');
});

test('section 550 uses normal openings with a dagger or knuckles, and skips them with a garrote or fists', () => {
  const encounter = { ...opponent, streetFight: true, loss: 551 };
  for (const weapon of ['none', 'garrote']) {
    const fight = startFight(hero, encounter, 'sand', exampleWounds, weapon);
    const rolled = resolveRound(fight, exampleWounds, 3, 3);
    assert.deepEqual([rolled.lastRound.round, rolled.lastRound.heroBonus, rolled.lastRound.enemyBonus,
      rolled.lastRound.heroDiePenalty, rolled.lastRound.heroTotal], [2, 0, 0, 1, 4]);
  }
  for (const weapon of ['dagger', 'knuckles']) {
    const fight = startFight(hero, encounter, 'sand', exampleWounds, weapon);
    const rolled = resolveRound(fight, exampleWounds, 3, 3);
    assert.deepEqual([rolled.lastRound.round, rolled.lastRound.heroBonus,
      rolled.lastRound.heroDiePenalty], [1, 6, 0]);
  }
  const injured = startFight({ ...hero, wounds: [3, 0, 0] }, encounter, 'sand', exampleWounds, 'none');
  const retreat = resolveRound(injured, exampleWounds, 6, 2);
  assert.equal(retreat.forcedRetreat, true);
  assert.equal(retreat.outcome, 'loss');
  assert.equal(retreat.destination, 551);
  assert.equal(recordOutcome({ ...hero, battles: 6 }, retreat).skill, 3);
  const critical = startFight({ ...hero, wounds: [4, 0, 0] }, encounter, 'sand', exampleWounds, 'none');
  const fatal = resolveRound(critical, exampleWounds, 6, 1);
  assert.equal(fatal.death, true);
  assert.equal(fatal.forcedRetreat, false);
  assert.equal(fatal.destination, null);
  assert.equal(recordOutcome({ ...hero, battles: 6 }, fatal).skill, 2);
});

test('retreat timing and the seventh-battle bonus use the printed escape counts', () => {
  const encounter = { ...opponent, retreatAfter: 2, retreat: 'map' };
  const fight = startFight(hero, encounter, 'sand', exampleWounds);
  assert.equal(canFlee({ ...fight, round: 1 }), false);
  const result = flee({ ...fight, round: 2 });
  assert.equal(result.destination, 'map');
  assert.equal(recordOutcome({ ...hero, battles: 6, escapes: 1 }, result).skill, 3);
  assert.equal(recordOutcome({ ...hero, battles: 6, escapes: 2 }, result).skill, 2);
  const departure = flee({ ...fight, round: 2, encounter: { ...encounter, withdrawal: true } });
  assert.equal(recordOutcome(hero, departure).escapes, 0);
});

test('sparing the single guard and the last of a group use different conditions', () => {
  const fight = startFight(hero, opponent, 'sand', exampleWounds);
  const guard = { ...fight, encounter: { ...opponent, spareWhenWonByRound: 2 }, outcome: 'win', round: 2 };
  assert.equal(canSpare(guard, exampleWounds), true);
  assert.equal(canSpare({ ...guard, round: 3 }, exampleWounds), false);
  const pair = { ...fight, encounter: { ...opponent, limit: 4, spareLast: true }, enemyWounds: [1, 1, 0] };
  for (const candidate of [guard, pair]) {
    const result = spare(candidate, exampleWounds);
    assert.equal(result.outcome, 'win');
    assert.equal(result.destination, 118);
    assert.equal(canSpare(result, exampleWounds), false);
  }
});

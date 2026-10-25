import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(644);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAREGOD_RULES, LAREGOD_ENCOUNTERS, laregodOpponent, laregodPoints, startLaregodFight, laregodRound } from '../../../public/js/battlesim/engines/laregod-house/core.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };

test('equipment uses the printed twenty-point complete set, not fifteen or thirty-five', () => {
  assert.equal(laregodPoints(), 20);
  assert.equal(laregodPoints({ sword: true }), 25);
  assert.equal(laregodPoints({ sword: true, mail: true }), 30);
  assert.equal(laregodPoints({ sword: true, mail: true, dagger: true }), 40);
  assert.equal(laregodPoints({ sword: true, mail: true, dagger: true, success: true }), 50);
});

test('scimitar has twenty points against the two printed magical opponents and five otherwise', () => {
  for (const opponent of ['wingrugur', 'butchersword']) assert.equal(laregodPoints({ scimitar: true }, opponent), 40);
  assert.equal(laregodPoints({ scimitar: true }, 'other'), 25);
  assert.throws(() => laregodPoints({}, 'invented'), RangeError);
});

test('stone bonus follows the actual fight context, not every encounter', () => {
  const stone = { stone: true };
  assert.equal(laregodPoints(stone, 'wingrugur', 'market'), 40);
  assert.equal(laregodPoints(stone, 'other', 'guard'), 30);
  assert.equal(laregodPoints(stone, 'wingrugur', 'yard'), 20);
  assert.equal(laregodPoints(stone, 'other', 'manual'), 20);
});

test('enemy points are generated once and each fighter starts with ten endurance', () => {
  const equipment = { sword: true, mail: true, dagger: true, success: true };
  const f = startLaregodFight('yard', { equipment }, rolls(2));
  assert.deepEqual(f.player, { points: 50, endurance: 10 });
  assert.deepEqual(f.enemy, { points: 50, endurance: 10 });
  equipment.success = false;
  assert.equal(f.equipment.success, true);
  const result = laregodRound(f, {}, rolls(1));
  assert.equal(result.playerRating, 51);
  assert.equal(result.enemyRating, 50);
  assert.equal(result.enemyLoss, 2);
  assert.equal(result.fight.enemy.points, 50);
  assert.equal(f.round, 0);
  assert.equal(f.enemy.endurance, 10);
});

test('lower score loses two endurance; ties injure both without another roll', () => {
  const f = startLaregodFight('guard', {}, rolls(1));
  const lost = laregodRound(f, {}, rolls(6));
  assert.equal(lost.playerLoss, 2); assert.equal(lost.enemyLoss, 0);
  const tied = laregodRound(f, { number: 20 }, rolls());
  assert.equal(tied.outcome, 'tie');
  assert.equal(tied.playerLoss, 1); assert.equal(tied.enemyLoss, 1);
  assert.equal(tied.fight.player.endurance, 9); assert.equal(tied.fight.enemy.endurance, 9);
});

test('printed optional chance table can be entered explicitly without inventing a distribution', () => {
  const f = startLaregodFight('manual', { enemyNumber: 0, opponent: 'butchersword', equipment: { scimitar: true } }, rolls());
  assert.equal(f.enemy.points, 30);
  const result = laregodRound(f, { number: 0 }, rolls());
  assert.equal(result.playerRating, 40);
  assert.equal(result.enemyLoss, 2);
});

test('last endurance clamps at zero and simultaneous death is loss, never victory', () => {
  const f = startLaregodFight('yard', { enemyNumber: 1 });
  f.player.endurance = 1; f.enemy.endurance = 1;
  const dead = laregodRound(f, { number: 20 });
  assert.equal(dead.fight.status, 'loss');
  assert.equal(dead.fight.player.endurance, 0); assert.equal(dead.fight.enemy.endurance, 0);
  assert.throws(() => laregodRound(dead.fight), RangeError);
  const win = laregodRound({ ...f, player: { points: 50, endurance: 1 } }, { number: 1 });
  assert.equal(win.fight.status, 'win'); assert.equal(win.fight.enemy.endurance, 0);
  const loss = laregodRound(f, { number: 1 });
  assert.equal(loss.fight.status, 'loss'); assert.equal(loss.fight.player.endurance, 0);
});

test('invalid random results, contexts, saved states and manual numbers are rejected', () => {
  for (const value of [0, -1, 7, NaN, Infinity, .5]) assert.throws(() => startLaregodFight('yard', {}, () => value), RangeError);
  for (const value of [-1, NaN, Infinity, .5, 1000001]) assert.throws(() => startLaregodFight('yard', { enemyNumber: value }), RangeError);
  assert.throws(() => startLaregodFight('invented'), RangeError);
  const f = startLaregodFight('yard', { enemyNumber: 1 });
  assert.throws(() => laregodRound({ ...f, rulesVersion: 0 }), RangeError);
  assert.throws(() => laregodRound({ ...f, round: .5 }), RangeError);
  assert.throws(() => laregodRound({ ...f, player: { ...f.player, endurance: 0 } }), RangeError);
  for (const value of [-1, NaN, Infinity, .5, 1000001]) assert.throws(() => laregodRound(f, { number: value }), RangeError);
});


test('restored fights preserve wounds and use captured enemy rules without adding metadata to legacy saves', () => {
  const captured=startLaregodFight('guard',{enemyNumber:1});
  captured.encounter.enemy.damage=4;
  captured.player.endurance=6;
  assert.equal(laregodRound(captured,{number:1}).fight.player.endurance,2);
  const legacy=JSON.parse(JSON.stringify(startLaregodFight('guard',{enemyNumber:1})));
  delete legacy.encounter;
  legacy.player.endurance=6;
  legacy.enemy.endurance=7;
  legacy.legacyExtension={retained:true};
  const restored=laregodRound(legacy,{number:1}).fight;
  assert.equal(restored.player.endurance,4);
  assert.equal(restored.enemy.endurance,7);
  assert.equal('encounter' in restored,false);
  assert.deepEqual(restored.legacyExtension,{retained:true});
  assert.equal(legacy.player.endurance,6);
});

test('roster settings control equipment bonuses and the shared preview/start opponent lookup', () => {
  const rules=structuredClone(LAREGOD_RULES), opponent=LAREGOD_ENCOUNTERS.yard.opponent;
  try {
    LAREGOD_RULES.scimitar={wingrugur:7,butchersword:9,other:3};
    LAREGOD_RULES.stone={market:4,guard:6};
    assert.equal(laregodPoints({scimitar:true,stone:true},'wingrugur','market'),31);
    assert.equal(laregodPoints({scimitar:true,stone:true},'other','guard'),29);
    assert.equal(laregodPoints({scimitar:true},'butchersword','manual'),29);
    LAREGOD_ENCOUNTERS.yard.opponent='other';
    assert.equal(laregodOpponent('yard','butchersword'),'other');
    assert.equal(startLaregodFight('yard',{enemyNumber:0,equipment:{scimitar:true}}).player.points,23);
    assert.equal(laregodOpponent('manual','butchersword'),'butchersword');
    assert.equal(laregodOpponent('manual'),'other');
  } finally {
    Object.assign(LAREGOD_RULES,rules);LAREGOD_ENCOUNTERS.yard.opponent=opponent;
  }
});

test('changing master settings leaves a wounded serialized fight and its captured opponent intact', () => {
  const original=startLaregodFight('market',{enemyNumber:1,equipment:{scimitar:true,stone:true}});
  original.player.endurance=7;original.enemy.endurance=4;original.round=3;
  original.extension={keep:['notes']};
  const saved=JSON.stringify(original), fight=JSON.parse(saved), rules=structuredClone(LAREGOD_RULES);
  try {
    LAREGOD_RULES.scimitar.wingrugur=1;LAREGOD_RULES.stone.market=0;
    const next=laregodRound(fight,{number:0}).fight;
    assert.equal(next.player.points,60);assert.equal(next.player.endurance,7);
    assert.equal(next.enemy.endurance,2);assert.equal(next.round,4);
    assert.deepEqual(next.extension,original.extension);
    assert.equal(JSON.stringify(fight),saved);
  } finally {Object.assign(LAREGOD_RULES,rules);}
});

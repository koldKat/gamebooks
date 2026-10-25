import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { encounterPreset, ENCOUNTERS } from '../../../public/js/battlesim/books/873/definition.js';
import { newCharacter, playerShot, enemyShot, resolveExchange, startFight, resolveFightRound, addReinforcement } from '../../../public/js/battlesim/books/873/combat.js';
import { createState } from '../../../public/js/battlesim/books/873/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim873.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim873.js';
import {encounterPreset as missionPreset, ENCOUNTERS as MISSION_ENCOUNTERS} from '../../../public/js/battlesim/books/896/definition.js';
import {createState as createMissionState} from '../../../public/js/battlesim/books/896/state.js';
import missionEn from '../../../public/js/i18n/en/battlesim/battlesim896.js';
import missionBg from '../../../public/js/i18n/bg/battlesim/battlesim896.js';

await loadFixtureRoster(873);
await loadFixtureRoster(896);

test('Dangerous Mission keeps its edition-specific exposure threshold', () => {
  assert.equal(MISSION_ENCOUNTERS.length, 12);
  const player = newCharacter(), original = encounterPreset(88), mission = missionPreset(88);
  assert.equal(enemyShot(player, mission, 2, [2, 2]).threshold, 7);
  assert.equal(enemyShot(player, mission, 3, [2, 2]).hit, false);
  assert.equal(enemyShot(player, mission, 3, [2, 3]).threshold, 5);
  assert.equal(enemyShot(player, mission, 3, [2, 3]).hit, true);
  assert.equal(enemyShot(player, original, 3, [1, 2]).hit, true);
  const saved = startFight(player, original);
  mission.exposedThreshold = 12;
  assert.equal(saved.encounter.exposedThreshold, 3);
  assert.equal(missionPreset(88).exposedThreshold, 5);
});

test('edition state writes are isolated and stale updates are rejected', () => {
  const run = {sim873: {schemaVersion: 1, character: newCharacter(), fight: startFight(newCharacter(), encounterPreset(88)), history: [], log: []}};
  const before = JSON.stringify(run.sim873);
  let bookId = 896, saves = 0;
  const store = createMissionState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  assert.equal(store.change(data => {data.character = newCharacter();}), true);
  assert.equal(saves, 1);
  assert.equal(JSON.stringify(run.sim873), before);
  const mission = JSON.stringify(run.sim896);
  assert.equal(store.change(data => {data.character.health = 2; bookId = 873;}), false);
  assert.equal(JSON.stringify(run.sim896), mission);
  assert.equal(JSON.stringify(run.sim873), before);
  assert.equal(store.read(), null);
});

test('Dangerous Mission translations preserve labels and placeholders', () => {
  assert.deepEqual(Object.keys(missionEn).sort(), Object.keys(missionBg).sort());
  const fields = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(missionEn)) assert.deepEqual(fields(missionEn[key]), fields(missionBg[key]), key);
  assert.equal(missionBg['battlesim896.title'], 'Опасна мисия');
});

test('translations have matching keys and placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  const fields = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(en)) assert.deepEqual(fields(en[key]), fields(bg[key]), key);
});

test('roster and general health, shooting, weapon and finite ammunition bonuses', () => {
  assert.equal(ENCOUNTERS.length, 12);
  const original = newCharacter();
  const shot = playerShot(original, encounterPreset(27), {weapon: 1, tracer: true}, [1, 1]);
  assert.equal(shot.total, 12);
  assert.equal(shot.character.tracers, 11);
  assert.equal(original.tracers, 12);
  assert.equal(playerShot({...original, health: 2}, encounterPreset(63), {}, [1, 1]).bonus, 3);
  assert.throws(() => playerShot({...original, tracers: 0}, encounterPreset(27), {tracer: true}, [6, 6]));
  assert.throws(() => playerShot(original, encounterPreset(63), {}, [7, 1]));
});

test('round-three exposure sets the enemy threshold to three', () => {
  const enemy = encounterPreset(88), player = newCharacter();
  assert.equal(enemyShot(player, enemy, 2, [1, 2]).hit, false);
  const exposed = enemyShot(player, enemy, 3, [1, 2]);
  assert.equal(exposed.threshold, 3);
  assert.equal(exposed.character.health, 1);
});

test('aircraft damage carries into the fight without wounding the pilot', () => {
  const fight = startFight({...newCharacter(), aircraftHits: 3}, encounterPreset(152));
  const result = resolveFightRound(fight, {}, {player: [[1, 1]], enemy: [[6, 6]]});
  assert.equal(result.fight.character.aircraftHits, 4);
  assert.equal(result.fight.character.health, 0);
  assert.equal(result.destination, '12');
  assert.equal(fight.character.aircraftHits, 3);
  assert.throws(() => playerShot(newCharacter(), encounterPreset(152), {weapon: 1}, [6, 6]));
});

test('single exchanges retain both shots and do not award a battle win', () => {
  const result = resolveExchange(newCharacter(), encounterPreset(128), {}, {player: [6, 6], enemy: [6, 6]});
  assert.equal(result.first, 'enemy');
  assert.equal(result.player.hit, true);
  assert.equal(result.opponent.hit, true);
  assert.equal(result.destination, '38');
  assert.equal(result.awardWin, false);
  assert.equal(resolveExchange({...newCharacter(), health: 1}, encounterPreset(114), {}, {player: [1, 1], enemy: [1, 1]}).destination, '98');
  assert.throws(() => startFight(newCharacter(), encounterPreset(128)));
});

test('a shot disables one opponent, and only survivors return fire', () => {
  const fight = startFight(newCharacter(), encounterPreset(27));
  const result = resolveFightRound(fight, {weapon: 1}, {player: [[6, 6]], enemy: [[1, 1], [1, 1], [1, 1], [1, 1]]});
  assert.equal(result.fight.remaining, 4);
  assert.equal(result.fight.enemyShots, 4);
  assert.equal(fight.remaining, 5);
});

test('opening extra shot consumes only available special ammunition', () => {
  const fight = startFight({...newCharacter(), tracers: 1}, encounterPreset(65));
  const result = resolveFightRound(fight, {tracer: true}, {player: [[1, 1], [6, 6]]});
  assert.equal(result.fight.playerShots, 2);
  assert.equal(result.fight.character.tracers, 0);
  assert.equal(result.fight.outcome, 'win');
  assert.equal(result.fight.enemyShots, 0);
});

test('enemy-first death prevents shooting; reinforcement remains an explicit source control', () => {
  const fight = startFight({...newCharacter(), health: 2}, encounterPreset(81));
  const reinforced = addReinforcement(fight);
  assert.equal(reinforced.remaining, 2);
  assert.equal(fight.remaining, 1);
  assert.throws(() => addReinforcement(reinforced));
  const result = resolveFightRound(fight, {}, {enemy: [[6, 6]]});
  assert.equal(result.fight.playerShots, 0);
  assert.equal(result.destination, '103');
});

test('state writes are bounded, run-guarded and isolated from other simulator saves', () => {
  const other = {saved: true}, run = {sim860: other};
  let current = run, book = 873, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => current, saveState: () => saves++}));
  assert.equal(store.change(data => {data.character = newCharacter(); data.log = Array(170).fill('x');}), true);
  assert.equal(run.sim873.log.length, 160);
  assert.equal(run.sim860, other);
  const before = run.sim873;
  assert.equal(store.change(() => {current = {};}), false);
  assert.equal(run.sim873, before);
  current = run; book = 860;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => {}), false);
  assert.equal(saves, 1);
});

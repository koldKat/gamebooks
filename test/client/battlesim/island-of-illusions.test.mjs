import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/838/combat.js';
import { ENCOUNTERS, ENEMIES, encounterPreset, ISLAND_RULES } from '../../../public/js/battlesim/books/838/definition.js';
import { createState } from '../../../public/js/battlesim/books/838/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim838.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim838.js';

await loadFixtureRoster(838);

const character = () => ({life: 30, agility: 7, gold: 10});
const start = (section, changes = {}) => {
  const preset = encounterPreset(section);
  return combat.startFight({...character(), ...changes}, preset.enemies, {...preset, encounter: preset});
};
const sumDice = sum => [Math.max(1, sum - 6), Math.min(6, sum - 1)];
const round = (fight, sum, target = 0, damageDie) => combat.playRound(fight, {target, dice: sumDice(sum), damageDie});

test('dictionaries match keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
});
test('new characters use printed dice and resources without changing existing values', () => {
  assert.deepEqual(combat.newCharacter(() => 1), {life: 22, agility: 4, gold: 10});
  assert.deepEqual(combat.newCharacter(() => 6), {life: 32, agility: 9, gold: 10});
  assert.deepEqual(combat.validateCharacter({life: 40, agility: 1, gold: 0}), {life: 40, agility: 1, gold: 0});
  assert.throws(() => combat.newCharacter(() => 7));
});
test('nine encounters and eight named enemies retain printed endurance and thresholds', () => {
  assert.equal(ENCOUNTERS.length, 9); assert.equal(ENEMIES.length, 8);
  assert.deepEqual(ENCOUNTERS.map(row => [row.section, row.hitAt]), [[10,6],[20,8],[22,5],[32,8],[38,6],[44,7],[49,7],[54,7],[59,7]]);
  assert.deepEqual(encounterPreset(20).enemies.map(row => row.hp), [12, 9]);
  assert.equal(encounterPreset(38).enemies[0].hp, null);
  assert.throws(() => start(38), 'standalone survivor requires the actual remaining endurance');
  const copy = encounterPreset(20); copy.enemies[0].hp = 1;
  assert.equal(encounterPreset(20).enemies[0].hp, 12);
});
test('ordinary duel tables use exact boundaries and never add a counterattack', () => {
  for (const section of [10,32,44,49,54]) {
    const preset = encounterPreset(section), original = start(section);
    const hit = round(original, preset.hitAt), miss = round(original, preset.hitAt - 1);
    assert.equal(hit.enemies[0].hp, original.enemies[0].hp - 3, String(section));
    assert.equal(hit.character.life, 30);
    assert.equal(miss.character.life, 27); assert.equal(miss.enemies[0].hp, original.enemies[0].hp);
    assert.equal(original.character.life, 30);
  }
});
test('paired pirates apply the printed six/three damage bands', () => {
  for (const sum of [2,3,4,7,8,12]) {
    const next = round(start(20), sum, 1);
    assert.equal(next.character.life, sum <= 3 ? 24 : sum <= 7 ? 27 : 30);
    assert.equal(next.enemies[1].hp, sum >= 8 ? 6 : 9);
    assert.equal(next.enemies[0].hp, 12);
  }
});
test('the first pirate kill preserves the survivor and switches to section38 without awarding victory', () => {
  let fight = round(start(20), 8, 0);
  for (let i = 0; i < 3; i++) fight = round(fight, 8, 1);
  assert.equal(fight.enemies[0].hp, 9); assert.equal(fight.enemies[1].hp, 0);
  assert.equal(fight.singlePirate, true); assert.equal(fight.outcome, null);
  assert.ok(fight.events.some(event => event.kind === 'survivor' && event.hp === 9));
  fight = round(fight, 6, 0);
  assert.equal(fight.enemies[0].hp, 6);
  fight = round(round(fight, 6), 6);
  assert.equal(fight.outcome, 'win'); assert.equal(fight.destination, '57');
});
test('octopus damage uses an extra die times three only when the player is hit', () => {
  assert.equal(round(start(22), 4, 0, 6).character.life, 12);
  assert.equal(round(start(22), 4, 0, 1).character.life, 27);
  let used = 0;
  const random = () => { used++; return 6; };
  assert.equal(combat.playRound(start(22), {}, random).enemies[0].hp, 12);
  assert.equal(used, 2);
  used = 0;
  const values = [1, 1, 4];
  assert.equal(combat.playRound(start(22), {}, () => values[used++]).character.life, 18);
  assert.equal(used, 3);
});
test('dog pack retains printed damage bands after a kill and ends only after three kills', () => {
  for (const [sum, damage] of [[2,9],[3,6],[4,3],[6,3],[7,0]]) assert.equal(round(start(59), sum).character.life, 30 - damage);
  let fight = round(round(start(59), 7), 7);
  assert.equal(fight.kills, 1); assert.equal(fight.outcome, null);
  fight = round(fight, 2, 1);
  assert.equal(fight.character.life, 21);
  for (const target of [1,1,2,2]) fight = round(fight, 7, target);
  assert.equal(fight.kills, 3); assert.equal(fight.outcome, 'win'); assert.equal(fight.destination, '35');
});
test('death, invalid dice, dead targets and completed fights cannot continue', () => {
  const dead = round(start(22, {life: 17}), 4, 0, 6);
  assert.equal(dead.character.life, 0); assert.equal(dead.outcome, 'loss');
  assert.throws(() => round(dead, 12));
  assert.throws(() => start(10, {life: 0})); assert.throws(() => start(10, {agility: 0}));
  assert.throws(() => combat.playRound(start(10), {dice: [0, 6]}));
  assert.throws(() => combat.playRound(start(10), {dice: [6]}));
  const oneDead = round(round(start(59), 7), 7);
  assert.throws(() => round(oneDead, 7, 0));
});
test('freeform fights work without presets and cancellation keeps damage', () => {
  let fight = combat.startFight(character(), [{displayName: 'Custom', hp: 3}], {hitAt: 12});
  fight = round(fight, 11);
  const cancelled = combat.cancelFight(fight);
  assert.equal(cancelled.character.life, 27); assert.equal(cancelled.enemies[0].hp, 3);
  assert.equal(cancelled.outcome, 'cancelled'); assert.throws(() => round(cancelled, 12));
  const win = round(combat.startFight({...character(), life: 1}, [{displayName:'Custom',hp:3}], {hitAt:12}), 12);
  assert.equal(win.outcome, 'win'); assert.equal(win.character.life, 1); assert.equal(win.destination, null);
});
test('agility checks include equality and whirlpool adds exactly one for the magic sail', () => {
  assert.equal(combat.checkAgility(character(), [1,6]).success, true);
  assert.equal(combat.checkAgility(character(), [2,6]).success, false);
  assert.equal(combat.checkAgility({...character(), agility:0}, [1,1]).success, false);
  assert.deepEqual(combat.checkWhirlpool(2, false), {total:2,destination:'47'});
  assert.deepEqual(combat.checkWhirlpool(2, true), {total:3,destination:'62'});
});
test('state records only a completed fight once and preserves unrelated run data', () => {
  const run = {path:[1],other:{value:42}};
  let saves = 0;
  const store = createState(() => ({currentBookId:838,currentPlaythrough:()=>run,saveState:()=>saves++}));
  store.change(data => { data.character = character(); data.fight = start(20); });
  store.change(data => { data.fight = round(data.fight, 2); });
  assert.equal(store.read().history.length, 0);
  store.change(data => {
    data.fight = combat.startFight(character(), [{displayName:'Custom',hp:3}]);
    data.fight = round(data.fight, 12);
  });
  assert.equal(store.read().history.length, 1);
  store.change(() => {});
  assert.equal(store.read().history.length, 1); assert.equal(saves, 4);
  assert.deepEqual(run.other, {value:42}); assert.deepEqual(run.path, [1]);
});
test('state rejects replaced runs and does not migrate saved fights when reading', () => {
  const first = {sim838:{schemaVersion:1,character:character(),fight:start(20),history:[],log:[]}};
  let run = first, saves = 0;
  const store = createState(() => ({currentBookId:838,currentPlaythrough:()=>run,saveState:()=>saves++}));
  const original = structuredClone(first);
  assert.equal(store.read(), first.sim838); assert.deepEqual(first, original);
  assert.equal(store.change(data => { data.character.life = 1; run = {}; }), false);
  assert.deepEqual(first, original); assert.equal(saves, 0);
});

test('loaded pirate thresholds and damage bands apply to saved survivor fights', () => {
  const before = structuredClone(ISLAND_RULES);
  try {
    Object.assign(ISLAND_RULES.pirates, {pairedHit:9, singleHit:7, doubleDamageMaximum:4, doubleDamage:5});
    assert.equal(round(start(20), 8).character.life, 27);
    assert.equal(round(start(20), 4).character.life, 25);
    const fight = {...start(20), singlePirate:true, kills:1, rounds:4, extension:{kept:true}};
    fight.enemies[1].hp = 0;
    const saved = JSON.stringify(fight);
    const next = round(fight, 6);
    assert.equal(next.character.life, 27); assert.equal(next.enemies[0].hp, 12);
    assert.equal(next.rounds, 5); assert.equal(next.singlePirate, true);
    assert.deepEqual(next.extension, {kept:true}); assert.equal(JSON.stringify(fight), saved);
    assert.equal(round(fight, 7).enemies[0].hp, 9);
  } finally { Object.assign(ISLAND_RULES, before); }
});

test('loaded damage and dog completion settings govern outcomes without resetting progress', () => {
  const before = structuredClone(ISLAND_RULES);
  try {
    ISLAND_RULES.hitDamage = 2; ISLAND_RULES.baseDamage = 2;
    Object.assign(ISLAND_RULES.dogs, {hitAt:8, kills:2, damageBySum:{2:7,3:4}});
    assert.equal(round(start(59), 7).character.life, 28);
    assert.equal(round(start(59), 2).character.life, 23);
    assert.equal(round(start(59), 3).character.life, 26);
    const f = {...start(59), kills:1, rounds:7};
    f.enemies[0].hp = 0; f.enemies[1].hp = 2;
    const g = round(f, 8, 1);
    assert.equal(g.kills, 2); assert.equal(g.outcome, 'win');
    assert.equal(g.enemies[2].hp, 5); assert.equal(g.rounds, 8);
    ISLAND_RULES.octopus.damageMultiplier = 2;
    assert.equal(round(start(22), 4, 0, 6).character.life, 18);
    assert.equal(round(start(10), 6).enemies[0].hp, 7);
  } finally { Object.assign(ISLAND_RULES, before); }
});

test('whirlpool routes use loaded settings while the sail still adds exactly one', () => {
  const before = structuredClone(ISLAND_RULES);
  try {
    Object.assign(ISLAND_RULES.whirlpool, {minimum:4, success:'80', failure:'81'});
    assert.deepEqual(combat.checkWhirlpool(3, false), {total:3,destination:'81'});
    assert.deepEqual(combat.checkWhirlpool(3, true), {total:4,destination:'80'});
  } finally { Object.assign(ISLAND_RULES, before); }
});

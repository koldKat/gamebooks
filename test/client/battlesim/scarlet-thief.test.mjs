import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/832/combat.js';
import { encounterPreset, SCARLET_RULES } from '../../../public/js/battlesim/books/832/definition.js';
import { createState } from '../../../public/js/battlesim/books/832/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim832.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim832.js';

await loadFixtureRoster(832);

const start = (section, changes = {}, opponent = {}) => {
  const preset = encounterPreset(section);
  return combat.startFight({...combat.newCharacter(), ...changes}, {...preset, ...opponent}, preset.mode, preset.destination);
};
const rolls = changes => ({player: 6, enemy: 6, enemyChoice: 4, dodge: 6, sphere: 6, ...changes});
const tiger = changes => ({skill: 'speed', target: 'body', guard: 'body', dart: false, ...changes});

test('dictionaries preserve keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
});

test('printed character defaults and outside-combat healing', () => {
  const c = combat.newCharacter();
  assert.equal(c.speed + c.stealth + c.money, 10);
  assert.equal(c.disguise, 0); assert.equal(c.life, 4);
  assert.equal(combat.useMedkit({...c, life: 2, medkits: 1}).life, 3);
  assert.throws(() => combat.useMedkit({...c, life: 0, medkits: 1}));
  assert.throws(() => combat.validateCharacter({...c, speed: 2.5}));
});
test('verbal duel blocks a preselected insult category and does not spend Life', () => {
  const c = {lie: 'medium', counter: 'large'};
  const f = combat.playRound(start(3, {disguise: 2}), c, rolls({player: 4, enemyChoice: 6, enemy: 6}));
  assert.equal(f.health, 8); assert.equal(f.hp, 6); assert.equal(f.character.life, 4);
  const g = combat.playRound(f, {...c, counter: 'small'}, rolls({player: 1, enemyChoice: 6, enemy: 6}));
  assert.equal(g.health, 5); assert.equal(g.hp, 6);
});
test('verbal duel ends at the first zero and failure goes to prison', () => {
  const c = {lie: 'large', counter: 'small'};
  const f = combat.playRound(start(3, {}, {hp: 3}), c, rolls({player: 6, enemyChoice: 6, enemy: 6}));
  assert.equal(f.outcome, 'win'); assert.equal(f.destination, '13'); assert.equal(f.health, 6);
  let g = start(3);
  for (let i = 0; i < 2; i++) g = combat.playRound(g, c, rolls({player: 1, enemyChoice: 6, enemy: 6}));
  assert.equal(g.outcome, 'loss'); assert.equal(g.destination, '8'); assert.equal(g.character.life, 4);
});
test('tiger target modifiers, harmless ties, guarded hits and darts only on a hit', () => {
  let f = combat.playRound(start(37, {speed: 7, darts: 1}), tiger({dart: true}), rolls());
  assert.equal(f.hp, 10); assert.equal(f.health, 8); assert.equal(f.character.darts, 1);
  f = combat.playRound(f, tiger({target: 'head', guard: 'legs', dart: true}), rolls({player: 6, enemy: 1}));
  assert.equal(f.hp, 5); assert.equal(f.character.darts, 0);
  const g = combat.playRound(start(37), tiger(), rolls({player: 1, enemy: 6}));
  assert.equal(g.health, 8);
  assert.throws(() => combat.playRound(start(37), tiger({dart: true}), rolls()));
});
test('tiger shield is temporary and victory restores the actual pre-fight Life', () => {
  const initial = start(37, {life: 2, speed: 10});
  assert.equal(initial.health, 6);
  const f = combat.playRound(initial, tiger({target: 'head'}), rolls({enemy: 1}));
  const g = combat.playRound({...f, hp: 1}, tiger(), rolls({enemy: 1}));
  assert.equal(g.outcome, 'win'); assert.equal(g.character.life, 2); assert.equal(g.destination, '49');
  const h = combat.cancelFight({...f, health: 5});
  assert.equal(h.character.life, 1); assert.equal(h.outcome, 'cancelled');
});
test('countess checks are strict and normal attacks require the dodge roll', () => {
  let f = combat.playRound(start(63, {speed: 4}), {skill: 'speed'}, rolls({player: 4}));
  assert.equal(f.hp, 6);
  f = combat.playRound(f, {skill: 'speed'}, rolls({player: 3, dodge: 3}));
  assert.equal(f.hp, 6);
  f = combat.playRound(f, {skill: 'speed'}, rolls({player: 3, dodge: 4}));
  assert.equal(f.hp, 5);
  assert.equal(combat.playRound(start(63), {skill: 'speed'}, rolls({enemy: 1})).character.life, 2);
});
test('emeralds change the test modifier and damage, not the strict comparison', () => {
  const c = {skill: 'stealth'};
  let f = combat.playRound(start(77, {stealth: 5}), c, rolls({player: 3, enemy: 1}));
  assert.equal(f.hp, 4); assert.equal(f.character.life, 3);
  f = combat.playRound(f, c, rolls({player: 2, dodge: 1}));
  assert.equal(f.hp, 3);
});
test('zero Life ends the countess fight before a lethal player counterblow', () => {
  const f = combat.playRound(start(63, {life: 2, speed: 10}, {hp: 1}), {skill: 'speed'}, rolls({player: 1, enemy: 1}));
  assert.equal(f.outcome, 'loss'); assert.equal(f.hp, 1); assert.equal(f.character.life, 0);
  assert.throws(() => combat.playRound(f, {skill: 'speed'}, rolls()));
});
test('clock hazards are independent and work increases the corresponding risk', () => {
  const f = combat.playRound(start(71), {work: 'sphere'}, rolls({sphere: 2, enemy: 2}));
  assert.equal(f.health, 2); assert.equal(f.hours, 4);
  const g = combat.playRound(start(71), {work: 'gears'}, rolls({sphere: 2, enemy: 3}));
  assert.equal(g.health, 4); assert.equal(g.hours, 1);
});
test('cuckoo uses strict modified checks and stops hazards once disabled', () => {
  const c = {work: 'cuckoo', skill: 'speed'};
  let f = combat.playRound(start(71, {speed: 5}), c, rolls({player: 2, enemy: 5}));
  assert.equal(f.hp, 3); assert.equal(f.hours, 0);
  f = combat.playRound(f, c, rolls({player: 1, enemy: 5}));
  assert.equal(f.hp, 2); assert.equal(f.hours, 2);
  f = combat.playRound({...f, hp: 1}, c, rolls({player: 1, enemy: 5}));
  assert.equal(f.hp, 0);
  const g = combat.playRound(f, {work: 'gears'}, rolls({enemy: 1}));
  assert.equal(g.health, 4);
  assert.throws(() => combat.playRound(g, c, rolls()));
});
test('clock requires exact twelve and death takes precedence', () => {
  const c = {work: 'sphere'};
  const f = combat.playRound({...start(71), hours: 10}, c, rolls());
  assert.equal(f.hours, 14); assert.equal(f.outcome, null);
  const g = combat.playRound({...start(71), hours: 8}, c, rolls());
  assert.equal(g.outcome, 'win'); assert.equal(g.destination, '59');
  const h = combat.playRound({...start(71, {life: 1}), hours: 8}, c, rolls({sphere: 1}));
  assert.equal(h.outcome, 'loss'); assert.equal(h.character.life, 0);
});
test('immutable rules and state do not mutate originals or unrelated runs', () => {
  const f = start(37), before = structuredClone(f);
  combat.playRound(f, tiger(), rolls()); assert.deepEqual(f, before);
  let book = 832, run = {}, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(d => { d.fight = combat.playRound(start(3, {}, {hp: 1}), {lie: 'small', counter: 'small'}, rolls({player: 1})); });
  store.change(() => {}); assert.equal(run.sim832.history.length, 1);
  book = 1; assert.equal(store.change(() => {}), false); assert.equal(store.read(), null);
  book = 832; assert.equal(store.change(() => { run = {}; }), false); assert.deepEqual(run, {});
  assert.equal(saves, 2);
});

test('loaded persuasion and tiger settings govern setup, saved fights and cancellation', () => {
  const before = structuredClone(SCARLET_RULES);
  try {
    SCARLET_RULES.persuasion.health = 7;
    SCARLET_RULES.persuasion.lossDestination = '99';
    SCARLET_RULES.persuasion.choices[5] = 'small';
    let f = start(3, {disguise: 1000});
    assert.equal(f.health, 1007);
    f = {...f, health: 1, turns: 9, extension: {kept: true}};
    const saved = JSON.stringify(f);
    const g = combat.playRound(f, {lie: 'large', counter: 'large'}, rolls({player: 1, enemyChoice: 6, enemy: 1}));
    assert.equal(g.destination, '99'); assert.equal(g.outcome, 'loss');
    assert.equal(g.turns, 10); assert.deepEqual(g.extension, {kept: true});
    assert.equal(JSON.stringify(f), saved);
    SCARLET_RULES.tiger.healthBonus = 5;
    SCARLET_RULES.tiger.targets[5] = 'legs';
    f = start(37, {life: 2});
    assert.equal(f.health, 7);
    const h = combat.playRound(f, tiger({guard: 'head'}), rolls({player: 1, enemy: 6, enemyChoice: 6}));
    assert.equal(h.health, 6); assert.equal(h.events[0].enemyChoice, 'legs');
    assert.equal(combat.cancelFight(h).character.life, 1);
  } finally { Object.assign(SCARLET_RULES, before); }
});

test('loaded Countess and emerald settings control hazard, dodge and skill boundaries', () => {
  const before = structuredClone(SCARLET_RULES);
  try {
    Object.assign(SCARLET_RULES.countess, {hitMaximum: 4, damage: 1, dodgeMinimum: 5});
    let f = combat.playRound(start(63, {speed: 6}), {skill: 'speed'}, rolls({player: 1, enemy: 4, dodge: 4}));
    assert.equal(f.health, 3); assert.equal(f.hp, 6);
    f = combat.playRound(f, {skill: 'speed'}, rolls({player: 1, enemy: 5, dodge: 5}));
    assert.equal(f.health, 3); assert.equal(f.hp, 5);
    Object.assign(SCARLET_RULES.emeralds, {hitMaximum: 4, damage: 2, skillPenalty: 1});
    f = combat.playRound(start(77, {speed: 4}), {skill: 'speed'}, rolls({player: 2, enemy: 4}));
    assert.equal(f.health, 2); assert.equal(f.hp, 3);
  } finally { Object.assign(SCARLET_RULES, before); }
});

test('saved clock progress uses loaded hazards and cycle without mutating the save', () => {
  const before = structuredClone(SCARLET_RULES);
  try {
    Object.assign(SCARLET_RULES.clock, {cycle: 10, sphereDamage: 2, birdDamage: 2, skillPenalty: 1});
    SCARLET_RULES.clock.hours.gears = 2;
    SCARLET_RULES.clock.sphereHitMaximum.gears = 3;
    SCARLET_RULES.clock.birdHitMaximum.cuckoo = 5;
    const f = {...start(71), hp: 0, hours: 8, turns: 7, extension: ['saved']};
    const saved = JSON.stringify(f);
    const g = combat.playRound(f, {work: 'gears'}, rolls({sphere: 3, enemy: 1}));
    assert.equal(g.health, 2); assert.equal(g.hp, 0); assert.equal(g.hours, 10);
    assert.equal(g.turns, 8); assert.equal(g.outcome, 'win');
    assert.deepEqual(g.extension, ['saved']); assert.equal(JSON.stringify(f), saved);
    const h = combat.playRound(start(71, {speed: 4}), {work: 'cuckoo', skill: 'speed'}, rolls({player: 2, enemy: 5}));
    assert.equal(h.hp, 2); assert.equal(h.health, 2); assert.equal(h.hours, 2);
  } finally { Object.assign(SCARLET_RULES, before); }
});

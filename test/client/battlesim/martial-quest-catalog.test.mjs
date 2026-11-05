import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1591/definition.js';
import {normalizeMartialEncounter, startMartialFight, martialAction}
  from '../../../public/js/battlesim/engines/martial-quest/core.js';

const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const player = {maxHp:36, hp:36, prowess:18, perception:18, kenjutsu:20, experience:5};
const act = (fight, action) => martialAction(fight, {expectedEvent:fight.events.length, ...action});

test('all installed martial procedures load with source references and closed combat graphs', async () => {
  const rows = getRosterRows(1591);
  await loadRoster(async url => {
    assert.equal(url, '/api/books/1591/enemies');
    return {ok:true, json:async () => rows};
  });
  assert.equal(ENCOUNTERS.length, 3);
  assert.equal(RULES.currentStatsOnly, true);
  assert.equal(RULES.experienceBeforeRoll, true);
  const allSections = new Set();
  for (const encounter of ENCOUNTERS) {
    normalizeMartialEncounter(encounter);
    for (const step of encounter.steps) {
      allSections.add(step.section);
      assert.ok(step.sourcePdfPages.every(page => Number.isInteger(page) && page >= 1 && page <= 196));
    }
    assert.equal(startMartialFight(player, encounter).status, 'fighting');
  }
  assert.equal(allSections.size, 71);
  assert.deepEqual(ENCOUNTERS.map(entry => entry.section), ['25','132','8']);
  assert.ok(!allSections.has('85'), 'scripted ninja test is excluded');
  assert.ok(!allSections.has('82'), 'army exercise is excluded');
});

test('installed training thresholds, damage, exhaustion gates and terminal outcomes stay distinct', () => {
  const [bokken, karate] = ENCOUNTERS;
  const b = section => bokken.steps.find(step => step.section === String(section));
  const k = section => karate.steps.find(step => step.section === String(section));
  assert.equal(b(25).target, 21); assert.equal(b(27).target, 22);
  assert.equal(b(66).target, 22); assert.equal(b(87).target, 23);
  assert.equal(b(154).skill, 'perception'); assert.equal(b(154).target, 20);
  assert.deepEqual(b(9).choices.map(choice => choice.to), ['60','46']);
  assert.deepEqual(b(218).hpGate, {threshold:4, low:'181'});
  assert.deepEqual(k(198).hpGate, {threshold:6, low:'126'});
  assert.deepEqual(k(14).damage, [{fixed:3},{fixed:2}]);
  assert.deepEqual(k(38).damage, [{fixed:6},{fixed:3}]);
  assert.deepEqual(k(172).damage, [{fixed:3},{fixed:4}]);
  assert.deepEqual(k(206).damage, [{fixed:2}]);
  assert.deepEqual(k(231).damage, [{fixed:2},{fixed:2}]);
  assert.deepEqual(k(129).damage, [{fixed:5}]);
  assert.equal(k(206).threshold, 19); assert.equal(k(231).high, '32');
  assert.deepEqual(bokken.steps.filter(step => step.outcome === 'win').map(step => step.section).sort(), ['165','51']);
  assert.deepEqual(karate.steps.filter(step => step.outcome === 'win').map(step => step.section).sort(), ['18','32']);
  assert.equal(b(147).outcome, 'loss'); assert.equal(k(147).zeroHp, undefined);
  for (const [preset, section] of [[bokken,'181'],[karate,'126']]) {
    let fight = startMartialFight(player, {...preset, section});
    fight = act(fight, {kind:'continue'});
    assert.equal(fight.status, 'loss'); assert.equal(fight.player.hp, 0);
    assert.equal(fight.opponent.training, true);
    assert.equal(fight.destination, '117');
  }
});

test('installed Ogawa duel applies its opening wound and records only the final result', () => {
  const ogawa = ENCOUNTERS[2];
  let fight = startMartialFight(player, ogawa);
  assert.equal(fight.phase, 'damage');
  fight = act(fight, {kind:'damage'}); assert.equal(fight.player.hp, 31);
  fight = act(fight, {kind:'roll', die:3, spent:0});
  assert.equal(fight.pending, '76'); assert.equal(fight.status, 'fighting');
  fight = act(fight, {kind:'continue', destination:'76'});
  fight = act(fight, {kind:'choice', destination:'97'});
  fight = act(fight, {kind:'continue', destination:'97'});
  fight = act(fight, {kind:'roll', die:2, spent:0});
  fight = act(fight, {kind:'continue', destination:'134'});
  assert.equal(fight.status, 'fighting');
  fight = act(fight, {kind:'continue'}); assert.equal(fight.status, 'win');
  assert.equal(fight.player.hp, 31);
});

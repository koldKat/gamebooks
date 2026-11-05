import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1587/definition.js';
import {startQuestFight, questRoll, exitQuestFight} from '../../../public/js/battlesim/engines/super-endless-quest/core.js';

const document = readRosterDocument(1587);
await loadRoster(async () => ({ok:true, json:async () => document.enemies}));
const hero = {maxHp:36, hp:30, fighting:3, experience:4};
const encounter = section => ENCOUNTERS.find(entry => entry.section === section);

test('database supplies all reviewed presets and general source rules', () => {
  assert.equal(ENCOUNTERS.length, 15); assert.equal(new Set(ENCOUNTERS.map(entry => entry.section)).size, 15);
  assert.equal(document.family, 'super-endless-quest'); assert.equal(RULES.skillsTotal, 9);
  assert.equal(RULES.minimumEachSkill, 1);
  for (const entry of ENCOUNTERS) {
    assert.ok(entry.sourcePdfPages.length); assert.equal(entry.dice, 2);
    let fight = startQuestFight(hero, entry);
    if (fight.phase === 'save') fight = questRoll(fight, {expectedEvent:0, dice:[4,4]});
    fight = questRoll(fight, {expectedEvent:fight.events.length, dice:[6,6]});
    assert.equal(fight.status, 'win'); assert.equal(fight.round, 1); assert.equal(fight.destination, entry.winSection);
  }
});

test('original duplicate destination, distinct draconians and aggregate war dogs are retained', () => {
  assert.equal(encounter('60').winSection, encounter('60').fleeSection);
  assert.notEqual(encounter('11').fleeSection, encounter('75').fleeSection);
  assert.equal(encounter('75').minimumHpToFight, 20); assert.equal(encounter('75').forcedSurrenderBelowHp, 20);
  const dogs = startQuestFight(hero, encounter('31'));
  assert.equal(questRoll(dogs, {expectedEvent:0, dice:[6,6]}).status, 'win');
  assert.ok(!ENCOUNTERS.some(entry => ['132','174','184','196'].includes(entry.section)));
});

test('Ember save and printed surrender restrictions survive catalog loading', () => {
  const dragon = startQuestFight(hero, encounter('163'));
  const lost = questRoll(dragon, {expectedEvent:0, dice:[3,4]});
  assert.equal(lost.status, 'loss'); assert.equal(lost.player.hp, 30); assert.equal(lost.destination, '190');
  for (const section of ['28','31','52']) {
    assert.throws(() => exitQuestFight(startQuestFight(hero, encounter(section)), 'surrendered', 0));
  }
  assert.throws(() => exitQuestFight(startQuestFight(hero, encounter('177')), 'fled', 0));
});

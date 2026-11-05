import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1592/definition.js';
import {normalizeProcedure, startProcedure, procedureAction}
  from '../../../public/js/battlesim/engines/procedural-quest/core.js';
import {compileCustomProcedure} from '../../../public/js/battlesim/engines/procedural-quest/custom.js';

const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const character = {maxHp:80, hp:80, experience:0, fighting:12, dexterity:10, wisdom:10, level:15, strahdHp:60};
const preset = key => ENCOUNTERS.find(entry => entry.key === key);
const act = (fight, action) => procedureAction(fight, {expectedEvent:fight.events.length, ...action});
const ready = fight => fight.phase === 'continue'
  ? act(fight, {kind:'continue', destination:fight.pending}) : fight;
const roll = (fight, ...dice) => act(ready(fight), {kind:'roll', dice});
const apply = fight => act(ready(fight), {kind:'effect'});
const choose = (fight, choice) => act(ready(fight), {kind:'choice', choice});

test('the installed catalog supplies all Ravenloft combat procedures through one request', async () => {
  let requests = 0;
  const rows = getRosterRows(1592);
  await Promise.all([loadRoster(async url => {
    requests++; assert.equal(url, '/api/books/1592/enemies');
    return {ok:true, json:async () => rows};
  }), loadRoster(() => { throw Error('Concurrent request was not shared'); })]);
  assert.equal(requests, 1); assert.equal(rows.length, 301); assert.equal(ENCOUNTERS.length, 20);
  assert.equal(RULES.currentStatsOnly, true); assert.equal(RULES.storyProgressionAutomatic, false);
  const allSteps = new Set();
  for (const entry of ENCOUNTERS) {
    normalizeProcedure(entry);
    assert.equal(startProcedure(character, entry).status, 'fighting');
    for (const step of entry.steps) {
      allSteps.add(step.id);
      assert.ok(step.sourcePdfPages.every(page => Number.isInteger(page) && page >= 1 && page <= 195));
    }
  }
  assert.equal(allSteps.size, 280);
  await loadRoster(() => { throw Error('Loaded catalog was fetched again'); });
});

test('installed undead-turning checks retain their level-drain penalty', () => {
  let fight = startProcedure({...character, level:13}, preset('spectre'));
  fight = choose(fight, 'turn'); fight = roll(fight, 3, 3);
  assert.equal(fight.pending, 'spectre-216-water');
  fight = startProcedure(character, preset('spectre'));
  fight = choose(fight, 'turn'); fight = roll(fight, 3, 3);
  assert.equal(fight.pending, 'spectre-105-win');
  const gargoyles = preset('gargoyles');
  for (const section of [120,135]) {
    const checks = gargoyles.steps.filter(step => step.id.startsWith(`gargoyles-${section}-check`));
    assert.equal(checks.length, 3); assert.ok(checks.every(step => step.dice === 2));
  }
});

test('installed final-duel setup, Restoration and explicit fatal passages remain distinct', () => {
  let fight = startProcedure({...character, charges:1, restoration:1, skillModifier:-1, damageModifier:1}, preset('strahd-final'));
  fight = apply(fight); assert.equal(fight.player.skillModifier, 0); assert.equal(fight.player.damageModifier, 0);
  fight = choose(fight, 'entered'); fight = choose(fight, 'paralyze'); fight = apply(fight);
  fight = roll(fight, 4, 4); fight = roll(fight, 1); fight = apply(fight);
  assert.equal(fight.player.level, 13); assert.equal(fight.player.hp, 77);
  fight = choose(fight, 'restore'); fight = apply(fight);
  assert.equal(fight.player.level, 14); assert.equal(fight.player.hp, 77);
  assert.equal(fight.player.fighting, 10); assert.equal(fight.player.restoration, 0);
  const final = preset('strahd-final');
  assert.equal(final.steps.find(step => step.id === 'final-97-loss').zeroHp, true);
  assert.equal(final.defeatSection, '338');
  assert.deepEqual(final.terminalRules.map(rule => rule.destination), ['85','344','311','247']);
});

test('installed custom templates permit editable mixed groups without selecting a preset', () => {
  const opponents = [{displayName:'Custom first', target:20, damageDice:'0', damageBonus:2},
    {displayName:'Custom second', target:20, damageDice:'1', damageBonus:0}];
  let fight = startProcedure(character, compileCustomProcedure(opponents, RULES));
  assert.equal(fight.opponent.custom, true); assert.equal(fight.opponent.steps.length, 6);
  fight = roll(fight, 6, 6); fight = apply(fight);
  assert.equal(fight.status, 'fighting');
  fight = roll(fight, 6, 6); fight = act(ready(fight), {kind:'finish'});
  assert.equal(fight.status, 'win'); assert.equal(fight.player.hp, 80);
  assert.equal(compileCustomProcedure(Array.from({length:100}, (_, i) => ({...opponents[0], displayName:'Custom '+i})), RULES).steps.length, 300);
  assert.throws(() => compileCustomProcedure([{...opponents[0], damageDice:''}], RULES), RangeError);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1596/definition.js';
import {normalizeProcedure, startProcedure, procedureAction}
  from '../../../public/js/battlesim/engines/procedural-quest/core.js';
import {compileCustomProcedure} from '../../../public/js/battlesim/engines/procedural-quest/custom.js';

const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const character = {hp:100, maxHp:100, fighting:20, experience:9, spells:2};
const start = (key, stats = {}) => startProcedure({...character, ...stats}, ENCOUNTERS.find(e => e.key === key));
const act = (f, action) => procedureAction(f, {expectedEvent:f.events.length, ...action});
const ready = f => f.phase === 'continue' ? act(f, {kind:'continue', destination:f.pending}) : f;
const roll = (f, die, spent = 0) => act(ready(f), {kind:'roll', dice:[die], spent});
const wound = f => act(ready(f), {kind:'effect'});
const choose = (f, choice) => act(ready(f), {kind:'choice', choice});
const finish = f => act(ready(f), {kind:'finish'});

test('all 15 installed encounters load once, retain source references and normalize', async () => {
  let requests = 0;
  await Promise.all([loadRoster(async url => {
    requests++; assert.equal(url, '/api/books/1596/enemies');
    return {ok:true, json:async () => getRosterRows(1596)};
  }), loadRoster(() => { throw Error('Duplicate fetch'); })]);
  assert.equal(requests, 1); assert.equal(ENCOUNTERS.length, 15);
  assert.equal(RULES.storyProgressionAutomatic, false);
  const ids = new Set();
  for (const e of ENCOUNTERS) {
    normalizeProcedure(e); startProcedure(character, e);
    for (const s of e.steps) {
      ids.add(s.id);
      assert.ok(s.sourcePdfPages.every(p => p >= 1 && p <= 198));
      if (s.kind === 'roll') assert.equal(s.dice, 1);
    }
  }
  assert.equal(ids.size, 124);
});

test('all ordinary victories resolve independently without story progression', () => {
  const paths = {
    giant:[['choose','ready'],['choose','sword'],['roll',6]],
    hobgoblins:[['roll',6],['wound'],['roll',6],['wound'],['roll',6],['choose','spell']],
    shapechanger:[['roll',6],['roll',6],['wound']],
    outpost:[['roll',6]], pass:[['roll',6],['wound']],
    minotaurs:[['choose','spell'],['roll',6]],
    flying:[['choose','spell'],['wound'],['roll',6]],
    patrol:[['roll',6]], guardroom:[['choose','sword'],['roll',6],['roll',6]],
    dragon:[['roll',6]], rescue:[['choose','spell'],['roll',6]],
    underground:[['choose','spell'],['choose','sleep'],['roll',6],['roll',6]],
    ritual:[['roll',6]], teleport:[['choose','spell']]
  };
  for (const [key, path] of Object.entries(paths)) {
    let f = start(key);
    for (const [kind, value] of path) f = kind === 'choose' ? choose(f, value) : kind === 'roll' ? roll(f, value) : wound(f);
    assert.equal(finish(f).status, 'win', key);
  }
  let f = roll(roll(start('chained'), 6), 6);
  assert.equal(ready(f).destination, '165');
  assert.equal(finish(f).status, 'ended');
});

test('printed section140 success still takes the additional section51 wound', () => {
  let f = roll(start('hobgoblins'), 6);
  f = wound(f); assert.equal(f.player.hp, 98);
  f = roll(f, 6); assert.equal(f.pending, 'hobgoblins-51-wound');
  f = wound(f); assert.equal(f.player.hp, 92);
  f = roll(f, 6); assert.equal(f.pending, 'hobgoblins-128');
});

test('wounds are acknowledged before rolling and lethal wounds stop immediately', () => {
  let f = choose(start('flying', {hp:8}), 'sword');
  assert.equal(ready(f).phase, 'effect');
  assert.throws(() => roll(f, 6), RangeError);
  f = wound(f); assert.equal(f.player.hp, 0); assert.equal(f.status, 'loss');
  f = choose(start('giant'), 'ambushed');
  f = wound(f); assert.equal(f.player.hp, 93); assert.equal(ready(f).phase, 'roll');
});

test('experience is spent before the Fighting check; spells cost one and can be purchased for three', () => {
  let f = roll(start('ritual', {fighting:16}), 5, 1);
  assert.equal(f.player.experience, 8); assert.equal(f.pending, 'ritual-218');
  f = roll(start('ritual', {fighting:16}), 5);
  assert.equal(f.pending, 'ritual-40-wound');
  f = start('teleport', {spells:0, experience:3});
  assert.throws(() => choose(f, 'spell'), RangeError);
  f = choose(f, 'buy-spell');
  assert.equal(f.player.spells, 1); assert.equal(f.player.experience, 0);
  f = choose(f, 'spell'); assert.equal(f.player.spells, 0);
  assert.equal(finish(f).status, 'win');
});

test('capture preserves surviving HP; explicit resistance death zeros HP', () => {
  let f = roll(start('shapechanger', {fighting:0}), 1);
  f = wound(f); f = roll(f, 1); f = wound(f); f = finish(f);
  assert.equal(f.status, 'loss'); assert.equal(f.player.hp, 93);
  f = choose(start('minotaurs'), 'sword'); f = wound(f); f = choose(f, 'surrender');
  assert.equal(finish(f).player.hp, 96);
  f = choose(start('minotaurs'), 'sword'); f = wound(f); f = choose(f, 'resist');
  assert.equal(finish(f).player.hp, 0);
});

test('custom opponents work without a preset and group wins are awarded once', () => {
  const rows = ['First', 'Second'].map(displayName => ({displayName, target:20, damageDice:'1', damageBonus:4}));
  let f = startProcedure({...character, fighting:16}, compileCustomProcedure(rows, RULES));
  f = roll(f, 1); f = wound(f); assert.equal(f.player.hp, 96);
  f = roll(f, 6); f = wound(f); assert.equal(f.status, 'fighting');
  f = roll(f, 6); f = finish(f); assert.equal(f.status, 'win');
});

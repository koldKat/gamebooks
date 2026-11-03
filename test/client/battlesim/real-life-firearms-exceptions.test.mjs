import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startFirearmFight, firearmTurn, resolveFirearmTurn, validateFirearmFight}
  from '../../../public/js/battlesim/engines/real-life-firearms/core.js';
import {validateFirearmCatalog} from '../../../public/js/battlesim/engines/real-life-firearms/catalog.js';
import {emptyFirearmState, rememberFirearmFight} from '../../../public/js/battlesim/engines/real-life-firearms/state.js';

const foe = (name, skill = 7, extra = {}) => ({name, skill, ...extra});
const start = (spec, options = {}, skill = 7) => startFirearmFight(skill,
  {name: 'Synthetic encounter', section: '1', opponents: [foe('Opponent')], ...spec}, options);
const step = (fight, dice = [1, 1], target) => resolveFirearmTurn(JSON.parse(JSON.stringify(fight)), dice, {target});

test('squads fire in companion order with the hero last and survive losing all companions', () => {
  let f = start({mode: 'team', enemyTargetOrder: 'allies-first',
    allies: [foe('First', 0), foe('Second', 0)]});
  assert.equal(firearmTurn(f).attackerId, 'ally0');
  for (let n = 0; n < 2; n++) {
    while (f.phase === 'resistance') f = step(f, [6, 6]);
    assert.equal(firearmTurn(f).targetId, 'ally' + n);
    f = step(f);
  }
  assert.equal(f.status, 'fighting'); assert.equal(f.hero.alive, true);
  assert.equal(firearmTurn(f).attackerId, 'hero');
  assert.equal(step(f).status, 'win');
});

test('squad enemies with unspecified targets require explicit adjudication on every shot', () => {
  let f = start({mode: 'team', opponentFirst: true, allies: [foe('Companion')]});
  assert.equal(firearmTurn(f).requiresTarget, true);
  assert.throws(() => step(f));
  f = step(f, [6, 6], 'ally0'); assert.equal(f.hero.alive, true);
  assert.equal(firearmTurn(f).attackerId, 'ally0');
});

test('allies-first casualty order depends on successful hits, including across enemy volleys', () => {
  let f = start({mode: 'team', opponentFirst: true, enemyTargetOrder: 'allies-first',
    opponents: [foe('First'), foe('Second'), foe('Third')], allies: [foe('A'), foe('B')]});
  f = step(f, [6, 6]); assert.equal(firearmTurn(f).targetId, 'ally0');
  f = step(f); assert.equal(firearmTurn(f).targetId, 'ally1');
  f = step(f); assert.equal(f.hero.alive, true); assert.equal(f.status, 'fighting');
  assert.equal(firearmTurn(f).attackerId, 'hero');
});

test('two opening shots precede retaliation once, with printed target order enforced', () => {
  let f = start({heroOpeningShots: 2, targetOrder: 'printed', opponents: [foe('A'), foe('B')]});
  assert.throws(() => step(f, [1, 1], 'enemy1'));
  f = step(f, [6, 6]); assert.equal(firearmTurn(f).attackerId, 'hero');
  f = step(f); assert.equal(firearmTurn(f).attackerId, 'enemy1');
  f = step(f, [6, 6]); assert.equal(firearmTurn(f).attackerId, 'hero');
  f = step(f, [6, 6]); assert.equal(firearmTurn(f).attackerId, 'enemy1');
  assert.throws(() => start({heroOpeningShots: 2, opponentFirst: true}));
});

test('an opponent can require two hits without a critical double-one shortcut', () => {
  let f = start({opponents: [foe('Two-hit opponent', 0, {hitsToKill: 2})]});
  f = step(f); assert.equal(f.opponents[0].alive, true); assert.equal(f.opponents[0].hits, 1);
  f = step(f, [6, 6]); f = step(f);
  assert.equal(f.status, 'win'); assert.equal(f.opponents[0].hits, 2);
});

test('one survivable hit selects wounded victory while lethal weapons still kill outright', () => {
  let f = start({opponentFirst: true, heroHitsToDeath: 2, winTarget: '2', woundedWinTarget: '3'});
  f = step(f); assert.equal(f.hero.alive, true); assert.equal(f.hero.hits, 1);
  f = step(f); assert.equal(f.status, 'win'); assert.equal(f.destination, '3');
  f = start({opponentFirst: true, heroHitsToDeath: 2, opponents: [foe('Rifle', 7, {hitDamage: 'lethal'})]});
  assert.equal(step(f).status, 'loss');
});

test('the first nonfatal wound immediately reduces only the current combat skill', () => {
  let f = start({opponentFirst: true, heroHitsToDeath: 2, firstWoundSkillPenalty: 2}, {}, 7);
  f = step(f); assert.equal(f.hero.skill, 5);
  f = step(f, [3, 3]); assert.equal(f.log.at(-1).hit, false);
  f = step(f, [6, 6]); assert.equal(f.hero.skill, 5);
  const original = JSON.stringify(f); validateFirearmFight(f); assert.equal(JSON.stringify(f), original);
});

test('spray rolls cannot aim beforehand and a hit requires post-roll allocation without another roll', () => {
  const original = start({heroTargeting: 'spray', opponents: [foe('A'), foe('B', 0, {hitsToKill: 2})]});
  assert.deepEqual(firearmTurn(original).targets, []);
  let f = step(original); assert.equal(f.pendingSpray, true);
  assert.equal(firearmTurn(f).kind, 'sprayHit'); assert.equal(f.log.length, 1);
  assert.throws(() => step(f, null));
  f = step(f, null, 'enemy1'); assert.equal(f.opponents[1].hits, 1);
  assert.equal(f.log.length, 1); assert.equal(f.hero.shots, 1);
  assert.equal(firearmTurn(f).attackerId, 'enemy0');
  assert.equal(original.opponents[1].hits, 0);
  assert.equal(original.log.length, 0);
});

test('spray misses advance directly and pending allocation cannot turn into reward history', () => {
  let f = start({heroTargeting: 'spray'});
  assert.equal(firearmTurn(step(f, [6, 6])).attackerId, 'enemy0');
  f = step(f); const state = emptyFirearmState(); state.fight = f;
  rememberFirearmFight(state, 10); assert.equal(state.history.length, 0);
  state.fight = step(f, null, 'enemy0'); rememberFirearmFight(state, 11);
  assert.equal(state.history.length, 1);
});

test('the player can enter the printed opening wound without an automated Luck test', () => {
  const f = start({heroHitsToDeath: 2, winTarget: '2', woundedWinTarget: '3'}, {initialHeroHits: 1});
  assert.equal(f.hero.hits, 1); assert.equal(f.log.length, 0);
  assert.equal(step(f).destination, '3');
  assert.throws(() => start({heroHitsToDeath: 2}, {initialHeroHits: 2}));
});

test('incomplete printed Wounds encounters retain catalog data but cannot invent a combat rule', () => {
  const entry = {section: '1', name: 'Manual encounter', mode: 'manual', manualReason: 'Missing printed rules',
    note: 'Resolve with the book', opponents: [foe('Foe', 5, {wounds: 4})]};
  assert.equal(validateFirearmCatalog([entry])[0].opponents[0].wounds, 4);
  assert.throws(() => start(entry));
  assert.throws(() => validateFirearmCatalog([{...entry, mode: 'alternating'}]));
});

test('legacy fight snapshots still resolve and Combat setup does not overwrite Firearm', () => {
  let f = start({});
  for (const a of [f.hero, ...f.opponents]) for (const key of ['hits', 'hitsToKill', 'hitDamage']) delete a[key];
  assert.equal(step(f).status, 'win');
  const state = emptyFirearmState(); state.setup.firearm = 9;
  state.fight = step(start({heroSkill: 'Combat'}, {}, 6)); rememberFirearmFight(state, 10);
  assert.equal(state.setup.firearm, 9); assert.equal(state.setup.combat, 6);
});

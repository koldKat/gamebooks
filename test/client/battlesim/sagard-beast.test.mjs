import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardBeast, validateSagardBeastFight, sagardBeastTurn, resolveSagardBeast,
  cancelSagardBeast} from '../../../public/js/battlesim/engines/sagard/beast.js';

const rules = {maxHeroHp: 20, maxShield: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, level) =>
  [level, [0, 1, 2, level + 1]]))};
const start = (hero = {}, monsterHp = 20, crew = 3) => startSagardBeast({level: 3, hp: 20, ...hero},
  {name: 'Synthetic swallowing monster', opponents: [{name: 'Synthetic monster', hp: monsterHp}],
    winTarget: 'won', lossTarget: 'lost', beast: {crew, swallowFaces: [4], swallowConfirmFaces: [4],
      swallowedDamage: 8, crewChart: [0, 1, 1, 2], crewCasualties: [0, 0, 1, 3]}}, rules);
const step = (fight, die) => resolveSagardBeast(JSON.parse(JSON.stringify(fight)), die);

test('swallowing requires two successful rolls and damage persists on later rounds without another check', () => {
  let fight = start();
  assert.equal(step(fight, 3).phase, 'heroAttack');
  const threat = step(fight, 4); assert.equal(threat.phase, 'swallowConfirm');
  assert.equal(step(threat, 3).swallowed, false);
  fight = step(threat, 4); assert.equal(fight.swallowed, true); assert.equal(fight.hero.hp, 12);
  fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.crewRemaining, 0); assert.equal(fight.phase, 'digestion');
  fight = step(fight); assert.equal(fight.hero.hp, 4); assert.equal(fight.phase, 'heroAttack');
  fight = step(fight, 1); fight = step(fight); assert.equal(fight.status, 'loss');
  assert.equal(fight.destination, 'lost'); validateSagardBeastFight(JSON.parse(JSON.stringify(fight)));
});

test('crew casualties precede attacks and only survivors act once each', () => {
  let fight = step(start(), 1); fight = step(fight, 3);
  assert.equal(fight.monster.hp, 18); assert.equal(fight.phase, 'crewCasualties');
  fight = step(fight, 3); assert.equal(fight.crewRemaining, 2);
  fight = step(fight, 4); assert.equal(fight.monster.hp, 16); assert.equal(fight.phase, 'crewAttack');
  fight = step(fight, 4); assert.equal(fight.monster.hp, 14); assert.equal(fight.phase, 'swallow');
  assert.equal(fight.round, 2);
});

test('the hero can win before crew casualties and a crew hit can end the encounter immediately', () => {
  let fight = step(start({}, 1), 1); fight = step(fight, 2);
  assert.equal(fight.status, 'win'); assert.equal(fight.crewRemaining, 3); assert.equal(fight.destination, 'won');
  fight = step(start({}, 2), 1); fight = step(fight, 1); fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.status, 'win'); validateSagardBeastFight(JSON.parse(JSON.stringify(fight)));
  assert.throws(() => step(fight, 1));
});

test('the last crew casualty leaves the hero fighting and damage never creates negative counts', () => {
  let fight = step(start({}, 20, 1), 1); fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.crewRemaining, 0); assert.equal(fight.status, 'fighting');
  assert.equal(fight.phase, 'swallow'); assert.equal(fight.round, 2);
});

test('manually held protection is depleted and weapon face overrides also apply inside the monster', () => {
  let fight = step(step(start({shield: 10, damageReduction: 2, damageBonus: 2, damageOverrides: {4: 0}}), 4), 4);
  assert.equal(fight.hero.hp, 20); assert.equal(fight.hero.shield, 4);
  fight = step(fight, 4); assert.equal(fight.monster.hp, 20);
  fight = step(fight, 4); fight = step(fight);
  assert.equal(fight.hero.hp, 18); assert.equal(fight.hero.shield, 0);
});

test('invalid input and cancellation preserve the original battle, with no invented monster level or chart', () => {
  const fight = start(); assert.throws(() => step(fight, 0)); assert.throws(() => step(fight, null));
  assert.equal(cancelSagardBeast(fight).status, 'cancelled'); assert.equal(fight.status, 'fighting');
  assert.equal(fight.log.length, 0); assert.equal(fight.monster.level, undefined); assert.equal(fight.monster.chart, undefined);
  const invalid = structuredClone(fight); invalid.crewRemaining = -1;
  assert.throws(() => validateSagardBeastFight(invalid)); assert.equal(sagardBeastTurn(fight).requiresDie, true);
});

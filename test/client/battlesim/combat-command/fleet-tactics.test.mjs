import test from 'node:test';
import assert from 'node:assert/strict';
import { startFleetTactics, planFleetAttack, canLaunchFleetSpecial }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-tactics.js';

const units = (bc = 2, dd = 3) => [
  { key: 'bc', name: 'Battlecruisers', type: 'battlecruiser', count: bc, ordnance: 4, hitsPerShip: 2 },
  { key: 'dd', name: 'Destroyers', type: 'destroyer', count: dd, ordnance: 2, hitsPerShip: 1 },
];
const setup = order => ({ firingOrder: order, playerCharts: { battlecruiser: 'B', destroyer: 'D' }, casualtyPolicy: 'active-wing' });
const special = eligibility => ({ volleys: 2, chart: 'A', maximumUses: 1, scope: 'whole-battle',
  requiresSurvivingDestroyers: true, eligibility });

test('wedge destroyers fire only the first round while casualties may be assigned to either wing', () => {
  const force = units(), config = { ...setup('destroyer-first-then-battlecruiser'), casualtyPolicy: 'choose-wing' };
  const first = planFleetAttack(force, config, startFleetTactics(force));
  assert.equal(first.wing, 'destroyer');
  assert.deepEqual(first.casualtyKeys, ['bc', 'dd']);
  const second = planFleetAttack(force, config, first.nextPhase);
  assert.equal(second.wing, 'battlecruiser');
  assert.equal(second.chart, 'B');
  assert.equal(planFleetAttack(units(0), config, second.nextPhase).wing, 'destroyer');
});

test('cone duration rolls occur only at wing boundaries and survive JSON reload', () => {
  const force = units(), config = setup('battlecruiser-first-d6-blocks');
  const initial = startFleetTactics(force);
  assert.throws(() => planFleetAttack(force, config, initial), /duration/);
  const one = planFleetAttack(force, config, initial, { blockRoll: 2 });
  assert.equal(one.wing, 'battlecruiser');
  assert.equal(initial.coneLeft, 0, 'preview does not mutate saved state');
  const two = planFleetAttack(force, config, JSON.parse(JSON.stringify(one.nextPhase)));
  assert.equal(two.wing, 'battlecruiser');
  const three = planFleetAttack(force, config, two.nextPhase, { blockRoll: 1 });
  assert.equal(three.wing, 'destroyer');
  assert.equal(planFleetAttack(units(0), config, three.nextPhase).wing, 'destroyer');
});

test('cylinder and dispersed begin with opposite wings and lose ships from the firing wing', () => {
  const force = units();
  for (const [order, firstWing] of [['battlecruiser-first-alternating', 'battlecruiser'], ['destroyer-first-alternating', 'destroyer']]) {
    const config = setup(order), first = planFleetAttack(force, config, startFleetTactics(force));
    assert.equal(first.wing, firstWing);
    assert.deepEqual(first.casualtyKeys, [firstWing === 'battlecruiser' ? 'bc' : 'dd']);
    assert.notEqual(planFleetAttack(force, config, first.nextPhase).wing, firstWing);
  }
});

test('a heavy screen protects destroyers until the battlecruisers are gone', () => {
  const config = setup('battlecruiser-until-eliminated'), force = units();
  const plan = planFleetAttack(force, config, startFleetTactics(force));
  assert.deepEqual(plan.casualtyKeys, ['bc']);
  assert.equal(planFleetAttack(units(0), config, plan.nextPhase).wing, 'destroyer');
});

test('destroyer-screen special is two volleys, is optional, and cannot reset between groups', () => {
  const config = { ...setup('destroyer-until-special-or-eliminated'), specialAttack: special('battlecruisers-not-yet-fired') };
  const force = units(), first = planFleetAttack(force, config, startFleetTactics(force));
  assert.equal(first.wing, 'destroyer');
  const attack = planFleetAttack(force, config, first.nextPhase, { special: true });
  assert.equal(attack.volleys, 2);
  assert.equal(attack.chart, 'A');
  assert.equal(attack.wing, 'battlecruiser');
  const newGroup = startFleetTactics(force, attack.nextPhase);
  assert.equal(canLaunchFleetSpecial(force, config, newGroup), false);
  assert.equal(planFleetAttack(force, config, newGroup).wing, 'battlecruiser');
  assert.equal(planFleetAttack(units(0), config, newGroup).wing, 'destroyer');
});

test('not-yet-fired and no-losses special conditions remain separate printed rules', () => {
  const force = units(), phase = startFleetTactics(force);
  const config = { ...setup('destroyer-until-special-or-eliminated'), specialAttack: special('battlecruisers-not-yet-fired') };
  assert.equal(canLaunchFleetSpecial(units(1), config, phase), true, 'lost ships are not the unfired condition');
  assert.equal(canLaunchFleetSpecial(force, config, { ...phase, battlecruiserFired: true }), false);
  config.specialAttack = special('no-battlecruisers-lost');
  assert.equal(canLaunchFleetSpecial(units(1), config, phase), false);
  assert.equal(canLaunchFleetSpecial(force, config, { ...phase, battlecruiserFired: true }), true);
  assert.equal(canLaunchFleetSpecial(units(2, 0), config, phase), false);
});

test('dispersed sectors require an explicit firing wing and restrict losses to it', () => {
  const force = units(), config = setup('each-sector-in-order'), phase = startFleetTactics(force);
  assert.throws(() => planFleetAttack(force, config, phase), /Choose the firing wing/);
  const plan = planFleetAttack(force, config, phase, { wing: 'destroyer' });
  assert.deepEqual(plan.keys, ['dd']);
  assert.deepEqual(plan.casualtyKeys, ['dd']);
  assert.throws(() => planFleetAttack(units(2, 0), config, phase, { wing: 'destroyer' }), /Choose/);
});

test('plain custom fights work with an explicit chart without a formation preset', () => {
  const force = units(), phase = startFleetTactics(force);
  const plan = planFleetAttack(force, { playerChart: 'C' }, phase);
  assert.equal(plan.chart, 'C');
  assert.deepEqual(plan.keys, ['bc', 'dd']);
  assert.throws(() => planFleetAttack(force, { playerChart: 'Z' }, phase), /chart/);
});

test('a source-authorized casualty fallback is explicit and never extends to alternating formations', () => {
  const force = units(), phase = startFleetTactics(force);
  const config = { ...setup('battlecruiser-until-eliminated'), casualtyFallbackWhenPrimaryEliminated: true };
  const plan = planFleetAttack(force, config, phase);
  assert.deepEqual(plan.casualtyKeys, ['bc']);
  assert.deepEqual(plan.fallbackCasualtyKeys, ['dd']);
  assert.deepEqual(planFleetAttack(force, setup('battlecruiser-until-eliminated'), phase).fallbackCasualtyKeys, []);
  assert.throws(() => planFleetAttack(force, { ...setup('battlecruiser-first-alternating'),
    casualtyFallbackWhenPrimaryEliminated: true }, phase), /fallback rule/);
});

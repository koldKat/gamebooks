import test from 'node:test';
import assert from 'node:assert/strict';
import {firingCrew, targetingBonus, assignWeapons, installRobotGunner, replaceCrewDriver,
  personalWeaponDamage} from '../../../public/js/battlesim/engines/car-wars/crew.js';

const vehicle = () => ({hp: 50, driverHp: 3, driverArmour: 6, gunnery: 2,
  gunnerSeat: true, gunnerHp: 3, gunnerArmour: 3, gunnerGunnery: 3,
  powerPlant: {boxes: 10}, gadgets: [
    {computerFor: 'driver', bonus: 2, boxes: 1}, {computerFor: 'gunner', bonus: 1, boxes: 1}],
  weapons: [{boxes: 3, direction: 'front', linkedGroup: 'front'},
    {boxes: 3, direction: 'front', linkedGroup: 'front'}, {boxes: 2, direction: 'turret'}]});

test('separate crew computers never stack across seats and destroyed computers stop contributing', () => {
  const unit = vehicle();
  assert.equal(targetingBonus(unit, 'driver'), 2);
  assert.equal(targetingBonus(unit, 'gunner'), 1);
  unit.gadgets[0].boxes = 0;
  assert.equal(targetingBonus(unit, 'driver'), 0);
  assert.equal(targetingBonus(unit, 'gunner'), 1);
});

test('linked guns share an action, but receive separate attack records and two systems need two crew', () => {
  const unit = vehicle();
  const assignments = assignWeapons(unit, [0, 1, 2], 1, {targets: [1, 2]});
  assert.deepEqual(assignments, [
    {seat: 'driver', weapons: [0, 1], target: 1, gunnery: 2, computerBonus: 2},
    {seat: 'gunner', weapons: [2], target: 2, gunnery: 3, computerBonus: 1}]);
  unit.gunnerHp = 1;
  assert.throws(() => assignWeapons(unit, [0, 2], 1), /per available crew/);
  assert.throws(() => assignWeapons(unit, [0, 0], 1), /only once/);
  assert.throws(() => assignWeapons(unit, [0], 1, {facing: ['rear']}), /cannot face/);
});

test('crew hits suppress only the injured shooter and control recovery suppresses both', () => {
  const unit = vehicle(); unit.skipFire = 1;
  assert.deepEqual(firingCrew(unit, 1), ['gunner']);
  assert.equal(assignWeapons(unit, [2], 1)[0].gunnery, 3);
  unit.gunnerSkipFire = 1;
  assert.deepEqual(firingCrew(unit, 1), []);
  unit.skipFire = unit.gunnerSkipFire = 0; unit.skipTurn = 1;
  assert.deepEqual(firingCrew(unit, 1), []);
});

test('damaged robot shoots for eight turns and remains active at one HP, destroyed at zero', () => {
  const initial = vehicle(), unit = installRobotGunner(initial, {hp: 2, combatBonus: -2, activeTurns: 8});
  assert.equal(initial.gunnerGunnery, 3, 'input remains unchanged');
  assert.equal(assignWeapons(unit, [0, 2], 8)[1].gunnery, -2);
  assert.equal(assignWeapons(unit, [0, 2], 8)[1].computerBonus, 0);
  assert.equal(assignWeapons(unit, [0, 2], 8)[1].fixedCombatBonus, -2,
    'printed total Combat Bonus replaces weapon and computer accuracy');
  assert.deepEqual(firingCrew(unit, 9), ['driver']);
  unit.gunnerHp = 1;
  assert.deepEqual(firingCrew(unit, 1), ['driver', 'gunner']);
  unit.gunnerHp = 0;
  assert.deepEqual(firingCrew(unit, 1), ['driver']);
  assert.throws(() => replaceCrewDriver(unit, 3), /No human/);
});

test('only a robot with the printed same-target restriction is prevented from splitting targets', () => {
  const unit = installRobotGunner(vehicle(), {hp: 2, combatBonus: -2, sameTargetAsDriver: true});
  assert.throws(() => assignWeapons(unit, [0, 2], 1, {targets: [0, 1]}), /driver’s target/);
  assert.doesNotThrow(() => assignWeapons(unit, [0, 2], 1, {targets: [1, 1]}));
  unit.robotGunner.sameTargetAsDriver = false;
  assert.doesNotThrow(() => assignWeapons(unit, [0, 2], 1, {targets: [0, 1]}));
});

test('replacement drivers require their actual Driving and retain their own wounds and Gunnery', () => {
  const unit = vehicle(); unit.driverHp = 1; unit.gunnerHp = 2; unit.gunnerArmour = 1;
  assert.throws(() => replaceCrewDriver(unit), /replacement driver’s Driving/);
  const replaced = replaceCrewDriver(unit, 4);
  assert.equal(replaced.driverHp, 2); assert.equal(replaced.driverArmour, 1);
  assert.equal(replaced.driving, 4); assert.equal(replaced.gunnery, 3);
  assert.equal(replaced.gunnerHp, 0); assert.equal(unit.gunnerHp, 2);
});

test('printed fist damage includes zero-damage hits and six-then-six knockout', () => {
  const weapon = {damageByDie: [0, 0, 0, 1, 1, 2], knockoutOnDamageSixFollowup: [6]};
  assert.equal(personalWeaponDamage(weapon, () => 2).damage, 0);
  assert.equal(personalWeaponDamage(weapon, () => 5).damage, 1);
  assert.deepEqual(personalWeaponDamage(weapon, () => 6), {damage: 2, knockout: true, dice: [6, 6]});
});

test('blackjack knockout range differs from the tire iron and the derringer has its own damage table', () => {
  const result = weapon => { const rolls = [6, 5]; return personalWeaponDamage(weapon, () => rolls.shift()); };
  assert.equal(result({damageByDie: [1, 1, 1, 2, 2, 2], knockoutOnDamageSixFollowup: [5, 6]}).knockout, true);
  assert.equal(result({damageByDie: [1, 1, 1, 1, 2, 2], knockoutOnDamageSixFollowup: [6]}).knockout, false);
  assert.equal(personalWeaponDamage({damageByDie: [1, 1, 1, 1, 2, 2]}, () => 4).damage, 1);
  assert.equal(personalWeaponDamage({damageByDie: [1, 1, 1, 1, 2, 2]}, () => 5).damage, 2);
  assert.throws(() => personalWeaponDamage({damageDice: 1}, () => 7), /Invalid die/);
});

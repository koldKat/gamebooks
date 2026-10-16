import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../public/js/battlesim/engines/space-assassin/core.js';

const player = changes => ({ ...core.newCharacter(() => 1), ...changes });
const sequence = (...values) => () => {
  assert.ok(values.length, 'Unexpected additional die roll');
  return values.shift();
};

test('printed initial rolls, capped pills, Luck cost and immutable inputs', () => {
  assert.deepEqual(core.newCharacter(() => 1), { skill: 7, stamina: 14, luck: 7, armour: 7,
    skillInitial: 7, staminaInitial: 14, luckInitial: 7, armourInitial: 7, pills: 4, grenades: 0 });
  const original = player({ stamina: 12 }), snapshot = structuredClone(original);
  assert.equal(core.takePill(original).stamina, 14);
  assert.equal(core.takePill(original).pills, 3);
  assert.deepEqual(original, snapshot);
  assert.equal(core.startFight(original, [{ skill: 5, stamina: 5 }]).player.stamina, 12,
    'Starting another fight must not refill current STAMINA');
  assert.throws(() => core.takePill(player({ stamina: 0 })));
  const luck = core.testLuck(player(), sequence(3, 4));
  assert.equal(luck.lucky, true); assert.equal(luck.player.luck, 6);
  assert.throws(() => core.dice(1, () => 0));
  assert.throws(() => core.dice(1, () => 7));
});

test('armour tests pre-hit value, loses one even on a block, and never goes negative', () => {
  const blocked = core.armourHit(player(), 6, sequence(3, 4));
  assert.equal(blocked.blocked, true); assert.equal(blocked.player.armour, 6);
  assert.equal(blocked.player.stamina, 14);
  const hit = core.armourHit(player({ armour: 0 }), 6, sequence(1, 1));
  assert.equal(hit.player.armour, 0); assert.equal(hit.player.stamina, 8);
  const suit = core.armourHit(player({ armour: 14 }), 6, sequence(6, 6));
  assert.equal(suit.blocked, true); assert.equal(suit.player.armour, 13);
  assert.equal(suit.player.armourInitial, 7, 'A replacement suit does not rewrite the initial roll');
});

test('gunfire equality misses and all surviving opponents return fire', () => {
  const original = core.startFight(player({ armour: 0 }), [{ skill: 12, stamina: 4 }, { skill: 12, stamina: 4 }], { mode: 'gunfire' });
  const snapshot = structuredClone(original);
  const result = core.round(original, sequence(3, 4, 1, 1, 2, 1, 1, 1, 1, 3, 1, 1));
  assert.equal(result.enemies[0].stamina, 4, 'Equality with SKILL is a miss');
  assert.equal(result.player.stamina, 9, 'Both enemy blasters hit');
  assert.equal(result.events.filter(event => event.actor === 'enemy').length, 2);
  assert.deepEqual(original, snapshot);
});

test('killed target does not shoot, but its surviving ally does', () => {
  const fight = core.startFight(player({ armour: 0 }), [{ skill: 12, stamina: 1 }, { skill: 12, stamina: 4 }], { mode: 'gunfire', weapon: 'lash' });
  const result = core.round(fight, sequence(1, 1, 1, 1, 3, 1, 1));
  assert.equal(result.enemies[0].stamina, 0); assert.equal(result.player.stamina, 11);
  assert.deepEqual(result.events.filter(event => event.actor === 'enemy').map(event => event.target), [1]);
  assert.equal(result.outcome, null);
});

test('melee ties are harmless and only the first living enemy fights', () => {
  const fight = core.startFight(player(), [{ skill: 7, stamina: 2 }, { skill: 7, stamina: 2 }]);
  const tied = core.round(fight, sequence(1, 1, 1, 1));
  assert.equal(tied.player.stamina, 14); assert.equal(tied.enemies[0].stamina, 2);
  const first = core.round(tied, sequence(6, 6, 1, 1));
  assert.equal(first.enemies[0].stamina, 0); assert.equal(first.enemies[1].stamina, 2);
  assert.equal(first.outcome, null);
  const won = core.round(first, sequence(6, 6, 1, 1));
  assert.equal(won.outcome, 'win'); assert.throws(() => core.round(won));
  assert.equal(fight.player.stamina, 14);
});

test('printed double-fire robot deals fixed damage and checks decreasing armour for each hit', () => {
  const fight = core.startFight(player({ armour: 3 }), [{ skill: 7, stamina: 6, shots: 2, damage: 2 }], { mode: 'gunfire' });
  const result = core.round(fight, sequence(3, 4, 1, 1, 1, 1, 1, 1, 1, 2));
  assert.equal(result.player.stamina, 12);
  assert.equal(result.player.armour, 1);
  assert.deepEqual(result.events.filter(event => event.actor === 'enemy').map(event => [event.armourBefore, event.blocked, event.damage]),
    [[3, true, 0], [2, false, 2]]);
  assert.throws(() => core.startFight(player(), [{ skill: 7, stamina: 6, shots: -1 }]));
});

test('grenades require printed permission, consume inventory and roll separately with guard cover', () => {
  const character = player({ grenades: 2 });
  const enemies = [{ skill: 6, stamina: 4 }, { skill: 6, stamina: 4 }];
  assert.throws(() => core.throwGrenade(core.startFight(character, enemies)));
  const original = core.startFight(character, enemies, { mode: 'gunfire', grenadeAllowed: true, grenadeCover: 1 });
  const result = core.throwGrenade(original, sequence(1, 6));
  assert.equal(result.player.grenades, 1);
  assert.deepEqual(result.enemies.map(enemy => enemy.stamina), [4, 0]);
  assert.deepEqual(result.events.map(event => event.damage), [0, 5]);
  assert.equal(result.player.stamina, 14, 'Grenade is a pre-combat action, not an extra enemy volley');
  assert.equal(original.player.grenades, 2);
  assert.throws(() => core.throwGrenade(result));
  assert.throws(() => core.throwGrenade(core.startFight(player(), enemies, { grenadeAllowed: true })));
  const begun = core.round(original, sequence(3, 4, 6, 6, 6, 6));
  assert.throws(() => core.throwGrenade(begun));
  const robots = core.startFight(player({ grenades: 3 }), [{ skill: 7, stamina: 20 }, { skill: 7, stamina: 20 }],
    { mode: 'gunfire', grenadeAllowed: true, grenadeLimit: 2 });
  const twice = core.throwGrenade(core.throwGrenade(robots, sequence(1, 2)), sequence(3, 4));
  assert.deepEqual(twice.enemies.map(enemy => enemy.stamina), [16, 14]);
  assert.equal(twice.player.grenades, 1); assert.equal(twice.grenadesUsed, 2);
  assert.throws(() => core.throwGrenade(twice), 'A third grenade is forbidden even with inventory remaining');
  const mutants = () => core.startFight(player({ grenades: 1 }), [{ skill: 8, stamina: 8 }, { skill: 8, stamina: 6 }],
    { grenadeAllowed: true, grenadeArmourOnEven: true });
  const near = core.throwGrenade(mutants(), sequence(2, 3, 4));
  const water = core.throwGrenade(mutants(), sequence(1, 3, 4));
  assert.deepEqual(near.enemies.map(enemy => enemy.stamina), [5, 2]);
  assert.deepEqual(water.enemies.map(enemy => enemy.stamina), [5, 2]);
  assert.equal(near.player.armour, 6); assert.equal(water.player.armour, 7);
  assert.equal(near.player.grenades, 0); assert.equal(water.player.grenades, 0);
});

test('surrender guards fire before the player, once or twice each according to the Luck test', () => {
  const enemies = [{ skill: 6, stamina: 4 }, { skill: 6, stamina: 4 }];
  const lucky = core.testLuck(player({ armour: 0 }), sequence(1, 1));
  const fight = core.startFight(lucky.player, enemies, { mode: 'gunfire', openingShots: lucky.lucky ? 1 : 2 });
  assert.equal(fight.player.luck, 6);
  assert.throws(() => core.round(fight));
  const opened = core.openingVolley(fight, sequence(1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
  assert.equal(opened.player.stamina, 12); assert.equal(opened.rounds, 0);
  assert.deepEqual(opened.enemies.map(enemy => enemy.stamina), [4, 4]);
  assert.equal(opened.openingPending, false); assert.throws(() => core.openingVolley(opened));
  const unlucky = core.testLuck(player(), sequence(6, 6));
  const twice = core.startFight(unlucky.player, enemies, { mode: 'gunfire', openingShots: unlucky.lucky ? 1 : 2 });
  assert.equal(core.openingVolley(twice, () => 6).events.length, 4);
  assert.equal(fight.openingPending, true, 'Resolving a volley must not mutate the saved input');
});

test('printed knowledge, choking, three-round limit and escape rules stay encounter-scoped', () => {
  const original = player();
  const globe = core.startFight(original, [{ skill: 9, stamina: 1 }], { mode: 'gunfire', initialArmourLoss: 1 });
  assert.equal(globe.player.armour, 6); assert.equal(globe.player.armourInitial, 7);
  assert.equal(original.armour, 7); assert.equal(globe.events[0].kind, 'openingArmourLoss');
  const shell = core.startFight(player(), [{ skill: 0, stamina: 8 }], { playerDamageBonus: 1 });
  const wounded = core.round(shell, () => 1);
  assert.equal(wounded.enemies[0].stamina, 5); assert.equal(wounded.player.skill, 7);
  const plants = core.startFight(player({ stamina: 1 }), [{ skill: 0, stamina: 1 }],
    { mode: 'gunfire', weapon: 'unarmed', roundDamage: 2 });
  assert.equal(core.round(plants, () => 1).outcome, 'loss', 'Choking still applies to the round and death outranks victory');
  const toroid = stamina => core.startFight(player(), [{ skill: 0, stamina }],
    { mode: 'gunfire', weapon: 'unarmed', roundLimit: 3, limitDestination: 384, limitFatal: true });
  const threeRounds = fight => core.round(core.round(core.round(fight, () => 1), () => 1), () => 1);
  const timed = threeRounds(toroid(12));
  assert.equal(timed.outcome, 'loss'); assert.equal(timed.destination, 384); assert.equal(timed.player.stamina, 0);
  assert.equal(threeRounds(toroid(3)).outcome, 'win', 'Killing on round three succeeds');
  const flee = stamina => core.startFight(player({ stamina }), [{ skill: 9, stamina: 10 }],
    { escapeCost: 2, escapeDestination: 139 });
  assert.equal(core.escapeFight(flee(3)).player.stamina, 1);
  assert.equal(core.escapeFight(flee(3)).destination, 139);
  assert.equal(core.escapeFight(flee(2)).outcome, 'loss');
  assert.throws(() => core.escapeFight(shell));
  assert.throws(() => core.startFight(player(), [{ skill: 5, stamina: 5 }], { roundLimit: 3 }));
  const plant = weapon => core.startFight(player(), [{ skill: 0, stamina: 6, shots: 0 }],
    { mode: 'gunfire', weapon, roundLimit: 3, limitFatal: true });
  const swallowed = threeRounds(plant('unarmed'));
  assert.equal(swallowed.outcome, 'loss'); assert.equal(swallowed.player.stamina, 0);
  assert.equal(swallowed.events.some(event => event.actor === 'enemy'), false);
  assert.equal(threeRounds(plant('lash')).outcome, 'win', 'Killing the plant on round three prevents swallowing');
  const defended = core.startFight(player(), [{ skill: 0, stamina: 6, damage: 0 }], { roundLimit: 3, limitFatal: true });
  assert.equal(core.round(defended, sequence(1, 1, 6, 6)).player.stamina, 14,
    'The plant cannot wound the player even when its defence roll wins');
});

test('random weapon table changes enemy SKILL and still armour-tests a disintegrator', () => {
  const weapons = [
    { name: 'whip', skill: 10, damage: 3 }, { name: 'machete', skill: 9, damage: 2 },
    { name: 'spear', skill: 7, damage: 1 }, { name: 'lash', skill: 8, damage: 2 },
    { name: 'blaster', skill: 6, weapon: 'blaster' }, { name: 'disintegrator', skill: 5, instant: true },
  ];
  const fight = armour => core.startFight(player({ armour }), [{ skill: 0, stamina: 12, damage: 2, weapons }], { mode: 'gunfire' });
  const blocked = core.round(fight(7), sequence(3, 4, 6, 1, 1, 1, 1));
  assert.equal(blocked.player.stamina, 14); assert.equal(blocked.player.armour, 6);
  assert.equal(blocked.events.at(-1).weapon, 'disintegrator');
  assert.equal(blocked.events.at(-1).skill, 5); assert.equal(blocked.events.at(-1).blocked, true);
  assert.equal(core.round(fight(0), sequence(3, 4, 6, 1, 1, 1, 1)).outcome, 'loss');
  assert.equal(core.round(fight(0), sequence(3, 4, 1, 1, 1, 1, 1)).player.stamina, 11);
  assert.equal(core.round(fight(0), sequence(3, 4, 5, 1, 1, 4, 1, 1)).player.stamina, 10);
  assert.throws(() => core.startFight(player(), [{ skill: 0, stamina: 12, weapons: weapons.slice(1) }]));
  const zark = armour => core.startFight(player({ armour }),
    [{ skill: 5, stamina: 7, weapon: 'disintegrator', instant: true }], { mode: 'gunfire' });
  assert.equal(core.round(zark(7), sequence(3, 4, 1, 1, 1, 1)).player.stamina, 14);
  assert.equal(core.round(zark(0), sequence(3, 4, 1, 1, 1, 1)).outcome, 'loss');
  assert.throws(() => core.startFight(player(), [{ skill: 5, stamina: 7, weapon: 'disintegrator' }]));
});

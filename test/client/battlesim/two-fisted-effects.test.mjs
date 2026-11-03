import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {configureTwoFistedLoadout, applyCombatItem, useCombatRecovery, useIyspEnergy} from '../../../public/js/battlesim/engines/two-fisted/effects.js';
import {groundPlayer, startGroundFight, prepareGroundRound, advanceGroundFight, groundMaximumSpend, leaveGroundFight} from '../../../public/js/battlesim/engines/two-fisted/ground.js';
import {spacePlayer, startSpaceFight, prepareSpaceRound, rollSpaceStations, advanceSpaceFight, leaveSpaceFight} from '../../../public/js/battlesim/engines/two-fisted/space.js';
import {rollFists} from '../../../public/js/battlesim/engines/two-fisted/dice.js';

const support = readRosterDocument(1527).enemies.find(row => row.stats.entry.support).stats.entry.support;
const inventory = Object.fromEntries(support.items.map(item => [item.id, 1]));
const player = (values = {}) => groundPlayer({inventory, ...values});
const enemy = (values = {}) => ({name: 'Opponent', expertise: 5, fists: 0, health: 5, ...values});
const crew = (values = {}) => ({combat: 6, weapons: 6, manoeuvre: 6, shields: 6, fists: 0, injuries: 0, ...values});
const fight = (p = player(), mode = 'ranged', opponents = [enemy()]) => startGroundFight(p, {mode, opponents});
const use = (f, id, options = {}, roll) => applyCombatItem(f, id, options, support, roll);
const recovery = (p, id, options = {}) => useCombatRecovery(p, id, options, support);
const round = (f, options = {}, roll = () => 1) => advanceGroundFight(prepareGroundRound(f, {spend: 1, target: 0, ...options}), roll);

test('weapon expertise changes legal ENERGY commitment, while the slugger deals two injuries', () => {
  const p = configureTwoFistedLoadout(player(), {hero: {melee: 'pipe-wrench', ranged: 'plasma-slugger'}}, support);
  assert.equal(p.expertise, 6);
  assert.equal(groundMaximumSpend(p, 'melee', 1), 7);
  assert.equal(groundMaximumSpend(p, 'ranged', 1), 4);
  const f = round(fight(p), {spend: 4}, () => 6);
  assert.equal(f.opponents[0].health, 3);
  assert.equal(f.player.energy, 56);
});

test('equipment cannot be duplicated or combined with Nova Armour', () => {
  const p = player({copilot: crew()});
  assert.throws(() => configureTwoFistedLoadout(p, {hero: {extras: ['trauma-kit']}, copilot: {extras: ['trauma-kit']}}, support), /both/);
  assert.throws(() => configureTwoFistedLoadout(p, {hero: {armour: 'nova-armour', ranged: 'disruptor-pistol'}}, support), /Nova/);
  assert.throws(() => configureTwoFistedLoadout(p, {hero: {extras: ['servoboots', 'servoboots']}}, support), /once/);
  assert.equal(p.inventory['trauma-kit'], 1);
});

test('Trauma Kit consumes its card on the first injury and protects subsequent exchanges', () => {
  const p = configureTwoFistedLoadout(player({fists: 0}), {hero: {extras: ['trauma-kit']}}, support);
  const f = round(fight(p, 'ranged', [enemy({expertise: 99}), enemy({expertise: 99})]));
  assert.equal(f.player.injuries, 0); assert.equal(f.player.traumaActive, true);
  assert.equal(f.player.inventory['trauma-kit'], 0); assert.equal(p.inventory['trauma-kit'], 1);
});

test('grenades consume no ENERGY and defer no damage into a second payment', () => {
  const original = fight(player({fists: 0}), 'ranged', [enemy({expertise: 99, fists: 20})]);
  const prepared = use(original, 'microwave-grenade');
  assert.throws(() => use(prepared, 'party-cracker'), /already/);
  assert.throws(() => prepareGroundRound(prepared, {spend: 1, target: 0}), /no ENERGY/);
  const f = round(prepared, {spend: 0}, () => {throw Error('An automatic win needs no dice');});
  assert.equal(f.player.energy, 60); assert.equal(f.opponents[0].health, 4);
  assert.equal(f.player.injuries, 0); assert.equal(f.player.nextAutomaticHeroWin, false);
  assert.equal(f.player.inventory['microwave-grenade'], 0);
  assert.equal(original.player.inventory['microwave-grenade'], 1);
});

test('Lascalpel suppresses printed first-round and random FISTS for the whole encounter', () => {
  const original = fight(player({fists: 0}), 'melee', [enemy({fists: 5, firstRoundFists: 10})]);
  const f = round(use(original, 'lascalpel', {target: 0}), {}, () => {throw Error('Suppressed FISTS cannot roll');});
  assert.equal(f.opponents[0].fistsSuppressed, true);
  assert.equal(f.log.find(event => event.type === 'exchange').enemyDice.score, 0);
  assert.equal(rollFists(0, () => {throw Error('Zero dice');}, {bonus: 4}).score, 0);
});

test('Sizzle Sack defeats one opponent and applies its melee injury die before deciding victory', () => {
  const original = fight(player({expertise: 2}), 'melee');
  const f = use(original, 'sizzle-sack', {target: 0}, () => 6);
  assert.equal(f.opponents[0].health, 0); assert.equal(f.player.injuries, 3); assert.equal(f.status, 'loss');
  assert.equal(original.opponents[0].health, 5);
  assert.equal(use(fight(), 'sizzle-sack', {target: 0}).status, 'win');
});

test('badge is reusable inventory but cannot be applied to the same co-pilot twice', () => {
  const p = recovery(player({copilot: crew()}), 'deputy-badge');
  assert.equal(p.copilot.badgeActive, true); assert.equal(p.copilot.badgeUsed, true);
  assert.equal(p.inventory['deputy-badge'], 1);
  assert.throws(() => recovery(p, 'deputy-badge'), /already/);
});

test('Trobble matches an unmatched enemy, takes an injury and is retained or discarded by its own die', () => {
  for (const die of [3, 4]) {
    const original = use(fight(player({fists: 0}), 'ranged', [enemy({expertise: 0}), enemy({expertise: 99})]), 'trobble');
    assert.throws(() => prepareGroundRound(original, {spend: 1, target: 0, trobbleTarget: 0}), /unmatched/);
    const f = round(original, {trobbleTarget: 1}, (() => {const dice = [1, die]; return () => dice.shift();})());
    assert.equal(f.player.trobble.inactive, true); assert.equal(f.player.trobble.discarded, die === 3);
    assert.equal(f.player.inventory.trobble, die === 3 ? 0 : 1);
    if (die === 4) assert.throws(() => use(f, 'trobble'), /already/);
  }
});

test('recovery respects robot/Bones restrictions and restores only actual injury penalties', () => {
  const p = player({copilot: crew({trait: 'horizon', injuries: 2, combat: 5, weapons: 5, manoeuvre: 5, shields: 5})});
  assert.throws(() => recovery(p, 'health-package', {who: 'copilot'}), /cannot heal/);
  const healed = recovery(p, 'robot-buddy-care-package', {who: 'copilot'});
  assert.equal(healed.copilot.combat, 6); assert.equal(healed.copilot.injuries, 0);
  assert.equal(healed.copilot.armourInjuryUsed, false);
  assert.throws(() => use(fight(p), 'robot-buddy-care-package', {who: 'copilot'}), /outside/);
  const bones = player({copilot: crew({trait: 'bones', injuries: 3, combat: 3})});
  const patched = use(fight(bones), 'sticking-plasters', {who: 'copilot'});
  assert.equal(patched.player.copilot.injuries, 0); assert.equal(patched.player.copilot.combat, 6);
  assert.throws(() => recovery(player({dead: true}), 'health-package'), /living/);
});

test('food retains printed gains and manual day/jump consequences without advancing a campaign', () => {
  const p = recovery(player({energy: 55}), 'thermos-of-something');
  assert.equal(p.energy, 105); assert.equal(p.expertise, 5); assert.equal(p.injuries, 1);
  const fizz = recovery(p, 'mangefizz');
  assert.equal(fizz.energy, 125); assert.equal(fizz.expertise, 4); assert.equal(fizz.temporaryExpertiseLoss, 1);
  const golden = recovery(player({energy: 2, maxEnergy: 60}), 'golden-energy');
  assert.equal(golden.energy, 60); assert.equal(golden.goldenEnergyJitters, true);
  assert.throws(() => recovery(player(), 'golden-energy'), /combat value/);
});

test('item use locks during unresolved exchanges and Nova Armour blocks activations', () => {
  const f = prepareGroundRound(fight(), {spend: 1, target: 0});
  assert.throws(() => use(f, 'gristle-tube'), /phase/);
  assert.throws(() => use(fight(player({armour: 'nova'})), 'gristle-tube'), /Nova/);
  assert.throws(() => use(fight(player({inventory: {}})), 'gristle-tube'), /owned/);
});

test('Dazzler charges its printed POWER and reduces only the selected ship for one round', () => {
  const p = configureTwoFistedLoadout(spacePlayer({inventory, ship: {hull: 20, power: 100}}), {shipUpgrades: ['dazzler-beam']}, support);
  const ship = {hull: 20, manoeuvre: 0, manoeuvreFists: 0, weapons: 2, weaponsFists: 0, shields: 0, shieldFists: 0};
  const original = startSpaceFight(p, {opponents: [ship], heavyHits: support.heavyHits});
  const activated = use(original, 'dazzler-beam', {target: 0});
  assert.equal(activated.player.ship.power, 95); assert.equal(activated.player.inventory['dazzler-beam'], 1);
  assert.throws(() => use(activated, 'dazzler-beam', {target: 0}), /unused/);
  const action = {target: 0, points: {}, fists: {}};
  const rolled = rollSpaceStations(prepareSpaceRound(activated, action));
  assert.equal(rolled.stations.enemies[0].profiles.weapons.value, 0);
  const next = rollSpaceStations(prepareSpaceRound(advanceSpaceFight(rolled), action));
  assert.equal(next.stations.enemies[0].profiles.weapons.value, 2);
  assert.equal(original.player.ship.power, 100);
});

test('hull and fuel repairs cap at entered maxima without repairing destroyed shields', () => {
  const p = spacePlayer({inventory, ship: {hull: 9, maxHull: 10, power: 90, maxPower: 100, shieldsDestroyed: true}});
  const repaired = recovery(p, 'hull-repair-kit');
  assert.equal(repaired.ship.hull, 10); assert.equal(repaired.ship.shieldsDestroyed, true);
  assert.equal(recovery(repaired, 'fuel-canister').ship.power, 100);
});

test('Iysp exchanges one injury for ten ENERGY and preserves the permanent co-pilot penalty', () => {
  const original = fight(player({energy: 30, copilot: crew({trait: 'iysp'})}));
  const f = useIyspEnergy(original);
  assert.equal(f.player.energy, 40); assert.equal(f.player.copilot.injuries, 1);
  assert.equal(f.player.copilot.combat, 5); assert.equal(f.player.copilot.weapons, 5);
  assert.equal(original.player.energy, 30);
  assert.throws(() => useIyspEnergy(fight()), /living/);
});

test('printed surrender can interrupt an unresolved exchange without applying its pending damage', () => {
  const original = startGroundFight(player({rightStuffAvailable: true, fists: 0}), {mode: 'ranged', surrenderTarget: '37', opponents: [enemy({expertise: 99})]});
  const pending = round(original);
  assert.ok(pending.pending);
  const left = leaveGroundFight(pending, 'surrender');
  assert.equal(left.status, 'loss'); assert.equal(left.player.injuries, 0); assert.equal(left.player.energy, 59);
  assert.equal(left.pending, null); assert.deepEqual(left.queue, []);
  assert.equal(left.log.at(-1).section, '37');
  assert.throws(() => leaveGroundFight(fight(), 'surrender'), /No printed/);
});

test('space surrender is available after station rolls and preserves the already paid POWER', () => {
  const ship = {hull: 5, manoeuvre: 0, manoeuvreFists: 0, weapons: 9, weaponsFists: 0, shields: 0, shieldFists: 0};
  const original = startSpaceFight(spacePlayer({ship: {hull: 6, power: 100}}), {opponents: [ship], heavyHits: support.heavyHits, surrenderTarget: '58'});
  const rolled = rollSpaceStations(prepareSpaceRound(original, {target: 0, points: {weapons: 3}, fists: {}}));
  const left = leaveSpaceFight(rolled, 'surrender');
  assert.equal(left.status, 'loss'); assert.equal(left.player.ship.power, 97); assert.equal(left.player.ship.hull, 6);
  assert.equal(left.roundAction, null); assert.equal(left.stage, 'ready');
});

test('dead protagonists cannot start a new encounter even when entered stats remain positive', () => {
  assert.throws(() => fight(player({dead: true})), /defeated/);
  const ship = {hull: 5, manoeuvre: 0, manoeuvreFists: 0, weapons: 0, weaponsFists: 0, shields: 0, shieldFists: 0};
  assert.throws(() => startSpaceFight(spacePlayer({dead: true}), {opponents: [ship], heavyHits: support.heavyHits}), /defeated/);
});

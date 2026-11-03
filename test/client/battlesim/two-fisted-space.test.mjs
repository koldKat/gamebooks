import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spacePlayer, startSpaceFight as startConfiguredSpaceFight, prepareSpaceRound, rollSpaceStations,
  rerollSpaceStation, spaceStationRerollAvailable, advanceSpaceFight, decideSpaceShieldReroll,
  finishSpaceFirefight, leaveSpaceFight} from '../../../public/js/battlesim/engines/two-fisted/space.js';
import {applySpaceHeavyHit} from '../../../public/js/battlesim/engines/two-fisted/space-damage.js';
import {prepareGroundRound, advanceGroundFight} from '../../../public/js/battlesim/engines/two-fisted/ground.js';
import {readRosterDocument} from '../../helpers/roster-db.cjs';

const heavyHits = readRosterDocument(1527).enemies.find(row => row.stats.entry.support).stats.entry.support.heavyHits;
const startSpaceFight = (p, encounter) => startConfiguredSpaceFight(p, {...encounter, heavyHits});

const enemy = (values = {}) => ({name: 'Ship', hull: 20, manoeuvre: 0, manoeuvreFists: 0,
  weapons: 0, weaponsFists: 0, shields: 0, shieldFists: 0, ...values});
const player = (values = {}) => spacePlayer({ship: {hull: 10, power: 100}, ...values});
const fight = (p = player(), enemies = [enemy()]) => startSpaceFight(p, {opponents: enemies});
function dice(...values) {return () => {assert.ok(values.length, 'Unexpected extra die'); return values.shift();};}
const action = (values = {}) => ({target: 0, points: {weapons: 3, manoeuvre: 0, shields: 3},
  fists: {weapons: 0, manoeuvre: 0, shields: 0}, ...values});
const stations = (f, a, roll = () => 1) => rollSpaceStations(prepareSpaceRound(f, action(a)), roll);
const round = (f, a, roll = () => 1) => advanceSpaceFight(stations(f, a, roll), roll);

test('Right Stuff controls are available only for failed protagonist rolls with an actual reroll', () => {
  const rolled = stations(fight(player({rightStuffAvailable: true}), [enemy({manoeuvre: 99})]),
    {fists: {weapons: 1, manoeuvre: 0, shields: 0}});
  assert.equal(spaceStationRerollAvailable(rolled, 'weapons'), true);
  assert.equal(spaceStationRerollAvailable(rolled, 'manoeuvre'), false);
  assert.equal(spaceStationRerollAvailable(rolled, 'shields'), false);
  const rerolled = rerollSpaceStation(rolled, 'weapons', () => 1);
  assert.equal(spaceStationRerollAvailable(rerolled, 'weapons'), false);
  const co = stations(fight(player({rightStuffAvailable: true, copilot: {combat: 6, weapons: 6, fists: 1}}), [enemy({manoeuvre: 99})]),
    {copilotStation: 'weapons', points: {weapons: 0, manoeuvre: 0, shields: 0}, fists: {weapons: 0, manoeuvre: 0, shields: 0}});
  assert.equal(spaceStationRerollAvailable(co, 'weapons'), false);
});

test('automatic hits use allocated weapons points even when aimed shots miss', () => {
  const original = fight(player(), [enemy({manoeuvre: 99})]);
  const next = round(original);
  assert.equal(next.opponents[0].hull, 19); assert.equal(next.player.ship.power, 94);
  assert.equal(original.opponents[0].hull, 20, 'The input snapshot remains untouched');
});

test('a ship destroyed by the first volley still fires its simultaneous return volley', () => {
  const next = round(fight(player({ship: {hull: 1, power: 100}}), [enemy({hull: 1, weapons: 3})]),
    {points: {weapons: 3, manoeuvre: 0, shields: 0}});
  assert.equal(next.player.ship.hull, 0); assert.equal(next.opponents[0].hull, 0);
  assert.equal(next.status, 'loss');
});

test('all initially living enemy ships fire, including after the selected target is destroyed', () => {
  const next = round(fight(player(), [enemy({hull: 1, weapons: 1}), enemy({weapons: 1})]),
    {points: {weapons: 3, manoeuvre: 0, shields: 0}});
  assert.equal(next.opponents[0].hull, 0); assert.equal(next.player.ship.hull, 8);
  assert.equal(next.opponents[1].hull, 20);
});

test('shield energy declines per deflection and a breached generator is unavailable during recharge', () => {
  let next = round(fight(player(), [enemy({weapons: 2})]), {points: {weapons: 0, manoeuvre: 0, shields: 1}});
  assert.equal(next.player.ship.hull, 9); assert.equal(next.player.ship.shieldsDown, true);
  next = round(next, {points: {weapons: 0, manoeuvre: 0, shields: 4}});
  assert.equal(next.player.ship.hull, 7, 'Recharging does not protect this round');
  assert.equal(next.player.ship.shieldsDown, false);
  next = round(next, {points: {weapons: 0, manoeuvre: 0, shields: 4}});
  assert.equal(next.player.ship.hull, 7, 'The generator protects the following round');
});

test('reactivation is strictly below allocated POWER; natural six still breaches a strong working shield', () => {
  let next = stations(fight(player({ship: {hull: 10, power: 100, shieldsDown: true}})),
    {points: {weapons: 0, manoeuvre: 0, shields: 3}}, dice(3));
  assert.equal(next.stations.player.shield.reactivation.success, false);
  next = advanceSpaceFight(next, () => {throw Error('No attacks');});
  assert.equal(next.player.ship.shieldsDown, true);
  const pierced = round(fight(player({expertise: 12}), [enemy({weapons: 1})]),
    {points: {weapons: 0, manoeuvre: 0, shields: 10}}, dice(6, 1));
  assert.equal(pierced.player.ship.hull, 9); assert.equal(pierced.player.ship.shieldsDown, true);
});

test('Dubhe’s backup starts on the next round once, then subsequent breaches require recharge', () => {
  const p = player({ship: {hull: 10, power: 100, shieldsDown: true, shieldGenerators: 2}});
  let next = stations(fight(p), {points: {weapons: 0, manoeuvre: 0, shields: 3}}, () => {throw Error('No recharge die with backup');});
  assert.equal(next.player.ship.backupUsed, true); assert.equal(next.stations.player.shield.score, 3);
  assert.equal(next.stations.player.shield.reactivation, null);
  next = advanceSpaceFight(next, () => 1); next.player.ship.shieldsDown = true;
  next = stations(next, {points: {weapons: 0, manoeuvre: 0, shields: 3}}, dice(2));
  assert.equal(next.stations.player.shield.reactivation.success, true);
});

test('a co-pilot contributes station expertise and FISTS without charging their expertise as POWER', () => {
  const p = player({copilot: {combat: 6, weapons: 6, fists: 1}});
  const next = stations(fight(p), {copilotStation: 'weapons',
    points: {weapons: 0, manoeuvre: 3, shields: 3}, fists: {weapons: 0, manoeuvre: 1, shields: 1}}, dice(4, 2));
  assert.equal(next.player.ship.power, 94); assert.equal(next.stations.player.profiles.weapons.value, 6);
  assert.deepEqual(next.stations.player.weapons.dice, [4]);
  assert.throws(() => prepareSpaceRound(fight(p), action({copilotStation: 'weapons'})), /alone/);
});

test('Shield Splitter caps shield allocation and prevents generator breach while hull hits still count', () => {
  const p = player({ship: {hull: 10, power: 100, upgrades: [{id: 'splitter', shieldSplitter: true}]}});
  assert.throws(() => prepareSpaceRound(fight(p), action({points: {weapons: 0, manoeuvre: 0, shields: 5}})), /four/);
  const next = round(fight(p, [enemy({weapons: 1})]), {points: {weapons: 0, manoeuvre: 0, shields: 3}}, dice(6, 1));
  assert.equal(next.player.ship.hull, 9); assert.equal(next.player.ship.shieldsDown, false);
});

test('Heavy Hits use two checks for three or more hull damage and critical hull damage never recurses', () => {
  const next = round(fight(), {}, dice(1, 6, 5, 2, 1));
  assert.equal(next.opponents[0].hull, 15);
  assert.equal(next.log.filter(e => e.type === 'heavy-check').length, 2);
  assert.equal(next.log.filter(e => e.type === 'heavy-hit').length, 1);
});

test('Cliff Bastard tests every incoming hit even when the shields absorbed it', () => {
  const next = round(fight(player({expertise: 12}), [enemy({weapons: 1, heavyEachHit: true})]),
    {points: {weapons: 0, manoeuvre: 0, shields: 10}}, dice(1, 6, 1));
  assert.equal(next.player.ship.hull, 10); assert.equal(next.player.ship.power, 80);
});

test('plasma cutters add one further hull damage per damaging attack, not per shot', () => {
  const next = round(fight(player(), [enemy({weapons: 3, extraHullDamageIfAnyDuringRound: 1})]),
    {points: {weapons: 0, manoeuvre: 0, shields: 0}});
  assert.equal(next.player.ship.hull, 5, 'Four ordinary hits plus one additional damage');
});

test('Bones keeps the generator operating on 1–3 without cancelling the printed hull damage', () => {
  const next = round(fight(player(), [enemy({shields: 1, repairShieldOnBreach: true})]),
    {points: {weapons: 1, manoeuvre: 0, shields: 0}}, dice(6, 1, 1));
  assert.equal(next.opponents[0].hull, 19); assert.equal(next.opponents[0].shieldsDown, false);
});

test('enemy Heavy Hit results 1–3 mean extra HULL rather than player-only fire, power or injuries', () => {
  for (const result of [1, 2, 3]) {
    const f = fight(); applySpaceHeavyHit(f, 0, result, () => {throw Error('No extra dice');});
    assert.equal(f.opponents[0].hull, 19); assert.deepEqual(f.fires, []);
  }
});

test('critical shield destruction persists and repeating it causes one HULL damage', () => {
  const f = fight(); applySpaceHeavyHit(f, 'player', 4, () => 1);
  assert.equal(f.player.ship.shieldsDestroyed, true); assert.equal(f.player.ship.hull, 10);
  applySpaceHeavyHit(f, 'player', 4, () => 1); assert.equal(f.player.ship.hull, 9);
});

test('critical upgrade removal removes combat bonuses and does not create recursive damage checks', () => {
  const f = fight(player({ship: {hull: 14, maxHull: 14, power: 100,
    upgrades: [{id: 'plating', hullBonus: 4}, {id: 'sensors', weaponsRoll: 1}]}}));
  applySpaceHeavyHit(f, 'player', 5, dice(1, 2));
  assert.equal(f.player.ship.hull, 9); assert.deepEqual(f.player.ship.upgrades.map(u => u.id), ['sensors']);
  applySpaceHeavyHit(f, 'player', 6, dice(3));
  assert.equal(f.player.ship.hull, 6); assert.deepEqual(f.player.ship.upgrades, []);
  assert.equal(f.log.filter(e => e.type === 'heavy-check').length, 0);
});

test('Life Support Generator burns out on low critical rolls and console injuries use shared protection', () => {
  const f = fight(player({trueGrit: true, ship: {hull: 10, power: 100,
    upgrades: [{id: 'life-support', lifeSupport: true, heavyModifier: -2}]}}));
  applySpaceHeavyHit(f, 'player', 1, () => {throw Error('No further dice');});
  assert.equal(f.player.ship.power, 100); assert.deepEqual(f.player.ship.upgrades, []);
  applySpaceHeavyHit(f, 'player', 3, dice(1));
  assert.equal(f.player.injuries, 1); assert.equal(f.player.expertise, 6);
});

test('Right Stuff can reroll one failed station roll without paying more POWER', () => {
  const f = stations(fight(player({rightStuffAvailable: true}), [enemy({manoeuvre: 10})]),
    {points: {weapons: 4, manoeuvre: 0, shields: 0}, fists: {weapons: 1, manoeuvre: 0, shields: 0}}, dice(1));
  const next = rerollSpaceStation(f, 'weapons', dice(6));
  assert.equal(next.stations.player.weapons.score, 6); assert.equal(next.player.ship.power, 96);
  assert.equal(next.player.rightStuffAvailable, false); assert.equal(f.player.rightStuffAvailable, true);
});

test('a failed shield hit waits for Right Stuff and a successful reroll prevents hull damage at no extra cost', () => {
  const staged = stations(fight(player({rightStuffAvailable: true}), [enemy({weapons: 1})]),
    {points: {weapons: 0, manoeuvre: 0, shields: 3}});
  const pending = advanceSpaceFight(staged, dice(6));
  assert.ok(pending.pending); assert.equal(pending.player.ship.hull, 10);
  const next = decideSpaceShieldReroll(pending, true, dice(1));
  assert.equal(next.player.ship.hull, 10); assert.equal(next.player.ship.power, 97);
  assert.equal(next.player.rightStuffAvailable, false);
});

test('a cockpit fire uses a real melee exchange and takes the assigned protagonist out of station work', () => {
  const initial = fight(); applySpaceHeavyHit(initial, 'player', 2, () => 1);
  assert.throws(() => prepareSpaceRound(initial, action({fireFighter: 'hero'})), /whole phase/);
  let next = prepareSpaceRound(initial, action({fireFighter: 'hero', points: {weapons: 0, manoeuvre: 0, shields: 0}}));
  assert.equal(next.status, 'firefighting');
  const fire = advanceGroundFight(prepareGroundRound(next.fireFight, {spend: 6, target: 0}), dice(6, 6, 1));
  assert.equal(fire.status, 'win'); next = finishSpaceFirefight(next, fire);
  assert.equal(next.player.energy, 54); assert.deepEqual(next.fires, []);
  assert.equal(next.stage, 'allocated');
});

test('a co-pilot can fight the fire alone at full expertise while the protagonist operates the ship', () => {
  const initial = fight(player({copilot: {combat: 6, weapons: 3, shields: 3, fists: 1}}));
  applySpaceHeavyHit(initial, 'player', 2, () => 1);
  let next = prepareSpaceRound(initial, action({fireFighter: 'copilot', points: {weapons: 0, manoeuvre: 0, shields: 3}}));
  const fire = advanceGroundFight(prepareGroundRound(next.fireFight, {spend: 0, target: 0, heroAway: true, copilotTargets: [0]}), dice(6, 1));
  assert.equal(fire.status, 'win'); next = finishSpaceFirefight(next, fire);
  assert.equal(next.player.energy, 60); assert.deepEqual(next.fires, []);
});

test('an ignored cockpit fire schedules a further Heavy Hit at the end of the next combat phase', () => {
  const initial = fight(); applySpaceHeavyHit(initial, 'player', 2, () => 1);
  const next = round(initial, {fireFighter: 'ignore', points: {weapons: 0, manoeuvre: 0, shields: 0}}, dice(1));
  assert.equal(next.player.ship.power, 90); assert.equal(next.fires.length, 1);
  assert.equal(next.log.filter(e => e.type === 'heavy-check' && e.automatic).length, 1);
});

test('ordinary ground encounters cannot opt the protagonist out of the fight', () => {
  const initial = fight(player({copilot: {combat: 6, weapons: 3, fists: 1}}));
  applySpaceHeavyHit(initial, 'player', 2, () => 1);
  const next = prepareSpaceRound(initial, action({fireFighter: 'copilot', points: {weapons: 0, manoeuvre: 0, shields: 0}}));
  next.fireFight.encounter.onboardFire = false;
  assert.throws(() => prepareGroundRound(next.fireFight, {spend: 0, target: 0, heroAway: true, copilotTargets: [0]}), /onboard fire/);
});

test('hangar onlookers score an unavoidable hit, with ordinary shield protection', () => {
  const initial = startSpaceFight(player(), {opponents: [enemy()], strayFire: true});
  const next = round(initial, {points: {weapons: 0, manoeuvre: 0, shields: 3}}, dice(1, 1));
  assert.equal(next.player.ship.hull, 10); assert.equal(next.stations.player.shield.score, 2);
  assert.equal(next.log.find(e => e.type === 'stray-fire').target, 'player');
});

test('the printed three-round interruption ends the encounter without navigating or inventing victory', () => {
  let f = startSpaceFight(player(), {opponents: [enemy()], roundLimit: 3, roundLimitTarget: '161'});
  for (let i = 0; i < 3; i++) f = round(f, {points: {weapons: 0, manoeuvre: 0, shields: 0}});
  assert.equal(f.status, 'ended'); assert.equal(f.log.at(-1).section, '161');
});

test('surrender is unavailable after killing one of the military ships', () => {
  const f = startSpaceFight(player(), {opponents: [enemy({hull: 1}), enemy()], surrenderTarget: '135', noSurrenderAfterKill: true});
  assert.equal(leaveSpaceFight(f, 'surrender').status, 'loss');
  const next = round(f, {points: {weapons: 1, manoeuvre: 0, shields: 0}});
  assert.equal(next.opponents[0].hull, 0);
  assert.throws(() => leaveSpaceFight(next, 'surrender'), /not available/);
});

test('the printed escape spends POWER and ends only that encounter', () => {
  const f = startSpaceFight(player(), {opponents: [enemy()], retreatTarget: '40', retreatPowerCost: 5});
  const next = leaveSpaceFight(f, 'escape');
  assert.equal(next.status, 'ended'); assert.equal(next.player.ship.power, 95);
  assert.equal(f.player.ship.power, 100);
});

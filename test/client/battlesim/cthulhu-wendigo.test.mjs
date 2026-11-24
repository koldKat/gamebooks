import assert from 'node:assert/strict';
import test from 'node:test';
import roster from '../../helpers/roster-db.cjs';
import { classicCheck, resistanceCheck } from '../../../public/js/battlesim/engines/cthulhu-solo/classic.js';
import { attackTurn, createFight, nextRound } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
import { prepareEnemyGroup } from '../../../public/js/battlesim/engines/cthulhu-solo/encounter-rules.js';

const entries = roster.readRosterDocument(1655).enemies.map(row => row.stats.entry);
const spec = section => entries.find(entry => entry.section === section);
const rolls = (...values) => () => values.shift() ?? .99;
const party = (encounter, changes = {}) => encounter.partyRoles.map(role => {
  const source = entries.find(entry => entry.profile?.role === role).profile;
  return { ...source, db: source.dbDice ? '1D4' : '0', weapons: source.weaponChoices, ...changes[role] };
});
const action = (side = 'party', index = 0, target = 0) => ({ side, index, target, defense: 'none' });

test('classic checks use an unopposed resistance chance and a separate impale threshold', () => {
  assert.equal(resistanceCheck(14, 18, rolls(.05, .35)).level, 2);
  assert.equal(resistanceCheck(14, 18, rolls(.15, .35)).level, 1);
  assert.equal(classicCheck(25, rolls(.55, .35), { doubled: true }).level, 2);
  assert.equal(classicCheck(25, rolls(.55, .05), { impaling: true }).level, 4);
});

test('the wendigo can be driven off but cannot be killed in section 186', () => {
  const encounter = spec(186);
  const fight = createFight(encounter, party(encounter), [{ ...encounter.enemies[0], hp: 3 }], { random: rolls() });
  assert.ok(fight.party.slice(1).every(actor => actor.unconscious));
  attackTurn(fight, action(), rolls(.05, .15, .85, .85));
  assert.equal(fight.enemies[0].hp, 1);
  assert.equal(fight.enemies[0].fled, true);
  assert.equal(fight.status, 'win');
});

test('the dwarf needs three consecutive successful holds and rolls an attack each round', () => {
  const encounter = spec(228);
  const fight = createFight(encounter, party(encounter), encounter.enemies);
  for (let round = 1; round <= 3; round++) {
    const enemy = attackTurn(fight, action('enemies'), rolls(.95, .95, .95));
    assert.equal(enemy.moveIndex, 2);
    const attempt = attackTurn(fight, action(), rolls(.15, .05, .15, .05));
    assert.equal(attempt.maneuver.succeeded, true);
    assert.equal(fight.status, round === 3 ? 'win' : 'fighting');
    if (round < 3) assert.equal(nextRound(fight), true);
  }
});

test('the sasquatch blockade rolls its group size and permits only one point-blank shot', () => {
  const encounter = spec(391);
  const enemies = prepareEnemyGroup(encounter, encounter.enemies, 0, rolls(.95));
  assert.equal(enemies.length, 3);
  const fight = createFight(encounter, party(encounter, { nadelmann: { rifle: 30, ammo: 4 } }), enemies);
  const shot = attackTurn(fight, action(), rolls(.55, .45, .05, .05));
  assert.equal(shot.attack.level, 2);
  assert.equal(fight.party[0].ammo, 3);
  assert.throws(() => attackTurn(fight, action()), /cannot act|Opening shot/);
  assert.equal(nextRound(fight), true);
  assert.throws(() => attackTurn(fight, { ...action(), weapon: 'rifle' }), /unavailable/);
});

test('normal-range alien volleys allow three shots and count hits rather than rifle damage', () => {
  const encounter = spec(380);
  const fight = createFight(encounter, party(encounter, { nadelmann: { rifle: 60, ammo: 4 } }), encounter.enemies);
  for (let remaining = 2; remaining >= 0; remaining--) {
    attackTurn(fight, action(), rolls(.55, .45, .05, .05));
    assert.equal(fight.enemies[0].hp, remaining);
  }
  assert.equal(fight.party[0].ammo, 1);
  assert.equal(fight.status, 'win');
});

test('the rescue combines Norman’s strength and only Sylvia takes failure damage', () => {
  const encounter = spec(464);
  const fight = createFight(encounter, party(encounter), encounter.enemies, { random: rolls(.05) });
  const sylvia = () => fight.party.find(actor => actor.role === 'sylvia');
  assert.equal(sylvia().hp, 10);
  const failed = attackTurn(fight, action(), rolls(.95, .95, .45));
  assert.deepEqual(failed.maneuver, { succeeded: false, damage: 3 });
  assert.equal(sylvia().hp, 7);
  assert.equal(fight.party[0].hp, 15);
  assert.equal(nextRound(fight), true);
  attackTurn(fight, action(), rolls(.95, .65));
  assert.equal(fight.status, 'win');
});

test('the original edition preserves its own health, strength and weapon presets', () => {
  assert.equal(spec(446).enemies[0].hp, 30);
  const encounter = spec(337);
  const enemies = prepareEnemyGroup(encounter, encounter.enemies, 0, rolls(.05, .05, .05));
  const fight = createFight(encounter, party(encounter), enemies);
  assert.equal(fight.party[0].str, 7);
  assert.equal(fight.party[0].db, '0');
  assert.equal(fight.enemies[0].hp, 9);
  assert.equal(entries.filter(e => e.kind === 'investigator').length, 6);
});

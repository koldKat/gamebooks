import assert from 'node:assert/strict';
import test from 'node:test';
import roster from '../../helpers/roster-db.cjs';
import { attackTurn, createFight, nextRound, prepareSkillRoll, resolveSkillRoll } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
import { retreat, surrender } from '../../../public/js/battlesim/engines/cthulhu-solo/effects.js';
import { prepareEnemyGroup } from '../../../public/js/battlesim/engines/cthulhu-solo/encounter-rules.js';

const rows = roster.readRosterDocument(1652).enemies.map(row => row.stats.entry);
const spec = number => rows.find(r => r.section === number);
const combatant = (role, overrides) => {
  const profile = rows.find(r => r.profile?.role === role).profile;
  return { ...profile, damage: '1D3+DB', counterDamage: '1D3+DB', db: role === 'nadelmann' ? '1D4' : '0',
    weapons: profile.weaponChoices, ...overrides };
};
const rolls = (...values) => () => values.shift() ?? .55;
const move = (side, index = 0, target = 0, extra) => ({ side, index, target, defense: 'none', ...extra });
const fightFor = (id, options = {}) => {
  const encounter = spec(id);
  const party = encounter.partyRoles.map(role => combatant(role, options[role]));
  const enemies = prepareEnemyGroup(encounter, encounter.enemies, options.remaining, options.enemyRoll ?? rolls());
  return createFight(encounter, party, enemies, { random: options.random ?? rolls() });
};

test('wind-walker reinforcements wait two rounds and only conscious allies can join', () => {
  const fight = fightFor(186);
  assert.throws(() => attackTurn(fight, move('party', 1), rolls()), /cannot act/);
  assert.throws(() => attackTurn(fight, move('party'), rolls()), /Other side/);
  for (let round = 1; round <= 2; round++) {
    attackTurn(fight, move('enemies'), rolls());
    attackTurn(fight, move('party'), rolls());
    assert.equal(nextRound(fight, rolls(.15, .15, .95, .85)), true);
  }
  assert.equal(fight.party[1].waiting, false);
  assert.equal(fight.party[2].unconscious, true);
  fight.enemies[0].hp = 3;
  attackTurn(fight, move('party'), rolls(.15, .05, .55, .55, .45));
  assert.equal(fight.enemies[0].hp, 1);
  assert.equal(fight.enemies[0].fled, true);
  assert.equal(fight.status, 'win');
});

test('a failed grapple costs hit points and a success breaks the hold', () => {
  const fight = fightFor(221);
  const failed = attackTurn(fight, move('party'), rolls(.55, .55, .15, .05, .35));
  assert.deepEqual(failed.maneuver, { succeeded: false, damage: 3 });
  assert.equal(nextRound(fight), true);
  const escaped = attackTurn(fight, move('party'), rolls(.15, .05, .55, .55));
  assert.equal(escaped.maneuver.succeeded, true);
  assert.equal(fight.status, 'escaped');
});

test('two consecutive maneuvers subdue the opponent and the first limits damage', () => {
  const fight = fightFor(228);
  attackTurn(fight, move('enemies'), rolls());
  attackTurn(fight, move('party'), rolls(.15, .05, .85, .95));
  assert.equal(fight.enemies[0].subdued, true);
  assert.equal(nextRound(fight), true);
  const hit = attackTurn(fight, move('enemies'), rolls(.25, .25, .55, .55));
  assert.equal(hit.wound.amount, 1);
  attackTurn(fight, move('party'), rolls(.15, .05, .85, .95));
  assert.equal(fight.status, 'win');
});

test('a rifle fumble wounds Norman and a melee rescue receives a bonus die', () => {
  const fight = fightFor(271, { norman: { hp: 8 } });
  const shot = attackTurn(fight, move('party', 0, 0, { weapon: 'rifle' }), rolls(.95, .95, .95, .05, .05));
  assert.equal(shot.friendlyFire.amount, 6);
  assert.equal(fight.party[1].hp, 2);
  assert.equal(fight.party[0].ammo, 4);
  const other = fightFor(271, { norman: { hp: 8 } });
  const melee = attackTurn(other, move('party', 0, 0, { weapon: 'axe' }), rolls(.25, .75, .05));
  assert.equal(melee.attack.tens.length, 2);
  assert.equal(attackTurn(other, move('enemies'), rolls()).target, 1);
});

test('enemy rolls use only Nadelmann’s assigned wolves and the printed health range', () => {
  assert.equal(prepareEnemyGroup(spec(307), spec(307).enemies, 2).length, 0);
  assert.equal(prepareEnemyGroup(spec(307), spec(307).enemies, 11).length, 3);
  assert.equal(prepareEnemyGroup(spec(307), spec(307).enemies, 0, rolls(.99, .99)).length, 4);
  const fight = fightFor(337, { enemyRoll: rolls(.05, .05, .05) });
  assert.equal(fight.enemies[0].hp, 9);
  assert.equal(attackTurn(fight, move('party'), rolls()).attack.tens.length, 2);
});

test('party damage is shared unless Nadelmann volunteers for the hit', () => {
  const fight = fightFor(376);
  const hit = attackTurn(fight, move('enemies'), rolls(.25, .25, .55, .55));
  assert.deepEqual(hit.wound.distributed.map(x => x.damage), [4, 4]);
  const other = fightFor(376);
  const protectedHit = attackTurn(other, move('enemies', 0, 0, { protectParty: true }), rolls(.25, .25, .55, .55));
  assert.deepEqual(protectedHit.wound.distributed, [{ index: 0, damage: 8 }]);
  assert.equal(other.party[0].majorWound, true);
});

test('opening shots, surrender and weakened opponents stay inside the fight', () => {
  const fight = fightFor(391);
  assert.equal(fight.openingFire, true);
  assert.throws(() => attackTurn(fight, move('party', 1), rolls()), /Opening shot/);
  const shot = attackTurn(fight, move('party'), rolls());
  assert.equal(shot.attack.tens.length, 2);
  assert.equal(nextRound(fight), true);
  assert.equal(fight.round, 1);
  assert.throws(() => attackTurn(fight, move('party', 0, 0, { weapon: 'rifle' }), rolls()), /unavailable/);
  assert.throws(() => retreat(fight), /weakened/);
  for (const enemy of fight.enemies) enemy.hp = 9;
  retreat(fight);
  assert.equal(fight.status, 'retreated');
  const possession = fightFor(446, { random: rolls(.15, .05, .55, .55, .45, .05, .25, .25), bernard: { ammo: 0 } });
  assert.equal(possession.log.filter(row => row.openingCheck).length, 4);
  assert.equal(possession.party[0].canFireOpening, true);
  assert.equal(nextRound(possession), true);
  assert.equal(attackTurn(possession, move('enemies'), rolls()).target, 3);
});

test('riflemen flee at half hit and shared Luck is paid by Nadelmann', () => {
  const fight = fightFor(591, { enemyRoll: rolls(.25), nadelmann: { luck: 10 } });
  assert.equal(fight.enemies.length, 4);
  assert.equal(surrender(fightFor(591)), true);
  const options = move('party', 1, 0);
  const pending = prepareSkillRoll(fight, options, rolls(.55, .45));
  assert.equal(pending.entry.luckAvailable, 10);
  resolveSkillRoll(fight, pending, 5, rolls());
  assert.equal(fight.party[0].luck, 5);
  assert.equal(fight.enemies[0].wasHit, true);
  attackTurn(fight, move('party', 0, 1), rolls(.15, .05));
  assert.equal(fight.status, 'win');
  assert.equal(fight.enemies.every(a => a.fled), true);
});

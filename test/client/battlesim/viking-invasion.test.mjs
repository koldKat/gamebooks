import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction, validateFight} from '../../../public/js/battlesim/books/732/combat.js';
import rosterDatabase from '../../helpers/roster-db.cjs';

// Synthetic branch IDs exercise the engine; production encounters remain in the database.
const outcome = (section, damage = 0) => ({section, damage, result:'win'});
const opposed = () => ({key:'test', name:'Test opponent', section:'1', kind:'opposed',
  strengthFactor:2, energyFactor:2, enemyBase:20,
  outcomes:{wide:outcome(1), edge:outcome(2), tie:outcome(3, 1), behind:outcome(4, 2)}});
const ragnar = () => ({key:'test', name:'Test opponent', section:'1', kind:'ragnar',
  strength:14, energy:8, extendedWin:6, deathSection:5,
  outcomes:{wide:outcome(1), edge:outcome(2, 1), tie:outcome(3, 1),
    behind:[outcome(4, 2), {section:5, damage:0, result:'loss', fatal:true}]}});
const player = (strength = 14, energy = 8) => ({strength, energy});
const action = (fight, values) => combatAction(fight, {expectedRevision:fight.revision, ...values});
const round = (fight, playerDie, enemyDie) => action(fight, {kind:'round', playerDie, enemyDie});

test('732 opposed duel preserves victories with injuries instead of treating every lower total as defeat', () => {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const original = startFight(player(5, 5), opposed());
    const fight = round(original, a, b), difference = a - b;
    assert.equal(fight.destination, difference > 1 ? 1 : difference === 1 ? 2 : difference === 0 ? 3 : 4);
    assert.equal(fight.status, 'win');
    assert.equal(fight.player.energy, 5 - (difference < 0 ? 2 : difference === 0 ? 1 : 0));
    assert.equal(original.player.energy, 5);
  }
  const encounter = opposed(); encounter.strengthFactor = 4; encounter.enemyBase = 34;
  const fight = round(startFight(player(8, 4), encounter), 3, 3);
  assert.equal(fight.events.at(-1).playerTotal, 43);
  assert.equal(fight.events.at(-1).enemyTotal, 37);
  const dead = round(startFight(player(1, 1), opposed()), 1, 6);
  assert.equal(dead.status, 'loss'); assert.equal(dead.player.energy, 0); assert.equal(dead.dead, true);
});

test('732 quick Ragnar duel retains the duplicated printed negative condition as an explicit unresolved choice', () => {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const fight = round(startFight(player(), ragnar()), a, b), difference = a - b;
    if (difference < 0) {
      assert.equal(fight.status, 'fighting'); assert.equal(fight.result, null);
      assert.equal(fight.destination, null); assert.equal(fight.pending.length, 2);
      assert.equal(fight.player.energy, 8);
      assert.throws(() => round(fight, 6, 1), /No duel round/);
      const recovered = action(fight, {kind:'choose', section:4});
      assert.equal(recovered.status, 'win'); assert.equal(recovered.player.energy, 6);
      const death = action(fight, {kind:'choose', section:5});
      assert.equal(death.status, 'loss'); assert.equal(death.dead, true);
      assert.throws(() => action(fight, {kind:'choose', section:7}), /printed outcome/);
    } else {
      assert.equal(fight.status, 'win');
      assert.equal(fight.destination, difference > 1 ? 1 : difference === 1 ? 2 : 3);
      assert.equal(fight.player.energy, difference > 1 ? 8 : 7);
    }
  }
});

test('732 extended duel uses doubled Strength and repeats the printed section320 energy adjustment on returning', () => {
  let fight = startFight(player(13, 8), ragnar(), 'extended');
  fight = round(fight, 6, 1);
  assert.equal(fight.player.energy, 7); assert.equal(fight.opponent.energy, 7);
  assert.equal(fight.events.at(-1).playerTotal, 32); assert.equal(fight.events.at(-1).enemyTotal, 29);
  fight = round(fight, 6, 1);
  assert.equal(fight.player.energy, 6); assert.equal(fight.opponent.energy, 6);
  assert.equal(fight.events.filter(event => event.kind === 'adjustment').length, 2);
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const next = round(startFight(player(), ragnar(), 'extended'), a, b);
    assert.equal(next.player.energy, 8 - Number(b - a > 1));
    assert.equal(next.opponent.energy, 8 - Number(a - b > 1));
  }
});

test('732 fatal opening and final strikes resolve once, while stale actions cannot modify combat', () => {
  const original = startFight(player(10, 1), ragnar(), 'extended');
  let rolls = 0;
  const dead = combatAction(original, {kind:'round', expectedRevision:0}, () => {rolls++; return 1;});
  assert.equal(rolls, 0); assert.equal(dead.status, 'loss'); assert.equal(dead.destination, 5);
  assert.throws(() => round(dead, 1, 1), /Stale/);
  const enemy = ragnar(); enemy.energy = 1;
  const won = round(startFight(player(), enemy, 'extended'), 6, 1);
  assert.equal(won.status, 'win'); assert.equal(won.destination, 6);
  assert.throws(() => combatAction(original, {kind:'round', expectedRevision:1}), /Stale/);
  assert.throws(() => round(startFight(player(), ragnar()), 7, 1), /Invalid/);
  assert.throws(() => startFight(player(), opposed(), 'extended'), /Invalid/);
  assert.deepEqual(validateFight(JSON.parse(JSON.stringify(won))), won);
});

test('732 installed presets cover every die pair and both extended outcomes without duplicated catalog fixtures', () => {
  const catalog = rosterDatabase.readRosterDocument(732).enemies.map(row => row.stats.entry);
  assert.equal(catalog.length, 8);
  for (const encounter of catalog) {
    let stats;
    if (encounter.kind === 'ragnar') stats = player(encounter.strength, encounter.energy);
    else {
      for (let strength = 1; strength <= 30 && !stats; strength++) {
        for (let energy = 3; energy <= 30; energy++) {
          if (encounter.strengthFactor * strength + encounter.energyFactor * energy === encounter.enemyBase) {
            stats = player(strength, energy); break;
          }
        }
      }
    }
    assert.ok(stats, 'Balanced preset input ' + encounter.key);
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const fight = round(startFight(stats, encounter), a, b), difference = a - b;
      const key = difference > 1 ? 'wide' : difference === 1 ? 'edge' : difference === 0 ? 'tie' : 'behind';
      const expected = encounter.outcomes[key];
      if (Array.isArray(expected)) {
        assert.deepEqual(fight.pending, expected); assert.equal(fight.status, 'fighting');
        for (const choice of expected) {
          const result = action(fight, {kind:'choose', section:choice.section});
          assert.equal(result.destination, choice.section);
          assert.equal(result.status, choice.fatal ? 'loss' : 'win');
        }
      } else {
        assert.equal(fight.destination, expected.section);
        assert.equal(fight.player.energy, stats.energy - expected.damage);
        assert.equal(fight.status, expected.result);
      }
    }
    if (encounter.kind === 'ragnar') for (const winning of [true, false]) {
      let fight = startFight(stats, encounter, 'extended');
      for (let count = 0; fight.status === 'fighting' && count < 30; count++) {
        fight = round(fight, winning ? 6 : 1, winning ? 1 : 6);
      }
      assert.equal(fight.status, winning ? 'win' : 'loss');
      assert.equal(fight.destination, winning ? encounter.extendedWin : encounter.deathSection);
    }
  }
});

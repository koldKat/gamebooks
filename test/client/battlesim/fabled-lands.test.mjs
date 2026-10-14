import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAR_TORN_FIGHTS } from '../../../public/js/battlesim/engines/fabled-lands/roster.js';
import { newFabledCharacter, fabledDefence, fabledAbilityCheck, fabledRankCheck }
  from '../../../public/js/battlesim/engines/fabled-lands/character.js';
import { startFabledFight, fabledRound } from '../../../public/js/battlesim/engines/fabled-lands/core.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die roll'); return values.shift(); };
const enemy = (changes = {}) => ({ name: 'Wolf', combat: 3, defence: 5, stamina: 7, ...changes });
const fight = (config = {}, character = {}) => startFabledFight({ enemies: [enemy()], ...config },
  { ...newFabledCharacter(), ...character });

test('all 49 verified source stat rows occur in 39 encounters with named opponents', () => {
  const source = JSON.parse(readFileSync(new URL('./fabled-lands-source.json', import.meta.url)));
  assert.equal(source.sourceHash, '8b156e136552ffc8d8e8739777582b128f46b95220c317429d650aca5bbbcf45');
  assert.equal(source.rows.length, 49); assert.equal(WAR_TORN_FIGHTS.length, 39);
  assert.deepEqual(WAR_TORN_FIGHTS.flatMap(({ section, enemies }) => enemies.map(enemy => ({ section, ...enemy }))), source.rows);
  for (const encounter of WAR_TORN_FIGHTS) {
    assert.ok(!/^section/i.test(encounter.label));
    const input = { ...newFabledCharacter(), combat: 100, stamina: 1000 };
    const before = structuredClone(input);
    let f = startFabledFight(encounter, input);
    for (let rounds = 0; f.status === 'fighting'; rounds++) {
      assert.ok(rounds < encounter.enemies.length + 1);
      f = fabledRound(f, {}, () => 6);
    }
    assert.equal(f.status, 'win'); assert.equal(f.destination, encounter.win);
    assert.deepEqual(input, before);
  }
});

test('source underwater penalty is applied once; rat poison is eligible, consumed once, and adds three', () => {
  const c = { ...newFabledCharacter(), ratPoison: 1 };
  const underwater = startFabledFight(WAR_TORN_FIGHTS.find(f => f.section === 238), c);
  assert.equal(underwater.attackModifier, -2);
  assert.equal(startFabledFight(WAR_TORN_FIGHTS.find(f => f.section === 121), c).attackModifier, 0);
  const rats = WAR_TORN_FIGHTS.find(f => f.section === 42);
  const f = startFabledFight(rats, c, { ratPoison: true });
  assert.equal(f.attackModifier, 3); assert.equal(f.character.ratPoison, 0); assert.equal(c.ratPoison, 1);
  assert.throws(() => startFabledFight(rats, { ...c, ratPoison: 0 }, { ratPoison: true }));
  assert.throws(() => startFabledFight(WAR_TORN_FIGHTS[0], c, { ratPoison: true }));
});

test('book-one profession presets and initial defence match the primary character sheet', () => {
  const c = newFabledCharacter();
  assert.equal(c.combat, 6); assert.equal(c.rank, 1); assert.equal(c.stamina, 9);
  assert.equal(c.shards, 16); assert.equal(c.armour, 1); assert.equal(fabledDefence(c), 8);
  assert.equal(newFabledCharacter('priest').sanctity, 6);
  assert.equal(newFabledCharacter('mage').magic, 6);
  assert.equal(newFabledCharacter('rogue').thievery, 6);
  assert.equal(newFabledCharacter('troubadour').charisma, 6);
  assert.equal(newFabledCharacter('wayfarer').scouting, 6);
  assert.throws(() => newFabledCharacter('__proto__'));
});

test('ability checks are strict, rank checks inclusive, including a minus-one roll', () => {
  const c = newFabledCharacter();
  assert.equal(fabledAbilityCheck(c, 'combat', 8, rolls(1, 1)).success, false);
  assert.equal(fabledAbilityCheck(c, 'combat', 8, rolls(1, 2)).success, true);
  assert.equal(fabledRankCheck(c, 1, 0, rolls(1)).success, true);
  assert.equal(fabledRankCheck(c, 1, -1, rolls(2)).success, true);
  assert.equal(fabledRankCheck(c, 1, -1, rolls(3)).success, false);
});

test('damage is attack excess, equal defence is harmless, and a dead enemy cannot counter', () => {
  let f = fight(); const before = structuredClone(f);
  f = fabledRound(f, {}, rolls(3, 3));
  assert.equal(f.status, 'win'); assert.equal(f.character.stamina, 9);
  assert.equal(f.events.length, 1); assert.deepEqual(before, fight());
  f = fabledRound(fight({ enemies: [enemy({ defence: 8 })] }), {}, rolls(1, 1, 2, 3));
  assert.equal(f.enemies[0].stamina, 7); assert.equal(f.character.stamina, 9);
});

test('sequential enemies retain player wounds and the next enemy waits until the next round', () => {
  const f = fabledRound(fight({ enemies: [enemy({ stamina: 1 }), enemy()] }, { stamina: 4 }), {}, rolls(1, 1));
  assert.equal(f.target, 1); assert.equal(f.character.stamina, 4); assert.equal(f.status, 'fighting');
  assert.equal(f.events.length, 1);
});

test('nonfatal duels restore pre-fight stamina on either result', () => {
  let f = fabledRound(fight({ nonfatal: true, win: 19 }, { stamina: 4 }), {}, rolls(3, 3));
  assert.equal(f.status, 'win'); assert.equal(f.character.stamina, 4); assert.equal(f.destination, 19);
  f = fabledRound(fight({ nonfatal: true, loss: 370, enemies: [enemy({ defence: 20, combat: 20 })] },
    { stamina: 4 }), {}, rolls(1, 1, 6, 6));
  assert.equal(f.status, 'loss'); assert.equal(f.character.stamina, 4); assert.equal(f.destination, 370);
});

test('entry wounds are optional once, nonfatal losses use one stamina, and threshold prevents counterattack', () => {
  const c = newFabledCharacter();
  assert.equal(startFabledFight({ enemies: [enemy()], entryDamage: 5 }, c).character.stamina, 4);
  assert.equal(startFabledFight({ enemies: [enemy()], entryDamage: 5 }, c, { applyEntry: false }).character.stamina, 9);
  const f = fabledRound(fight({ threshold: 5, win: 148, enemies: [enemy({ stamina: 10, defence: 7 })] }), {}, rolls(3, 3));
  assert.equal(f.status, 'win'); assert.equal(f.destination, 148); assert.equal(f.character.stamina, 9);
  const loss = fabledRound(fight({ lossStamina: 1, loss: 195, enemies: [enemy({ defence: 20, combat: 20 })] }), {}, rolls(1, 1, 6, 6));
  assert.equal(loss.character.stamina, 1); assert.equal(loss.destination, 195);
});

test('combat blessing rerolls only a failed attack and a luck reroll consumes exactly one blessing', () => {
  const c = { combatBlessing: true, luckBlessing: true };
  let f = fabledRound(fight({}, c), { combatBlessing: true }, rolls(3, 3));
  assert.equal(f.character.combatBlessing, true);
  f = fabledRound(fight({ enemies: [enemy({ defence: 8 })] }, c), { combatBlessing: true }, rolls(1, 1, 6, 6));
  assert.equal(f.character.combatBlessing, false); assert.equal(f.character.luckBlessing, true);
  f = fabledRound(fight({}, c), { luckReroll: 'player' }, rolls(1, 1, 6, 6));
  assert.equal(f.character.luckBlessing, false); assert.equal(f.character.combatBlessing, true);
  assert.throws(() => fabledRound(fight(), { combatBlessing: true }, rolls(1, 1)));
});

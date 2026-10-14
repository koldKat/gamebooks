import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAR_TORN_FIGHTS } from '../../../public/js/battlesim/engines/fabled-lands/roster.js';
import { newFabledCharacter, fabledDefence, fabledAbilityCheck, fabledRankCheck }
  from '../../../public/js/battlesim/engines/fabled-lands/character.js';
import { startFabledFight, fabledRound, fleeFabledFight } from '../../../public/js/battlesim/engines/fabled-lands/core.js';
import { CITIES_OF_GOLD_FIGHTS, citiesOfGoldSeaCheck } from '../../../public/js/battlesim/engines/fabled-lands/cities-of-gold.js';
import { BLOOD_DARK_DEFAULTS, BLOOD_DARK_FIGHTS, bloodDarkSeaCheck } from '../../../public/js/battlesim/engines/fabled-lands/blood-dark-sea.js';
import { HOWLING_DEFAULTS, HOWLING_FIGHTS, howlingSeaCheck } from '../../../public/js/battlesim/engines/fabled-lands/howling-darkness.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die roll'); return values.shift(); };
const enemy = (changes = {}) => ({ name: 'Wolf', combat: 3, defence: 5, stamina: 7, ...changes });
const fight = (config = {}, character = {}) => startFabledFight({ enemies: [enemy()], ...config },
  { ...newFabledCharacter(), ...character });

test('book-four first-wound interruption and Avar threshold preserve saved inputs', () => {
  const c = newFabledCharacter('warrior', HOWLING_DEFAULTS);
  assert.equal(c.rank, 4); assert.equal(c.stamina, 20); assert.equal(c.shards, 65);
  assert.equal(HOWLING_FIGHTS.length, 31);
  const cutthroats = HOWLING_FIGHTS.find(f => f.section === 238);
  const original = startFabledFight(cutthroats, c);
  const stopped = fabledRound(original, {}, rolls(1, 1, 6, 6));
  assert.equal(stopped.status, 'loss'); assert.equal(stopped.destination, 184);
  assert.ok(stopped.character.stamina > 0); assert.equal(original.status, 'fighting');
  assert.equal(c.stamina, 20);
  const dead = fabledRound(startFabledFight(cutthroats, { ...c, stamina: 1 }), {}, rolls(1, 1, 6, 6));
  assert.equal(dead.destination, 7);
  const avar = HOWLING_FIGHTS.find(f => f.section === 419);
  const won = fabledRound(startFabledFight(avar, c), {}, rolls(5, 5));
  assert.equal(won.status, 'win'); assert.equal(won.destination, 392);
  assert.equal(won.events.length, 1);
  const lost = fabledRound(startFabledFight(avar, { ...c, stamina: 1 }), {}, rolls(1, 1, 6, 6));
  assert.equal(lost.destination, 338); assert.equal(lost.character.stamina, 1);
});

test('book-four storms, naval outcomes and shipwreck checks match printed modifiers', () => {
  const c = newFabledCharacter('mage', HOWLING_DEFAULTS);
  assert.equal(howlingSeaCheck(11, c, { crew: 'poor' }, rolls(3)).destination, 135);
  assert.equal(howlingSeaCheck(11, c, { crew: 'good' }, rolls(3)).destination, 106);
  assert.equal(howlingSeaCheck(11, c, { crew: 'excellent' }, rolls(4)).destination, 236);
  const blessed = { ...c, stormsBlessing: true };
  assert.equal(howlingSeaCheck(512, blessed, { safetyFromStorms: true }).destination, 438);
  assert.equal(blessed.stormsBlessing, true);
  assert.equal(howlingSeaCheck(451, c, {}, rolls(3, 3)).destination, 419);
  assert.equal(howlingSeaCheck(451, c, { crew: 'good' }, rolls(3, 3)).destination, 236);
  assert.equal(howlingSeaCheck(338, c, { crew: 'good' }, rolls(6, 6)).destination, 240);
  assert.equal(howlingSeaCheck(392, c, { crew: 'good' }, rolls(6, 6)).destination, 149);
  const survived = howlingSeaCheck(135, c, {}, rolls(2, 2, 3));
  assert.equal(survived.destination, 436); assert.equal(survived.character.stamina, 17);
  assert.equal(howlingSeaCheck(135, c, {}, rolls(2, 3)).destination, 7);
  assert.equal(c.stamina, 20);
});

test('book-three presets and ability curse do not change earlier defaults', () => {
  const c = newFabledCharacter('priest', BLOOD_DARK_DEFAULTS);
  assert.equal(c.rank, 3); assert.equal(c.stamina, 16); assert.equal(c.staminaInitial, 16);
  assert.equal(c.shards, 40); assert.equal(c.armour, 3); assert.equal(c.sanctity, 7);
  assert.equal(newFabledCharacter('warrior', BLOOD_DARK_DEFAULTS).combat, 7);
  assert.equal(newFabledCharacter().combat, 6); assert.equal(newFabledCharacter().shards, 16);
  assert.equal(fabledAbilityCheck({ ...c, abilityCurse: true }, 'sanctity', 10, rolls(4)).total, 11);
  assert.equal(fabledAbilityCheck(c, 'sanctity', 10, rolls(4, 4)).total, 15);
  assert.equal(c.abilityCurse, false);
});

test('enemy-first source encounter can kill before the player attacks, without mutating saved inputs', () => {
  const spec = BLOOD_DARK_FIGHTS.find(row => row.section === 441);
  const c = { ...newFabledCharacter('warrior', BLOOD_DARK_DEFAULTS), stamina: 1 };
  const original = startFabledFight(spec, c, { defence: c.combat + c.rank });
  const lost = fabledRound(original, {}, rolls(6, 6));
  assert.equal(lost.status, 'loss'); assert.equal(lost.destination, 123);
  assert.equal(lost.events.length, 1); assert.equal(lost.events[0].direction, 'enemy');
  assert.equal(original.status, 'fighting'); assert.equal(c.stamina, 1);
  const won = fabledRound(startFabledFight(spec, { ...c, stamina: 16 }, { defence: 10 }), {}, rolls(1, 1, 6, 6));
  assert.equal(won.status, 'win'); assert.equal(won.destination, 262);
  assert.deepEqual(won.events.map(event => event.direction), ['enemy', 'player']);
});

test('book-three ship checks use printed thresholds, cargo penalty and local death123', () => {
  const c = newFabledCharacter('mage', BLOOD_DARK_DEFAULTS);
  assert.equal(bloodDarkSeaCheck(194, c, { crew: 'poor' }, rolls(1, 1)).destination, 214);
  assert.equal(bloodDarkSeaCheck(194, c, { crew: 'average' }, rolls(1, 1)).destination, 61);
  assert.equal(bloodDarkSeaCheck(268, { ...c, hasCargo: true }, {}, rolls(1, 2)).destination, 201);
  assert.equal(bloodDarkSeaCheck(268, c, {}, rolls(1, 2)).destination, 322);
  const defeated = bloodDarkSeaCheck(201, c, {}, rolls(1, 1, 2, 3));
  assert.equal(defeated.destination, 435); assert.equal(defeated.damage, 5);
  assert.equal(defeated.character.stamina, 11); assert.equal(defeated.status, 'loss');
  const blessed = { ...c, stormsBlessing: true };
  assert.equal(bloodDarkSeaCheck(139, blessed, { safetyFromStorms: true }).destination, 154);
  assert.equal(blessed.stormsBlessing, true);
  const storm = bloodDarkSeaCheck(139, c, { crew: 'poor' }, rolls(6));
  assert.equal(storm.total, 5); assert.equal(storm.destination, 157);
  assert.equal(bloodDarkSeaCheck(384, c, {}, rolls(1)).destination, 486);
  assert.equal(bloodDarkSeaCheck(647, c, { crew: 'poor' }, rolls(1, 1)).destination, 123);
  assert.equal(c.stamina, 16);
});

test('book-three survival, lightning and catamaran checks use their own modifiers', () => {
  const c = newFabledCharacter('mage', BLOOD_DARK_DEFAULTS);
  assert.equal(bloodDarkSeaCheck(142, c, {}, rolls(4)).destination, 123);
  assert.equal(bloodDarkSeaCheck(142, c, {}, rolls(5)).destination, 152);
  const wayfarer = newFabledCharacter('wayfarer', BLOOD_DARK_DEFAULTS);
  assert.equal(bloodDarkSeaCheck(142, wayfarer, {}, rolls(2, 3)).destination, 152);
  assert.equal(bloodDarkSeaCheck(168, c, {}, rolls(2, 2)).destination, 212);
  const copper = bloodDarkSeaCheck(168, { ...c, copperOre: true }, {}, rolls(2, 2));
  assert.equal(copper.destination, 135); assert.equal(copper.crew, 'poor');
  assert.equal(bloodDarkSeaCheck(168, c, {}, rolls(5, 6)).character.stamina, 0);
  const blessed = { ...c, stormsBlessing: true };
  assert.equal(bloodDarkSeaCheck(168, blessed, { safetyFromStorms: true }).destination, 352);
  assert.equal(blessed.stormsBlessing, true);
  assert.equal(bloodDarkSeaCheck(186, c, { crew: 'excellent' }, rolls(4, 5)).destination, 206);
  const warrior = newFabledCharacter('warrior', BLOOD_DARK_DEFAULTS);
  assert.equal(bloodDarkSeaCheck(186, warrior, {}, rolls(3, 3, 4)).destination, 352);
  assert.equal(c.stamina, 16);
});

test('book-two defaults, escape damage and entry arrows preserve their inputs', () => {
  const c = newFabledCharacter('warrior', { rank: 2, stamina: 13 });
  assert.equal(c.rank, 2); assert.equal(c.staminaInitial, 13); assert.equal(c.stamina, 13);
  assert.equal(newFabledCharacter().stamina, 9);
  const find = section => CITIES_OF_GOLD_FIGHTS.find(row => row.section === section);
  assert.equal(CITIES_OF_GOLD_FIGHTS.flatMap(row => row.enemies).length, 35);
  const original = startFabledFight(find(207), c);
  const escaped = fleeFabledFight(original, rolls(4));
  assert.equal(escaped.status, 'fled'); assert.equal(escaped.destination, 22);
  assert.equal(escaped.character.stamina, 9); assert.equal(original.character.stamina, 13);
  assert.equal(original.status, 'fighting'); assert.equal(c.stamina, 13);
  const shot = startFabledFight(find(726), c, {}, rolls(4));
  assert.equal(shot.character.stamina, 10);
  assert.equal(startFabledFight(find(726), c, { applyEntry: false }).character.stamina, 13);
  const fatal = startFabledFight(find(207), { ...c, stamina: 1 });
  assert.equal(fleeFabledFight(fatal, rolls(6)).destination, 560);
  assert.throws(() => fleeFabledFight(startFabledFight(find(469), c)));
});

test('Golnir sea routes preserve special crew bonuses, escape threshold and storm-blessing destinations', () => {
  const c = newFabledCharacter('mage', { rank: 2, stamina: 13 });
  assert.equal(citiesOfGoldSeaCheck(411, c, {}, rolls(2, 3)).destination, 14);
  assert.equal(citiesOfGoldSeaCheck(411, c, {}, rolls(2, 2)).destination, 461);
  assert.equal(citiesOfGoldSeaCheck(488, c, {}, rolls(2, 2)).destination, 221);
  const blessed = { ...c, stormsBlessing: true };
  const safe = citiesOfGoldSeaCheck(583, blessed, { safetyFromStorms: true });
  assert.equal(safe.destination, 198); assert.equal(safe.character.stormsBlessing, false);
  assert.equal(blessed.stormsBlessing, true);
  const defeated = citiesOfGoldSeaCheck(461, c, {}, rolls(2, 2, 3, 4));
  assert.equal(defeated.destination, 535); assert.equal(defeated.damage, 7);
  assert.equal(defeated.character.stamina, 6); assert.equal(c.stamina, 13);
  const conceded = citiesOfGoldSeaCheck(461, c, {}, rolls(4, 4, 2));
  assert.equal(conceded.destination, 510); assert.equal(conceded.damage, 2);
  const won = citiesOfGoldSeaCheck(680, { ...c, rank: 6 }, {}, rolls(6, 6));
  assert.equal(won.destination, 752); assert.equal(won.status, 'win');
});

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

import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(689);
await loadFixtureRoster(690);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import en from '../../../public/js/i18n/en/battlesim/battlesim689.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim689.js';
import { newValleyCharacter, legendarySkillCheck, legendaryAttack, legendaryDamage,
  legendaryHeal, legendaryPool, newValleySkullcracker, newCrownCharacter,
  newCrownCustomCharacter, newLegendaryCustomCharacter } from '../../../public/js/battlesim/engines/legendary-kingdoms/character.js';
import { startLegendaryFight, legendaryPlayerAttack, legendarySkipAttack, legendaryEnemyAttack,
  legendaryAssignDamage, legendaryFlee, legendaryPlayerSpell, legendaryCanAct, legendaryDrinkPotion,
  legendaryTakeGuardWeapon, legendaryTommulReward } from '../../../public/js/battlesim/engines/legendary-kingdoms/combat.js';
import { startLegendaryNaval, legendaryNavalAttack, legendaryWarpWood } from '../../../public/js/battlesim/engines/legendary-kingdoms/naval.js';
import { startLegendaryArmy, legendaryArmyStep, legendaryArmyEffect } from '../../../public/js/battlesim/engines/legendary-kingdoms/army.js';
import { chooseLegendaryStartingSpells, learnLegendarySpell, forgetLegendarySpell, drainLegendarySpell,
  rechargeLegendarySpells, CROWN_STARTING_SPELLS, chooseCrownStartingSpells,
  learnCrownApprenticeSpell } from '../../../public/js/battlesim/engines/legendary-kingdoms/spells.js';
import { VALLEY_FIGHTS, startValleyFight, startValleyArmy, startValleyNaval } from '../../../public/js/battlesim/engines/legendary-kingdoms/valley.js';
import { CROWN_ROSTER } from '../../../public/js/battlesim/engines/legendary-kingdoms/crown-roster.js';

test('Valley locales have matching keys and placeholders and both lazy loaders register once', () => {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(bg).sort());
  const params=value=>[...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
  for(const key of Object.keys(en)){
    assert.ok(en[key]&&bg[key],key);assert.deepEqual(params(en[key]),params(bg[key]),key);
  }
  const read=file=>readFileSync(new URL('../../../'+file,import.meta.url),'utf8');
  for(const file of ['public/js/battlesim/loader.js','public/mobile/js/battlesim-dispatch.js']){
    const registered=read(file).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...registered.matchAll(/\b689\b/g)].length,1,file);
  }
  assert.equal([...read('server/db/xp.js').matchAll(/['"]sim689['"]/g)].length,1);
  assert.equal([...read('public/js/core/util.js').matchAll(/['"]sim689-overlay['"]/g)].length,1);
});

test('named profiles match the six printed starting skill and Health rows', () => {
  const expected = { jessica: [5,1,3,2,4,8], tiquon: [1,2,5,1,2,6], tasha: [3,5,1,3,3,8],
    amelia: [3,2,2,3,1,6], akihiro: [4,3,2,5,1,8], brash: [2,4,3,1,5,8] };
  for (const [id, values] of Object.entries(expected)) {
    const character = newValleyCharacter(id);
    assert.deepEqual([...Object.values(character.skills), character.health], values);
    assert.equal(character.spellcaster, ['tiquon', 'amelia'].includes(id));
    assert.equal(character.armed, false);
  }
  const first = newValleyCharacter('tasha');
  first.skills.stealth = 0;
  assert.equal(newValleyCharacter('tasha').skills.stealth, 5);
});

test('Crown profiles and custom limits stay separate from Valley defaults', () => {
  const expected = { jessica: [7,1,4,2,5,9], tiquon: [1,3,7,2,2,7], tasha: [4,7,1,4,3,9],
    amelia: [4,3,3,4,1,7], akihiro: [5,3,3,7,1,9], brash: [3,5,3,1,7,9] };
  for (const [id, values] of Object.entries(expected)) {
    const hero = newCrownCharacter(id);
    assert.deepEqual([...Object.values(hero.skills), hero.health], values);
    assert.equal(hero.maxHealth, hero.health);
    assert.equal(hero.spellcaster, ['tiquon', 'amelia'].includes(id));
  }
  const saved = newValleyCharacter('jessica');
  const before = structuredClone(saved);
  const crown = newCrownCharacter('jessica');
  crown.skills.fighting = 0;
  assert.deepEqual(saved, before);
  assert.equal(newCrownCharacter('jessica').skills.fighting, 7);
  const warrior = { fighting: 7, stealth: 3, lore: 3, survival: 3, charisma: 3 };
  const caster = { fighting: 1, stealth: 3, lore: 7, survival: 2, charisma: 2 };
  assert.equal(newCrownCustomCharacter('Warrior', warrior).health, 9);
  assert.equal(newCrownCustomCharacter('Mage', caster, true).health, 7);
  assert.throws(() => newLegendaryCustomCharacter('Warrior', warrior));
  assert.throws(() => newCrownCustomCharacter('Mage', caster));
  assert.throws(() => newCrownCustomCharacter('Warrior', { ...warrior, fighting: 8, charisma: 2 }));
  assert.throws(() => newCrownCustomCharacter('Mage', { ...caster, fighting: 0, charisma: 3 }, true));
  assert.throws(() => newCrownCharacter('__proto__'));
});

test('Crown starting spells and drained apprentice spells preserve Valley spell rules', () => {
  assert.deepEqual(CROWN_STARTING_SPELLS, ['armourOfHeaven', 'iceBolt', 'poisonStream',
    'soothingTouch', 'unfailingStrike', 'wolfSpirit', 'magicCabinet']);
  const hero = newCrownCharacter('tiquon');
  const spells = ['soothingTouch', 'iceBolt', 'wolfSpirit'];
  const selected = chooseCrownStartingSpells(hero, spells);
  assert.ok(selected.spells.every(entry => entry.charged));
  assert.equal(hero.spells.length, 0);
  assert.throws(() => chooseCrownStartingSpells(hero, ['animalSpeech', 'iceBolt', 'wolfSpirit']));
  assert.throws(() => chooseLegendaryStartingSpells(newValleyCharacter('tiquon'), spells));
  const learned = learnCrownApprenticeSpell(selected, 'magicCabinet');
  assert.equal(learned.spells.at(-1).charged, false);
  assert.equal(learnLegendarySpell(selected, 'magicCabinet').spells.at(-1).charged, true);
  assert.equal(selected.spells.length, 3);
  assert.throws(() => learnCrownApprenticeSpell(selected, 'animalSpeech'));
  assert.throws(() => learnCrownApprenticeSpell(selected, 'iceBolt'));
  const full = learnCrownApprenticeSpell(learnCrownApprenticeSpell(learned, 'poisonStream'), 'unfailingStrike');
  assert.equal(full.spells.length, 6);
  assert.throws(() => learnCrownApprenticeSpell(full, 'armourOfHeaven'));
});

test('Crown roster retains every printed row, nonnumeric attacks and automatic damage', () => {
  assert.equal(CROWN_ROSTER.length, 281);
  assert.equal(new Set(CROWN_ROSTER.map(enemy => enemy.section)).size, 85);
  assert.ok(Object.isFrozen(CROWN_ROSTER));
  const party = [newCrownCharacter('jessica')];
  const before = structuredClone(party);
  for (const enemy of CROWN_ROSTER) {
    assert.ok(Object.isFrozen(enemy));
    assert.ok(Number.isSafeInteger(enemy.automaticDamage) && enemy.automaticDamage >= 0);
    const fight = startLegendaryFight(party, [enemy]);
    assert.notEqual(fight.enemies[0], enemy);
    assert.equal(fight.enemies[0].health, enemy.health);
  }
  assert.deepEqual(party, before);
  const hag = CROWN_ROSTER.find(enemy => enemy.section === 1146);
  assert.equal(hag.health, 22);
  assert.equal(hag.automaticDamage, 1);
  const demon = CROWN_ROSTER.find(enemy => enemy.section === 626);
  assert.equal(demon.defence, 7);
  assert.equal(demon.automaticDamage, 3);
  const body = CROWN_ROSTER.find(enemy => enemy.name === 'Chimera Body');
  assert.equal(body.attack, null);
  assert.equal(body.attackType, 'none');
  const skeleton = CROWN_ROSTER.find(enemy => enemy.section === 381 && enemy.name === 'Skeleton');
  assert.equal(skeleton.attack, null);
  assert.equal(skeleton.sourceAttack, '- (4+)');
  assert.equal(skeleton.attackType, 'special');
});

test('printed automatic damage applies even on misses and allows ordinary armour saves', () => {
  const party = [newCrownCharacter('jessica')];
  party[0].armour = 2;
  const enemy = { name: 'Auto damage', attack: 2, threshold: 4, attackType: 'dice',
    defence: 4, health: 20, automaticDamage: 2 };
  const original = startLegendaryFight(party, [enemy], { partyFirst: false });
  const rolled = legendaryEnemyAttack(original, () => 1);
  assert.equal(rolled.pending.hits, 2);
  assert.equal(rolled.log.at(-1).automaticDamage, 2);
  assert.equal(legendaryAssignDamage(rolled, 0, () => 4).party[0].health, 9);
  assert.equal(legendaryAssignDamage(rolled, 0, () => 1).party[0].health, 7);
  assert.equal(original.pending, null);
  assert.equal(party[0].health, 9);
  assert.throws(() => startLegendaryFight(party, [{ ...enemy, automaticDamage: -1 }]));
  assert.throws(() => startLegendaryFight(party, [{ ...enemy, automaticDamage: 0.5 }]));
});

test('recruited Skullcracker uses section 245 values and his permanent ordinary club', () => {
  const hero=newValleySkullcracker();
  assert.deepEqual(Object.values(hero.skills),[8,1,1,3,2]);
  assert.equal(hero.health,12);
  assert.equal(hero.maxHealth,12);
  assert.equal(hero.armed,true);
  assert.equal(hero.weaponBonus,0);
  assert.equal(legendaryAttack(hero,4,{},()=>4).successes,8);
});

test('team checks combine two heroes, cap twenty dice, and apply focus per hero without mutation', () => {
  const first = newValleyCharacter('tiquon'), second = newValleyCharacter('brash');
  first.skills.lore = 14;
  second.skills.lore = 10;
  const before = structuredClone([first, second]);
  assert.equal(legendarySkillCheck([first, second], 'lore', 6, 5, {}, () => 5).dice.length, 20);
  const focused = legendarySkillCheck([first, second], 'lore', 6, 5, { focus: 1 }, () => 5);
  assert.equal(focused.dice.length, 14);
  assert.equal(focused.successes, 14);
  assert.equal(focused.passed, true);
  assert.deepEqual([first, second], before);
  assert.throws(() => legendarySkillCheck([first, first], 'lore', 4, 1));
  assert.throws(() => legendarySkillCheck([first, second], 'lore', 4, 1, { focus: 3 }));
});

test('combat attacks are not capped at twenty and monk restrictions differ from being unarmed', () => {
  const character = newValleyCharacter('akihiro');
  character.skills.fighting = 25;
  character.weaponBonus = 3;
  character.armed = true;
  assert.equal(legendaryAttack(character, 4, {}, () => 4).successes, 28);
  assert.equal(legendaryAttack(character, 4, { excludeWeapon: true, unarmed: false }, () => 4).successes, 25);
  assert.equal(legendaryAttack(character, 4, { excludeWeapon: true, unarmed: true }, () => 4).successes, 24);
  assert.equal(legendaryAttack(character, 6, { focus: 1 }, () => 5).successes, 23);
  assert.equal(character.skills.fighting, 25);
  character.bonuses.fighting = 1;
  assert.equal(legendaryAttack(character, 4, {}, () => 4).successes, 28);
  assert.equal(legendaryAttack(character, 4, { excludeWeapon: true, unarmed: false }, () => 4).successes, 26);
});

test('armour rolls the lesser of armour and incoming hits; environmental damage bypasses it', () => {
  const character = newValleyCharacter('jessica');
  character.armour = 3;
  const results = [4, 5, 4];
  const hit = legendaryDamage(character, 4, {}, () => results.shift());
  assert.equal(hit.prevented, 3);
  assert.equal(hit.lost, 1);
  assert.equal(hit.character.health, 7);
  assert.equal(character.health, 8);
  assert.equal(legendaryDamage(character, 2, {}, () => 1).dice.length, 2);
  assert.equal(legendaryDamage(character, 4, { armour: false }, () => { throw Error('No armour roll'); }).lost, 4);
});

test('explicit nonfatal floors do not make ordinary damage or healing resurrect heroes', () => {
  const character = newValleyCharacter('amelia');
  const safe = legendaryDamage(character, 20, { armour: false, floor: 1 });
  assert.equal(safe.character.health, 1);
  const fatal = legendaryDamage(character, 20, { armour: false });
  assert.equal(fatal.dead, true);
  assert.throws(() => legendaryHeal(fatal.character, 5));
  assert.equal(legendaryHeal(safe.character, 20).health, 6);
});

test('zero pools and automatic successes work while malformed values and die results are rejected', () => {
  const character = newValleyCharacter('brash');
  character.skills.fighting = 0;
  assert.equal(legendaryAttack(character, 4).successes, 0);
  assert.equal(legendarySkillCheck([character], 'fighting', 5, 1, { automatic: 1 }).passed, true);
  assert.throws(() => legendaryPool(1, 4, () => 0));
  assert.throws(() => legendaryPool(1, 4, () => 7));
  assert.throws(() => legendaryPool(1.5, 4));
  character.health = 0;
  assert.throws(() => legendarySkillCheck([character], 'fighting', 4, 1));
});

const opponent = (name = 'Orc', health = 10) => ({ name, attack: 4, threshold: 4, defence: 4, health });

test('party chooses attack order and targets, then enemies attack in printed order', () => {
  const party = ['jessica', 'tasha'].map(newValleyCharacter);
  party.forEach(hero => { hero.armed = true; });
  const original = startLegendaryFight(party, [opponent('First'), opponent('Second')], { win: 478 });
  let fight = legendaryPlayerAttack(original, 1, 1, {}, () => 4);
  assert.equal(fight.enemies[1].health, 7);
  assert.equal(fight.phase, 'player');
  assert.throws(() => legendaryPlayerAttack(fight, 1, 0));
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 4);
  assert.equal(fight.phase, 'enemy');
  fight = legendaryEnemyAttack(fight, () => 4);
  assert.equal(fight.pending.enemyIndex, 0);
  assert.throws(() => legendaryEnemyAttack(fight));
  fight = legendaryAssignDamage(fight, 1, () => 1);
  assert.equal(fight.party[1].health, 4);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.round, 2);
  assert.equal(original.enemies[1].health, 10);
  assert.equal(party[1].health, 8);
});

test('ambush opens with enemies and partial-party defeat leaves excluded members alive', () => {
  const party = ['akihiro', 'amelia', 'brash'].map(newValleyCharacter);
  let fight = startLegendaryFight(party, [opponent()], { partyFirst: false, loss: 502 }, [1]);
  assert.equal(fight.phase, 'enemy');
  fight = legendaryEnemyAttack(fight, () => 4);
  assert.throws(() => legendaryAssignDamage(fight, 0));
  fight = legendaryAssignDamage(fight, 1, () => 1);
  assert.equal(fight.party[1].health, 2);
  assert.equal(fight.round, 1);
  fight = legendarySkipAttack(fight, 1);
  assert.equal(fight.round, 2);
  fight = legendaryEnemyAttack(fight, () => 4);
  fight = legendaryAssignDamage(fight, 1, () => 1);
  assert.equal(fight.status, 'lost');
  assert.equal(fight.destination, 502);
  assert.equal(fight.party[0].health, 8);
  assert.equal(fight.party[2].health, 8);
});

test('defeated enemies never attack and a final kill ends the fight immediately', () => {
  const party = ['jessica', 'tasha'].map(newValleyCharacter);
  party.forEach(hero => { hero.armed = true; });
  let fight = startLegendaryFight(party, [opponent('First', 1), opponent('Second', 2)], { win: 478 });
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 4);
  fight = legendarySkipAttack(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.log.at(-1).enemyIndex, 1);
  fight = legendaryPlayerAttack(fight, 1, 1, {}, () => 4);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 478);
  assert.equal(fight.phase, 'ended');
  assert.throws(() => legendaryEnemyAttack(fight));
});

test('flee is explicit, player-turn-start only and cannot bypass an unresolved hit', () => {
  const original = startLegendaryFight([newValleyCharacter('jessica')], [opponent()], { flee: 515 });
  assert.equal(legendaryFlee(original).destination, 515);
  assert.equal(original.status, 'active');
  const acted = legendarySkipAttack(original, 0);
  assert.throws(() => legendaryFlee(acted));
  const pending = legendaryEnemyAttack(acted, () => 6);
  assert.throws(() => legendaryFlee(pending));
  assert.throws(() => legendaryFlee(startLegendaryFight([newValleyCharacter('jessica')], [opponent()])));
});

test('naval battles retain current ship Health and apply canoe penalty temporarily', () => {
  const ship = { name: 'Cog', fighting: 4, health: 3, cargo: 2 };
  let fight = startLegendaryNaval(ship, { name: 'War Canoes', fighting: 3, health: 10 }, { fightingPenalty: 1, loss: 52 });
  fight = legendaryNavalAttack(fight, () => 4);
  assert.equal(fight.enemy.health, 7);
  assert.equal(fight.ship.fighting, 4);
  fight = legendaryNavalAttack(fight, () => 4);
  assert.equal(fight.status, 'lost');
  assert.equal(fight.destination, 52);
  assert.equal(ship.health, 3);
  assert.equal(ship.fighting, 4);
  assert.equal(ship.cargo, 2);
});

test('sea spells precede ship attacks, once per turn, and can finish the battle', () => {
  let fight = startLegendaryNaval({ name: 'Cog', fighting: 4, health: 7 }, { name: 'Hulk', fighting: 3, health: 5 }, { win: 796 });
  fight = legendaryWarpWood(fight);
  assert.equal(fight.enemy.health, 2);
  assert.throws(() => legendaryWarpWood(fight));
  fight = legendaryNavalAttack(fight, () => 4);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 796);
  assert.throws(() => legendaryNavalAttack(fight));
  fight = startLegendaryNaval({ name: 'Cog', fighting: 4, health: 7 }, { name: 'Hulk', fighting: 3, health: 5 }, { shipFirst: false });
  assert.throws(() => legendaryWarpWood(fight));
  fight = legendaryNavalAttack(fight, () => 1);
  assert.equal(fight.round, 1);
  fight = legendaryWarpWood(fight);
  fight = legendaryNavalAttack(fight, () => 1);
  assert.equal(fight.round, 2);
});

const troop = (name, strength = 2, morale = 2) => ({ name, strength, morale });

test('army ties are harmless; failed morale immediately promotes support without resetting stats', () => {
  const front = troop('Front', 2, 1), support = troop('Support', 3, 2);
  let fight = startLegendaryArmy([[front, support], [troop('Centre')], [troop('Right')]],
    [[troop('Enemy', 2, 3)], [troop('Enemy centre')], [troop('Enemy right')]]);
  fight = legendaryArmyStep(fight, () => 3);
  assert.equal(fight.player[0][0].morale, 1);
  assert.equal(fight.zone, 1);
  fight = legendaryArmyStep(fight, () => 3);
  fight = legendaryArmyStep(fight, () => 3);
  const dice = [6, 1, 6];
  fight = legendaryArmyStep(fight, () => dice.shift());
  assert.equal(fight.player[0][0].name, 'Support');
  assert.equal(fight.player[0][0].morale, 2);
  assert.equal(fight.routed.player[0].name, 'Front');
  assert.equal(front.morale, 1);
});

test('army passed morale loses one point; controlling two zones wins immediately and routes remaining foes', () => {
  let fight = startLegendaryArmy([[troop('Left', 2, 4)], [troop('Centre', 6, 4)], [troop('Right', 6, 4)]],
    [[troop('Enemy left', 4, 4)], [troop('Enemy centre', 0, 0)], [troop('Enemy right', 0, 0)]], { win: 214 });
  const first = [6, 1, 1];
  fight = legendaryArmyStep(fight, () => first.shift());
  assert.equal(fight.player[0][0].morale, 3);
  fight = legendaryArmyStep(fight, () => 6);
  assert.equal(fight.status, 'active');
  fight = legendaryArmyStep(fight, () => 6);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 214);
  assert.equal(fight.routed.enemy.length, 3);
  assert.equal(fight.player[0][0].morale, 3);
});

test('army effects target current front units and routing preserves live support values', () => {
  const own = [[troop('Front', 4, 3), troop('Support', 2, 1)], [troop('Centre')], [troop('Right')]];
  let fight = startLegendaryArmy(own, [[troop('Left')], [troop('Centre')], [troop('Right')]]);
  fight = legendaryArmyEffect(fight, 'player', 0, 'enfeeblement');
  fight = legendaryArmyEffect(fight, 'player', 0, 'clingingDread');
  assert.equal(fight.player[0][0].strength, 3);
  assert.equal(fight.player[0][0].morale, 2);
  fight = legendaryArmyEffect(fight, 'player', 0, 'rout', () => 6);
  assert.equal(fight.player[0][0].name, 'Support');
  assert.equal(fight.player[0][0].morale, 1);
  assert.equal(own[0][0].strength, 4);
  assert.throws(() => startLegendaryArmy([[own[0][0], own[0][0]], [], []], [[troop('Enemy')], [], []]));
});

test('spellcasters choose three different starting spells and learn at most six', () => {
  const original = newValleyCharacter('tiquon');
  let character = chooseLegendaryStartingSpells(original, ['iceBolt', 'poisonStream', 'wolfSpirit']);
  assert.equal(original.spells.length, 0);
  assert.throws(() => chooseLegendaryStartingSpells(character, ['iceBolt', 'animalSpeech', 'armourOfHeaven']));
  assert.throws(() => chooseLegendaryStartingSpells(newValleyCharacter('amelia'), ['iceBolt', 'iceBolt', 'wolfSpirit']));
  assert.throws(() => chooseLegendaryStartingSpells(newValleyCharacter('amelia'), ['iceBolt', 'wisdom', 'wolfSpirit']));
  assert.throws(() => learnLegendarySpell(newValleyCharacter('jessica'), 'wisdom'));
  character = learnLegendarySpell(character, 'wisdom');
  character = learnLegendarySpell(character, 'clingingDread');
  character = learnLegendarySpell(character, 'warpWood');
  assert.throws(() => learnLegendarySpell(character, 'iceBolt'));
  assert.throws(() => learnLegendarySpell(character, 'sandstorm'));
  character = forgetLegendarySpell(character, 'wisdom');
  character = learnLegendarySpell(character, 'sandstorm');
  assert.equal(character.spells.length, 6);
});

test('casting drains a known charged spell and enforces adventure, combat, army and naval scopes', () => {
  const original = chooseLegendaryStartingSpells(newValleyCharacter('amelia'), ['iceBolt', 'poisonStream', 'wolfSpirit']);
  const cast = drainLegendarySpell(original, 'iceBolt', 'combat');
  assert.equal(cast.spells.find(entry => entry.id === 'iceBolt').charged, false);
  assert.equal(original.spells[0].charged, true);
  assert.throws(() => drainLegendarySpell(cast, 'iceBolt', 'combat'));
  assert.throws(() => drainLegendarySpell(original, 'wolfSpirit', 'combat'));
  const expanded = learnLegendarySpell(learnLegendarySpell(original, 'warpWood'), 'clingingDread');
  assert.throws(() => drainLegendarySpell(expanded, 'warpWood', 'combat'));
  assert.throws(() => drainLegendarySpell(expanded, 'clingingDread', 'combat'));
  assert.equal(drainLegendarySpell(expanded, 'warpWood', 'naval').spells.find(entry => entry.id === 'warpWood').charged, false);
  assert.equal(drainLegendarySpell(expanded, 'clingingDread', 'army').spells.find(entry => entry.id === 'clingingDread').charged, false);
});

test('recharge uses story silver, requires an allowed location and cannot overspend or charge twice', () => {
  const character = drainLegendarySpell(chooseLegendaryStartingSpells(newValleyCharacter('tiquon'),
    ['iceBolt', 'wolfSpirit', 'magicCabinet']), 'magicCabinet', 'adventure');
  assert.throws(() => rechargeLegendarySpells(character, ['magicCabinet'], 200));
  assert.throws(() => rechargeLegendarySpells(character, ['magicCabinet'], 99, { allowed: true }));
  assert.throws(() => rechargeLegendarySpells(character, ['iceBolt'], 200, { allowed: true }));
  const charged = rechargeLegendarySpells(character, ['magicCabinet'], 125, { allowed: true });
  assert.equal(charged.silver, 25);
  assert.equal(charged.cost, 100);
  assert.equal(character.spells.find(entry => entry.id === 'magicCabinet').charged, false);
  assert.equal(rechargeLegendarySpells(character, ['magicCabinet'], 0, { allowed: true, free: true }).silver, 0);
});

test('combat spells replace attacks, use printed dice and targets, and preserve character equipment', () => {
  const caster = chooseLegendaryStartingSpells(newValleyCharacter('tiquon'), ['iceBolt', 'poisonStream', 'armourOfHeaven']);
  let fight = startLegendaryFight([caster, newValleyCharacter('jessica')], [opponent('First', 20), opponent('Second', 20)]);
  assert.throws(() => legendaryPlayerSpell(fight, 0, 'poisonStream', [0, 0]));
  assert.throws(() => legendaryPlayerSpell(fight, 0, 'poisonStream', [0]));
  const before = structuredClone(fight);
  fight = legendaryPlayerSpell(fight, 0, 'poisonStream', [0, 1], () => 4);
  assert.equal(fight.enemies[0].health, 15);
  assert.equal(fight.enemies[1].health, 15);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0));
  assert.equal(before.party[0].spells[1].charged, true);
  fight = startLegendaryFight([caster, newValleyCharacter('jessica')], [opponent('Orc', 20)]);
  fight = legendaryPlayerSpell(fight, 0, 'armourOfHeaven', [1]);
  fight = legendarySkipAttack(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 4);
  fight = legendaryAssignDamage(fight, 1, () => 4);
  assert.equal(fight.party[1].health, 7);
  assert.equal(fight.party[1].armour, 0);
  assert.equal(fight.armourBonuses[1], 3);
  const healer = learnLegendarySpell(caster, 'soothingTouch');
  healer.health = 1;
  fight = legendaryPlayerSpell(startLegendaryFight([healer], [opponent()]), 0, 'soothingTouch', [0]);
  assert.equal(fight.party[0].health, 6);
  assert.equal(fight.party[0].spells.find(entry => entry.id === 'soothingTouch').charged, false);
  const dazzler = learnLegendarySpell(caster, 'dazingLights');
  fight = legendaryPlayerSpell(startLegendaryFight([dazzler], [opponent()]), 0, 'dazingLights');
  fight = legendaryEnemyAttack(fight, () => 4);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.enemyPenalty, 0);
  assert.equal(fight.party[0].health, 6);
});

test('timed interventions stop after complete rounds for both initiatives, while early victory wins', () => {
  for (const partyFirst of [true, false]) {
    let fight = startLegendaryFight([newValleyCharacter('akihiro')], [opponent('Monk Statue', 30)],
      { partyFirst, stopRound: 2, stop: 619, win: 619 });
    for (let i = 0; i < 2; i++) {
      if (!partyFirst) fight = legendaryEnemyAttack(fight, () => 1);
      fight = legendarySkipAttack(fight, 0);
      if (partyFirst) fight = legendaryEnemyAttack(fight, () => 1);
    }
    assert.equal(fight.status, 'stopped');
    assert.equal(fight.destination, 619);
    assert.equal(fight.party[0].health, 8);
    assert.equal(fight.round, 2);
  }
  const hero = newValleyCharacter('jessica');
  const victory = legendaryPlayerAttack(startLegendaryFight([hero], [opponent('Bronzeguard', 1)],
    { stopRound: 2, stop: 55, win: 75 }), 0, 0, {}, () => 6);
  assert.equal(victory.status, 'won');
  assert.equal(victory.destination, 75);
});

test('explicit nonfatal monk loss restores one Health without touching waiting heroes', () => {
  const party = ['akihiro', 'amelia'].map(newValleyCharacter);
  party[0].health = 1;
  let fight = startLegendaryFight(party, [opponent()], { loss: 596, nonfatalLossHealth: 1 }, [0]);
  fight = legendarySkipAttack(fight, 0);
  fight = legendaryEnemyAttack(fight, () => 4);
  fight = legendaryAssignDamage(fight, 0, () => 1);
  assert.equal(fight.status, 'lost');
  assert.equal(fight.party[0].health, 1);
  assert.equal(fight.party[1].health, 6);
  assert.equal(fight.destination, 596);
});

test('Valley inventory covers all printed rows and code exclusions retain support and current Morale', () => {
  assert.equal(VALLEY_FIGHTS.length, 75);
  assert.equal(VALLEY_FIGHTS.reduce((count,fight)=>count+fight.enemies.length,0),185);
  const own = [[troop('Left',3,1)],[troop('Centre',3,2)],[troop('Right',3,3)]];
  const first = startValleyArmy(own,162,['A40','A95','A96']);
  assert.equal(first.enemy.flat().length,3);
  assert.equal(first.rules.descantos,false);
  assert.equal(first.player[0][0].morale,1);
  assert.equal(startValleyArmy(own,316).rules.descantos,false);
  assert.equal(startValleyArmy(own,376,['A8']).enemy[1][0].name,'Peasant Levies');
  assert.equal(startValleyNaval({name:'Cog',fighting:4,health:3},679).ship.health,3);
});

test('Descantos casts his three source spells once at successive round starts, not after every zone', () => {
  const own = [[troop('Left',10,10)],[troop('Centre',10,10)],[troop('Right',10,10)]];
  const enemy = [[troop('Left',0,10)],[troop('Centre',0,10)],[troop('Right',0,10)]];
  let fight = startLegendaryArmy(own,enemy,{descantos:true});
  fight = legendaryArmyStep(fight,()=>1);
  assert.equal(fight.player[1][0].strength,9);
  for (let i=0;i<3;i++) fight=legendaryArmyStep(fight,()=>1);
  assert.equal(fight.round,2);
  assert.equal(fight.player[0][0].morale,9);
  for (let i=0;i<3;i++) fight=legendaryArmyStep(fight,()=>1);
  assert.equal(fight.round,3);
  assert.equal(fight.player[0][0].morale,8);
  for (let i=0;i<5;i++) fight=legendaryArmyStep(fight,()=>1);
  assert.equal(fight.log.filter(entry=>entry.type==='descantos').length,3);
  assert.equal(own[0][0].morale,10);
  assert.equal(own[1][0].strength,10);
});

test('Valley wrappers enforce named duels and apply temporary source modifiers without editing roster', () => {
  const party=['akihiro','jessica','amelia','tasha'].map(newValleyCharacter);
  assert.deepEqual(startValleyFight(party,386).participants,[0]);
  assert.deepEqual(startValleyFight(party,111).participants,[1]);
  assert.throws(()=>startValleyFight(party,111,{participants:[0]}));
  assert.throws(()=>startValleyFight(party,744));
  assert.equal(startValleyFight(party,500,{enlightened:true}).enemies[0].defence,4);
  assert.equal(startValleyFight(party,500).enemies[0].defence,5);
  assert.equal(startValleyFight(party,497,{hygliph:true}).enemies[0].threshold,6);
  assert.equal(startValleyFight(party,604).rules.flee,undefined);
  assert.equal(startValleyFight(party,604,{shipInMordain:true}).rules.flee,851);
  assert.throws(()=>startValleyArmy([[troop('Left')],[troop('Centre')],[troop('Right')]],'162'));
});

test('source hazards resolve actual Health loss, not fabricated enemy attack dice', () => {
  const hero=newValleyCharacter('jessica');
  let fight=startValleyFight([hero],501);
  assert.equal(fight.enemies[0].attackType,'none');
  assert.throws(()=>legendarySkipAttack(fight,0));
  fight=legendaryPlayerAttack(fight,0,0,{},()=>1);
  assert.equal(fight.party[0].health,7);
  fight=legendaryEnemyAttack(fight);
  assert.equal(fight.party[0].health,7);
  assert.equal(fight.round,2);
  fight=startValleyFight([hero],518);
  fight=legendaryPlayerAttack(fight,0,0,{},()=>1);
  fight=legendaryEnemyAttack(fight);
  assert.equal(fight.party[0].health,7);
  fight=startValleyFight([hero],20);
  fight=legendaryPlayerAttack(fight,0,0,{},()=>1);
  fight=legendaryEnemyAttack(fight,()=>1);
  assert.equal(fight.party[0].health,7);
  assert.equal(fight.enemies[0].health,15);
  fight=startValleyFight([hero],648);
  fight=legendaryPlayerAttack(fight,0,0,{},()=>1);
  fight=legendaryEnemyAttack(fight,()=>1);
  assert.equal(fight.status,'failed');
  assert.equal(fight.destination,254);
  assert.equal(fight.party[0].health,8);
});

const sturdyParty = () => ['jessica','tasha','amelia','akihiro'].map(id => {
  const hero = newValleyCharacter(id);
  hero.health = hero.maxHealth = 30;
  return hero;
});
function skipTurn(input) {
  let fight = input;
  for (let index=0;index<fight.party.length;index++) if (legendaryCanAct(fight,index)) fight=legendarySkipAttack(fight,index);
  return fight;
}

test('double attacks are separate rolls and require different recipients; A13 removes the full Malronac name', () => {
  let fight=skipTurn(startValleyFight(sturdyParty(),733));
  fight=legendaryEnemyAttack(fight,()=>3);
  fight=legendaryAssignDamage(fight,0);
  assert.equal(fight.phase,'enemy');
  fight=legendaryEnemyAttack(fight,()=>3);
  assert.throws(()=>legendaryAssignDamage(fight,0));
  fight=legendaryAssignDamage(fight,1);
  assert.equal(fight.round,2);
  assert.equal(fight.party[0].health,24);
  assert.equal(fight.party[1].health,24);
  const excluded=startValleyFight(sturdyParty(),214,{codes:['A8','A13']});
  assert.equal(excluded.enemies.length,3);
  assert.ok(excluded.enemies.every(enemy=>!/Malronac|Bronzeguard/.test(enemy.name)));
});

test('Imopposh has two ten-die attacks, then thirteen dice, then a three-die attack on every living hero', () => {
  let fight=skipTurn(startValleyFight(sturdyParty(),563));
  for (let i=0;i<2;i++) {
    fight=legendaryEnemyAttack(fight,()=>4);
    assert.equal(fight.log.at(-1).dice.length,10);
    fight=legendaryAssignDamage(fight,i);
  }
  fight=skipTurn(fight);
  fight=legendaryEnemyAttack(fight,()=>4);
  assert.equal(fight.log.at(-1).dice.length,13);
  fight=legendaryAssignDamage(fight,0);
  fight=skipTurn(fight);
  for (let i=0;i<4;i++) {
    fight=legendaryEnemyAttack(fight,()=>4);
    assert.equal(fight.log.at(-1).dice.length,3);
    assert.equal(fight.pending.forcedMember,i);
    assert.throws(()=>legendaryAssignDamage(fight,(i+1)%4));
    fight=legendaryAssignDamage(fight,i);
  }
  assert.equal(fight.round,4);
});

test('Unbraaki steals actual lost Health beyond his starting value; monkeys resolve their printed spell plans', () => {
  let fight=skipTurn(startValleyFight(sturdyParty(),564));
  fight=legendaryEnemyAttack(fight,()=>3);
  fight=legendaryAssignDamage(fight,0);
  assert.equal(fight.enemies[0].health,19);
  const dice=[5,...Array(5).fill(4)];
  fight=legendaryEnemyAttack(fight,()=>dice.shift());
  assert.equal(fight.log.at(-1).dice.length,5);
  fight=legendaryAssignDamage(fight,1);
  fight=legendaryEnemyAttack(fight,()=>4);
  fight=legendaryAssignDamage(fight,1);
  assert.equal(fight.party[1].health,20);
  assert.equal(fight.enemyCursor,2);
});

test('archers hit two different heroes without armour; delayed ogres cannot act or be targeted before round three', () => {
  const party=sturdyParty();
  party.forEach(hero=>{hero.armour=10;});
  let fight=skipTurn(startValleyFight(party,264));
  fight=legendaryEnemyAttack(fight,()=>1);
  fight=legendaryEnemyAttack(fight);
  fight=legendaryAssignDamage(fight,0,()=>{throw Error('No armour');});
  fight=legendaryEnemyAttack(fight);
  assert.throws(()=>legendaryAssignDamage(fight,0));
  fight=legendaryAssignDamage(fight,1,()=>{throw Error('No armour');});
  assert.equal(fight.party[0].health,28);
  assert.equal(fight.party[1].health,28);
  fight=startValleyFight(sturdyParty(),117);
  assert.throws(()=>legendaryPlayerAttack(fight,0,1));
  for (let i=0;i<2;i++) {fight=skipTurn(fight);fight=legendaryEnemyAttack(fight,()=>1);}
  assert.equal(fight.round,3);
  assert.doesNotThrow(()=>legendaryPlayerAttack(fight,0,1,{},()=>1));
});

test('Fastilon stuns the first damager next round and advances spells only on undamaged turns', () => {
  let fight=startValleyFight(sturdyParty(),702);
  fight=legendaryPlayerAttack(fight,0,0,{},()=>6);
  fight=skipTurn(fight);
  fight=legendaryEnemyAttack(fight,()=>1);
  fight=legendaryEnemyAttack(fight,()=>1);
  assert.equal(fight.fastilonSpell,0);
  assert.equal(legendaryCanAct(fight,0),false);
  assert.throws(()=>legendaryPlayerAttack(fight,0,0));
  fight=skipTurn(fight);
  fight=legendaryEnemyAttack(fight);
  fight=legendaryAssignDamage(fight,1);
  assert.equal(fight.fastilonSpell,1);
  assert.equal(legendaryCanAct(fight,0),true);
  fight=skipTurn(fight);
  for (let i=0;i<2;i++) {fight=legendaryEnemyAttack(fight);fight=legendaryAssignDamage(fight,i);}
  assert.equal(fight.fastilonSpell,2);
  fight=skipTurn(fight);
  fight=legendaryEnemyAttack(fight);
  assert.equal(fight.fastilonSpell,3);
  assert.equal(fight.enemies[0].health,40);
});

test('zealot healer can exceed starting Health but never resurrects defeated zealots', () => {
  let fight=skipTurn(startValleyFight(sturdyParty(),28));
  for (let i=0;i<4;i++) fight=legendaryEnemyAttack(fight,()=>1);
  assert.deepEqual(fight.enemies.map(enemy=>enemy.health),[12,13,12,15]);
  fight.enemies.slice(0,3).forEach(enemy=>{enemy.health=0;});
  fight=skipTurn(fight);
  fight=legendaryEnemyAttack(fight,()=>4);
  assert.equal(fight.pending.hits,3);
  assert.deepEqual(fight.enemies.slice(0,3).map(enemy=>enemy.health),[0,0,0]);
});

test('skeleton escort adds Fighting and intercepts a whole combat hit without armour or overflow', () => {
  const party=sturdyParty();
  party[0].skeletonHealth=6;
  const original=startLegendaryFight(party,[{...opponent('Orc',30),attack:9,threshold:3}]);
  assert.equal(legendaryAttack(original.party[0],4,{},()=>4).dice.length,6);
  let fight=skipTurn(original);
  fight=legendaryEnemyAttack(fight,()=>3);
  fight=legendaryAssignDamage(fight,0,()=>{throw Error('Skeleton has no armour');});
  assert.equal(fight.party[0].health,30);
  assert.equal(fight.party[0].skeletonHealth,0);
  assert.equal(original.party[0].skeletonHealth,6);
  assert.equal(legendaryAttack(fight.party[0],4,{},()=>4).dice.length,4);
});

test('invulnerability consumes the next successful attack once and is allowed at either initiative round start', () => {
  for (const partyFirst of [true,false]) {
    const party=sturdyParty();
    party[0].invulnerabilityPotions=2;
    let fight=startLegendaryFight(party,[opponent('Orc',50)],{partyFirst});
    fight=legendaryDrinkPotion(fight,0,'invulnerability');
    if (partyFirst) fight=skipTurn(fight);
    fight=legendaryEnemyAttack(fight,()=>4);
    fight=legendaryAssignDamage(fight,0,()=>{throw Error('Potion ignores the hit');});
    assert.equal(fight.party[0].health,30);
    assert.equal(fight.party[0].invulnerable,false);
    if (!partyFirst) fight=skipTurn(fight);
    assert.equal(fight.round,2);
    assert.doesNotThrow(()=>legendaryDrinkPotion(fight,0,'invulnerability'));
    assert.equal(party[0].invulnerabilityPotions,2);
  }
  const party=sturdyParty();party[0].invulnerabilityPotions=1;
  let fight=startValleyFight(party,2);
  fight=legendaryDrinkPotion(fight,0,'invulnerability');
  const protectedStart=fight;
  fight=legendarySkipAttack(fight,0);
  assert.throws(()=>legendaryDrinkPotion(fight,1,'invulnerability'));
  assert.equal(legendaryFlee(protectedStart).party[0].invulnerable,false);
});

test('cursed-member fights derive live stats and enforce nonfatal restrictions without resetting others', () => {
  const party=sturdyParty();
  party[0].health=2;
  party[0].armed=true;
  party[0].weaponBonus=3;
  let fight=startValleyFight(party,771,{cursedMember:0,knockout:true});
  assert.equal(fight.enemies[0].attack,8);
  assert.deepEqual(fight.participants,[1,2,3]);
  fight.party[2]=learnLegendarySpell(chooseLegendaryStartingSpells(fight.party[2],['iceBolt','poisonStream','armourOfHeaven']),'soothingTouch');
  assert.throws(()=>legendaryPlayerSpell(fight,2,'iceBolt',[0]));
  fight=legendaryPlayerAttack(fight,3,0,{},()=>4);
  assert.equal(fight.status,'won');
  assert.equal(fight.destination,850);
  assert.equal(fight.party[0].health,2);
  assert.equal(party[0].health,2);
  assert.equal(fight.party[1].health,30);
  const fatal=legendaryPlayerAttack(startValleyFight(party,771,{cursedMember:0}),3,0,{},()=>4);
  assert.equal(fatal.destination,267);
  assert.equal(fatal.party[0].health,0);
});

test('opening and precombat spells do not consume normal actions, while printed limits still apply', () => {
  const caster=chooseLegendaryStartingSpells(newValleyCharacter('tiquon'),['iceBolt','armourOfHeaven','unfailingStrike']);
  let fight=startValleyFight([caster,newValleyCharacter('jessica')],297);
  fight=legendaryPlayerSpell(fight,0,'armourOfHeaven',[1],undefined,{opening:true});
  assert.equal(legendaryCanAct(fight,0),true);
  assert.throws(()=>legendaryPlayerSpell(fight,0,'iceBolt',[0],()=>1,{opening:true}));
  fight=legendaryPlayerSpell(fight,0,'iceBolt',[0],()=>1);
  assert.equal(legendaryCanAct(fight,0),false);
  fight=startValleyFight([caster],306);
  fight=legendaryPlayerSpell(fight,0,'iceBolt',[0],()=>1,{precombat:true});
  fight=legendaryPlayerSpell(fight,0,'unfailingStrike',[0],undefined,{precombat:true});
  assert.equal(legendaryCanAct(fight,0),true);
  assert.equal(fight.roundStarted,false);
});

test('stealth opening strikes target only their hero; slave assistance excludes the leader; guard swords can be looted', () => {
  const party=sturdyParty();
  let fight=startValleyFight(party,2,{stealthHero:1,stealthOutcome:'failure'});
  fight=legendaryEnemyAttack(fight,()=>4);
  assert.throws(()=>legendaryAssignDamage(fight,0));
  fight=legendaryAssignDamage(fight,1);
  assert.equal(fight.phase,'player');
  assert.equal(fight.round,1);
  assert.equal(fight.party[1].health,24);
  fight=startValleyFight(party,213,{slaveDamage:2});
  const before=fight.enemies.map(enemy=>enemy.health);
  fight=skipTurn(fight);
  assert.deepEqual(fight.enemies.map(enemy=>enemy.health),before.map((hp,i)=>i===5?hp:hp-2));
  fight=startValleyFight(party,406,{participants:[0,1]});
  fight.enemies[0].health=1;
  fight=legendaryPlayerAttack(fight,0,0,{},()=>4);
  fight=legendaryTakeGuardWeapon(fight,1);
  assert.throws(()=>legendaryTakeGuardWeapon(fight,0));
  fight.enemies[1].health=1;
  fight=legendaryPlayerAttack(fight,1,1,{},()=>4);
  assert.equal(fight.status,'won');
  assert.equal(fight.party[1].weaponBonus,1);
  assert.equal(fight.party[1].armed,true);
  fight=legendaryTakeGuardWeapon(fight,0);
  assert.equal(fight.party[0].weaponBonus,1);
  assert.equal(party[0].weaponBonus,0);
});

test('Naga gets its printed escape attack before survivors flee, not after instant escape', () => {
  let fight=legendaryFlee(startValleyFight(sturdyParty(),580));
  assert.equal(fight.phase,'enemy');
  assert.equal(fight.status,'active');
  fight=legendaryEnemyAttack(fight,()=>3);
  fight=legendaryAssignDamage(fight,0);
  assert.equal(fight.party[0].health,25);
  assert.equal(fight.status,'fled');
  assert.equal(fight.destination,395);
  const party=[newValleyCharacter('jessica')];party[0].health=1;
  fight=legendaryFlee(startValleyFight(party,580));
  fight=legendaryEnemyAttack(fight,()=>3);
  fight=legendaryAssignDamage(fight,0);
  assert.equal(fight.status,'lost');
  assert.equal(fight.destination,null);
});

test('Tommul reward rolls once before interruption and never silently resets or upgrades a hero', () => {
  const original=startValleyFight(sturdyParty(),239,{participants:[0]});
  original.enemies[0].health=0;
  const rewarded=legendaryTommulReward(original,()=>6);
  assert.equal(rewarded.party[0].skills.fighting,6);
  assert.equal(original.party[0].skills.fighting,5);
  assert.throws(()=>legendaryTommulReward(rewarded,()=>6));
  assert.throws(()=>legendaryTommulReward({...original,round:4},()=>6));
});

test('stonecutter uses its printed +2 and doubles stone damage; army spells can target support without changing front', () => {
  const party=sturdyParty();party[3].armed=true;party[3].weaponBonus=9;party[3].stonecutterSword=true;
  const original=startValleyFight(party,782);
  const fight=legendaryPlayerAttack(original,3,0,{},()=>5);
  assert.equal(fight.enemies[0].health,18);
  assert.equal(fight.log.at(-1).dice.length,6);
  assert.equal(party[3].weaponBonus,9);
  const own=[[troop('Left')],[troop('Centre')],[troop('Right')]];
  const enemy=[[troop('Front',3,4),troop('Support',2,3)],[troop('Centre')],[troop('Right')]];
  const army=legendaryArmyEffect(startLegendaryArmy(own,enemy),'enemy',0,'clingingDread',undefined,{position:1});
  assert.equal(army.enemy[0][0].morale,4);
  assert.equal(army.enemy[0][1].morale,2);
});

import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(690);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../../../public/js/i18n/en/battlesim/battlesim690.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim690.js';
import { newCrownCharacter, legendaryAttack } from '../../../public/js/battlesim/engines/legendary-kingdoms/character.js';
import { startLegendaryFight, legendaryPlayerAttack, legendaryPlayerSpell, legendaryEnemyAttack,
  legendaryAssignDamage, legendaryCanAct, legendarySkipAttack, legendaryEntryDamage,
  legendaryDrinkPotion, legendaryCompanionCanAct, legendaryCompanionAttack,
  legendaryReleaseHero, legendaryMoveHero, legendaryLeaveHorror,
  legendaryChooseStunned, legendaryChooseVulnerable, legendaryTakeFallenWeapon } from '../../../public/js/battlesim/engines/legendary-kingdoms/combat.js';
import { CROWN_FIGHTS, startCrownFight } from '../../../public/js/battlesim/engines/legendary-kingdoms/crown.js';
import { CROWN_ROSTER } from '../../../public/js/battlesim/engines/legendary-kingdoms/crown-roster.js';
import { LEGENDARY_SPELLS, VALLEY_SPELLS, CROWN_SPELL_IDS } from '../../../public/js/battlesim/engines/legendary-kingdoms/spells.js';
import { readCrownHero } from '../../../public/js/battlesim/engines/legendary-kingdoms/crown-setup.js';

const party = () => ['jessica', 'tasha'].map(id => ({ ...newCrownCharacter(id), armed: true }));
const enemy = extra => ({ name: 'Opponent', attack: 2, threshold: 4, attackType: 'dice',
  defence: 4, health: 30, ...extra });
const enemyTurn = fight => fight.participants.reduce((next, index) => legendarySkipAttack(next, index), fight);
const mage = (id, extra = {}) => ({ ...newCrownCharacter('tiquon'), spells: [{ id, charged: true }], ...extra });

test('Crown locales, loaders, XP history and overlay are registered consistently', () => {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(bg).sort());
  const params=value=>[...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
  for(const key of Object.keys(en)){
    assert.ok(en[key]&&bg[key],key);
    assert.deepEqual(params(en[key]),params(bg[key]),key);
  }
  assert.match(en['battlesim690.fleetManual'],/section 555 is manual/);
  const read=file=>readFileSync(new URL('../../../'+file,import.meta.url),'utf8');
  for(const file of ['public/js/battlesim/loader.js','public/mobile/js/battlesim-dispatch.js']){
    const registered=read(file).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...registered.matchAll(/\b690\b/g)].length,1,file);
  }
  assert.equal([...read('server/db/xp.js').matchAll(/['"]sim690['"]/g)].length,1);
  assert.equal([...read('public/js/core/util.js').matchAll(/['"]sim690-overlay['"]/g)].length,1);
});

test('Explicit hero Armour edits invalidate an obsolete breakdown but preserve one matching the total', () => {
  const hero = {...newCrownCharacter('jessica'),armour:2,armourBreakdown:{body:1,shield:0,magic:1}};
  const fields = {el:() => ({checked:true}),number:() => 1,index:0};
  const unchanged = {...hero,...readCrownHero({...fields,hero})};
  assert.deepEqual(unchanged.armourBreakdown,hero.armourBreakdown);
  const edited = {...hero,armour:0};
  Object.assign(edited,readCrownHero({...fields,hero:edited}));
  assert.equal(edited.armourBreakdown,undefined);
  assert.equal(edited.magicalWeapon,true);
  assert.equal(hero.armour,2);
});

test('Narakath forces the highest-Armour hero to receive Valahiem at 2+, without changing later rounds', () => {
  const heroes = party().map(hero => ({...hero,health:50,maxHealth:50,armour:2}));
  let fight = legendaryEnemyAttack(enemyTurn(startCrownFight(heroes, 399)), () => 1);
  assert.deepEqual(fight.pendingChoice.candidates, [0,1]);
  fight = legendaryChooseVulnerable(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 2);
  assert.equal(fight.pending.hits, 13);
  assert.equal(fight.pending.forcedMember, 1);
  assert.throws(() => legendaryAssignDamage(fight, 0));
  fight = legendaryAssignDamage(fight, 1, () => 6);
  assert.equal(fight.party[1].health, 39);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 1);
  assert.equal(fight.playerHitThreshold, 6);
  fight = legendaryEnemyAttack(fight, () => 2);
  assert.equal(fight.pending.hits, 1);
  assert.equal(fight.pending.forcedMember, undefined);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 1);
  assert.equal(fight.pending.hits, 3);
  assert.equal(fight.pending.noArmour, false);
});

test('Narakath counts temporary spell Armour when choosing the most protected hero', () => {
  const heroes = party();heroes[0].armour = 2;
  let fight = startCrownFight(heroes,399);
  fight.armourBonuses[1] = 3;
  fight = legendaryEnemyAttack(enemyTurn(fight),() => 1);
  assert.deepEqual(fight.pendingChoice.candidates,[1]);
  assert.throws(() => legendaryChooseVulnerable(fight,0));
});

test('Caress disables Narakath spells but not magic immunity; fallen sword enables a magical weapon attack', () => {
  const heroes = party();
  let fight = startCrownFight(heroes, 399, {goddessCaress:true});
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 6), /magical weapon/);
  assert.equal(fight.enemies[0].spellPlan, undefined);
  assert.throws(() => legendaryTakeFallenWeapon(fight, 0));
  fight.enemies[1].health = 0;
  fight = legendaryTakeFallenWeapon(fight, 0);
  assert.equal(fight.party[0].weaponBonus, 3);
  assert.equal(fight.party[0].magicalWeapon, true);
  assert.throws(() => legendaryTakeFallenWeapon(fight, 1));
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 4);
  assert.equal(fight.enemies[0].health, 12);
  assert.equal(heroes[0].weaponBonus, 0);
});

test('Controlled hero fights as an opponent until Narakath dies, then returns without blocking victory', () => {
  const heroes = party();heroes[0].magicalWeapon = true;
  let fight = startCrownFight(heroes, 399, {controlledMember:1,goddessCaress:true});
  assert.equal(legendaryCanAct(fight, 1), false);
  assert.equal(fight.enemies[2].partyMember, 1);
  assert.equal(fight.enemies[2].defence, 4);
  fight.enemies[0].health = 1;fight.enemies[1].health = 0;
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  assert.equal(fight.status, 'won');
  assert.equal(fight.party[1].health, 9);
  assert.equal(fight.destination, 1021);
  let harmed = startCrownFight(heroes, 399, {controlledMember:1});
  harmed = legendaryPlayerAttack(harmed, 0, 2, {}, () => 6);
  assert.equal(harmed.party[1].health, 2);
  assert.equal(harmed.enemies[2].health, 2);
  assert.equal(heroes[1].health, 9);
});
const abbessSpell = (fight, roll) => legendaryEnemyAttack({...fight,phase:'enemy',enemyCursor:4,enemyActions:[]}, roll);

test('Abbess Tendrils require the strongest heroes with explicit tie choices and survive reload', () => {
  const heroes = ['jessica','tasha','akihiro','amelia'].map(newCrownCharacter);
  heroes.slice(0,3).forEach(hero => {hero.skills.fighting = 7;});
  let fight = abbessSpell(startCrownFight(heroes, 469), () => 1);
  assert.equal(fight.pendingChoice.chooseStun, true);
  assert.throws(() => legendaryEnemyAttack(fight, () => 6));
  assert.throws(() => legendaryChooseStunned(fight, [0,3]));
  fight = legendaryChooseStunned(JSON.parse(JSON.stringify(fight)), [1,2]);
  assert.equal(fight.round, 2);
  assert.equal(legendaryCanAct(fight, 0), true);
  assert.equal(legendaryCanAct(fight, 1), false);
  assert.equal(legendaryCanAct(fight, 2), false);
  assert.equal(legendaryCanAct(fight, 3), true);
  assert.deepEqual(heroes.map(hero => hero.health), [9,9,9,7]);
});

test('Abbess sacrifice counts only living nuns, bypasses armour, and restoration revives the dead', () => {
  const heroes = party().map(hero => ({...hero,armour:20}));
  let fight = startCrownFight(heroes, 469);
  fight.enemies[0].health = 0;fight.enemies[1].health = 1;
  fight = abbessSpell(fight, () => 3);
  assert.equal(fight.pending.hits, 3);
  assert.deepEqual(fight.enemies.map(enemy => enemy.health), [0,0,21,24,15]);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  assert.equal(fight.party[0].health, 6);
  fight = abbessSpell(fight, () => 5);
  assert.deepEqual(fight.enemies.map(enemy => enemy.health), [3,3,24,27,15]);
});

test('Abbess stabbing opens one player turn only, while assassination leaves her dead from the start', () => {
  let fight = startCrownFight(party(), 469);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 4, {}, () => 1), /guarding/);
  let count = 0;
  fight = abbessSpell(fight, () => count++ === 0 ? 6 : 1);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.round, 2);
  assert.doesNotThrow(() => legendaryPlayerAttack(fight, 0, 4, {}, () => 1));
  fight.round = 3;
  assert.throws(() => legendaryPlayerAttack(fight, 0, 4, {}, () => 1), /guarding/);
  assert.equal(startCrownFight(party(), 469, {abbessSlain:true}).enemies[4].health, 0);
});

test('Walkway and pool restrict both sides, bats descend when needed, and only a clear walkway allows escape', () => {
  const heroes = party();
  let fight = startCrownFight(heroes, 695, {heroZones:['walkway','pool']});
  assert.throws(() => legendaryPlayerAttack(fight, 0, 4, {}, () => 6), /out of reach/);
  assert.throws(() => legendaryPlayerAttack(fight, 1, 0, {}, () => 6), /out of reach/);
  assert.throws(() => legendaryMoveHero(fight, 0, 'pool'));
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 1));
  fight = legendaryAssignDamage(fight, 0, () => 6);
  assert.equal(fight.party[0].health, 5);
  let descending = startCrownFight(heroes, 695, {heroZones:['pool','pool']});
  assert.doesNotThrow(() => legendaryPlayerAttack(descending, 0, 0, {}, () => 1));
  descending.enemies[4].health = 0;
  descending = legendaryMoveHero(descending, 0, 'walkway');
  assert.throws(() => legendaryLeaveHorror(descending));
  const escape = startCrownFight(heroes, 695, {heroZones:['walkway','walkway']});
  escape.enemies.slice(0,4).forEach(enemy => {enemy.health = 0;});
  const left = legendaryLeaveHorror(escape);
  assert.equal(left.status, 'won');assert.equal(left.destination, 627);
  assert.equal(left.enemies[4].health, 20);
  assert.equal(legendaryMoveHero(escape, 1, 'pool').zones[1], 'pool');
});

test('Sewer squid attacks each pool hero separately; outside heroes cast or jump, and pool deaths end the fight', () => {
  const heroes = [party()[0],mage('iceBolt')];
  let fight = startCrownFight(heroes, 762, {pitVictim:0});
  assert.equal(fight.party[0].health, 7);
  assert.throws(() => legendaryPlayerAttack(fight, 1, 0, {}, () => 6));
  assert.doesNotThrow(() => legendaryPlayerSpell(fight, 1, 'iceBolt', [0], () => 1));
  fight = legendaryMoveHero(fight, 1, 'pool');
  assert.equal(fight.party[1].health, 6);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  assert.equal(fight.pending.forcedMember, 0);
  assert.throws(() => legendaryAssignDamage(fight, 1));
  fight = legendaryAssignDamage(fight, 0, () => 1);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.equal(fight.pending.forcedMember, 1);
  fight = legendaryAssignDamage(fight, 1, () => 1);
  assert.deepEqual(fight.party.map(hero => hero.health), [3,2]);
  let failed = startCrownFight(heroes, 762, {pitVictim:0});failed.party[0].health = 1;
  failed = legendaryAssignDamage(legendaryEnemyAttack(enemyTurn(failed), () => 6), 0, () => 1);
  assert.equal(failed.status, 'failed');assert.equal(failed.destination, 1086);
  assert.equal(failed.party[1].health, 7);
  assert.equal(heroes[0].health, 9);
});

test('Ladder team defeat restores only the beaten heroes to one Health and halves adventure silver once', () => {
  const heroes = party();heroes[0].health = 1;
  assert.throws(() => startCrownFight(heroes, 631, {participants:[0]}));
  let fight = startCrownFight(heroes, 631, {participants:[0],silver:25});
  fight = legendaryAssignDamage(legendaryEnemyAttack(legendarySkipAttack(fight, 0), () => 6), 0, () => 1);
  assert.equal(fight.status, 'lost');
  assert.equal(fight.destination, 194);
  assert.equal(fight.silver, 12);
  assert.deepEqual(fight.party.map(hero => hero.health), [1,9]);
  assert.equal(fight.log.filter(entry => entry.type === 'silverRobbed').length, 1);
  assert.throws(() => legendaryEnemyAttack(JSON.parse(JSON.stringify(fight)), () => 6));
  assert.equal(fight.silver, 12);
  assert.equal(heroes[0].health, 1);
});

test('Tentacle ties require a choice, each kill frees a chosen hero, and escape leaves spare tentacles alive', () => {
  const heroes = party();heroes[0].skills.fighting = 20;
  assert.throws(() => startCrownFight(heroes, 621, {grappleRolls:[6,6]}), /highest rolls/);
  let fight = startCrownFight(heroes, 621, {grappleRolls:[6,6],freeHero:0});
  assert.equal(legendaryCanAct(fight, 1), false);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  assert.equal(fight.phase, 'release');
  assert.throws(() => legendaryReleaseHero(fight, 0));
  fight = legendaryReleaseHero(JSON.parse(JSON.stringify(fight)), 1);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 431);
  assert.deepEqual(fight.enemies.map(enemy => enemy.health), [0,12,16]);
  assert.equal(heroes[1].health, 9);
});

test('Grappled heroes lose two unpreventable Health each round, but a freed hero can act immediately', () => {
  const heroes = ['jessica','tasha','tiquon','amelia'].map(id => ({...newCrownCharacter(id),armour:20,skeletonHealth:5}));
  let fight = startCrownFight(heroes, 621, {grappleRolls:[6,1,2,3]});
  fight = legendarySkipAttack(fight, 0);
  for (let index = 0; index < 3; index++) fight = legendaryEnemyAttack(fight);
  assert.deepEqual(fight.party.map(hero => hero.health), [9,7,5,5]);
  assert.deepEqual(fight.party.map(hero => hero.skeletonHealth), [5,5,5,5]);
  fight.enemies[0].health = 1;
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  fight = legendaryReleaseHero(fight, 2);
  assert.equal(fight.phase, 'player');
  assert.equal(legendaryCanAct(fight, 2), true);
  assert.equal(legendaryCanAct(fight, 1), false);
  assert.equal(legendaryCanAct(fight, 3), false);
});

test('Wilmot has a separate turn and absorbs one whole attack, then remains injured after reload', () => {
  const heroes = party();
  let fight = startCrownFight(heroes, 940);
  assert.deepEqual(fight.participants, [0]);
  assert.equal(fight.party.length, 2);
  fight = legendarySkipAttack(fight, 0);
  assert.equal(fight.phase, 'player');
  assert.equal(legendaryCompanionCanAct(fight), true);
  fight = legendaryCompanionAttack(fight, 0, () => 1);
  assert.equal(fight.log.find(entry => entry.type === 'companionAttack').dice.length, 8);
  assert.equal(fight.phase, 'enemy');
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 6), 'companion');
  assert.equal(fight.companion.injured, true);
  assert.equal(fight.party[0].health, 9);
  fight = legendaryEnemyAttack(JSON.parse(JSON.stringify(fight)), () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 'companion'));
  fight = legendaryAssignDamage(fight, 0, () => 1);
  assert.equal(fight.party[0].health, 6);
  assert.equal(fight.phase, 'player');
  assert.equal(legendaryCompanionCanAct(fight), false);
  assert.throws(() => legendaryCompanionAttack(fight, 0, () => 6));
  assert.equal(legendarySkipAttack(fight, 0).phase, 'enemy');
  assert.equal(heroes[0].health, 9);
});

test('Robyn attacks once per turn and obeys Mulgate guards; the undamaged crossbow inflicts three', () => {
  let fight = startCrownFight(party(), 949);
  assert.throws(() => legendaryCompanionAttack(fight, 4, () => 6), /guarding/);
  fight = legendaryCompanionAttack(fight, 0, () => 1);
  assert.equal(fight.log.find(entry => entry.type === 'companionAttack').dice.length, 5);
  assert.throws(() => legendaryCompanionAttack(fight, 0, () => 6));
  fight.enemies.slice(0,4).forEach(enemy => {enemy.health = 0;});
  fight = enemyTurn(fight);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.pending.hits, 3);
  fight = legendaryAssignDamage(fight, 'companion');
  assert.equal(fight.phase, 'player');
  assert.equal(fight.companion.injured, true);
  assert.equal(legendaryPlayerAttack(fight, 0, 4, {}, () => 1).enemies[4].health, 8);
});

test('Burning blood replaces the attack, halves only the next Fighting pool and preserves the borrowed weapon boundary', () => {
  const hero = {...party()[0],health:50,maxHealth:50,armour:20,weaponBonus:5};
  let fight = startCrownFight([hero], 114);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 1);
  assert.equal(fight.log.find(entry => entry.type === 'playerAttack').dice.length, 7);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 6), 0, () => 6);
  assert.equal(fight.party[0].health, 48);
  assert.equal(fight.party[0].weaponBonus, 5);
  assert.equal(fight.party[0].twoHanded, undefined);
  assert.equal(fight.halfFightingRound, 2);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 1);
  assert.equal(fight.log.filter(entry => entry.type === 'playerAttack').at(-1).dice.length, 3);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.round, 3);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 1);
  assert.equal(fight.log.filter(entry => entry.type === 'playerAttack').at(-1).dice.length, 7);
  assert.equal(hero.health, 50);
});

test('Ice Hag erodes only successful physical saves with an explicit, capped allocation', () => {
  const hero = {...newCrownCharacter('jessica'),health:50,maxHealth:50,armour:4};
  let fight = startCrownFight([hero], 1175, {armourParts:{0:{body:2,shield:1,magic:1}}});
  fight.armourBonuses[0] = 1;
  fight = legendaryEnemyAttack(legendarySkipAttack(fight, 0), () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 0, () => 6), /Allocate each/);
  assert.throws(() => legendaryAssignDamage(fight, 0, () => 6,
    {armourSaveOrder:['body','body','body','magic','spell']}), /exceeds/);
  fight = legendaryAssignDamage(fight, 0, () => 6,
    {armourSaveOrder:['body','body','shield','magic','spell']});
  assert.equal(fight.party[0].health, 45);
  assert.equal(fight.party[0].armour, 1);
  assert.deepEqual(fight.party[0].armourBreakdown, {body:0,shield:0,magic:1});
  assert.equal(fight.armourBonuses[0], 1);
  assert.equal(hero.armour, 4);
  fight = legendaryEnemyAttack(legendarySkipAttack(fight, 0), () => 6);
  fight = legendaryAssignDamage(fight, 0, () => 6, {armourSaveOrder:['magic','spell']});
  assert.equal(fight.party[0].armour, 1);
  assert.equal(fight.party[0].health, 37);
  const next = startCrownFight(fight.party, 1175);
  assert.deepEqual(next.rules.armourParts[0], {body:0,shield:0,magic:1});
});

test('Ice Hag failed saves and non-armour protection do not destroy equipment', () => {
  const hero = {...newCrownCharacter('jessica'),health:50,maxHealth:50,armour:2,skeletonHealth:5};
  let fight = startCrownFight([hero], 1175, {armourParts:{0:{body:2,shield:0,magic:0}}});
  fight = legendaryAssignDamage(legendaryEnemyAttack(legendarySkipAttack(fight, 0), () => 6), 0, () => 6);
  assert.equal(fight.party[0].armour, 2);
  assert.equal(fight.party[0].skeletonHealth, 0);
  fight = legendaryAssignDamage(legendaryEnemyAttack(legendarySkipAttack(fight, 0), () => 6), 0, () => 1);
  assert.equal(fight.party[0].armour, 2);
  assert.equal(fight.party[0].health, 40);
});

test('Climbing forbids shields, two-handed weapons and spells without stripping saved equipment', () => {
  const heroes = [mage('iceBolt', {armour:5,armed:true,twoHanded:true,weaponBonus:5})];
  assert.throws(() => startCrownFight(heroes, 82), /Separate worn armour/);
  const fight = startCrownFight(heroes, 82, {armourParts:{0:{body:2,shield:2,magic:1}}});
  assert.throws(() => legendaryPlayerSpell(fight, 0, 'iceBolt', [0], () => 6));
  let next = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  assert.equal(next.log.find(entry => entry.type === 'playerAttack').dice.length, 0);
  next = legendaryAssignDamage(legendaryEnemyAttack(next, () => 6), 0, () => 6);
  assert.equal(next.log.find(entry => entry.type === 'damage').dice.length, 3);
  assert.equal(next.party[0].armour, 5);
  assert.equal(next.party[0].weaponBonus, 5);
  assert.equal(next.party[0].health, 4);
  assert.equal(heroes[0].health, 7);
});

test('Captivity keeps worn armour only; knife is armed whereas the prison escape is unarmed', () => {
  const hero = {...newCrownCharacter('jessica'),armed:true,armour:6,weaponBonus:4,attackDieBonus:2,
    skeletonHealth:5,healingPotions:2,invulnerabilityPotions:1};
  hero.bonuses.fighting = 3;
  const setup = {armourParts:{0:{body:2,shield:2,magic:2}}};
  const knife = startCrownFight([hero], 1191, setup);
  const unarmed = startCrownFight([hero], 370, setup);
  assert.throws(() => legendaryDrinkPotion(knife, 0, 'healing'));
  const attack = legendaryPlayerAttack(knife, 0, 0, {}, () => 3);
  assert.equal(attack.log.find(entry => entry.type === 'playerAttack').dice.length, 7);
  assert.equal(attack.enemies[0].health, 11);
  assert.equal(legendaryPlayerAttack(unarmed, 0, 0, {}, () => 3).log.find(entry => entry.type === 'playerAttack').dice.length, 6);
  let hurt = legendaryEnemyAttack(legendarySkipAttack(knife, 0), () => 6);
  hurt = legendaryAssignDamage(hurt, 0, () => 6);
  assert.equal(hurt.party[0].health, 5);
  assert.equal(hurt.party[0].armour, 6);
  assert.equal(hurt.party[0].skeletonHealth, 5);
  assert.equal(hurt.party[0].weaponBonus, 4);
  assert.equal(hurt.party[0].bonuses.fighting, 3);
  assert.equal(hero.health, 9);
});

test('Door holders cannot join combat and die if the fighting team falls', () => {
  const heroes = ['jessica','tasha','tiquon','amelia'].map(newCrownCharacter);
  assert.throws(() => startCrownFight(heroes, 468, {participants:[0,1,2]}));
  let fight = startCrownFight(heroes, 468, {participants:[0]});
  assert.equal(legendaryCanAct(fight, 1), false);
  fight.party[0].health = 1;
  fight = legendarySkipAttack(fight, 0);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 6), 0, () => 1);
  assert.equal(fight.status, 'lost');
  assert.deepEqual(fight.party.map(hero => hero.health), [0,0,0,0]);
  assert.deepEqual(heroes.map(hero => hero.health), [9,9,7,7]);
});

test('Sparing Bryce removes weapon and one Fighting die only against him, and excludes lethal spells', () => {
  const heroes = [party()[0],mage('stingtailRune')];heroes[0].weaponBonus = 5;
  const fight = startCrownFight(heroes, 954, {spareBryce:true});
  const bryce = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  assert.equal(bryce.log.find(entry => entry.type === 'playerAttack').dice.length, 6);
  const rosie = legendaryPlayerAttack(fight, 0, 1, {}, () => 6);
  assert.equal(rosie.log.find(entry => entry.type === 'playerAttack').dice.length, 12);
  const spell = legendaryPlayerSpell(fight, 1, 'stingtailRune');
  assert.deepEqual(spell.enemies.map(enemy => enemy.health), [12,17]);
  assert.throws(() => legendaryPlayerSpell(startCrownFight([mage('iceBolt')], 954, {spareBryce:true}), 0, 'iceBolt', [0], () => 6));
  assert.equal(heroes[0].weaponBonus, 5);
});

test('Tower duel permits only spells and recharges each drained spell separately at round end', () => {
  const heroes = [mage('iceBolt', {spells:[
    {id:'iceBolt',charged:false},{id:'soothingTouch',charged:false},{id:'armourOfHeaven',charged:true},
  ]})];
  let fight = startCrownFight(heroes, 691);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 6));
  fight = legendarySkipAttack(fight, 0);
  const dice = [6,4,5];
  fight = legendaryEnemyAttack(fight, () => dice.shift());
  assert.equal(fight.phase, 'player');
  assert.equal(fight.round, 2);
  assert.deepEqual(fight.party[0].spells.map(spell => spell.charged), [false,true,true]);
  assert.deepEqual(heroes[0].spells.map(spell => spell.charged), [false,false,true]);
  fight = legendaryPlayerSpell(fight, 0, 'soothingTouch', [0]);
  const flameRoll = [3,...Array(5).fill(6)];
  fight = legendaryEnemyAttack(fight, () => flameRoll.shift());
  assert.equal(fight.pending.hits, 5);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  assert.equal(fight.round, 3);
  assert.deepEqual(fight.party[0].spells.map(spell => spell.charged), [true,true,true]);
});

test('Failed rescue occupies Tasha and the lead thug; Fast Thug deals four armoured damage to her', () => {
  const heroes = party();heroes[1].armour = 4;
  assert.throws(() => startCrownFight(heroes, 1185));
  let fight = startCrownFight(heroes, 1185, {boyFreed:false});
  assert.equal(legendaryCanAct(fight, 1), false);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 6));
  fight = legendarySkipAttack(fight, 0);
  fight = legendaryEnemyAttack(fight, () => 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.pending.forcedMember, 1);
  assert.equal(fight.pending.hits, 4);
  assert.throws(() => legendaryAssignDamage(fight, 0));
  fight = legendaryAssignDamage(fight, 1, () => 6);
  assert.equal(fight.party[1].health, 9);
  fight.enemies[1].health = 0;fight.enemies[2].health = 0;fight.enemies[3].health = 1;
  fight = legendaryPlayerAttack(fight, 0, 3, {}, () => 6);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 833);
  assert.equal(fight.enemies[0].health, 0);
  assert.equal(heroes[1].health, 9);
  assert.equal(legendaryCanAct(startCrownFight(heroes, 1185, {boyFreed:true}), 1), true);
});

test('Party-wide spells leave the grappled lead thug alone until the other thugs die', () => {
  const heroes = [...party(), mage('stingtailRune')];
  let fight = startCrownFight(heroes, 1185, {boyFreed:false});
  fight = legendaryPlayerSpell(fight, 2, 'stingtailRune');
  assert.deepEqual(fight.enemies.map(enemy => enemy.health), [10,4,2,3]);
});

test('Keraknorn heals to eleven behind the Fire Spirit and the rooftop assassin fights alone initially', () => {
  const heroes = party().map(hero => ({...hero,health:50,maxHealth:50}));
  let fight = startCrownFight(heroes, 240, {rooftopAssassin:1});
  assert.equal(fight.enemies[0].health, 7);
  assert.equal(legendaryCanAct(fight, 0), false);
  assert.throws(() => legendaryPlayerAttack(fight, 1, 0, {}, () => 6));
  fight = legendarySkipAttack(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.equal(fight.enemies[0].health, 11);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 0, () => 1));
  fight = legendaryAssignDamage(fight, 1, () => 1);
  assert.equal(fight.round, 2);
  assert.equal(legendaryCanAct(fight, 0), true);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  assert.equal(fight.enemyActions[0].castSpell, true);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.pending, null);
  assert.equal(fight.phase, 'enemy');
});

test('Apocalypse decay spares only heroes actually hurt by its attacks and bypasses all protection', () => {
  const heroes = ['jessica','tasha','tiquon','amelia'].map(id => ({...newCrownCharacter(id),health:50,maxHealth:50}));
  heroes[0].armour = 30;
  heroes[2].skeletonHealth = 5;
  let fight = enemyTurn(startCrownFight(heroes, 626));
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 1), 0, () => 6);
  assert.equal(fight.party[0].health, 50);
  const second = legendaryEnemyAttack(fight, () => 1);
  assert.throws(() => legendaryAssignDamage(second, 0));
  fight = legendaryAssignDamage(second, 1, () => 1);
  assert.deepEqual(fight.party.map(hero => hero.health), [48,47,48,48]);
  assert.equal(fight.party[2].skeletonHealth, 5);
  assert.equal(heroes[0].health, 50);
  fight = enemyTurn(fight);
  assert.deepEqual(fight.enemyHeroDamage, {});
});

test('Surrounded heroes receive damage from at most one thug per round, even when armour saves it', () => {
  const heroes = ['jessica','tasha','tiquon','amelia'].map(id => ({...newCrownCharacter(id),armour:20}));
  let fight = startCrownFight(heroes, 224);
  assert.equal(fight.phase, 'enemy');
  for (let index = 0; index < 4; index++) {
    fight = legendaryEnemyAttack(fight, () => 6);
    if (index) assert.throws(() => legendaryAssignDamage(fight, index-1, () => 6, {allowSameRecipient:true}));
    fight = legendaryAssignDamage(fight, index, () => 6);
  }
  assert.equal(fight.phase, 'player');
  fight = enemyTurn(fight);
  assert.equal(fight.round, 2);
  assert.deepEqual(fight.roundRecipients, []);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 6), 0, () => 6);
  assert.equal(fight.party[0].health, 9);
  let smaller = startCrownFight(heroes.slice(0,2), 224);
  for (let index = 0; index < 2; index++)
    smaller = legendaryAssignDamage(legendaryEnemyAttack(smaller, () => 6), index, () => 6);
  for (let index = 0; index < 2; index++) smaller = legendaryEnemyAttack(smaller, () => 6);
  assert.equal(smaller.phase, 'player');
  assert.equal(smaller.pending, null);
});

test('Manor wall arrivals restrict actions, targets and damage recipients without changing the party', () => {
  const heroes = party();
  const guards = CROWN_FIGHTS.find(fight => fight.section === 94).enemies.map(enemy => enemy.name);
  assert.throws(() => startCrownFight(heroes, 94, { guardApproach:'walls' }));
  const options = {guardApproach:'walls',heroArrivalOrder:[1,0],guardArrivalOrder:guards};
  let fight = startCrownFight(heroes, 94, options);
  assert.equal(legendaryCanAct(fight, 0), false);
  assert.equal(legendaryCanAct(fight, 1), true);
  assert.throws(() => legendaryPlayerAttack(fight, 1, 1, {}, () => 1));
  fight = legendarySkipAttack(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 0, () => 6));
  fight = legendaryAssignDamage(fight, 1, () => 6);
  assert.equal(fight.round, 2);
  assert.equal(legendaryCanAct(fight, 0), true);
  assert.equal(heroes[1].health, 9);
  const basement = startCrownFight(heroes, 94, {guardApproach:'basement'});
  assert.deepEqual(basement.enemies.map(enemy => enemy.arrivalRound), [1,2,2,2,2,2]);
  const ambush = startCrownFight(heroes, 94, {guardApproach:'assassination',assassinationSuccesses:6});
  assert.deepEqual(ambush.enemies.map(enemy => enemy.name), ['Sir Barda','Alice of Brightsands','Quinn Marshall']);
});

test('Robyn casts his three printed spells in sequence, then attacks normally', () => {
  const heroes = party().map(hero => ({...hero,health:50,maxHealth:50,armour:20}));
  let fight = startCrownFight(heroes, 94);
  for (const enemy of fight.enemies) if (enemy.name !== 'Robyn Spyre') enemy.health = 0;
  fight = enemyTurn(fight);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.equal(fight.pending.hits, 5);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  fight = legendaryEnemyAttack(fight, () => 6);
  assert.throws(() => legendaryAssignDamage(fight, 0, () => 6));
  fight = legendaryAssignDamage(fight, 1, () => 6);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  assert.equal(fight.pending.hits, 8);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  fight = legendaryAssignDamage(fight, 0, () => 6);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight), 1, () => 6);
  assert.deepEqual(fight.party.map(hero => hero.health), [49,49]);
  fight = legendaryEnemyAttack(enemyTurn(fight), () => 6);
  assert.equal(fight.pending.hits, 4);
  assert.deepEqual(fight.log.filter(entry => entry.type === 'enemySpell').map(entry => entry.name),
    ['Poison Spray','Ice Bolt','Wither','Attack']);
});

test('Titan retaliates against its damager, allows armour, and resumes the same player turn after reload', () => {
  const heroes = party();
  heroes[0].skills.fighting = 1;heroes[0].armour = 1;
  const original = startCrownFight(heroes, 318);
  let fight = legendaryPlayerAttack(original, 0, 0, {}, () => 6);
  assert.equal(fight.phase, 'enemy');
  assert.ok(fight.reactionResume);
  assert.deepEqual(fight.acted, [0]);
  fight = legendaryEnemyAttack(JSON.parse(JSON.stringify(fight)));
  assert.equal(fight.pending.forcedMember, 0);
  assert.throws(() => legendaryAssignDamage(fight, 1));
  fight = legendaryAssignDamage(fight, 0, () => 4);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.round, 1);
  assert.equal(fight.reactionResume, undefined);
  assert.equal(fight.party[0].health, 9);
  assert.equal(legendaryCanAct(fight, 1), true);
  assert.equal(original.enemies[0].health, 35);
  assert.equal(legendaryPlayerAttack(original, 0, 0, {}, () => 1).reactionResume, undefined);
  const wounded = startCrownFight(heroes, 318, { titanEyesHit: true });
  assert.equal(wounded.enemies[0].health, 30);
  assert.equal(wounded.enemies[0].threshold, 5);
  assert.equal(wounded.enemies[0].automaticDamage, 0);
});

test('Ghoul counters missed attacks immediately and still receives its normal enemy turn', () => {
  const heroes = party().map(hero => ({ ...hero, health: 50, maxHealth: 50 }));
  let fight = startCrownFight(heroes, 417);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 1);
  assert.equal(fight.phase, 'enemy');
  assert.equal(fight.enemyActions[0].forcedMember, 0);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.enemyCursor, 0);
  fight = legendaryPlayerAttack(fight, 1, 0, {}, () => 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.reactionResume, undefined);
  assert.equal(fight.phase, 'enemy');
  assert.equal(fight.enemyCursor, 0);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.round, 2);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.log.filter(entry => entry.type === 'enemyAttack').length, 3);
});

test('Dragon fire is immediate, once only, and requires two different recipients without armour', () => {
  const heroes = party().map(hero => ({ ...hero, armour: 20 }));
  heroes[0].skills.fighting = 25;
  let fight = startCrownFight(heroes, 611);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 4);
  assert.equal(fight.enemies[0].health, 25);
  assert.equal(fight.enemyActions.length, 2);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight), 0, () => 6);
  assert.equal(fight.party[0].health, 5);
  const second = legendaryEnemyAttack(fight);
  assert.throws(() => legendaryAssignDamage(second, 0));
  fight = legendaryAssignDamage(second, 1, () => 6);
  assert.equal(fight.party[1].health, 5);
  assert.equal(fight.phase, 'player');
  fight = legendaryPlayerAttack(fight, 1, 0, {}, () => 1);
  assert.equal(fight.reactionResume, undefined);
  assert.equal(fight.enemyActions.length, 0);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.enemyActions.length, 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.log.filter(entry => entry.type === 'thresholdReaction').length, 1);
});

test('Chimera body victory waits for both fire recipients; alternatively all heads can be slain', () => {
  const heroes = party();heroes[0].skills.fighting = 35;
  let fight = startCrownFight(heroes, 182);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 6);
  assert.equal(fight.enemies[0].health, 0);
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight), 0);
  assert.equal(fight.status, 'active');
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight), 1);
  assert.equal(fight.status, 'won');
  assert.equal(fight.destination, 568);
  assert.deepEqual(fight.party.map(hero => hero.health), [6,6]);
  assert.ok(fight.enemies.slice(1).every(enemy => enemy.health === 18));
  let heads = startCrownFight(party(), 182);
  heads.enemies[1].health = 0;heads.enemies[2].health = 1;heads.enemies[3].health = 1;
  heads = legendaryPlayerAttack(heads, 0, 2, {}, () => 6);
  heads = legendaryPlayerAttack(heads, 1, 3, {}, () => 6);
  assert.equal(heads.status, 'won');
  assert.equal(heads.enemies[0].health, 30);
});

test('Hydra gas replaces that head\'s attack and bypasses armour against distinct heroes', () => {
  let fight = enemyTurn(startCrownFight(party().map(hero => ({ ...hero, armour: 20 })), 740));
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 6), 0, () => 6);
  const second = legendaryEnemyAttack(fight);
  assert.throws(() => legendaryAssignDamage(second, 0));
  fight = legendaryAssignDamage(second, 1, () => 6);
  assert.deepEqual(fight.party.map(hero => hero.health), [6,6]);
  assert.equal(fight.enemyCursor, 1);
  assert.equal(fight.enemyActions.length, 0);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.enemyCursor, 2);
  assert.equal(fight.pending, null);
});

test('wall traps fail immediately after one player turn, without fake enemy turns', () => {
  const stopped = enemyTurn(startCrownFight(party(), 506));
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.phase, 'ended');
  assert.equal(stopped.destination, 443);
  const heroes = party().map(hero => ({ ...hero, skills: { ...hero.skills, fighting: 30 } }));
  let cleared = startCrownFight(heroes, 506);
  cleared = legendaryPlayerAttack(cleared, 0, 0, {}, () => 6);
  cleared = legendaryPlayerAttack(cleared, 1, 1, {}, () => 6);
  assert.equal(cleared.status, 'won');
  assert.equal(cleared.destination, 692);
});

test('Crown healing potions use one action; wounded Keraknorn retains his printed healing maximum', () => {
  const heroes = party();
  heroes[0].health = 1;heroes[0].healingPotions = 2;
  const original = startCrownFight(heroes, 5);
  const healed = legendaryDrinkPotion(original, 0, 'healing');
  assert.equal(healed.party[0].health, 6);
  assert.equal(healed.party[0].healingPotions, 1);
  assert.equal(legendaryCanAct(healed, 0), false);
  assert.throws(() => legendaryDrinkPotion(healed, 0, 'healing'));
  assert.throws(() => legendaryPlayerAttack(healed, 0, 0));
  assert.equal(original.party[0].healingPotions, 2);
  let wizard = startCrownFight(party(), 543, { wizardWounded: true });
  assert.equal(wizard.enemies[0].health, 4);
  assert.equal(wizard.enemies[0].maxHealth, 7);
  wizard = legendaryEnemyAttack(enemyTurn(wizard), () => 6);
  assert.equal(wizard.enemies[0].health, 7);
});

test('Rupert is the victory target, while the bell rope fails before an undamaged knight can attack', () => {
  let rupert = startCrownFight(party(), 496);
  rupert.enemies[0].health = 1;
  rupert = legendaryPlayerAttack(rupert, 0, 0, {}, () => 6);
  assert.equal(rupert.status, 'won');
  assert.equal(rupert.destination, 342);
  assert.ok(rupert.enemies.slice(1).every(enemy => enemy.health > 0));
  const heroes = party().map(hero => ({ ...hero, skills: { ...hero.skills, fighting: 1 } }));
  let bell = startCrownFight(heroes, 564);
  bell = legendaryPlayerAttack(bell, 0, 0, {}, () => 6);
  bell = legendarySkipAttack(bell, 1);
  assert.equal(bell.status, 'failed');
  assert.equal(bell.destination, 946);
  let safe = startCrownFight(heroes, 564);
  safe = legendaryPlayerAttack(safe, 0, 0, {}, () => 6);
  safe = legendaryPlayerAttack(safe, 1, 1, {}, () => 6);
  assert.equal(safe.status, 'active');
  assert.equal(safe.phase, 'enemy');
});

test('entry wounds apply once, can kill without revival, and exclude captured Jessica', () => {
  const heroes = party();
  heroes[0].health = 1;
  const dead = startCrownFight(heroes, 1072, { participants: [0] });
  assert.equal(dead.status, 'lost');
  assert.equal(dead.destination, 484);
  assert.deepEqual(dead.party.map(hero => hero.health), [0,9]);
  assert.deepEqual(heroes.map(hero => hero.health), [1,9]);
  assert.equal(startCrownFight(heroes, 1072, { participants: [0], entryDamageAlreadyApplied: true }).party[0].health, 1);
  const entry = startCrownFight(party(), 256, { entryDamageHero: 1 });
  assert.deepEqual(entry.party.map(hero => hero.health), [9,7]);
  assert.throws(() => legendaryEntryDamage(entry, [1], 2));
  assert.throws(() => startCrownFight(party(), 256));
  const captured = startCrownFight(party(), 931);
  assert.deepEqual(captured.participants, [1]);
  assert.deepEqual(captured.party.map(hero => hero.health), [9,7]);
  assert.throws(() => startCrownFight(party(), 931, { participants: [0,1] }));
});

test('Wood Hag disables the lowest-Survival hero and drowning bypasses armour, potions and escorts', () => {
  const heroes = party().map(hero => ({ ...hero, armour: 20, skeletonHealth: 6 }));
  let fight = startCrownFight(heroes, 1146);
  assert.equal(legendaryCanAct(fight, 0), false);
  assert.equal(legendaryCanAct(fight, 1), true);
  assert.throws(() => legendarySkipAttack(fight, 0));
  fight = legendarySkipAttack(fight, 1);
  fight.party[0].invulnerable = true;
  fight = legendaryEnemyAttack(fight);
  assert.equal(fight.pending.forcedMember, 0);
  assert.throws(() => legendaryAssignDamage(fight, 1));
  fight = legendaryAssignDamage(fight, 0, () => 6);
  assert.equal(fight.party[0].health, 8);
  assert.equal(fight.party[0].skeletonHealth, 6);
  assert.equal(fight.party[0].invulnerable, true);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.pending.hits, 1);
  const tied = party();
  tied[1].skills.survival = 2;
  assert.throws(() => startCrownFight(tied, 1146), /lowest Survival/);
  assert.deepEqual(startCrownFight(tied, 1146, { trappedHero: 1 }).rules.disabledParticipants, [1]);
});

test('Hell Drone damages everyone only while alive and Ooze attacks bypass armour', () => {
  let drone = startCrownFight(party().map(hero => ({ ...hero, armour: 20, skeletonHealth: 6 })), 1126);
  for (const enemy of drone.enemies) enemy.attack = 0;
  drone = enemyTurn(drone);
  for (const hero of drone.party) hero.invulnerable = true;
  for (let i = 0; i < 4; i++) drone = legendaryEnemyAttack(drone, () => 1);
  assert.deepEqual(drone.party.map(hero => hero.health), [8,8]);
  assert.deepEqual(drone.party.map(hero => hero.skeletonHealth), [6,6]);
  assert.ok(drone.party.every(hero => hero.invulnerable));
  const ooze = startCrownFight(party(), 1126).enemies[1];
  let fight = startLegendaryFight(party().map(hero => ({ ...hero, armour: 20 })), [ooze], { partyFirst: false });
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => 3), 0, () => 6);
  assert.equal(fight.party[0].health, 5);
});

test('the successful opening surprise skips exactly the first enemy turn', () => {
  const surprised = enemyTurn(startCrownFight(party(), 932, { skipFirstEnemyTurn: true }));
  assert.equal(surprised.phase, 'player');
  assert.equal(surprised.round, 2);
  assert.deepEqual(surprised.party.map(hero => hero.health), [9,9]);
  assert.equal(enemyTurn(surprised).phase, 'enemy');
  const ordinary = enemyTurn(startCrownFight(party(), 932));
  assert.equal(ordinary.phase, 'enemy');
  assert.equal(ordinary.round, 1);
});

test('Crown spells do not leak untranslated options into the Valley catalog', () => {
  assert.equal(Object.keys(VALLEY_SPELLS).length, 15);
  assert.equal(CROWN_SPELL_IDS.length, 18);
  for (const id of CROWN_SPELL_IDS) assert.ok(LEGENDARY_SPELLS[id]);
  assert.equal(VALLEY_SPELLS.whipsnake, undefined);
  assert.equal(LEGENDARY_SPELLS.whipsnake.recharge, 250);
  assert.equal(LEGENDARY_SPELLS.tilt.recharge, 50);
  assert.equal(LEGENDARY_SPELLS.teleport.recharge, 1000);
});

test('Wither and Stingtail Rune damage every active foe and Frost Ring boosts only actual spell damage', () => {
  for (const [id, amount] of [['wither',1], ['stingtailRune',3]]) {
    const original = startLegendaryFight([mage(id, { spellDamageBonus: 1 })], [enemy(), enemy()]);
    const next = legendaryPlayerSpell(original, 0, id);
    assert.deepEqual(next.enemies.map(enemy => enemy.health), [30-amount-1,30-amount-1]);
    assert.equal(next.party[0].spells[0].charged, false);
    assert.equal(original.party[0].spells[0].charged, true);
  }
  const original = startLegendaryFight([mage('iceBolt', { spellDamageBonus: 1 })], [enemy()]);
  assert.equal(legendaryPlayerSpell(original, 0, 'iceBolt', [0], () => 1).enemies[0].health, 30);
});

test('Whipsnake harms two foes and penalizes only their next enemy turn', () => {
  const heroes = [mage('whipsnake'), party()[1]];
  let fight = startLegendaryFight(heroes, [enemy({ attack: 1 }), enemy({ attack: 1 })]);
  assert.throws(() => legendaryPlayerSpell(fight, 0, 'whipsnake', [0,0]));
  fight = legendaryPlayerSpell(fight, 0, 'whipsnake', [0,1]);
  assert.deepEqual(fight.enemies.map(enemy => enemy.health), [28,28]);
  fight = legendarySkipAttack(fight, 1);
  fight = legendaryEnemyAttack(fight, () => 4);
  fight = legendaryEnemyAttack(fight, () => 4);
  assert.equal(fight.phase, 'player');
  assert.deepEqual(fight.party.map(hero => hero.health), [7,9]);
  fight = enemyTurn(fight);
  fight = legendaryEnemyAttack(fight, () => 4);
  assert.equal(fight.pending.hits, 1);
  assert.equal(fight.enemies[0].currentTurnPenalty, 0);
});

test('Vulnerability is a non-damaging permanent defence change, even against damage immunity', () => {
  const original = startLegendaryFight([mage('vulnerability')], [enemy({ damageSpellImmune: true })]);
  const next = legendaryPlayerSpell(original, 0, 'vulnerability', [0]);
  assert.equal(next.enemies[0].defence, 3);
  assert.equal(next.enemies[0].health, 30);
  assert.equal(original.enemies[0].defence, 4);
});

test('Orb rolls thirteen attack dice; Steamers lose armour after Ice Bolt even if it misses', () => {
  const orb = startLegendaryFight([mage('orbOfAnnihilation')], [enemy()]);
  const blasted = legendaryPlayerSpell(orb, 0, 'orbOfAnnihilation', [0], () => 4);
  assert.equal(blasted.enemies[0].health, 17);
  assert.equal(blasted.log.find(entry => entry.type === 'spellAttack').dice.length, 13);
  const ice = startCrownFight([mage('iceBolt')], 1139);
  const frozen = legendaryPlayerSpell(ice, 0, 'iceBolt', [0], () => 1);
  assert.equal(frozen.enemies[0].health, ice.enemies[0].health);
  assert.equal(frozen.enemies[0].defence, 2);
  assert.equal(frozen.enemies[1].defence, 5);
});

test('Naga casts after its ordinary attack and Ice Bolt does not inherit automatic damage', () => {
  let fight = enemyTurn(startCrownFight(party(), 905));
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.pending.hits, 2);
  assert.equal(fight.log.some(entry => entry.type === 'enemySpell'), false);
  fight = legendaryAssignDamage(fight, 0);
  const rolls = [6,1,1,1,1,1,1,1,1];
  fight = legendaryEnemyAttack(fight, () => rolls.shift());
  assert.equal(fight.pending, null);
  assert.equal(fight.party[0].health, 7);
  assert.equal(fight.log.at(-1).automaticDamage, undefined);
  assert.equal(fight.log.at(-1).dice.length, 8);
  let healing = enemyTurn(startCrownFight(party(), 254));
  healing.enemies[0].health = 27;
  healing = legendaryAssignDamage(legendaryEnemyAttack(healing, () => 1), 0);
  assert.equal(healing.enemies[0].health, 27);
  healing = legendaryEnemyAttack(healing, () => 1);
  assert.equal(healing.enemies[0].health, 32);
});

test('Skeleton Deathly Armour lasts through the next player turn, not the following one', () => {
  let fight = enemyTurn(startCrownFight(party(), 381));
  fight = legendaryEnemyAttack(fight, () => 1);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.phase, 'player');
  assert.equal(fight.playerHitThreshold, 6);
  fight = legendaryPlayerAttack(fight, 0, 0, {}, () => 5);
  assert.equal(fight.roundEnemyDamage[0], 0);
  fight = legendarySkipAttack(fight, 1);
  assert.equal(fight.playerHitThreshold, null);
});

test('Flame Jet requires three distinct recipients unless the smaller party explicitly overrides it', () => {
  const heroes = [...party(), { ...newCrownCharacter('brash'), armed: true }];
  let fight = enemyTurn(startCrownFight(heroes, 543));
  let rolls = [3,4,4,4,4,4];
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight, () => rolls.shift()), 0);
  let attack = legendaryEnemyAttack(fight, () => 4);
  assert.throws(() => legendaryAssignDamage(attack, 0));
  fight = legendaryAssignDamage(attack, 1);
  attack = legendaryEnemyAttack(fight, () => 4);
  assert.throws(() => legendaryAssignDamage(attack, 0));
  assert.throws(() => legendaryAssignDamage(attack, 1));
  assert.throws(() => legendaryAssignDamage(attack, 0, undefined, { allowSameRecipient: true }));
  fight = legendaryAssignDamage(attack, 2);
  assert.deepEqual(fight.party.map(hero => hero.health), [4,4,4]);
  let smaller = enemyTurn(startCrownFight(party(), 543));
  rolls = [3,4,4,4,4,4];
  smaller = legendaryAssignDamage(legendaryEnemyAttack(smaller, () => rolls.shift()), 0);
  smaller = legendaryAssignDamage(legendaryEnemyAttack(smaller, () => 4), 1);
  attack = legendaryEnemyAttack(smaller, () => 4);
  assert.throws(() => legendaryAssignDamage(attack, 0));
  assert.doesNotThrow(() => legendaryAssignDamage(attack, 0, undefined, { allowSameRecipient: true }));
});

test('a heal-at-full reroll waits for another roll instead of spinning in a random loop', () => {
  const caster = enemy({ attack: null, threshold: null, attackType: 'special', maxHealth: 30,
    spellPlan: { mode: 'roll', entries: [
      { min: 1, max: 5, name: 'Bolt', effects: [{ type: 'attack', count: 1 }] },
      { min: 6, max: 6, name: 'Heal', effects: [{ type: 'healSelf', amount: 5, rerollIfFull: true }] },
    ] } });
  const original = startLegendaryFight(party(), [caster], { partyFirst: false });
  const reroll = legendaryEnemyAttack(original, () => 6);
  assert.equal(reroll.log.at(-1).reroll, true);
  assert.equal(reroll.pending, null);
  assert.equal(reroll.enemyActions.length, 1);
  assert.equal(reroll.phase, 'enemy');
  const next = legendaryEnemyAttack(reroll, () => 1);
  assert.equal(next.phase, 'player');
  assert.equal(next.enemyActions.length, 0);
  assert.deepEqual(original.log, []);
});

test('Crown catalog covers every personal encounter and never substitutes ordinary fights for pending rules', () => {
  assert.equal(CROWN_FIGHTS.length, 85);
  assert.deepEqual(CROWN_FIGHTS.map(fight => fight.section), [...new Set(CROWN_ROSTER.map(enemy => enemy.section))]);
  for (const encounter of CROWN_FIGHTS) {
    assert.ok(encounter.enemies.length);
    assert.ok(encounter.win >= 1 && encounter.win <= 1201);
    if (encounter.pendingRules) {
      assert.throws(() => startCrownFight(party(), encounter.section), /implementation pending/);
    } else {
      const original = encounter.section === 468 ? ['jessica','tasha','tiquon','amelia'].map(newCrownCharacter) :
        encounter.hero === 'tiquon' ? [mage('iceBolt'),party()[1]] : party();
      const before = structuredClone(original);
      const participants = (encounter.hero || encounter.solo ? [0] : [0,1])
        .filter(index => !encounter.excludedProfiles?.includes(original[index].profileId));
      const fight = startCrownFight(original, encounter.section, { participants, vesselType: 'carrack', entryDamageHero: 0, boyFreed:true,
        grappleRolls:original.map((_,index) => 6-index),silver:0,
        heroZones:original.map(() => 'walkway'),pitVictim:0 });
      assert.equal(fight.rules.section, encounter.section);
      assert.deepEqual(original, before);
    }
  }
});

test('Crown context options preserve task teams, source code exclusions and previous ogre visits', () => {
  assert.throws(() => startCrownFight(party(), 89), /Select the team/);
  assert.deepEqual(startCrownFight(party(), 89, { participants: [1] }).participants, [1]);
  assert.throws(() => startCrownFight(party(), 47, { participants: [1] }), /required hero/);
  assert.equal(startCrownFight(party(), 738).enemies.length, 2);
  assert.equal(startCrownFight(party(), 738, { ogreVisits: 1 }).enemies.length, 3);
  assert.equal(startCrownFight(party(), 738, { ogreVisits: 2 }).enemies.length, 4);
  assert.deepEqual(startCrownFight(party(), 880, { participants: [0], codes: ['B3','B4'] }).enemies.map(enemy => enemy.name), ['Wild Rioters']);
  assert.equal(startCrownFight(party(), 136, { defeatedEnemies: ['Sir Walter','Sar Lidia'] }).enemies.length, 4);
  assert.throws(() => startCrownFight(party(), 136, { defeatedEnemies: ['Sir Berald'] }));
  assert.equal(startCrownFight(party(), 1193, { vesselType: 'cog' }).rules.win, 704);
  assert.equal(startCrownFight(party(), 1193, { vesselType: 'carrack' }).rules.win, 99);
  assert.throws(() => startCrownFight(party(), 1193));
  assert.equal(startCrownFight(party(), 655).rules.stopRound, 6);
  assert.equal(startCrownFight(party(), 777).rules.stopRound, 3);
});

test('weapon guards block physical attacks but not magic and end when the guards die', () => {
  const heroes = party();
  heroes[0] = { ...newCrownCharacter('tiquon'), spells: [{ id: 'iceBolt', charged: true }] };
  const fight = startLegendaryFight(heroes, [enemy({ weaponGuard: { indices: [1], minimum: 1 } }), enemy()]);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 4));
  assert.ok(legendaryPlayerSpell(fight, 0, 'iceBolt', [0], () => 4).enemies[0].health < 30);
  fight.enemies[1].health = 0;
  assert.doesNotThrow(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 4));
  assert.equal(heroes[0].spells[0].charged, true);
});

test('magic-only opponents and spell-immune opponents retain separate protections', () => {
  const heroes = party();
  const fight = startLegendaryFight(heroes, [enemy({ magicOnly: true })]);
  assert.throws(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 4));
  fight.party[0].magicalWeapon = true;
  assert.doesNotThrow(() => legendaryPlayerAttack(fight, 0, 0, {}, () => 4));
  const mage = newCrownCharacter('tiquon');
  mage.spells = [{ id: 'iceBolt', charged: true }];
  const immune = startLegendaryFight([mage], [enemy({ damageSpellImmune: true })]);
  assert.throws(() => legendaryPlayerSpell(immune, 0, 'iceBolt', [0], () => 4));
  assert.equal(immune.party[0].spells[0].charged, true);
});

test('troglodyte attack dice halve once at half initial Health', () => {
  const heroes = party();
  heroes[0].skills.fighting = 6;
  heroes[1].skills.fighting = 1;
  const original = startLegendaryFight(heroes, [enemy({ attack: 8, health: 12, halveAttackAtHalfHealth: true })]);
  const first = legendaryPlayerAttack(original, 0, 0, {}, () => 4);
  assert.equal(first.enemies[0].attack, 4);
  assert.equal(first.enemies[0].health, 6);
  const second = legendaryPlayerAttack(first, 1, 0, {}, () => 4);
  assert.equal(second.enemies[0].attack, 4);
  assert.equal(second.enemies[0].health, 5);
  assert.equal(original.enemies[0].attack, 8);
});

test('spinners add one damage per six without additional dice and retain automatic damage', () => {
  const rolls = [6, 6, 1];
  const fight = startLegendaryFight(party(), [enemy({ attack: 3, extraDamageOnSix: 1, automaticDamage: 1 })], { partyFirst: false });
  const next = legendaryEnemyAttack(fight, () => rolls.shift());
  assert.equal(next.pending.hits, 5);
  assert.equal(next.log.at(-1).sixDamage, 2);
  assert.deepEqual(next.log.at(-1).dice, [6, 6, 1]);
});

test('Death Hulk triggers once per roll with an exact triple, capped at three attacks', () => {
  const heroes = party().map(hero => ({ ...hero, health: 100, maxHealth: 100 }));
  let fight = startLegendaryFight(heroes, [enemy({ attack: 9, extraAttacksOnTriple: true })], { partyFirst: false });
  for (let i = 0; i < 3; i++) {
    const rolls = [6,6,6,1,1,1,2,2,2];
    fight = legendaryEnemyAttack(fight, () => rolls.shift());
    assert.equal(fight.pending.hits, 3);
    assert.equal(fight.enemyActions.length, i < 2 ? 1 : 0);
    fight = legendaryAssignDamage(fight, 0);
  }
  assert.equal(fight.phase, 'player');
  const original = startLegendaryFight(heroes, [enemy({ attack: 9, extraAttacksOnTriple: true })], { partyFirst: false });
  const rolls = [6,6,6,6,1,1,1,1,1];
  const noTriple = legendaryEnemyAttack(original, () => rolls.shift());
  assert.equal(noTriple.enemyActions.length, 0);
});

test('undamaged archers hit distinct heroes without armour; damaged special archers do not fire', () => {
  const heroes = party().map(hero => ({ ...hero, armour: 20 }));
  const archers = enemy({ attack: null, threshold: null, attackType: 'special',
    undamagedAttack: { hits: 2, recipients: 2, noArmour: true } });
  let fight = startLegendaryFight(heroes, [archers], { partyFirst: false });
  fight = legendaryAssignDamage(legendaryEnemyAttack(fight), 0, () => 6);
  const second = legendaryEnemyAttack(fight);
  assert.throws(() => legendaryAssignDamage(second, 0));
  fight = legendaryAssignDamage(second, 1, () => 6);
  assert.deepEqual(fight.party.map(hero => hero.health), [7, 7]);
  const damaged = startLegendaryFight(heroes, [archers], { partyFirst: false });
  damaged.roundEnemyDamage[0] = 1;
  assert.equal(legendaryEnemyAttack(damaged).pending, null);
});

test('Netter disables the next round without damage, then fights normally when alone', () => {
  const netter = enemy({ name: 'Netter', attack: 4, threshold: 3, netWhileOthersAlive: true });
  let fight = startLegendaryFight(party(), [netter, enemy({ attack: 0 })], { partyFirst: false });
  fight = legendaryEnemyAttack(fight, () => 3);
  assert.equal(fight.pending.stunOnly, true);
  fight = legendaryAssignDamage(fight, 0);
  assert.equal(fight.party[0].health, 9);
  fight = legendaryEnemyAttack(fight, () => 1);
  assert.equal(fight.round, 1);
  assert.equal(legendaryCanAct(fight, 0), false);
  assert.equal(legendaryCanAct(fight, 1), true);
  let standard = startLegendaryFight(party(), [netter, enemy({ attack: 0 })]);
  standard = legendarySkipAttack(legendarySkipAttack(standard, 0), 1);
  standard = legendaryAssignDamage(legendaryEnemyAttack(standard, () => 3), 0);
  standard = legendaryEnemyAttack(standard, () => 1);
  assert.equal(standard.round, 2);
  assert.equal(legendaryCanAct(standard, 0), false);
  assert.equal(legendaryCanAct(standard, 1), true);
  const alone = legendaryEnemyAttack(startLegendaryFight(party(), [netter], { partyFirst: false }), () => 3);
  assert.equal(alone.pending.stunOnly, undefined);
  assert.equal(alone.pending.hits, 4);
});

test('per-die weapon bonuses change hit results, not dice count or raw dice', () => {
  const hero = { ...newCrownCharacter('jessica'), armed: true, attackDieBonus: 2 };
  const hit = legendaryAttack(hero, 7, {}, () => 5);
  assert.equal(hit.dice.length, 7);
  assert.equal(hit.successes, 7);
  assert.deepEqual(hit.dice, Array(7).fill(5));
  assert.equal(legendaryAttack(hero, 7, { excludeWeapon: true }, () => 5).successes, 0);
  assert.equal(legendaryAttack({ ...hero, armed: false }, 7, {}, () => 5).successes, 0);
});

test('roof automatic damage ends when its guarding goblins are dead', () => {
  const foes = [enemy({ attack: 0, automaticDamage: 1, automaticDamageGuard: 1 }), enemy({ attack: 0 })];
  const first = startLegendaryFight(party(), foes, { partyFirst: false });
  assert.equal(legendaryEnemyAttack(first, () => 1).pending.hits, 1);
  first.enemies[1].health = 0;
  assert.equal(legendaryEnemyAttack(first, () => 1).pending, null);
});

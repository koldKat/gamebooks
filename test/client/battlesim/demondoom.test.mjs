import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMONDOOM_ROSTER, demondoomEnemy } from '../../../public/js/battlesim/engines/demonspawn/demondoom-roster.js';
import { rollDemondoomCharacter, transformedDemondoomCharacter, awardDemondoomSkill } from '../../../public/js/battlesim/engines/demonspawn/demondoom-character.js';
import { demondoomDamage, applyDemondoomPhysicalDamage, applyDemondoomSpellDamage, demondoomOutcome,
  finishDemondoomFight, demondoomRegentWeapon, demondoomAlternatingWeapon, demondoomInitialOrder,
  demondoomDeathLuck, useDemondoomTalisman } from '../../../public/js/battlesim/engines/demonspawn/demondoom-rules.js';
import { DEMONDOOM_ENCOUNTERS, prepareDemondoomEncounter } from '../../../public/js/battlesim/engines/demonspawn/demondoom-encounters.js';

test('Demondoom rolls seven characteristics; its printed initial Life formula excludes Skill and Power', () => {
  const low = rollDemondoomCharacter(() => 0);
  assert.equal(low.strength, 16); assert.equal(low.lifePoints, 112);
  assert.equal(low.maxLife, 112); assert.equal(low.skill, 10); assert.equal(low.power, 50);
  assert.equal(rollDemondoomCharacter(() => .999).lifePoints, 672);
  assert.equal(rollDemondoomCharacter(() => 0, 96).lifePoints, 112);
  assert.throws(() => rollDemondoomCharacter(() => 0, 97));
});

test('Resurrection penalties affect future Strength rolls, not existing character values', () => {
  const existing = rollDemondoomCharacter(() => .999);
  const before = structuredClone(existing);
  const revived = rollDemondoomCharacter(() => .999, existing.skill, 10);
  assert.equal(revived.strength, 86); assert.equal(revived.lifePoints, 662);
  assert.deepEqual(existing, before);
  assert.equal(rollDemondoomCharacter(() => 0, 10, 30).strength, 0);
  assert.throws(() => rollDemondoomCharacter(() => 0, 10, -10));
});

test('section185 transformation is explicit and does not mutate the original character or its retained items', () => {
  const original = { ...rollDemondoomCharacter(() => 0), usedSpells: ['invisibility'], resurrectionPenalty: 10 };
  const before = structuredClone(original);
  const transformed = transformedDemondoomCharacter(original);
  assert.equal(transformed.lifePoints, 744); assert.equal(transformed.power, 175);
  assert.equal(transformed.attraction, 100); assert.equal(transformed.skill, 95);
  transformed.usedSpells.push('paralysis');
  assert.deepEqual(original, before);
});

test('Skill rewards respect the printed96 cap and add only newly earned Skill to Life', () => {
  const player = rollDemondoomCharacter(() => 0, 95);
  assert.equal(awardDemondoomSkill(player), true);
  assert.equal(player.skill, 96); assert.equal(player.maxLife, 113); assert.equal(player.lifePoints, 113);
  assert.equal(awardDemondoomSkill(player), false); assert.equal(player.maxLife, 113);
});

test('all26 Demondoom profiles preserve printed Life totals rather than silently recalculating them', () => {
  assert.equal(DEMONDOOM_ROSTER.length, 26);
  assert.equal(demondoomEnemy('Assassin').lifePoints, 385);
  assert.equal(demondoomEnemy('Village Spawn').lifePoints, 467);
  assert.equal(demondoomEnemy('Spawn Captain').lifePoints, 705);
  assert.equal(demondoomEnemy('Demonspawn').lifePoints, 650);
  assert.deepEqual([1,2,3,4].map(index => demondoomEnemy('Stone Villager ' + index).strength), [48,50,60,58]);
  assert.deepEqual([1,2,3,4].map(index => demondoomEnemy('Stone Villager ' + index).lifePoints), [402,271,274,299]);
});

test('missing Sqquash and Golden Web attributes stay missing; source profiles cannot be mutated', () => {
  const squqash = demondoomEnemy('Satzensqquash');
  assert.equal(squqash.strength, null); assert.equal(squqash.skill, null); assert.equal(squqash.stamina, 400);
  const web = demondoomEnemy('Golden Web');
  assert.equal(web.strength, null); assert.equal(web.lifePoints, 500);
  web.lifePoints = 1;
  assert.equal(demondoomEnemy('Golden Web').lifePoints, 500);
  assert.ok(Object.isFrozen(DEMONDOOM_ROSTER));
  assert.ok(DEMONDOOM_ROSTER.every(Object.isFrozen));
  assert.throws(() => demondoomEnemy('Invented enemy'));
});

test('damage uses the detailed single Luck bonus, printed armour and optional half damage without invented rounding', () => {
  const attacker = {...rollDemondoomCharacter(() => 0), strength:80, skill:20, luck:144, weapon:'sword'};
  assert.equal(demondoomDamage(attacker,{armour:'leather',shield:true},4),10);
  assert.equal(demondoomDamage(attacker,{armour:'leather',shield:true},3),0);
  assert.equal(demondoomDamage(attacker,{armour:7},4,{halfDamage:true}),6.5);
  assert.throws(()=>demondoomDamage({...attacker,weapon:undefined},{},4),/weapon damage/);
  assert.throws(()=>demondoomDamage({...attacker,strength:null},{},4),/Strength/);
});

test('Doom transfers actual damage up to the natural Life cap with no invented ten-Life swing cost', () => {
  const player = {weapon:'doombringer',lifePoints:90,maxLife:100}, enemy = {lifePoints:100};
  applyDemondoomPhysicalDamage(player,enemy,0);
  assert.equal(player.lifePoints,90);
  applyDemondoomPhysicalDamage(player,enemy,15);
  assert.equal(player.lifePoints,100);assert.equal(enemy.lifePoints,85);
});

test('underground Doom reversal damages both sides and cannot award a win after killing the player', () => {
  const player = {weapon:'doombringer',lifePoints:20,maxLife:100}, enemy = {lifePoints:20};
  applyDemondoomPhysicalDamage(player,enemy,20,{doomReversal:true});
  assert.equal(player.lifePoints,0);assert.equal(enemy.lifePoints,0);
  assert.equal(demondoomOutcome(player,[enemy]),'death-luck');
  assert.equal(demondoomOutcome(player,[enemy],true),'loss');
});

test('underground spell damage doubles, but Golden Guards remain immune', () => {
  const enemy = {lifePoints:200};
  assert.equal(applyDemondoomSpellDamage(enemy,50,{doubleMagic:true}),100);
  assert.equal(enemy.lifePoints,100);
  assert.equal(applyDemondoomSpellDamage(enemy,50,{doubleMagic:true,magicImmune:true}),0);
  assert.equal(enemy.lifePoints,100);
});

test('group victory waits for every foe and Skill is awarded only once', () => {
  const fight = {player:rollDemondoomCharacter(()=>0),enemies:[{lifePoints:0},{lifePoints:1}]};
  assert.equal(demondoomOutcome(fight.player,fight.enemies),null);
  fight.enemies[1].lifePoints=0;
  assert.equal(demondoomOutcome(fight.player,fight.enemies),'win');
  assert.equal(finishDemondoomFight(fight,'win'),true);
  assert.equal(finishDemondoomFight(fight,'win'),false);
  assert.equal(fight.player.skill,11);
});

test('Regent and Cupric weapon cycles follow the printed combat-round sequence', () => {
  assert.deepEqual([1,2,3,4,5,6].map(round=>demondoomRegentWeapon(round,6)),[10,20,120,10,20,120]);
  assert.deepEqual([1,2,3,4].map(round=>demondoomAlternatingWeapon(round,15,10)),[15,10,15,10]);
  assert.throws(()=>demondoomRegentWeapon(3));
  assert.throws(()=>demondoomAlternatingWeapon(0,15,10));
});

test('initiative ties require another roll and death Luck uses strictly less than, not equality', () => {
  const player = {speed:16,courage:16,luck:16}, enemy = {...player};
  assert.equal(demondoomInitialOrder(player,enemy,2,2),null);
  assert.equal(demondoomInitialOrder(player,enemy,3,2),'player');
  assert.equal(demondoomDeathLuck(player,2),false);
  assert.equal(demondoomDeathLuck({...player,luck:17},2),true);
});

test('healing talisman is capped at ten post-fight uses and never revives a dead character', () => {
  const player = {healingTalisman:true,lifePoints:1,maxLife:100,talismanUses:9};
  assert.equal(useDemondoomTalisman(player,12),96);
  assert.equal(player.talismanUses,10);
  assert.equal(useDemondoomTalisman(player,12),0);
  assert.equal(useDemondoomTalisman({...player,lifePoints:0,talismanUses:0,talismanUsedAfterFight:false},12),0);
});

test('encounters distinguish sequential Spawn/Lions from simultaneous villagers and Spawn guards', () => {
  const player = rollDemondoomCharacter(()=>0);
  assert.throws(()=>prepareDemondoomEncounter(16,player),/two dice/);
  const village = prepareDemondoomEncounter(16,player,{spawnCount:12});
  assert.equal(village.enemies.length,12);assert.equal(village.encounter.sequential,true);
  assert.equal(prepareDemondoomEncounter(48,player).enemies.length,2);
  const villagers = prepareDemondoomEncounter(97,player);
  assert.equal(villagers.encounter.manualGroup,true);assert.equal(villagers.player.weapon,3);
  assert.deepEqual(villagers.enemies.map(enemy=>enemy.strength),[48,50,60,58]);
  for (const section of [231,243,246]) assert.equal(prepareDemondoomEncounter(section,player).encounter.manualGroup,true);
});

test('route variants preserve Doom reversal, double magic and Golden Guard immunity separately', () => {
  const player = {...rollDemondoomCharacter(()=>0),weapon:'sword'};
  for (const section of [119,131,159,166,175,178,186]) {
    const fight = prepareDemondoomEncounter(section,player);
    assert.equal(fight.player.weapon,'doombringer');assert.equal(fight.encounter.doomReversal,true);
  }
  for (const section of [124,138,156,184,193,195,201]) assert.equal(prepareDemondoomEncounter(section,player).encounter.doubleMagic,true);
  for (const section of [179,192,215]) assert.equal(prepareDemondoomEncounter(section,player).encounter.doomReversal,undefined);
  assert.equal(prepareDemondoomEncounter(227,player).encounter.opening,2);
  assert.equal(prepareDemondoomEncounter(189,player).encounter.opening,1);
  assert.equal(prepareDemondoomEncounter(242,player).encounter.magicImmune,true);
});

test('unknown printed weapon bonuses stay manual instead of defaulting to bare hands', () => {
  const player = rollDemondoomCharacter(()=>0);
  for (const section of [48,58,89,109]) assert.equal(prepareDemondoomEncounter(section,player).enemies[0].manualWeapon,true);
  assert.equal(prepareDemondoomEncounter(119,player).enemies[0].weapon,0);
  assert.equal(prepareDemondoomEncounter(175,player).enemies[0].weapon,0);
});

test('encounter preparation does not mutate player state or immutable source definitions', () => {
  const player = {...rollDemondoomCharacter(()=>0),weapon:'sword'};
  const before = structuredClone(player);
  const snake = prepareDemondoomEncounter(140,player);
  assert.equal(snake.player.strength,8);assert.deepEqual(player,before);
  assert.equal(prepareDemondoomEncounter(14,player).player.weapon,'unarmed');
  assert.ok(Object.isFrozen(DEMONDOOM_ENCOUNTERS));
  assert.ok(DEMONDOOM_ENCOUNTERS.every(Object.isFrozen));
  assert.throws(()=>prepareDemondoomEncounter(161,{...player,weapon:'doombringer'}),/ordinary weapon/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCryptsEncounter, rollCryptsCharacter } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-encounters.js';
import { createCryptsFight, resolveCryptsDeathLuck, rollCryptsAttack } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror.js';
import { createCryptsMagicSection, castCryptsPlayerSpell, castCryptsEnemySpell,
  useCryptsRosewoodBox, tryCryptsOrb, useCryptsWand } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-magic.js';

const high = () => .999, low = () => 0;
const player = extra => ({...rollCryptsCharacter(high),weapon:'sword',armour:'none',power:250,maxPower:250,...extra});
function setup(section = 100, extra = {}, options = {}) {
  const p = player(extra);
  const fight = createCryptsFight(prepareCryptsEncounter(section,p,options));
  const magic = createCryptsMagicSection(section,fight.player,fight.enemies);
  magic.inclination = true;
  return {fight,magic};
}

test('player spells spend Power even when they fail and cannot repeat in a section', () => {
  const {fight,magic} = setup();
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{},low).success,false);
  assert.equal(fight.player.power,235);
  assert.equal(fight.enemy.lifePoints,300);
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{},high).error,'unavailable');
});

test('insufficient Power and invalid targets consume neither resources nor randomness', () => {
  const {fight,magic} = setup(100,{power:0});
  const before = structuredClone(fight);
  const random = () => { throw new Error('Unexpected roll'); };
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{},random).error,'insufficient-power');
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{target:-1},random).error,'no-target');
  assert.deepEqual(fight,before);
  assert.deepEqual(magic.used,[]);
});

test('Fireball bypasses physical armour but respects magic armour, fear and the curse', () => {
  const {fight,magic} = setup(34,{}, {cursedStone:true});
  fight.enemies[1].magicArmour=10;
  fight.player.magicFear=5;
  const initial = fight.enemies[1].lifePoints;
  const result = castCryptsPlayerSpell(fight,magic,'fireball',{target:1},high);
  assert.equal(result.damage,17.5);
  assert.equal(fight.enemies[1].lifePoints,initial-17.5);
  assert.deepEqual(fight.enemyDamage,[0,17.5]);
});

test('player Timewarp restores the section opening of every foe, not only the selected target', () => {
  const {fight,magic} = setup(34);
  const initial = fight.enemies.map(e => e.lifePoints);
  fight.player.lifePoints-=20;
  fight.enemies[0].lifePoints-=100;
  fight.enemies[1].lifePoints-=50;
  fight.enemyDamage=[100,50];fight.playerDamage=20;
  const result=castCryptsPlayerSpell(fight,magic,'timewarp',{target:1},high);
  assert.equal(result.success,true);
  assert.equal(fight.player.lifePoints,magic.opening.playerLife);
  assert.deepEqual(fight.enemies.map(e => e.lifePoints),initial);
  assert.deepEqual(fight.enemyDamage,[0,0]);assert.equal(fight.playerDamage,0);
  assert.equal(fight.player.power,240);
});

test('Crypt returns to an actual initiation entrance and rejects invalid entrances before paying', () => {
  const {fight,magic} = setup();
  assert.equal(castCryptsPlayerSpell(fight,magic,'crypt',{cryptStart:150},high).error,'invalid-initiation');
  assert.equal(fight.player.power,250);
  const result=castCryptsPlayerSpell(fight,magic,'crypt',{cryptStart:74},high);
  assert.equal(result.destination,74);assert.equal(fight.outcome,'warped');
});

test('wizard duel forbids Needle, artifacts and Life-funded spells', () => {
  const {fight,magic} = setup(111,{}, {manual:player()});fight.turn='player';
  assert.equal(castCryptsPlayerSpell(fight,magic,'poisonNeedle',{},high).error,'forbidden-spell');
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{useLife:true},high).error,'power-only');
  fight.player.rosewoodBox=true;fight.options.orb=true;fight.player.wandCharges=10;
  assert.equal(useCryptsRosewoodBox(fight),false);
  assert.equal(tryCryptsOrb(fight,high),null);
  assert.equal(useCryptsWand(fight,0,high),null);
  assert.equal(fight.player.power,250);
});

test('wizard duel ends on the first failed spell and awards surviving combat Skill once', () => {
  const {fight,magic} = setup(111,{}, {manual:player()});fight.turn='player';
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{},low).success,false);
  assert.equal(fight.outcome,'defeat');assert.equal(fight.player.skill,11);
  assert.equal(fight.player.power,235);
  assert.equal(castCryptsPlayerSpell(fight,magic,'armour',{},high).error,'unavailable');
  assert.equal(fight.player.skill,11);
});

test('wizard duel ends at half Life before ordinary death checks', () => {
  const {fight,magic} = setup(111,{}, {manual:player({lifePoints:100,maxLife:100})});
  fight.turn='player';
  castCryptsPlayerSpell(fight,magic,'fireball',{},high);
  assert.equal(fight.outcome,'win');assert.equal(fight.pending,null);
  assert.equal(fight.player.skill,11);
});

test('wizard duel rejects physical attacks by either combatant', () => {
  const {fight}=setup(111,{}, {manual:player()});
  fight.turn='enemy';assert.equal(rollCryptsAttack(fight,'enemy',0,high).error,'magic-only');
  fight.turn='player';assert.equal(rollCryptsAttack(fight,'player',0,high).error,'magic-only');
});

test('duel transport and avoidance spells do not invent a victory condition', () => {
  const {fight,magic}=setup(111,{}, {manual:player()});fight.turn='player';
  const result=castCryptsPlayerSpell(fight,magic,'paralysis',{},high);
  assert.equal(result.manualEffect,true);assert.equal(fight.outcome,null);
  assert.equal(fight.enemy.paralysed,undefined);
  fight.turn='enemy';const other=castCryptsEnemySpell(fight,0,'invisibility',high);
  assert.equal(other.manualEffect,true);assert.equal(fight.outcome,null);
  assert.equal(fight.enemy.escaped,undefined);
});

test('refusing magic ends a wizard duel without spending Power', () => {
  const {fight,magic}=setup(111,{}, {manual:player()});fight.turn='player';magic.inclination=false;
  assert.equal(castCryptsPlayerSpell(fight,magic,'fireball',{},high).error,'no-inclination');
  assert.equal(fight.outcome,'defeat');assert.equal(fight.player.power,250);
});

test('enemy spellcasting uses its printed spell list and does not invent unlimited Power', () => {
  const {fight} = setup(71);fight.turn='enemy';
  assert.equal(castCryptsEnemySpell(fight,0,'armour',high).error,'unavailable');
  assert.equal(castCryptsEnemySpell(fight,0,'fireball',high).damage,50);
  assert.equal(fight.enemy.power,85);
  fight.turn='enemy';castCryptsEnemySpell(fight,0,'fireball',high);
  assert.equal(fight.enemy.power,70);
  fight.enemy.power=0;fight.turn='enemy';
  assert.equal(castCryptsEnemySpell(fight,0,'fireball',high).error,'insufficient-power');
});

test('enemy Fireball respects player magic armour and doubles curse damage', () => {
  const {fight} = setup(71,{}, {cursedStone:true});fight.turn='enemy';
  fight.player.magicArmour=10;fight.enemy.magicFear=5;
  const initial=fight.player.lifePoints;
  assert.equal(castCryptsEnemySpell(fight,0,'fireball',high).damage,70);
  assert.equal(fight.player.lifePoints,initial-70);
});

test('an enemy retains its magical armour when later casting a different spell', () => {
  const {fight} = setup(111,{}, {manual:player()});fight.turn='enemy';
  castCryptsEnemySpell(fight,0,'armour',high);assert.equal(fight.enemy.magicArmour,10);
  fight.turn='enemy';castCryptsEnemySpell(fight,0,'fireball',high);
  assert.equal(fight.enemy.magicArmour,10);
});

test('Manticore paralysis grants three unanswered rounds without making it flee', () => {
  const {fight} = setup(108);fight.turn='enemy';
  assert.equal(castCryptsEnemySpell(fight,0,'paralysis',high).success,true);
  assert.equal(fight.paralysedPlayerRounds,3);
  assert.equal(fight.enemy.escaped,undefined);assert.equal(fight.outcome,null);
});

test('section144 Orb possession dispels all images without an invented roll', () => {
  const {fight} = setup(144,{}, {orb:true});
  assert.equal(tryCryptsOrb(fight,() => {throw new Error('No roll in section144');}),true);
  assert.equal(fight.outcome,'avoided');assert.ok(fight.enemies.every(e => e.escaped));
});

test('ordinary Orb protection needs11 or12 and can only be attempted once', () => {
  const {fight} = setup(149,{}, {orb:true});
  assert.equal(tryCryptsOrb(fight,low),false);assert.equal(fight.options.orbActive,false);
  assert.equal(tryCryptsOrb(fight,high),null);
  const other=setup(149,{}, {orb:true}).fight;
  assert.equal(tryCryptsOrb(other,high),true);assert.equal(other.options.orbActive,true);
});

test('rosewood box paralyses at most four Alchillers once without harming them', () => {
  const {fight}=setup(83,{rosewoodBox:true});const initial=fight.enemies.map(e=>e.lifePoints);
  assert.equal(useCryptsRosewoodBox(fight),true);assert.equal(fight.outcome,'avoided');
  assert.deepEqual(fight.enemies.map(e=>e.lifePoints),initial);
  assert.equal(fight.player.rosewoodBox,false);assert.equal(useCryptsRosewoodBox(fight),false);
});

test('wand consumes a charge and five Power even on failure but never rolls if unaffordable', () => {
  const {fight}=setup(100,{wandCharges:2,power:5});
  assert.equal(useCryptsWand(fight,0,low),false);assert.equal(fight.player.wandCharges,1);
  assert.equal(fight.player.power,0);
  assert.equal(useCryptsWand(fight,0,()=>{throw new Error('Unaffordable');}),null);
  fight.player.power=5;assert.equal(useCryptsWand(fight,0,high),true);
  assert.equal(fight.outcome,'avoided');assert.equal(fight.player.wandCharges,0);
});

test('successful death Luck restarts group counters and all foes but is available only once', () => {
  const {fight}=setup(34);fight.player.lifePoints=0;fight.pending='death-luck';
  fight.playerDamage=400;fight.enemyDamage=[300,200];fight.openingStrikes=[0,1];fight.ratHits=2;
  fight.enemies[1].paralysed=true;fight.enemies[0].escaped=true;
  assert.equal(resolveCryptsDeathLuck(fight,low),true);
  assert.equal(fight.player.lifePoints,fight.player.maxLife);
  assert.deepEqual(fight.enemyDamage,[0,0]);assert.equal(fight.playerDamage,0);
  assert.deepEqual(fight.openingStrikes,[]);assert.equal(fight.ratHits,0);
  assert.ok(fight.enemies.every(e=>e.lifePoints===e.maxLife && !e.paralysed && !e.escaped));
  assert.equal(fight.luckUsed,true);assert.equal(resolveCryptsDeathLuck(fight,low),null);
});

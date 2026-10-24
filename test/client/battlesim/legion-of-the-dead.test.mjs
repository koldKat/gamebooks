import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(533);
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegionCharacter, initialLegionLife, legionEquipment, legionStrike,
  legionVisit, legionHeal, legionTakeItem, legionReincarnate, legionDream,
  startLegionFight, legionInitiative, legionAssignEnemy, legionRound,
  legionCast, legionProjectile, legionEquip, legionSunstone, legionAmulet,
  legionWand, legionBat, legionSleep, legionFriendly, legionCollar,
  settleLegionFight } from '../../../public/js/battlesim/engines/grailquest/legion-of-the-dead.js';
import { LEGION_ENCOUNTERS, LEGION_EQUIPMENT } from '../../../public/js/battlesim/engines/grailquest/legion-of-the-dead-roster.js';

const random = (...faces) => { let index = 0; return () => ((faces[index++] ?? 1)-1)/6; };
const rolls = (...totals) => random(...totals.flatMap(total => [Math.min(6,total-1), Math.max(1,total-6)]));
const character = () => ({ ...createLegionCharacter(), life: 48, maxLife: 48 });
const fight = (id, options = {}, player = character()) => {
  const result = startLegionFight(player,id,options,random(1));
  result.first = 'player';
  return result;
};

test('Legion starting LIFE uses best of three, reincarnation one only', () => {
  assert.equal(initialLegionLife(0,rolls(2,12,4)).life,48);
  const result = initialLegionLife(3,rolls(2,12,12),true);
  assert.equal(result.life,11);
  assert.deepEqual(result.rolls,[2]);
});
test('Legion equipment is a six-item choice, not automatic supplies', () => {
  const player = character();
  assert.equal(LEGION_EQUIPMENT.length,32);
  assert.deepEqual(player.equipment,[]);
  assert.equal(legionEquipment(player,LEGION_EQUIPMENT.slice(0,6)),true);
  assert.equal(legionEquipment(player,LEGION_EQUIPMENT.slice(0,7)),false);
  assert.equal(legionEquipment(player,['Axe','Axe']),false);
});
test('Legion base damage is surplus above strike threshold plus weapon', () => {
  assert.deepEqual(legionStrike(4,4,5),{hit:true,damage:5});
  assert.deepEqual(legionStrike(6),{hit:true,damage:0});
  assert.equal(legionStrike(12,4,5,3).damage,10);
  assert.throws(() => legionStrike(13),RangeError);
});
test('Legion rock shapes permit a genuinely empty group', () => {
  const result = fight(24,{enemyCount:0});
  assert.equal(result.status,'win');
  assert.equal(result.foes.length,0);
  assert.throws(() => fight(24,{enemyCount:6}),RangeError);
});
test('Legion unspecified farmer LIFE is mandatory manual input', () => {
  assert.throws(() => fight(213),/does not specify/);
  assert.equal(fight(213,{enemyLife:33}).foes[0].life,33);
});
test('Legion first-strike exceptions and ties remain explicit', () => {
  assert.equal(startLegionFight(character(),13).first,'player');
  assert.equal(startLegionFight(character(),109).first,'player');
  assert.equal(startLegionFight(character(),182).first,'enemy');
  const result = startLegionFight(character(),4);
  assert.equal(legionInitiative(result,rolls(8,8)).first,null);
  assert.equal(legionRound(result),null);
});
test('Legion reincarnation loses items but preserves kill history and earned LIFE', () => {
  const player = character();
  player.permanent = 3; player.experience = 27; player.gold = 99;
  player.monkey = true; player.cubeUses = 6; player.killed['4:0'] = true;
  legionReincarnate(player,rolls(2,12,12));
  assert.equal(player.life,11); assert.equal(player.gold,0);
  assert.equal(player.monkey,false); assert.equal(player.cubeUses,0);
  assert.equal(player.experience,27); assert.equal(player.deaths,1);
  assert.equal(startLegionFight(player,4).foes[0].life,10);
});
test('Legion repeated foes halve original LIFE, not their previous starting value', () => {
  const player = character(); player.killed['71:0'] = true;
  const result = fight(71,{},player);
  assert.deepEqual(result.foes.map(enemy => enemy.life),[15,30]);
});
test('Legion cube has six uses and cannot resurrect', () => {
  const player = character(); player.life = 10;
  legionTakeItem(player,'cube');
  assert.equal(legionHeal(player,'cube',rolls(12)).healing,12);
  assert.equal(player.cubeUses,5);
  player.life = 0;
  assert.equal(legionHeal(player,'cube'),null);
  assert.equal(player.cubeUses,5);
});
test('Legion pool water requires a container and supplies six total restores', () => {
  const player = character();
  assert.equal(legionTakeItem(player,'water'),null);
  legionEquipment(player,['Waterskin (full)','Wineskin (full)','Whiskeyskin (full)']);
  legionTakeItem(player,'water');
  assert.equal(player.waterUses,6);
});
test('Legion tea offers alternative full or dice modes, not both', () => {
  const player = character(); player.life = 8;
  legionTakeItem(player,'teaFull');
  assert.equal(legionHeal(player,'tea').healing,40);
  assert.equal(player.teaUses,0);
  legionTakeItem(player,'teaDice'); player.life = 8;
  assert.equal(legionHeal(player,'tea',rolls(2)).healing,2);
  assert.equal(player.teaUses,2);
});
test('Legion Jade Vampire drain ticks on new sections, not redraws', () => {
  const player = character(); player.drain = 2;
  legionVisit(player,7); assert.equal(player.life,46);
  assert.equal(legionVisit(player,7),null); assert.equal(player.life,46);
  legionVisit(player,8); assert.equal(player.life,44);
});
test('Legion moonshine sight check can only happen once per section', () => {
  const player = character(); player.blind = true; player.currentSection = 8;
  assert.equal(legionVisit(player,8,rolls(12)),null);
  assert.equal(player.blind,true);
  legionVisit(player,9,rolls(12)); assert.equal(player.blind,false);
});
test('Legion cold check duration follows section visits', () => {
  const player = character(); legionTakeItem(player,'cold');
  legionVisit(player,1,random(4)); assert.equal(player.coldSections,10);
  assert.equal(player.coldChecks,2);
  legionVisit(player,2,random(1)); assert.equal(player.coldSections,9);
});
test('Legion flattened EJ lasts two fights only', () => {
  const player = character(); legionTakeItem(player,'flattened');
  const first = fight(4,{},player);
  assert.equal(first.flattened,true); assert.equal(first.player.flattenedFights,1);
  const second = fight(4,{},first.player);
  assert.equal(second.flattened,true); assert.equal(second.player.flattenedFights,0);
  assert.equal(fight(4,{},second.player).flattened,false);
});
test('Legion Wildcat and Knar force unarmed damage', () => {
  for (const id of [53,81]) {
    const result = fight(id);
    assert.equal(legionRound(result,0,rolls(7,2)).events[0].damage,1);
  }
});
test('Legion ghosts frighten without ordinary damage, but high rolls kill', () => {
  const result = fight(122,{enemyCount:2});
  const turn = legionRound(result,0,rolls(2,10,2));
  assert.equal(turn.events[1].damage,0); assert.equal(result.player.life,48);
  legionRound(result,0,rolls(2,11)); assert.equal(result.player.life,0);
});
test('Legion demon poison doubles damage and pre-cast immunity prevents doubling', () => {
  const result = fight(9);
  assert.equal(legionRound(result,0,rolls(2,11)).events[1].damage,10);
  const player = character(); player.poisonImmune = true;
  assert.equal(legionRound(fight(9,{},player),0,rolls(2,11)).events[1].damage,5);
});
test('Legion wrestling stops below ten, not at ten', () => {
  const result = fight(66);
  result.foes[0].life = 10;
  legionRound(result,0,rolls(6,2)); assert.equal(result.status,'fighting');
  legionRound(result,0,rolls(7)); assert.equal(result.status,'win');
});
test('Legion wrestling natural twelve pins without lethal kill history', () => {
  const result = fight(66);
  legionRound(result,0,rolls(12));
  assert.equal(result.status,'win'); assert.deepEqual(result.player.killed,{});
});
test('Legion Smith contest costs pseudo LIFE and restores real LIFE afterwards', () => {
  const result = fight(146);
  assert.equal(result.player.life,43);
  result.foes[0].life = 1;
  legionRound(result,0,rolls(7));
  assert.equal(result.status,'win'); assert.equal(result.player.life,48);
});
test('Legion guard contest requires halving both guards', () => {
  const result = fight(150);
  result.foes[0].life = 10;
  assert.equal(result.status,'fighting');
  result.foes[1].life = 12;
  legionRound(result,1,rolls(5));
  assert.equal(result.status,'win');
});
test('Legion surprise vampire attack is excluded from its three-hit sequence', () => {
  const result = fight(182); result.first = 'enemy';
  result.player.life = result.player.maxLife = 100;
  legionRound(result,0,rolls(6,2));
  assert.equal(result.foes[0].consecutive.player,undefined);
  legionRound(result,0,rolls(6,2));
  legionRound(result,0,rolls(6,2));
  assert.equal(result.player.life,100);
  legionRound(result,0,rolls(6)); assert.equal(result.player.life,0);
});
test('Legion Jade Vampire infects only after three consecutive hits', () => {
  const result = fight(110);
  for (let turn = 0; turn < 3; turn++) legionRound(result,0,rolls(2,5));
  assert.equal(result.player.drain,2);
});
test('Legion Haggis gives Pip two attacks to one', () => {
  const result = fight(208);
  assert.deepEqual(legionRound(result,0,rolls(2,2,2)).events.map(event => event.kind),['player','player','enemy']);
});
test('Legion distillery drunkenness hits on every third throw', () => {
  const result = fight(225);
  assert.equal(legionRound(result,0,rolls(12,2)).events[0].hit,false);
  assert.equal(legionRound(result,0,rolls(12,2)).events[0].hit,false);
  assert.equal(legionRound(result,0,rolls(12,2)).events[0].hit,true);
});
test('Legion brandy skips every third blow, not two of three', () => {
  const player = character(); player.life = 10;
  legionTakeItem(player,'brandy'); legionHeal(player,'brandy');
  const result = fight(81,{},player);
  assert.equal(legionRound(result,0,rolls(7,2)).events[0].hit,true);
  assert.equal(legionRound(result,0,rolls(7,2)).events[0].hit,true);
  assert.equal(legionRound(result,0,rolls(7,2)).events[0].hit,false);
});
test('Legion zero damage Strangler-Vine counterpart cannot harm Pip', () => {
  const result = fight('144-creeper');
  legionRound(result,0,rolls(2,12));
  assert.equal(result.player.life,48);
});
test('Legion ordinary spells cost LIFE even on failure and exhaust attempts', () => {
  const player = character();
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(legionCast(player,'pip',rolls(2)).success,false);
  assert.equal(player.life,39); assert.equal(legionCast(player,'pip'),null);
  assert.equal(legionCast(player,'pops'),null);
});
test('Legion Firefinger and Fireball retain bounded stocks after successful casts', () => {
  const player = character();
  legionCast(player,'firefinger',rolls(7)); legionCast(player,'fireball',rolls(7));
  assert.equal(player.bolts,10); assert.equal(player.fireballs,2);
  assert.equal(legionCast(player,'firefinger'),null);
  const result = fight(4,{},player);
  legionProjectile(result,'bolt'); assert.equal(result.player.bolts,9);
  assert.equal(legionProjectile(result,'bad'),null);
});
test('Legion invisibility is restricted and costs fifteen LIFE once', () => {
  const result = fight(4);
  assert.equal(legionCast(result.player,'invisibility',rolls(7),result),null);
  result.options.invisibilityAllowed = true;
  const cast = legionCast(result.player,'invisibility',rolls(7),result);
  assert.equal(cast.cost,15); assert.equal(result.player.life,33);
  assert.equal(legionCast(result.player,'invisibility',rolls(7),result),null);
});
test('Legion companion-directed fatal attacks do not kill Pip', () => {
  const player = character(); legionTakeItem(player,'skeleton');
  const result = fight(19,{useSkeleton:true},player);
  assert.equal(legionAssignEnemy(result,0,'skeleton'),true);
  legionRound(result,0,rolls(2,2,11));
  assert.equal(result.allies.skeleton.life,0); assert.equal(result.player.life,48);
});
test('Legion baby dragon expires after seven combats', () => {
  const player = character(); legionTakeItem(player,'dragon');
  let saved = player;
  for (let battle = 0; battle < 7; battle++) {
    const result = fight(4,{},saved);
    assert.ok(result.allies.dragon);
    result.foes[0].life = 1;
    legionRound(result,0,rolls(5));
    saved = result.player;
  }
  assert.equal(fight(4,{},saved).allies.dragon,undefined);
});
test('Legion dreams restore only living characters and enforce printed thresholds', () => {
  const player = character(); player.life = 10;
  assert.equal(legionDream(player,2,rolls(5)).healing,10);
  legionDream(player,10,rolls(7)); assert.equal(player.life,0);
  assert.equal(legionDream(player,6),null);
});
test('Legion Dreamtime rewards match printed gold and armour', () => {
  const player = character();
  legionDream(player,3); legionDream(player,11); legionDream(player,12);
  assert.equal(player.gold,850); assert.equal(player.dreamArmour,1);
});
test('Legion newly started fights do not mutate saved characters or source roster', () => {
  const player = character(), before = structuredClone(player);
  const result = fight(4,{},player);
  legionRound(result,0,rolls(2,12));
  assert.deepEqual(player,before);
  assert.equal(LEGION_ENCOUNTERS[0].enemies[0].life,20);
});

test('Legion invalid dart targets consume neither LIFE nor an attempt', () => {
  const result = fight(4), before = structuredClone(result.player);
  assert.equal(legionCast(result.player,'pad',rolls(12),result,9),null);
  assert.deepEqual(result.player,before);
});
test('Legion lock picker uses its specific six-or-higher threshold', () => {
  const player = character();
  player.currentSection = 1;
  assert.equal(legionCast(player,'plop',rolls(6)).success,true);
  legionVisit(player,2);
  assert.equal(legionCast(player,'plop',rolls(5)).success,false);
  assert.equal(legionCast(player,'pin',rolls(6)).success,false);
});
test('Legion lock picker cannot retry a lock in the same section', () => {
  const player = character(); player.currentSection = 1;
  legionCast(player,'plop',rolls(2));
  const before = structuredClone(player);
  assert.equal(legionCast(player,'plop',rolls(12)),null);
  assert.deepEqual(player,before);
});
test('Legion collar is one pre-combat attempt and consumes no gold', () => {
  const player = character(); player.collar = true;
  const result = fight(4,{},player);
  assert.deepEqual(legionCollar(result,rolls(9)),{roll:9,success:false});
  assert.equal(legionCollar(result,rolls(12)),null);
  const next = fight(4,{},result.player);
  assert.equal(legionCollar(next,rolls(10)).success,true);
  assert.equal(next.status,'bypassed'); assert.equal(next.player.gold,0);
});
test('Legion creeper weakness counts rounds until death, not knockout', () => {
  const result = fight('144-creeper');
  legionRound(result,0,rolls(12,2));
  assert.equal(result.status,'fighting');
  assert.equal(result.foes[0].life,7);
  legionRound(result,0,rolls(6,2));
  assert.equal(result.status,'win'); assert.equal(result.foes[0].life,0);
  assert.equal(result.player.creeperFights,2);
});
test('Legion section drain settles combat without restoring or reviving Pip', () => {
  const player = character(); player.life = 7; player.drain = 2;
  const result = fight(4,{},player);
  legionVisit(result.player,9); settleLegionFight(result);
  assert.equal(result.status,'loss'); assert.equal(result.player.life,5);
});
test('Legion weapon selection requires owning the leek', () => {
  const player = character();
  assert.equal(legionEquip(player,'leek'),false);
  legionTakeItem(player,'leek');
  assert.equal(legionEquip(player,'leek'),true);
  assert.equal(player.hit,9);
  assert.equal(legionEquip(player,'unarmed'),true);
  assert.equal(player.hit,6);
  assert.equal(legionEquip(player,'ej'),true);
  assert.equal(player.bonus,5);
});
test('Legion Sunstone choices are exclusive and cannot be used twice', () => {
  for (const use of ['gold','life','destroy']) {
    const player = character(); legionTakeItem(player,'sunstone');
    const result = fight(71,{},player);
    assert.deepEqual(legionSunstone(result.player,use,result),{use});
    assert.equal(legionSunstone(result.player,use,result),null);
    assert.equal(result.player.gold,use === 'gold' ? 100000000 : 0);
    assert.equal(result.player.permanent,use === 'life' ? 20 : 0);
    assert.equal(result.status,use === 'destroy' ? 'win' : 'fighting');
  }
});
test('Legion Amulet rejects healing in combat without spending a charge', () => {
  const player = character(); player.amuletUses = 2;
  const result = fight(4,{},player);
  assert.equal(legionAmulet(result.player,'heal',rolls(12),result),null);
  assert.equal(result.player.amuletUses,2);
  assert.deepEqual(legionAmulet(result.player,'damage',rolls(12),result),{use:'damage'});
  assert.equal(result.damageBonus,2);
  assert.equal(result.player.amuletUses,1);
  legionAmulet(result.player,'knockout',rolls(12),result);
  assert.equal(result.knockout,10);
  assert.equal(result.player.amuletUses,0);
  assert.equal(fight(4,{},result.player).damageBonus,0);
});
test('Legion Amulet gold and healing use one charge each', () => {
  const player = character(); player.life = 10; player.amuletUses = 2;
  assert.equal(legionAmulet(player,'heal',rolls(12)).healing,12);
  legionAmulet(player,'gold');
  assert.equal(player.gold,1000); assert.equal(player.amuletUses,0);
  assert.equal(legionAmulet(player,'gold'),null);
});
test('Legion Lotus Wand requires the learned activation word', () => {
  const player = character(); player.wandUses = 3;
  assert.equal(legionWand(player,'gold'),null);
  assert.equal(player.wandUses,3);
  player.wandWord = true; player.life = 12; player.drain = 2;
  player.blind = true; player.coldSections = 5; player.fingerLost = true;
  assert.equal(legionWand(player,'gold').healing,36);
  assert.equal(player.drain,0); assert.equal(player.blind,false);
  assert.equal(player.coldSections,0); assert.equal(player.fingerLost,false);
  assert.equal(player.wandUses,2);
});
test('Legion Lotus Wand combat bonuses stay in the current fight', () => {
  const player = character(); player.wandWord = true; player.wandUses = 3;
  const result = fight(4,{},player);
  legionWand(result.player,'blue',result); legionWand(result.player,'red',result);
  assert.equal(result.armourBonus,3); assert.equal(result.damageBonus,2);
  const next = fight(4,{},result.player);
  assert.equal(next.armourBonus,0); assert.equal(next.damageBonus,0);
  legionWand(result.player,'green',result);
  assert.equal(result.status,'bypassed'); assert.equal(result.player.wandUses,0);
});
test('Legion bat transformation spends a charge only when transforming', () => {
  const player = character(); player.ringUses = 1;
  const result = fight(4,{},player);
  assert.equal(legionBat(result),true); assert.equal(result.bat,true);
  assert.equal(result.player.ringUses,0);
  assert.equal(legionBat(result),true); assert.equal(result.bat,false);
  assert.equal(legionBat(result),false);
});
test('Legion sleep chooses healing or Dreamtime without reviving the dead', () => {
  const player = character(); player.life = 10;
  assert.deepEqual(legionSleep(player,random(5,6,6)),{roll:5,healing:12});
  assert.deepEqual(legionSleep(player,random(4,1,1)),{roll:4,dream:2});
  player.life = 0; assert.equal(legionSleep(player),null);
});
test('Legion friendly reaction compares three player throws with one enemy throw', () => {
  const result = fight(4);
  assert.deepEqual(legionFriendly(result,random(6,1,1,1)),{enemy:6,player:3,success:true});
  assert.equal(result.status,'bypassed');
  assert.equal(legionFriendly(result),null);
  assert.equal(legionFriendly(fight(154)),null);
  assert.equal(legionFriendly(fight(66)),null);
});
test('Legion companion drain follows section visits without affecting Pip', () => {
  const player = character(); legionTakeItem(player,'skeleton');
  player.companions.skeleton.drain = 2;
  legionVisit(player,8);
  assert.equal(player.companions.skeleton.life,28); assert.equal(player.life,48);
  legionVisit(player,8);
  assert.equal(player.companions.skeleton.life,28);
});

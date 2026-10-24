import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(531);
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmCharacter, initialRealmLife, realmStrike, realmChooseEquipment,
  realmFriendlyReaction, realmBribe, realmHeal, realmAstralRoll, realmWalkPath,
  realmDragonReaction, realmHealingWand, realmDream, startRealmFight, realmTargets,
  rerollRealmInitiative, rollRealmRound, realmTryBribe, realmTryFriendly,
  realmSleep, realmStrengthContest, realmVisit, realmReincarnate,
  realmUseCompanion, realmUseSpookBasher, realmUseHorrorgem, realmCallDragon }
  from '../../../public/js/battlesim/engines/grailquest/realm-of-chaos.js';
import { REALM_ENCOUNTERS, REALM_DREAMS, REALM_EQUIPMENT, REALM_COMPANION }
  from '../../../public/js/battlesim/engines/grailquest/realm-of-chaos-roster.js';

const rolls = (...values) => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'Unexpected random roll'); return (values[index++] - 1) / 6; };
};
const character = extra => ({ ...createRealmCharacter(), life: 30, maxLife: 48, ...extra });

test('Starting LIFE takes the best of three rolls and carries at most ten permanent points', () => {
  assert.deepEqual(initialRealmLife(23, rolls(1,1,4,5,2,2)),
    { life:46,maxLife:46,permanent:10,rolls:[2,9,4] });
  assert.throws(()=>initialRealmLife(-1), RangeError);
});
test('Ordinary damage uses excess over hit, weapon bonus and armour; fixed damage stays fixed', () => {
  assert.deepEqual(realmStrike(7,4,5,3), {hit:true,damage:5});
  assert.deepEqual(realmStrike(6,6,0), {hit:true,damage:0});
  assert.deepEqual(realmStrike(5,6,0,0,{fixedDamage:12}), {hit:false,damage:0});
  assert.deepEqual(realmStrike(12,6,0,4,{fixedDamage:12}), {hit:true,damage:8});
  assert.throws(()=>realmStrike(6,3,null), RangeError);
});
test('Starting equipment is a six-item choice, not the whole inventory', () => {
  const p=character(), selected=REALM_EQUIPMENT.slice(0,6);
  realmChooseEquipment(p,selected); selected.pop(); assert.equal(p.equipment.length,6);
  assert.throws(()=>realmChooseEquipment(p,REALM_EQUIPMENT.slice(0,7)),RangeError);
  assert.throws(()=>realmChooseEquipment(p,['stake','stake']),RangeError);
});
test('Friendly reaction is strictly lower and a refused bribe still spends the offered gold', () => {
  assert.equal(realmFriendlyReaction(rolls(3,1,1,1)).success,false);
  assert.equal(realmFriendlyReaction(rolls(6,1,1,1)).success,true);
  const p=character({gold:2000});
  assert.equal(realmBribe(p,1000,rolls(3,4)).success,false); assert.equal(p.gold,1000);
  assert.equal(realmBribe(p,1000,rolls(4,4)).success,true); assert.equal(p.gold,0);
  assert.throws(()=>realmBribe(p,1000,rolls()),RangeError);
});
test('Salve heals three, potion rolls two dice, neither revives or exceeds starting LIFE', () => {
  const p=character({life:47,salves:5,potions:6});
  assert.equal(realmHeal(p,'salve').restored,1); assert.equal(p.salves,4);
  p.life=30; assert.equal(realmHeal(p,'potion',rolls(2,4)).restored,6);
  p.life=0; assert.equal(realmHeal(p,'potion',rolls()),null); assert.equal(p.potions,5);
});
test('Astral rolls map only eight spheres and grant exactly two path moves', () => {
  const p=character();
  assert.deepEqual(realmAstralRoll(p,rolls(3,3)),{roll:6,pathwalker:2,destination:null});
  assert.equal(realmWalkPath(p),true); assert.equal(realmWalkPath(p),true);
  assert.equal(realmWalkPath(p),false);
  assert.equal(realmAstralRoll(p,rolls(5,5)).destination,137);
});
test('Dragon reactions require a strictly higher second roll and stop after three calls', () => {
  const p=character();
  assert.equal(realmDragonReaction(p,rolls(3,3)).friendly,false);
  assert.equal(realmDragonReaction(p,rolls(2,3)).friendly,true);
  assert.equal(realmDragonReaction(p,rolls(6,1)).callsLeft,0);
  assert.equal(realmDragonReaction(p,rolls()),null);
});
test('The healing wand kills on six, otherwise rolls healing and does not invent charges', () => {
  const p=character(); assert.equal(realmHealingWand(p,rolls(5,3,3)).restored,6);
  assert.equal(realmHealingWand(p,rolls(6)).dead,true); assert.equal(p.life,0);
});
test('Dream four returns one roll at a time instead of entering an unbounded loop', () => {
  const p=character(); assert.equal(realmDream(p,4,rolls(6,5)).wake,false);
  assert.equal(realmDream(p,4,rolls(6,6)).wake,true); assert.equal(p.life,30);
});
test('Dream five doubles remaining LIFE only after surviving the loss', () => {
  const p=character({life:20}); realmDream(p,5,rolls()); assert.equal(p.life,20);
  p.life=9; assert.equal(realmDream(p,5,rolls()).dead,true); assert.equal(p.life,-1);
});
test('Dream nine rolls three independent dice and stops immediately on death', () => {
  const p=character(); assert.deepEqual(realmDream(p,9,rolls(3,4,6)).rolls,[3,4,6]);
  assert.equal(p.life,43); assert.deepEqual(realmDream(p,9,rolls(1)).rolls,[1]);
  assert.equal(p.life,0);
});
test('Dreamtime choices preserve disease and optional combat instead of auto-fighting', () => {
  const p=character(); assert.equal(realmDream(p,8,rolls()).redream,true);
  realmDream(p,11,rolls()); assert.equal(p.dreamDisease,true);
  assert.equal(realmDream(p,12,rolls()).optionalEncounter,'dream12');
  assert.equal(realmDream(p,6,rolls()).encounter,'dream6');
});
test('The source roster keeps missing vampire damage and Albert stats unset', () => {
  const byId=new Map(REALM_ENCOUNTERS.map(row=>[row.id,row]));
  assert.equal(byId.get(149).enemies[0].bonus,null);
  assert.deepEqual(Object.values(byId.get(16).enemies[0]).slice(1,4),[null,null,null]);
  assert.deepEqual(byId.get(155).enemies.map(row=>row.life),[25,25]);
  assert.equal(byId.get(210).enemies.length,7);
  assert.deepEqual(byId.get(218).enemies.map(row=>row.fixedDamage),[6]);
  assert.deepEqual(byId.get(219).enemies.map(row=>row.fixedDamage),[12]);
  assert.equal(REALM_DREAMS.length,2);
});

const start = (id, extra={}, options={}) => startRealmFight(character(extra),id,options,rolls(6,6,1,1));
test('Missing source statistics cannot silently become invented combat values',()=>{
  assert.throws(()=>start(149),RangeError);
  assert.throws(()=>start(16),RangeError);
  const vampire=start(149,{}, {enemyBonus:4}); assert.equal(vampire.foes[0].bonus,4);
  const albert=start(16,{}, {manualStats:{life:30,hit:6,bonus:2}});
  assert.equal(albert.foes[0].life,30);
  assert.equal(REALM_ENCOUNTERS.find(row=>row.id===149).enemies[0].bonus,null);
});
test('Opening source damage applies once and can be explicitly marked already applied',()=>{
  assert.equal(start(96).foes[0].life,23);
  assert.equal(start(96,{}, {openingApplied:true}).foes[0].life,30);
  assert.equal(start(76).player.life,25);
  assert.equal(start(135).player.life,25);
  assert.equal(start(135,{}, {openingApplied:true}).player.life,30);
});
test('Ghosts bypass ordinary killed enemies but never reset Astral fights into free wins',()=>{
  const p=character({ghosts:{40:{0:true},120:{0:true}}});
  const ghost=startRealmFight(p,40,{},rolls()); assert.equal(ghost.status,'avoided');
  assert.equal(ghost.player.experience,0);
  const astral=startRealmFight(p,120,{},rolls(6,6,1,1));
  assert.equal(astral.status,'fighting');assert.equal(astral.foes[0].life,40);
  assert.equal(p.life,30);
});
test('Tied initiative requires an explicit reroll and cannot consume a combat round',()=>{
  const f=startRealmFight(character(),40,{},rolls(3,3,3,3));
  assert.equal(f.first,null);assert.equal(rollRealmRound(f,0,rolls()),null);
  assert.equal(rerollRealmInitiative(f,rolls(5,5,1,1)).first,'player');
});
test('Killing even one monk kills Pip; surrender requires below five, not five',()=>{
  const f=start(31);f.foes[0].life=5;assert.equal(realmTargets(f).length,2);
  f.foes[0].life=4;assert.equal(realmTargets(f).length,1);
  f.foes[0].life=6;rollRealmRound(f,0,rolls(6,6));
  assert.equal(f.status,'loss');assert.equal(f.player.life,0);
});
test('Rat poison starts on subsequent rounds, not on the original successful bite',()=>{
  const f=start(29,{armour:0});
  rollRealmRound(f,0,rolls(1,1,3,3));assert.equal(f.player.life,30);
  assert.equal(f.poison,5);
  rollRealmRound(f,0,rolls(1,1,1,1));assert.equal(f.player.life,25);
});
test('The second dog head remains a separate living target after the first is defeated',()=>{
  const f=start(155);f.foes[0].life=6;
  rollRealmRound(f,0,rolls(6,6,1,1));
  assert.equal(f.status,'fighting');assert.equal(realmTargets(f)[0].index,1);
  assert.equal(f.foes[1].life,25);assert.equal(f.player.ghosts[155][0],true);
});
test('Three consecutive player misses hatch exactly one additional Hoopberk',()=>{
  const f=start(129);
  for(let i=0;i<3;i++)rollRealmRound(f,0,rolls(1,1,1,1,...(i===2?[1,1]:[])));
  assert.equal(f.foes.length,2);assert.equal(f.foes[1].life,35);
  for(let i=0;i<3;i++)rollRealmRound(f,0,rolls(1,1,1,1,1,1));
  assert.equal(f.foes.length,2);
});
test('Mervillion breath removes ten LIFE every third round regardless of successful hits',()=>{
  const f=start(132);for(let i=0;i<3;i++)rollRealmRound(f,0,rolls(1,1,1,1));
  assert.equal(f.player.life,20);
});
test('Pondifilous gains player damage and releases Pip at thirty LIFE',()=>{
  const f=start(201);f.foes[0].life=29;
  rollRealmRound(f,0,rolls(2,3));
  assert.equal(f.foes[0].life,35);assert.equal(f.status,'win');
  assert.deepEqual(f.player.ghosts,{});
});
test('Plateau falls and the Vorpal Bunny use natural printed roll totals',()=>{
  const falling=start(156);rollRealmRound(falling,0,rolls(2,3));
  assert.equal(falling.status,'loss');assert.equal(falling.player.life,0);
  const bunny=start(193);rollRealmRound(bunny,0,rolls(1,1,3,3));
  assert.equal(bunny.status,'loss');assert.equal(bunny.player.life,0);
});
test('Vampire throat hit stores the next-incarnation penalty without rewriting saved characters',()=>{
  const p=character();const f=startRealmFight(p,149,{enemyBonus:4},rolls(6,6,1,1));
  rollRealmRound(f,0,rolls(1,1,6,6));
  assert.equal(f.player.incarnationPenalty,15);assert.equal(f.player.life,0);
  assert.equal(p.life,30);assert.equal(p.incarnationPenalty,0);
});
test('Guard bribery allows only retreat to sixty-eight and does not mark guards killed',()=>{
  const f=start(100,{gold:1000});const result=realmTryBribe(f,0,rolls(4,4));
  assert.equal(result.success,true);assert.equal(f.status,'avoided');
  assert.equal(f.redirect,68);assert.equal(f.player.gold,0);assert.deepEqual(f.player.ghosts,{});
});
test('Fungoid rot removes permanent LIFE at fight start, otherwise ordinary LIFE',()=>{
  const f=start(40,{fungoidRot:true,permanent:2});
  assert.equal(f.player.permanent,1);assert.equal(f.player.maxLife,47);
  assert.equal(f.player.life,29);
  assert.equal(start(40,{fungoidRot:true}).player.life,29);
});
test('MAD applies to the first blow even if it misses, and only one charge per combat',()=>{
  const f=start(40,{madFights:4});
  rollRealmRound(f,0,rolls(1,1,1,1));assert.equal(f.player.madFights,3);
  const before=f.foes[0].life;rollRealmRound(f,0,rolls(3,3,1,1));
  assert.equal(before-f.foes[0].life,7);
});
test('Friendly attempts target one foe, cannot be retried, and never create ghosts',()=>{
  const f=start(100);
  assert.equal(realmTryFriendly(f,0,rolls(6,1,1,1)).success,true);
  assert.equal(realmTryFriendly(f,0,rolls()),null);
  assert.equal(f.status,'fighting');assert.equal(realmTargets(f).length,2);
  assert.deepEqual(f.player.ghosts,{});
});
test('Sleeping either enters Dreamtime or restores capped LIFE; it never revives',()=>{
  const p=character();assert.equal(realmSleep(p,rolls(4)).dream,true);
  assert.equal(realmSleep(p,rolls(5,2,3)).restored,5);assert.equal(p.life,35);
  p.life=0;assert.equal(realmSleep(p,rolls()),null);
});
test('The Kootbraker strength contest preserves the source unspecified tie',()=>{
  const p=character();assert.equal(realmStrengthContest(p,rolls(3,3,3,3)).outcome,'unspecified-tie');
  assert.equal(p.life,30);assert.equal(realmStrengthContest(p,rolls(1,1,6,6)).outcome,'loss');
  assert.equal(p.life,0);
});
test('Dream disease drains once per actual visit, including repeat visits, but not invalid IDs',()=>{
  const p=character({dreamDisease:true});realmVisit(p,4);realmVisit(p,4);
  assert.equal(p.life,28);assert.deepEqual(p.visited,[4]);
  assert.equal(realmVisit(p,222),false);assert.equal(p.life,28);
});
test('Reincarnation applies vampire penalty exactly once and keeps killed-enemy memory',()=>{
  const p=character({incarnationPenalty:15,ghosts:{40:{0:true}},gold:1000});
  const result=realmReincarnate(p,rolls(6,6,1,1,1,1));assert.equal(result.life,33);
  assert.equal(p.incarnationPenalty,0);assert.equal(p.gold,0);assert.equal(p.ghosts[40][0],true);
  assert.equal(realmReincarnate(p,rolls(6,6,1,1,1,1)).life,48);
});
test('Mastiff is an explicit ally, persists damage, and will not fight at five LIFE',()=>{
  const f=start(40,{companion:{...REALM_COMPANION}},{allyTakesHits:true});
  assert.equal(realmUseCompanion(f,'mastiff'),true);
  rollRealmRound(f,0,rolls(1,1,1,1,6,6));
  assert.equal(f.player.life,30);assert.equal(f.player.companion.life,14);
  f.player.companion.life=5;
  const next=startRealmFight(f.player,40,{},rolls(6,6,1,1));
  assert.equal(realmUseCompanion(next,'mastiff'),false);
});
test('Dream Lizard Men explicitly carry their killed counterparts out as companions',()=>{
  const f=startRealmFight(character(), 'dream6',{},rolls(1,6,6,1,1));
  f.foes[0].life=1;
  rollRealmRound(f,0,rolls(6,6));
  assert.equal(f.status,'win');assert.equal(f.player.dreamCompanions.length,1);
  assert.equal(f.player.dreamCompanions[0].life,10);assert.equal(f.player.experience,0);
});
test('Spook Basher kills all three spooks only on the printed successful roll',()=>{
  const f=start(133,{spookBasher:true});
  assert.equal(realmUseSpookBasher(f,rolls(2,3)).success,false);
  assert.equal(f.status,'fighting');assert.equal(realmUseSpookBasher(f,rolls()),null);
  const success=start(133,{spookBasher:true});
  assert.equal(realmUseSpookBasher(success,rolls(3,3)).success,true);
  assert.equal(success.status,'win');assert.ok(success.foes.every(foe=>foe.life===0));
});
test('Horrorgem failure is fatal; successful use does not invent an unstated charge limit',()=>{
  const f=start(40,{horrorgem:true});
  assert.equal(realmUseHorrorgem(f,0,rolls(5)).success,true);assert.equal(f.status,'win');
  assert.equal(f.player.horrorgem,true);
  const fatal=start(40,{horrorgem:true});realmUseHorrorgem(fatal,0,rolls(4));
  assert.equal(fatal.status,'loss');assert.equal(fatal.player.horrorgem,false);
});
test('Enemy poison and instant death target the selected companion, not Pip behind it',()=>{
  const rat=start(29,{companion:{...REALM_COMPANION}},{allyTakesHits:true});
  realmUseCompanion(rat,'mastiff');rollRealmRound(rat,0,rolls(1,1,1,1,3,3));
  assert.equal(rat.poison,0);assert.equal(rat.allyPoison,5);
  rollRealmRound(rat,0,rolls(1,1,1,1,1,1));
  assert.equal(rat.player.life,30);assert.equal(rat.player.companion.life,20);
  const bunny=start(193,{companion:{...REALM_COMPANION}},{allyTakesHits:true});
  realmUseCompanion(bunny,'mastiff');rollRealmRound(bunny,0,rolls(1,1,1,1,3,3));
  assert.equal(bunny.player.life,30);assert.equal(bunny.player.companion.life,0);
});
test('A summoned friendly dragon fights only this combat; a hostile dragon joins the enemy side',()=>{
  const f=start(40,{dragonStone:true});
  assert.equal(realmCallDragon(f,rolls(2,4)).friendly,true);assert.equal(f.ally.life,40);
  assert.equal(f.player.dragonCalls,1);assert.equal(realmCallDragon(f,rolls()),null);
  const hostile=start(40,{dragonStone:true});
  assert.equal(realmCallDragon(hostile,rolls(3,3)).friendly,false);assert.equal(hostile.foes.length,2);
  assert.equal(hostile.foes[1].fixedDamage,10);assert.equal(hostile.foes[1].summoned,true);
});
test('The explicit one-use stone option preserves the conflicting source wording without hidden charges',()=>{
  const f=start(40,{dragonStone:true,dragonCalls:1},{oneUseStone:true});
  assert.equal(realmCallDragon(f,rolls()),null);assert.equal(f.player.dragonCalls,1);
  const detailed=start(40,{dragonStone:true,dragonCalls:1});
  assert.equal(realmCallDragon(detailed,rolls(1,2)).callsLeft,1);
});
test('Pondifilous also gains companion strike damage, but the explicit destroy-anything artifact can kill him',()=>{
  const f=start(201,{companion:{...REALM_COMPANION}});
  realmUseCompanion(f,'mastiff');
  rollRealmRound(f,0,rolls(1,1,3,3,1,1));assert.equal(f.foes[0].life,17);
  const gem=start(201,{horrorgem:true});realmUseHorrorgem(gem,0,rolls(5));
  assert.equal(gem.foes[0].life,0);assert.equal(gem.status,'win');
});
test('All recruited Dreamtime lizards can join a fight without duplicating a companion',()=>{
  const lizard={name:'Lizard Man',life:10,hit:6,bonus:2};
  const f=start(40,{dreamCompanions:[{...lizard},{...lizard}]});
  assert.equal(realmUseCompanion(f,'dream',0),true);
  assert.equal(realmUseCompanion(f,'dream',1),true);
  assert.equal(realmUseCompanion(f,'dream',0),false);
  const events=rollRealmRound(f,0,rolls(1,1,3,3,3,3,1,1));
  assert.equal(events.filter(event=>event.kind==='ally').length,2);assert.equal(f.foes[0].life,26);
});
test('Paralysis of Pip does not also silence an unaffected companion',()=>{
  const f=start(133,{companion:{...REALM_COMPANION}});
  realmUseCompanion(f,'mastiff');f.paralysis=1;
  const events=rollRealmRound(f,0,rolls(3,3,1,1,1,1,1,1));
  assert.equal(f.playerStrikes,0);assert.equal(events.filter(event=>event.kind==='ally').length,1);
});

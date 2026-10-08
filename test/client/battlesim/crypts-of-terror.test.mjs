import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRYPTS_ROSTER, cryptsEnemy } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-roster.js';
import { CRYPTS_ENCOUNTERS, rollCryptsCharacter, prepareCryptsEncounter, cryptsChase } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-encounters.js';
import { createCryptsFight, cryptsEnemyActive, checkCryptsOutcome, rollCryptsAttack,
  advanceCryptsRound, applyCryptsWightHit, addCryptsReinforcements } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror.js';

const player = extra => ({...rollCryptsCharacter(()=>.4),weapon:'sword',armour:'none',lifePoints:2000,maxLife:2000,...extra});
const fight = (section,extra={},options={}) => createCryptsFight(prepareCryptsEncounter(section,player(extra),options));
const low = ()=>0, high = ()=>.999;

test('Crypts creates seven 2d6 x8 attributes with the printed minimum10 Skill and no invented starting Power', () => {
  const p = rollCryptsCharacter(() => 0);
  assert.equal(p.skill,10);assert.equal(p.lifePoints,122);assert.equal(p.maxLife,122);
  assert.equal(p.power,0);assert.equal(p.maxPower,0);
  assert.equal(rollCryptsCharacter(() => .999).lifePoints,682);
});

test('seventeen printed enemy profiles preserve source Life totals and blanks', () => {
  assert.equal(CRYPTS_ROSTER.length,17);
  assert.equal(cryptsEnemy('Horn Monster').lifePoints,530);
  assert.equal(cryptsEnemy('Giant Rat').luck,null);
  assert.equal(cryptsEnemy('Demonspawn').power,50);
  assert.equal(cryptsEnemy('Demonspawn').lifePoints,650);
  for (const e of CRYPTS_ROSTER) {
    const sum=['strength','speed','stamina','courage','skill','luck','charm','attraction'].reduce((s,k)=>s+(e[k]??0),0);
    assert.equal(sum+(e.name==='Demonspawn'?50:0),e.lifePoints,e.name);
  }
});

test('encounter and roster snapshots cannot mutate the immutable source definitions', () => {
  const p=rollCryptsCharacter();const before=structuredClone(p);
  const f=prepareCryptsEncounter(34,p);f.player.skill=100;f.enemies[0].lifePoints=1;
  f.encounter.enemies.push('not a source foe');
  assert.deepEqual(p,before);assert.equal(cryptsEnemy('Statue').lifePoints,428);
  assert.deepEqual(CRYPTS_ENCOUNTERS.find(e=>e.section===34).enemies,['Statue','Statue']);
});

test('crypt encounters suppress Doombringer magic and use the printed ordinary sword', () => {
  const p={...rollCryptsCharacter(),weapon:'doombringer'};
  for (const section of [16,34,47,71,76,77,83,85,94,103]) {
    const f=prepareCryptsEncounter(section,p);
    assert.equal(f.player.weapon,'sword');assert.equal(f.options.suppressDoombringer,true);
  }
  assert.equal(p.weapon,'doombringer');
});

test('first-strike exceptions and the exact Alchiller opening attacks remain explicit', () => {
  const p=rollCryptsCharacter();assert.equal(prepareCryptsEncounter(16,p).options.first,'player');
  assert.equal(prepareCryptsEncounter(71,p).options.first,'enemy');
  assert.equal(prepareCryptsEncounter(47,p).options.first,null);
  assert.equal(prepareCryptsEncounter(47,p,{haroldWarning:true}).options.first,'player');
  for (const section of [77,83,85]) assert.equal(prepareCryptsEncounter(section,p).options.enemyOpening,2);
});

test('source group fights are not silently turned into independent sequential duels', () => {
  const p=rollCryptsCharacter();
  for (const section of [14,34,76,77,83,84,85,94,103,119,136,144,145,149,157]) {
    assert.equal(prepareCryptsEncounter(section,p).options.manualGroup,true);
  }
  assert.equal(prepareCryptsEncounter(157,p).enemies.length,5);
  assert.equal(prepareCryptsEncounter(157,p).enemies[4].name,'Harkaan Prince');
});

test('missing Officer and Shaman Wizard source stats require explicit manual input', () => {
  const p=rollCryptsCharacter();
  for (const section of [111,113]) assert.throws(()=>prepareCryptsEncounter(section,p),/manually supplied/);
  assert.throws(()=>prepareCryptsEncounter(113,p,{manual:{lifePoints:400}}),/manually supplied/);
  const officer=prepareCryptsEncounter(113,p,{manual:p});assert.equal(officer.enemies[0].lifePoints,p.lifePoints);
  const noPower={...p};delete noPower.power;
  assert.throws(()=>prepareCryptsEncounter(111,p,{manual:noPower}),/Power/);
});

test('Wights retain their known400 Life without invented fighting statistics', () => {
  const f=prepareCryptsEncounter(76,rollCryptsCharacter());
  assert.equal(f.enemies[0].lifePoints,400);assert.equal(f.enemies[0].manualStats,true);
  assert.equal(f.enemies[0].magicOnly,true);assert.equal(f.enemies[0].skill,undefined);
});

test('special weapons, armour and forbidden duel spells follow the printed source', () => {
  const p=rollCryptsCharacter();
  assert.equal(prepareCryptsEncounter(16,p).enemies[0].armour,8);
  assert.equal(prepareCryptsEncounter(34,p).enemies[0].armour,10);
  assert.equal(prepareCryptsEncounter(136,p).enemies[0].armour,'plate');
  assert.equal(prepareCryptsEncounter(145,p).enemies[0].weapon,6);
  assert.equal(prepareCryptsEncounter(145,p,{clementineUnarmed:true}).enemies[0].weapon,5);
  assert.equal(prepareCryptsEncounter(61,p).encounter.noMagic,true);
  assert.equal(prepareCryptsEncounter(111,p,{manual:p}).encounter.noPoisonNeedle,true);
});

test('all twelve pursuit guards use the printed SPEED48 and STAMINA56 with strict/equal outcomes', () => {
  assert.deepEqual(cryptsChase({speed:80,stamina:25}),{fasterGuards:0,equalGuards:0,damage:0,destination:45});
  assert.deepEqual(cryptsChase({speed:48,stamina:56}),{fasterGuards:0,equalGuards:12,damage:600,destination:45});
  assert.deepEqual(cryptsChase({speed:48,stamina:55}),{fasterGuards:12,equalGuards:0,damage:0,destination:null});
});

test('pursuit does not invent a fight when the guards are slower or equally fast', () => {
  const f=fight(14,{speed:80,stamina:25});
  assert.equal(f.outcome,'avoided');assert.equal(f.player.lifePoints,2000);
  assert.equal(f.player.skill,10);
  const g=fight(14,{speed:48,stamina:56});
  assert.equal(g.outcome,'avoided');assert.equal(g.player.lifePoints,1400);
  assert.equal(g.player.skill,10);
});

test('Crypts fights clone prepared groups and cannot win after defeating only one foe', () => {
  const prepared=prepareCryptsEncounter(34,player());const before=structuredClone(prepared);
  const f=createCryptsFight(prepared);f.enemies[0].lifePoints=0;checkCryptsOutcome(f);
  assert.equal(f.outcome,null);assert.deepEqual(prepared,before);
  f.enemies[1].lifePoints=0;checkCryptsOutcome(f);assert.equal(f.outcome,'win');
  assert.equal(f.player.skill,11);checkCryptsOutcome(f);assert.equal(f.player.skill,11);
});

test('ordinary crypt swords neither consume player Life nor siphon enemy Life', () => {
  const f=fight(16,{weapon:'doombringer',lifePoints:100,maxLife:1000});
  const result=rollCryptsAttack(f,'player',0,high);
  assert.equal(result.damage,68);assert.equal(f.player.lifePoints,100);
});

test('vampire heals half the actual damage even beyond its initial Life', () => {
  const f=fight(47);f.turn='enemy';const initial=f.enemy.lifePoints;
  const result=rollCryptsAttack(f,'enemy',0,high);
  assert.equal(f.enemy.lifePoints,initial+result.damage/2);
  assert.ok(f.enemy.lifePoints>f.enemy.maxLife);
});

test('Tanith double-six ends the first-blood duel without a death-Luck popup', () => {
  const f=fight(61,{lifePoints:1});f.turn='enemy';
  rollCryptsAttack(f,'enemy',0,high);
  assert.equal(f.outcome,'defeat');assert.equal(f.pending,null);assert.equal(f.player.skill,11);
});

test('first-blood duel ends at100 accumulated damage even without double-six', () => {
  const f=fight(61);f.turn='player';f.enemyDamage[0]=99;
  rollCryptsAttack(f,'player',0,()=>.6);
  assert.equal(f.outcome,'win');assert.equal(f.pending,null);
});

test('Officer fight ends below50 rather than killing either combatant', () => {
  const f=fight(113,{}, {manual:player()});f.player.lifePoints=49;
  checkCryptsOutcome(f);assert.equal(f.outcome,'defeat');assert.equal(f.pending,null);
  const g=fight(113,{}, {manual:player()});g.enemy.lifePoints=50;checkCryptsOutcome(g);
  assert.equal(g.outcome,null);g.enemy.lifePoints=49;checkCryptsOutcome(g);assert.equal(g.outcome,'win');
});

test('chase requires more than150 damage to every faster guard and captures at150 player damage', () => {
  const f=fight(14);f.enemyDamage.fill(150);checkCryptsOutcome(f);assert.equal(f.outcome,null);
  f.enemyDamage.fill(151);checkCryptsOutcome(f);assert.equal(f.outcome,'win');
  const g=fight(14);g.playerDamage=150;checkCryptsOutcome(g);assert.equal(g.outcome,'defeat');
});

test('Palace guards flee strictly below20, not at20', () => {
  const f=fight(119);f.enemies.forEach(e=>e.lifePoints=20);checkCryptsOutcome(f);
  assert.equal(f.outcome,null);f.enemies.forEach(e=>e.lifePoints=19);checkCryptsOutcome(f);assert.equal(f.outcome,'win');
});

test('Clementines must remain alive below10; killing even one loses the mission', () => {
  const f=fight(145);f.enemies.forEach(e=>e.lifePoints=10);checkCryptsOutcome(f);assert.equal(f.outcome,null);
  f.enemies.forEach(e=>e.lifePoints=9);checkCryptsOutcome(f);assert.equal(f.outcome,'win');
  const g=fight(145);g.enemies[0].lifePoints=0;checkCryptsOutcome(g);assert.equal(g.outcome,'loss');
  assert.equal(g.player.skill,10);assert.equal(g.pending,null);
});

test('Prince cannot fight until two Spawn die and must still be defeated to win', () => {
  const f=fight(157);assert.equal(cryptsEnemyActive(f,4),false);
  assert.equal(rollCryptsAttack(f,'enemy',4,high),null);
  f.enemies[0].lifePoints=0;assert.equal(cryptsEnemyActive(f,4),false);
  f.enemies[1].lifePoints=0;assert.equal(cryptsEnemyActive(f,4),true);
  f.enemies.slice(0,4).forEach(e=>e.lifePoints=0);checkCryptsOutcome(f);assert.equal(f.outcome,null);
  f.enemies[4].lifePoints=0;checkCryptsOutcome(f);assert.equal(f.outcome,'win');
});

test('Alchiller opening strikes require two distinct attackers before any player strike', () => {
  const f=fight(83);
  assert.equal(rollCryptsAttack(f,'player',0,high).error,'enemy-opening');
  rollCryptsAttack(f,'enemy',0,low);
  assert.equal(rollCryptsAttack(f,'enemy',0,low).error,'enemy-opening');
  assert.equal(rollCryptsAttack(f,'player',0,high).error,'enemy-opening');
  rollCryptsAttack(f,'enemy',1,low);
  assert.equal(rollCryptsAttack(f,'player',0,low).kind,'attack');
});

test('magic-only opponents and Wights cannot be resolved using fabricated physical attacks', () => {
  const f=fight(144);assert.equal(rollCryptsAttack(f,'player',0,high).error,'magic-only');
  const g=fight(76);assert.equal(rollCryptsAttack(g,'enemy',0,high).error,'manual-stats');
  assert.equal(g.player.lifePoints,2000);
});

test('three consecutive rat hits cause disease, while a missed bite resets the streak', () => {
  const f=fight(91);
  for(let i=0;i<2;i++){f.turn='enemy';rollCryptsAttack(f,'enemy',0,high);}
  assert.equal(f.player.ratDisease,undefined);f.turn='enemy';rollCryptsAttack(f,'enemy',0,low);
  assert.equal(f.ratHits,0);
  for(let i=0;i<3;i++){f.turn='enemy';rollCryptsAttack(f,'enemy',0,high);}
  assert.equal(f.player.ratDisease,true);
});

test('curse halves outgoing damage and doubles incoming damage without invented rounding', () => {
  const f=fight(16,{}, {cursedStone:true});const g=fight(16);
  assert.equal(rollCryptsAttack(f,'player',0,high).damage,rollCryptsAttack(g,'player',0,high).damage/2);
  assert.equal(rollCryptsAttack(f,'enemy',0,high).damage,rollCryptsAttack(g,'enemy',0,high).damage*2);
});

test('group rest counts explicit combat rounds, not individual enemy strikes', () => {
  const f=fight(34,{stamina:10});rollCryptsAttack(f,'player',0,low);
  assert.equal(rollCryptsAttack(f,'player',0,low).kind,'rest');
  rollCryptsAttack(f,'enemy',0,low);rollCryptsAttack(f,'enemy',1,low);
  assert.equal(f.rest,2);advanceCryptsRound(f);assert.equal(f.rest,1);
  advanceCryptsRound(f);assert.equal(f.rest,0);assert.equal(f.attacks,0);
});

test('Wight hits drain three attributes and only the next hit kills at zero', () => {
  const f=fight(76,{strength:5,speed:10,courage:15,luck:96});
  assert.equal(applyCryptsWightHit(f,6),true);assert.equal(f.player.lifePoints,1994);
  assert.equal(f.player.strength,0);assert.equal(f.player.speed,5);assert.equal(f.player.courage,10);
  assert.equal(f.pending,null);applyCryptsWightHit(f,0);assert.equal(f.pending,'death-luck');
});

test('reinforcement waves preserve wounds and require exactly two source guards', () => {
  const f=fight(136);f.player.lifePoints=120;f.enemies.forEach(e=>e.lifePoints=0);checkCryptsOutcome(f);
  const guards=[cryptsEnemy('Fortress Guard'),cryptsEnemy('Fortress Guard')];
  assert.equal(addCryptsReinforcements(f,[guards[0]]),false);
  assert.equal(addCryptsReinforcements(f,guards),true);assert.equal(f.player.lifePoints,121);
  assert.equal(f.outcome,null);assert.equal(f.enemies.length,4);assert.equal(f.skillAwarded,false);
});

test('unknown Palace Guard and Prince weapons require manual selection, not invented bare hands', () => {
  const f=fight(119);assert.equal(rollCryptsAttack(f,'enemy',0,high).error,'manual-weapon');
  f.enemies[0].weapon='sword';assert.equal(rollCryptsAttack(f,'enemy',0,high).kind,'attack');
  const g=fight(157);g.enemies.slice(0,2).forEach(e=>e.lifePoints=0);
  assert.equal(rollCryptsAttack(g,'enemy',4,high).error,'manual-weapon');
});

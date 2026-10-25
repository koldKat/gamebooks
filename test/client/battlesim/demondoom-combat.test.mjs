import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(536);
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEMONDOOM_RULES} from '../../../public/js/battlesim/engines/demonspawn/demondoom-roster.js';
import {demondoomRegentWeapon} from '../../../public/js/battlesim/engines/demonspawn/demondoom-rules.js';
import {rollDemondoomCharacter} from '../../../public/js/battlesim/engines/demonspawn/demondoom-character.js';
import {prepareDemondoomEncounter} from '../../../public/js/battlesim/engines/demonspawn/demondoom-encounters.js';
import {createDemondoomFight,demondoomEnemyActive,checkDemondoomFight,determineDemondoomInitiative,
  rollDemondoomAttack,resolveDemondoomDeathLuck,castDemondoomPlayerSpell,castDemondoomEnemySpell,
  endDemondoomGroupRound} from '../../../public/js/battlesim/engines/demonspawn/demondoom.js';
const high=()=>.999,low=()=>0;
const make=(section,options={})=>createDemondoomFight(prepareDemondoomEncounter(section,
  {...rollDemondoomCharacter(high),lifePoints:2000,maxLife:2000,power:200,maxPower:200,weapon:'sword',armour:'none'},options));

test('Demondoom count and weapon settings follow metadata without replacing saved groups',()=>{
  const saved=structuredClone(DEMONDOOM_RULES);
  try{
    const old=JSON.parse(JSON.stringify(make(16,{spawnCount:2})));old.enemies[0].lifePoints=17;old.enemyAttacks[0]=4;old.extension={keep:true};
    DEMONDOOM_RULES.spawnMin=3;DEMONDOOM_RULES.spawnMax=4;
    assert.throws(()=>make(16,{spawnCount:2}));assert.equal(make(16,{spawnCount:4}).enemies.length,4);
    assert.equal(old.enemies.length,2);assert.equal(old.enemies[0].lifePoints,17);assert.equal(old.enemyAttacks[0],4);assert.deepEqual(old.extension,{keep:true});
    DEMONDOOM_RULES.regentSword={cycle:[3,7],dieMultiplier:2};assert.deepEqual([1,2,3,4].map(n=>demondoomRegentWeapon(n,6)),[3,7,12,3]);
  }finally{Object.assign(DEMONDOOM_RULES,saved);}
});
test('Demondoom special attack and timeout settings follow metadata',()=>{
  const saved=structuredClone(DEMONDOOM_RULES);
  try{
    for(const [section,key]of [[1,'assassin'],[89,'bear']]){DEMONDOOM_RULES[key]={halfRoll:8,divisor:4};const f=make(section);f.turn='enemy';f.enemies[0].weapon=10;const r=rollDemondoomAttack(f,'enemy',0,()=>.5);assert.equal(r.damage,500);assert.equal(r.poisonCheckRequired,undefined);}
    DEMONDOOM_RULES.dragon={every:2,minRoll:4,multiplier:3};const dragon=make(104);dragon.turn='enemy';dragon.enemyAttacks[0]=1;dragon.enemies[0].weapon=10;assert.equal(rollDemondoomAttack(dragon,'enemy',0,()=>.5).damage,24);
    DEMONDOOM_RULES.regina={weapon:3,fatalEvery:3,fatalRoll:8};const regina=make(139);regina.turn='enemy';regina.enemyAttacks[0]=2;assert.equal(rollDemondoomAttack(regina,'enemy',0,()=>.5).damage,2000);
    DEMONDOOM_RULES.sqquashStrengthLoss=2;const sq=make(44);sq.turn='player';sq.enemies[0].lifePoints=10000;const strength=sq.player.strength;rollDemondoomAttack(sq,'player',0,high);assert.equal(sq.player.strength,strength-2);
    DEMONDOOM_RULES.amoebixRounds=2;const amoebix=make(161);amoebix.turn='player';rollDemondoomAttack(amoebix,'player',0,low);rollDemondoomAttack(amoebix,'player',0,low);assert.equal(amoebix.pending,'death-luck');
  }finally{Object.assign(DEMONDOOM_RULES,saved);}
});
test('Demondoom enemy spell thresholds, costs and effects use metadata',()=>{
  const saved=structuredClone(DEMONDOOM_RULES);
  try{
    Object.assign(DEMONDOOM_RULES.enemyMagic,{captainCost:7,paralysisRounds:4,fireboltDamage:13});DEMONDOOM_RULES.enemyMagic.thresholds.firebolt=4;
    const captain=make(249);captain.turn='enemy';const power=captain.enemies[0].power;castDemondoomEnemySpell(captain,'blight',0,high);assert.equal(captain.enemies[0].power,power-7);assert.equal(captain.paralysedPlayerRounds,4);
    const regent=make(106);regent.turn='enemy';const result=castDemondoomEnemySpell(regent,'firebolt',0,()=>.2);assert.equal(result.success,true);assert.equal(result.damage,13);
  }finally{Object.assign(DEMONDOOM_RULES,saved);}
});

test('creating fights and subsequent attacks cannot mutate their original prepared character or source enemies',()=>{
  const prepared=prepareDemondoomEncounter(50,{...rollDemondoomCharacter(high),weapon:'sword',armour:'none'});
  const before=structuredClone(prepared),fight=createDemondoomFight(prepared);
  fight.turn='player';rollDemondoomAttack(fight,'player',0,high);
  assert.deepEqual(prepared,before);
});

test('sequential victories activate only the next foe and require new initiative',()=>{
  const fight=make(16,{spawnCount:2});fight.turn='player';fight.enemies[0].lifePoints=1;
  rollDemondoomAttack(fight,'player',0,high);
  assert.equal(fight.sequence,1);assert.equal(fight.turn,null);
  assert.equal(demondoomEnemyActive(fight,0),false);assert.equal(demondoomEnemyActive(fight,1),true);
  assert.equal(fight.outcome,null);assert.equal(fight.round,0);
});

test('a death-Luck retry never resurrects previously defeated sequential foes',()=>{
  const fight=make(67,{spawnCount:2});fight.turn='player';fight.enemies[0].lifePoints=1;
  rollDemondoomAttack(fight,'player',0,high);
  assert.equal(fight.player.power,205);
  fight.player.lifePoints=0;checkDemondoomFight(fight);
  assert.equal(fight.pending,'death-luck');assert.equal(resolveDemondoomDeathLuck(fight,low),true);
  assert.ok(fight.enemies[0].lifePoints<=0);assert.equal(fight.enemies[1].lifePoints,fight.enemies[1].maxLife);
  assert.equal(fight.sequence,1);assert.equal(fight.player.power,205);
});

test('single-fight turn guards and missing weapon validation do not consume turns or dice',()=>{
  const fight=make(48);fight.turn='enemy';
  const before=structuredClone(fight);
  assert.equal(rollDemondoomAttack(fight,'enemy',0,()=>{throw Error('Must not roll');}).error,'manual-weapon');
  assert.deepEqual(fight,before);
  assert.equal(rollDemondoomAttack(fight,'player',0,high).error,'wrong-turn');
});

test('golden Guard failed-spell routes allow exactly their printed opening attacks then reconsideration',()=>{
  for(const [section,count]of [[189,1],[227,2],[242,1]]) {
    const fight=make(section);
    assert.equal(rollDemondoomAttack(fight,'enemy',0,low).error,'spell-cost-required');
    assert.ok(!castDemondoomPlayerSpell(fight,'fireball',{},high).error);
    for(let index=0;index<count;index++) {fight.turn='enemy';rollDemondoomAttack(fight,'enemy',0,low);}
    assert.equal(fight.openingStrikes,count);assert.equal(fight.outcome,'reconsider');
  }
});

test('Cave Bear and Assassin natural12 remove half current Life, not half plus ordinary damage',()=>{
  for(const section of [1,89]) {
    const fight=make(section);fight.turn='enemy';fight.player.lifePoints=100;
    fight.enemies[0].weapon=10;
    const result=rollDemondoomAttack(fight,'enemy',0,high);
    assert.equal(result.damage,50);assert.equal(fight.player.lifePoints,50);
  }
});

test('Regina natural12 tail strikes kill while the alternating claw does not',()=>{
  const fight=make(139);fight.turn='enemy';
  rollDemondoomAttack(fight,'enemy',0,high);assert.ok(fight.player.lifePoints>0);
  fight.turn='enemy';rollDemondoomAttack(fight,'enemy',0,high);
  assert.equal(fight.player.lifePoints,0);assert.equal(fight.pending,'death-luck');
});

test('Amoebix has no enemy attack and suffocates only after fifteen non-winning rounds',()=>{
  const fight=make(161);fight.turn='player';fight.player.weapon='unarmed';fight.player.skill=0;fight.player.stamina=1000;
  assert.equal(rollDemondoomAttack(fight,'enemy',0,high).error,'wrong-turn');
  for(let round=0;round<15;round++)rollDemondoomAttack(fight,'player',0,low);
  assert.equal(fight.round,15);assert.equal(fight.player.lifePoints,0);assert.equal(fight.pending,'death-luck');
  const win=make(161);win.turn='player';win.round=14;win.enemies[0].lifePoints=1;
  rollDemondoomAttack(win,'player',0,high);assert.equal(win.outcome,'win');assert.ok(win.player.lifePoints>0);
});

test('Blight consumes exactly two player actions and cannot be evaded by spell casting',()=>{
  const fight=make(249);fight.turn='enemy';
  const power=fight.enemies[0].power;
  assert.equal(castDemondoomEnemySpell(fight,'blight',0,high).success,true);
  assert.equal(fight.enemies[0].power,power-25);
  assert.equal(castDemondoomPlayerSpell(fight,'fireball',{},high).error,'paralysed');
  assert.equal(rollDemondoomAttack(fight,'player',0,high).kind,'paralysed');
  fight.turn='player';assert.equal(rollDemondoomAttack(fight,'player',0,high).kind,'paralysed');
  assert.equal(fight.paralysedPlayerRounds,0);
});

test('Regent spell cost is paid even on failure; source-inapplicable spells consume nothing',()=>{
  const fight=make(106);fight.turn='enemy';
  const life=fight.enemies[0].lifePoints;
  assert.equal(castDemondoomEnemySpell(fight,'blight',0,low).success,false);
  assert.equal(fight.enemies[0].lifePoints,life-2);
  fight.turn='enemy';const before=structuredClone(fight);
  assert.equal(castDemondoomEnemySpell(fight,'invisibility',0,high).error,'forbidden-spell');
  assert.deepEqual(fight,before);
});

test('group round advancement and retries preserve the printed first-strike controls',()=>{
  const group=make(97);assert.equal(determineDemondoomInitiative(group,high),null);
  assert.equal(endDemondoomGroupRound(group),true);assert.equal(group.round,1);
  const single=make(60);assert.equal(single.turn,'enemy');assert.equal(endDemondoomGroupRound(single),false);
});

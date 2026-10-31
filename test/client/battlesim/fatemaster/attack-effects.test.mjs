import test from 'node:test';
import assert from 'node:assert/strict';
import {attackFatemaster, resolveFatemasterOpeningHit, resumeFatemasterFight, startFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {outcome} from '../../../../public/js/battlesim/engines/fatemaster/flow.js';
import {enemyAttack, playerAttack} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';

const player = changes => ({name:'Player',strength:9,agility:9,power:5,damage:3,...changes});
const opponent = changes => ({name:'Opponent',strength:20,agility:20,power:0,damage:5,attackBonus:2,defenceBonus:3,...changes});
const swap = changes => ({basis:'raw',requiresHit:true,threshold:10,playerDamage:5,playerWeaponAttack:1,enemyAttackLoss:1,...changes});
const reload = fight => JSON.parse(JSON.stringify(fight));
const start = (rules = {}, changes = {}, opponents = [opponent()], options = {}) => startFatemasterFight(player(changes), opponents, rules, options);

test('automatic opening waits for a saved target choice and hits exactly one opponent without dice',()=>{
  const original=start({openingAutomaticHit:true},{},[opponent(),opponent()]);
  const before=JSON.stringify(original);
  assert.equal(original.pending.kind,'opening-hit');
  assert.throws(()=>attackFatemaster(original,'enemy-0',{total:12}));
  const fight=resolveFatemasterOpeningHit(reload(original),'enemy-1');
  assert.equal(fight.opponents[0].strength,20);
  assert.equal(fight.opponents[1].strength,17);
  assert.equal(fight.phase,'player');
  assert.equal(fight.round,1);
  assert.equal(fight.events.filter(e=>e.type==='automatic-opening-hit').length,1);
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>resolveFatemasterOpeningHit(reload(fight),'enemy-0'));
});

test('already applied opening damage is never charged again',()=>{
  const fight=start({openingAutomaticHit:true},{},[opponent({strength:17})],{openingAlreadyApplied:true});
  assert.equal(fight.pending,null);
  assert.equal(fight.opponents[0].strength,17);
  assert.equal(fight.events.filter(e=>e.type==='automatic-opening-hit').length,0);
});

test('automatic opening can end a fight and cannot target an unknown opponent',()=>{
  const fight=start({openingAutomaticHit:true},{damage:5},[opponent({strength:2,agility:2})]);
  assert.throws(()=>resolveFatemasterOpeningHit(fight,'missing'));
  const result=resolveFatemasterOpeningHit(reload(fight),'enemy-0');
  assert.equal(result.status,'win');
  assert.equal(result.pending,null);
});

test('automatic opening and enemy surprise cannot both be selected',()=>{
  assert.throws(()=>start({openingAutomaticHit:true,initiative:'enemy'}));
  assert.throws(()=>start({openingAutomaticHit:'yes'}));
});

test('weapon swap deals the ordinary wound before replacing weapons and resumes at the player step',()=>{
  const original=start({disarm:swap()},{attackModifier:0});
  const before=JSON.stringify(original);
  const fight=attackFatemaster(reload(original),'enemy-0',{total:10});
  assert.equal(fight.opponents[0].strength,17);
  assert.equal(fight.player.damage,5);
  assert.equal(fight.player.weaponAttack,1);
  assert.equal(fight.player.weaponKind,'magic');
  assert.equal(fight.opponents[0].damage,3);
  assert.equal(enemyAttack(fight.opponents[0]),1);
  assert.equal(fight.phase,'player');
  assert.equal(fight.pending,null);
  assert.equal(fight.round,1);
  assert.equal(JSON.stringify(original),before);
});

test('weapon swap retains the actual old sword damage and independent player attack modifiers',()=>{
  const fight=attackFatemaster(start({disarm:swap()},{damage:4,weaponAttack:2,attackModifier:3}),'enemy-0',{total:10});
  assert.equal(fight.opponents[0].damage,4);
  assert.equal(fight.player.attackModifier,3);
  assert.equal(playerAttack(fight.player),4);
  assert.deepEqual(fight.events.find(e=>e.type==='weapon-swap').oldWeapon,{damage:4,weaponAttack:2,weaponKind:'normal'});
});

test('a saved weapon swap never repeats on later qualifying rolls',()=>{
  let fight=attackFatemaster(start({disarm:swap()}),'enemy-0',{total:10});
  fight=attackFatemaster(reload(fight),'enemy-0',{total:12});
  assert.equal(fight.opponents[0].damage,3);
  assert.equal(fight.opponents[0].attackBase,-1);
  assert.equal(fight.events.filter(e=>e.type==='weapon-swap').length,1);
  assert.equal(fight.events.filter(e=>e.type==='player-attack')[1].damage,5);
});

test('raw and adjusted trigger interpretations are explicit and produce different outcomes',()=>{
  const raw=attackFatemaster(start({disarm:swap()}),'enemy-0',{total:10});
  const adjusted=attackFatemaster(start({disarm:swap({basis:'score'})}),'enemy-0',{total:10});
  assert.equal(raw.player.damage,5);
  assert.equal(adjusted.player.damage,3);
  assert.equal(adjusted.pending.kind,'enemy');
  assert.throws(()=>start({disarm:{...swap(),basis:undefined}}));
  assert.throws(()=>start({disarm:{...swap(),requiresHit:undefined}}));
});

test('the low-stat missed-blow interpretation cannot silently force a hit',()=>{
  const changes={attackModifier:-5};
  const required=attackFatemaster(start({disarm:swap()},changes),'enemy-0',{total:10});
  assert.equal(required.opponents[0].strength,20);
  assert.equal(required.events.filter(e=>e.type==='weapon-swap').length,0);
  const forced=attackFatemaster(start({disarm:swap({requiresHit:false})},changes),'enemy-0',{total:10});
  assert.equal(forced.opponents[0].strength,17);
  assert.equal(forced.events.find(e=>e.type==='player-attack').score,2);
  assert.equal(forced.events.find(e=>e.type==='player-attack').hit,true);
});

test('the final qualifying blow still records the weapon swap exactly once',()=>{
  const fight=attackFatemaster(start({disarm:swap()},{damage:30}),'enemy-0',{total:10});
  assert.equal(fight.status,'win');
  assert.equal(fight.player.damage,5);
  assert.equal(fight.opponents[0].damage,30);
  assert.equal(fight.events.filter(e=>e.type==='weapon-swap').length,1);
});

test('one surviving opponent pauses without a battle win or a resumable fake defeat',()=>{
  const original=start({stopRemaining:1},{damage:30},[opponent(),opponent()]);
  const result=attackFatemaster(reload(original),'enemy-0',{total:12});
  assert.equal(result.status,'paused');
  assert.equal(result.pauseReason,'remaining-opponents');
  assert.equal(result.opponents[1].strength,20);
  assert.deepEqual(result.queue,[]);
  assert.equal(result.pending,null);
  assert.throws(()=>resumeFatemasterFight(result));
  assert.throws(()=>start({stopRemaining:1}));
});

test('sleeping opponents are not counted as conscious survivors at a pause threshold',()=>{
  const fight=start({stopRemaining:1},{},[opponent(),opponent()]);
  fight.opponents[0].condition='asleep';
  assert.equal(outcome(fight),'paused');
  const allAsleep=start({stopRemaining:1},{},[opponent(),opponent()]);
  for(const enemy of allAsleep.opponents)enemy.condition='asleep';
  assert.equal(outcome(allAsleep),'win');
});

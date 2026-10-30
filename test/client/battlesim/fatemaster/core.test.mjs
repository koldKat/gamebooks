import test from 'node:test';
import assert from 'node:assert/strict';
import {activeAttackers, combatant, enemyAttack, enemyDefence, playerAttack, playerDefence, pointBonus} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';
import {assignFatemasterDamage, attackFatemaster, equipFatemasterWeapon, finishFatemasterHelplessOpponent, resolveFatemasterCheck, resolveFatemasterEnemy, resolveFatemasterHostileDamage, resolveFatemasterHostileSave, startFatemasterFight, withdrawFatemaster} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';

// Synthetic combatants exercise rules independently of any database-owned book roster.
const player = changes => ({name:'Player',strength:9,agility:9,power:4,damage:3,...changes});
const enemy = changes => ({name:'Opponent',strength:8,agility:8,power:0,attackBonus:0,defenceBonus:0,damage:2,...changes});
const die = (...values) => () => {assert.ok(values.length,'Unexpected extra random draw');return values.shift();};
const reload = value => JSON.parse(JSON.stringify(value));
const start = (rules={},p={},enemies=[enemy()]) => startFatemasterFight(player(p),enemies,rules);
const attack = (f,a=4,b=4,target=f.opponents[0].id) => attackFatemaster(reload(f),target,die(a,b));

test('point bands preserve source totals and cannot improve a 15-point creature when it drops to 12',()=>{
  assert.deepEqual([1,2,3,4,5,9,10,11,12,15].map(pointBonus),[-2,-2,-1,-1,0,0,1,1,2,2]);
  const unit=combatant(enemy({strength:15,agility:15,attackBonus:2,defenceBonus:2}));
  assert.equal(enemyAttack(unit),2);unit.strength=12;assert.equal(enemyAttack(unit),2);
  unit.strength=11;assert.equal(enemyAttack(unit),1);unit.agility=4;assert.equal(enemyDefence(unit),-1);
});
test('player equipment remains independent of current Strength and Agility bonuses',()=>{
  const f=start({}, {strength:10,agility:11,attackModifier:1,weaponAttack:2,defenceModifier:3});
  assert.equal(playerAttack(f.player),4);assert.equal(playerDefence(f,f.opponents[0]),4);
  f.player.strength=4;f.player.agility=2;assert.equal(playerAttack(f.player),2);assert.equal(playerDefence(f,f.opponents[0]),1);
});
test('nine or more gives another player blow and seven/eight passes initiative',()=>{
  const original=start(),before=JSON.stringify(original);let f=attack(original,5,4);
  assert.equal(f.phase,'player');assert.equal(f.opponents[0].strength,5);assert.equal(f.round,1);
  f=attack(f,4,4);assert.equal(f.pending.kind,'enemy');assert.equal(f.opponents[0].agility,5);
  assert.equal(JSON.stringify(original),before);
});
test('highest enemy pool takes the entire blow, with Strength used on ties',()=>{
  let f=attack(start(),5,5);assert.equal(f.opponents[0].strength,5);assert.equal(f.opponents[0].agility,8);
  f=attack(f,5,5);assert.equal(f.opponents[0].agility,5);
  f=attack(f,5,5);assert.equal(f.opponents[0].strength,2);
});
test('a missed attack never damages an opponent and reaches the enemy reply',()=>{
  const f=attack(start(),1,1);assert.equal(f.opponents[0].strength,8);assert.equal(f.pending.kind,'enemy');
});
test('the second enemy roll waits until the first damage pool is chosen, including after reload',()=>{
  let f=start({}, {},[enemy(),enemy(),enemy()]);f=attack(f,1,1);
  f=resolveFatemasterEnemy(reload(f),die(6,6));assert.equal(f.pending.kind,'damage');assert.equal(f.player.agility,9);
  const saved=reload(f);assert.throws(()=>resolveFatemasterEnemy(saved,die(6,6)));
  f=assignFatemasterDamage(saved,'agility');assert.equal(f.player.agility,7);assert.equal(f.pending.kind,'enemy');
  f=resolveFatemasterEnemy(reload(f),die(1,1));assert.equal(f.phase,'player');assert.equal(f.round,2);
  assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,2);
});
test('mixed groups retain one attacker of each kind within the two-attacker limit',()=>{
  const f=start({mixedAttackers:true},{},[enemy({group:'guards'}),enemy({group:'guards'}),enemy({group:'beast'}),enemy({group:'guards'})]);
  assert.deepEqual(activeAttackers(f).map(e=>e.id),['enemy-0','enemy-2']);
});
test('damage cannot switch to a second pool or resurrect a zero pool',()=>{
  let f=start({openingDamage:9});assert.equal(f.pending.amount,9);
  assert.throws(()=>assignFatemasterDamage(f,'power'));
  f=assignFatemasterDamage(f,'strength');assert.equal(f.status,'loss');assert.equal(f.player.strength,0);assert.equal(f.player.agility,9);
  assert.throws(()=>attack(f));
});
test('opening damage is explicit, only applies once, and resumes the correct phase',()=>{
  let f=start({openingDamage:2});f=assignFatemasterDamage(reload(f),'agility');assert.equal(f.phase,'player');
  f=attack(f,1,1);f=resolveFatemasterEnemy(f,die(1,1));assert.equal(f.player.agility,7);
  const resumed=startFatemasterFight(player(),[enemy()],{openingDamage:2},{openingAlreadyApplied:true});assert.equal(resumed.phase,'player');assert.equal(resumed.player.agility,9);
});
test('surprise queues an enemy turn without rolling or mutating the caller setup',()=>{
  const p=player(),es=[enemy()],f=startFatemasterFight(p,es,{initiative:'enemy'});
  assert.equal(f.pending.kind,'enemy');assert.equal(f.events.length,1);assert.equal(es[0].id,undefined);
  assert.throws(()=>attack(f));assert.throws(()=>startFatemasterFight(p,es,{initiative:'invalid'}));
});
test('normal weapons fail against a special-weapon requirement while silver deals normal damage',()=>{
  const blocked=attack(start({requiresSpecialWeapon:true}),5,5);assert.equal(blocked.opponents[0].strength,8);assert.equal(blocked.events.at(-1).damage,0);
  const hit=attack(start({requiresSpecialWeapon:true},{weaponKind:'silver'}),5,5);assert.equal(hit.opponents[0].strength,5);
});
test('a poison check waits for damage allocation and uses the current Strength',()=>{
  let f=start({poison:{pool:'strength',strict:false}},{strength:8});f=attack(f,1,1);f=resolveFatemasterEnemy(f,die(6,6));
  f=assignFatemasterDamage(reload(f),'strength');assert.equal(f.pending.check,'poison');assert.equal(f.player.strength,6);
  f=resolveFatemasterCheck(reload(f),die(3,3));assert.equal(f.status,'fighting');assert.equal(f.phase,'player');
});
test('strict Agility poison fails on equality without changing either point pool to fake damage',()=>{
  let f=start({poison:{pool:'agility',strict:true}},{agility:8});f=attack(f,1,1);f=resolveFatemasterEnemy(f,die(6,6));f=assignFatemasterDamage(f,'agility');
  f=resolveFatemasterCheck(reload(f),die(3,3));assert.equal(f.status,'loss');assert.equal(f.lossReason,'poison');assert.equal(f.player.agility,6);
});
test('weapon break is a separate saved check and removes only the weapon attack bonus',()=>{
  let f=start({weaponBreak:true},{weaponKind:'magic',weaponAttack:1,attackModifier:1});f=attack(f,4,4);
  assert.equal(f.pending.check,'weapon-break');assert.equal(f.player.damage,3);
  f=resolveFatemasterCheck(reload(f),die(2,3));assert.equal(f.player.damage,1);assert.equal(f.player.weaponAttack,0);assert.equal(f.player.attackModifier,1);assert.equal(f.phase,'player');
});
test('a magic weapon survives a modified seven and the final killing blow still checks breakage',()=>{
  let f=start({weaponBreak:true},{weaponKind:'magic'},[enemy({strength:2,agility:2,attackBonus:0,defenceBonus:0})]);
  f=attack(f,6,6);assert.equal(f.status,'fighting');assert.equal(f.pending.check,'weapon-break');
  f=resolveFatemasterCheck(reload(f),die(3,3));assert.equal(f.status,'win');assert.equal(f.player.damage,3);
});
test('unavoidable drain uses the current enemy Strength after the blow and has no attack roll',()=>{
  let f=start({response:'drain'});f=attack(f,4,4);assert.equal(f.pending.kind,'damage');assert.equal(f.pending.amount,5);
  f=assignFatemasterDamage(reload(f),'agility');assert.equal(f.phase,'player');assert.equal(f.player.agility,4);
  assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,0);
});
test('a lethal blow prevents a further drain and the threshold outcome takes priority over a kill',()=>{
  const dead=attack(start({response:'drain'},{damage:10}),4,4);assert.equal(dead.status,'win');assert.equal(dead.pending,null);
  let f=start({response:'miss-bolt',counterBoltDice:1,stopBelow:6});f=attack(f,6,6);f=attack(f,6,6);
  assert.equal(f.status,'paused');assert.equal(f.pauseReason,'opponent-threshold');assert.equal(f.pending,null);
});
test('counter-bolt dice must be explicitly supplied and the miss defence is saved separately',()=>{
  assert.throws(()=>start({response:'miss-bolt'}));
  let f=start({response:'miss-bolt',counterBoltDice:3});f=attack(f,1,1);
  assert.equal(f.pending.kind,'hostile-save');f=resolveFatemasterHostileSave(reload(f),die(3));
  assert.equal(f.phase,'player');assert.equal(f.player.power,3);
});
test('a counter-bolt hits Strength only and its rolled damage survives reload',()=>{
  let f=start({response:'miss-bolt',counterBoltDice:2},{power:0});f=attack(f,1,1);f=resolveFatemasterHostileSave(f,die(1));
  assert.equal(f.pending.kind,'hostile-damage');f=resolveFatemasterHostileDamage(reload(f),die(2,3));assert.equal(f.pending.amount,5);
  assert.throws(()=>assignFatemasterDamage(f,'agility'));f=assignFatemasterDamage(reload(f),'strength');assert.equal(f.player.strength,4);assert.equal(f.phase,'player');
});
test('two escape turns remain pending across reload and cannot award victory',()=>{
  let f=start({escape:{mode:'enemy-turns',turns:2}},{},[enemy(),enemy()]);f=withdrawFatemaster(f);
  for(let i=0;i<4;i++)f=resolveFatemasterEnemy(reload(f),die(1,1));
  assert.equal(f.status,'withdrawn');assert.equal(f.round,3);assert.equal(f.player.strength,9);assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,4);
});
test('death during escape stops the remaining turns and prevents withdrawal',()=>{
  let f=withdrawFatemaster(start({escape:{mode:'enemy-turns',turns:2}},{strength:2}));f=resolveFatemasterEnemy(f,die(6,6));f=assignFatemasterDamage(f,'strength');
  assert.equal(f.status,'loss');assert.equal(f.queue.length,0);assert.equal(f.pending,null);
});
test('failed escape check resumes combat; successful escape pays damage before withdrawing',()=>{
  const rule={escape:{mode:'check',pool:'agility',damage:2}};
  let f=withdrawFatemaster(start(rule));f=resolveFatemasterCheck(f,die(6,6));assert.equal(f.pending.kind,'enemy');
  f=withdrawFatemaster(start(rule));f=resolveFatemasterCheck(f,die(1,1));assert.equal(f.pending.amount,2);f=assignFatemasterDamage(f,'agility');assert.equal(f.status,'withdrawn');
});
test('climbing pauses after an enemy turn without performing the story check or awarding a win',()=>{
  let f=withdrawFatemaster(start({escape:{mode:'climb'}}));f=resolveFatemasterEnemy(f,die(1,1));
  assert.equal(f.status,'paused');assert.equal(f.pauseReason,'reader-check');
});
test('invalid actions and dice leave the original fight unchanged',()=>{
  const f=start(),before=JSON.stringify(f);assert.throws(()=>attackFatemaster(f,'absent',die(6,6)));
  assert.throws(()=>attackFatemaster(f,'enemy-0',die(7,1)));assert.throws(()=>withdrawFatemaster(f));assert.equal(JSON.stringify(f),before);
});
test('a replacement weapon changes only explicitly supplied combat gear at a player turn',()=>{
  const original=start({}, {attackModifier:1}),before=JSON.stringify(original);
  let f=equipFatemasterWeapon(original,{damage:5,weaponKind:'magic',weaponAttack:1});assert.equal(f.player.damage,5);assert.equal(f.player.attackModifier,1);
  f=attack(f,1,1);assert.throws(()=>equipFatemasterWeapon(f,{damage:4,weaponKind:'normal',weaponAttack:0}));assert.equal(JSON.stringify(original),before);
});
test('a helpless enemy can be explicitly finished without a hit roll while active foes retain their reply',()=>{
  const original=start({}, {},[enemy(),enemy()]);original.opponents[0].condition='asleep';
  const f=finishFatemasterHelplessOpponent(original,'enemy-0');assert.equal(f.opponents[0].strength,0);assert.equal(f.pending.enemyId,'enemy-1');
  assert.equal(f.events.filter(e=>e.type==='player-attack').length,0);assert.equal(original.opponents[0].strength,8);
});
test('a damage check can inflict different fleeing damage without inventing a failed-escape attack',()=>{
  const rules={escape:{mode:'damage-check',pool:'agility',successDamage:3,failureDamage:6}};
  for(const [dice,damage]of [[[1,1],3],[[6,6],6]]){
    let f=withdrawFatemaster(start(rules));f=resolveFatemasterCheck(f,die(...dice));assert.equal(f.pending.amount,damage);
    f=assignFatemasterDamage(f,'strength');assert.equal(f.status,'withdrawn');assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,0);
  }
});
test('a source escape failure can pause for a reader consequence rather than fabricate another attack',()=>{
  let f=withdrawFatemaster(start({escape:{mode:'check',pool:'agility',failureOutcome:'paused'}}));
  f=resolveFatemasterCheck(f,die(6,6));assert.equal(f.status,'paused');assert.equal(f.pauseReason,'failed-escape-check');
});
test('conditional parity escape requires unseen or invisible status and retains its exact even/odd result',()=>{
  const rule={escape:{mode:'check',pool:'agility',parity:true,requiresInvisibleOrUnseen:true}};
  assert.equal(withdrawFatemaster(start(rule)).pending.kind,'enemy');
  let f=withdrawFatemaster(start({...rule,unseen:true}));f=resolveFatemasterCheck(f,die(1,1));assert.equal(f.status,'withdrawn');
  f=withdrawFatemaster(start({...rule,unseen:true}));f=resolveFatemasterCheck(f,die(1,2));assert.equal(f.pending.kind,'enemy');
});
test('manual dice totals keep the actual supplied sum without inventing individual die faces',()=>{
  let f=attackFatemaster(start(),'enemy-0',{total:8});assert.equal(f.events.at(-1).manual,true);assert.equal(f.events.at(-1).dice,null);assert.equal(f.events.at(-1).total,8);
  f=resolveFatemasterEnemy(f,{total:12});assert.equal(f.pending.kind,'damage');assert.equal(f.pending.amount,2);
});
test('manual totals outside the dice range cannot consume a saved combat action',()=>{
  const f=start(),before=JSON.stringify(f);
  for(const total of [1,13,2.5,'8'])assert.throws(()=>attackFatemaster(f,'enemy-0',{total}));
  assert.equal(JSON.stringify(f),before);
});

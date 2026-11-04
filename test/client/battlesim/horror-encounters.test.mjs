import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight,strike,rollInitiative,advanceRound} from '../../../public/js/battlesim/engines/horror-classic/core.js';
import {playerPower,combatItem,resolveManually} from '../../../public/js/battlesim/engines/horror-classic/powers.js';
import {startMachine,machineStrike,resolveAttackMode,enemyShot,breakOff} from '../../../public/js/battlesim/engines/horror-classic/encounters.js';
import {naturalHealing} from '../../../public/js/battlesim/engines/horror-classic/math.js';
import {attemptFlight} from '../../../public/js/battlesim/engines/horror-classic/special.js';

// Synthetic combatants exercise declarative mechanics; printed rosters remain in the database.
const person=(v={})=>({name:'Combatant',lifePoints:100,speed:3,courage:3,strength:4,skill:3,psi:3,...v});
const fight=(v={})=>startFight({role:'monster',player:person(),enemies:[person()],...v});
const hit=(f,actor,total=6,enemyIndex=0)=>strike(f,{actor,total,enemyIndex});

test('surprise attacks resolve once per designated opponent, including a sequential group',()=>{
  const rules={openingStrikeCount:2,playerStats:{strength:6,speed:6},incomingDamageReduction:3};
  let f=fight({enemies:[person({rules}),person({rules}),person({rules})],groupMode:'sequential'});
  assert.throws(()=>hit(f,'player'));
  f=hit(f,'enemy',6,1);
  assert.equal(f.player.lifePoints,90);
  assert.throws(()=>hit(f,'player'));
  f=hit(f,'enemy',5,0);
  assert.deepEqual(f.openingStrikesRemaining,[]);
  assert.equal(hit(f,'player').enemies[0].lifePoints,85);
  const initiative=rollInitiative(fight({enemies:[person({rules:{playerStats:{speed:6}}})]}),{playerRoll:1,enemyRoll:1});
  assert.equal(initiative.events.at(-1).playerScore,10);
});

test('every-second-strike empowerment spends PSI on that strike, not the following one',()=>{
  let f=fight({enemies:[person({psi:1,rules:{everyNthDouble:2}})]});
  f=hit(f,'enemy');assert.equal(f.player.lifePoints,87);assert.equal(f.enemies[0].psi,1);
  f=hit(f,'enemy');assert.equal(f.player.lifePoints,61);assert.equal(f.enemies[0].psi,0);
  f=hit(f,'enemy');assert.equal(f.player.lifePoints,48);
  f=hit(f,'enemy');assert.equal(f.player.lifePoints,35);
  f=fight({allies:[person({psi:1,rules:{everyNthDouble:2,damageBonus:3}})]});
  f=strike(f,{actor:'ally',total:6});assert.equal(f.enemies[0].lifePoints,84);
  f=strike(f,{actor:'ally',total:6});assert.equal(f.enemies[0].lifePoints,52);
  assert.equal(f.allies[0].psi,0);
});

test('PSI resurrections restore full or successively doubled life and stop at exhaustion',()=>{
  let f=fight({enemies:[person({lifePoints:5,psi:2,rules:{resurrection:{usePsi:true}}})]});
  f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,5);assert.equal(f.enemies[0].psi,1);
  f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,5);assert.equal(f.enemies[0].psi,0);
  assert.equal(hit(f,'player').outcome,'win');
  f=fight({enemies:[person({lifePoints:5,psi:2,rules:{resurrection:{usePsi:true,doubleLife:true}}})]});
  f=hit(f,'player',12);assert.equal(f.enemies[0].lifePoints,10);
  f=hit(f,'player',12);assert.equal(f.enemies[0].lifePoints,20);
  f=hit(f,'player',12);assert.equal(f.enemies[0].lifePoints,1);assert.equal(f.outcome,null);
  assert.equal(hit(f,'player').outcome,'win');
});

test('the Guardian uses an explicit pre-combat die; the gnome guilt condition follows actual kills',()=>{
  const enemy=person({lifePoints:1,psi:0,rules:{resurrection:{rollCount:true}}});
  assert.throws(()=>fight({enemies:[enemy]}));
  assert.throws(()=>fight({enemies:[enemy],options:{resurrectionCount:2.5}}));
  let f=fight({enemies:[enemy],options:{resurrectionCount:2}});
  f=hit(hit(f,'player'),'player');assert.equal(f.outcome,null);
  assert.equal(hit(f,'player').outcome,'win');
  f=fight({enemies:[person({lifePoints:1,psi:6,rules:{resurrection:{usePsi:true,guiltAfterKills:7}}})]});
  for(let i=0;i<6;i++) {f=hit(f,'player');assert.equal(f.outcome,null);}
  f=hit(f,'player');assert.equal(f.outcome,'loss');assert.equal(f.enemies[0].status.kills,7);
});

test('the gnome withdraws after cumulative life removed, and opening group damage applies once',()=>{
  let f=fight({options:{bodyArmour:true},enemies:[person({rules:{withdrawAfterDamage:10}})]});
  f=hit(f,'enemy');assert.equal(f.outcome,null);
  f=hit(f,'enemy');assert.equal(f.outcome,'escaped');assert.equal(f.player.lifePoints,87);
  const rules={groupOpeningDamage:40,allowBreakOff:true};
  f=fight({enemies:[person({rules}),person({rules})],groupMode:'manual'});
  assert.equal(f.player.lifePoints,60);
  assert.equal(fight({player:person({lifePoints:60}),options:{openingDamageApplied:true},enemies:[person({rules})]}).player.lifePoints,60);
  assert.equal(breakOff(f).player.lifePoints,60);assert.equal(breakOff(f).outcome,'escaped');
  assert.equal(fight({player:person({lifePoints:30}),enemies:[person({rules})]}).outcome,'loss');
  assert.throws(()=>breakOff(fight()));
});

test('elemental fixed damage replaces ordinary attacks; cold immunity does not block fire',()=>{
  const rules={onRoll:[{scores:[11,12],effect:'damage',amount:20,element:'fire',psiCost:1,replacesOrdinary:true}]};
  let f=fight({options:{coldImmune:true},enemies:[person({psi:1,rules})]});
  f=hit(f,'enemy',11);assert.equal(f.player.lifePoints,80);assert.equal(f.enemies[0].psi,0);
  f=hit(f,'enemy',11);assert.equal(f.player.lifePoints,62);
  const cold={fatalRolls:[11,12],fatalElement:'cold'};
  assert.equal(hit(fight({enemies:[person({rules:cold})]}),'enemy',11).outcome,'loss');
  f=hit(fight({options:{coldImmune:true},enemies:[person({rules:cold})]}),'enemy',11);
  assert.equal(f.player.lifePoints,100);assert.equal(f.outcome,null);
  const armored=fight({role:'doctor',options:{bodyArmour:true},enemies:[person({rules})]});
  assert.equal(hit(armored,'enemy',12).player.lifePoints,90);
});

test('cold combat penalties preserve base stats and source hit thresholds',()=>{
  const f=fight({enemies:[person({rules:{playerStrengthMultiplier:0.5,playerSpeedMultiplier:0.5,playerHitThreshold:8}})]});
  assert.equal(hit(f,'player',7).enemies[0].lifePoints,100);
  assert.equal(hit(f,'player',8).enemies[0].lifePoints,87);
  assert.equal(f.player.strength,4);assert.equal(f.player.speed,3);
  assert.equal(rollInitiative(f,{playerRoll:1,enemyRoll:1}).events.at(-1).playerScore,5.5);
});

test('combat-only disease ends with combat while existing plague remains until treated',()=>{
  const rules={onRoll:[{scores:[12],effect:'poison',amount:5,combatOnly:true}]};
  let f=fight({player:person({status:{poison:5}}),enemies:[person({lifePoints:1,rules})]});
  f=hit(f,'enemy',12);f=advanceRound(f);assert.equal(f.player.lifePoints,76);
  f=hit(f,'player');assert.equal(f.outcome,'win');assert.equal(f.player.status.combatPoison,undefined);
  assert.equal(f.player.status.poison,5);
  f=fight({player:person({status:{poison:5}})});
  f=combatItem(f,{item:'triple-dose'});assert.equal(f.player.status.poison,0);
});

test('overlapping ray attacks and wrapping-round interpretation require explicit rulings',()=>{
  const rules={chooseAttackOnRoll:[12],electricDamage:10,wrapRounds:3};
  const pending=hit(fight({enemies:[person({rules})]}),'enemy',12);
  assert.equal(pending.pending.kind,'attack-mode');assert.equal(pending.player.lifePoints,100);
  assert.throws(()=>resolveAttackMode(pending,{mode:'wrap',note:'Chosen interpretation'}));
  assert.throws(()=>resolveAttackMode(pending,{mode:'electric'}));
  const electric=resolveAttackMode(pending,{mode:'electric',note:'Electrical mode only'});
  assert.equal(electric.player.lifePoints,90);assert.equal(electric.player.status.wrapLastRound,undefined);
  let f=resolveAttackMode(pending,{mode:'both',countCurrentRound:true,note:'Both modes; count this round'});
  assert.equal(f.player.lifePoints,90);assert.equal(f.player.status.wrapLastRound,3);
  f=advanceRound(f);f=advanceRound(hit(f,'player',2));assert.equal(f.outcome,null);
  f=advanceRound(hit(f,'player',2));assert.equal(f.outcome,'loss');
  const later=resolveAttackMode(pending,{mode:'wrap',countCurrentRound:false,note:'Count from next round'});
  assert.equal(later.player.status.wrapLastRound,4);
  assert.equal(pending.player.lifePoints,100);
});

test('the mechanical encounter uses database-supplied rules without fabricated enemy stats',()=>{
  const config={role:'doctor',player:person(),rules:{machineStopRoll:12,machineDamage:7}};
  assert.throws(()=>startMachine({...config,rules:undefined}));
  let f=startMachine(config);
  assert.equal(f.enemies[0].lifePoints,undefined);assert.equal(f.enemies[0].strength,undefined);
  assert.throws(()=>hit(f,'player',12));
  f=machineStrike(f,{actor:'player',total:11});assert.equal(f.outcome,null);
  f=machineStrike(f,{actor:'enemy',total:5});assert.equal(f.player.lifePoints,100);
  f=machineStrike(f,{actor:'enemy',total:6});assert.equal(f.player.lifePoints,93);
  assert.equal(machineStrike(f,{actor:'player',total:12}).outcome,'win');
  f=playerPower(startMachine(config),{power:'body-armour',payment:'psi'});
  assert.equal(f.outcome,null);
  assert.equal(machineStrike(f,{actor:'enemy',total:12}).player.lifePoints,96.5);
  const other=startMachine({...config,rules:{machineStopRoll:11,machineDamage:4}});
  assert.equal(machineStrike(other,{actor:'player',total:11}).outcome,'win');
  assert.equal(machineStrike(other,{actor:'enemy',total:6}).player.lifePoints,96);
});

test('the pistol permits exactly one fatal-shot check and victory recovery does not rescue death',()=>{
  const original=fight({enemies:[person({rules:{singleFatalShot:9}})]});
  const missed=enemyShot(original,{total:8});assert.equal(missed.player.lifePoints,100);
  assert.equal(hit(missed,'enemy').player.lifePoints,87);
  assert.throws(()=>enemyShot(missed,{total:9}));
  assert.equal(enemyShot(original,{total:9}).outcome,'loss');
  assert.equal(original.enemies[0].status.shotUsed,undefined);
  const recover=fight({player:person({lifePoints:10}),enemies:[person({lifePoints:1,rules:{restorePlayerOnVictory:true}})]});
  assert.equal(hit(recover,'player').player.lifePoints,100);
  assert.equal(hit(recover,'enemy').outcome,'loss');
});

test('good luck changes chosen player throws without lowering opponents or inventing unlisted power results',()=>{
  let f=fight({options:{luckBonus:2}});
  const init=rollInitiative(f,{playerRoll:1,enemyRoll:1}).events.at(-1);
  assert.equal(init.playerScore,9);assert.equal(init.enemyScore,7);
  assert.equal(hit(f,'player',4).enemies[0].lifePoints,87);
  assert.equal(hit(f,'enemy',4).player.lifePoints,100);
  assert.equal(playerPower(f,{power:'love-affair',payment:'psi',total:2}).outcome,'win');
  assert.equal(attemptFlight(f,{total:7,failedRule:'detailed'}).outcome,'escaped');
  assert.equal(naturalHealing(person({lifePoints:50}),{role:'monster',score:5,bonus:2,rules:'detailed'}).player.lifePoints,57);
  f=playerPower(fight({role:'doctor',options:{luckBonus:2}}),{power:'mad-science',payment:'psi',total:6});
  assert.equal(f.pending.kind,'source-roll');assert.equal(f.pending.score,8);assert.equal(f.player.psi,2);
  assert.equal(resolveManually(f,{playerLife:100,enemyLife:100,note:'Original table has no result; resolved manually.'}).pending,null);
});

test('brandy and crushed-arm conditions miss only the specified strikes',()=>{
  let f=fight({options:{missFirstStrikes:3}});
  for(let i=0;i<3;i++) {f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,100);}
  assert.equal(hit(f,'player').enemies[0].lifePoints,87);
  f=fight({options:{missEveryOtherStrike:true}});
  f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,87);
  f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,87);
  f=hit(f,'player');assert.equal(f.enemies[0].lifePoints,74);
});

test('medicine restores life only after survival and cold immunity removes cold penalties',()=>{
  const rules={playerStrengthMultiplier:0.5,playerSpeedMultiplier:0.5,playerHitThreshold:8,coldPenalty:true};
  const f=fight({options:{coldImmune:true},enemies:[person({rules})]});
  assert.equal(hit(f,'player',6).enemies[0].lifePoints,87);
  assert.equal(rollInitiative(f,{playerRoll:1,enemyRoll:1}).events.at(-1).playerScore,7);
  const healed=fight({player:person({lifePoints:20}),options:{restoreAfterFight:true},enemies:[person({lifePoints:1})]});
  assert.equal(hit(healed,'player').player.lifePoints,100);
  const dead=fight({player:person({lifePoints:10}),options:{restoreAfterFight:true}});
  assert.equal(hit(dead,'enemy').outcome,'loss');
});

test('an unavailable PSI stat remains unavailable without preventing physical combat',()=>{
  const f=fight({enemies:[person({psi:undefined,rules:{unavailableStats:['psi']}})]});
  assert.equal(f.enemies[0].psi,null);
  assert.equal(hit(f,'enemy').player.lifePoints,87);
  assert.throws(()=>fight({enemies:[person({psi:undefined})]}));
});

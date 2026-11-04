import test from 'node:test';
import assert from 'node:assert/strict';
import {rollDice, effectiveStats, strikeDamage, naturalHealing} from '../../../public/js/battlesim/engines/horror-classic/math.js';
import {startFight, rollInitiative, strike, resolveStrike, advanceRound, stopFight} from '../../../public/js/battlesim/engines/horror-classic/core.js';
import {playerPower, combatItem, enemyPower, resolveManually, endCalmedFight, allyMindCloud, resolveMadScience} from '../../../public/js/battlesim/engines/horror-classic/powers.js';
import {attemptFlight, startArchery, archeryCheck, resolveArchery} from '../../../public/js/battlesim/engines/horror-classic/special.js';
import {createState} from '../../../public/js/battlesim/books/1575/state.js';

// Synthetic values isolate the algorithms; the printed encounter roster stays in the database.
const person = (values = {}) => ({name:'Combatant', lifePoints:100, speed:3, courage:3, strength:4, skill:3, psi:3, ...values});
const encounter = (values = {}) => ({role:'harker', player:person(), enemies:[person({name:'Opponent'})], ...values});
const fight = values => startFight(encounter(values));
const throwAt = (input, actor, total, enemyIndex = 0) => strike(input, {actor, total, enemyIndex});

test('dice, initiative ties, equipment and fractional garlic modifiers', () => {
  assert.equal(rollDice(2, () => 3).total, 6);
  for (const total of [0,1,13,2.5]) assert.throws(() => rollDice(2, undefined, total));
  const tied = rollInitiative(fight(), {playerRoll:3, enemyRoll:3});
  assert.equal(tied.first, null);
  assert.equal(rollInitiative(tied, {playerRoll:4, enemyRoll:3}).first, 'player');
  assert.deepEqual(effectiveStats(person(), {garlicOil:true, weapon:'mace'}),
    {speed:0,courage:1.5,strength:2,skill:0,psi:1.5});
  assert.equal(strikeDamage(person(),person(),6,{weapon:'dagger'}),15);
  assert.equal(strikeDamage(person(),person(),6,{weapon:'mace'}),20);
  assert.equal(strikeDamage(person(),person(),5,{weapon:'flintlock'}),0);
  assert.equal(strikeDamage(person(),person(),6,{weapon:'flintlock'}),33);
});

test('strikes preserve input and apply the hit threshold and source damage', () => {
  const original = fight(), before = structuredClone(original);
  assert.equal(throwAt(original,'player',5).enemies[0].lifePoints,100);
  assert.equal(throwAt(original,'player',6).enemies[0].lifePoints,87);
  assert.deepEqual(original,before);
  const harder = fight({enemies:[person({rules:{playerHitThreshold:8,armor:3}})]});
  assert.equal(throwAt(harder,'player',7).enemies[0].lifePoints,100);
  assert.equal(throwAt(harder,'player',8).enemies[0].lifePoints,88);
  assert.equal(throwAt(fight({options:{weapon:'flintlock'}}),'player',6).flintlockUsed,true);
  assert.throws(() => throwAt(throwAt(fight({options:{weapon:'flintlock'}}),'player',4),'player',7));
});

test('feeding requires explicit effect order, caps life, and weapons suppress it', () => {
  const original = fight({role:'dracula',player:person({lifePoints:30}),enemies:[person({lifePoints:20})]});
  const pending = throwAt(original,'player',6);
  assert.equal(pending.pending.kind,'effect-order');
  assert.equal(pending.player.lifePoints,30); assert.equal(pending.enemies[0].lifePoints,20);
  assert.throws(() => advanceRound(pending));
  assert.throws(() => playerPower(pending,{power:'transform',payment:'psi'}));
  assert.equal(resolveStrike(pending,'effects-first').player.lifePoints,50);
  assert.equal(resolveStrike(pending,'damage-first').player.lifePoints,37);
  const armed = fight({role:'dracula',player:person({lifePoints:30}),options:{weapon:'dagger'}});
  assert.equal(throwAt(armed,'player',6).player.lifePoints,30);
  const capped = throwAt(fight({role:'dracula',player:person({lifePoints:95})}),'player',6);
  assert.equal(resolveStrike(capped,'effects-first').player.lifePoints,100);
  const poison = fight({role:'dracula',enemies:[person({rules:{poisonousBlood:true}})]});
  assert.equal(throwAt(poison,'player',6).outcome,'loss');
});

test('fractional half and quarter effects require explicit damage ordering and spend PSI only once', () => {
  const original = fight({player:person({lifePoints:81}),enemies:[person({psi:1,
    rules:{onRoll:[{scores:[6],effect:'half',psiCost:1}]}})]});
  const pending = throwAt(original,'enemy',6);
  assert.equal(pending.enemies[0].psi,1);
  const first = resolveStrike(pending,'effects-first');
  assert.equal(first.player.lifePoints,27.5); assert.equal(first.enemies[0].psi,0);
  assert.equal(resolveStrike(pending,'damage-first').player.lifePoints,34);
  assert.equal(throwAt(first,'enemy',6).player.lifePoints,14.5);
  const quarter = fight({player:person({lifePoints:81}),enemies:[person({rules:{noOrdinaryDamage:true,
    onRoll:[{scores:[9],effect:'quarter'}]}})]});
  assert.equal(throwAt(quarter,'enemy',9).player.lifePoints,60.75);
});

test('poison applies once per explicitly completed round, mind cloud blocks two complete rounds', () => {
  let f = fight({enemies:[person({rules:{onRoll:[{scores:[11],effect:'poison',amount:5},
    {scores:[12],effect:'cloud',rounds:2}]}})]});
  f = throwAt(f,'enemy',11); assert.equal(f.player.lifePoints,82);
  f = advanceRound(f); assert.equal(f.player.lifePoints,77);
  f = throwAt(f,'enemy',12); f = advanceRound(f);
  assert.equal(f.round,3);
  const hp = f.enemies[0].lifePoints;
  f = throwAt(f,'player',12); assert.equal(f.enemies[0].lifePoints,hp);
  f = advanceRound(f); f = throwAt(f,'player',12); assert.equal(f.enemies[0].lifePoints,hp);
  f = advanceRound(f); f = throwAt(f,'player',12); assert.equal(f.enemies[0].lifePoints,hp-19);
});

test('negative defeat thresholds and group sequencing remain explicit', () => {
  const f = fight({enemies:[person({lifePoints:5,rules:{defeatAt:-10}})]});
  const hurt = throwAt(f,'player',6);
  assert.equal(hurt.enemies[0].lifePoints,-8); assert.equal(hurt.outcome,null);
  assert.equal(throwAt(hurt,'player',6).outcome,'win');
  assert.throws(() => fight({enemies:[person(),person()]}));
  const group = fight({enemies:[person({lifePoints:1}),person()],groupMode:'sequential'});
  assert.throws(() => throwAt(group,'player',6,1));
  const next = throwAt(group,'player',6);
  assert.equal(throwAt(next,'player',6,1).enemies[1].lifePoints,87);
  assert.equal(stopFight(next).outcome,'cancelled');
});

test('PSI powers charge correctly, stop at death and preserve exact fractions', () => {
  let f = playerPower(fight(),{power:'beatification',payment:'psi'});
  assert.equal(f.player.psi,2); assert.equal(throwAt(f,'player',6).enemies[0].lifePoints,82);
  assert.throws(() => playerPower(f,{power:'beatification',payment:'psi'}));
  assert.throws(() => playerPower(f,{power:'sanctuary',payment:'life'}));
  f = playerPower(fight({player:person({psi:0,lifePoints:50.5})}),{power:'sanctuary',payment:'life'});
  assert.equal(f.player.lifePoints,30.5); assert.equal(throwAt(f,'enemy',6).player.lifePoints,22.5);
  f = playerPower(fight({player:person({psi:0,lifePoints:20})}),{power:'sanctuary',payment:'life'});
  assert.equal(f.outcome,'loss'); assert.equal(f.options.sanctuary,undefined);
  assert.throws(() => playerPower(fight(),{power:'transform',payment:'psi'}));
  f = playerPower(fight({role:'dracula'}),{power:'transform',payment:'psi'});
  assert.equal(f.player.psi,2); assert.equal(throwAt(f,'enemy',7).player.lifePoints,100);
  assert.equal(throwAt(f,'player',7).enemies[0].lifePoints,89);
  f = playerPower(f,{power:'transform',payment:'psi'});
  assert.equal(f.player.psi,1); assert.equal(f.options.bat,false);
});

test('stake driving consumes the next attack, including a miss, and supports group fights', () => {
  const original = fight({enemies:[person({rules:{vampire:true}}),person()],groupMode:'manual'});
  const armed = playerPower(original,{power:'stake',payment:'psi'});
  const missed = throwAt(armed,'player',4);
  assert.equal(missed.stakeArmed,false);
  assert.equal(throwAt(missed,'player',6).enemies[0].lifePoints,87);
  const staked = throwAt(armed,'player',6);
  assert.equal(staked.enemies[0].lifePoints,0); assert.equal(staked.outcome,null);
  assert.equal(staked.roundActions,1);
});

test('Hand halves current life and grants two free strikes; paralyser targets vampires', () => {
  let f = combatItem(fight({enemies:[person({lifePoints:81})]}),{item:'hand'});
  assert.equal(f.enemies[0].lifePoints,40.5); assert.equal(f.freePlayerAttacks,2);
  assert.throws(() => throwAt(f,'enemy',6));
  f = throwAt(f,'player',6); assert.throws(() => throwAt(f,'enemy',6));
  f = throwAt(f,'player',6); assert.equal(f.freePlayerAttacks,0);
  assert.equal(throwAt(f,'enemy',6).player.lifePoints,87);
  assert.throws(() => combatItem(f,{item:'hand'}));
  assert.throws(() => combatItem(fight(),{item:'paralyser'}));
  assert.equal(combatItem(fight({enemies:[person({rules:{vampire:true}})]}),{item:'paralyser'}).first,'player');
});

test('small-animal control calms a pack, permits recruitment and does not fabricate victory', () => {
  const original = fight({role:'dracula',enemies:[person({rules:{smallAnimal:true}}),person({rules:{smallAnimal:true}})],
    groupMode:'sequential'});
  let f = playerPower(original,{power:'calm',payment:'psi',enemyIndices:[0,1]});
  assert.equal(f.player.psi,2); assert.equal(f.outcome,null);
  assert.ok(f.enemies.every(e=>e.calmed));
  assert.throws(() => throwAt(f,'enemy',6));
  f = playerPower(f,{power:'recruit',payment:'psi',enemyIndices:[0]});
  assert.equal(f.player.psi,1); assert.equal(f.enemies[0].recruited,true);
  assert.equal(endCalmedFight(f).outcome,'escaped');
  assert.throws(() => playerPower(fight({role:'dracula'}),{power:'calm',payment:'psi'}));
});

test('Van Helsing abilities honor the original life threshold without guessing thunderbolt dice', () => {
  let f = fight({enemies:[person({maxLife:100,lifePoints:50,rules:{powers:['thunderbolt','caduceus','sickener','stakeout']}})]});
  assert.throws(() => enemyPower(f,{power:'thunderbolt'}));
  assert.equal(enemyPower(f,{power:'thunderbolt',total:6}).player.lifePoints,80);
  f = enemyPower(f,{power:'caduceus',total:9}); assert.equal(f.enemies[0].lifePoints,59);
  const low = structuredClone(f); low.enemies[0].lifePoints=49;
  assert.throws(() => enemyPower(low,{power:'caduceus',total:12}));
  const stake = enemyPower(f,{power:'stakeout'});
  assert.equal(throwAt(stake,'enemy',6).player.lifePoints,82);
  assert.equal(throwAt(stake,'enemy',12).outcome,'loss');
  assert.equal(throwAt(throwAt(stake,'enemy',6),'enemy',6).player.lifePoints,69);
});

test('Dracula empowerment spends PSI, then requires a twelve, and applies to one strike', () => {
  let f = fight({enemies:[person({psi:1,rules:{powers:['double-strike']}})]});
  f = enemyPower(f,{power:'double-strike'}); assert.equal(f.enemies[0].psi,0);
  assert.throws(() => enemyPower(f,{power:'double-strike'}));
  f = throwAt(f,'enemy',6); assert.equal(f.player.lifePoints,74);
  f = throwAt(f,'enemy',6); assert.equal(f.player.lifePoints,61);
  assert.equal(enemyPower(f,{power:'double-strike',total:11}).enemies[0].status.doubleNext,false);
  assert.equal(enemyPower(f,{power:'double-strike',total:12}).enemies[0].status.doubleNext,true);
});

test('manual source rulings require a note; natural healing preserves both printed thresholds', () => {
  assert.throws(() => resolveManually(fight(),{playerLife:80,enemyLife:50}));
  assert.equal(resolveManually(fight(),{playerLife:80.5,enemyLife:0,note:'Source ruling'}).outcome,'win');
  assert.equal(naturalHealing(person({lifePoints:50}),{role:'harker',score:6,rules:'detailed'}).player.lifePoints,44);
  assert.equal(naturalHealing(person({lifePoints:50}),{role:'harker',score:6,rules:'synopsis'}).player.lifePoints,56);
  assert.equal(naturalHealing(person({lifePoints:'50'}),{role:'harker',score:8,rules:'detailed'}).player.lifePoints,58);
  assert.throws(() => naturalHealing(person(),{role:'dracula',score:12,rules:'detailed'}));
  assert.throws(() => naturalHealing(person({lifePoints:0}),{role:'harker',score:12,rules:'detailed'}));
});

test('cancellation clears a pending effect without awarding a result or applying its damage', () => {
  const pending=throwAt(fight({role:'dracula',player:person({lifePoints:30})}),'player',6);
  const cancelled=stopFight(pending);
  assert.equal(cancelled.outcome,'cancelled'); assert.equal(cancelled.pending,null);
  assert.equal(cancelled.player.lifePoints,30); assert.equal(cancelled.enemies[0].lifePoints,100);
});

test('flight supports safe exits, a retreating free strike and both failed-flight readings', () => {
  const original = fight();
  assert.equal(attemptFlight(original,{total:9,failedRule:'detailed'}).outcome,'escaped');
  let retreat = attemptFlight(original,{total:5,failedRule:'detailed'});
  assert.equal(retreat.retreatPending,true);
  assert.throws(() => throwAt(retreat,'player',6));
  assert.throws(() => advanceRound(retreat));
  retreat = throwAt(retreat,'enemy',6);
  assert.equal(retreat.player.lifePoints,81); assert.equal(retreat.outcome,'escaped');
  const detailed = attemptFlight(original,{total:2,failedRule:'detailed'});
  assert.equal(detailed.first,'enemy');
  assert.equal(throwAt(detailed,'enemy',6).player.lifePoints,74);
  const synopsis = attemptFlight(original,{total:2,failedRule:'synopsis'});
  assert.equal(throwAt(synopsis,'enemy',6).player.lifePoints,81);
  assert.equal(throwAt(throwAt(detailed,'enemy',6),'enemy',6).player.lifePoints,61);
  assert.throws(() => attemptFlight(detailed,{total:12,failedRule:'detailed'}));
  assert.throws(() => attemptFlight(throwAt(original,'player',6),{total:12,failedRule:'detailed'}));
});

test('archery uses source SPEED and fatal shots without fabricating health or repeated attacks', () => {
  const original = startArchery({player:person(),role:'dracula'});
  assert.equal(original.enemies[0].lifePoints,undefined);
  assert.throws(() => throwAt(original,'player',8));
  let f = archeryCheck(original,{total:4}); assert.equal(f.special.stage,'enemy');
  assert.equal(archeryCheck(f,{total:8}).outcome,'loss');
  f = archeryCheck(f,{total:7}); assert.equal(f.special.stage,'player');
  assert.equal(archeryCheck(f,{total:8}).outcome,'win');
  f = archeryCheck(f,{total:7}); assert.equal(f.special.stage,'manual');
  assert.throws(() => archeryCheck(f,{total:8}));
  assert.throws(() => resolveArchery(f,{decision:'player'}));
  assert.equal(resolveArchery(f,{decision:'player',note:'Chosen interpretation'}).special.stage,'player');
  const equal = archeryCheck(original,{total:3}); assert.equal(equal.special.reason,'equal-speed');
});

test('teleport ends a fight without victory; exhausted PSI twelve empowers the following strike', () => {
  const gnomes = fight({enemies:[person({rules:{noOrdinaryDamage:true,
    onRoll:[{scores:[10,11,12],effect:'teleport',psiCost:1}]}})]});
  const escaped = throwAt(gnomes,'enemy',10);
  assert.equal(escaped.outcome,'escaped'); assert.equal(escaped.player.lifePoints,100);
  const original = fight({enemies:[person({psi:0,rules:{onRoll:[{scores:[12],effect:'empower',onlyWithoutPsi:true}]}})]});
  const empowered = throwAt(original,'enemy',12);
  assert.equal(empowered.player.lifePoints,81); assert.equal(empowered.enemies[0].status.doubleNext,true);
  assert.equal(throwAt(empowered,'enemy',6).player.lifePoints,55);
});

test('per-run state saves exactly one history result and preserves other simulator data', () => {
  const run = {sim12:{untouched:true}}, other = {};
  let current = run, book = 1575, saves = 0;
  const store = createState(()=>({currentBookId:book,currentPlaythrough:()=>current,saveState:()=>saves++}));
  store.change(data=>{data.fight=throwAt(fight({enemies:[person({lifePoints:1})]}),'player',6);});
  assert.equal(run.sim1575.history.length,1); assert.equal(run.sim1575.fight.recorded,true);
  store.change(()=>{}); assert.equal(run.sim1575.history.length,1);
  assert.deepEqual(run.sim12,{untouched:true});
  store.change(data=>{data.fight=stopFight(fight());}); assert.equal(run.sim1575.history.length,1);
  current=other; assert.equal(store.read(),null);
  store.change(()=>{}); assert.equal(other.sim1575.history.length,0);
  book=1574; assert.equal(store.read(),null); assert.equal(store.change(()=>{}),false);
  book=1575; current=run;
  const original = run.sim1575, previousSaves=saves;
  assert.equal(store.change(()=>{current=other;}),false);
  assert.equal(run.sim1575,original); assert.equal(saves,previousSaves);
});

test('garlic oil halves available PSI and leaves fractional resource rulings explicit', () => {
  const original=fight({options:{garlicOil:true},player:person({psi:3})});
  const blessed=playerPower(original,{power:'beatification',payment:'psi'});
  assert.equal(blessed.player.psi,1);
  assert.throws(()=>playerPower(blessed,{power:'sanctuary',payment:'psi'}),/Fractional PSI/);
  assert.throws(()=>playerPower(blessed,{power:'sanctuary',payment:'life'}),/Fractional PSI/);
  const ruled=resolveManually(blessed,{playerLife:100,enemyLife:100,playerPsi:0,note:'Fractional PSI exhausted under chosen ruling'});
  assert.equal(playerPower(ruled,{power:'sanctuary',payment:'life'}).player.lifePoints,80);
});

test('allies attack and receive source effects without borrowing player powers or causing false defeats', () => {
  const original=fight({role:'dracula',options:{weapon:'mace',blessed:true},
    allies:[person({name:'Ally',lifePoints:20,rules:{mindCloud:true}})],
    enemies:[person({rules:{onRoll:[{scores:[11],effect:'half'}]}})]});
  const hit=strike(original,{actor:'ally',allyIndex:0,total:6});
  assert.equal(hit.enemies[0].lifePoints,87);assert.equal(hit.player.lifePoints,100);
  const pending=strike(original,{actor:'enemy',targetAllyIndex:0,total:11});
  assert.equal(pending.pending.kind,'effect-order');
  const resolved=resolveStrike(pending,'effects-first');
  assert.equal(resolved.allies[0].lifePoints,-8);assert.equal(resolved.player.lifePoints,100);assert.equal(resolved.outcome,null);
  assert.throws(()=>strike(resolved,{actor:'ally',allyIndex:0,total:6}));
  const lethal=fight({allies:[person({lifePoints:20})],enemies:[person({rules:{fatalRolls:[12]}})]});
  const killed=strike(lethal,{actor:'enemy',targetAllyIndex:0,total:12});
  assert.equal(killed.allies[0].lifePoints,0);assert.equal(killed.outcome,null);
});

test('Igor clouds the chosen enemy for two rounds on 11/12 or by explicit order', () => {
  let f=fight({allies:[person({name:'Igor',rules:{mindCloud:true}})]});
  const ordered=allyMindCloud(f,{allyIndex:0});assert.equal(ordered.allies[0].psi,2);
  f=strike(f,{actor:'ally',total:11});assert.equal(f.allies[0].psi,2);
  f=advanceRound(f);const hp=f.player.lifePoints;
  f=throwAt(f,'enemy',12);assert.equal(f.player.lifePoints,hp);
  f=advanceRound(f);f=throwAt(f,'enemy',12);assert.equal(f.player.lifePoints,hp);
  f=advanceRound(f);f=throwAt(f,'enemy',12);assert.equal(f.player.lifePoints,hp-19);
});

test('Monster Terror Strike consumes exactly the next opponent strike; Blood Lust consumes the next player strike', () => {
  const original=fight({role:'monster'}),before=structuredClone(original);
  const terror=playerPower(original,{power:'terror-strike',payment:'psi'});
  assert.equal(terror.player.psi,2);
  assert.throws(()=>playerPower(terror,{power:'terror-strike',payment:'psi'}));
  const missed=throwAt(terror,'enemy',12);
  assert.equal(missed.player.lifePoints,100);
  assert.equal(throwAt(missed,'enemy',6).player.lifePoints,87);
  const lust=playerPower(original,{power:'blood-lust',payment:'psi'});
  assert.equal(throwAt(lust,'player',6).enemies[0].lifePoints,74);
  const failed=throwAt(lust,'player',5);
  assert.equal(failed.player.status.doubleNext,false);
  assert.equal(throwAt(failed,'player',6).enemies[0].lifePoints,87);
  assert.deepEqual(original,before);
});

test('Love Affair has the printed chance, records victory and respects explicit immunity', () => {
  const original=fight({role:'monster'});
  assert.equal(playerPower(original,{power:'love-affair',payment:'psi',total:3}).outcome,null);
  const befriended=playerPower(original,{power:'love-affair',payment:'psi',total:4});
  assert.equal(befriended.outcome,'win');
  assert.equal(befriended.enemies[0].lifePoints,100);
  const immune=fight({role:'monster',enemies:[person({rules:{friendshipImmune:true}})]});
  assert.throws(()=>playerPower(immune,{power:'love-affair',payment:'psi',total:6}));
  assert.equal(immune.player.psi,3);
  assert.throws(()=>playerPower(original,{power:'mad-science',payment:'psi',total:4}));
});

test('Mad Science doubles combat strength, causes direct electrical damage, and resolves sleep without fabricated attacks', () => {
  const original=fight({role:'doctor'});
  const strong=playerPower(original,{power:'mad-science',payment:'psi',total:1});
  assert.equal(throwAt(strong,'player',6).enemies[0].lifePoints,83);
  assert.equal(strong.player.strength,4);
  assert.equal(playerPower(original,{power:'mad-science',payment:'psi',total:2}).enemies[0].lifePoints,75);
  const sleeping=playerPower(original,{power:'mad-science',payment:'psi',total:4});
  assert.equal(sleeping.outcome,'win');
  assert.equal(sleeping.enemies[0].lifePoints,100);
  assert.equal(playerPower(original,{power:'mad-science',payment:'psi',total:5}).outcome,'loss');
});

test('Mad Science cackling retains zero SPEED and two opposing strikes for each player strike', () => {
  let f=playerPower(fight({role:'doctor'}),{power:'mad-science',payment:'psi',total:3});
  assert.equal(effectiveStats(f.player,f.options).speed,0);
  f=throwAt(f,'player',6);
  assert.equal(f.enemies[0].lifePoints,87);
  f=throwAt(f,'enemy',5);
  assert.throws(()=>advanceRound(f));
  assert.throws(()=>throwAt(f,'player',6));
  f=throwAt(f,'enemy',5);
  f=throwAt(f,'player',6);
  assert.equal(f.enemies[0].lifePoints,74);
  assert.throws(()=>throwAt(f,'player',6));
  f=throwAt(throwAt(f,'enemy',5),'enemy',5);
  assert.equal(throwAt(f,'player',6).enemies[0].lifePoints,61);
});

test('Mad Science explosion requires its second die and does not charge PSI twice', () => {
  const original=fight({role:'doctor'});
  const pending=playerPower(original,{power:'mad-science',payment:'psi',total:6});
  assert.equal(pending.pending.kind,'mad-science-explosion');
  assert.equal(pending.player.psi,2);
  assert.throws(()=>throwAt(pending,'player',6));
  assert.throws(()=>resolveMadScience(pending,{total:7}));
  const won=resolveMadScience(pending,{total:4});
  assert.equal(won.outcome,'win');assert.equal(won.player.psi,2);
  assert.equal(resolveMadScience(pending,{total:5}).outcome,'loss');
  assert.throws(()=>resolveMadScience(won,{total:1}));
  assert.equal(original.player.psi,3);
});

test('Monster Making adds a combat ally and Body Armour preserves exact fractional damage', () => {
  const createdAlly={name:'Test ally',lifePoints:17,speed:2,courage:2,strength:2,skill:2,psi:2};
  const original=fight({role:'doctor',options:{createdAlly}});
  const summoned=playerPower(original,{power:'monster-making',payment:'psi'});
  assert.equal(summoned.allies.length,1);
  assert.equal(summoned.allies[0].lifePoints,17);
  assert.equal(summoned.allies[0].strength,2);
  assert.equal(strike(summoned,{actor:'ally',total:6}).enemies[0].lifePoints,90);
  const armored=playerPower(original,{power:'body-armour',payment:'psi'});
  assert.equal(throwAt(armored,'enemy',6).player.lifePoints,93.5);
  assert.throws(()=>playerPower(armored,{power:'body-armour',payment:'psi'}));
  assert.equal(original.options.bodyArmour,undefined);
  const poisoned=structuredClone(armored);
  poisoned.player.status.poison=5;
  assert.equal(advanceRound(throwAt(poisoned,'enemy',6)).player.lifePoints,91);
  const dying=playerPower(fight({role:'doctor',player:person({psi:0,lifePoints:20}),options:{createdAlly}}),
    {power:'monster-making',payment:'life'});
  assert.equal(dying.outcome,'loss');assert.equal(dying.allies.length,0);
});

test('new equipment and natural healing profiles do not alter Dracula equipment or healing eligibility', () => {
  assert.equal(strikeDamage(person(),person(),6,{weapon:'fang-knife'}),18);
  assert.equal(strikeDamage(person(),person(),6,{weapon:'sword'}),16);
  assert.equal(strikeDamage(person(),person(),6,{weapon:'dagger'}),15);
  for(const role of ['monster','doctor']) {
    assert.equal(naturalHealing(person({lifePoints:50}),{role,score:6,rules:'detailed'}).player.lifePoints,44);
    assert.equal(naturalHealing(person({lifePoints:50}),{role,score:6,rules:'synopsis'}).player.lifePoints,56);
  }
  assert.throws(()=>naturalHealing(person(),{role:'dracula',score:6,rules:'detailed'}));
});

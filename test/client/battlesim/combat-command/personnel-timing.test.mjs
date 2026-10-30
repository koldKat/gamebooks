import test from 'node:test';
import assert from 'node:assert/strict';
import { startPersonnelFight,beginPersonnelRound,resolvePersonnelRoll,continuePersonnelFight,
  cancelPersonnelFight,canEscapePersonnelFight,escapePersonnelFight } from '../../../../public/js/battlesim/engines/combat-command/personnel-battle.js';
const tables=hits=>Object.fromEntries([...'ABCDEFG'].map(key=>[key,Array.from({length:11},()=>Array(11).fill(hits))]));
const unit=(key,count=100)=>({key,name:key,count,ordnance:3,melee:4,stealth:8,morale:8,chart:'D'});
const config=(rules={},count=100)=>({label:'Synthetic combat',section:'test',playerChart:'B',enemies:[unit('enemy',count)],rules});
const restored=fight=>JSON.parse(JSON.stringify(fight));
const start=(rules={},enemy=100,player=100,hits=0)=>startPersonnelFight([unit('player',player)],config(rules,enemy),tables(hits));
function roll(previous,total=2){const before=JSON.stringify(previous),next=resolvePersonnelRoll(restored(previous),total);assert.equal(JSON.stringify(previous),before);return next;}
function round(previous,total=2){const before=JSON.stringify(previous);let next=beginPersonnelRound(restored(previous));assert.equal(JSON.stringify(previous),before);for(let n=0;next.phase==='roll'&&n<100;n++)next=roll(next,total);assert.notEqual(next.phase,'roll');return next;}
const continuations=[{key:'plain',label:'Continue the existing firefight',win:'success'},
  {key:'more',label:'Five reinforcements join the existing firefight',playerChart:'C',enemyChart:'A',reinforcements:[{key:'enemy',count:5}],win:'reinforced-success'}];
const cliff=()=>start({initiative:'enemy',roundLimit:3,limitOutcome:'paused',continuations},7,15,1);

test('round reinforcements add to survivors, preserve casualties and apply exactly once across reload',()=>{
  let fight=start({reinforcements:[{key:'enemy',round:3,count:3}]},4,100,1);
  fight=round(fight);fight=round(fight);assert.equal(fight.enemies[0].count,2);
  fight=beginPersonnelRound(restored(fight));assert.equal(fight.enemies[0].count,5);
  assert.equal(fight.history.at(-1).checks[0].count,3);assert.deepEqual(fight.appliedReinforcements,[0]);
  assert.throws(()=>beginPersonnelRound(fight));fight=roll(fight);fight=roll(fight);
  fight=round(fight);assert.equal(fight.enemies[0].count,3);assert.equal(fight.startEnemies[0].initialCount,7);
});
test('eliminating the initial enemy waits for scheduled reinforcements without fabricated attacks',()=>{
  let fight=start({reinforcements:[{key:'enemy',round:3,count:3}]},1,100,1);
  fight=round(fight);assert.equal(fight.status,'fighting');assert.equal(fight.enemies[0].count,0);
  fight=round(fight);assert.equal(fight.round,2);assert.equal(fight.history.at(-1).attacks.length,0);
  fight=round(fight);assert.equal(fight.enemies[0].count,2);assert.equal(fight.player[0].count,99);
});
test('multiple timed arrivals remain independent and both chart changes happen on the right round',()=>{
  let fight=start({reinforcements:[{key:'enemy',round:6,count:3},{key:'enemy',round:13,count:4}],playerChartRounds:{3:'C'},enemyChartRounds:{3:'C'}},4);
  for(let n=1;n<=14;n++){fight=round(fight);assert.equal(fight.enemies[0].count,n<6?4:n<13?7:11);assert.equal(fight.history.at(-1).attacks[0].chart,n<3?'B':'C');assert.equal(fight.history.at(-1).attacks[1].chart,n<3?'D':'C');}
  assert.deepEqual(fight.appliedReinforcements,[0,1]);
});
test('flanking starts at its configured round, asks one die and permanently changes the enemy chart',()=>{
  let fight=start({flank:{fromRound:2,minimumRoll:5,enemyChart:'C'}});
  fight=round(fight);assert.equal(fight.history.at(-1).checks.length,0);
  fight=beginPersonnelRound(fight);assert.equal(fight.pending.kind,'flank');assert.equal(fight.pending.dice,1);
  fight=roll(fight,4);assert.equal(fight.flankArrived,undefined);fight=roll(fight);fight=roll(fight);
  fight=beginPersonnelRound(fight);fight=roll(fight,5);assert.equal(fight.flankArrived,true);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.history.at(-1).attacks[1].chart,'C');fight=beginPersonnelRound(restored(fight));assert.equal(fight.pending.kind,'attack');
});
test('first-round flanking releases the full current force; failed checks use only half firing strength',()=>{
  const rules={flank:{fromRound:1,minimumRoll:5,playerChart:'A',playerFiringDivisor:2}};
  let fight=beginPersonnelRound(start(rules,100,15));fight=roll(fight,4);fight=roll(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength,24);assert.equal(fight.history.at(-1).attacks[0].chart,'B');fight=roll(fight);
  fight=beginPersonnelRound(restored(fight));fight=roll(fight,6);fight=roll(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength,45);assert.equal(fight.history.at(-1).attacks[0].chart,'A');
  assert.equal(fight.player[0].count,15);
});
test('a failed pending flank roll rejects invalid totals without consuming or rerolling the check',()=>{
  const fight=beginPersonnelRound(start({flank:{fromRound:1,minimumRoll:5,playerChart:'A'}}));
  const before=JSON.stringify(fight);assert.throws(()=>resolvePersonnelRoll(fight,7));assert.equal(JSON.stringify(fight),before);
  assert.equal(roll(restored(fight),5).flankArrived,true);
});
test('a combat checkpoint pauses after complete enemy-first rounds and preserves all casualties',()=>{
  let fight=cliff();for(let n=1;n<=3;n++){fight=round(fight);assert.equal(fight.history.at(-1).attacks[0].side,'enemy');}
  assert.equal(fight.status,'paused');assert.equal(fight.phase,'finished');assert.equal(fight.round,3);
  assert.equal(fight.player[0].count,12);assert.equal(fight.enemies[0].count,4);assert.equal(fight.recorded,undefined);
  assert.throws(()=>beginPersonnelRound(fight));
});
test('plain continuation resumes the same battle, round, casualties and immutable history',()=>{
  let fight=cliff();for(let n=0;n<3;n++)fight=round(fight);const before=JSON.stringify(fight);
  let next=continuePersonnelFight(restored(fight),'plain');assert.equal(JSON.stringify(fight),before);
  assert.equal(next.round,3);assert.deepEqual(next.player,fight.player);assert.deepEqual(next.enemies,fight.enemies);
  assert.deepEqual(next.history.map(e=>e.attacks),fight.history.map(e=>e.attacks));assert.equal(next.status,'fighting');
  next=round(next);assert.equal(next.round,4);assert.equal(next.history.at(-1).attacks[0].side,'enemy');
});
test('reinforced continuation adds five to survivors and changes charts without restoring any losses',()=>{
  let fight=cliff();for(let n=0;n<3;n++)fight=round(fight);
  fight=continuePersonnelFight(restored(fight),'more');assert.equal(fight.enemies[0].count,9);assert.equal(fight.player[0].count,12);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[0].chart,'A');assert.equal(fight.history.at(-1).attacks[1].chart,'C');
  assert.equal(fight.enemies[0].count,8);assert.equal(fight.player[0].count,11);
  assert.throws(()=>continuePersonnelFight(fight,'more'));
});
test('unknown continuation and cancellation preserve the checkpoint and cannot invent a result',()=>{
  let fight=cliff();for(let n=0;n<3;n++)fight=round(fight);const before=JSON.stringify(fight);
  assert.throws(()=>continuePersonnelFight(fight,'missing'));assert.equal(JSON.stringify(fight),before);
  const ended=cancelPersonnelFight(fight);assert.equal(ended.status,'cancelled');assert.deepEqual(ended.player,fight.player);assert.equal(JSON.stringify(fight),before);
});
test('full-round survival objectives cannot become early victories when all opponents are eliminated',()=>{
  let fight=start({roundLimit:5,requireFullRounds:true},1,100,1);fight=round(fight);
  assert.equal(fight.status,'fighting');assert.equal(fight.enemies[0].count,0);
  for(let n=2;n<=5;n++){fight=round(restored(fight));assert.equal(fight.history.at(-1).attacks.length,0);assert.equal(fight.status,n===5?'survived':'fighting');}
  assert.equal(fight.round,5);
});
test('the distinct kill-all-or-survive objective still allows victory before the timer',()=>{
  const fight=round(start({roundLimit:5},1,100,1));assert.equal(fight.status,'win');assert.equal(fight.round,1);
});
test('player destruction wins over pending reinforcements and survival objectives',()=>{
  const fight=round(start({initiative:'enemy',roundLimit:5,requireFullRounds:true,reinforcements:[{key:'enemy',round:3,count:5}]},100,1,1));
  assert.equal(fight.status,'loss');assert.equal(fight.history.at(-1).attacks.length,1);
});
test('ordinary combat has no deferred victory or new dice checks',()=>{
  const fight=round(start({},1,100,1));assert.equal(fight.status,'win');assert.equal(fight.history.at(-1).checks.length,0);
});
test('invalid timing data fails before a combat can start',()=>{
  for(const rules of [{reinforcements:[{key:'missing',round:3,count:1}]},{reinforcements:[{key:'enemy',round:0,count:1}]},{reinforcements:[{key:'enemy',round:3,count:-1}]},{flank:{fromRound:1,minimumRoll:7}},{flank:{fromRound:1,minimumRoll:5,enemyChart:'X'}},{enemyChartRounds:{3:'X'}},{requireFullRounds:true},{continuations}])assert.throws(()=>start(rules));
});

test('free withdrawal can replace a pending first player attack after the flank check',()=>{
  let fight=beginPersonnelRound(start({escape:{test:'free',window:'before-player'},flank:{fromRound:1,minimumRoll:5,enemyChart:'C'}}));
  assert.equal(canEscapePersonnelFight(fight),false);fight=roll(fight,5);
  assert.equal(fight.pending.side,'player');assert.equal(canEscapePersonnelFight(fight),true);
  const before=JSON.stringify(fight),ended=escapePersonnelFight(fight);assert.equal(ended.status,'escaped');
  assert.equal(ended.history.at(-1).attacks.length,0);assert.equal(JSON.stringify(fight),before);
});

test('withdrawal cannot erase a player shot or replace another type of pending roll',()=>{
  let fight=beginPersonnelRound(start({escape:{test:'free',window:'before-player'}}));fight=roll(fight);
  assert.equal(fight.pending.side,'enemy');assert.equal(canEscapePersonnelFight(fight),false);assert.throws(()=>escapePersonnelFight(fight));
  const ordinary=beginPersonnelRound(start({escape:{test:'stealth'}}));assert.equal(canEscapePersonnelFight(ordinary),false);
});

test('a separately entered continuation starts from current survivors and completed rounds',()=>{
  const enemy=unit('enemy',4),player=unit('player',9),source={...config({resumeRoundMinimum:3}),enemies:[enemy]};
  let fight=startPersonnelFight([player],source,tables(0),{completedRounds:5});
  assert.equal(fight.round,5);assert.equal(fight.enemies[0].count,4);assert.equal(fight.player[0].count,9);
  fight=round(fight);assert.equal(fight.round,6);assert.equal(fight.history.length,2);
  assert.throws(()=>startPersonnelFight([player],source,tables(0),{completedRounds:2}));
});

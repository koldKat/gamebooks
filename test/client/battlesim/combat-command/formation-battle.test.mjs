import test from 'node:test';
import assert from 'node:assert/strict';
import { startFormationFight,beginFormationRound,resolveFormationRoll,
  allocateFormationCasualties,cancelFormationFight } from '../../../../public/js/battlesim/engines/combat-command/formation-battle.js';

const unit=(key,count=20,extra={})=>({key,name:key,count,ordnance:2,melee:5,morale:10,...extra});
const charts=(values={})=>Object.fromEntries([...'ABCDEFG'].map(chart=>[chart,Array.from({length:11},()=>Array(11).fill(values[chart]??0))]));
const attack=(side,actor,target,extra={})=>({side,actors:[{key:actor,stat:'melee'}],targets:[target],chart:side==='player'?'B':'E',...extra});
const config=(extra={})=>({label:'Synthetic formation combat',enemies:[unit('enemy')],
  rounds:[{from:1,attacks:[attack('player','player','enemy'),attack('enemy','enemy','player')]}],...extra});
const reload=value=>JSON.parse(JSON.stringify(value));
const immutable=(fn,input,...args)=>{const before=reload(input),result=fn(reload(input),...args);assert.deepEqual(input,before);return result;};
const start=(extra={},values={},player=[unit('player')])=>startFormationFight(player,config(extra),charts(values));
const roll=(fight,total=2)=>immutable(resolveFormationRoll,fight,total);
function round(input,total=2){let fight=immutable(beginFormationRound,input);for(let i=0;fight.phase==='roll'&&i<100;i++)fight=roll(fight,total);assert.notEqual(fight.phase,'roll');return fight;}

test('ordinary combat preserves simultaneous setup inputs but uses post-casualty reply strength',()=>{
  const player=[unit('player',10)],cfg=config({enemies:[unit('enemy',10)]}),tables=charts({B:3});
  const before=reload({player,cfg,tables});
  let fight=startFormationFight(player,cfg,tables);fight=round(fight);
  assert.deepEqual({player,cfg,tables},before);
  assert.equal(fight.history.at(-1).attacks.length,2);
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.strength),[50,35]);
  assert.equal(fight.enemies[0].count,7);assert.equal(fight.phase,'ready');
});
test('combined formations make one chart roll, then a distinct second friendly attack',()=>{
  const player=[unit('bows',3),unit('pikes',4),unit('horses',2)];
  const sequence=[attack('player','bows','enemy',{actors:[{key:'bows',stat:'ordnance',multiplier:2}]}),
    attack('player','pikes','enemy',{actors:[{key:'pikes',stat:'melee'},{key:'horses',stat:'melee',multiplier:2}]}),
    attack('enemy','enemy','pikes',{targets:['pikes','horses'],casualties:'ordered'})];
  const fight=round(start({rounds:[{from:1,attacks:sequence}]},{B:1},player));
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.strength),[12,40,90]);
  assert.equal(fight.history.at(-1).attacks.length,3);
});
test('a casualty morale check occurs before the next attack, and a rout prevents retaliation',()=>{
  let fight=start({enemies:[unit('enemy',10,{morale:3,moraleLoss:{per:1}})]},{B:2});
  fight=beginFormationRound(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'morale');assert.equal(fight.pending.morale,1);
  assert.equal(fight.enemies[0].morale,1);
  fight=roll(fight,2);
  assert.equal(fight.status,'win');assert.equal(fight.enemies[0].retired,'routed');
  assert.equal(fight.history.at(-1).attacks.length,1);
});
test('ten-casualty morale and its remainder survive reload between separately rolled attacks',()=>{
  let fight=start({enemies:[unit('enemy',71,{initialCount:80,morale:9,moraleLoss:{per:10},casualtyRemainder:9})]},{B:2});
  fight=beginFormationRound(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'morale');assert.equal(fight.pending.morale,8);
  assert.equal(fight.enemies[0].casualtyRemainder,1);
  fight=roll(fight,8);fight=roll(fight);
  fight=round(fight);
  assert.equal(fight.enemies[0].morale,8);assert.equal(fight.enemies[0].casualtyRemainder,3);
});
test('odd even-distribution losses pause after the attack roll and never reroll on allocation',()=>{
  const player=[unit('first',5,{moraleLoss:{per:1}}),unit('second',5,{moraleLoss:{per:1}})];
  let fight=start({rounds:[{from:1,attacks:[attack('enemy','enemy','first',{targets:['first','second'],casualties:'even'})]}]},{E:3},player);
  fight=beginFormationRound(fight);fight=roll(fight,7);
  assert.equal(fight.phase,'allocation');assert.equal(fight.history.at(-1).attacks.length,1);
  assert.equal(fight.history.at(-1).attacks[0].total,7);
  assert.throws(()=>resolveFormationRoll(fight,12));
  const before=reload(fight);
  assert.throws(()=>allocateFormationCasualties(fight,{first:0,second:3}));assert.deepEqual(fight,before);
  fight=immutable(allocateFormationCasualties,fight,{first:1,second:2});
  assert.equal(fight.pending.kind,'morale');assert.equal(fight.pending.key,'first');
  assert.deepEqual(fight.player.map(u=>u.count),[4,3]);
  fight=roll(fight,2);assert.equal(fight.pending.key,'second');fight=roll(fight,2);
  assert.equal(fight.phase,'ready');assert.equal(fight.history.at(-1).attacks.length,1);
  assert.equal(fight.history.at(-1).checks.length,2);
});
test('unspecified losses do not silently kill or protect a separate commander',()=>{
  const player=[unit('leader',1),unit('spears',6)];
  let fight=start({defeatKeys:['leader'],rounds:[{from:1,attacks:[attack('enemy','enemy','leader',{targets:['leader','spears']})]}]},{E:1},player);
  fight=beginFormationRound(fight);fight=roll(fight);
  assert.equal(fight.phase,'allocation');
  const saved=reload(fight),survived=allocateFormationCasualties(saved,{spears:1});
  assert.equal(survived.status,'fighting');assert.equal(survived.player[0].count,1);
  const killed=allocateFormationCasualties(saved,{leader:1});
  assert.equal(killed.status,'loss');assert.equal(saved.player[0].count,1);
});
test('a round limit pauses with surviving forces and preserves a cancelable encounter',()=>{
  let fight=start({roundLimit:3});for(let i=0;i<3;i++)fight=round(fight);
  assert.equal(fight.status,'paused');assert.equal(fight.round,3);
  assert.equal(fight.player[0].count,20);assert.equal(fight.enemies[0].count,20);
  assert.throws(()=>beginFormationRound(fight));assert.throws(()=>resolveFormationRoll(fight));
  const cancelled=immutable(cancelFormationFight,fight);assert.equal(cancelled.status,'cancelled');
  assert.deepEqual(cancelled.player,fight.player);assert.deepEqual(cancelled.history,fight.history);
});
test('two successive player-only chart changes end in a pause with no invented enemy reply',()=>{
  const a=attack('player','player','enemy');
  let fight=start({reportOnly:true,roundLimit:2,rounds:[{from:1,to:1,attacks:[{...a,chart:'C'}]},{from:2,attacks:[a]}]},{B:2,C:1});
  fight=round(fight);fight=round(fight);
  assert.equal(fight.status,'paused');assert.equal(fight.enemies[0].count,17);
  assert.deepEqual(fight.history.flatMap(e=>e.attacks).map(a=>a.chart),['C','B']);
});
test('report-only artillery can log hits without inventing a hidden enemy force',()=>{
  const a=attack('player','player','unused',{targets:[],reportHitsOnly:true,actors:[{key:'player',stat:'ordnance'}]});
  const fight=round(start({reportOnly:true,enemies:[],roundLimit:1,rounds:[{from:1,attacks:[a]}]},{B:3}));
  assert.equal(fight.status,'paused');assert.equal(fight.history.at(-1).attacks[0].hits,3);
  assert.deepEqual(fight.enemies,[]);assert.equal(fight.section,null);
});
test('a forced additional morale penalty applies before the one pending check, even on zero casualties',()=>{
  const a=attack('player','player','enemy',{moralePenalty:{key:'enemy',amount:2}});
  let fight=start({reportOnly:true,roundLimit:1,rounds:[{from:1,attacks:[a]}]});
  fight=beginFormationRound(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'morale');assert.equal(fight.pending.morale,8);
  fight=roll(fight,8);assert.equal(fight.status,'paused');assert.equal(fight.history.at(-1).checks.length,1);
});
test('a casualty and an additional penalty merge into one immediate morale check',()=>{
  let fight=start({enemies:[unit('enemy',20,{moraleLoss:{per:1}})],roundLimit:1,
    rounds:[{from:1,attacks:[attack('player','player','enemy',{moralePenalty:{key:'enemy',amount:2}})]}]},{B:2});
  fight=beginFormationRound(fight);fight=roll(fight);assert.equal(fight.pending.morale,6);
  fight=roll(fight,6);assert.equal(fight.status,'paused');assert.equal(fight.history.at(-1).checks.length,1);
});
test('an explicitly required morale check still occurs when a grenade volley causes zero casualties',()=>{
  let fight=start({roundLimit:1,rounds:[{from:1,attacks:[attack('player','player','enemy',{alwaysCheckMorale:['enemy']})]}]});
  fight=beginFormationRound(fight);fight=roll(fight);assert.equal(fight.pending.kind,'morale');
  fight=roll(fight,10);assert.equal(fight.history.at(-1).checks[0].passed,true);assert.equal(fight.status,'paused');
});
test('a positive preliminary hit wipes out the designated unit before it can attack',()=>{
  let fight=start({opening:[attack('enemy','enemy','player',{casualties:'wipe-on-hit'})]},{E:1});
  assert.equal(fight.round,0);assert.equal(fight.phase,'roll');
  fight=roll(fight);assert.equal(fight.status,'loss');assert.equal(fight.player[0].count,0);
  assert.equal(fight.history[0].attacks.length,1);
});
test('a preliminary gun shot can damage infantry while a distinct cavalry battle continues',()=>{
  const player=[unit('infantry',4),unit('cavalry',2)],enemy=[unit('guns',2),unit('enemy-cavalry',2)];
  let fight=start({enemies:enemy,defeatKeys:['cavalry'],victoryKeys:['enemy-cavalry'],
    opening:[attack('enemy','guns','infantry')],rounds:[{from:1,attacks:[attack('player','cavalry','enemy-cavalry'),attack('enemy','enemy-cavalry','cavalry')]}]}, {E:4,B:2},player);
  fight=roll(fight);assert.equal(fight.player[0].count,0);assert.equal(fight.status,'fighting');
  fight=round(fight);assert.equal(fight.status,'win');assert.equal(fight.enemies[0].count,2);
});
test('a killed first-round opponent does not end combat before its reserve arrives',()=>{
  const enemies=[unit('leader',1,{ordnance:7}),unit('reserve',7,{melee:3})];
  const melee=attack('enemy','leader','player',{actors:[{key:'leader',stat:'melee'},{key:'reserve',stat:'melee'}]});
  let fight=start({enemies,engagements:{enemy:{reserve:{fromRound:2,initial:7}}},roundLimit:2,
    rounds:[{from:1,to:1,attacks:[attack('player','player','leader',{targets:['leader','reserve'],casualties:'ordered'}),attack('enemy','leader','player',{actors:[{key:'leader',stat:'ordnance'}]})]},
      {from:2,attacks:[attack('player','player','reserve'),melee]}]},{B:3});
  fight=round(fight);assert.equal(fight.status,'fighting');assert.equal(fight.enemies[1].count,7);
  assert.equal(fight.history.at(-1).attacks.length,1);
  fight=round(fight);assert.equal(fight.enemies[1].count,4);assert.equal(fight.history.at(-1).attacks[1].strength,12);
});
test('one new bandit per round cannot retaliate after being killed before its attack',()=>{
  let fight=start({enemies:[unit('enemy',10)],engagements:{enemy:{enemy:{initial:1,increment:1}}},
    casualtyGoal:{side:'enemy',keys:['enemy'],losses:4}},{B:1,E:5});
  for(let i=0;i<4;i++)fight=round(fight);
  assert.equal(fight.status,'win');assert.equal(fight.enemies[0].count,6);assert.equal(fight.player[0].count,20);
  assert.equal(fight.history.flatMap(e=>e.attacks).length,4);
});
test('a next-round arrival is considered before a printed start-of-round escape check',()=>{
  let fight=start({enemies:[unit('enemy',8)],escapeAtStart:{side:'enemy',keys:['enemy']},
    engagements:{enemy:{enemy:{initial:1,increment:1,every:2}}}},{B:1});
  fight=round(fight);assert.equal(fight.status,'fighting');fight=beginFormationRound(fight);
  assert.equal(fight.status,'escaped');assert.equal(fight.round,1);
  let later=start({enemies:[unit('enemy',8)],escapeAtStart:{side:'enemy',keys:['enemy']},
    engagements:{enemy:{enemy:{initial:1,increment:1,every:2}}}},{B:0});
  later=round(later);later.charts.B=charts({B:1}).B;later=round(later);
  assert.equal(later.status,'fighting');later=beginFormationRound(later);
  assert.equal(later.status,'fighting');assert.equal(later.round,3);assert.equal(later.pending.kind,'attack');
});
test('a fixed attacker limit subtracts first-round losses even after later rounds and reloads',()=>{
  const enemyAttack=attack('enemy','enemy','player',{actors:[{key:'enemy',stat:'melee',countLimit:{value:4,lossRound:1,lossKeys:['enemy']}}]});
  let fight=start({roundLimit:3,rounds:[{from:1,to:1,attacks:[attack('player','player','enemy')]},
    {from:2,attacks:[enemyAttack]}]},{B:3});
  fight=round(fight);assert.equal(fight.lossByRound[1].enemy.enemy,3);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[0].strength,5);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[0].strength,5);
});
test('a limited charging group also loses attackers to the current player volley before replying',()=>{
  const shot=attack('player','player','enemy');
  const reply=limit=>attack('enemy','enemy','player',{actors:[{key:'enemy',stat:'melee',countLimit:limit}]});
  let fight=start({enemies:[unit('enemy',7)],rounds:[
    {from:1,to:1,attacks:[shot,reply(3)]},
    {from:2,to:2,attacks:[shot,reply({value:4,cumulative:true,lossKeys:['enemy']})]},
    {from:3,attacks:[shot,attack('enemy','enemy','player')]},
  ]},{B:1});
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,15);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,10);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,20);
});
test('routing either named pike unit ends the fight despite surviving support formations',()=>{
  const player=[unit('first',3,{morale:1,moraleLoss:{per:1}}),unit('second',3),unit('bows',10)];
  let fight=start({defeatKeys:['first','second'],loseIfRouted:['first','second'],
    rounds:[{from:1,attacks:[attack('enemy','enemy','first')]}]},{E:1},player);
  fight=beginFormationRound(fight);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.status,'loss');assert.equal(fight.player[2].count,10);
});
test('an explicit fallback attacker replaces a routed lead unit without restoring it',()=>{
  const player=[unit('second',5,{retired:'routed'}),unit('first',4),unit('horses',2)];
  const a=attack('player','second','enemy',{actors:[{key:'second',fallbackKeys:['first'],stat:'melee'},
    {key:'horses',stat:'melee',multiplier:2}]});
  const fight=round(start({roundLimit:1,rounds:[{from:1,attacks:[a]}]}, {},player));
  assert.equal(fight.history.at(-1).attacks[0].strength,40);assert.equal(fight.player[0].retired,'routed');
});
test('target fallback chooses one current pike block and does not spill casualties to the other',()=>{
  const player=[unit('second',2,{retired:'routed'}),unit('first',4)];
  const a=attack('enemy','enemy','second',{targets:['second','first'],targetSelection:'first'});
  const fight=round(start({roundLimit:1,rounds:[{from:1,attacks:[a]}]},{E:3},player));
  assert.deepEqual(fight.player.map(u=>u.count),[2,1]);
});
test('an incoming attack can replace a routed pike target while retaining engaged cavalry as a separate choice',()=>{
  const player=[unit('second',2,{retired:'routed'}),unit('first',4),unit('horses',3)];
  const a=attack('enemy','enemy','second',{targets:['second','horses'],targetFallbacks:{second:['first']}});
  let fight=start({roundLimit:1,rounds:[{from:1,attacks:[a]}]},{E:2},player);
  fight=beginFormationRound(fight);fight=roll(fight);
  assert.deepEqual(fight.pending.targets,['first','horses']);
  fight=allocateFormationCasualties(fight,{first:1,horses:1});
  assert.deepEqual(fight.player.map(u=>u.count),[2,3,2]);assert.equal(fight.status,'paused');
});
test('manual dice and automatic dice preserve their distinct evidence without inventing faces',()=>{
  const fight=beginFormationRound(start());
  const manual=resolveFormationRoll(fight,7);assert.deepEqual(manual.history.at(-1).attacks[0].dice,[]);
  const automatic=resolveFormationRoll(fight,undefined,()=>4);assert.deepEqual(automatic.history.at(-1).attacks[0].dice,[4,4]);
  const before=reload(fight);assert.throws(()=>resolveFormationRoll(fight,13));assert.deepEqual(fight,before);
});
test('malformed rule graphs fail before creating an encounter or changing source state',()=>{
  const player=[unit('player')],before=reload(player);
  for(const cfg of [config({rounds:[]}),config({rounds:[{from:1,to:2,attacks:[]},{from:2,attacks:[]}]}),
    config({roundLimit:0}),config({defeatKeys:['unknown']}),
    config({rounds:[{from:1,attacks:[attack('player','missing','enemy')]}]}),
    config({rounds:[{from:1,attacks:[attack('player','player','missing')]}]})]) {
    assert.throws(()=>startFormationFight(player,cfg,charts()));
  }
  assert.deepEqual(player,before);
});

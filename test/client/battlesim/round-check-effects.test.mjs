import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction, validateFight, automaticWinSource, availableConsumables} from '../../../public/js/battlesim/engines/round-checks/combat.js';

const hero = {power:4, charm:4, concentration:4};
const round = (extra = {}) => ({dice:2, stats:['power'], target:7, ...extra});
const start = (rounds, rules = {}, options = {}) => startFight(hero, {name:'Synthetic encounter', rounds, rules}, options);
const act = (fight, kind, extra = {}) => combatAction(fight, {kind, expectedRevision:fight.revision, ...extra});
const roll = (fight, dice = [1,1], extra = {}) => act(act(fight, 'roll', {playerDice:dice, ...extra}), 'resolve');

test('legacy saved fights keep their format and validate without mutation', () => {
  let fight = startFight({merc:3, mouth:3, focus:3}, {name:'Legacy opponent', rounds:[{dice:2,stats:['merc'],target:9}], rules:{goal:{kind:'last'}}});
  assert.equal(fight.rulesVersion,1); assert.equal(Object.hasOwn(fight,'consumables'),false);
  const saved = JSON.stringify(fight); validateFight(fight); assert.equal(JSON.stringify(fight),saved);
  fight = act(JSON.parse(saved),'roll',{playerDice:[3,3]});
  assert.deepEqual(fight.pending,{player:[3,3],enemy:[]});
  fight = act(fight,'resolve');
  assert.deepEqual(fight.rounds[0],{kind:'round',index:0,won:true,forced:false,total:9,target:9,playerDice:[3,3],enemyDice:[]});
  assert.equal(act(fight,'finish').status,'win');
});

test('a consumed round win removes its passive bonuses immediately and cannot repeat', () => {
  const rules = {consumables:{crystal:{changes:{power:-1,charm:-1,concentration:-1}}}};
  let fight = start([round({target:99}),round()],rules,{consumables:{crystal:true}});
  assert.deepEqual(availableConsumables(fight),['crystal']);
  fight = act(fight,'consume',{key:'crystal'});
  assert.deepEqual(fight.player,{power:3,charm:3,concentration:3});
  assert.equal(fight.consumables.crystal,0); assert.equal(fight.rounds[0].forcedBy,'crystal');
  const saved = JSON.stringify(fight); assert.throws(()=>act(fight,'consume',{key:'crystal'})); assert.equal(JSON.stringify(fight),saved);
  fight = roll(fight); assert.equal(fight.rounds[1].total,5); assert.equal(fight.rounds[1].won,false);
  assert.equal(start([round()],rules).consumables.crystal,0);
});

test('round-limited consumables work on a pending roll only in the declared round', () => {
  const rules={consumables:{spray:{rounds:[0]}}};
  let fight=start([round(),round()],rules,{consumables:{spray:true}});
  fight=act(fight,'roll',{playerDice:[1,1]}); fight=act(fight,'consume',{key:'spray'});
  assert.equal(fight.rounds[0].won,true); assert.equal(fight.pending,null);
  fight=start([round(),round()],rules,{consumables:{spray:true}});fight=roll(fight);
  assert.equal(fight.consumables.spray,1);assert.deepEqual(availableConsumables(fight),[]);
  assert.throws(()=>act(fight,'consume',{key:'spray'}));
  assert.throws(()=>start([round()],{consumables:{spray:{rounds:[1]}}}));
});

test('automatic wins require a current declared effect and never roll dice', () => {
  const rolled = roll(start([round({automaticWinParameter:'bell'})],{}, {params:{bell:1}}));
  assert.equal(rolled.rounds[0].won,true);assert.equal(rolled.rounds[0].forcedBy,'bell');
  let fight=start([round({automaticWinParameter:'bell'}),round()],{}, {params:{bell:1}});
  assert.equal(automaticWinSource(fight),'bell');
  fight=combatAction(fight,{kind:'automaticWin',expectedRevision:0},()=>{throw Error('Automatic win rolled a die');});
  assert.equal(fight.rounds[0].forcedBy,'bell');assert.deepEqual(fight.rounds[0].playerDice,[]);
  assert.equal(automaticWinSource(fight),null);assert.throws(()=>act(fight,'automaticWin'));
  fight=start([round(),round()],{automaticWinParameter:'infusion',goal:{kind:'always'}},{params:{infusion:1}});
  fight=act(act(fight,'automaticWin'),'automaticWin');assert.equal(fight.result,'win');
  assert.equal(automaticWinSource(fight),null);assert.throws(()=>act(fight,'automaticWin'));
  assert.throws(()=>act(start([round()],{automaticWinParameter:'infusion'}),'automaticWin'));
});

test('round-start expiry happens once before the next roll and survives save and restore', () => {
  const effect={when:{parameter:{name:'stake',min:1}},setParams:{stake:0},notes:['Stake breaks.']};
  let fight=start([round({params:{stake:2}}),round({params:{stake:1}}),round({startEffects:[effect]})],{}, {params:{stake:1}});
  fight=roll(fight);assert.equal(fight.rounds[0].total,8);assert.equal(fight.params.stake,1);
  fight=roll(fight);assert.equal(fight.rounds[1].total,7);assert.equal(fight.params.stake,0);
  const saved=JSON.stringify(fight);fight=JSON.parse(saved);validateFight(fight);validateFight(fight);assert.equal(JSON.stringify(fight),saved);
  assert.equal(fight.events.filter(event=>event.kind==='note').length,1);
  fight=roll(fight);assert.equal(fight.rounds[2].total,6);
});

test('conditional destinations preserve three different printed result paths', () => {
  const rules={goal:{kind:'atLeast',wins:2},destinations:[
    {when:{winsMin:2},section:100},{when:{winsMin:1,winsMax:1},section:200},{when:{winsMax:0},section:300}]};
  for(const [won,destination]of [[2,100],[1,200],[0,300]]){
    let fight=start([round(),round(),round()],rules);
    for(let index=0;index<3;index++)fight=roll(fight,index<won?[6,6]:[1,1]);
    fight=act(fight,'finish');assert.equal(fight.destination,destination);assert.equal(fight.status,won>=2?'win':'loss');
  }
});

test('postfight costs run only on their printed branch, before result confirmation', () => {
  const rules={goal:{kind:'atLeast',wins:1},loss:7,
    finishEffects:[{when:{winsMin:1},changes:{charm:-1,concentration:-2}}]};
  let defeat=roll(roll(start([round(),round()],rules)));
  assert.deepEqual(defeat.player,hero);assert.equal(act(defeat,'finish').destination,7);
  let victory=roll(roll(start([round(),round()],rules),[6,6]));
  assert.deepEqual(victory.player,{power:4,charm:3,concentration:2});
  victory=act(victory,'finish');assert.throws(()=>act(victory,'finish'));
});

test('manual round adjustments are validated and expire before the next round', () => {
  let fight=start([round(),round()]);
  assert.throws(()=>act(fight,'roll',{playerDice:[1,1],roundModifier:1.5}));
  fight=roll(fight,[1,1],{roundModifier:2});assert.equal(fight.rounds[0].total,8);assert.equal(fight.rounds[0].roundModifier,2);
  fight=roll(fight);assert.equal(fight.rounds[1].total,6);assert.equal(Object.hasOwn(fight.rounds[1],'roundModifier'),false);
});

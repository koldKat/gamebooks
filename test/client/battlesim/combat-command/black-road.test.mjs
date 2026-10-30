import test from 'node:test';
import assert from 'node:assert/strict';
import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import { loadRoster, getRoster, getCharts, getPlayerDefaults } from '../../../../public/js/battlesim/books/1472/definition.js';
import { startCombatCommandFight, combatCommandRound, resolveCombatCommandChartResult }
  from '../../../../public/js/battlesim/engines/combat-command/core.js';

const catalog=readRosterDocument(1472);
await loadRoster(async()=>({ok:true,json:async()=>catalog.enemies}));
const source=section=>structuredClone(getRoster().find(entry=>entry.section===String(section)));
const tables=getCharts(),noRoll=()=>{throw Error('Unexpected automatic dice');};
const start=(id,overrides={})=>{
  const config={...source(id),...overrides};
  return startCombatCommandFight(config.playerUnits,config,tables);
};
const round=(fight,options={})=>combatCommandRound(fight,{playerRoll:10,enemyRoll:10,...options},noRoll);
const reload=fight=>JSON.parse(JSON.stringify(fight));

test('the installed catalog contains every actual fight and preserves all three original chart blanks',()=>{
  assert.deepEqual(getRoster().map(e=>e.section),['1','11','17','19','27','30','35','45','46','47','59','61','62','64','67','82','85','86']);
  assert.equal(Object.values(tables).flat(2).length,847);
  assert.deepEqual(Object.entries(tables).flatMap(([chart,m])=>m.flatMap((row,r)=>row.flatMap((v,c)=>v===null?[[chart,r,c]]:[]))),[['A',6,5],['A',10,0],['A',10,1]]);
  assert.equal(getPlayerDefaults().customPlayer.count,9);assert.equal(getPlayerDefaults().customPlayer.ordnance,6);
  assert.ok(getRoster().every(e=>e.manualBlankChartResults&&e.editableCharts.enemy));
});

test('current forces, source charts and special approaches remain distinct',()=>{
  assert.deepEqual(['11','17','19'].map(s=>[source(s).enemies[0].count,source(s).enemies[0].ordnance,source(s).playerChart,source(s).enemyChart]),Array(3).fill([9,6,'C','D']));
  assert.equal(source(17).initiative,'enemy');assert.equal(source(19).freeOpeningAttacks,1);
  assert.deepEqual(source(35).variants.map(v=>[v.key,v.playerChart,v.enemyChart]),[['direct','D','C'],['frontal','C','D'],['flank','B','D']]);
  assert.deepEqual(['59','61','67'].map(s=>[source(s).enemies[0].count,source(s).sourceAlliedFighters,source(s).playerUnits[0].count]),[[11,5,14],[11,5,14],[10,5,14]]);
  assert.deepEqual(['62','64'].map(s=>[source(s).enemies[0].count,source(s).enemies[0].ordnance,source(s).enemyChart]),[[2,5,'E'],[1,5,'E']]);
  assert.equal(source(46).enemies[0].count,7);assert.equal(source(46).enemies[0].ordnance,9);
  assert.deepEqual(['82','86'].map(s=>[source(s).enemies[0].count,source(s).enemies[0].ordnance,source(s).sourceEnemyManpowerFormula]),[[3,9,'3+2*RAL'],[3,9,'3+2*RAL']]);
});

test('all twenty source setups finish complete immutable battles with and without their allowed guns',()=>{
  let setups=0,battles=0;
  const before=JSON.stringify(getRoster());
  for(const entry of getRoster())for(const variant of entry.variants??[{}]){
    setups++;
    for(const guns of entry.firearms?[false,true]:[false]){
      const config={...structuredClone(entry),...variant};
      // The source omits these player charts. B is an explicit test choice.
      if(config.playerChart===null)config.playerChart='B';
      let fight=startCombatCommandFight(config.playerUnits,config,tables);
      for(let i=0;fight.status==='fighting'&&i<100;i++){
        const frozen=JSON.stringify(fight);
        const next=round(reload(fight),{useFirearms:guns});
        assert.equal(JSON.stringify(fight),frozen);fight=next;
      }
      assert.ok(['win','loss'].includes(fight.status),entry.section+' '+variant.key+' '+fight.status);
      assert.equal(fight.section,config[fight.status]);
      assert.ok(!Object.hasOwn(fight,'mission')&&!Object.hasOwn(fight,'inventory')&&!Object.hasOwn(fight,'RAL'));
      battles++;
    }
  }
  assert.equal(setups,20);assert.equal(battles,33);assert.equal(JSON.stringify(getRoster()),before);
});

test('wolves flee at two survivors before return fire and gunfire alone upgrades the player chart',()=>{
  let fight=start(47);
  for(let i=0;i<3;i++)fight=round(fight,{playerRoll:8,enemyRoll:8});
  assert.equal(fight.status,'win');assert.equal(fight.enemyFled,2);
  assert.equal(fight.history.at(-1).attacks.length,1);assert.equal(fight.enemyExchanges,2);
  const armed=round(start(47),{useFirearms:true});
  assert.equal(armed.history[0].attacks[0].chart,'B');assert.equal(armed.history[0].attacks[0].strength,90);
  const normal=round(start(11),{useFirearms:true});
  assert.equal(normal.history[0].attacks[0].chart,'C');assert.equal(normal.history[0].attacks[0].strength,90);
  for(const id of ['1','30','62','64','82','85','86']){
    assert.equal(source(id).firearms,undefined);
    assert.throws(()=>round(start(id,source(id).playerChart===null?{playerChart:'B'}:{}),{useFirearms:true}),/unavailable/);
  }
});

test('the omitted player chart must be chosen and Deirdre’s ambiguous gift never changes an enemy chart automatically',()=>{
  for(const id of ['82','86']){
    assert.equal(source(id).playerChart,null);assert.equal(source(id).editableCharts.player,true);
    assert.throws(()=>start(id),/Choose a combat chart/);
    assert.equal(start(id,{playerChart:'G'}).config.playerChart,'G');
  }
  assert.equal(start(62).config.enemyChart,'E');
  assert.equal(start(62,{enemyChart:'C'}).config.enemyChart,'C');
});

test('each of the three actual blank cells pauses its saved attack and accepts an explicit result',()=>{
  const blank=start(82,{playerChart:'G',enemies:[{key:'enemy',name:'Random and guards',count:6,ordnance:9}]});
  let fight=round(blank,{playerRoll:2,enemyRoll:8});
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.history[0].attacks[1].strength,54);
  fight=resolveCombatCommandChartResult(reload(fight),0,noRoll);
  assert.equal(fight.status,'fighting');assert.equal(fight.history[0].attacks.length,2);
  assert.equal(fight.charts.A[6][5],null);
  fight=start(86,{playerChart:'B',playerUnits:[{key:'party',name:'Party',count:6,ordnance:6}]});
  fight=round(fight,{playerRoll:2,enemyRoll:12});
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.history[0].attacks[1].strength,18);
  fight=resolveCombatCommandChartResult(reload(fight),0,noRoll);
  fight=round(fight,{playerRoll:2,enemyRoll:12});
  assert.equal(fight.status,'awaiting-chart-value');assert.equal(fight.history[1].attacks[1].strength,9);
  fight=resolveCombatCommandChartResult(reload(fight),0,noRoll);
  assert.equal(fight.player[0].count,6);assert.equal(fight.round,2);assert.equal(fight.enemyExchanges,2);
});

test('ordinary custom combat needs no preset and never tracks story consequences',()=>{
  const defaults=getPlayerDefaults();
  const config={...structuredClone(defaults.customRules),section:'custom',label:'Custom opponent',
    playerChart:'B',enemyChart:'D',enemies:[{key:'custom-enemy',name:'Chosen opponent',count:1,ordnance:2}]};
  const fight=round(startCombatCommandFight([{key:'custom-party',name:'My party',count:4,ordnance:6}],config,tables));
  assert.equal(fight.status,'win');assert.equal(fight.section,null);
  assert.equal(fight.config.enemies[0].name,'Chosen opponent');
});

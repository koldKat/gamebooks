import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {getRoster,loadRoster} from '../../../../public/js/battlesim/books/1436/definition.js';
import {getRoster as getWeathertopRoster,loadRoster as loadWeathertopRoster} from '../../../../public/js/battlesim/books/1437/definition.js';
const catalog=JSON.parse(readFileSync('data/simulator-rosters/1436.json','utf8'));

test('database catalog preserves signed TQ stats and expands only the printed roster reference',async()=>{
  assert.equal(catalog.enemies.length,39);assert.equal(new Set(catalog.enemies.map(e=>e.key)).size,39);
  await loadRoster(async url=>{assert.equal(url,'/api/books/1436/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
  const roster=getRoster(),bySection=n=>roster.find(e=>e.section===n);
  assert.equal(roster.length,28);assert.deepEqual(bySection('245').enemies,bySection('197').enemies);
  assert.equal(bySection('245').rules.groupMode,'sequential');assert.equal(bySection('197').rules.groupMode,'random-variant');
  for(const [n,count]of [['384',6],['387',12]]){assert.equal(bySection(n).enemies.length,1);assert.equal(bySection(n).enemies[0].combinedCount,count);}
  const bear=bySection('104').enemies[0];assert.deepEqual([bear.ob,bear.db,bear.endurance],[3,-1,17]);
  const nazgul=bySection('295').enemies[0];assert.deepEqual([nazgul.ob,nazgul.db,nazgul.endurance],[15,12,68]);
  assert.equal(bySection('328').rules.escapeBlockedUntilEnemiesDefeated,1);assert.equal(bySection('113').rules.surprised,true);assert.equal(bySection('117').rules.firstPlayerAttackObBonus,2);assert.equal(bySection('272').rules.escapeBonus,-2);
});
test('new and previous simulator register outcome XP once and ignore non-battle endings',()=>{
  const source=readFileSync('server/db/xp.js','utf8');
  const registry=source.slice(source.indexOf('const SIM_HISTORY_KEYS ='),source.indexOf('function processStateXp('));
  const keys=runInNewContext(registry+'\nSIM_HISTORY_KEYS;',{});
  for(const id of [1362,1436,1437,1438,1439,1440,1441])assert.equal(keys.filter(key=>key==='sim'+id).length,1);
  const awards=[],refs=new Set();
  const context={db:{prepare:sql=>({get:()=>sql.includes('FROM books')?{}:{n:100}})},awardXp(_user,event,ref){if(refs.has(event+':'+ref))return false;refs.add(event+':'+ref);awards.push({event,ref});return true;},awardCoins(){},getXpAmount:()=>50,isCleanRun:()=>false,_discoveredSet:()=>new Set(),_visitedSet:()=>new Set(),_mappedSet:()=>new Set(),_checkGroupWonAll(){},SIM_HISTORY_KEYS:keys,_xpRefSeq:0};
  runInNewContext(source.slice(source.indexOf('function processStateXp('),source.indexOf('function migrateXpForUser(')),context);
  for(const id of [1362,1436,1437,1438,1439,1440,1441]){
    const state=history=>({playthroughs:[{startedAt:1,path:[],['sim'+id]:{history}}]});
    const history=['win','loss','escaped','avoided','calmed','charmed','cancelled'].map((outcome,i)=>({outcome,ts:100+i}));
    context.processStateXp(1,id,state([]),state(history),0);context.processStateXp(1,id,state(history),state(history),0);
  }
  assert.deepEqual(awards.filter(row=>row.event.startsWith('battlesim_')),[{event:'battlesim_win',ref:'sim1362:100'},{event:'battlesim_loss',ref:'sim1362:101'},{event:'battlesim_win',ref:'sim1436:100'},{event:'battlesim_loss',ref:'sim1436:101'},{event:'battlesim_win',ref:'sim1437:100'},{event:'battlesim_loss',ref:'sim1437:101'},{event:'battlesim_win',ref:'sim1438:100'},{event:'battlesim_loss',ref:'sim1438:101'},{event:'battlesim_win',ref:'sim1439:100'},{event:'battlesim_loss',ref:'sim1439:101'},{event:'battlesim_win',ref:'sim1440:100'},{event:'battlesim_loss',ref:'sim1440:101'},{event:'battlesim_win',ref:'sim1441:100'},{event:'battlesim_loss',ref:'sim1441:101'}]);
});

test('Weathertop database roster preserves groups, source modifiers and individual entry variants',async()=>{
  const catalog=JSON.parse(readFileSync('data/simulator-rosters/1437.json','utf8'));
  assert.equal(catalog.enemies.length,42);assert.equal(new Set(catalog.enemies.map(e=>e.key)).size,42);
  await loadWeathertopRoster(async url=>{assert.equal(url,'/api/books/1437/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
  const roster=getWeathertopRoster(),entry=id=>roster.find(e=>e.section===id);assert.equal(roster.length,37);
  assert.equal(entry('436').enemies.length,2);assert.equal(entry('393').enemies.length,1);assert.equal(entry('393').enemies[0].endurance,26);
  assert.equal(entry('199').enemies.length,6);assert.equal(entry('522').enemies.length,8);assert.equal(entry('522').rules.cannotEscape,true);
  assert.equal(entry('462').enemies.length,1);assert.equal(entry('462').enemies[0].combinedCount,4);assert.equal(entry('462').enemies[0].ob,-3);
  assert.equal(entry('382').rules.heroAttackLimit,3);assert.equal(entry('407').rules.cannotEscape,true);
  assert.equal(entry('546').rules.heroObBonus,-1);assert.equal(entry('546').rules.heroDbBonus,-1);assert.equal(entry('302').rules.runningBonus,-2);
  assert.equal(entry('388').rules.meleeObBonus,1);assert.equal(entry('330').rules.enemyUnaware,true);
  for(const e of roster)assert.equal(e.rules.calmUnambiguous,true);
  entry('393').enemies[0].damage=12;assert.equal(entry('436').enemies[0].damage,undefined);
});

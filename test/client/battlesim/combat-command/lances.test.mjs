import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument,getRosterRows} from '../../../helpers/roster-db.cjs';
import {loadRoster,getRoster,getCharts,getUnitProfiles} from '../../../../public/js/battlesim/books/1473/definition.js';
import {prepareFormationEncounter,customFormationEncounter} from '../../../../public/js/battlesim/engines/combat-command/formation-catalog.js';
import {startFormationFight,beginFormationRound,resolveFormationRoll,allocateFormationCasualties} from '../../../../public/js/battlesim/engines/combat-command/formation-battle.js';
import {formationEngagedCount} from '../../../../public/js/battlesim/engines/combat-command/formation-rules.js';

const document=readRosterDocument(1473),entries=document.enemies.map(row=>row.stats.entry),charts=entries[0].charts;
const entry=id=>structuredClone(entries.find(row=>row.section===String(id)));
const reload=value=>JSON.parse(JSON.stringify(value));
// Explicit test-only user choices. These do not purport to be printed stats.
function setup(id){
  const value=entry(id),player=reload(value.playerUnits),enemies=reload(value.enemies),chartChoices={};
  if(String(id)==='11')enemies[0].count=5;
  if(String(id)==='75'){
    enemies[1].count=2;enemies[1].melee=5;
    chartChoices['friendly-cavalry']='C';chartChoices['enemy-cavalry']='E';
  }
  if(String(id)==='80')enemies[0].morale=8;
  return prepareFormationEncounter(value,{player,enemies,chartChoices});
}
const start=(id,tables=charts)=>{const {player,config}=setup(id);return startFormationFight(player,config,tables);};
const neutral=(values={})=>Object.fromEntries([...'ABCDEFG'].map(key=>[key,Array.from({length:11},()=>Array(11).fill(values[key]??0))]));
function allocate(fight,reverse=false){
  const pending=fight.pending,units=pending.side==='player'?fight.player:fight.enemies;
  const caps=Object.fromEntries(pending.targets.map(key=>[key,formationEngagedCount(units.find(unit=>unit.key===key),Math.max(1,fight.round),fight.config.engagements?.[pending.side]?.[key])]));
  const result=Object.fromEntries(pending.targets.map(key=>[key,0]));
  let remaining=Math.min(pending.hits,Object.values(caps).reduce((a,b)=>a+b,0));
  const keys=reverse?[...pending.targets].reverse():pending.targets;
  while(remaining){let changed=false;for(const key of keys)if(remaining&&result[key]<caps[key]){result[key]++;remaining--;changed=true;}assert.ok(changed);}
  return allocateFormationCasualties(reload(fight),result);
}
function untilBoundary(input,total=12,reverse=false){let fight=reload(input);for(let i=0;i<200;i++){
  if(fight.phase==='allocation')fight=allocate(fight,reverse);
  else if(fight.phase==='roll')fight=resolveFormationRoll(reload(fight),total);
  else return fight;
}throw Error('Unbounded pending tasks');}
function round(fight,total=12){return untilBoundary(beginFormationRound(reload(fight)),total);}

test('the complete catalog and original-print chart/profile values load solely from the database',async()=>{
  await loadRoster(async()=>({ok:true,json:async()=>getRosterRows(1473)}));
  assert.equal(getRoster().length,27);assert.equal(getUnitProfiles().length,29);
  assert.equal(Object.values(getCharts()).flat(2).length,847);
  assert.deepEqual(charts.A[0],[0,1,1,2,2,3,3,4,5,6,6]);
  assert.equal(getUnitProfiles().find(p=>p.nativeImageIndex===15).morale,9);
  assert.equal(getUnitProfiles().find(p=>p.nativeImageIndex===34).printedHeadcount,3000);
  assert.equal(getUnitProfiles().find(p=>p.nativeImageIndex===32).melee,5);
  for(const value of getRoster())assert.ok(value.combatOnly&&!value.automaticStoryNavigation);
});
test('missing source values and charts require explicit entries without modifying the preset',()=>{
  for(const id of [11,75,80]){
    const source=entry(id),before=reload(source);
    assert.throws(()=>prepareFormationEncounter(source));assert.deepEqual(source,before);
    assert.doesNotThrow(()=>start(id));
  }
  assert.equal(entry(75).enemies[1].count,null);assert.equal(entry(75).enemies[1].melee,null);
  assert.equal(entry(80).enemies[0].morale,null);
});
test('all 27 presets finish or pause with actual source charts and JSON reload before every action',()=>{
  const before=JSON.stringify(entries);let fights=0;
  for(const source of entries)for(const reverse of [false,true]){
    let fight=start(source.section),steps=0;
    while(fight.status==='fighting'&&steps++<2000){
      fight=untilBoundary(fight,12,reverse);
      if(fight.status==='fighting'&&fight.phase==='ready')fight=beginFormationRound(reload(fight));
    }
    assert.ok(['win','loss','paused','escaped'].includes(fight.status),source.section+' did not finish');
    assert.ok(fight.player.every(unit=>unit.count>=0)&&fight.enemies.every(unit=>unit.count>=0));
    if(source.reportOnly)assert.notEqual(fight.status,'win');
    fights++;
  }
  assert.equal(fights,54);assert.equal(JSON.stringify(entries),before);
});
test('the pursuit starts with Ordnance10/A then changes to Melee6/C',()=>{
  let fight=start(6,neutral());fight=round(fight);assert.equal(fight.history.at(-1).attacks[0].strength,10);
  assert.equal(fight.history.at(-1).attacks[0].chart,'A');fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength,6);assert.equal(fight.history.at(-1).attacks[0].chart,'C');
});
test('the bandit pursuit preserves the distinct first, second and later attacking groups',()=>{
  let fight=start(13,neutral({A:1}));
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,9);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,6);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks[1].strength,12);
});
test('the caravan rescue kills only engaged bandits and stops after four casualties',()=>{
  let fight=start(23,neutral({C:5,D:5}));
  for(let i=0;i<4;i++)fight=round(fight);
  assert.equal(fight.status,'win');assert.equal(fight.enemies[0].count,6);assert.equal(fight.player[0].count,1);
  assert.equal(fight.history.flatMap(e=>e.attacks).length,4);
});
test('the surprise raid uses friendly A, enemy F then E then D and no first-round response',()=>{
  let fight=start(27,neutral());
  for(let i=1;i<=4;i++){
    fight=round(fight);const attacks=fight.history.at(-1).attacks;
    assert.equal(attacks[0].chart,'A');assert.equal(attacks.length,i===1?1:2);
    if(i>1)assert.equal(attacks[1].chart,({2:'F',3:'E',4:'D'})[i]);
    if(i===2)assert.equal(attacks[1].strength,12);
  }
});
test('Critos can die before the seven reserves arrive without granting an early win',()=>{
  let fight=start(32,neutral({D:4}));fight=round(fight);
  assert.equal(fight.status,'fighting');assert.equal(fight.enemies[0].count,0);assert.equal(fight.enemies[1].count,7);
  assert.equal(fight.history.at(-1).attacks.length,1);
  fight=round(fight);assert.equal(fight.enemies[1].count,3);
});
test('the horse bowmen take an opening fire attack and their charge bonus is not doubled twice',()=>{
  let fight=start(39,neutral());assert.equal(fight.round,0);assert.equal(fight.pending.strength,30);
  assert.equal(fight.pending.attack.chart,'E');fight=untilBoundary(fight);fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength,20);assert.equal(fight.history.at(-1).attacks[0].chart,'B');
});
test('artillery checkpoints preserve their exact strengths/charts and never award a full-battle win',()=>{
  for(const [id,strength,chart]of [[21,101,'A'],[48,100,'B'],[70,50,'B'],[76,150,'D']]){
    let fight=start(id,neutral());fight=round(fight);
    assert.equal(fight.status,'paused',String(id));assert.equal(fight.history.at(-1).attacks[0].strength,strength);
    assert.equal(fight.history.at(-1).attacks[0].chart,chart);
    assert.equal(fight.history.at(-1).attacks.length,1);
  }
});
test('catapults use C then B while existing current morale and casualty carry stay intact',()=>{
  const value=entry(17);value.enemies[0].count=71;value.enemies[0].morale=9;value.enemies[0].casualtyRemainder=9;
  const prepared=prepareFormationEncounter(value);let fight=startFormationFight(prepared.player,prepared.config,neutral({C:1}));
  fight=beginFormationRound(fight);fight=resolveFormationRoll(fight,2);
  assert.equal(fight.pending.kind,'morale');assert.equal(fight.pending.morale,8);
  fight=untilBoundary(fight,2);fight=round(fight,2);
  assert.equal(fight.status,'paused');assert.deepEqual(fight.history.flatMap(e=>e.attacks).map(a=>a.chart),['C','B']);
});
test('the cavalry attack receives one combined archery volley and one combined melee before replying',()=>{
  const fight=round(start(52,neutral()));const attacks=fight.history.at(-1).attacks;
  assert.deepEqual(attacks.map(a=>a.strength),[60,240,400]);
  assert.deepEqual(attacks.map(a=>a.chart),['B','B','F']);
});
test('the pike battle has combined archer fire once, then two ordered melee rounds and a pause',()=>{
  let fight=start(57,neutral());fight=round(fight);assert.equal(fight.history.at(-1).attacks.length,3);
  assert.equal(fight.history.at(-1).attacks[0].strength,90);
  fight=round(fight);assert.equal(fight.history.at(-1).attacks.length,2);
  assert.equal(fight.status,'paused');assert.equal(fight.section,'59');
});
test('flanking cavalry doubles its own strength and uses the encounter enemy Melee2 override',()=>{
  const fight=round(start(66,neutral()));
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.strength),[20,2]);
  assert.equal(entry(66).enemies[0].melee,2);
  assert.equal(entries[0].sourceUnitProfiles.find(p=>p.nativeImageIndex===32).melee,5);
});
test('the villa attack uses its fixed opening shot and local Melee7 override',()=>{
  let fight=start(77,neutral());assert.equal(fight.pending.strength,10);fight=untilBoundary(fight);fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength,28);
  assert.equal(entries[0].sourceUnitProfiles.find(p=>p.nativeImageIndex===36).melee,8);
});
test('a failed grenadier attack and a morale tie do not invent missing story destinations',()=>{
  let killed=start(80,neutral({D:1}));killed=untilBoundary(killed);
  assert.equal(killed.status,'loss');assert.equal(killed.section,null);
  let tie=start(80,neutral());tie=untilBoundary(tie);tie=beginFormationRound(tie);
  tie=resolveFormationRoll(tie,2);assert.equal(tie.pending.kind,'morale');
  tie=resolveFormationRoll(tie,8);assert.equal(tie.status,'paused');assert.equal(tie.section,null);
  assert.equal(tie.history.at(-1).checks[0].total,tie.history.at(-1).checks[0].morale);
});
test('setup can edit current numbers but cannot remove the printed morale rules or formation groups',()=>{
  const value=entry(50),player=reload(value.playerUnits),enemies=reload(value.enemies);
  player[0].count=7;delete player[0].moraleLoss;enemies[0].moraleLoss={per:100};
  const prepared=prepareFormationEncounter(value,{player,enemies});
  assert.equal(prepared.config.charts,undefined);
  assert.equal(prepared.config.sourceUnitProfiles,undefined);
  assert.equal(prepared.config.playerDefaults,undefined);
  assert.equal(prepared.player[0].count,7);assert.equal(prepared.player[0].moraleLoss.per,1);
  assert.equal(prepared.config.enemies[0].moraleLoss.per,10);
  assert.throws(()=>prepareFormationEncounter(value,{player:[],enemies}));
});
test('a custom fight works without a preset, with editable groups and explicit attack modes',()=>{
  const defaults=entries[0].playerDefaults;
  const player=[{...defaults.customPlayer,key:'p1'},{...defaults.customPlayer,key:'p2'}];
  const enemies=[{...defaults.customEnemy,key:'e1'},{...defaults.customEnemy,key:'e2'}];
  const prepared=customFormationEncounter(player,enemies,{playerChart:'C',enemyChart:'D',playerStat:'ordnance',enemyStat:'melee',initiative:'enemy'});
  const before=reload(prepared);let fight=startFormationFight(prepared.player,prepared.config,neutral());fight=round(fight);
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.strength),[6,18]);assert.deepEqual(prepared,before);
  assert.throws(()=>customFormationEncounter(player,enemies,{playerChart:'',enemyChart:'D'}));
});

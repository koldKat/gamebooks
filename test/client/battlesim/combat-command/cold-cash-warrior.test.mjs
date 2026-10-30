import test from 'node:test';
import assert from 'node:assert/strict';
import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import { loadRoster,getRoster,getCharts,getPlayerDefaults } from '../../../../public/js/battlesim/books/1475/definition.js';
import { startPersonnelFight,beginPersonnelRound,resolvePersonnelRoll,continuePersonnelFight } from '../../../../public/js/battlesim/engines/combat-command/personnel-battle.js';
const catalog=readRosterDocument(1475);
await loadRoster(async()=>({ok:true,json:async()=>catalog.enemies}));
const roster=getRoster(),charts=getCharts(),defaults=getPlayerDefaults();
const entry=section=>structuredClone(roster.find(item=>item.section===String(section)));
const unit=(changes={})=>({...structuredClone(defaults.customPlayer),count:100,chart:'C',...changes});
const reload=fight=>JSON.parse(JSON.stringify(fight));
function round(fight,total=2){let next=beginPersonnelRound(reload(fight));for(let i=0;next.phase==='roll'&&i<100;i++)next=resolvePersonnelRoll(reload(next),next.pending.dice===1?Math.min(total,6):total);return next;}

test('the installed catalog owns all34 encounters, two continuation entries, five profiles and847 chart cells',()=>{
  assert.equal(roster.length,36);assert.equal(new Set(roster.map(e=>e.section)).size,36);
  assert.equal(roster.filter(e=>e.combatContinuationOf==='48').length,2);
  assert.equal(defaults.friendlyProfiles.length,5);assert.equal(Object.values(charts).flat(2).length,847);
  assert.equal(entry(48).rules.continuations.length,2);
  assert.equal(entry(7).enemies[0].melee,5);assert.equal(entry(7).rules.meleeOnly,true);assert.equal(entry(7).playerUnits[0].count,4);
  assert.equal(catalog.enemies.find(e=>e.key==='7').attack,null);
});
test('source reinforcements, charts and printed destinations retain their distinct values',()=>{
  assert.deepEqual(entry(40).rules.reinforcements,[{key:'enemy',round:3,count:3}]);assert.equal(entry(40).enemies[0].count,4);
  assert.deepEqual(entry(45).rules.reinforcements,[{key:'enemy',round:3,count:7}]);
  assert.deepEqual(entry(88).rules.reinforcements.map(e=>[e.round,e.count]),[[6,3],[13,4]]);
  assert.deepEqual(entry(126).rules.reinforcements.map(e=>[e.round,e.count]),[[6,5],[13,6]]);
  assert.deepEqual(entry(99).rules.reinforcements,[{key:'enemy',round:3,count:4}]);
  assert.equal(entry(99).rules.playerChartRounds[3],'C');assert.equal(entry(99).rules.enemyChartRounds[3],'C');
  assert.equal(entry(99).win,'96');assert.equal(entry(99).loss,'16');assert.equal(entry(65).win,'80');
  assert.equal(entry(89).enemies[0].chart,'C');assert.equal(entry(80).enemies[0].chart,'B');
  assert.equal(entry(28).rules.chooseInitiative,true);
});
test('book-specific flanking and complete-round objectives stay separate',()=>{
  assert.equal(entry(76).rules.flank.fromRound,2);assert.equal(entry(76).rules.flank.enemyChart,'C');
  assert.equal(entry(79).rules.flank.fromRound,1);assert.equal(entry(79).rules.flank.playerChart,'A');assert.equal(entry(79).rules.flank.playerFiringDivisor,2);
  for(const s of[113,128])assert.equal(entry(s).rules.requireFullRounds,true);
  assert.equal(entry(115).rules.requireFullRounds,false);assert.equal(entry(125).rules.roundLimit,3);assert.equal(entry(125).rules.requireFullRounds,true);
  assert.equal(entry(111).enemies[0].count,13);
});
test('the source cliff checkpoint resumes with survivors, round and enemy-first initiative preserved',()=>{
  let fight=startPersonnelFight([unit({count:24,ordnance:3})],entry(48),charts);
  for(let n=0;n<3;n++)fight=round(fight,2);
  assert.equal(fight.status,'paused');const count=fight.enemies[0].count,player=fight.player[0].count;
  fight=continuePersonnelFight(reload(fight),'71');assert.equal(fight.enemies[0].count,count+5);assert.equal(fight.player[0].count,player);
  assert.equal(fight.round,3);fight=beginPersonnelRound(fight);assert.equal(fight.round,4);assert.equal(fight.pending.side,'enemy');
});
test('standalone continuations require actual surviving enemies instead of inventing restored forces',()=>{
  for(const s of[52,71]){
    const config=entry(s);assert.equal(config.enemies[0].count,0);assert.equal(config.manualCurrentEnemyCountRequired,true);
    assert.throws(()=>startPersonnelFight([unit()],config,charts));config.enemies[0].count=s===52?3:8;
    const fight=startPersonnelFight([unit()],config,charts,{completedRounds:5});assert.equal(fight.round,5);assert.equal(fight.enemies[0].count,s===52?3:8);
  }
});
test('every source preset resolves a complete immutable battle without changing a reader path',()=>{
  const path=[1,4,11],beforePath=JSON.stringify(path);
  for(const original of roster){
    const config=structuredClone(original),before=JSON.stringify(original);
    if(config.manualCurrentEnemyCountRequired)config.enemies[0].count=8;
    let fight=startPersonnelFight(config.playerUnits??[unit()],config,charts);
    for(let i=0;fight.status==='fighting'&&i<1000;i++)fight=round(fight,12);
    assert.notEqual(fight.status,'fighting',config.section);assert.ok(['win','survived','paused','loss'].includes(fight.status));
    assert.equal(JSON.stringify(original),before);assert.equal(JSON.stringify(path),beforePath);
    assert.ok(fight.player.every(unit=>unit.count>=0));assert.ok(fight.enemies.every(unit=>unit.count>=0));
  }
});
test('a custom encounter works without selecting a source preset or restoring original numbers',()=>{
  const config={label:'Custom',section:'custom',enemies:[{...defaults.customEnemy,count:5}],rules:{initiative:'player'}};
  let fight=startPersonnelFight([unit({count:8,ordnance:7})],config,charts);for(let i=0;fight.status==='fighting'&&i<50;i++)fight=round(fight,12);
  assert.equal(fight.status,'win');assert.equal(fight.startPlayer[0].count,8);
});

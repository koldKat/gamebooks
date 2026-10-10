const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/battlesim/engines/tetiva.js'), 'utf8');
const engine = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function state(section = 0) {
  return {player:{attack:0,defense:20,damage:0,speed:8},enemy:{attack:8,defense:20,hitsNeeded:2,hitsLanded:0,strikesPerRound:1},kobaldiMode:false,combatEffects:null,section};
}
function dice(values) {
  return () => { assert.ok(values.length, 'unexpected extra roll'); return values.shift(); };
}
test('encounter defaults match printed attack order and defence', async () => {
  const {tetivaEncounter} = await engine;
  assert.equal(tetivaEncounter(119).enemyFirst,true);
  assert.equal(tetivaEncounter(279).enemyFirst,true);
  assert.equal(tetivaEncounter(211).initiativeBySpeed,true);
  assert.equal(tetivaEncounter(109).variableDefense,true);
  assert.equal(tetivaEncounter(119).variableDefense,true);
  assert.equal(tetivaEncounter(7).enemyFirst,false);
});
test('enemy first can kill before the player lands a winning hit', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state(279);d.combatEffects=tetivaEncounter(279);d.player.attack=100;d.player.defense=0;d.player.damage=23;d.enemy.hitsNeeded=1;
  const events=tetivaRound(d,dice([2]));
  assert.equal(d.player.damage,24);assert.equal(d.enemy.hitsLanded,0);assert.equal(events.length,1);
});
test('player victory prevents a later enemy strike', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state(7);d.combatEffects=tetivaEncounter(7);d.player.attack=100;d.enemy.hitsNeeded=1;
  tetivaRound(d,dice([2]));assert.equal(d.enemy.hitsLanded,1);assert.equal(d.player.damage,0);
});
test('Kobaldi equal rolls reroll the second value rather than skipping attacks', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state(279);d.combatEffects=tetivaEncounter(279);d.kobaldiMode=true;
  const events=tetivaRound(d,dice([6,6,8,2,2,2]));
  assert.equal(events.filter(e=>e.side==='enemy').length,2);assert.equal(events.at(-1).side,'player');
});
test('Duargar defence rolls separately for each enemy hit', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state(109);d.combatEffects=tetivaEncounter(109);d.enemy.attack=10;d.player.speed=3;d.enemy.strikesPerRound=2;
  tetivaRound(d,dice([2,8,4,8,10]));assert.equal(d.player.damage,11+5);
});
test('speed initiative is rolled once and equal speed gives the player first strike', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state(211);d.combatEffects=tetivaEncounter(211);
  assert.equal(tetivaRound(d,dice([8,2,2]))[0].side,'player');
  assert.equal(tetivaRound(d,dice([2,2]))[0].side,'player');
});
test('ties miss and a completed fight does not roll again', async () => {
  const {tetivaEncounter,tetivaRound} = await engine;
  const d=state();d.combatEffects=tetivaEncounter(0);d.enemy.defense=2;
  tetivaRound(d,dice([2,2]));assert.equal(d.enemy.hitsLanded,0);
  d.player.damage=24;assert.deepEqual(tetivaRound(d,dice([])),[]);
});
test('opening saved fights preserves rules; resetting opts into printed encounter rules', async () => {
  const vm=require('node:vm');
  const {tetivaEncounter,tetivaRound}=await engine;
  const old=state(119);delete old.combatEffects;delete old.section;
  Object.assign(old,{enemy:{...old.enemy,name:'Дуъргар (звяр) §119'},roundsThisBattle:3,log:[],history:[]});
  const pt={sim753:old};
  const controller=fs.readFileSync(require('node:path').join(__dirname,'../public/js/battlesim/battlesim753.js'),'utf8').replace(/^import .*;$/gm,'').replaceAll('export function','function');
  const context=vm.createContext({currentPlaythrough:()=>pt,saveState:()=>{},t:key=>key,escapeHtml:x=>x,tetivaEncounter,tetivaRound,console});
  vm.runInContext(controller+'\n_renderAll=()=>{}; globalThis.subject={data:_data,reset:_resetBattle,round:_runRound};',context);
  const snapshot=JSON.stringify(old);
  context.subject.data();assert.equal(JSON.stringify(old),snapshot);
  context.subject.reset();assert.equal(old.printedRules,1);assert.equal(old.encounterSection,119);assert.equal(old.combatEffects.enemyFirst,true);assert.equal(old.combatEffects.variableDefense,true);
});

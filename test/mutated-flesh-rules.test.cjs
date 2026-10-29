const { readRosterDocument } = require('./helpers/roster-db.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { readFileSync: readSimulatorSource } = require('./client/battlesim/simulator-source.mjs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../public/js/battlesim/engines/mutated-flesh.js'),'utf8');
const FLESH_RULES = readRosterDocument(781).enemies.find(row=>row.stats.entry.support).stats.entry.support.rules;
const engine = import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')).then(module=>({
  ...module,
  mutatedFleshWon:d=>module.mutatedFleshWon(d,FLESH_RULES.victoryFloors),
  mutatedFleshRound:(d,weapon,defend,roll)=>module.mutatedFleshRound(d,weapon,defend,roll,FLESH_RULES.victoryFloors),
}));
const weapons = {
  crowbar:{id:'crowbar',name:'Crowbar',bonus:2,stat:'physique',ammoMax:null},
  axe:{id:'axe',name:'Axe',bonus:4,stat:'physique',ammoMax:null},
  chainsaw:{id:'chainsaw',name:'Chainsaw',bonus:16,stat:'physique',ammoMax:null},
  pistol:{id:'pistol',name:'Pistol',bonus:4,stat:'shooting',ammoMax:2},
  shotgun:{id:'shotgun',name:'Shotgun',bonus:14,stat:'shooting',ammoMax:5},
};
function state() { return {rulesVersion:1,player:{life:40,physique:2,shooting:3},enemy:{life:38,dmg:19},enemyId:'doberman',ammo:{pistol:2,shotgun:5}}; }
const noRoll = () => { throw Error('unexpected die roll'); };
test('defensive tactic attacks without a die and reduces the counterattack',async()=>{
  const {mutatedFleshRound}=await engine;const d=state();
  const events=mutatedFleshRound(d,weapons.crowbar,true,noRoll);
  assert.equal(d.enemy.life,34);assert.equal(d.player.life,23);assert.equal(events.length,2);
});
test('defensive firearms consume one round; empty weapons cannot attack',async()=>{
  const {mutatedFleshRound}=await engine;const d=state();d.ammo.pistol=1;
  mutatedFleshRound(d,weapons.pistol,true,noRoll);assert.equal(d.ammo.pistol,0);assert.equal(d.enemy.life,31);
  const before=JSON.stringify(d);assert.deepEqual(mutatedFleshRound(d,weapons.pistol,true,noRoll),[]);assert.equal(JSON.stringify(d),before);
});
test('lethal player strike prevents enemy counterattack',async()=>{
  const {mutatedFleshRound}=await engine;const d=state();d.enemy.life=5;
  assert.equal(mutatedFleshRound(d,weapons.crowbar,false,()=>6).length,1);assert.equal(d.player.life,40);
});
test('Lenova stops at eight LIFE for new fights, not legacy fights',async()=>{
  const {mutatedFleshRound,mutatedFleshWon}=await engine;const d=state();d.enemyId='lenova';d.enemy.life=14;
  mutatedFleshRound(d,weapons.crowbar,false,()=>2);assert.equal(d.enemy.life,8);assert.equal(d.player.life,40);assert.equal(mutatedFleshWon(d),true);
  delete d.rulesVersion;assert.equal(mutatedFleshWon(d),false);
});
test('metadata controls stopping thresholds and eligible opponents without adding saved fields',async()=>{
  const raw=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const original=state();original.enemy.life=14;original.extension={keep:true};
  const d=JSON.parse(JSON.stringify(original)),keys=Object.keys(d).sort();
  const events=raw.mutatedFleshRound(d,weapons.crowbar,false,()=>2,{doberman:8});
  assert.equal(d.enemy.life,8);assert.equal(d.player.life,40);assert.equal(events.length,1);
  assert.equal(raw.mutatedFleshWon(d,{doberman:8}),true);
  assert.equal(raw.mutatedFleshWon(d,{lenova:8}),false);
  assert.deepEqual(d.extension,{keep:true});assert.equal(original.enemy.life,14);
  assert.deepEqual(Object.keys(d).filter(key=>!['started','weaponId'].includes(key)).sort(),keys);
  delete d.rulesVersion;assert.equal(raw.mutatedFleshWon(d,{doberman:8}),false);
});
test('fixed averages and section 99 weapon variants use the printed bonuses',async()=>{
  const {mutatedFleshRound}=await engine;
  for (const [weapon,expected] of [['axe',11],['chainsaw',20]]) {
    const d=state();d.averageDamage=true;d.section99Weapons=true;
    mutatedFleshRound(d,weapons[weapon],false,noRoll);assert.equal(d.enemy.life,38-expected);
  }
  const d=state();d.averageDamage=true;d.section20Pistol=true;
  mutatedFleshRound(d,weapons.pistol,false,noRoll);assert.equal(d.enemy.life,27);
});
test('riot armour stacks with physique only for defensive tactics',async()=>{
  const {mutatedFleshRound}=await engine;
  for(const [defend,expected] of [[false,23],[true,25]]) {
    const d=state();d.riotArmour=true;mutatedFleshRound(d,weapons.crowbar,defend,()=>1);assert.equal(d.player.life,expected);
  }
});
test('vaccine grants exactly one free opening strike',async()=>{
  const {mutatedFleshRound}=await engine;const d=state();d.openingFreeHit=true;
  mutatedFleshRound(d,weapons.crowbar,false,()=>1);assert.equal(d.player.life,40);assert.equal(d.openingFreeHit,false);
  mutatedFleshRound(d,weapons.crowbar,false,()=>1);assert.equal(d.player.life,21);
});
test('dead players and completed fights cannot attack or spend ammunition',async()=>{
  const {mutatedFleshRound}=await engine;
  for(const dead of ['player','enemy']) { const d=state();d[dead].life=0;const before=JSON.stringify(d);assert.deepEqual(mutatedFleshRound(d,weapons.pistol,false,noRoll),[]);assert.equal(JSON.stringify(d),before); }
});
test('opening a saved fight leaves it untouched; reset enables corrected rules without refilling ammo',async()=>{
  const vm=require('node:vm');const {mutatedFleshRound,mutatedFleshWon}=await engine;
  const d=state();delete d.rulesVersion;Object.assign(d,{weaponId:'crowbar',started:true,log:[],history:[]});d.ammo.pistol=0;
  const pt={sim781:d};const controller=readSimulatorSource(path.join(__dirname,'../public/js/battlesim/battlesim781.js'),'utf8').replace(/^import .*;$/gm,'').replaceAll('export function','function');
  const fixtureProfiles=readRosterDocument(781).enemies.map(row=>{const {support,...profile}=row.stats.entry;return profile;});
  const context=vm.createContext({currentPlaythrough:()=>pt,saveState:()=>{},t:key=>key,escapeHtml:x=>x,mutatedFleshRound,mutatedFleshWon,fixtureProfiles,fixtureRules:FLESH_RULES});
  vm.runInContext(controller+'\nROSTER.push(...fixtureProfiles);Object.assign(FLESH_RULES,fixtureRules);_renderAll=()=>{};globalThis.subject={data:_data,reset:_resetBattle,defend:_defend};',context);
  const before=JSON.stringify(d);context.subject.data();assert.equal(JSON.stringify(d),before);
  context.subject.defend();assert.equal(d.enemy.life,38);assert.equal(d.player.life,23);assert.equal(d.rulesVersion,undefined);
  context.subject.reset();assert.equal(d.rulesVersion,1);assert.equal(d.ammo.pistol,0);assert.equal(d.player.life,23);
  context.subject.defend();assert.equal(d.enemy.life,12);assert.equal(d.player.life,17);
});

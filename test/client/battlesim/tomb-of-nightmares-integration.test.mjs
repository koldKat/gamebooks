import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import translations from '../../../public/js/i18n/en/battlesim/battlesim532.js';
import { TOMB_ENCOUNTERS, TOMB_DREAMS, TOMB_EQUIPMENT }
  from '../../../public/js/battlesim/engines/grailquest/tomb-of-nightmares-roster.js';

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
test('Tomb of Nightmares is registered once in both lazy loaders and exclusive overlays',()=>{
  for(const path of ['public/js/battlesim/loader.js','public/mobile/js/battlesim-dispatch.js']){
    const table=read(path).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...table.matchAll(/\d+/g)].filter(match=>Number(match[0])===532).length,1);
  }
  const overlays=runInNewContext(read('public/js/core/util.js').match(/ALL_PANEL_OVERLAY_IDS = (\[[^;]+\])/)[1]);
  assert.equal(overlays.filter(id=>id==='sim532-overlay').length,1);
});
test('Actual backend XP handler awards completed wins and losses once, not avoidance',()=>{
  const source=read('server/db/xp.js');
  const keys=runInNewContext(source.match(/const SIM_HISTORY_KEYS = (\[[^;]+\])/)[1]);
  assert.equal(keys.filter(key=>key==='sim532').length,1);
  const awards=[],refs=new Set();
  const context={db:{prepare:sql=>({get:()=>sql.includes('FROM books')?{}:{n:100}})},
    awardXp(_user,event,ref){if(refs.has(event+':'+ref))return false;refs.add(event+':'+ref);awards.push({event,ref});return true;},
    awardCoins(){},getXpAmount:()=>50,isCleanRun:()=>false,
    _discoveredSet:()=>new Set(),_visitedSet:()=>new Set(),_mappedSet:()=>new Set(),
    _checkGroupWonAll(){},SIM_HISTORY_KEYS:keys,_xpRefSeq:0};
  runInNewContext(source.slice(source.indexOf('function processStateXp('),source.indexOf('function migrateXpForUser(')),context);
  const state=history=>({playthroughs:[{startedAt:1,path:[],sim532:{history}}]});
  const history=[{outcome:'win',ts:100},{outcome:'loss',ts:101},{outcome:'avoided',ts:102}];
  context.processStateXp(1,532,state([]),state(history),0);
  context.processStateXp(1,532,state(history),state(history),0);
  assert.deepEqual(awards.filter(row=>row.event.startsWith('battlesim_')),
    [{event:'battlesim_win',ref:'sim532:100'},{event:'battlesim_loss',ref:'sim532:101'}]);
});
test('Own lazy translations cover encounters, equipment, literal UI strings and engine events',()=>{
  assert.ok(Object.entries(translations).every(([key,value])=>key.startsWith('battlesim532.')&&typeof value==='string'));
  for(const spec of [...TOMB_ENCOUNTERS,...TOMB_DREAMS])assert.ok(translations['battlesim532.enemy_names.'+spec.id]);
  for(const id of TOMB_EQUIPMENT)assert.ok(translations['battlesim532.gear.'+id]);
  const ui=read('public/js/battlesim/battlesim532.js');
  for(const match of ui.matchAll(/tk\('([a-zA-Z0-9_]+)'/g)){
    if(!match[1].endsWith('_'))assert.ok(translations['battlesim532.'+match[1]],match[1]);
  }
  const engine=read('public/js/battlesim/engines/grailquest/tomb-of-nightmares.js');
  for(const match of engine.matchAll(/kind:\s*'([^']+)'/g))assert.ok(translations['battlesim532.event_'+match[1]],match[1]);
});

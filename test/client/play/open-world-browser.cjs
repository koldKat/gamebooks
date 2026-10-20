const fs = require('node:fs');
const path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'open-world-'));
const repo = process.cwd();
const script = String.raw`
import * as core from 'file://${repo}/public/js/core/state.js';
import {booksState} from 'file://${repo}/public/js/books/state.js';
import {setOpenWorldHooks,setupOpenWorldForBook,_syncSeriesRuns,_handlePortalTravel,_computeCrossBookReachability,doJumpCrossBook} from 'file://${repo}/public/js/play/open-world.js';
import {initNotes,hideNotesUI,loadNotesForBook} from 'file://${repo}/public/js/play/notes.js';
import {initCharSheet} from 'file://${repo}/public/js/play/charsheet.js';
import {showBattleSimForBook,renderActiveBattleSim} from 'file://${repo}/public/js/battlesim/loader.js';
import {newFabledCharacter} from 'file://${repo}/public/js/battlesim/engines/fabled-lands/character.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const clone=value=>structuredClone(value);
const equal=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
try {
 core.setToken('isolated-fixture-only');
 const ids=[99001,99002,99003], store=new Map(), writes=[];
 let holdNotes=null,failNotes=false,notebookWrites=0;
 let notes='',failSource=false,failCharacter=false,failTarget=false,finishDuringLoad=false,showCalls=0;
 const seriesRun={run_index:0,started_at:1,last_book_id:99002,last_section:'1',completed:0,
   char_data:{fields:[{name:'Health',value:'3',visible:true}]}};
 const finishedRun={run_index:1,started_at:2,last_book_id:null,last_section:null,completed:1,result:'success',
   is_public:false,char_data:{fields:[{name:'Health',value:'8',visible:true}]}};
 const rows=ids.map((id,i)=>({id,name:'OWT '+(i+1),series_id:77,is_public:0,total_sections:20,created_by:7}));
 rows.push({id:99004,name:'Different world',series_id:88,is_public:0,created_by:7});
 booksState._cachedBooks=rows;
 booksState._cachedAllSeries=[{id:77,name:'Open world',is_open_world:1},{id:88,name:'Other',is_open_world:1}];
 for(const [index,id] of ids.entries()) store.set(id,{bookName:'OWT '+(index+1),totalSections:20,
   graph:{1:{choices:[],portals:ids.filter(other=>other!==id).map(targetBookId=>({targetBookId,targetSection:1}))}},
   positions:{},preSeriesRuns:[{path:[7,8],startedAt:100,completed:true,result:'death',charSheet:{fields:[]},
     simLocal:{history:['Historical '+id]}}],activePtIndex:0,playthroughs:[{path:id===99002?[1]:[],
     startedAt:id===99002?2000:null,completed:false,result:null,charSheet:clone(seriesRun.char_data),
     inventory:[{itemId:1,qty:2,label:'Original '+id,note:'Keep me',visible:true}],
     equipment:{hand:{itemId:2,qty:1,label:'Sword '+id,note:'Custom'}},equipmentVisible:{hand:true},
     simLocal:{fight:{enemy:'Local '+id,round:3},history:['Keep '+id]},undosUsed:0,fastTravelsUsed:0},
     {path:[1,9],startedAt:3000,completedAt:4000,completed:true,result:'success',isPublic:false,charSheet:clone(finishedRun.char_data),
      inventory:[{itemId:8,qty:9,label:'Other run '+id}],equipment:{},simLocal:{history:['Other run '+id]}}]});
 const original=clone(Object.fromEntries(store));
 window.fetch=async (url,options={})=>{
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
   let data=[],status=200;
   const stateMatch=String(url).match(/^\/api\/books\/(\d+)\/state$/);
   if(stateMatch){
     const id=Number(stateMatch[1]);
     if(method==='PUT'){
       if(failSource&&id===core.currentBookId)status=503;
       else {store.set(id,clone(body));writes.push(id);const pt=body.playthroughs?.[0];
         if(pt?.startedAt&&!pt.completed&&pt.path.length){seriesRun.last_book_id=id;seriesRun.last_section=String(pt.path.at(-1));}}
       data={ok:status===200};
     }else data=clone(store.get(id));
   }else if(String(url)==='/api/series/77/runs')data=[clone(seriesRun),clone(finishedRun)];
   else if(String(url)==='/api/series/77/runs/0'){
     if(failCharacter)status=503;else if(body?.char_data)seriesRun.char_data=clone(body.char_data);
     data={ok:status===200};
   }else if(String(url).includes('/notebook')){
     if(method==='PUT'){notebookWrites++;notes=body.text;data={ok:true,xpAwarded:false};}
     else {data={text:notes};if(failNotes)status=503;if(holdNotes){const wait=holdNotes;holdNotes=null;await wait;}}
   }else if(String(url).endsWith('/enemies'))data=[];
   else if(String(url).startsWith('/api/books'))data=clone(rows);
   else if(String(url).startsWith('/api/series'))data=clone(booksState._cachedAllSeries);
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 };
 async function show(id){
   showCalls++;
   if(failTarget){
     const latest=store.get(core.currentBookId);
     latest.graph[15]={choices:[16],note:'Concurrent update'};latest.positions[15]={x:42,y:99};
     return false;
   }
   if(finishDuringLoad){seriesRun.completed=1;seriesRun.result='success';}
   hideNotesUI();
   await core.loadState(id);
   setupOpenWorldForBook(id,77,true);
   await _syncSeriesRuns(77);
   await showBattleSimForBook(id);
   if(core.state.notesPinned)await loadNotesForBook(id);
   return true;
 }
 setOpenWorldHooks({showMain:show,getCurrentBookSeriesId:()=>77,getCurrentUserId:()=>7});
 initNotes();initCharSheet();core.setOnViewingPtChange(()=>renderActiveBattleSim());
 const active=()=>core.state.playthroughs[0];
 const save=async()=>{await core.saveState();await core.flushStateSaves();};
 async function readNotes(){document.getElementById('notebook-btn').click();await tick();return document.getElementById('notebook-modal-input').value;}
 async function saveNotes(text){await readNotes();document.getElementById('notebook-modal-input').value=text;document.getElementById('notebook-modal-save').click();await tick();}
 const travel=id=>_handlePortalTravel({targetBookId:id,targetSection:1});
 await show(99002);
 await saveNotes('Started in book 2');
 const mobileNotes=await import('file://${repo}/public/mobile/js/notebook.js');
 for(const mobile of [false,true]){
   const open=()=>mobile?mobileNotes.openNotebook(core.currentBookId):(document.getElementById('notebook-btn').click(),Promise.resolve());
   const input=()=>document.getElementById(mobile?'m-notebook-input':'notebook-modal-input');
   const button=()=>document.getElementById(mobile?'m-notebook-save':'notebook-modal-save');
   let release;holdNotes=new Promise(resolve=>release=resolve);
   const loading=open();await tick();
   const count=notebookWrites;
   check(input().disabled&&button().disabled,'notebook is disabled during load '+mobile);
   button().click();await tick();check(notebookWrites===count&&notes==='Started in book 2','loading cannot clear notes '+mobile);
   await show(99001);await open();await tick();check(input().value===notes,'new notebook loads '+mobile);
   notes='Newer notes';await open();await tick();release();await loading;await tick();
   check(input().value==='Newer notes','late old-book response cannot replace notes '+mobile);
   failNotes=true;await open();await tick();failNotes=false;
   check(input().disabled&&button().disabled,'failed load remains unsaveable '+mobile);
   button().click();await tick();check(notes==='Newer notes','failed load cannot clear notes '+mobile);
   await open();await tick();check(!input().disabled&&!button().disabled,'successful reopen enables notebook '+mobile);
   document.getElementById(mobile?'m-notebook-close':'notebook-modal-close').click();
   await show(99002);notes='Started in book 2';
 }

 // A pinned source and unpinned destination match the reported one-way route.
 core.state.notesPinned=true;
 await loadNotesForBook(99002);await save();
 check(document.getElementById('notes-display').classList.contains('visible'),'source notebook is pinned');
 const showBefore=showCalls;
 await Promise.all([travel(99001),travel(99001)]);
 check(showCalls===showBefore+1,'double portal clicks perform only one transfer');
 check(core.currentBookId===99001,'portal reaches first book');
 check(!document.getElementById('notes-display').classList.contains('visible'),'unpinned destination never shows stale source notes');
 check(!document.getElementById('notebook-modal-overlay').classList.contains('active'),'source notebook modal closes during book switch');
 equal(active().inventory,original[99002].playthroughs[0].inventory,'book 2 inventory arrives');
 equal(active().equipment,original[99002].playthroughs[0].equipment,'book 2 equipment arrives');
 check(await readNotes()==='Started in book 2','notebook arrives in book 1');
 active().inventory.push({itemId:3,qty:4,label:'Found in book 1',note:'Keep quantity',visible:true});
 active().equipment.hand.label='Renamed in book 1';active().charSheet.fields[0].value='2';
 await save();await saveNotes('Started in book 2\nAdded in book 1');
 await travel(99003);
 check(active().inventory.length===2&&active().inventory[1].qty===4,'third book receives accumulated items');
 check(active().equipment.hand.label==='Renamed in book 1','third book receives equipped metadata');
 check(active().charSheet.fields[0].value==='2','third book receives reduced character stat');
 check(document.getElementById('charsheet-display').textContent.includes('2'),'character stat renders in actual DOM');
 check(await readNotes()==='Started in book 2\nAdded in book 1','third book receives updated notes');
 active().inventory=[];active().equipment={};active().equipmentVisible={};
 await save();await saveNotes('Third book update');await travel(99002);
 equal(active().inventory,[],'removed items stay removed on return');
 equal(active().equipment,{},'unequipped items do not return from stale book state');
 check(await readNotes()==='Third book update','third book notes return to book 2');
 check(document.getElementById('notes-display-text').textContent==='Third book update','pinned destination reloads updated shared notes');
 await core.loadState(99002);await _syncSeriesRuns(77);
 equal(active().inventory,[],'reload retains current traveling inventory');
 for(const id of ids){
   const saved=store.get(id).playthroughs[0];
   equal(saved.simLocal,original[id].playthroughs[0].simLocal,'existing local fights/history preserved '+id);
   equal(store.get(id).playthroughs[1],original[id].playthroughs[1],'other series run remains untouched '+id);
   equal(store.get(id).preSeriesRuns,original[id].preSeriesRuns,'historical pre-series run remains untouched '+id);
   if(saved.openWorldLocalLoadout)equal(saved.openWorldLocalLoadout.inventory,original[id].playthroughs[0].inventory,'original local gear recovery '+id);
 }
 const beforeInvalid=writes.length;
 await travel(99999);await travel(99004);
 check(writes.length===beforeInvalid,'missing and foreign-series portals perform no saves');
 rows.find(book=>book.id===99002).series_id=88;await travel(99001);rows.find(book=>book.id===99002).series_id=77;
 check(writes.length===beforeInvalid,'a source moved to another series cannot transfer into its old world');
 check(!active().completed,'invalid destination never pauses source');
 failCharacter=true;await travel(99001);failCharacter=false;
 check(!active().completed&&!store.get(99002).playthroughs[0].completed,'failed character save leaves run active');
 failSource=true;await travel(99001);failSource=false;
 check(!active().completed&&!store.get(99002).playthroughs[0].completed,'failed source save leaves run active');
 failTarget=true;await travel(99001);failTarget=false;
 check(!active().completed&&!store.get(99002).playthroughs[0].completed,'failed target load restores source instead of activating wrong book');
 check(store.get(99002).graph[15].note==='Concurrent update'&&store.get(99002).positions[15].x===42,
   'failed-travel recovery preserves concurrent source edits');
 const source=store.get(99002).playthroughs[0];
 source.inventory=[{itemId:5,qty:7,label:'Fresh source',note:'Cross-book fast travel',visible:true}];
 source.charSheet.fields[0].value='1';
 await show(99003);
 const runs=[clone(seriesRun)];await _computeCrossBookReachability(runs,99003);
 await doJumpCrossBook(1,'fast');await core.flushStateSaves();
 check(active().inventory[0].label==='Fresh source','cross-book fast travel uses newly fetched source inventory');
 check(active().charSheet.fields[0].value==='1'&&seriesRun.char_data.fields[0].value==='1','fast travel carries and persists latest character sheet');
 check(active().fastTravelsUsed===1,'fast travel charged once');
 await show(99001);await _computeCrossBookReachability([clone(seriesRun),clone(finishedRun)],99001);
 const endedSource=store.get(99003).playthroughs[0];endedSource.completed=true;endedSource.result='death';
 const beforeEndedJump=writes.length;await doJumpCrossBook(1,'fast');
 check(writes.length===beforeEndedJump,'fast travel cannot reopen a source run that has ended');
 endedSource.completed=false;endedSource.result=null;
 await saveNotes('');await show(99001);check(await readNotes()==='','cleared shared notebook stays cleared in another book');
 for(const [family,simIds] of [['Fabled Lands',[674,675,676]],['Fighting Fantasy',[198,199,200]]]){
   seriesRun.last_book_id=simIds[0];seriesRun.last_section='1';
   for(const [index,id] of simIds.entries()){
     rows.push({id,name:family+' '+id,series_id:77,is_public:0,created_by:7,total_sections:20});
     const sample=clone(original[99002]);sample.bookName=family+' '+id;
     sample.playthroughs[0].startedAt=index===0?2000:null;
     sample.playthroughs[0].path=index===0?[1]:[];
     delete sample.playthroughs[0].simLocal;
     store.set(id,sample);
     await show(id);
     if(family==='Fighting Fantasy'&&index===0){
       document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',key:'s',bubbles:true}));
     }else document.getElementById('sim'+id+'-btn').click();
     await tick();
     const game=active()['sim'+id];
     check(game,'real simulator initializes '+id);
     game.history=[{enemy:'Existing '+id,outcome:'win',ts:123}];
     game.log=['Local battle log '+id];
     await save();
   }
   if(family==='Fighting Fantasy')for(const id of simIds.slice(1))delete store.get(id).playthroughs[0]['sim'+id];
   await show(simIds[0]);
   const initial=active()['sim'+simIds[0]];
   if(family==='Fabled Lands')initial.character={...newFabledCharacter(),stamina:3,combat:4};
   else {Object.assign(initial.player,{skill:4,skillInitial:10,stamina:3,staminaInitial:20,luck:2,luckInitial:8});initial.rolled=true;}
   renderActiveBattleSim();await save();
   for(const [index,id] of [simIds[1],simIds[2],simIds[0]].entries()){
     await travel(id);
     check(core.currentBookId===id,'simulator portal target '+id);
     if(family==='Fighting Fantasy'&&index===0){
       check(!active()['sim'+id]&&active().openWorldPendingCharacter,'unopened legacy panel retains pending traveling stats');
       await show(id); // Reload before the simulator is ever opened.
     }
     if(family==='Fighting Fantasy'&&index===0){
       document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',key:'s',bubbles:true}));
     }else document.getElementById('sim'+id+'-btn').click();
     await tick();
     const game=active()['sim'+id],hero=family==='Fabled Lands'?game.character:game.player;
     check(hero.stamina===3-index,'reduced simulator stamina carries to '+id);
     const input=document.getElementById('sim'+id+(family==='Fabled Lands'?'-stamina':'-player-stamina'));
     check(Number(input.value)===3-index,'simulator UI displays arriving reduced stamina '+id);
     equal(game.history,family==='Fighting Fantasy'&&id!==simIds[0]?[]:[{enemy:'Existing '+id,outcome:'win',ts:123}],
       'local simulator history remains unchanged '+id);
     const expectedLog=family==='Fighting Fantasy'&&id!==simIds[0]?[]:['Local battle log '+id];
     equal(game.log,expectedLog,'battle logs stay with their own book '+id);
     const logText=document.getElementById('sim'+id+'-log').textContent;
     for(const other of simIds.filter(other=>other!==id)) {
       check(!logText.includes('Local battle log '+other),'another book log is never displayed '+id);
     }
     if(expectedLog.length)check(logText.includes(expectedLog[0]),'returning displays this book saved log '+id);
     check(!game.fight,'source simulator fight never follows to '+id);
     hero.stamina--;renderActiveBattleSim();await save();
   }
   await core.loadState(simIds[0]);await _syncSeriesRuns(77);await showBattleSimForBook(simIds[0]);
   const game=active()['sim'+simIds[0]];
   check((game.character||game.player).stamina===0,'zero simulator stamina survives reload '+family);
   equal(game.log,['Local battle log '+simIds[0]],'reload preserves the source book own log '+family);
 }
 finishDuringLoad=true;await travel(199);finishDuringLoad=false;
 check(seriesRun.completed===1&&!core.currentPlaythrough(),'a run completed during travel is never revived');
 document.body.dataset.test=JSON.stringify({width:innerWidth,books:3,privateBooks:true,
   roundTrip:true,reload:true,metadata:true,clearedItems:true,clearedNotes:true,notebookLoadGuards:true,staleNotebookResponses:true,nativeMobileNotebook:true,
   legacyDataPreserved:true,otherRunsPreserved:true,preSeriesRunsPreserved:true,characterSaveFailure:true,sourceSaveFailure:true,targetLoadFailure:true,
   invalidDestinations:true,doubleClick:true,crossBookFastTravel:true,completedRunsNeverRevived:true,
   realFabledSimulatorUi:true,realFightingFantasyUi:true,localBattleLogsAndHistory:true,zeroStaminaReload:true});
}catch(error){document.body.dataset.failure=error.stack;}
`;
(async () => {
  try {
    const source = fs.readFileSync(path.join(repo, 'public/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const file = path.join(scratch, 'open-world.html');
    fs.writeFileSync(file, source.replace('<head>', `<head><base href="file://${repo}/public/">`)
      .replace('</body>', `<script>addEventListener('error',e=>document.body.dataset.failure=e.message)</script><script type="module">${script}</script></body>`));
    for (const width of [390, 1100]) console.log(JSON.stringify(await checkBrowser({file, root, width,
      profile: path.join(scratch, 'profile-' + width), chromium: process.env.CHROMIUM})));
  } finally { fs.rmSync(scratch, {recursive:true,force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });

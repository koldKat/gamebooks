// Real DOM and navigation regression for returning-page version updates.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http'), assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'app-refresh-'));
const base = path.resolve('public/js');
let pageLoads = 0;
const html = `<!doctype html><meta charset="utf-8">
<div id="landing-wrapper" style="height:200px">Main app <input id="draft" value=""></div>
<div id="main-screen" style="display:none;height:200px">Play area</div>
<div id="edit-overlay" class="modal-overlay" style="display:none">Editor</div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
import {initAppRefresh} from '/boot/app-refresh.js';
import {canRefreshMainPage} from '/boot/refresh-safety.js';
import {setCurrentBookId} from '/core/state.js';
const check=(ok,label)=>{if(!ok)throw Error(label);},delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(window.name.startsWith('expected-update:')){
 document.body.dataset.test=window.name.slice('expected-update:'.length);
 check(location.hash==='#books','reload preserves the main page URL');
}else{
 check(window.name!=='checking-update','no premature reload');window.name='checking-update';
 let time=Date.now(),visibility='visible',latest={version:'1.3.1.0'},requests=0,pending;
 Date.now=()=>time;
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
 window.fetch=async(url,options)=>{
  check(url==='/api/config'&&options.cache==='no-store','uncached version lookup');requests++;
  if(pending)return new Promise(resolve=>{pending.resolve=resolve;});
  return {ok:true,json:async()=>latest};
 };
 const home=()=>{setCurrentBookId(null);history.replaceState({view:'books'},'','#books');document.getElementById('main-screen').style.display='none';document.getElementById('landing-wrapper').style.display='block';};
 const play=()=>{setCurrentBookId(1470);history.replaceState({view:'book'},'','#book/1470');document.getElementById('main-screen').style.display='block';document.getElementById('landing-wrapper').style.display='none';};
 const hide=()=>{visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));time+=300000;};
 const show=()=>{visibility='visible';document.dispatchEvent(new Event('visibilitychange'));};
 const returning=async()=>{hide();show();await delay(30);};
 home();check(canRefreshMainPage(),'clean actual main DOM is eligible');initAppRefresh({version:'1.3.1.0',serverInstanceId:'original'});
 time+=86400000;window.dispatchEvent(new Event('focus'));await delay(30);check(requests===0,'visible idle has no polling or refresh');
 latest={version:'1.3.1.0',serverInstanceId:'restart-only'};await returning();check(requests===1,'unchanged version check completes without reload');
 latest={version:'1.3.2.0'};play();await returning();check(requests===1,'actual canvas never checks');home();
 pending={};hide();show();await delay(10);play();pending.resolve({ok:true,json:async()=>latest});pending=null;await delay(30);home();
 const checksAfterRace=requests;
 window.unsaved=true;await returning();check(requests===checksAfterRace,'queued save blocks request');window.unsaved=false;
 const field=document.getElementById('draft');field.value='Unsubmitted text';await returning();check(requests===checksAfterRace,'draft blocks request');field.value='';
 const editor=document.getElementById('edit-overlay');editor.classList.add('active');editor.style.display='block';await returning();check(requests===checksAfterRace,'open editor blocks request');editor.classList.remove('active');editor.style.display='none';
 pending={};hide();show();await delay(10);field.value='new typing';field.dispatchEvent(new Event('input',{bubbles:true}));pending.resolve({ok:true,json:async()=>latest});pending=null;await delay(30);field.value='';
 check(canRefreshMainPage(),'clean main page eligible again');
 window.name='expected-update:'+JSON.stringify({onlyNewVersion:true,noIdleRefresh:true,noCanvasRefresh:true,navigationRaceSafe:true,typingRaceSafe:true,draftsProtected:true,dialogsProtected:true,savesProtected:true,actualReload:true});
 hide();show();
 await delay(2000);throw Error('new version did not reload');
}
</script>`;
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control','no-store');
  if(req.url.split('#')[0]==='/') {pageLoads++;res.setHeader('Content-Type','text/html');return res.end(html);}
  res.setHeader('Content-Type','text/javascript');
  if(req.url==='/core/state.js')return res.end('export let currentBookId=null;export function setCurrentBookId(v){currentBookId=v;}export function hasUnsavedStateSaves(){return !!window.unsaved;}');
  if(['/boot/app-refresh.js','/boot/refresh-safety.js'].includes(req.url))return res.end(fs.readFileSync(path.join(base,req.url)));
  res.writeHead(404);res.end('');
});
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const file=path.join(root,'launch.html');
  fs.writeFileSync(file,'<script>location.replace("http://127.0.0.1:'+server.address().port+'/")</script>');
  const result=await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,timeoutMs:12000});
  assert.equal(pageLoads,2,'one initial load and exactly one eligible version reload');
  assert.ok(Object.values(result).every(value=>value===true));console.log(JSON.stringify({...result,pageLoads}));
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

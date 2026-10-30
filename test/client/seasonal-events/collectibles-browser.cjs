// Exercise collection visibility, rewards and dialog lifecycle in Chromium.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const Database=require('better-sqlite3');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const {initializeRubies,rubyInfoForUser}=require('../../../server/db/rubies');
const {initializeCollectibles,createCollectibles}=require('../../../server/db/collectibles');
const items=require('../../../public/js/seasonal-events/collectible-items.json');
const project=path.resolve('.'),root=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','collectibles-browser-'));
const db=new Database(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_admin INTEGER DEFAULT 0,ui_prefs TEXT);
INSERT INTO users VALUES(1,1,'{}'),(2,0,'{}');`);
initializeRubies(db);initializeCollectibles(db);
const store=createCollectibles(db,{now:()=>Date.parse('2026-10-31T14:30:42Z')});
let pushes=0;
const route={exports:{}};
vm.runInNewContext(fs.readFileSync('server/routes/collectibles.js','utf8'),{module:route,require(name){
 if(name==='../request-helpers')return{
  authenticate:async(req,res)=>{const userId={'Bearer one':1,'Bearer two':2}[req.headers.authorization];if(!userId){send(res,401,{});return null;}return userId;},
  send,isRequestImpersonating:()=>false,
 };
 if(name==='../db/connection')return{db};
 if(name==='../db/collectibles')return{createCollectibles:()=>store};
 if(name==='../sse')return{userBadgePush:()=>pushes++};
 throw Error(name);
}});
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
const indexHtml=fs.readFileSync('public/index.html','utf8');
const gift=indexHtml.match(/<button id="collectibles-btn"[\s\S]*?<\/button>/)[0];
if(!indexHtml.includes(gift+'\n              <button id="display-settings-btn"'))throw Error('Gift belongs beside the app header settings');
const header=indexHtml.slice(indexHtml.indexOf('<div id="app-banner">'),indexHtml.indexOf('<div id="books-tip-bar">'));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/landing.css"><link rel="stylesheet" href="/css/reduce-motion.css"><link rel="stylesheet" href="/css/mobile.css"><link rel="stylesheet" href="/css/seasonal-events.css"><link rel="stylesheet" href="/css/collectibles.css"><style>body{background:#141d29;color:#ccc;font:14px sans-serif;margin:18px}#landing-wrapper{position:static;display:block}#rubies-display{position:fixed;right:18px;bottom:18px}</style>
<div id="landing-wrapper">${header}</div><button id="rubies-display"></button>
<script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script>
<script type="module">
const check=(v,s)=>{if(!v)throw Error(s);},delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await delay(25);}throw Error('Timed out');};
const {setToken,clearToken}=await import('/js/core/state.js');setToken('one');
let activePreviewObservers=0;
const scheduledTimers=new Set(),nativeTimeout=window.setTimeout,nativeClear=window.clearTimeout;
window.setTimeout=(callback,ms,...args)=>{let id;id=nativeTimeout(()=>{scheduledTimers.delete(id);callback(...args);},ms);scheduledTimers.add(id);return id;};
window.clearTimeout=id=>{scheduledTimers.delete(id);nativeClear(id);};
const NativeObserver=window.IntersectionObserver;
window.IntersectionObserver=class extends NativeObserver{constructor(...args){super(...args);activePreviewObservers++;}disconnect(){super.disconnect();activePreviewObservers--;}};
const {openCollectibles}=await import('/js/seasonal-events/collectibles.js');
const {cursorDesigns}=await import('/js/seasonal-events/cursor-designs.js');
const {createRotatingCursor}=await import('/js/seasonal-events/rotating-cursor.js');
const {recordSeenCompanion}=await import('/js/seasonal-events/collectibles.js');
const api=async()=>fetch('/api/collectibles',{headers:{Authorization:'Bearer '+localStorage.getItem('gamebook_auth_token')}}).then(r=>r.json());
const giftStyle=getComputedStyle(document.getElementById('collectibles-btn')),settingsStyle=getComputedStyle(document.getElementById('display-settings-btn'));
for(const property of ['width','height','padding','borderRadius','borderColor','backgroundColor','color'])check(giftStyle[property]===settingsStyle[property],'gift matches header button '+property);
check(document.querySelector('.gift-icon').getBoundingClientRect().width===document.querySelector('.cog-icon').getBoundingClientRect().width,'gift matches neighboring icon size');
check(Object.keys(${JSON.stringify(items)}).sort().join()===Object.values(cursorDesigns).flat().map(d=>d.id).sort().join(),'server and client item registry agree');
let stop=createRotatingCursor(cursorDesigns.halloween,{random:()=>0,onSeen:recordSeenCompanion,switchDelay:()=>500});
await delay(60);check((await api()).items.length===0,'hidden mouse companion does not collect');
check(!document.querySelector('dialog')&&activePreviewObservers===0,'closed collection has no item DOM or preview observers');
document.dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',clientX:140,clientY:140}));await delay(60);check((await api()).items.length===0,'touch cannot collect invisible cursor');
document.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:140,clientY:140}));
await until(async()=> (await api()).items.includes('pumpkin'));
await until(()=>document.querySelector('.seasonal-mummy'));
await until(async()=> (await api()).items.includes('mummy'));
stop();check(!document.querySelector('.seasonal-cursor-particles'),'transition removes particle canvas');
document.querySelector('[data-open-collectibles]').click();await until(()=>document.querySelectorAll('.collectible-item').length===2);
check(document.querySelector('dialog').open,'gift opens dialog');
check(!document.querySelector('dialog').textContent.match(/diamond|claim|reward|year/i),'no reward hints');
check(getComputedStyle(document.querySelector('.collectible-item')).cursor==='default','no click cursor hint');
check(document.querySelector('.collectible-item').title.includes('Halloween')&&document.querySelector('.collectible-item').title.includes('2026'),'hover gives event and collection date');
await until(()=>document.querySelectorAll('.season-cursor-preview > *').length===2);
document.querySelector('.collectible-item').click();document.querySelector('.collectible-item').click();
await until(()=>document.getElementById('rubies-display').textContent.trim()==='1');
const balance=await fetch('/api/profile',{headers:{Authorization:'Bearer one'}}).then(r=>r.json());check(balance.rubiesBalance===1,'single blue diamond for repeated interaction');
let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'));
check(!document.querySelector('.season-cursor-preview > *'),'hidden dialog previews stop');hidden=false;document.dispatchEvent(new Event('visibilitychange'));await until(()=>document.querySelectorAll('.season-cursor-preview > *').length===2);
setToken('two');check(!document.querySelector('dialog').open&&!document.querySelector('.season-cursor-preview > *'),'account switch closes and disposes collection');
await openCollectibles();check(!document.querySelector('.collectible-item'),'other player sees empty collection');
clearToken();check(!document.querySelector('dialog').open,'logout closes collection');
setToken('one');await fetch('/seed',{method:'POST'});await openCollectibles();await until(()=>document.querySelectorAll('.season-cursor-preview > *').length>=6);
check(document.querySelectorAll('.collectible-item').length===12,'all twelve items can be collected');
check(getComputedStyle(document.querySelector('.season-cursor-gallery')).gridTemplateColumns.split(' ').length===(innerWidth>600?6:3),'compact item grid');
check(document.querySelector('dialog').getBoundingClientRect().right<=innerWidth,'dialog fits viewport');
document.querySelector('[data-dialog-close]').click();check(!document.querySelector('.collectible-item,.season-cursor-preview > *')&&activePreviewObservers===0&&scheduledTimers.size===0,'close immediately unloads every item, timer and observer');
await openCollectibles();await until(()=>document.querySelectorAll('.season-cursor-preview > *').length>=6);
document.body.dataset.test=JSON.stringify({hiddenNotCollected:true,mouseDiscovery:true,reformationDiscovery:true,privateAccounts:true,rollingClaims:true,animatedCollection:true,cleanup:true,noHints:true,items:12,width:innerWidth});
</script>`;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/')return res.end(html);
  if(req.url==='/seed'){for(const [id,season]of Object.entries(items)){db.prepare('UPDATE users SET ui_prefs=? WHERE id=1').run(JSON.stringify({seasonPreview:season}));store.discover(1,id);}return res.end('{}');}
  if(req.url==='/api/profile')return send(res,200,rubyInfoForUser(db,1));
  const match=req.url.match(/^\/api\/collectibles\/([a-z-]+)\/(seen|claim)$/);
  if(req.url==='/api/collectibles'||match)return await route.exports.handleCollectibles(req,res,match?.[1],match?.[2]);
  const file=path.join(project,'public',req.url.split('?')[0]);
  if(!file.startsWith(path.join(project,'public')+path.sep))return send(res,404,{});
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(error){send(res,500,{error:error.message});}
});
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const report=await checkBrowser({url:'http://127.0.0.1:'+server.address().port,profile:path.join(root,'profile'),root,width:Number(process.env.BROWSER_WIDTH)||1100,chromium:process.env.CHROMIUM,timeoutMs:20000,screenshotPath:process.env.BROWSER_SCREENSHOT});
 console.log(JSON.stringify({...report,privatePushes:pushes}));
}finally{await new Promise(r=>server.close(r));db.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

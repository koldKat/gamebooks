// Exercise the real admin preview module and main-app seasonal controller together.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'seasons-browser-'));
const project=path.resolve('.');
const adminMarkup=fs.readFileSync('admin/index.html','utf8').match(/<div id="tab-seasons"[\s\S]*?(?=<div id="tab-tools")/)[0];
const adminStyle=fs.readFileSync('admin/index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const base=`<meta charset="utf-8"><link rel="stylesheet" href="/css/seasonal-events.css">
<style>body{margin:0;background:#111827;color:#ddd;font:14px sans-serif}.panel{position:fixed;top:18px;bottom:18px;background:#202b3c;border:1px solid #354254;border-radius:10px;padding:12px;box-sizing:border-box}#covers-panel{left:12px;width:16%}#feed-panel{left:35%;width:30%;overflow:auto}#landing-right{right:12px;width:16%}h2{font-size:15px;color:#b9afa0}#admin{position:fixed;inset:45% 3% 3%;width:94%;height:52%;z-index:4;background:#111827;border:1px solid #555}#other{display:none}</style>
<div id="landing-wrapper"><div id="covers-panel" class="panel"><h2>Library</h2></div><div id="feed-panel" class="panel"><div id="seasonal-event-notice" class="seasonal-event-notice" hidden></div><h2>Activity feed</h2></div><div id="landing-right" class="panel"><h2>Community</h2></div></div><input id="seasonal-events-cb" type="checkbox" hidden>`;
const captureErrors=`addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));`;
const common=`const nativeMedia=matchMedia.bind(window);window.matchMedia=q=>q==='(any-pointer: fine)'?{matches:true,addEventListener(){},removeEventListener(){}}:nativeMedia(q);`;
const main=base+`<iframe id="admin" src="/admin-test"></iframe><iframe id="other" src="/other"></iframe><script>${captureErrors}</script><script type="module">
${common}
localStorage.setItem('gamebook_auth_token','test-admin');localStorage.setItem('seasonal-events','1');localStorage.removeItem('seasonal-preview:1');
const {initSeasonalEvents}=await import('/js/seasonal-events/index.js');initSeasonalEvents()();
const {setSeasonPreviewUser,seasonPreview}=await import('/js/seasonal-events/preview.js');
const {applySeasonalEventsPreference}=await import('/js/seasonal-events/preferences.js');
setSeasonPreviewUser({id:1,isAdmin:true});
const baseTime=Date.now();let clock=Date.parse('2026-10-30T12:00:00Z');
const stop=initSeasonalEvents({now:()=>new Date(clock+Date.now()-baseTime),random:()=>0});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,msg)=>{if(!ok)throw Error(msg)};
const until=async fn=>{for(let i=0;i<80;i++){if(fn())return;await delay(50)}throw Error('Timed out waiting for browser state')};
const classes={halloween:'.seasonal-pumpkin',diwali:'.seasonal-diya',christmas:'.seasonal-santa','new-year':'.seasonal-champagne'};
const active=season=>Boolean(document.querySelector(classes[season]));
const none=()=>!document.querySelector('.seasonal-pumpkin,.seasonal-diya,.seasonal-companion');
const noBackground=()=>!document.querySelector('.seasonal-background,.seasonal-background__icon,.seasonal-background__web');
const ad=document.getElementById('admin'),other=document.getElementById('other');
await until(()=>ad.contentDocument?.querySelector('[data-season-test="diwali"]')&&other.contentDocument?.body.dataset.ready);
const click=async selector=>{await until(()=>ad.contentDocument.querySelector(selector)&&!ad.contentDocument.querySelector(selector).disabled);ad.contentDocument.querySelector(selector).click();};
check(active('halloween')&&noBackground(),'live Halloween has only its mouse companion');
const initialEte=document.querySelector('.seasonal-event-ete')?.textContent;
check(initialEte?.includes('(ETE:'),'live event shows its remaining time');clock+=60000;document.dispatchEvent(new Event('visibilitychange'));
check(document.querySelector('.seasonal-event-ete').textContent!==initialEte,'remaining time advances without recreating the notice');
for(const season of ['diwali','christmas','new-year']){
 await click('[data-season-test="'+season+'"]');await until(()=>active(season));await delay(60);
 check(seasonPreview()===season,'admin preview reaches main app '+season);
 document.dispatchEvent(new PointerEvent('pointermove',{clientX:120,clientY:120,pointerType:'mouse'}));await delay(50);
 const cursor=document.querySelector(classes[season]);check(!cursor.hidden&&getComputedStyle(cursor).pointerEvents==='none','mouse companion follows pointer without intercepting input '+season);
 check(noBackground(),'no background objects for '+season);
 check(other.contentDocument.querySelector('.seasonal-pumpkin')&&other.contentWindow.readPreview()===null,'other account retains its live Halloween companion');
 document.dispatchEvent(new Event('visibilitychange'));await delay(50);check(document.querySelector(classes[season])===cursor,'tab return preserves current companion');
}
check(document.getElementById('seasonal-event-notice').textContent.includes('preview (only you)'),'private preview labelled');
await click('#seasons-automatic');await until(()=>active('halloween'));
await click('#seasons-off');await until(none);check(noBackground(),'test off leaves no decorations');
await click('[data-season-test="diwali"]');await until(()=>active('diwali'));
applySeasonalEventsPreference('0');check(none()&&!document.getElementById('seasonal-event-notice').hidden,'Ctrl+Y hides mouse companions but keeps notices');applySeasonalEventsPreference('1');
document.getElementById('landing-wrapper').style.display='none';await delay(50);check(none(),'play area gets no mouse companions');document.getElementById('landing-wrapper').style.display='';await delay(100);
await click('#seasons-automatic');await until(()=>seasonPreview()===null);
clock=Date.parse('2026-11-04T21:59:59.750Z')-(Date.now()-baseTime);document.dispatchEvent(new Event('visibilitychange'));check(none(),'before automatic event start');await delay(600);check(active('diwali')&&noBackground(),'Diwali starts at midnight with only the mouse companion');
clock=Date.parse('2026-11-11T21:59:59.750Z')-(Date.now()-baseTime);document.dispatchEvent(new Event('visibilitychange'));await delay(600);check(none()&&document.getElementById('seasonal-event-notice').hidden,'Diwali ends automatically');
for(const[stamp,season]of [['2026-12-21T21:59:59.750Z','christmas'],['2026-12-28T21:59:59.750Z','new-year'],['2027-01-04T21:59:59.750Z',null]]){
 clock=Date.parse(stamp)-(Date.now()-baseTime);document.dispatchEvent(new Event('visibilitychange'));await delay(600);check(season?active(season):none(),'winter midnight transition '+stamp);check(noBackground(),'winter calendar changes never add background objects');
}
await click('[data-season-test="diwali"]');await until(()=>active('diwali'));ad.hidden=true;
document.body.dataset.test=JSON.stringify({privatePreview:true,otherAccountUnaffected:true,liveRestored:true,off:true,settings:true,mouseOnly:true,noBackgroundSprites:true,automaticStartAndEnd:true,winterPreview:true,winterYearBoundary:true});
</script>`;
const other=base+`<script type="module">${common}
const {initSeasonalEvents}=await import('/js/seasonal-events/index.js');initSeasonalEvents()();
const {setSeasonPreviewUser,seasonPreview}=await import('/js/seasonal-events/preview.js');setSeasonPreviewUser({id:2,isAdmin:true});window.readPreview=seasonPreview;
initSeasonalEvents({now:()=>new Date('2026-10-30T12:00:00Z'),random:()=>0});document.body.dataset.ready='1';</script>`;
const admin=`<meta charset="utf-8"><link rel="stylesheet" href="/css/admin-seasons.css"><link rel="stylesheet" href="/css/seasonal-events.css"><style>${adminStyle}</style>${adminMarkup}<script type="module">import{loadSeasons}from'/admin/js/seasons.js';document.getElementById('tab-seasons').classList.add('active');if(!localStorage.getItem('gamebook_auth_token'))localStorage.setItem('gamebook_auth_token','test-admin');await loadSeasons();if(document.querySelector('.season-samples'))throw Error('Retired sprite galleries are still visible');if(document.querySelectorAll('[data-cursor-preview]').length!==12)throw Error('Each event needs three live companion previews');await new Promise(r=>setTimeout(r,200));const previewRoots=()=>document.querySelectorAll('.season-cursor-preview > *').length;if(!previewRoots())throw Error('Visible companion previews did not start');if(!document.getAnimations().length)throw Error('Admin companion previews are not animated');const firstGallery=document.querySelector('.season-cursor-gallery');firstGallery.style.display='none';await new Promise(r=>setTimeout(r,100));if(firstGallery.querySelector('.season-cursor-preview > *'))throw Error('Offscreen previews did not stop');firstGallery.style.display='';await new Promise(r=>setTimeout(r,100));let previewHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>previewHidden});document.dispatchEvent(new Event('visibilitychange'));if(previewRoots())throw Error('Hidden admin tab retains running companions');previewHidden=false;document.dispatchEvent(new Event('visibilitychange'));if(!previewRoots())throw Error('Visible admin tab did not resume previews');if(getComputedStyle(document.getElementById('seasons-list')).gridTemplateColumns.split(' ').length!==(innerWidth>680?2:1))throw Error('Season cards need two columns on desktop and one on narrow screens');if(${Boolean(process.env.SEASONS_FOCUS_NEW_YEAR)})document.querySelector('[data-season-test="new-year"]').closest('.season-card').scrollIntoView({block:'center'});document.body.dataset.test=JSON.stringify({adminSeasons:true,cards:document.querySelectorAll('.season-card').length,spriteGalleries:0,liveCompanionPreviews:12,hiddenPreviewsPaused:true,offscreenPreviewsPaused:true});</script>`;
let accountPrefs={seasonPreview:'automatic'};
const server=http.createServer((req,res)=>{
  if(req.url==='/api/prefs'){
    res.setHeader('Content-Type','application/json');
    if(req.method==='PATCH'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{accountPrefs={...accountPrefs,...JSON.parse(body)};res.end(JSON.stringify(accountPrefs));});return;}
    return res.end(JSON.stringify(accountPrefs));
  }
  if(req.url==='/api/profile'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({id:1,isAdmin:true}));}
  if(['/', '/other','/admin-test'].includes(req.url)){if(req.url==='/')accountPrefs={seasonPreview:'automatic'};res.setHeader('Content-Type','text/html');return res.end(req.url==='/'?main:req.url==='/other'?other:admin);}
  const filename=path.join(project,req.url.startsWith('/admin/')?'':'public',req.url);
  if(!filename.startsWith(project+path.sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.json')?'application/json':filename.endsWith('.css')?'text/css':'text/plain');
  fs.readFile(filename,(err,bytes)=>{if(err){res.writeHead(404);res.end()}else res.end(bytes)});
});
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const width of (process.env.SEASONS_ADMIN_ONLY?[]:[1280,390,320])){
    const result=await checkBrowser({url:'http://127.0.0.1:'+server.address().port+'/',root,profile:path.join(root,'profile-'+width),width,chromium:process.env.CHROMIUM,timeoutMs:20000,screenshotPath:process.env.SEASONS_SCREENSHOT_PREFIX?process.env.SEASONS_SCREENSHOT_PREFIX+'-'+width+'.jpg':undefined});
    console.log(JSON.stringify({width,...result}));
  }
  const adminResult=await checkBrowser({url:'http://127.0.0.1:'+server.address().port+'/admin-test',root,profile:path.join(root,'profile-admin'),width:1100,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONS_SCREENSHOT_PREFIX?process.env.SEASONS_SCREENSHOT_PREFIX+'-admin.jpg':undefined});
  if(adminResult.cards!==4)throw Error('Admin did not render both seasonal cards');console.log(JSON.stringify(adminResult));
}finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});

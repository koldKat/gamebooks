// Exercise the seasonal cursor's calendar, settings, animation and pointer lifecycle.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');

const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'seasonal-events-'));
const publicRoot = path.resolve('public');
const file = path.join(root, 'check.html');
const source = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${publicRoot}/css/seasonal-events.css">
<style>body{margin:24px;background:#111827;color:#ddd;font:16px sans-serif}button{display:block;width:100%;height:350px;cursor:pointer;background:#263147;color:white;border:1px solid #64748b;border-radius:12px;margin-top:20px}</style>
<label><input type="checkbox" id="seasonal-events-cb"> Seasonal events</label>
<div id="seasonal-event-notice" class="seasonal-event-notice" hidden></div>
<button id="target">Halloween cursor companion</button>
<div id="landing-wrapper" style="visibility:visible">
  <div id="covers-panel" style="position:fixed;left:0;top:450px;width:100px;height:400px"></div>
  <div id="feed-panel" style="position:fixed;left:300px;top:450px;width:100px;height:400px"></div>
  <div id="landing-right" style="position:fixed;right:0;top:450px;width:100px;height:400px"></div>
</div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
const nativeMedia=window.matchMedia.bind(window);
window.matchMedia=query=>query==='(any-pointer: fine)'?{matches:true,addEventListener(){},removeEventListener(){}}:nativeMedia(query);
// Exercise the rare effects without waiting several minutes in a browser check.
const nativeTimeout=window.setTimeout.bind(window),rareDelays=[];
window.setTimeout=(callback,ms,...args)=>{
 const accelerated=new Map([[70000,10000],[90000,13000],[120000,18000]]);
 if(accelerated.has(ms))rareDelays.push(ms);
 return nativeTimeout(callback,accelerated.get(ms)??ms,...args);
};
const {initSeasonalEvents}=await import('file://${publicRoot}/js/seasonal-events/index.js');
const {initSeasonalEventSettings,applySeasonalEventsPreference}=await import('file://${publicRoot}/js/seasonal-events/preferences.js');
const check=(ok,label)=>{if(!ok)throw Error(label);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const move=(x=200,y=170,type='mouse')=>document.dispatchEvent(new PointerEvent('pointermove',{pointerType:type,clientX:x,clientY:y}));
initSeasonalEvents()();localStorage.removeItem('seasonal-events');
let date=new Date(2026,9,27), saved;
let stop=initSeasonalEvents({now:()=>date,random:()=>0});
const refresh=()=>window.dispatchEvent(new Event('seasonal-events-change'));
check(!document.querySelector('.seasonal-pumpkin'),'outside event');
date=new Date(2026,9,28);refresh();
let pumpkin=document.querySelector('.seasonal-pumpkin');check(pumpkin?.hidden,'hidden until mouse arrives');
const blink=new Promise(resolve=>{
 const observer=new MutationObserver(()=>{if(pumpkin.classList.contains('is-blinking')){observer.disconnect();resolve();}});
 observer.observe(pumpkin,{attributes:true,attributeFilter:['class']});
});
const mouth=new Promise(resolve=>{
 const observer=new MutationObserver(()=>{if(pumpkin.classList.contains('is-gaping')){observer.disconnect();resolve();}});
 observer.observe(pumpkin,{attributes:true,attributeFilter:['class']});
});
const animationStart=className=>new Promise(resolve=>{
 const observer=new MutationObserver(()=>{if(pumpkin.classList.contains(className)){observer.disconnect();resolve();}});
 observer.observe(pumpkin,{attributes:true,attributeFilter:['class']});
});
const drool=animationStart('is-drooling'),clack=animationStart('is-clacking');
move();await delay(80);
check(!pumpkin.hidden,'follows mouse');check(pumpkin.getAttribute('aria-hidden')==='true','decorative');
check(getComputedStyle(pumpkin).pointerEvents==='none','click through');
check(document.elementFromPoint(220,190).id==='target','decoration does not block button');
check(getComputedStyle(document.getElementById('target')).cursor==='pointer','normal cursor retained');
check([70000,90000,120000].every(ms=>rareDelays.includes(ms)),'rare actions use longer intervals');
await blink;await delay(220);
check(!pumpkin.classList.contains('is-blinking'),'eyes reopen');
check(pumpkin.style.getPropertyValue('--pumpkin-look-x')==='-2.0px','looks around');
await mouth;await delay(220);
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__mouth-open')).display!=='none','mouth opens wide');
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__body')).animationName==='pumpkin-shake','shakes while mouth open');
await delay(1600);check(!pumpkin.classList.contains('is-gaping'),'mouth closes');
await clack;await delay(80);
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__upper-teeth')).animationName==='pumpkin-clack-upper','upper teeth clack');
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__lower-teeth')).animationName==='pumpkin-clack-lower','lower teeth clack');
check(!pumpkin.classList.contains('is-gaping'),'clacking separate from wide-mouth shake');
await delay(1250);check(!pumpkin.classList.contains('is-clacking'),'teeth stop clacking');
await drool;await delay(300);
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__drool')).animationName==='pumpkin-drool','drool animates');
await delay(2300);check(!pumpkin.classList.contains('is-drooling'),'drool ends');
move(innerWidth-1,innerHeight-1);await delay(60);
const rect=pumpkin.getBoundingClientRect();check(rect.right<=innerWidth&&rect.bottom<=innerHeight,'stays within viewport');
move(150,150,'touch');check(pumpkin.hidden,'no touch cursor');move();await delay(60);
window.dispatchEvent(new Event('blur'));check(pumpkin.hidden,'hides on blur');move();await delay(60);
document.body.classList.add('reduce-motion');await delay(30);
check(pumpkin.style.getPropertyValue('--pumpkin-look-x')==='0px'&&!pumpkin.classList.contains('is-blinking'),'reduced animation preference');
check(!pumpkin.classList.contains('is-clacking')&&!pumpkin.classList.contains('is-drooling'),'reduced motion clears mouth effects');
document.getElementById('landing-wrapper').style.visibility='visible';await delay(350);
check(!document.querySelector('.seasonal-background,.seasonal-background__icon,.seasonal-background__web'),'no background decorations');
let tabHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>tabHidden});
for(let i=0;i<3;i++){
 tabHidden=true;document.dispatchEvent(new Event('visibilitychange'));await delay(30);
 tabHidden=false;document.dispatchEvent(new Event('visibilitychange'));await delay(350);
 check(document.querySelector('.seasonal-pumpkin')===pumpkin&&!document.querySelector('.seasonal-background'),'tab switch retains only the mouse companion');
}
initSeasonalEventSettings(patch=>saved=patch);
const toggle=document.getElementById('seasonal-events-cb');check(toggle.checked,'enabled by default');
toggle.checked=false;toggle.dispatchEvent(new Event('change'));
check(!document.querySelector('.seasonal-pumpkin'),'turn off immediately');
check(!document.querySelector('.seasonal-background'),'background follows visual preference');
const notice=document.getElementById('seasonal-event-notice');
check(!notice.hidden&&notice.textContent==='Halloween event active: double XP for losses, battle deaths and sim battle losses.','reward notice independent of decorations');
check(getComputedStyle(notice.querySelector('.seasonal-event-loss')).color==='rgb(248, 113, 113)','losses red');
const simLoss=notice.querySelector('.seasonal-event-sim-loss');
check(simLoss?.textContent==='sim battle losses'&&getComputedStyle(simLoss).color==='rgb(196, 119, 119)','entire sim battle losses phrase muted red');
check(getComputedStyle(notice.querySelector('.seasonal-event-battle-death')).color==='rgb(217, 119, 6)','battle deaths dark orange');
check(saved.seasonalEvents==='0'&&localStorage.getItem('seasonal-events')==='0','persist preference');
stop();stop=initSeasonalEvents({now:()=>date,random:()=>0});check(!document.querySelector('.seasonal-pumpkin'),'stays disabled after reinitialization');
applySeasonalEventsPreference('1');check(toggle.checked&&document.querySelector('.seasonal-pumpkin'),'server preference restores setting');
date=new Date(2026,10,3,23,59);refresh();check(document.querySelector('.seasonal-pumpkin'),'last event day');
date=new Date(2026,10,4);refresh();check(!document.querySelector('.seasonal-pumpkin'),'event expires in open tab');
check(notice.hidden,'notice expires');
date=new Date(2027,9,31);refresh();check(document.querySelectorAll('.seasonal-pumpkin').length===1,'annual event and no duplicates');
stop();check(!document.querySelector('.seasonal-pumpkin'),'cleanup');
// Let the real scheduled callback run: no settings, visibility event or refresh.
date=new Date('2026-10-27T21:59:59Z');
stop=initSeasonalEvents({now:()=>date,random:()=>0});
check(notice.hidden&&!document.querySelector('.seasonal-pumpkin'),'before automatic event start');
date=new Date('2026-10-27T22:00:00Z');await delay(1250);
check(!notice.hidden&&document.querySelector('.seasonal-pumpkin')&&!document.querySelector('.seasonal-background'),'notice and mouse start automatically');
stop();date=new Date('2026-11-03T21:59:59Z');
stop=initSeasonalEvents({now:()=>date,random:()=>0});
check(!notice.hidden&&document.querySelector('.seasonal-pumpkin'),'before automatic event end');
date=new Date('2026-11-03T22:00:00Z');await delay(1250);
check(notice.hidden&&!document.querySelector('.seasonal-pumpkin')&&!document.querySelector('.seasonal-background'),'notice and decorations end automatically');
stop();date=new Date(2026,9,31);
stop=initSeasonalEvents({now:()=>date,random:()=>0});
const {seasonalEvents}=await import('file://${publicRoot}/js/seasonal-events/calendar.js');
const originalCalendar=JSON.parse(JSON.stringify(seasonalEvents)),nativeFetch=window.fetch;
let nextCalendar=originalCalendar,calendarFetches=0;
window.fetch=async(url,options)=>{
 check(String(url).endsWith('/seasonal-events/calendar.json')&&options.cache==='no-cache','live calendar revalidation');
 calendarFetches++;return {ok:true,json:async()=>nextCalendar};
};
const beforeLiveCursor=document.querySelector('.seasonal-pumpkin');
nextCalendar=originalCalendar.map(event=>({...event,description:'double XP for sim battle losses.'}));
window.dispatchEvent(new Event('app-config-changed'));await delay(40);
check(notice.textContent==='Halloween event active: double XP for sim battle losses.','SSE updates notice text in place');
check(document.querySelector('.seasonal-pumpkin')===beforeLiveCursor,'SSE text updates preserve the mouse companion');
nextCalendar=[];window.dispatchEvent(new Event('app-config-changed'));await delay(40);
check(notice.hidden&&!document.querySelector('.seasonal-background'),'SSE removes inactive event in open tab');
nextCalendar=originalCalendar;window.dispatchEvent(new Event('app-config-changed'));await delay(40);
check(!notice.hidden&&document.querySelector('.seasonal-pumpkin')&&!document.querySelector('.seasonal-background'),'SSE starts newly active event without background sprites');
window.fetch=async()=>{throw Error('offline');};
window.dispatchEvent(new Event('app-config-changed'));await delay(40);
check(!notice.hidden,'failed calendar request retains last valid event');
check(calendarFetches===3,'only live configuration signals fetch calendar');
window.fetch=nativeFetch;stop();
document.body.classList.remove('reduce-motion');
initSeasonalEvents({now:()=>date,random:()=>0});move();await delay(80);
document.body.dataset.test=JSON.stringify({calendar:true,automaticStart:true,automaticEnd:true,liveNoticeUpdates:true,liveStart:true,liveEnd:true,liveUpdatePreservesArtwork:true,wholeSimLossPhraseColored:true,pointer:true,blink:true,glances:true,mouth:true,drool:true,clack:true,mouseOnly:true,tabSwitchStable:true,settings:true,persistence:true,reducedMotion:true,cleanup:true});
</script>`;

(async () => {
  try {
    fs.writeFileSync(file, source);
    const result = await checkBrowser({file, root, profile:path.join(root,'profile'), width:700,
      chromium:process.env.CHROMIUM, timeoutMs:35000, screenshotPath:process.env.SEASONAL_SCREENSHOT});
    assert.ok(Object.values(result).every(value => value === true));
    console.log(JSON.stringify(result));
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode=1; });

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
<button id="target">Halloween cursor companion</button>
<div id="landing-wrapper" style="visibility:hidden">
  <div id="covers-panel" style="position:fixed;left:0;top:450px;width:100px;height:400px"></div>
  <div id="feed-panel" style="position:fixed;left:300px;top:450px;width:100px;height:400px"></div>
  <div id="landing-right" style="position:fixed;right:0;top:450px;width:100px;height:400px"></div>
</div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
const nativeMedia=window.matchMedia.bind(window);
window.matchMedia=query=>query==='(any-pointer: fine)'?{matches:true,addEventListener(){},removeEventListener(){}}:nativeMedia(query);
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
move();await delay(80);
check(!pumpkin.hidden,'follows mouse');check(pumpkin.getAttribute('aria-hidden')==='true','decorative');
check(getComputedStyle(pumpkin).pointerEvents==='none','click through');
check(document.elementFromPoint(220,190).id==='target','decoration does not block button');
check(getComputedStyle(document.getElementById('target')).cursor==='pointer','normal cursor retained');
await blink;await delay(220);
check(!pumpkin.classList.contains('is-blinking'),'eyes reopen');
check(pumpkin.style.getPropertyValue('--pumpkin-look-x')==='-2.0px','looks around');
await mouth;await delay(220);
check(getComputedStyle(pumpkin.querySelector('.seasonal-pumpkin__mouth')).transform.includes('1.45'),'mouth opens wide');
await delay(1000);check(!pumpkin.classList.contains('is-gaping'),'mouth closes');
move(innerWidth-1,innerHeight-1);await delay(60);
const rect=pumpkin.getBoundingClientRect();check(rect.right<=innerWidth&&rect.bottom<=innerHeight,'stays within viewport');
move(150,150,'touch');check(pumpkin.hidden,'no touch cursor');move();await delay(60);
window.dispatchEvent(new Event('blur'));check(pumpkin.hidden,'hides on blur');move();await delay(60);
document.body.classList.add('reduce-motion');await delay(30);
check(pumpkin.style.getPropertyValue('--pumpkin-look-x')==='0px'&&!pumpkin.classList.contains('is-blinking'),'reduced animation preference');
document.getElementById('landing-wrapper').style.visibility='visible';await delay(350);
let icons=[...document.querySelectorAll('.seasonal-background__icon')];
check(icons.length>0&&icons.length<=3,'sparse background decorations');
for(const icon of icons){
 const rect=icon.getBoundingClientRect();
 for(const id of ['covers-panel','feed-panel','landing-right']){
  const panel=document.getElementById(id).getBoundingClientRect();
  check(rect.right+18<=panel.left||rect.left-18>=panel.right||rect.bottom+18<=panel.top||rect.top-18>=panel.bottom,'clear panel gaps');
 }
}
initSeasonalEventSettings(patch=>saved=patch);
const toggle=document.getElementById('seasonal-events-cb');check(toggle.checked,'enabled by default');
toggle.checked=false;toggle.dispatchEvent(new Event('change'));
check(!document.querySelector('.seasonal-pumpkin'),'turn off immediately');
check(!document.querySelector('.seasonal-background'),'background follows visual preference');
check(saved.seasonalEvents==='0'&&localStorage.getItem('seasonal-events')==='0','persist preference');
stop();stop=initSeasonalEvents({now:()=>date});check(!document.querySelector('.seasonal-pumpkin'),'stays disabled after reinitialization');
applySeasonalEventsPreference('1');check(toggle.checked&&document.querySelector('.seasonal-pumpkin'),'server preference restores setting');
date=new Date(2026,10,3,23,59);refresh();check(document.querySelector('.seasonal-pumpkin'),'last event day');
date=new Date(2026,10,4);refresh();check(!document.querySelector('.seasonal-pumpkin'),'event expires in open tab');
date=new Date(2027,9,31);refresh();check(document.querySelectorAll('.seasonal-pumpkin').length===1,'annual event and no duplicates');
stop();check(!document.querySelector('.seasonal-pumpkin'),'cleanup');
document.body.classList.remove('reduce-motion');
initSeasonalEvents({now:()=>date});move();await delay(80);
document.body.dataset.test=JSON.stringify({calendar:true,pointer:true,blink:true,glances:true,mouth:true,background:true,settings:true,persistence:true,reducedMotion:true,cleanup:true});
</script>`;

(async () => {
  try {
    fs.writeFileSync(file, source);
    const result = await checkBrowser({file, root, profile:path.join(root,'profile'), width:700,
      chromium:process.env.CHROMIUM, timeoutMs:25000, screenshotPath:process.env.SEASONAL_SCREENSHOT});
    assert.ok(Object.values(result).every(value => value === true));
    console.log(JSON.stringify(result));
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode=1; });

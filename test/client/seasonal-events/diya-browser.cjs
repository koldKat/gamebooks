// Check the real Diwali cursor's visible effects and cleanup with a controlled clock.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'diya-browser-'));
const publicRoot = path.resolve('public');
const file = path.join(root, 'check.html');
const source = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${publicRoot}/css/seasonal-events.css">
<style>body{margin:32px;background:#111827;color:#ddd;font:16px sans-serif}.examples{display:flex;gap:60px;margin-top:55px}.example{width:130px}.example .seasonal-diya{position:relative;inset:auto;width:96px;height:96px;margin:30px auto}</style>
<h2>Diwali cursor — flame and occasional actions</h2><p>The clay lamp stays still while its flame moves.</p>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
const {createDiya}=await import('file://${publicRoot}/js/seasonal-events/diya.js');
const check=(condition,label)=>{if(!condition)throw Error(label);};
const nativeTimeout=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);
const delay=ms=>new Promise(resolve=>nativeTimeout(resolve,ms));
let now=0,next=1;const timers=new Map();
window.setTimeout=(callback,ms)=>{const id=next++;timers.set(id,{at:now+ms,callback});return id;};
window.clearTimeout=id=>timers.delete(id);
function advance(ms){const end=now+ms;for(let guard=0;guard<1000;guard++){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){now=end;return;}now=due[1].at;timers.delete(due[0]);due[1].callback();}throw Error('Timer loop');}
const mediaListeners=new Set(),nativeMedia=window.matchMedia.bind(window);
const motion={matches:false,addEventListener(type,fn){mediaListeners.add(fn);},removeEventListener(type,fn){mediaListeners.delete(fn);}};
window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?motion:nativeMedia(query);
const move=(x=100,y=100,pointerType='mouse')=>document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,pointerType}));
const stop=createDiya({random:()=>0}),lamp=document.querySelector('.seasonal-diya');
check(lamp.hidden&&!timers.size,'no hidden idle timers');move();await delay(35);
check(!lamp.hidden&&timers.size===3,'three scheduled rare actions');
check(getComputedStyle(lamp).pointerEvents==='none','never intercepts clicks');
const flame=lamp.querySelector('.seasonal-diya__flame'),fire=lamp.querySelector('.seasonal-diya__fire');
check(getComputedStyle(flame).animationName==='diya-flicker','flame burns continuously');
check(getComputedStyle(lamp.querySelector('svg')).animationName==='none','bowl does not wobble');
const flicker=flame.getAnimations()[0];flicker.pause();flicker.currentTime=0;const initial=getComputedStyle(flame).transform;flicker.currentTime=550;
check(getComputedStyle(flame).transform!==initial,'flame visibly changes shape');
advance(69999);check(!lamp.classList.contains('is-flaring'),'flare is occasional');advance(1);
check(lamp.classList.contains('is-flaring')&&getComputedStyle(fire).animationName==='diya-flare','wide flare animates');
advance(1800);check(!lamp.classList.contains('is-flaring'),'flare ends');advance(18200);
check(lamp.classList.contains('is-sparking'),'embers action begins');
const ember=lamp.querySelector('.seasonal-diya__embers circle');check(getComputedStyle(ember).animationName==='diya-ember','embers rise');
ember.getAnimations()[0].pause();ember.getAnimations()[0].currentTime=600;check(Number(getComputedStyle(ember).opacity)>0,'ember is visible');
advance(2400);check(!lamp.classList.contains('is-sparking'),'embers end');advance(27600);
check(lamp.classList.contains('is-smoking')&&getComputedStyle(fire).animationName==='diya-dip','flame dips for smoke');
const smoke=lamp.querySelector('.seasonal-diya__smoke path');check(getComputedStyle(smoke).animationName==='diya-smoke','smoke curls animate');
smoke.getAnimations()[0].pause();smoke.getAnimations()[0].currentTime=600;check(Number(getComputedStyle(smoke).opacity)>0,'smoke is visible');
document.body.classList.add('reduce-motion');await delay(20);
check(!timers.size&&!lamp.classList.contains('is-smoking'),'setting cancels active effect and all timers');
check(getComputedStyle(flame).animationName==='none','setting stops flicker');
document.body.classList.remove('reduce-motion');await delay(20);check(timers.size===3,'animation resumes after preference');
motion.matches=true;for(const listener of mediaListeners)listener();check(!timers.size,'system reduced motion cancels timers');
motion.matches=false;for(const listener of mediaListeners)listener();check(timers.size===3,'system preference resumes timers');
move(innerWidth-1,innerHeight-1);await delay(30);const rect=lamp.getBoundingClientRect();check(rect.right<=innerWidth&&rect.bottom<=innerHeight,'stays inside viewport');
move(100,100,'touch');check(lamp.hidden&&!timers.size,'touch clears effects');move();await delay(25);
window.dispatchEvent(new Event('blur'));check(lamp.hidden&&!timers.size,'blur clears effects');move();await delay(25);
let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'));
check(lamp.hidden&&!timers.size,'hidden tab clears effects');hidden=false;move();await delay(25);
document.documentElement.dispatchEvent(new Event('pointerleave'));check(lamp.hidden&&!timers.size,'pointer leaving clears effects');move();await delay(25);
window.dispatchEvent(new Event('resize'));check(lamp.hidden&&!timers.size,'resize clears effects');move();await delay(25);
const snapshot=lamp.cloneNode(true);stop();check(!lamp.isConnected&&!timers.size&&!mediaListeners.size,'dispose removes node, timers and preference listener');
move();await delay(25);check(!document.querySelector('.seasonal-diya')&&!timers.size,'dispose removes pointer listeners');
const stopPreview=createDiya({random:()=>0,preview:true});move();await delay(25);
const preview=document.querySelector('.seasonal-diya');advance(4500);check(preview.classList.contains('is-flaring'),'preview shows flare promptly');
advance(5500);check(preview.classList.contains('is-sparking'),'preview shows embers within ten seconds');
advance(6000);check(preview.classList.contains('is-smoking'),'preview shows smoke within twenty seconds');
advance(3000);check([...timers.values()].every(timer=>timer.at-now>50000),'preview returns to rare intervals');
stopPreview();check(!timers.size,'preview timers cleaned up');
window.setTimeout=nativeTimeout;window.clearTimeout=nativeClear;
const examples=document.createElement('div');examples.className='examples';
for(const [name,action,time] of [['Burning flame','',.5],['Flare','is-flaring',.5],['Embers','is-sparking',.6],['Smoke curl','is-smoking',.6]]){
 const entry=document.createElement('div');entry.className='example';entry.textContent=name;
 const sample=snapshot.cloneNode(true);sample.hidden=false;sample.removeAttribute('style');if(action)sample.classList.add(action);entry.append(sample);examples.append(entry);
 for(const element of sample.querySelectorAll('*')){element.style.animationPlayState='paused';element.style.animationDelay='-'+time+'s';}
}
document.body.append(examples);
document.body.dataset.test=JSON.stringify({flicker:true,flare:true,embers:true,smoke:true,rareIntervals:true,quickPreview:true,reducedMotion:true,pointer:true,cleanup:true});
</script>`;
(async () => {
  try {
    fs.writeFileSync(file, source);
    const result = await checkBrowser({ file, root, profile:path.join(root,'profile'), width:800,
      chromium:process.env.CHROMIUM, screenshotPath:process.env.DIYA_SCREENSHOT });
    assert.ok(Object.values(result).every(value => value === true));
    console.log(JSON.stringify(result));
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });

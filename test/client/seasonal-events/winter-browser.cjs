// Exercise winter cursor expressions, all six actions and cleanup in the real browser.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'winter-cursors-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><style>body{margin:25px;background:#111827;color:#ddd;font:16px sans-serif}.samples{display:flex;gap:35px;margin:60px 0}.sample{width:130px}.sample .seasonal-companion{position:relative;inset:auto;width:96px;height:96px;margin-top:30px}</style><h2>Winter cursor animations</h2><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">
const {createSanta,createNewYearChampagne}=await import('file://${base}/js/seasonal-events/winter-cursors.js');
const nativeTimeout=setTimeout.bind(window),nativeClear=clearTimeout.bind(window),delay=ms=>new Promise(r=>nativeTimeout(r,ms));
const check=(value,label)=>{if(!value)throw Error(label);};let now=0,serial=1;const timers=new Map();
window.setTimeout=(callback,ms)=>{const id=serial++;timers.set(id,{at:now+ms,callback});return id;};window.clearTimeout=id=>timers.delete(id);
function advance(ms){const end=now+ms;for(let guard=0;guard<10000;guard++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;return;}now=next[1].at;timers.delete(next[0]);next[1].callback();}throw Error('Timer loop');}
const move=(x=100,y=100,type='mouse')=>document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,pointerType:type}));
const snapshots=[];
for(const [make,name,effects]of [[createSanta,'santa',['is-laughing','is-ringing','is-gifting']],[createNewYearChampagne,'champagne',['is-popping','is-toasting','is-fireworks']]]){
 const stop=make({random:()=>0,preview:true}),node=document.querySelector('.seasonal-'+name);check(node.hidden&&!timers.size,'hidden timers');move();await delay(30);
 check(!node.hidden&&getComputedStyle(node).pointerEvents==='none','decorative pointer');
 if(name==='santa'){
  advance(3200);check(node.classList.contains('is-blinking'),'Santa blinks');advance(150);check(!node.classList.contains('is-blinking'),'Santa opens eyes');
  check(node.style.getPropertyValue('--companion-look-x')==='-2.0px','Santa looks around');advance(1150);
 }else{
  const body=node.querySelector('.seasonal-champagne__body');check(getComputedStyle(body).animationName==='new-year-sway','popper constantly bobs');const animation=body.getAnimations()[0];animation.pause();animation.currentTime=0;const a=getComputedStyle(body).transform;animation.currentTime=1500;check(getComputedStyle(body).transform!==a,'popper visibly moves');
  check([...node.querySelectorAll('.seasonal-champagne__bubbles rect')].every(el=>getComputedStyle(el).animationName==='new-year-bubbles'),'ambient sparkles animate');advance(4500);
 }
 check(node.classList.contains(effects[0]),name+' first action');
 const animated=name==='santa'?node.querySelectorAll('.seasonal-santa__ho text'):node.querySelectorAll('.seasonal-champagne__foam rect');check(animated.length===(name==='santa'?9:18),'comic words or confetti particles');
 for(const item of animated)check(getComputedStyle(item).animationName!=='none','words animate');
 const firstAnimation=animated[0].getAnimations()[0];firstAnimation.pause();firstAnimation.currentTime=300;check(Number(getComputedStyle(animated[0]).opacity)>0,'comic words or confetti visibly rendered');
 if(name==='santa'){const directions=[...animated].map(el=>getComputedStyle(el).getPropertyValue('--ho-x'));check(new Set(directions).size===3,'Ho words go in distinct directions');for(const el of animated){const a=el.getAnimations()[0];a.pause();a.currentTime=1900;}check([...animated].some(el=>Number(getComputedStyle(el).opacity)>.2),'Ho words continue through the late mouth movements');}
 snapshots.push([name+' '+effects[0],node.cloneNode(true)]);advance(5500);check(node.classList.contains(effects[1]),name+' second action');snapshots.push([name+' '+effects[1],node.cloneNode(true)]);
 advance(6000);check(node.classList.contains(effects[2]),name+' third action');snapshots.push([name+' '+effects[2],node.cloneNode(true)]);
 document.body.classList.add('reduce-motion');await delay(20);check(!timers.size&&!effects.some(e=>node.classList.contains(e)),'motion setting cancels all actions');
 if(name==='champagne')check(getComputedStyle(node.querySelector('.seasonal-champagne__body')).animationName==='none','reduced motion stops popper');
 document.body.classList.remove('reduce-motion');await delay(20);check(timers.size>0,'animations resume');
 move(innerWidth-1,innerHeight-1);await delay(25);const rect=node.getBoundingClientRect();check(rect.right<=innerWidth&&rect.bottom<=innerHeight,'viewport edges');
 move(1,1,'touch');check(node.hidden&&!timers.size,'touch cleanup');move();await delay(25);window.dispatchEvent(new Event('blur'));check(node.hidden&&!timers.size,'blur cleanup');
 move();await delay(25);stop();check(!node.isConnected&&!timers.size,'disposal cleanup');move();await delay(25);check(!document.querySelector('.seasonal-companion'),'listeners removed');
}
const stopLive=createNewYearChampagne({random:()=>0});move();await delay(25);advance(69999);check(!document.querySelector('.seasonal-champagne').classList.contains('is-popping'),'live actions retain Halloween timing');advance(1);check(document.querySelector('.seasonal-champagne').classList.contains('is-popping'),'live first action at70seconds');stopLive();check(!timers.size,'live timer cleanup');
window.setTimeout=nativeTimeout;window.clearTimeout=nativeClear;
for(let row=0;row<2;row++){const group=document.createElement('div');group.className='samples';document.body.append(group);for(const[label,node]of snapshots.slice(row*3,row*3+3)){const sample=document.createElement('div');sample.className='sample';sample.textContent=label;node.removeAttribute('style');node.classList.remove('is-blinking');sample.append(node);group.append(sample);for(const el of node.querySelectorAll('*')){el.style.animationPlayState='paused';for(const animation of el.getAnimations())animation.currentTime=950;}}}
document.body.dataset.test=JSON.stringify({santaBlink:true,santaLook:true,comicHo:true,bell:true,gift:true,champagneSways:true,bubbles:true,corkAndFoam:true,clinkingGlasses:true,fireworks:true,reducedMotion:true,pointer:true,cleanup:true});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:800,chromium:process.env.CHROMIUM,screenshotPath:process.env.WINTER_SCREENSHOT})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

// Exercise clicked-zombie collisions, persistent jawless splats and complete animation cleanup.
const fs=require('node:fs'),path=require('node:path');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'zombie-drop-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><style>body{margin:0;background:#111827;color:#ddd}#covers-panel,#feed-panel,#landing-right{position:fixed;top:0;height:100vh;width:220px;background:#1a263a}#covers-panel{left:0}#feed-panel{left:440px}#landing-right{right:0}</style><div id="landing-wrapper"><div id="covers-panel"></div><div id="feed-panel"></div><div id="landing-right"></div></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">
Math.random=()=>.42;const {createSeasonalBackground}=await import('file://${base}/js/seasonal-events/background.js');
const check=(v,label)=>{if(!v)throw Error(label);},delay=ms=>new Promise(r=>setTimeout(r,ms));
let stop=createSeasonalBackground();await delay(350);
const getHead=()=>document.querySelector('.seasonal-background__icon[data-artwork="16"]:not([hidden])');
let head=getHead();check(head?.getAttribute('role')==='button'&&getComputedStyle(head).pointerEvents==='auto','head is a real clickable target');
head.style.top='100px';const before=head.innerHTML;
const other=[...document.querySelectorAll('.seasonal-background__icon:not([hidden])')].find(n=>n!==head&&n.dataset.artwork!=='16');
other.style.top='220px';other.style.left=(parseFloat(head.style.left)+parseFloat(head.style.width)/2-parseFloat(other.style.width)/2)+'px';
const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,frames=new Map();let serial=0,now=0;
window.requestAnimationFrame=cb=>{frames.set(++serial,cb);return serial;};window.cancelAnimationFrame=id=>frames.delete(id);
const step=()=>{now+=1000/60;const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(now);};
head.click();check(head.dataset.dropState==='falling'&&frames.size===1,'click starts one falling animation');
let bumped=false;
for(let i=0;i<1800&&head.dataset.dropState!=='splat';i++){step();if([...document.querySelectorAll('.seasonal-background__icon')].some(node=>node!==head&&node.style.translate))bumped=true;}
check(head.dataset.dropState==='splat','head reaches the floor and splats');check(Number(head.dataset.collisions)>0&&bumped,'collisions bounce the head and move another sprite: '+JSON.stringify({collisions:head.dataset.collisions,bumped,head:head.style.cssText,other:other.style.cssText}));
check(head.querySelector('.halloween-splat__blood')&&head.querySelector('.halloween-splat__skull'),'blood pile and skull remain');
const skull=head.querySelector('.halloween-splat__skull'),bones=[...skull.querySelectorAll('rect')];
check(bones.length>10&&bones.some(r=>r.getAttribute('fill')==='#e1d8ba'),'visible bone pixels remain after browser SVG serialization');
check(bones.every(r=>Number(r.getAttribute('y'))<24),'only top half remains with no jaw');
check(Math.abs(head.getBoundingClientRect().bottom-innerHeight)<2,'splat remains at bottom of viewport');
check(!head.hasAttribute('tabindex'),'finished splat is not a dead keyboard control');
for(let i=0;i<600&&frames.size;i++)step();check(frames.size===0,'physics stops after motion settles');
window.dispatchEvent(new Event('resize'));await delay(350);check(head.dataset.dropState==='splat'&&head.innerHTML!==before,'layout does not resurrect the head');
stop();check(frames.size===0,'completed scene cleanup');
document.body.classList.add('reduce-motion');stop=createSeasonalBackground();await delay(350);head=getHead();head.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
check(head.dataset.dropState==='splat'&&frames.size===0,'reduced motion keyboard action goes directly to the splat');stop();document.body.classList.remove('reduce-motion');
stop=createSeasonalBackground();await delay(350);head=getHead();head.click();check(frames.size===1,'fresh drop active');stop();check(frames.size===0&&!head.isConnected,'disposing active physics cancels RAF and removes the effect');
window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;
if(${Boolean(process.env.SEASONAL_SCREENSHOT)}){document.body.classList.add('reduce-motion');createSeasonalBackground();await delay(350);getHead().click();}
document.body.dataset.test=JSON.stringify({clickable:true,gravity:true,collision:true,spriteBumps:true,bloodPile:true,jawMissing:true,floor:true,stableAcrossLayout:true,reducedMotion:true,keyboard:true,cleanup:true});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,timeoutMs:30000,screenshotPath:process.env.SEASONAL_SCREENSHOT})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

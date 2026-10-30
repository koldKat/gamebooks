// Exercise rare active-time rotation, bounded particle cleanup and all live companion actions.
const fs=require('node:fs'),path=require('node:path'),checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','cursor-variants-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><link rel="stylesheet" href="file://${base}/css/admin-seasons.css"><style>body{margin:25px;background:#141d29;color:#ccc;font:14px sans-serif}.catalogue{display:grid;grid-template-columns:1fr 1fr;gap:20px}.season-card{min-width:0}.season-cursor-gallery{margin-top:0}</style><script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script><script type="module">
const {cursorDesigns}=await import('file://${base}/js/seasonal-events/cursor-designs.js');const {createRotatingCursor}=await import('file://${base}/js/seasonal-events/rotating-cursor.js');
const check=(v,label)=>{if(!v)throw Error(label);};
const original={timeout:window.setTimeout,clear:window.clearTimeout,frame:window.requestAnimationFrame,cancel:window.cancelAnimationFrame,now:performance.now.bind(performance)};
let clock=0,serial=0;const timers=new Map(),frames=new Map();
window.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,due:clock+ms});return serial;};window.clearTimeout=id=>timers.delete(id);window.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};window.cancelAnimationFrame=id=>frames.delete(id);Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
const advance=ms=>{const until=clock+ms;let task;while((task=[...timers].filter(([,v])=>v.due<=until).sort((a,b)=>a[1].due-b[1].due)[0])){clock=task[1].due;timers.delete(task[0]);task[1].fn();}clock=until;};
const frame=ms=>{advance(ms);const work=[...frames.values()];frames.clear();for(const fn of work)fn(clock);};
const move=()=>{document.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:250,clientY:200}));frame(1);};
for(const designs of Object.values(cursorDesigns))for(const [index,randomValue]of [0,.34,.67].entries()){const end=createRotatingCursor(designs,{random:()=>randomValue});const node=document.querySelector('.seasonal-'+designs[index].id);check(node,'reload can start with '+designs[index].id);check(getComputedStyle(node).width==='32px'&&getComputedStyle(node).height==='32px','every live cursor matches the pumpkin scale');document.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:innerWidth-1,clientY:200}));frame(1);const gap=innerWidth-1-node.getBoundingClientRect().right;check(gap>=13&&gap<=15,'right-edge gap stays close to the pointer '+designs[index].id);end();}
let stop=createRotatingCursor(cursorDesigns.halloween,{random:()=>0});move();
advance(300000);check(document.querySelector('.seasonal-pumpkin')&&!document.querySelector('canvas'),'idle time never switches the cursor');
for(let i=0;i<70;i++){move();advance(10000);}check(!document.querySelector('canvas'),'rotation is very rare');
move();advance(5000);check(document.querySelector('.seasonal-cursor-particles'),'active-time budget starts a particle transition');
for(let i=0;i<20;i++)frame(100);check(document.querySelector('.seasonal-mummy')&&!document.querySelector('.seasonal-pumpkin')&&!document.querySelector('canvas'),'particles reform into a different cursor');
stop();check(!document.querySelector('.seasonal-companion,.seasonal-pumpkin,canvas')&&timers.size===0&&frames.size===0,'rotation and companion cleanup remove all work');
stop=createRotatingCursor(cursorDesigns.halloween,{random:()=>0,switchDelay:()=>1000});move();advance(1000);frame(1);window.dispatchEvent(new Event('blur'));check(!document.querySelector('canvas')&&[...document.querySelectorAll('.seasonal-companion,.seasonal-pumpkin')].every(n=>n.hidden),'blur cancels particle effects and hides the companion');stop();
document.body.classList.add('reduce-motion');stop=createRotatingCursor(cursorDesigns.halloween,{random:()=>0,switchDelay:()=>1000});for(let i=0;i<3;i++){move();advance(1000);}check(!document.querySelector('canvas')&&document.querySelector('.seasonal-pumpkin'),'reduced motion disables reformation');stop();document.body.classList.remove('reduce-motion');
check(timers.size===0&&frames.size===0,'no remaining test callbacks');
for(const [season,designs]of Object.entries(cursorDesigns)){
 check(designs.length===3&&new Set(designs.map(d=>d.id)).size===3,'three unique companions '+season);
 for(const design of designs.slice(1)){
  const host=document.createElement('div');document.body.append(host);const instance=design.create({host,preview:true,random:()=>0});
  if(['lotus','lantern','partyhat','star'].includes(design.id))check([...instance.node.querySelectorAll('.seasonal-variant__eyes > path')].every(p=>getComputedStyle(p).fill==='rgb(255, 253, 247)'),'white eyes '+design.id);
  advance(1700);check(instance.node.style.getPropertyValue('--companion-look-x')==='-2.0px','new face looks around '+design.id);
  advance(1500);check(instance.node.classList.contains('is-blinking'),'new face blinks '+design.id);advance(150);
  for(const [i,time]of [4500,10000,16000].entries()){
   const before=clock;const next=design.actions[i];
   // Advance to this design's preview action relative to the instance's start.
   const start=before-(i===0?3350:i===1?4500:10000);advance(start+time-clock);
   check(instance.node.classList.contains(next),'occasional action runs '+design.id+'/'+next);
   if(design.id==='snowman'&&i===1){for(const a of instance.node.getAnimations({subtree:true})){a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.55;}const nose=instance.node.querySelector('.snowman-nose');check(getComputedStyle(nose).animationName==='snowman-nose-fall'&&new DOMMatrix(getComputedStyle(nose).transform).m42>10,'carrot nose falls below the face');check(Number(getComputedStyle(instance.node.querySelector('.snowman-surprise')).opacity)>.9&&instance.node.querySelectorAll('.snowman-surprise .snowman-button-hole').length===8,'snowman widens its button eyes in surprise');}
   if(design.id==='mummy'&&i===0){check(instance.node.querySelectorAll('.mummy-band > path').length===28,'each linen strip has its attached fold, wear and fraying');for(const p of instance.node.querySelectorAll('.mummy-band path')){const b=p.getBBox();check(b.x>=5&&b.x+b.width<=43&&b.y>=2&&b.y+b.height<=44,'linen details stay attached to the head');}for(const a of instance.node.getAnimations({subtree:true})){a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.55;}check(Number(getComputedStyle(instance.node.querySelector('.mummy-wraps')).opacity)<.05,'mummy unwraps to its skull');check(Number(getComputedStyle(instance.node.querySelector('.seasonal-variant__eyes')).opacity)<.05&&instance.node.querySelector('.mummy-skull'),'unwrapped skull has dark sockets without floating cartoon eyes');check(Number(getComputedStyle(instance.node.querySelector('.mummy-eye-fire')).opacity)>.9&&instance.node.querySelectorAll('.mummy-socket-flame').length===2,'both exposed skull sockets burn before rewrapping');}
   if(design.id==='zombie'&&i===0){const pieces=[...instance.node.querySelectorAll('.zombie-brain-piece')];check(pieces.length===5&&!instance.node.querySelector('.zombie-puddle'),'brain pieces replace the melt');for(const a of instance.node.getAnimations({subtree:true})){a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.55;}check(Number(getComputedStyle(instance.node.querySelector('.zombie-head')).opacity)===1&&pieces.every(p=>getComputedStyle(p).transform!=='none'),'head stays intact while brain bursts');for(const a of instance.node.getAnimations({subtree:true}))a.currentTime=Number(a.effect.getTiming().duration);check(pieces.every(p=>getComputedStyle(p).transform==='matrix(1, 0, 0, 1, 0, 0)'),'brain reforms after the explosion');}
  }
  instance();host.remove();check(timers.size===0,'inline preview cleanup '+design.id);
 }
}
window.setTimeout=original.timeout;window.clearTimeout=original.clear;window.requestAnimationFrame=original.frame;window.cancelAnimationFrame=original.cancel;Object.defineProperty(performance,'now',{configurable:true,value:original.now});
const catalogue=document.createElement('section');catalogue.className='catalogue';document.body.append(catalogue);
for(const[season,designs]of Object.entries(cursorDesigns)){
 const card=document.createElement('section');card.className='season-card';card.innerHTML='<h3>'+season+'</h3>';const gallery=document.createElement('div');gallery.className='season-cursor-gallery';card.append(gallery);catalogue.append(card);
 for(const design of designs){const item=document.createElement('figure'),host=document.createElement('div'),caption=document.createElement('figcaption');host.className='season-cursor-preview seasonal-inline-preview';caption.textContent=design.label;item.append(host,caption);gallery.append(item);const instance=design.create({host,preview:true,random:()=>.5});
  if(${Boolean(process.env.CURSOR_ACTIONS)}){const effect=design.actions?.[design.id==='snowman'?1:0]||({pumpkin:'is-gaping',diya:'is-flaring',santa:'is-laughing',champagne:'is-popping'})[design.id];instance.node.classList.add(effect);for(const a of instance.node.getAnimations({subtree:true})){a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.55;}}
 }
}
document.body.dataset.test=JSON.stringify({events:4,companions:12,randomInitialCompanion:true,rareActiveTime:true,idleSafe:true,particleReformation:true,blink:true,look:true,actions:24,mummyUnwrap:true,zombieBrainExplosion:true,mummySocketFlames:true,snowmanNoseAndButtonSurprise:true,reducedMotion:true,cleanup:true});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1400,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONAL_SCREENSHOT,timeoutMs:30000})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

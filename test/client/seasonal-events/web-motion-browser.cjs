// Verify gravity-correct animated corner spiders and review every New Year sprite.
const fs=require('node:fs'),path=require('node:path');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'seasonal-web-motion-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css">
<style>body{margin:0;background:#111827;color:#ddd;font:13px sans-serif}#covers-panel,#feed-panel,#landing-right{position:fixed;top:0;height:100vh;width:220px;border:1px solid #334155}#covers-panel{left:0}#feed-panel{left:440px}#landing-right{right:0}.palette{position:fixed;inset:150px 35px auto;display:grid;grid-template-columns:repeat(9,1fr);gap:24px 8px;text-align:center;z-index:3}.palette svg{display:block;width:70px;height:70px;margin:6px auto}.palette article{background:#111827}</style>
<div id="landing-wrapper"><div id="covers-panel"></div><div id="feed-panel"></div><div id="landing-right"></div></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
const {createSeasonalBackground}=await import('file://${base}/js/seasonal-events/background.js');
const {newYearArtwork}=await import('file://${base}/js/seasonal-events/winter-artwork.js');
const {halloweenArtwork}=await import('file://${base}/js/seasonal-events/artwork.js');
const check=(value,label)=>{if(!value)throw Error(label);},delay=ms=>new Promise(r=>setTimeout(r,ms));
const stop=createSeasonalBackground();await delay(350);
const webs=[...document.querySelectorAll('.seasonal-background__web:not([hidden])')];check(webs.length===2,'two animated corner webs');
check(new Set(webs.map(w=>w.dataset.edge)).size===2,'one top and one bottom web');
check(new Set(webs.map(w=>w.dataset.motion)).size===2,'one climbing and one swinging spider');
const layer=document.querySelector('.seasonal-background');let redraws=0;
const observer=new MutationObserver(records=>redraws+=records.length);observer.observe(layer,{attributes:true,childList:true,subtree:true});
for(const web of webs){
 check(getComputedStyle(web).maskImage==='none','animated spider not clipped by a static mask');
 const anchor=web.querySelector('.seasonal-web__anchor'),spider=web.querySelector('.seasonal-web__spider'),thread=web.querySelector('.seasonal-web__thread');
 check([...spider.querySelectorAll('rect')].every(rect=>getComputedStyle(rect).fillOpacity==='1'),'spider pixels are opaque above the web');
 const animations=[...web.querySelectorAll('*')].flatMap(el=>el.getAnimations());for(const a of animations){a.pause();a.currentTime=0;}
 const origin=new DOMPoint(0,0).matrixTransform(anchor.getScreenCTM()),start=spider.getBoundingClientRect();
 check(start.top>origin.y,'spider hangs below attachment even on flipped web');
 check(thread.getBoundingClientRect().top>=origin.y-1,'thread extends down rather than up like a straw');
 for(const a of animations)a.currentTime=web.dataset.motion==='climb'?4500:4000;
 const end=spider.getBoundingClientRect();
 if(web.dataset.motion==='climb'){
  check(end.top-start.top>12,'climber descends along silk');
  check(Math.abs(thread.getBoundingClientRect().bottom-end.top)<3,'thread follows climbing spider');
 }else check(Math.abs((end.left+end.right-start.left-start.right)/2)>6,'other spider swings side to side');
 check(end.top>=0&&end.bottom<=innerHeight,'spiders remain within viewport');
}
await delay(50);check(redraws===0,'CSS motion does not redraw or reshuffle background');
document.body.classList.add('reduce-motion');await delay(330);
for(const web of webs)for(const el of web.querySelectorAll('*'))check(getComputedStyle(el).animationName==='none','reduced motion stops both spiders');
document.body.classList.remove('reduce-motion');await delay(330);observer.disconnect();
const names=['Clock','Champagne','Champagne flutes','Party hat','Fireworks','Fireworks pair','Disco ball','Rocket','January 1','Balloons','Streamers','Crown','Top hat','Gift','Star wand','Midnight skyline','Lucky horseshoe','Midnight bell','Bow tie','Party cracker','Star','Happy New Year','Shooting star','Celebration cake','Sparkler','Confetti','Hourglass'];
check(newYearArtwork.length===27,'27 New Year sprites');
const palette=document.createElement('section');palette.className='palette';document.body.append(palette);
const halloween=${process.env.SEASONAL_ARTWORK === 'halloween'};
const samples=halloween?halloweenArtwork.filter(a=>a.kind!==4):newYearArtwork;
for(const [index,art]of samples.entries()){
 const tile=document.createElement('article');tile.innerHTML='<svg viewBox="0 0 48 48">'+art.svg+'</svg>';const label=document.createElement('span');label.textContent=halloween?'Halloween '+(index+1):names[index];tile.append(label);palette.append(tile);
 for(const rect of tile.querySelectorAll('rect'))check(rect.getAttribute('fill')!=='undefined'&&Number(rect.getAttribute('x'))+Number(rect.getAttribute('width'))<=48&&Number(rect.getAttribute('y'))+Number(rect.getAttribute('height'))<=48,'valid unclipped sprite pixels');
}
const motionTiles=document.createElement('div');motionTiles.style.cssText='position:fixed;left:-5000px;top:0';document.body.append(motionTiles);
for(const art of halloweenArtwork.filter(a=>a.kind!==4)){
 const tile=document.createElement('div');tile.innerHTML='<svg viewBox="0 0 48 48">'+art.svg+'</svg>';motionTiles.append(tile);
 const elements=[...tile.querySelectorAll('g,rect')],animations=elements.flatMap(el=>el.getAnimations());check(animations.length>0,'each Halloween sprite animates');
 for(const a of animations){a.pause();a.effect.updateTiming({delay:0});a.currentTime=0;}
 const before=JSON.stringify(elements.map(e=>{const s=getComputedStyle(e);return[s.transform,s.opacity,s.fill];}));let changed=false;
 for(const fraction of [.4,.65,.9,.94]){
  for(const a of animations)a.currentTime=Number(a.effect.getTiming().duration)*fraction;
  if(JSON.stringify(elements.map(e=>{const s=getComputedStyle(e);return[s.transform,s.opacity,s.fill];}))!==before)changed=true;
 }check(changed,'Halloween sprite animation '+art.svg.match(/haunt-sprite-[0-9]+/)?.[0]+' '+animations.map(a=>a.animationName+':'+a.effect.getTiming().delay).join(','));
}
motionTiles.remove();
window.stopSeasonalPreview=stop;
document.body.dataset.test=JSON.stringify({webs:2,gravityCorrect:true,opaqueSpiders:true,climbing:true,swinging:true,noRedraws:true,reducedMotion:true,newYearSprites:27,animatedHalloweenSprites:25});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONAL_SCREENSHOT})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

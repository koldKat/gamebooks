// Verify complete creature poses, grounded hands and obstacle-aware spider movement.
const fs=require('node:fs'),path=require('node:path'),checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','seasonal-creatures-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><style>body{margin:0;background:#111827;color:#ddd;font:14px sans-serif}#covers-panel,#feed-panel,#landing-right{position:fixed;top:0;height:100vh;width:220px}#covers-panel{left:0}#feed-panel{left:440px}#landing-right{right:0}.palette{position:fixed;inset:40px;display:grid;grid-template-columns:repeat(5,1fr);gap:24px;text-align:center}.palette svg{display:block;width:100px;height:100px;margin:8px auto}</style><div id="landing-wrapper"><div id="covers-panel"></div><div id="feed-panel"></div><div id="landing-right"></div></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">
const {createSeasonalBackground}=await import('file://${base}/js/seasonal-events/background.js');
const {createSpiderCrawl}=await import('file://${base}/js/seasonal-events/spider-crawl.js');
const {halloweenArtwork}=await import('file://${base}/js/seasonal-events/artwork.js');
const check=(v,label)=>{if(!v)throw Error(label);},delay=ms=>new Promise(r=>setTimeout(r,ms));
Math.random=()=>.42;let stop=createSeasonalBackground({crawlSpiders:false});await delay(350);
const live=[...document.querySelectorAll('.seasonal-background__icon:not([hidden])')];
check(live.length===4&&live.every(n=>['14','15','20','24'].includes(n.dataset.artwork)),'live scene mounts only crawling spiders, cauldron and house');
const cauldron=live.find(n=>n.dataset.artwork==='20'),house=live.find(n=>n.dataset.artwork==='24');
check(Math.abs(cauldron.getBoundingClientRect().bottom-innerHeight)<5&&Math.abs(house.getBoundingClientRect().bottom-innerHeight)<5,'both props sit at the bottom');
check(cauldron.getBoundingClientRect().left<house.getBoundingClientRect().left,'cauldron and house occupy opposite sides');
check(!document.querySelector('.seasonal-background [role="button"],.seasonal-background [tabindex],.seasonal-background [data-interactive]'),'all decorations are noninteractive');stop();
const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,frames=new Map();let serial=0,now=0;
window.requestAnimationFrame=cb=>{frames.set(++serial,cb);return serial;};window.cancelAnimationFrame=id=>frames.delete(id);
const spider=document.createElement('span');spider.className='seasonal-background__icon';spider.dataset.kind='7';spider.style.cssText='position:fixed;left:290px;top:400px;width:40px;height:40px';document.body.append(spider);
const blocker=document.createElement('span');blocker.style.cssText='position:fixed;left:320px;top:520px;width:40px;height:40px';document.body.append(blocker);
const crawl=createSpiderCrawl({nodes:[spider,blocker],getObstacles:()=>[{left:0,right:220,top:0,bottom:900},{left:440,right:1100,top:0,bottom:900}],random:()=>.5});crawl.layout();
let moved=false,turns=new Set();for(let i=0;i<2400;i++){
 now+=100;const calls=[...frames.values()];frames.clear();for(const cb of calls)cb(now);
 const r=spider.getBoundingClientRect();check(r.left>=219&&r.right<=441&&r.top>=0&&r.bottom<=901,'crawling stays clear of panels and screen edges');
 moved ||=Math.abs(r.left-290)>25||Math.abs(r.top-400)>25;turns.add(spider.style.rotate);
}
check(moved&&turns.size>3,'spider travels and changes direction after obstacles');
crawl.visible(false);check(frames.size===0,'hidden scene stops crawling');crawl.visible(true);check(frames.size===1,'visible scene resumes one loop');
document.body.classList.add('reduce-motion');crawl.visible(true);check(frames.size===0,'reduced motion stops crawling');document.body.classList.remove('reduce-motion');crawl.dispose();check(frames.size===0,'crawler cleanup');spider.remove();blocker.remove();window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;
const palette=document.createElement('section');palette.className='palette';document.body.append(palette);
function tile(index,label,phase=0){const node=document.createElement('article');node.innerHTML='<svg viewBox="0 0 48 48">'+halloweenArtwork[index].svg+'</svg><span>'+label+'</span>';palette.append(node);for(const a of node.getAnimations({subtree:true})){a.pause();a.effect.updateTiming({delay:0});a.currentTime=Number(a.effect.getTiming().duration)*phase;}return node;}
const bat=tile(3,'Bat: wings up',0);tile(3,'Bat: midway',.25);tile(3,'Bat: wings down',.5);
const wing=bat.querySelector('.haunt-bat-wing-left'),wingAnimation=wing.getAnimations()[0];
check(!getComputedStyle(wing).animationTimingFunction.includes('steps'),'bat wings interpolate smoothly');
wingAnimation.currentTime=220;const early=getComputedStyle(wing).transform;wingAnimation.currentTime=231;check(getComputedStyle(wing).transform!==early,'bat wings move between neighboring frames');
for(const a of bat.getAnimations({subtree:true}))a.currentTime=0;
for(const [index,phase]of [[0,.25],[7,.75]]){
 const ghost=tile(index,'Ghost: flapping hem',phase),hem=ghost.querySelector('.haunt-part--hem'),body=ghost.querySelector('.haunt-part--body');
 check(hem&&getComputedStyle(hem).animationName==='haunt-ghost-hem'&&!getComputedStyle(hem).animationTimingFunction.includes('steps'),'ghost cloth flaps smoothly');
 check(body.getBoundingClientRect().bottom>hem.getBoundingClientRect().top+2,'flapping cloth overlaps stationary body without a horizontal gap');
}
tile(19,'Mummy: wrapped',.1);const bones=tile(19,'Mummy: unwrapped',.9);check(getComputedStyle(bones.querySelector('.haunt-mummy-bones')).opacity==='1','mummy skeleton is revealed');
check([...bones.querySelectorAll('[class*="haunt-part--wrap"]')].every(p=>getComputedStyle(p).opacity==='0'),'all cloth unwraps');
const potion=tile(17,'Potion: slow color and smoke',.89);check(getComputedStyle(potion.querySelector('.haunt-potion-liquid')).animationDuration==='90s','potion color changes slowly');check(Number(getComputedStyle(potion.querySelector('.haunt-potion-smoke')).opacity)>.1,'potion occasionally puffs smoke');
const skull=tile(5,'Skull: eye flames',.85);check(Number(getComputedStyle(skull.querySelector('.haunt-eye-fire')).opacity)>.6,'flames ignite in sockets');
const pot=tile(20,'Bubbling cauldron',.4);check(pot.querySelectorAll('.haunt-cauldron-bubbles > path').length===3,'three rising cauldron bubbles');
tile(13,'Cat: connected paws and tail',.5);tile(25,'Candle skull: eye flames',.85);
tile(2,'Burnt orange, red glow',.88);tile(9,'Dirty yellow, green glow',.88);
const grave=tile(12,'Grave: glowing cross and crack',.85);check(getComputedStyle(grave.querySelector('.haunt-part--engraving')).color==='rgb(206, 66, 72)','cross and crack glow red');
tile(23,'Scarecrow: wooden stake',.1);tile(26,'Scarecrow: straw and sack face',.1);
const zombie=tile(16,'Zombie: occasional scream',.88);check(Number(getComputedStyle(zombie.querySelector('.haunt-zombie-mouth')).opacity)>.9&&!zombie.querySelector('.haunt-part--jaw'),'zombie opens its mouth without a detached jaw');
for(const [index,art]of halloweenArtwork.entries())if(art.kind!==4&&![0,3].includes(art.kind)){
 const node=document.createElement('div');node.innerHTML='<svg viewBox="0 0 48 48">'+art.svg+'</svg>';document.body.append(node);check(getComputedStyle(node.querySelector('.halloween-animated')).animationName==='none','grounded sprites and heads do not drift');node.remove();
}
document.body.dataset.test=JSON.stringify({restrictedScene:true,bottomProps:true,noClickableZombie:true,preservedCatalog:27,potionSmoke:true,mummyUnwrap:true,eyeFlames:true,smoothWings:true,smoothHems:true,stationaryObjects:true,graveGlow:true,spiderTravel:true,obstacleTurns:true,reducedMotion:true,cleanup:true});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONAL_SCREENSHOT,timeoutMs:30000})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

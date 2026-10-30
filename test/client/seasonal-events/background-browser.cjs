// Screenshot-scale regression for balanced decorations and redraw stability.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'halloween-layout-'));
const base = path.resolve('public');
const file = path.join(root,'check.html');
const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${base}/css/seasonal-events.css">
<style>body{margin:0;background:#101726;color:#ddd;font:16px sans-serif}#covers-panel,#feed-panel,#landing-right{position:fixed;top:0;height:100vh;box-sizing:border-box;padding:20px;border:1px solid #374151;background:#172132}#covers-panel{left:0;width:384px}#feed-panel{left:680px;width:688px}#landing-right{right:0;width:384px}body.covers-collapsed #covers-panel{transform:translateX(-100%)}body.covers-collapsed #feed-panel{left:488px}.card{height:240px;margin-top:18px;border:1px solid #475569;border-radius:8px;background:#243047;padding:15px}h2{font-size:18px}</style>
<div id="landing-wrapper"><div id="covers-panel"><h2>Cover panel</h2><div class="card">Library</div></div><div id="feed-panel"><h2>Gamebook Tracker</h2><div class="seasonal-event-notice"><strong>Halloween event active:</strong> double XP for <span class="seasonal-event-loss">losses</span> and <span class="seasonal-event-battle-death">battle deaths</span>.</div><div class="card">Pinned announcement</div><div class="card">Activity feed</div></div><div id="landing-right"><h2>My Books</h2><div class="card">Progress and collections</div></div></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<style>
[data-artwork="13"],[data-artwork="13"] svg{animation:none!important}#covers-panel,#feed-panel,#landing-right{transition:transform .25s ease,left .25s ease,opacity .2s ease}
body.right-collapsed #landing-right{transform:translateX(100%)}
body.right-collapsed #feed-panel{left:872px}
body.covers-collapsed.right-collapsed #feed-panel{left:680px}
body.feed-collapsed #feed-panel{opacity:0;max-height:0;overflow:hidden}
@media(max-width:1400px){#covers-panel,#landing-right{width:240px}#feed-panel{left:240px;width:calc(100vw - 480px);padding:24px}}
</style>
<script type="module">
let seed=42;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const {createSeasonalBackground}=await import('file://${base}/js/seasonal-events/background.js');
const check=(ok,label)=>{if(!ok)throw Error(label);},delay=ms=>new Promise(r=>setTimeout(r,ms));
const topButton=document.createElement('button');topButton.className='scroll-top-btn';
topButton.style.cssText='position:fixed;bottom:22px;left:50%;width:32px;height:32px;opacity:0';
document.body.append(topButton);
const footer=document.createElement('footer');footer.id='app-footer';footer.textContent='Footer';
footer.style.cssText='width:200px;height:30px;margin:auto';document.getElementById('landing-wrapper').append(footer);
// Intentional crawling is checked separately; this fixture isolates layout redistribution.
const stop=createSeasonalBackground({crawlSpiders:false});await delay(350);
// Use a genuinely scrolling feed and a footer that can move in and out of view.
const landing=document.getElementById('landing-wrapper'),feed=document.getElementById('feed-panel');
landing.style.cssText='height:100vh;overflow:auto;position:relative';
feed.style.position='relative';feed.style.height='2400px';
const tail=document.createElement('div');tail.style.height='1400px';landing.append(tail);
landing.append(footer);
await delay(350);
const visible=()=>[...document.querySelectorAll('.seasonal-background__icon')].filter(icon=>!icon.hidden);
if(innerWidth<1400){
 const small=visible();check(small.length>0,'icons present in tight feed gutters');
 check(small.every(icon=>parseFloat(icon.style.width)<=16),'responsive miniature icons');
 check(small.every(icon=>{const r=icon.getBoundingClientRect();return(r.left>=240&&r.right<=264)||(r.left>=1016&&r.right<=1040);}),'miniatures stay within empty gutters');
 check(small.some(icon=>icon.getBoundingClientRect().left<264)&&small.some(icon=>icon.getBoundingClientRect().left>1016),'both narrow gutters');
 check(!document.querySelector('.seasonal-background__web:not([hidden])'),'tight gutters do not squeeze in large webs');
 document.body.dataset.test=JSON.stringify({narrow:true,icons:small.length,miniatures:true});
}else{
 let icons=visible();check(icons.length===14,'seven static icons per clear gap');check(document.querySelector('.seasonal-background').getAnimations({subtree:true}).length===0,'every background sprite is static');
const webs=[...document.querySelectorAll('.seasonal-background__web')].filter(web=>!web.hidden);
check(webs.length===2,'two anchored corner webs');
check(new Set(webs.map(web=>web.dataset.edge)).size===2,'top and bottom corners');
check(!icons.some(icon=>icon.dataset.kind==='4'),'webs are not floating sprites');
for(const web of webs){const r=web.getBoundingClientRect(),anchor=Number(web.dataset.anchorX);
 check(r.width>=72&&r.width<=128,'smaller corner web size');
 check(Math.abs(r.top)<1||Math.abs(r.bottom-innerHeight)<1,'web attached to screen edge');
 check(Math.abs(r.left-anchor)<1||Math.abs(r.right-anchor)<1,'web attached to panel edge');
 check(web.querySelector('path[fill="#292830"]'),'coloured spider on web');
}
check(new Set(icons.map(icon=>icon.dataset.artwork)).size===icons.length,'distinct artwork, not resized duplicates');
check(['7','14','17'].every(kind=>icons.some(icon=>icon.dataset.kind===kind)),'crawling spiders, house and cauldron appear');
for(const icon of icons.filter(icon=>icon.dataset.pixelated)){
 check(getComputedStyle(icon).transform==='none','static pixel art retains its square grid');
 const pixels=[...icon.querySelectorAll('rect')];check(icon.querySelector('rect,path'),'pixel sprite has compact painted shapes');check([...icon.querySelectorAll('path')].every(p=>p.getAttribute('d')&&!p.outerHTML.includes('undefined')),'valid compact pixel paths');
 check(pixels.every(pixel=>['x','y','width','height'].every(name=>Number(pixel.getAttribute(name))%2===0)&&Number(pixel.getAttribute('x'))+Number(pixel.getAttribute('width'))<=48&&Number(pixel.getAttribute('y'))+Number(pixel.getAttribute('height'))<=48&&pixel.getAttribute('fill')!=='undefined'),'valid unclipped pixel blocks');
}
check(icons.filter(icon=>icon.dataset.kind==='0').every(icon=>Boolean(icon.querySelector('path[fill="#e2dfcc"]'))),'white ghosts');
check(icons.filter(icon=>icon.dataset.kind==='4').every(icon=>icon.querySelector('path[fill="#292830"]')),'colored spiders on white webs');
const rects=icons.map(icon=>icon.getBoundingClientRect());
check(rects.some(r=>r.left<680)&&rects.some(r=>r.left>1368),'both panel gaps');
check(new Set(rects.map(r=>Math.round(r.width))).size>=2,'spiders and bottom props keep suitable sizes');
check(new Set(rects.filter(r=>r.left<680).map(r=>Math.round(r.left))).size>=2,'no left straight line');
check(new Set(rects.filter(r=>r.left>1368).map(r=>Math.round(r.left))).size>=2,'no right straight line');
const layer=document.querySelector('.seasonal-background');let redraws=0;
const observer=new MutationObserver(()=>redraws++);observer.observe(layer,{attributes:true,childList:true,subtree:true});
const original=icons.map(icon=>icon.style.cssText);
const originalWebs=webs.map(web=>web.style.cssText);
for(const top of [landing.scrollHeight,300,1100,0]){
 landing.scrollTop=top;topButton.classList.toggle('visible',top>200);await delay(350);
 check(original.every((style,i)=>icons[i].style.cssText===style),'actual scroll keeps icon positions');
 check(originalWebs.every((style,i)=>webs[i].style.cssText===style),'actual scroll keeps anchored webs fixed');
}
landing.scrollTop=landing.scrollHeight;topButton.classList.add('visible');await delay(350);
check(feed.getBoundingClientRect().bottom<=0,'End scroll puts the feed itself out of view');
check(visible().every(icon=>{const r=icon.getBoundingClientRect();return r.right<=680||r.left>=1368;}),'offscreen feed column stays protected');
landing.scrollTop=0;topButton.classList.remove('visible');await delay(350);
document.body.classList.add('unrelated-refresh');await delay(300);
check(redraws===0,'no redraw on scroll or unrelated class updates');
check(original.every((style,i)=>icons[i].style.cssText===style),'stable positions and sizes');observer.disconnect();
document.body.classList.add('covers-collapsed');await delay(300);
await delay(350);icons=visible();check(icons.some(icon=>icon.getBoundingClientRect().left<320)&&icons.some(icon=>icon.getBoundingClientRect().left>1176),'fills newly opened left space');
document.body.classList.remove('covers-collapsed');await delay(650);
check(original.every((style,i)=>icons[i].style.cssText===style),'restoring the same layout restores exact positions');
check(originalWebs.every((style,i)=>webs[i].style.cssText===style),'restoring layout restores exact web corners');
document.body.classList.add('right-collapsed');await delay(650);
check(visible().some(icon=>icon.getBoundingClientRect().right>1700),'fills newly opened right space');
document.body.classList.remove('right-collapsed');await delay(650);
document.body.classList.add('feed-collapsed');await delay(650);
check(visible().some(icon=>{const r=icon.getBoundingClientRect();return r.left>680&&r.right<1368;}),'fills hidden feed space');
document.body.classList.add('right-collapsed','feed-collapsed');await delay(220);
document.body.classList.add('covers-collapsed');await delay(220);
check(getComputedStyle(layer).display==='none','all panels hidden removes icons');
document.body.classList.remove('covers-collapsed','right-collapsed','feed-collapsed');await delay(350);
check(getComputedStyle(layer).display!=='none'&&visible().length===14,'restores static sprites with panels');
document.body.dataset.test=JSON.stringify({density:visible().length,bothSides:true,variedSizes:true,randomPositions:true,noScrollRedraws:true,endScroll:true,repeatLayoutStable:true,collapse:true,anchoredWebs:2,smallerWebs:true});
}
</script>`;
(async()=>{try{fs.writeFileSync(file,html);for(const width of [2048,1280]){const result=await checkBrowser({file,root,profile:path.join(root,'profile-'+width),width,chromium:process.env.CHROMIUM,timeoutMs:12000,screenshotPath:width===Number(process.env.SEASONAL_SCREENSHOT_WIDTH||1280)?process.env.SEASONAL_SCREENSHOT:undefined});console.log(JSON.stringify({width,...result}));}}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

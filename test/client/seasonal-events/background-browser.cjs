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
#covers-panel,#feed-panel,#landing-right{transition:transform .25s ease,left .25s ease,opacity .2s ease}
body.right-collapsed #landing-right{transform:translateX(100%)}
body.right-collapsed #feed-panel{left:872px}
body.covers-collapsed.right-collapsed #feed-panel{left:680px}
body.feed-collapsed #feed-panel{opacity:0;max-height:0;overflow:hidden}
@media(max-width:1400px){#covers-panel,#landing-right{width:240px}#feed-panel{left:240px;width:calc(100vw - 480px);padding:24px}}
</style>
<script type="module">
let seed=42;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const {createHalloweenBackground}=await import('file://${base}/js/seasonal-events/background.js');
const check=(ok,label)=>{if(!ok)throw Error(label);},delay=ms=>new Promise(r=>setTimeout(r,ms));
const stop=createHalloweenBackground();await delay(350);
const visible=()=>[...document.querySelectorAll('.seasonal-background__icon')].filter(icon=>!icon.hidden);
if(innerWidth<1400){
 const small=visible();check(small.length>0,'icons present in tight feed gutters');
 check(small.every(icon=>parseFloat(icon.style.width)<=16),'responsive miniature icons');
 check(small.every(icon=>{const r=icon.getBoundingClientRect();return(r.left>=240&&r.right<=264)||(r.left>=1016&&r.right<=1040);}),'miniatures stay within empty gutters');
 check(small.some(icon=>icon.getBoundingClientRect().left<264)&&small.some(icon=>icon.getBoundingClientRect().left>1016),'both narrow gutters');
 document.body.dataset.test=JSON.stringify({narrow:true,icons:small.length,miniatures:true});
}else{
let icons=visible();check(icons.length>=7&&icons.length<=12,'event decoration density');
check(new Set(icons.map(icon=>icon.dataset.artwork)).size===icons.length,'distinct artwork, not resized duplicates');
check(icons.filter(icon=>icon.dataset.kind==='0').every(icon=>getComputedStyle(icon).color==='rgb(255, 255, 255)'),'white ghosts');
check(icons.filter(icon=>icon.dataset.kind==='4').every(icon=>getComputedStyle(icon.querySelector('ellipse')).fill!=='rgb(255, 255, 255)'),'colored spiders on white webs');
const rects=icons.map(icon=>icon.getBoundingClientRect());
check(rects.some(r=>r.left<680)&&rects.some(r=>r.left>1368),'both panel gaps');
check(new Set(rects.map(r=>Math.round(r.width))).size>=5,'obvious size variety');
check(new Set(rects.filter(r=>r.left<680).map(r=>Math.round(r.left))).size>=2,'no left straight line');
check(new Set(rects.filter(r=>r.left>1368).map(r=>Math.round(r.left))).size>=2,'no right straight line');
const layer=document.querySelector('.seasonal-background');let redraws=0;
const observer=new MutationObserver(()=>redraws++);observer.observe(layer,{attributes:true,childList:true,subtree:true});
const original=icons.map(icon=>icon.style.cssText);
for(let i=0;i<30;i++)document.getElementById('landing-wrapper').dispatchEvent(new Event('scroll'));
document.body.classList.add('unrelated-refresh');await delay(300);
check(redraws===0,'no redraw on scroll or unrelated class updates');
check(original.every((style,i)=>icons[i].style.cssText===style),'stable positions and sizes');observer.disconnect();
document.body.classList.add('covers-collapsed');await delay(300);
await delay(350);icons=visible();check(icons.some(icon=>icon.getBoundingClientRect().left<320)&&icons.some(icon=>icon.getBoundingClientRect().left>1176),'fills newly opened left space');
document.body.classList.remove('covers-collapsed');await delay(650);
document.body.classList.add('right-collapsed');await delay(650);
check(visible().some(icon=>icon.getBoundingClientRect().right>1700),'fills newly opened right space');
document.body.classList.remove('right-collapsed');await delay(650);
document.body.classList.add('feed-collapsed');await delay(650);
check(visible().some(icon=>{const r=icon.getBoundingClientRect();return r.left>680&&r.right<1368;}),'fills hidden feed space');
document.body.classList.add('right-collapsed','feed-collapsed');await delay(220);
document.body.classList.add('covers-collapsed');await delay(220);
check(getComputedStyle(layer).display==='none','all panels hidden removes icons');
document.body.classList.remove('covers-collapsed','right-collapsed','feed-collapsed');await delay(350);
check(getComputedStyle(layer).display!=='none'&&visible().length>=7,'restores with panels');
document.body.dataset.test=JSON.stringify({density:visible().length,bothSides:true,variedSizes:true,randomPositions:true,noScrollRedraws:true,collapse:true});
}
</script>`;
(async()=>{try{fs.writeFileSync(file,html);for(const width of [2048,1280]){const result=await checkBrowser({file,root,profile:path.join(root,'profile-'+width),width,chromium:process.env.CHROMIUM,timeoutMs:12000,screenshotPath:width===1280?process.env.SEASONAL_SCREENSHOT:undefined});console.log(JSON.stringify({width,...result}));}}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

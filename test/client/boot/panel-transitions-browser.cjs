// Verify real panel geometry and scroll restoration throughout collapse animations.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'panel-transitions-'));
const styles = ['base/forms', 'base/app', 'components/feed', 'layouts/landing', 'base/reduce-motion', 'layouts/responsive'];
const html = `<!doctype html><html><head>${styles.map(name => `<link rel="stylesheet" href="/css/${name}.css">`).join('')}</head><body>
<div id="covers-panel" class="active"></div>
<button id="covers-toggle" class="panel-toggle visible">‹</button>
<button id="right-toggle" class="panel-toggle visible">›</button>
<button id="feed-toggle" class="panel-toggle visible">▴</button>
<div id="landing-wrapper" style="display:flex"><div id="feed-panel">${'<p style="height:80px">Feed entry</p>'.repeat(50)}</div><div id="landing-right"></div></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
import {_setLandingPanelCollapsed,_toggleAllLandingPanelsCollapsed} from '/js/ui-helpers/prefs.js';
const check=(value,label)=>{if(!value)throw Error(label);};
const rect=id=>document.getElementById(id).getBoundingClientRect();
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const animate=async action=>{
 action(); const start=performance.now();let frames=0;
 do {
  await frame();frames++;
  check(Math.abs(rect('covers-toggle').left-rect('covers-panel').right)<2,'Left button follows panel during transition');
  check(Math.abs(rect('right-toggle').right-rect('landing-right').left)<2,'Right button follows panel during transition');
  check(Math.abs(rect('feed-panel').top+document.getElementById('landing-wrapper').scrollTop)<1,'Feed never translates vertically while toggling');
 } while(performance.now()-start<300);
 return frames;
};
await frame();await frame();let frames=0;
for(const key of ['covers-collapsed','right-collapsed']){
 frames+=await animate(()=>_setLandingPanelCollapsed(key,true));
 frames+=await animate(()=>_setLandingPanelCollapsed(key,false));
}
const wrapper=document.getElementById('landing-wrapper');wrapper.scrollTop=350;
const original=wrapper.scrollTop;
frames+=await animate(()=>_toggleAllLandingPanelsCollapsed());
check(wrapper.scrollTop===0,'Collapsed feed releases its scrolling area');
_toggleAllLandingPanelsCollapsed();
check(wrapper.scrollTop===original,'Ctrl+X restores scroll before the first visible frame');
frames+=await animate(()=>{});
document.body.classList.add('reduce-motion');
frames+=await animate(()=>_toggleAllLandingPanelsCollapsed());
_toggleAllLandingPanelsCollapsed();
check(wrapper.scrollTop===original,'Reduced-motion setting also preserves feed position');
document.body.dataset.test=JSON.stringify({width:innerWidth,frames,sideControlsSynchronized:true,feedScrollRestoredBeforePaint:true});
</script></body></html>`;
const stubs = {
  '/js/core/state.js': 'export const getToken=()=>null,getUsername=()=>"",apiFetch=async()=>({ok:true});',
  '/js/play.js': 'export const setTrailCollapsed=()=>{},setChoicesRecordedCount=()=>{},CHOICES_PULSE_THRESHOLD=5;',
  '/js/covers.js': 'export const setCoversPrefsState=()=>{},_updateLandingBgDragUi=()=>{};',
  '/js/books.js': 'export const setExpandedPrefs=()=>{},renderBooksList=()=>{},getCachedBooks=()=>[],getCachedAllSeries=()=>[],getCachedStashes=()=>[];',
};
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  if(stubs[pathname]){res.setHeader('Content-Type','text/javascript');return res.end(stubs[pathname]);}
  const file=path.resolve('public','.'+pathname);
  if(!file.startsWith(path.resolve('public')+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
});
(async()=>{
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    for(const width of [1100,1366,1920])console.log(JSON.stringify(await browser({url:'http://127.0.0.1:'+server.address().port,root,width,profile:path.join(scratch,'profile-'+width),chromium:process.env.CHROMIUM})));
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(scratch,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

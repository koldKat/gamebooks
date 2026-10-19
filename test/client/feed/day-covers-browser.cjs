const fs = require('node:fs'), path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'feed-cover-viewport-'));
const repo = process.cwd();
const script = `
import {replaceDayCoverLists,_applyDayCoverFlows,refreshDayCoverFlows} from 'file://${repo}/public/js/feed/day-covers.js';
const check=(value,label)=>{if(!value)throw Error(label);};
try {
 let loads=0;
 window.Image=class {constructor(){loads++;this.naturalWidth=200;this.naturalHeight=300;}set src(value){queueMicrotask(()=>this.onload?.());}};
 const wrapper=document.getElementById('landing-wrapper'),feed=document.getElementById('feed-content');
 feed.innerHTML=Array.from({length:20},(_,i)=>'<div class="feed-day-card" data-day-index="'+i+'"><div class="feed-day-cover-stack"></div><div class="feed-day-content">Day '+i+'</div></div>').join('');
 replaceDayCoverLists(Array.from({length:20},(_,i)=>['/fixture-cover-'+i+'.png']));
 await _applyDayCoverFlows(feed);
 check(loads>0&&loads<6,'only nearby days load covers');
 const initialLoads=loads;
 check(feed.lastElementChild.querySelector('.feed-day-cover-stack').childElementCount===0,'far-offscreen days have no tiles');
 wrapper.scrollTop=4000;
 await new Promise(resolve=>setTimeout(resolve,550));
 check(loads>initialLoads&&loads<12,'scroll loads newly visible days only');
 check(feed.firstElementChild.querySelector('.feed-day-cover-stack').childElementCount===0,'scroll releases old offscreen tiles');
 const scrolledLoads=loads;
 bodyClass('no-feed-day-covers',true);refreshDayCoverFlows();
 await new Promise(resolve=>setTimeout(resolve,550));
 check(!feed.querySelector('.feed-day-cover-tile'),'disabling backgrounds releases every tile');
 bodyClass('no-feed-day-covers',false);refreshDayCoverFlows();
 await new Promise(resolve=>setTimeout(resolve,550));
 check(feed.querySelector('.feed-day-cover-tile'),'reenabling restores visible backgrounds');
 check(loads===scrolledLoads,'restoring already-known cover sizes does not decode them again');
 bodyClass('feed-collapsed',true);refreshDayCoverFlows();
 await new Promise(resolve=>setTimeout(resolve,550));
 check(!feed.querySelector('.feed-day-cover-tile'),'collapsing feed releases every tile');
 bodyClass('feed-collapsed',false);refreshDayCoverFlows();
 await new Promise(resolve=>setTimeout(resolve,550));
 check(feed.querySelector('.feed-day-cover-tile'),'expanding restores visible backgrounds');
 document.body.dataset.test=JSON.stringify({width:innerWidth,totalDays:20,initialMetadataLoads:initialLoads,metadataLoadsAfterScroll:loads,offscreenAndHiddenTilesReleased:true});
}catch(error){document.body.dataset.failure=error.stack;}
function bodyClass(name,on){document.body.classList.toggle(name,on);}
`;
(async () => {
  try {
    const file = path.join(scratch, 'viewport.html');
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>#landing-wrapper{height:700px;overflow:auto}.feed-day-card{height:400px;width:300px;position:relative;margin-bottom:10px}.feed-day-cover-stack{position:absolute;inset:0}</style><body><div id="landing-wrapper"><div id="feed-content"></div></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message)</script><script type="module">${script}</script>`);
    for (const width of [390, 1100]) console.log(JSON.stringify(await browser({ file, root, width, profile: path.join(scratch, 'profile-' + width), chromium: process.env.CHROMIUM })));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

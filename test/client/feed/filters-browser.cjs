const fs = require('node:fs');
const path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');

const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const repo = process.cwd();
const scratch = fs.mkdtempSync(path.join(root, 'feed-filters-'));
const loader = fs.readFileSync('public/js/feed/loader.js', 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const script = `
import {renderFeedContents} from 'file://${repo}/public/js/feed/render.js';
import {updateFeedContents} from 'file://${repo}/public/js/feed/update.js';
import {FEED_FILTERS,filterFeedEntries,feedHeaderHtml,bindFeedFilters} from 'file://${repo}/public/js/feed/filters.js';
import {t} from 'file://${repo}/public/js/i18n.js';
const check=(ok,label)=>{if(!ok)throw Error(label);};
let token='admin',admin=false,moderator=false,requests=0;
const getToken=()=>token;
const _hooks={getIsAdmin:()=>admin,getIsModerator:()=>moderator};
const replaceDayCoverLists=()=>{},_applyDayCoverFlows=()=>{},_hideFeedPreview=()=>{};
const bindFeedInteractions=()=>{},bindFeedPreviews=()=>{};
const base={username:'Player',bookId:1,bookName:'Book',completedAt:Date.now()};
const payload={entries:[{...base,type:'book_created'},{...base,type:'run_started'},{...base,type:'level_up',level:2}],pinned:{title:'News',body:'Pinned announcement'}};
const apiFetch=async()=>{requests++;return{ok:true,json:async()=>payload};};
${loader}
try{
 await loadFeed();
 check(document.querySelectorAll('[data-feed-filter]').length===7,'ordinary players have filters');
 admin=true;refreshFeedFilters();
 await document.fonts.ready;
 const buttons=()=>[...document.querySelectorAll('[data-feed-filter]')];
 check(buttons().length===7,'seven admin controls');
 check(buttons().every(b=>b.getAttribute('aria-pressed')==='true'),'all initially selected');
 const count=requests;
 document.querySelector('[data-feed-filter="catalog"]').click();
 check(requests===count,'filtering performs no fetch');
 check(document.querySelector('[data-feed-filter="catalog"]').getAttribute('aria-pressed')==='false','catalog disabled');
 check(document.activeElement.dataset.feedFilter==='catalog','focus retained after header update');
 check(document.querySelectorAll('.feed-entry').length===2,'only runs and milestone remain');
 await loadFeed();
 check(document.querySelector('[data-feed-filter="catalog"]').getAttribute('aria-pressed')==='false','SSE refresh preserves selection');
 for(const key of FEED_FILTERS.filter(key=>key!=='catalog'))document.querySelector('[data-feed-filter="'+key+'"]').click();
 check(!document.querySelector('.feed-day-card,.feed-pinned-card'),'all categories off hides all activity and pinned news');
 check(document.querySelector('.feed-empty').textContent===t('feed.filter.empty'),'filtered empty state');
 for(const key of FEED_FILTERS)document.querySelector('[data-feed-filter="'+key+'"]').click();
 check(document.querySelectorAll('.feed-entry').length===3,'all categories restored');
 const header=document.getElementById('feed-header'),heading=header.querySelector('.feed-header-label'),group=header.querySelector('.feed-filters');
 check((getComputedStyle(heading).display==='none')===(innerWidth<=768),'activity heading hidden only on mobile');
 check(getComputedStyle(group).display!=='none','mobile retains feed filters');
 const fallback=document.createElement('div');fallback.id='feed-header';fallback.textContent='Activity (last 30 days)';document.body.append(fallback);
 check((getComputedStyle(fallback).display==='none')===(innerWidth<=768),'fallback activity heading hidden only on mobile');fallback.remove();
 check(header.scrollWidth<=header.clientWidth+1,'header does not overflow');
 check(document.documentElement.scrollWidth<=innerWidth+1,'page does not overflow');
 for(const b of buttons()){
  const r=b.getBoundingClientRect();
  check(r.left>=0&&r.right<=innerWidth,'filter remains within viewport');
  check(getComputedStyle(b).backgroundColor!=='rgba(0, 0, 0, 0)','themed filter background');
 }
 if(header.clientWidth>=650){
  const h=heading.getBoundingClientRect(),g=group.getBoundingClientRect();
  check(Math.abs((h.top+h.bottom)/2-(g.top+g.bottom)/2)<2,'desktop header shares one row');
  check(Math.abs(g.right-header.getBoundingClientRect().right)<2,'filters align right');
 }
 admin=false;refreshFeedFilters();check(buttons().length===7,'ordinary players retain controls');
 moderator=true;refreshFeedFilters();check(buttons().length===7,'lorekeeper controls available');
 document.querySelector('[data-feed-filter="runs"]').click();
 check(document.querySelectorAll('.feed-entry').length===2,'lorekeeper can filter runs');
 moderator=false;refreshFeedFilters();check(buttons().length===7,'role changes retain controls');
 token=null;_hooks.publicFetch=apiFetch;await loadFeed();
 check(buttons().every(b=>b.getAttribute('aria-pressed')==='true'),'guest filters reset after logout');
 document.querySelector('[data-feed-filter="runs"]').click();
 check(document.querySelectorAll('.feed-entry').length===2,'guest can filter runs');
 admin=true;token='other-admin';await loadFeed();
 check(buttons().every(b=>b.getAttribute('aria-pressed')==='true'),'account switch resets filters');
 document.body.dataset.test=JSON.stringify({width:innerWidth,checks:'all players and guests, local toggles, focus, live refresh, empty state, responsive header'});
}catch(error){document.body.dataset.failure=error.stack;}
`;

(async () => {
  try {
    const css = ['style', 'landing', 'feed', 'mobile'].map(name => `<link rel="stylesheet" href="file://${repo}/public/css/${name}.css">`).join('');
    const file = path.join(scratch, 'filters.html');
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<body><div id="landing-wrapper"><div id="feed-panel"><div id="feed-content"></div></div></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message)</script><script type="module">${script}</script>`);
    for (const width of [320, 390, 1100, 1920]) {
      console.log(JSON.stringify(await browser({ file, root, width, profile: path.join(scratch, 'profile-' + width), chromium: process.env.CHROMIUM })));
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

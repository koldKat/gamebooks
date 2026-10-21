const fs = require('node:fs');
const path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'series-move-'));
const repo = process.cwd();
const script = `
import {renderBooksList} from 'file://${repo}/public/js/books/render.js';
import {_refreshBooksListOnly,_applySavedBookResponse} from 'file://${repo}/public/js/books/data.js';
import {booksState} from 'file://${repo}/public/js/books/state.js';
import {coversState} from 'file://${repo}/public/js/covers/state.js';
import {renderCoverActivity} from 'file://${repo}/public/js/covers/book-dialog.js';
const check=(value,label)=>{if(!value)throw Error(label);};
try {
 localStorage.setItem('gamebook_auth_token','fixture-only');
 let rows,edit,meta,checks=0,libraryRequests=0;
 const series=[{id:1,name:'Old series',is_owner:true},{id:2,name:'New series',is_owner:true},{id:3,name:'Unrelated series',is_owner:true}];
 window.fetch=async (url,options={})=>{
  let result=[];
  if(options.method==='PATCH') {
   const saved=JSON.parse(options.body);
   rows=rows.map(b=>b.id===42?{...b,...saved,series_id:saved.series_name==='New series'?2:null}:b);
   meta={...meta,seriesId:rows[0].series_id,seriesName:saved.series_name,ownSeriesName:saved.series_name};
   result={ok:true,book:rows[0],series:series.find(s=>s.id===rows[0].series_id)};
  }else if(url.startsWith('/api/books?')) {libraryRequests++;result=structuredClone(rows);}
  else if(url.startsWith('/api/series?')) result=series;
  else if(url==='/api/public/book/42/activity') result={book:meta,entries:[]};
  else if(url==='/api/books/42/state') result={graph:{}};
  else if(url==='/api/books/42/rating') result={rating:null};
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 booksState._currentUserId=1;
 booksState.renderBooksList=renderBooksList;
 booksState._hooks={openEditBookModal:options=>edit=options,openEditCompModal:options=>edit=options};
 coversState._hooks={getIsAdmin:()=>true,refreshBooksListOnly:_refreshBooksListOnly,applySavedBookResponse:_applySavedBookResponse,...booksState._hooks};
 coversState.renderCoverActivity=renderCoverActivity;
 for(const expanded of [false,true]) for(const anthology of [false,true]) for(const viaInfo of [false,true]) {
  rows=[{id:42,name:'Moved item',total_sections:100,is_public:0,created_by:1,is_container:anthology?1:0,series_id:1,series_name:'Old series'}];
  if(anthology) rows.push({id:43,name:'Child',total_sections:100,parent_book_id:42,is_public:0,created_by:1});
  rows.push({id:99,name:'Untouched book',total_sections:100,series_id:3,is_public:0,created_by:1});
  meta={name:'Moved item',totalSections:100,isContainer:anthology,isPublic:false,seriesId:1,seriesName:'Old series',ownSeriesName:'Old series'};
  for(const id of [1,2]) localStorage.setItem('sr_expanded_'+id,expanded?'1':'0');
  localStorage.setItem('bk_expanded_42','1');
  booksState._booksListFingerprint=null;
  booksState._seriesExpandedPrefs={};
  booksState._bookExpandedPrefs={};
  renderBooksList(structuredClone(rows),series,[]);
  const untouched=document.querySelector('.series-header-row[data-series-id="3"]');
  const untouchedBody=untouched.nextElementSibling;
  untouched.click();
  if(viaInfo) {renderCoverActivity(42,'Moved item',[],null,meta,true,true);document.querySelector('.catalog-admin-edit-btn').click();}
  else {
   if(!expanded) document.querySelector('.series-header-row[data-series-id="1"]').click();
   document.querySelector('.book-edit-btn[data-id="42"]').click();
   for(let n=0;!edit&&n<50;n++) await new Promise(resolve=>setTimeout(resolve,10));
  }
  check(edit,'edit callback opened');
  if(anthology) await edit.onSave('Moved item','','','',null,null,null,false,'New series','');
  else await edit.onSave('Moved item',100,'','','',null,null,null,null,false,'New series','',false,null,null,100);
  const source=document.querySelector('.series-books-group[data-series-id="1"]');
  check(!source.querySelector('.book-item'),'source group no longer contains the moved item');
  const destination=document.querySelector('.series-books-group[data-series-id="2"]');
  if(destination.dataset.lazyGroup) document.querySelector('.series-header-row[data-series-id="2"]').click();
  check(destination.querySelector('.book-edit-btn[data-id="42"]'),'destination contains moved item without reloading');
  if(anthology) check(destination.querySelector('.book-edit-btn[data-id="43"]'),'anthology children move with it');
  check(booksState._cachedBooks[0].series_id===2,'cache has saved membership');
  check(document.querySelector('.series-header-row[data-series-id="3"]')===untouched&&untouched.nextElementSibling===untouchedBody,'unrelated group DOM is preserved');
  check(libraryRequests===0,'saving never fetches the full library');
  if(viaInfo) check(document.querySelector('.book-modal-series-btn')?.textContent==='New series','open info dialog has saved series');
  edit=null;checks++;
 }
 // A newly created group keeps its collapsed state when assigned to a stash,
 // including a closed destination whose contents are built only after opening.
 for(const anthology of [false,true]) for(const closedStash of [false,true]) {
  document.getElementById('books-list').replaceChildren();
  booksState._cachedStashes=null;
  booksState._seriesExpandedPrefs={}; booksState._bookExpandedPrefs={}; booksState._stashExpandedPrefs={};
  localStorage.setItem('sr_expanded_700','1');localStorage.setItem('bk_expanded_700','1');
  localStorage.setItem('stash_expanded_70',closedStash?'0':'1');
  const newSeries=anthology?[]:[{id:700,name:'New series',is_owner:true}];
  rows=anthology?[{id:700,name:'New anthology',is_container:1,created_by:1},{id:701,name:'Child',parent_book_id:700,total_sections:100,created_by:1}]
   :[{id:701,name:'Series book',series_id:700,total_sections:100,created_by:1}];
  renderBooksList(structuredClone(rows),newSeries,[]);
  const selector=anthology?'[data-container-id="700"]':'.series-header-row[data-series-id="700"]';
  document.querySelector(selector).click();
  check(document.querySelector(selector).dataset.expanded==='0','new group starts collapsed before moving');
  const stashes=[{id:70,name:'Destination',bookIds:anthology?[700]:[],seriesIds:anthology?[]:[700]}];
  renderBooksList(structuredClone(rows),newSeries,stashes);
  if(closedStash) document.querySelector('.stash-header-row[data-stash-id="70"]').click();
  const moved=document.querySelector(selector);
  check(moved?.dataset.expanded==='0','moved group stays collapsed inside stash');
  check(moved.nextElementSibling.style.display==='none','moved child body remains hidden');
  check(moved.nextElementSibling.children.length===0,'collapsed destination children remain lazy');
  moved.click();
  check(moved.dataset.expanded==='1'&&moved.nextElementSibling.querySelector('.book-item'),'moved group still expands normally');
  moved.click();
  renderBooksList(structuredClone(rows),newSeries,[]);
  check(document.querySelector(selector)?.dataset.expanded==='0','moving out also preserves collapse');
  checks++;
 }
 const big={id:500,name:'Large anthology',is_container:1,is_public:0,created_by:1};
 rows=[big,...Array.from({length:250},(_,i)=>({id:1000+i,name:'Large child '+i,total_sections:100,parent_book_id:500,is_public:0,created_by:1})),{id:99,name:'Untouched book',total_sections:100,series_id:3,is_public:0,created_by:1}];
 localStorage.setItem('bk_expanded_500','0');
 renderBooksList(structuredClone(rows),series,[]);
 const bigRow=document.querySelector('[data-container-id="500"]');
 const bigGroup=bigRow.nextElementSibling;
 bigRow.click();
 await _applySavedBookResponse({json:async()=>({book:{id:99,name:'Edited other book'},series:series[2]})});
 check(document.querySelector('[data-container-id="500"]')===bigRow,'active lazy materialization survives an unrelated save');
 for(let n=0;bigGroup.querySelectorAll('.book-item--child').length<250&&n<100;n++)await new Promise(resolve=>setTimeout(resolve,20));
 check(bigGroup.querySelectorAll('.book-item--child').length===250,'chunked group finishes after cache update');
 bigRow.click();check(bigGroup.children.length===0&&bigGroup.dataset.lazyGroup,'large collapsed group reclaims DOM');
 bigRow.click();
 for(let n=0;bigGroup.querySelectorAll('.book-item--child').length<250&&n<100;n++)await new Promise(resolve=>setTimeout(resolve,20));
 check(bigGroup.querySelectorAll('.book-item--child').length===250,'reclaimed group uses current stable builder');
 check(!document.getElementById('books-list').textContent.includes('=>'),'no lazy source text leaks into DOM');
 document.body.dataset.test=JSON.stringify({width:innerWidth,checks});
}catch(error){document.body.dataset.failure=error.stack;}
`;
(async () => {
  try {
    const file = path.join(scratch, 'move.html');
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><body><div id="books-list"></div><div id="public-modal-overlay"><div id="public-modal"><button id="pub-back-btn"></button><div id="pub-modal-title"></div><div id="pub-modal-body"></div></div></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message)</script><script type="module">${script}</script>`);
    for (const width of [390, 1100]) console.log(JSON.stringify(await browser({ file, root, width, profile: path.join(scratch, 'profile-' + width), chromium: process.env.CHROMIUM })));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

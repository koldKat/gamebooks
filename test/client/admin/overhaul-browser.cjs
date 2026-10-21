'use strict';
// Functional checks use the real admin HTML/modules/CSS and isolated API fixtures.
const fs = require('node:fs'), path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const repo = path.resolve(__dirname,'../../..');
const root = process.env.TMPDIR;
if (!root) throw Error('Set TMPDIR to the approved scratch directory');
const scratch = fs.mkdtempSync(path.join(root,'admin-overhaul-'));
const fixture = String.raw`
const check = (value,label) => { if (!value) throw Error(label); };
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
const calls=[], errors=[];
window.addEventListener('error',event=>errors.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const books = Array.from({length:3048},(_,i)=>({id:i+1,name:'Book '+(i+1),total_sections:100,created_by:1,updated_at:i+1,mapped:1,discovered:2,playthroughs:1,wins:0,deaths:0,battles:0}));
const user = {id:1,username:'Administrator',created_at:1,session_count:1,xp:1000,level:1,is_admin:1,shopPurchases:[]};
const users=Array.from({length:123},(_,i)=>({...user,id:i+1,username:'Player '+(i+1),last_active:100+i,book_count:3048,days_inactive:0}));
const series=Array.from({length:123},(_,i)=>({id:i+1,name:'Series '+(i+1),created_by_username:'Player',book_count:3,is_public:1,is_open_world:1,created_at:1}));
const announcements=Array.from({length:66},(_,i)=>({id:i+1,title:'Notice '+(i+1),body:'{color:teal}Message{/color}',is_draft:i<13?1:0,pinned:i===13?1:0,created_at:i+1,published_at:i+1}));
const tips=Array.from({length:123},(_,i)=>({id:i+1,text:'Tip '+(i+1),type:'real',active:1}));
const threads=Array.from({length:51},(_,i)=>({id:i+1,username:'Reader '+(i+1),admin_unread:1,created_at:1,messages:[{body:'Hello '+(i+1),sender:'user',created_at:1}]}));
const mutations=[];
window.fetch=async (url,options={})=>{
  const u=new URL(url,location.href), p=u.pathname,q=u.searchParams;
  calls.push(p+u.search);
  if(options.method && options.method!=='GET'){
    mutations.push({p,method:options.method,body:options.body?JSON.parse(options.body):null});
    return new Response('{}',{headers:{'Content-Type':'application/json'}});
  }
  let data;
  if(p==='/api/admin/users')data=users;
  else if(p==='/api/admin/books')data=books;
  else if(p==='/api/admin/users/1'){
    if(q.get('metadata')==='1') data={user};
    else {
      const query=(q.get('query')||'').toLowerCase();
      if(query==='book 2')await wait(150);
      const sort=q.get('sort'),dir=q.get('dir')==='asc'?1:-1;
      const rows=books.filter(b=>b.name.toLowerCase().includes(query)).sort((a,b)=>(typeof a[sort]==='string'?a[sort].localeCompare(b[sort],undefined,{numeric:true}):a[sort]-b[sort])*dir);
      const page=Math.min(+q.get('page')||0,Math.max(0,Math.ceil(rows.length/50)-1));
      data={user,books:rows.slice(page*50,(page+1)*50),bookCount:3048,createdCount:3048,totals:{runs:1,wins:0,deaths:0,battles:0},pagination:{page,pageSize:50,total:rows.length}};
    }
  }
  else if(/^\/api\/admin\/books\/\d+\/stats$/.test(p))data={...books[0],authors:'Writer',is_public:0,is_container:0,created_at:1,playthroughs:Array.from({length:123},(_,i)=>({index:i+1,username:'Reader '+i,owner_id:1,pathLength:1,lastSection:1,lastActionAt:i,completed:false})),totalPts:123,inProgress:123};
  else if(p.endsWith('/ratings'))data=[];
  else if(p==='/api/admin/series/all'||p==='/api/admin/series')data=series;
  else if(p==='/api/admin/anthologies')data=series.map(s=>({...s,child_count:3,is_container:1}));
  else if(p==='/api/admin/tips')data=tips;
  else if(p==='/api/admin/items')data=tips.map(t=>({...t,name:t.text,type:'weapon',svg_data:'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>'}));
  else if(p==='/api/admin/announcements')data=announcements;
  else if(p==='/api/admin/feedback'){
    const rows=threads.filter(t=>t.username.toLowerCase().includes((q.get('query')||'').toLowerCase()));
    const page=Math.min(+q.get('page')||0,Math.max(0,Math.ceil(rows.length/20)-1));
    data={threads:rows.slice(page*20,page*20+20),unread:51,pagination:{page,pageSize:20,total:rows.length}};
  }
  else if(p==='/api/admin/stats')data={users:123,feedbackUnread:51};
  else if(p==='/api/admin/gc-supply')data={earned:100,available:100};
  else if(p==='/api/admin/live')data={cpuPct:1,heapUsed:100,heapTotal:200,rss:300};
  else if(p==='/api/admin/appsize')data={bytes:1000};
  else if(p==='/api/admin/settings')data={app_version:'1.1.0.0'};
  else if(p==='/api/admin/xp-config')data={config:[{event:'heartbeat',amount:1}]};
  else if(p==='/api/admin/backups')data=[];
  else throw Error('Unstubbed API '+p);
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
try {
  await import(BASE+'/admin/js/boot.js');await wait(40);
  const core=await import(BASE+'/admin/js/core.js');
  const views=await import(BASE+'/admin/js/users-books.js');
  const tab=async name=>{document.querySelector('[data-tab="'+name+'"]').click();await wait(35);};
  const search=async (id,value)=>{const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));await wait(260);};
  check(document.querySelectorAll('#users-body tr').length===50,'users are paginated');
  check(!calls.some(p=>p==='/api/admin/books'),'hidden books tab does not load at startup');
  document.getElementById('users-page-next').click();check(document.querySelectorAll('#users-body tr').length===50,'users next page');
  await search('users-search','Player 123');check(document.querySelectorAll('#users-body tr').length===1,'user search applies to all pages');
  document.getElementById('users-search-clear').click();
  await views.loadUserDetail(1);
  check(document.querySelectorAll('#user-books-body tr').length===50,'large account creates only 50 rows');
  check(document.getElementById('user-books-meta').textContent.includes('3048'),'account total remains complete');
  document.getElementById('ubooks-page-next').click();await wait(40);
  check(document.getElementById('ubooks-pagination').textContent.includes('Page 2'),'server account next page');
  document.querySelector('th[data-table="ubooks"][data-col="name"]').click();await wait(40);
  check(document.querySelector('#user-books-body tr').textContent.includes('Book 1'),'account natural name sort');
  await search('ubooks-search','Book 3048');check(document.querySelectorAll('#user-books-body tr').length===1,'account search finds final book');
  const input=document.getElementById('ubooks-search');input.value='Book 2';input.dispatchEvent(new Event('input'));await wait(220);
  await search('ubooks-search','Book 3048');await wait(170);
  check(document.querySelector('#user-books-body tr').textContent.includes('Book 3048'),'late search cannot overwrite latest response');
  document.getElementById('ubooks-search-clear').click();await wait(40);
  await views.loadBookDetail(1,{view:'user',userId:1});
  check(document.querySelectorAll('#book-pts-body tr').length===50,'runs paginated');
  await search('pts-search','Reader 122');check(document.querySelectorAll('#book-pts-body tr').length===1,'run search across pages');
  document.getElementById('book-back-btn').click();await wait(40);
  document.getElementById('user-back-btn').click();await wait(40);
  await tab('books');check(document.querySelectorAll('#books-body tr').length===50,'catalog pagination');
  await views.editAdminBook(1);await wait(40);
  check(calls.includes('/api/admin/books/1/stats?metadata=1'),'book editor skips gameplay statistics');
  check(document.querySelector('dialog[open]'),'book editor opens');document.querySelector('.admin-editor-close').click();await wait(20);
  await tab('series');check(document.querySelectorAll('#series-body tr').length===50,'series pagination');
  document.querySelector('#series-body .admin-edit-btn').click();await wait(20);
  check(document.querySelector('.admin-editor-toggle input')?.checked,'open world flag preserved');
  document.querySelector('.admin-editor-close').click();await wait(20);
  await tab('anthologies');check(document.querySelectorAll('#anthologies-body tr').length===50,'anthology pagination');
  await tab('tips');check(document.querySelectorAll('#tips-body tr').length===50,'tips pagination');
  await search('tips-search','Tip 123');check(document.querySelectorAll('#tips-body tr').length===1,'tip search');
  await tab('inventory');check(document.querySelectorAll('.inv-card').length>0,'inventory renders');
  await tab('feedback');check(document.querySelectorAll('.feedback-card').length===20,'feedback page bounded');
  check(!mutations.length,'no feedback automatically marked read off screen');
  check(!document.querySelectorAll('.fmsg').length,'closed feedback messages are not rendered');
  document.querySelector('.feedback-card-header').click();await wait(25);
  check(document.querySelectorAll('.fmsg').length===1,'only opened feedback messages rendered');
  check(mutations.length===1&&mutations[0].p==='/api/admin/feedback/1/read','only opened feedback marked read');
  const reply=document.querySelector('#reply-1');reply.value='Unsaved reply';document.getElementById('feedback-page-next').click();await wait(40);
  document.getElementById('feedback-page-prev').click();await wait(40);check(document.querySelector('#reply-1').value==='Unsaved reply','pagination preserves unsent feedback reply');
  await tab('announcements');check(document.querySelectorAll('#ann-drafts-list .ann-card').length===10,'drafts paginated');
  check(document.querySelectorAll('#ann-published-list .ann-card').length===10,'published notices paginated');
  check(document.querySelector('#ann-published-list .ann-card-pinned'),'pinned notice remains first');
  await search('announcements-search','Notice 66');check(document.querySelectorAll('#ann-published-list .ann-card').length===1,'announcement search includes old notices');
  await tab('tools');check(document.querySelectorAll('.xp-config-row').length===1,'tools load');
  const expected=getComputedStyle(document.getElementById('users-search')).borderRadius;
  for(const id of ['books-search','tips-type-filter','new-tip-text','tools-version-input','smtp-host'])check(getComputedStyle(document.getElementById(id)).borderRadius===expected,'consistent field style '+id);
  for(const name of ['users','books','series','anthologies','tips','inventory','feedback','announcements','tools']) {
    await tab(name);
    check(document.documentElement.scrollWidth<=innerWidth+1,'page overflow '+name+' at '+innerWidth);
  }
  let confirmed=0;
  core.showConfirm('Test action',()=>confirmed++);
  document.getElementById('confirm-cancel').click();check(confirmed===0,'cancel never executes action');
  core.showConfirm('Test action',()=>confirmed++);
  document.getElementById('confirm-ok').click();await wait(10);check(confirmed===1,'confirm executes once');
  core.showConfirm('Test failure',()=>{throw Error('Fixture failure');});
  document.getElementById('confirm-ok').click();await wait(10);
  check(document.getElementById('confirm-overlay').classList.contains('active'),'failed action presents themed alert');
  check(document.getElementById('confirm-cancel').hidden,'alert hides cancel');
  document.getElementById('confirm-ok').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  check(!document.getElementById('confirm-overlay').classList.contains('active'),'Escape closes confirmation');
  check(new Set([...document.querySelectorAll('[id]')].map(el=>el.id)).size===document.querySelectorAll('[id]').length,'no duplicate element ids');
  check(!errors.length,'runtime errors: '+errors.join(';'));
  document.body.dataset.test=JSON.stringify({width:innerWidth,tabs:9,largeAccount:3048,pagination:true,search:true,staleResponseGuard:true,editors:true,feedbackReadScope:true,replyPreservation:true,consistentControls:true,noPageOverflow:true,noPlayerRequests:true});
} catch(error) { document.body.dataset.failure=error.stack; }
`;
(async()=>{
  const base='file://'+scratch;
  fs.mkdirSync(path.join(scratch,'admin/js'),{recursive:true});
  for(const file of fs.readdirSync(path.join(repo,'admin/js'))) {
    let source=fs.readFileSync(path.join(repo,'admin/js',file),'utf8');
    source=source.replace("from '/js/account/role-badges.js'", "from 'file://"+repo+"/public/js/account/role-badges.js'");
    fs.writeFileSync(path.join(scratch,'admin/js',file),source);
  }
  let html=fs.readFileSync(path.join(repo,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/(href|src)="\//g,'$1="file://'+repo+'/public/');
  html=html.replace('</body>','<script type="module">const BASE='+JSON.stringify(base)+';'+fixture+'</script></body>');
  const file=path.join(scratch,'fixture.html');fs.writeFileSync(file,html);
  const results=[];
  for(const width of [390,900,1440]) results.push(await checkBrowser({file,profile:path.join(scratch,'profile-'+width),root,width,chromium:process.env.CHROMIUM||'/home/koldKat/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',timeoutMs:30000}));
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{fs.rmSync(scratch,{recursive:true,force:true});});

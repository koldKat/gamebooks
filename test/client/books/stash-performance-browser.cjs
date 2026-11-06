// Exercise large stash expansion, moves and reclamation in the real library UI.
const fs = require('node:fs');
const path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'stash-performance-'));
const repo = process.cwd();
const script = `
import {renderBooksList} from 'file://${repo}/public/js/books/render.js';
import {booksState} from 'file://${repo}/public/js/books/state.js';
import {_materializeLazyGroup} from 'file://${repo}/public/js/books/lazy.js';
const check=(value,label)=>{if(!value)throw Error(label);};
const wait=async(test,label)=>{for(let n=0;n<300;n++){if(test())return;await new Promise(r=>setTimeout(r,16));}throw Error(label);};
try {
 const timings=[],frames=[];
 let tracking=true,last=performance.now();
 function frame(now){if(!tracking)return;frames.push(now-last);last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
 window.fetch=async()=>new Response('{}',{status:200});
 const series=Array.from({length:200},(_,i)=>({id:i+1,name:'Series '+(i+1),is_owner:true}));
 const rows=Array.from({length:1800},(_,i)=>({id:i+1,name:'Book '+(i+1),series_id:Math.floor(i/9)+1,total_sections:100,visited:i%100,description:'An adventure '.repeat(20)}));
 let stashes=Array.from({length:10},(_,i)=>({id:i+1,name:'Stash '+(i+1),bookIds:[],seriesIds:series.slice(i*20,(i+1)*20).map(s=>s.id)}));
 booksState._currentUserId=1;booksState._hooks={};
 for(const stash of stashes)localStorage.setItem('stash_expanded_'+stash.id,'0');
 const render=()=>{const start=performance.now();renderBooksList(rows,series,stashes);timings.push(performance.now()-start);};
 render();
 const header=id=>document.querySelector('.stash-header-row[data-stash-id="'+id+'"]');
 const group=id=>header(id).nextElementSibling;
 const stable=header(10);
 const start=performance.now();header(1).click();const clickMs=performance.now()-start;
 check(group(1).querySelectorAll('.book-item').length<180,'large expansion yields before building every card');
 await wait(()=>group(1).querySelectorAll('.book-item').length===180,'all expanded nested series appear');
 check(group(1).querySelector('.book-edit-btn[data-id="1"]'),'inserted cards are wired');
 // A move rebuilds the two affected stashes and preserves the other headers.
 stashes=stashes.map(s=>s.id===1?{...s,seriesIds:s.seriesIds.filter(id=>id!==1)}:s.id===2?{...s,seriesIds:[1,...s.seriesIds]}:s);
 render();
 await wait(()=>group(1).querySelectorAll('.book-item').length===171,'source stash settles after move');
 check(!group(1).querySelector('.book-open-btn[data-id="1"]'),'moved series leaves source');
 check(header(10)===stable,'unrelated stash DOM is retained');
 header(2).click();
 await wait(()=>group(2).querySelectorAll('.book-item').length===189,'destination stash expands');
 check(group(2).querySelector('.book-open-btn[data-id="1"]'),'destination includes moved books');
 // An unchanged refresh must retain cards and fresh lazy builders.
 const retained=group(2).querySelector('.book-open-btn[data-id="1"]');render();
 check(group(2).querySelector('.book-open-btn[data-id="1"]')===retained,'unchanged refresh preserves cards');
 header(2).click();check(group(2).children.length===0,'collapse releases large stash DOM');
 header(2).click();header(2).click();
 await new Promise(r=>setTimeout(r,50));check(group(2).children.length===0,'canceled expansion stays empty');
 header(2).click();
 _materializeLazyGroup(group(2),{immediate:true});
 check(group(2).querySelectorAll('.book-item').length===189,'search can complete nested materialization');
 // A play-screen refresh defers changed expanded stashes. Home reuses the
 // unchanged placeholder but must resume its children without another click.
 const list=document.getElementById('books-list');list.style.display='none';
 rows[10]={...rows[10],visited:99};render();
 check(group(1).dataset.lazyGroup,'hidden refresh leaves an expanded placeholder');
 check(group(1).children.length===0,'hidden stash remains deferred');
 const returningHeader=header(1);list.style.display='';render();
 check(header(1)===returningHeader,'Home retains unchanged expanded stash header');
 await wait(()=>group(1).querySelectorAll('.book-item').length===171,'Home restores expanded stash children without collapse');
 tracking=false;
 document.body.dataset.test=JSON.stringify({books:rows.length,series:series.length,stashes:stashes.length,renderMs:timings.map(n=>Math.round(n)),clickMs:Math.round(clickMs),maxFrameGapMs:Math.round(Math.max(...frames))});
}catch(error){document.body.dataset.failure=error.stack;}
`;
(async()=>{
 try {
  const file=path.join(scratch,'stashes.html');
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://'+repo+'/public/css/style.css"><body><div id="books-list" style="width:400px;height:800px;overflow:auto"></div><script type="module">'+script+'</script>');
  for(const width of [1100,390]) console.log(JSON.stringify(await browser({file,root,width,profile:path.join(scratch,'profile-'+width),chromium:process.env.CHROMIUM,timeoutMs:30000})));
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');

const draftPath = path.resolve(process.argv[2]);
const root = path.dirname(draftPath);
const raw = fs.readFileSync(draftPath);
const draft = JSON.parse(raw);
const publicRoot = path.resolve('public');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const sources = ['css/liveread.css', 'css/reading-access.css', 'js/reading/content.js', 'js/reading/map-entry.js'];
const hashes = Object.fromEntries(sources.map(file => [file, sha(fs.readFileSync(path.join(publicRoot, file)))]));
const scratch = fs.mkdtempSync(path.join(root, `${draft.bookId}-reader-`));
const payload = JSON.stringify(draft).replaceAll('<', '\\u003c');
const css = sources.slice(0, 2).map(file => fs.readFileSync(path.join(publicRoot, file), 'utf8')).join('\n');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}body{margin:0;background:#111;color:#ddd}.liveread-body{width:calc(100% - 24px);height:500px;margin:12px;box-sizing:border-box}</style>
<div class="liveread-body" id="pane"></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
import {renderReadingMatter} from 'file://${publicRoot}/js/reading/content.js';
import {bindReadingMapEntry,isReadingMapSection} from 'file://${publicRoot}/js/reading/map-entry.js';
const draft=${payload},pane=document.getElementById('pane');
const imageFiles=new Map(draft.images.map(image=>[image.url,'file://'+image.path]));
const check=(condition,label)=>{if(!condition)throw Error(label);};
const entries=[...Object.values(draft.matter).filter(Boolean).map(html=>({html,matter:true})),...draft.rows];
let checked=0,images=0,links=0,forms=0,scrollable=0;
const decodedImages=new Set();
for(const entry of entries){
  pane.innerHTML='';pane.scrollTop=0;
  if(entry.matter){const content=document.createElement('div');content.className='reading-frontmatter';pane.append(content);check(renderReadingMatter(content,draft.bookId,entry.html,document),'matter render');}
  else pane.innerHTML=entry.html;
  for(const image of pane.querySelectorAll('img')){
    const original=image.getAttribute('src');check(imageFiles.has(original),'untracked image '+original);
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('image decode '+original));image.loading='eager';image.src=imageFiles.get(original);});
    check(image.naturalWidth>0&&image.naturalHeight>0,'image dimensions');images++;decodedImages.add(original);
  }
  check(!pane.querySelector('p>figure,p>form,p>table,p>ul,p>ol'),'invalid paragraph '+entry.section_id);
  check(![...pane.querySelectorAll('p')].some(p=>!p.textContent.trim()&&!p.children.length),'empty paragraph '+entry.section_id);
  if(!entry.matter){
    const destinations=[...pane.querySelectorAll('a[href^="#section-"]')].map(a=>a.getAttribute('href').slice(9));
    check(new Set(destinations).size===entry.choices.length,'choice count '+entry.section_id);
    check(destinations.every(id=>entry.choices.map(String).includes(id)),'choice mismatch '+entry.section_id);links+=entry.choices.length;
  }
  const mapForms=[...pane.querySelectorAll('form[data-reading-map-entry]')];forms+=mapForms.length;
  if(mapForms.length){
    check(isReadingMapSection(entry),'manual section detection');let allowed=false,selected=[];
    bindReadingMapEntry(pane,{canNavigate:()=>allowed,onNavigate:id=>selected.push(id)});
    for(const form of mapForms){
      const input=form.querySelector('input[name="marker"]'),button=form.querySelector('button[type="submit"]');
      check(input.disabled&&button.disabled,'manual control without run');
      input.value='12';form.dispatchEvent(new Event('submit',{cancelable:true}));check(!selected.length,'disabled navigation');
      allowed=true;input.disabled=button.disabled=false;
      const expected=(form.dataset.readingMarkerPrefix||'')+'12';
      form.dispatchEvent(new Event('submit',{cancelable:true}));check(String(selected.pop())===expected,'manual return');
      input.value=String(draft.rows.length+1);form.dispatchEvent(new Event('submit',{cancelable:true}));check(!selected.length,'manual upper bound');
    }
  }
  const max=Math.max(0,pane.scrollHeight-pane.clientHeight);pane.scrollTop=Number.MAX_SAFE_INTEGER;
  if(max){scrollable++;check(Math.abs(pane.scrollTop-max)<=1,'bottom inaccessible '+entry.section_id);}
  pane.scrollTop=0;check(pane.scrollTop===0,'top inaccessible');
  check(pane.scrollWidth<=pane.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth,'horizontal overflow '+entry.section_id);
  checked++;document.body.dataset.progress=String(checked);
}
check(checked===entries.length,'incomplete coverage');check(decodedImages.size===draft.images.length,'image coverage');
check(forms===(draft.manualEntrySections?.length||0),'manual section coverage');
document.body.dataset.test=JSON.stringify({width:innerWidth,checked,images,links,forms,scrollable,productionWrites:0});
</script>`;

(async () => {
  try {
    const file = path.join(scratch, 'reader.html');
    fs.writeFileSync(file, html);
    const results = [];
    for (const width of [320, 390, 1100]) {
      const result = await checkBrowser({file, profile:path.join(scratch, 'profile-'+width), root, width,
        chromium:process.env.CHROMIUM, timeoutMs:120000});
      assert.equal(result.checked, draft.rows.length + Object.values(draft.matter).filter(Boolean).length);
      assert.equal(result.productionWrites, 0);
      results.push(result);
      console.log(JSON.stringify(result));
    }
    assert.deepEqual(fs.readFileSync(draftPath), raw, 'Draft changed during checks');
    fs.writeFileSync(path.join(root, `${draft.bookId}-reader-verification.json`), JSON.stringify({bookId:draft.bookId,
      draftHash:sha(raw), runnerHash:sha(fs.readFileSync(__filename)), hashes, results,
      scope:'PRIVATE-REAL-READING-MODULE-ALL-ROWS-AND-MATTER-NOT-LIVE-API', productionWrites:0}, null, 2));
  } finally {
    fs.rmSync(scratch, {recursive:true, force:true});
  }
})().catch(error => {console.error(error);process.exitCode=1;});

// Check image-sized, centered reader viewers and zoom cleanup at both screen sizes.
const fs = require('node:fs');
const path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.argv[2];
if (!root) throw Error('Provide a scratch directory');
const publicRoot = path.resolve('public');
const file = path.join(root, 'reading-image-zoom-check.html');
fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#111827;color:#ddd;font:14px Arial}dialog{margin:0} ${fs.readFileSync(path.join(publicRoot, 'css/components/reading-access.css'), 'utf8')}</style>
<div id="source"></div><script type="module">
import {openReadingImageZoom,bindReadingImageZoom} from 'file://${publicRoot}/js/reading/image-zoom.js';
const check=(value,label)=>{if(!value)throw Error(label)};
const image=async(w,h)=>{
 const img=new Image();img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#64748b"/></svg>');
 await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});return img;
};
try {
 const results=[];
 for(const [name,w,h,parts] of [['small',240,150,false],['wide',2400,500,false],['tall',500,2400,false],['wrapped',1100,730,'figure'],['assembled',300,200,true],['stacked',375,608,'stack']]){
  const source=parts?document.createElement('figure'):await image(w,h);
  if(parts){
   source.className=parts==='stack'?'reading-art-stack':parts==='figure'?'':'reading-art-parts';source.style.width=w+'px';
   if(parts==='figure')source.append(await image(w,h));
   else source.append(await image(parts==='stack'?w:w/2,parts==='stack'?h/2:h),await image(parts==='stack'?w:w/2,parts==='stack'?h/2:h));
  }
  document.getElementById('source').append(source);
  bindReadingImageZoom(document.getElementById('source'));
  check(getComputedStyle(source).cursor==='pointer','clickable artwork hand cursor '+name);
  for(const child of source.querySelectorAll('img'))check(getComputedStyle(child).cursor==='pointer','layered artwork hand cursor '+name);
  if(parts==='stack'){
    const label=document.createElement('p');label.textContent='Original artwork label';source.append(label);
    check(getComputedStyle(label).cursor==='pointer','original text layer hand cursor');label.remove();
  }
  openReadingImageZoom(source);
  const dialog=document.querySelector('dialog'),viewport=dialog.querySelector('.reading-image-zoom-viewport');
  const r=dialog.getBoundingClientRect(),v=viewport.getBoundingClientRect();
  check(Math.abs(r.x+r.width/2-document.documentElement.clientWidth/2)<1,'horizontal center '+name);
  check(Math.abs(r.y+r.height/2-document.documentElement.clientHeight/2)<1,'vertical center '+name);
  check(r.width<=innerWidth*.75+1&&r.height<=innerHeight*.85+1,'viewport limits '+name);
  check(Math.abs(v.height-v.width*h/w)<1+h/w,'image aspect '+name);
  check(v.width<=w+1&&v.height<=h+1,'small image not enlarged '+name);
  check(Math.abs(viewport.scrollWidth-viewport.clientWidth)<=1,'no initial horizontal scroll '+name);
  check(Math.abs(viewport.scrollHeight-viewport.clientHeight)<=1,'no initial vertical scroll '+name);
  check(dialog.querySelector('button').offsetHeight===24,'compact controls '+name);
  const buttons=dialog.querySelectorAll('button');
  const picture=dialog.querySelector('img'),initialPictureWidth=picture.getBoundingClientRect().width;
  buttons[2].click();
  check(buttons[1].textContent==='125%','quarter-step zoom '+name);
  check(picture.getBoundingClientRect().width>initialPictureWidth*1.2,'zoom enlarges actual artwork '+name);
  const grown=dialog.getBoundingClientRect();
  check(grown.width>=r.width&&grown.height>=r.height,'zoom grows dialog '+name);
  check(grown.width<=innerWidth*.75+1&&grown.height<=innerHeight*.85+1,'zoom limits '+name);
  check(getComputedStyle(viewport).overflow==='hidden','no scrollbars '+name);
  while(!viewport.classList.contains('can-pan')&&!buttons[2].disabled)buttons[2].click();
  check(viewport.classList.contains('can-pan'),'overflow can pan '+name);
  const vrect=viewport.getBoundingClientRect();
  // Synthetic pointer events have no OS pointer for the capture API.
  viewport.setPointerCapture=id=>check(id===1,'capture drag pointer');
  viewport.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,button:0,clientX:vrect.x+80,clientY:vrect.y+80}));
  const left=viewport.scrollLeft,top=viewport.scrollTop;
  viewport.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:vrect.x+20,clientY:vrect.y+20}));
  check(viewport.scrollLeft>left||viewport.scrollTop>top,'drag pans overflow '+name);
  viewport.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
  buttons[1].click();check(Math.abs(viewport.scrollWidth-viewport.clientWidth)<=1,'reset fits '+name);
  results.push({name,width:r.width,height:r.height});
  const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));dialog.close();
  await closed;check(!document.querySelector('dialog'),'close unloads viewer');source.remove();
 }
 document.body.dataset.test=JSON.stringify({width:innerWidth,cases:results});
}catch(error){document.body.dataset.failure=error.stack;}
</script>`);
(async () => {
  const results = [];
  for (const width of [1400, 390]) results.push(await browser({file, root, profile:path.join(root, 'reading-image-zoom-profile'), width, chromium:process.env.CHROMIUM}));
  fs.writeFileSync(path.join(root, 'reading-image-zoom-verification.json'), JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});

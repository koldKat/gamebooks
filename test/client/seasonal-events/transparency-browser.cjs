// Check actual composited screen pixels outside every Halloween silhouette.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'seasonal-transparency-'));
const base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css">
<style>html,body{min-height:100vh;margin:0;background:repeating-linear-gradient(90deg,#25334a 0 16px,#93846b 16px 32px)}</style>
<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>
<script type="module">
const {halloweenArtwork}=await import('file://${base}/js/seasonal-events/artwork.js');
window.transparentSamples=[];
for(const [index,art]of halloweenArtwork.entries()){
 const icon=document.createElement('span');icon.className=art.kind===4?'seasonal-background__web':'seasonal-background__icon';
 icon.dataset.kind=art.kind;icon.dataset.pixelated='true';
 const left=20+(index%7)*145,top=20+Math.floor(index/7)*160,flip=index%2?-1:1;
 icon.style.cssText='position:fixed;left:'+left+'px;top:'+top+'px;width:96px;height:96px;transform:scaleX('+flip+');background:#ff00ff';
 icon.style.maskImage=art.maskImage;icon.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+art.svg+'</svg>';document.body.append(icon);
 // Deliberately paint an opaque element background: the mask must still reveal
 // the striped page outside the glyph, catching a future rectangular matte.
 if(getComputedStyle(icon).maskImage==='none')throw Error('Missing mask '+index);
 const image=new Image();const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
 image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'+art.svg+'</svg>');await loaded;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const rgba=ctx.getImageData(0,0,48,48).data;
 for(const [x,y]of [[1,1],[46,1],[1,46],[46,46],[4,4],[43,43]]){
  if(rgba[(y*48+x)*4+3]===0)window.transparentSamples.push([Math.floor(left+(flip===1?x+.5:47.5-x)*2),Math.floor(top+(y+.5)*2)]);
 }
}
if(window.transparentSamples.length<80)throw Error('Insufficient transparent screen samples');
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.test=JSON.stringify({sprites:22,transparentSamples:window.transparentSamples.length})));
</script>`;
const screenshotCheck=async function(base64){
 const image=new Image();const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});image.src='data:image/png;base64,'+base64;await loaded;
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 for(const [x,y]of window.transparentSamples){
  const pixel=ctx.getImageData(x,y,1,1).data,expected=x%32<16?[37,51,74]:[147,132,107];
  if(expected.some((value,i)=>Math.abs(value-pixel[i])>1))throw Error('Opaque sprite backing at '+x+','+y+': '+Array.from(pixel));
 }
 return true;
};
(async()=>{try{fs.writeFileSync(file,html);const result=await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,screenshotCheck:screenshotCheck.toString(),screenshotPath:process.env.TRANSPARENCY_SCREENSHOT});console.log(JSON.stringify({...result,compositedTransparency:true}));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

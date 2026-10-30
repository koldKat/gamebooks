// Check actual screenshot pixels around every paused Halloween sprite over a patterned background.
const fs=require('node:fs'),path=require('node:path'),checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','seasonal-paused-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><style>html{min-height:100%;background:repeating-linear-gradient(90deg,#152334 0px,#152334 8px,#304155 8px,#304155 16px)}body{margin:0;min-height:100vh}</style><body class="reduce-motion"><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">
const {halloweenArtwork}=await import('file://${base}/js/seasonal-events/artwork.js');const check=(v,label)=>{if(!v)throw Error(label);};
for(const [index,art]of halloweenArtwork.filter(a=>a.kind!==4).entries()){
 const icon=document.createElement('span');icon.className='seasonal-background__icon';icon.dataset.pixelated='true';icon.dataset.kind=art.kind;
 icon.style.cssText='left:'+(30+index%9*112)+'px;top:'+(35+Math.floor(index/9)*180)+'px;width:80px;height:80px;transform:none';icon.style.maskImage=art.maskImage;
 icon.innerHTML='<svg viewBox="0 0 48 48">'+art.svg+'</svg>';document.body.append(icon);
 check(getComputedStyle(icon).maskImage!=='none','paused sprite has a silhouette mask');
 check(icon.getAnimations({subtree:true}).length===0,'paused sprite has no active animation');
}
await new Promise(r=>setTimeout(r,150));document.body.dataset.test=JSON.stringify({pausedSprites:25,silhouetteMasks:true,noAnimations:true,staticArt:true});
</script>`;
const screenshotCheck=async function(encoded){
 const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 for(const icon of document.querySelectorAll('.seasonal-background__icon')){
  const r=icon.getBoundingClientRect();for(const [x,y]of [[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]]){
   const rgb=ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data,expected=Math.floor(x/8)%2?[48,65,85]:[21,35,52];
   if(expected.some((v,i)=>Math.abs(v-rgb[i])>2))throw Error('Opaque paused sprite corner '+JSON.stringify({kind:icon.dataset.kind,x,y,rgb:[...rgb],expected}));
  }
 }return true;
};
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1100,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONAL_SCREENSHOT,screenshotCheck})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

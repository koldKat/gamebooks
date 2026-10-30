// Review every new static Halloween drawing and verify that no decoration animates.
const fs=require('node:fs'),path=require('node:path'),checkBrowser=require('../battlesim/browser-harness.cjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','static-halloween-')),base=path.resolve('public'),file=path.join(root,'check.html');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${base}/css/seasonal-events.css"><style>body{margin:30px;background:#171d29;color:#c4c3bd;font:13px sans-serif}.gallery{display:grid;grid-template-columns:repeat(9,1fr);gap:30px 10px;text-align:center}.gallery svg{display:block;width:80px;height:80px;margin:10px auto}</style><h2>Halloween: one static pixel-art set</h2><section class="gallery"></section><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">
const {halloweenArtwork}=await import('file://${base}/js/seasonal-events/artwork.js');
const gallery=document.querySelector('.gallery');
for(const art of halloweenArtwork){const tile=document.createElement('article');tile.innerHTML='<svg viewBox="0 0 48 48">'+art.svg+'</svg>';const label=document.createElement('span');label.textContent=art.name;tile.append(label);gallery.append(tile);}
if(gallery.getAnimations({subtree:true}).length)throw Error('A static object is animated');
document.body.dataset.test=JSON.stringify({newSprites:halloweenArtwork.length,cornerWebs:2,animations:0,sharedPalette:true});
</script>`;
(async()=>{try{fs.writeFileSync(file,html);console.log(JSON.stringify(await checkBrowser({file,root,profile:path.join(root,'profile'),width:1400,chromium:process.env.CHROMIUM,screenshotPath:process.env.SEASONAL_SCREENSHOT})));}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

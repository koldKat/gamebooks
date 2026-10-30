// Place static seasonal pixel art in clear panel gaps while preserving the page's layout seed.
import {seasonalGapPositions} from './gaps.js';
import {halloweenArtwork} from './artwork.js';
import {seasonalWebPositions} from './web-layout.js';
import {compactPixelSvg} from './pixel-paths.js';
const pageSeed=Math.floor(Math.random()*0x100000000);
function layoutRandom(){let seed=pageSeed;return()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/0x100000000);}

export function createSeasonalBackground({id='halloween',artwork=halloweenArtwork,featured=[0,1,2,4,6,7,12,5],cornerWebs=true}={}){
 const landing=document.getElementById('landing-wrapper');if(!landing)return()=>{};
 const layer=document.createElement('div');layer.className='seasonal-background';layer.dataset.season=id;layer.setAttribute('aria-hidden','true');document.body.append(layer);
 const panels=[...document.querySelectorAll('#covers-panel,#feed-panel,#landing-right,.panel-toggle,.scroll-top-btn,#app-footer')];
 let timer,signature;const nodes=[];
 const random=layoutRandom();
 const variants=artwork.map((_,index)=>index).filter(index=>artwork[index].kind!==4&&!featured.includes(index));
 for(let i=variants.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[variants[i],variants[j]]=[variants[j],variants[i]];}
 const portfolio=[...featured.filter(index=>artwork[index]&&artwork[index].kind!==4),...variants];
 const webs=artwork.filter(art=>cornerWebs&&art.kind===4).slice(0,2).map(art=>{
  const web=document.createElement('span');web.className='seasonal-background__web';web.style.maskImage=art.maskImage;
  web.innerHTML='<svg viewBox="0 0 48 48" focusable="false">'+compactPixelSvg(art.svg)+'</svg>';layer.append(web);return web;
 });
 function render(){
  const style=getComputedStyle(landing);
  layer.hidden=style.visibility==='hidden'||style.display==='none'||!landing.getClientRects().length
   ||['covers-collapsed','right-collapsed','feed-collapsed'].every(name=>document.body.classList.contains(name));
  if(layer.hidden)return;
    const occupied = panels.filter(panel => {
      const s = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      const column = ['covers-panel', 'feed-panel', 'landing-right'].includes(panel.id);
      if (panel.id === 'app-footer' && getComputedStyle(document.getElementById('feed-panel')).opacity === '0') return false;
      // A scrolled-away feed still occupies its column. Reserve fixed controls even
      // while faded out, so revealing a scroll-to-top button cannot reshuffle icons.
      return s.display !== 'none' && s.visibility !== 'hidden' && (!column || s.opacity !== '0') && rect.width && rect.height
        && rect.right > 0 && rect.left < innerWidth
        && (column || panel.id === 'app-footer' || (rect.bottom > 0 && rect.top < innerHeight));
    }).map(panel => {
      const rect = panel.getBoundingClientRect();
      if (panel.id === 'feed-panel') {
        const style = getComputedStyle(panel);
        return {left:rect.left+parseFloat(style.paddingLeft),right:rect.right-parseFloat(style.paddingRight),top:0,bottom:innerHeight};
      }
      // Reserve its eventual bottom-of-viewport position, independent of feed scroll.
      if (panel.id === 'app-footer') return {left:rect.left,right:rect.right,top:innerHeight-rect.height,bottom:innerHeight};
      return ['covers-panel', 'feed-panel', 'landing-right'].includes(panel.id)
        ? {left:rect.left,right:rect.right,top:0,bottom:innerHeight}
        : {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    });
  const nextSignature=JSON.stringify([innerWidth,innerHeight,occupied.map(rect=>Object.values(rect).map(Math.round))]);
  if(signature===nextSignature)return;signature=nextSignature;
  const corners=cornerWebs?seasonalWebPositions(innerWidth,innerHeight,occupied,{random:layoutRandom()}):[];
  const webAreas=corners.map(p=>({left:p.left-8,right:p.left+p.size+8,top:p.top-8,bottom:p.top+p.size+8}));
  for(const [index,web]of webs.entries()){
   const point=corners[index];web.hidden=!point;if(!point)continue;
   web.style.left=point.left+'px';web.style.top=point.top+'px';web.style.width=web.style.height=point.size+'px';
   web.style.transform='scale('+point.flipX+','+point.flipY+')';web.dataset.edge=point.edge;web.dataset.anchorX=point.anchorX;
  }
  const positions=seasonalGapPositions(innerWidth,innerHeight,[...occupied,...webAreas],{random:layoutRandom()});
  for(let index=0;index<positions.length&&portfolio.length;index++){
   const point=positions[index],artIndex=portfolio[index%portfolio.length],art=artwork[artIndex];
   let icon=nodes[index];
   if(!icon){
    icon=document.createElement('span');icon.className='seasonal-background__icon';icon.dataset.pixelated='true';icon.dataset.kind=art.kind;icon.dataset.artwork=artIndex;
    if(art.maskImage)icon.style.maskImage=art.maskImage;
    icon.innerHTML='<svg viewBox="0 0 48 48" focusable="false">'+compactPixelSvg(art.svg)+'</svg>';nodes.push(icon);layer.append(icon);
   }
   icon.hidden=false;icon.style.left=(point.x-point.size/2)+'px';icon.style.top=(point.y-point.size/2)+'px';icon.style.width=icon.style.height=point.size+'px';
  }
  for(let index=positions.length;index<nodes.length;index++)nodes[index].hidden=true;
 }
  function schedule() {
    clearTimeout(timer); timer = setTimeout(render, 280);
  }
  function settled(event) {
    if ((event.target === landing || panels.includes(event.target))
      && ['transform', 'padding-left', 'padding-right', 'width', 'max-height'].includes(event.propertyName)) {
      clearTimeout(timer); timer = setTimeout(render, 30);
    }
  }
  const resize = new ResizeObserver(schedule);
  for (const panel of [landing, ...panels]) resize.observe(panel);
  const changes = new MutationObserver(schedule);
  for (const element of [document.body, landing, ...panels]) {
    changes.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  window.addEventListener('resize', schedule);
 document.addEventListener('transitionend',settled,true);render();
 return()=>{clearTimeout(timer);resize.disconnect();changes.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('transitionend',settled,true);layer.remove();};
}
export const createHalloweenBackground=()=>createSeasonalBackground();

// Keep creature silhouettes connected while animating compact groups and complete poses.
import {compactPixelSvg} from './pixel-paths.js';
import {batFrames,mummySkeleton,eyeFire,cauldronArtwork,catArtwork,scarecrowArtwork,potionArtwork} from './halloween-details.js';
function role(kind,index,{x,y,width,fill}) {
  const mid=x+width/2;
  if(kind===0)return y>=32?'hem':fill==='#15151e'&&y<20?'eyes':'body';
  if(kind===1)return x>=36?'tool':fill==='#ffffff'&&y<20?'eyes':'body';
  if(kind===2)return fill==='#15151e'?'ember':y<8?'stalk':'body';
  if(kind===3)return fill==='#d8ad69'?'eyes':mid<=20?'wing-left':mid>=28?'wing-right':'body';
  if(kind===5)return index===12&&fill==='#15151e'?'engraving':index===5&&y>=32?'jaw':'body';
  if(kind===6)return fill==='#d8ad69'?'eyes':mid<=16&&y<30?'tail':'body';
  if(kind===7)return mid<=16?'legs-left':mid>=34?'legs-right':fill==='#e1d8ba'?'fangs':'body';
  if(kind===8&&index===17)return y<22?'finger-'+Math.min(3,Math.max(0,Math.floor((mid-10)/8))):mid<12&&y<30?'thumb':'body';
  if(kind===8)return y>=36?'body':y<12&&['#9b3749','#e47761'].includes(fill)?'brain':fill==='#e1d8ba'&&y<22?'eyes':'face';
  if(index===19)return 'wrap-'+Math.min(5,Math.floor(y/8));
  if(kind===9)return fill==='#e47761'?'eyes':'body';
  if(kind===10)return fill==='#e47761'&&y<20?'eyes':['#642f46','#995267'].includes(fill)?'cape':fill==='#e1d8ba'&&y>=26&&y<30?'fangs':'body';
  if(kind===12)return fill==='#d8ad69'?'glint':y>=30?'brim':'body';
  if(kind===13||kind===16)return y>=16&&y<32&&mid<16?'arm-left':y>=16&&y<32&&mid>=32?'arm-right':'body';
  if(kind===14)return fill==='#d8ad69'?'windows':'body';
  if(kind===15)return y<12?'flame':'body';
  return 'body';
}

export function animateHalloweenSprite(art,index) {
  if(art.kind===4)return art;
  if(index===20)return cauldronArtwork();
  if(index===13)return catArtwork();
  if(index===17)return potionArtwork();
  if(index===23||index===26)return scarecrowArtwork(index);
  const groups=new Map(),cuts=art.kind===3?[20,28]:art.kind===7?[16,34]:art.kind===6?[16]:[13,16].includes(art.kind)?[16,32]:art.kind===10?[18,30]:art.kind===8&&index===17?[18,26,34]:[];
  for(const match of art.svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"\/>/g)){
    const [,rx,ry,rw,rh,sourceFill]=match,x=Number(rx),y=Number(ry),right=x+Number(rw),height=Number(rh);
    const pumpkinColors=index===2?{'#df862b':'#b47735','#994a24':'#79502c','#f1b14b':'#c7934b'}
      :index===9?{'#df862b':'#a59446','#994a24':'#71602f','#f1b14b':'#c0ad64'}:{};
    const fill=pumpkinColors[sourceFill]||sourceFill;
    if(index===13&&y>=42)continue;
    const edges=[x,...cuts.filter(c=>c>x&&c<right),right];
    for(let i=0;i<edges.length-1;i++){
      const left=edges[i],width=edges[i+1]-left,part=role(art.kind,index,{x:left,y,width,fill});
      if(!groups.has(part))groups.set(part,[]);
      groups.get(part).push(`<rect x="${left}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`);
    }
  }
  if(!groups.size)throw Error('Missing Halloween pixel artwork');
  if(art.kind===0){
    // A stationary overlap behind the flapping cloth keeps the seam opaque in every pose.
    const seam=[...art.svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="[^"]+"\/>/g)]
      .filter(m=>Number(m[1])>=32&&Number(m[1])<36).map(m=>m[0]).join('');
    groups.get('body').push(seam);
  }
  let parts=[...groups].map(([name,rects])=>`<g class="haunt-part--${name}">${rects.join('')}</g>`).join('');
  if(art.kind===3)parts=batFrames(index);
  if(index===16){
    const face=[...groups].filter(([name])=>name!=='body').map(([name,rects])=>`<g class="haunt-part--${name}">${rects.join('')}</g>`).join('');
    const mouth='<g class="haunt-zombie-mouth"><path fill="#3c2028" d="M18 24h12v2h2v6h-2v2H18v-2h-2v-6h2z"/><path fill="#e1d8ba" d="M18 24h4v2h-4zM26 24h4v2h-4zM20 32h3v2h-3zM26 32h3v2h-3z"/><path fill="#9b3749" d="M22 30h6v2h-6z"/></g>';
    parts='<g class="haunt-zombie-face">'+face+mouth+'</g><g class="haunt-part--body">'+groups.get('body').join('')+'</g>';
  }
  if(index===19)parts='<g class="haunt-mummy-bones">'+mummySkeleton+'</g>'+parts;
  if(index===5)parts='<g class="haunt-jaw-joint"><path fill="#8e826a" d="M14 30h4v10h-4zM30 30h4v10h-4z"/><path fill="#482934" d="M18 30h12v10H18z"/></g>'+parts+eyeFire(index);
  if(index===25)parts+=eyeFire(index);
  if(index===13)parts='<g class="haunt-cat-tail-joint"><path fill="#15151e" d="M10 28h8v4h-8z"/></g>'+parts+'<g class="haunt-cat-paws"><path fill="#938493" d="M18 40h6v4h-6zM30 40h6v4h-6z"/><path fill="#15151e" d="M18 40h6v2h-6zM30 40h6v2h-6z"/></g>';
  const svg=compactPixelSvg(`<g class="halloween-animated haunt-kind-${art.kind} haunt-sprite-${index}" style="--haunt-delay:${-(index*.47).toFixed(2)}s" shape-rendering="crispEdges">`+parts+'</g>');
  let still=art.kind===3?batFrames(index):[17,19].includes(index)?art.svg:parts;
  still=still.replace(/<g class="haunt-eye-fire">[\s\S]*?<\/g><\/g><\/g>/g,'');
  const staticMask=`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+compactPixelSvg(still)+'</svg>')}")`;
  return {...art,animated:true,svg,staticMask};
}

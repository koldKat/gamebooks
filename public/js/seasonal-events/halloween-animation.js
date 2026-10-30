// Separate existing Halloween pixels into expressive moving parts without changing their drawings.
function role(kind,index,{x,y,width,fill}) {
  const mid=x+width/2;
  if(kind===0)return y>=34?'hem':fill==='#15151e'&&y<20?'eyes':'body';
  if(kind===1)return x>=36?'tool':fill==='#ffffff'&&y<20?'eyes':'body';
  if(kind===2)return fill==='#15151e'?'ember':y<8?'stalk':'body';
  if(kind===3)return fill==='#d8ad69'?'eyes':mid<=20?'wing-left':mid>=28?'wing-right':'body';
  if(kind===5)return index===5&&y>=32?'jaw':'body';
  if(kind===6)return fill==='#d8ad69'?'eyes':mid<=16&&y<34?'tail':'body';
  if(kind===7)return mid<=16?'legs-left':mid>=34?'legs-right':fill==='#e1d8ba'?'fangs':'body';
  if(kind===8&&index===17)return y<22?'finger-'+Math.min(3,Math.max(0,Math.floor((mid-10)/8))):mid<12&&y<30?'thumb':'body';
  if(kind===8)return y<12&&['#9b3749','#e47761'].includes(fill)?'brain':fill==='#e1d8ba'&&y<22?'eyes':y>=24&&y<34?'jaw':'body';
  if(kind===9)return fill==='#e47761'?'eyes':index===19&&mid>34&&y>24?'cloth':'body';
  if(kind===10)return fill==='#e47761'&&y<20?'eyes':['#642f46','#995267'].includes(fill)?'cape':fill==='#e1d8ba'&&y<32?'fangs':'body';
  if(kind===12)return fill==='#d8ad69'?'glint':y>=30?'brim':'body';
  if(kind===13||kind===16)return y>=16&&y<32&&mid<16?'arm-left':y>=16&&y<32&&mid>=32?'arm-right':'body';
  if(kind===14)return fill==='#d8ad69'?'windows':'body';
  if(kind===15)return y<12?'flame':y>=30?'jaw':'body';
  return 'body';
}

export function animateHalloweenSprite(art,index) {
  if(art.kind===4)return art;
  const groups=new Map(),cuts=art.kind===3?[20,28]:art.kind===7?[16,34]:art.kind===6?[16]:[13,16].includes(art.kind)?[16,32]:art.kind===10?[18,30]:art.kind===8&&index===17?[18,26,34]:[];
  for(const match of art.svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"\/>/g)){
    const [,rx,ry,rw,rh,fill]=match,x=Number(rx),y=Number(ry),right=x+Number(rw),height=Number(rh);
    const edges=[x,...cuts.filter(c=>c>x&&c<right),right];
    for(let i=0;i<edges.length-1;i++){
      const left=edges[i],width=edges[i+1]-left,part=role(art.kind,index,{x:left,y,width,fill});
      if(!groups.has(part))groups.set(part,[]);
      groups.get(part).push(`<rect x="${left}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`);
    }
  }
  if(!groups.size)throw Error('Missing Halloween pixel artwork');
  const svg=`<g class="halloween-animated haunt-kind-${art.kind} haunt-sprite-${index}" style="--haunt-delay:${-(index*.47).toFixed(2)}s" shape-rendering="crispEdges">`
    +[...groups].map(([name,rects])=>`<g class="haunt-part--${name}">${rects.join('')}</g>`).join('')+'</g>';
  return {...art,animated:true,svg};
}

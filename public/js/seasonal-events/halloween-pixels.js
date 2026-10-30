// Draw the static Halloween set on one 16-pixel grid with a single shared palette.
export const halloweenPalette=Object.freeze({N:'#292830',D:'#55535e',S:'#aaa79f',W:'#e2dfcc',O:'#bd8145',R:'#a65b53',G:'#7d9164',Y:'#bcaa68',B:'#6d8190'});

export function halloweenDrawing(name,kind,paint){
  const cells=Array.from({length:16},()=>Array(16).fill('.'));
  const put=(x,y,color)=>{if(x>=0&&x<16&&y>=0&&y<16)cells[y][x]=color;};
  const box=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)put(i,j,color);};
  const line=(x,y,a,b,color)=>{const length=Math.max(Math.abs(a-x),Math.abs(b-y));for(let i=0;i<=length;i++)put(Math.round(x+(a-x)*i/(length||1)),Math.round(y+(b-y)*i/(length||1)),color);};
  const shape=(points,color)=>{
    const inside=(x,y)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
      const[a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;
    }return hit;};
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(inside(x+.5,y+.5))put(x,y,
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!inside(x+.5+dx,y+.5+dy))?'N':color);
  };
  paint({box,line,shape,put});
  const paths=new Map();
  for(let y=0;y<16;y++)for(let x=0;x<16;){
    const color=cells[y][x];let end=x+1;while(end<16&&cells[y][end]===color)end++;
    if(color!=='.'){
      if(!halloweenPalette[color])throw Error('Unknown Halloween pixel color');
      paths.set(color,(paths.get(color)||'')+`M${x*3} ${y*3}h${(end-x)*3}v3h-${(end-x)*3}z`);
    }x=end;
  }
  const svg='<g shape-rendering="crispEdges">'+[...paths].map(([c,d])=>`<path fill="${halloweenPalette[c]}" d="${d}"/>`).join('')+'</g>';
  const maskImage=`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+svg+'</svg>')}")`;
  return {name,kind,pixelated:true,pixelSize:3,svg,maskImage};
}

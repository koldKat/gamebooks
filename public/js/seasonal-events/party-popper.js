// Draw a transparent pixel party popper and its three New Year celebration effects.
import {pixelSprite} from './pixel-art.js';

const palette={N:'#302b39',Y:'#d9b56e',F:'#f6dda0',R:'#cf7974',P:'#ac91bd',B:'#81b3c8',G:'#86aa8b'};
const cells=Array.from({length:24},()=>Array(24).fill('.'));
// A striped cone points down-left; the broad, dark-rimmed opening faces up-right.
for(let y=8;y<=22;y++)for(let x=3;x<=22;x++){
  const a=(x-4)*14-(22-y)*7,b=(22-y)*18-(x-4)*4,c=(22-y)*11+(x-4)*10;
  if(a>=0&&b>=0&&c<=224)cells[y][x]=['Y','R','P','Y'][Math.floor((x+y)/3)%4];
}
function line(x,y,a,b,color){const n=Math.max(Math.abs(a-x),Math.abs(b-y));for(let i=0;i<=n;i++)cells[Math.round(y+(b-y)*i/n)][Math.round(x+(a-x)*i/n)]=color;}
line(4,22,11,8,'N');line(4,22,22,18,'N');line(11,8,22,18,'N');line(12,9,21,17,'F');line(13,9,22,17,'Y');
const body=pixelSprite(77,cells.map(row=>row.join('')),2,palette).svg;
const star=(x,y,color)=>`<path fill="${color}" d="M${x-1} ${y-5}h2v4h4v2h-4v4h-2v-4h-4v-2h4z"/>`;
const burst=(x,y,color)=>star(x,y,palette.F)+[-1,0,1].flatMap(dx=>[-1,0,1].filter(dy=>dx||dy).map(dy=>`<rect x="${x+dx*10-1}" y="${y+dy*10-1}" width="3" height="3" fill="${color}"/>`)).join('');
const confetti=Array.from({length:18},(_,i)=>{
  const angle=(-164+i*13)*Math.PI/180,radius=30+(i%4)*8,dx=Math.round(Math.cos(angle)*radius),dy=Math.round(Math.sin(angle)*radius);
  const color=Object.values(palette)[1+i%6];
  return `<rect x="32" y="23" width="${i%3===0?4:2}" height="${i%2?4:2}" fill="${color}" style="--pop-x:${dx}px;--pop-y:${dy}px;--pop-delay:${i%4*70}ms"/>`;
}).join('');

export const popperCursorSvg='<g class="seasonal-popper__body">'+body+'</g>'
  +'<g class="seasonal-popper__sparkles">'+[star(34,8,palette.F),star(46,22,palette.B),star(19,4,palette.P)].map(svg=>'<g>'+svg+'</g>').join('')+'</g>'
  +'<g class="seasonal-popper__confetti" shape-rendering="crispEdges">'+confetti+'</g>'
  +'<g class="seasonal-popper__fireworks"><g>'+burst(24,-12,palette.Y)+'</g><g>'+burst(60,9,palette.B)+'</g></g>'
  +'<g transform="translate(33 23) rotate(-48)"><g class="seasonal-popper__horn" fill="none" stroke-width="3" stroke-linejoin="miter"><path d="M0 0H11V-5H21V1H28V-4H34" stroke="#ac91bd"/><path d="M0 3H11V-2H21V4H28V-1H34" stroke="#f6dda0"/></g></g>'
  +'<text class="seasonal-popper__toot" x="35" y="5" font-family="monospace" font-size="8" font-weight="bold" fill="#f6dda0" stroke="#302b39" stroke-width=".6" paint-order="stroke">TOOT!</text>';

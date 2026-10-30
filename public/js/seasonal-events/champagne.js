// Draw a transparent pixel champagne bottle, popping cork, toast and New Year fireworks.
import {pixelSprite} from './pixel-art.js';

const palette={N:'#242d2c',G:'#477c59',g:'#315541',L:'#73a576',Y:'#d9b56e',F:'#f6dda0',W:'#eee5d2',H:'#a6855d'};
const cells=Array.from({length:24},()=>Array(24).fill('.'));
const box=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)cells[j][i]=c;};
box(9,3,6,7,'N');box(10,3,4,7,'Y');box(11,3,1,6,'F');box(10,9,4,2,'G');
box(8,10,8,2,'N');box(9,10,6,2,'G');box(7,12,10,2,'N');box(8,12,8,2,'G');
box(6,14,12,8,'N');box(7,14,10,8,'G');box(7,21,10,2,'N');box(8,21,8,1,'g');
box(8,12,1,9,'L');box(16,14,1,7,'g');box(8,15,8,5,'W');box(8,14,8,1,'Y');box(8,19,8,1,'Y');
box(11,15,2,4,'Y');box(10,16,4,2,'Y');box(9,20,6,1,'G');
const body=pixelSprite(77,cells.map(row=>row.join('')),2,palette).svg;
const bubbles=[[-3,0],[2,-1],[5,2],[-5,3],[0,4]].map(([x,y],i)=>`<rect x="${23+x}" y="${5+y}" width="${i%2?2:3}" height="${i%2?2:3}" style="--bubble-x:${x*2}px;animation-delay:${-i*.4}s"/>`).join('');
const foam=Array.from({length:18},(_,i)=>{
  const dx=(i%2?-1:1)*(10+i%5*5),dy=-22-i%4*6;
  return `<rect x="23" y="5" width="${i%3?2:4}" height="${i%3?2:4}" style="--foam-x:${dx}px;--foam-y:${dy}px;--foam-delay:${i%4*60}ms"/>`;
}).join('');
const glass='<path d="M10 6h8v10l-2 4h-4l-2-4zM14 20v12M9 33h10" fill="none" stroke="#eee5d2" stroke-width="2"/><path d="M12 11h4v5l-1 2h-2l-1-2z" fill="#d9b56e"/>';
const burst=(x,y,color)=>[-1,0,1].flatMap(dx=>[-1,0,1].filter(dy=>dx||dy).map(dy=>`<rect x="${x+dx*9}" y="${y+dy*9}" width="3" height="3" fill="${color}"/>`)).join('')+`<path d="M${x} ${y-5}v10m-5-5h10" stroke="#f6dda0" stroke-width="2"/>`;

export const champagneCursorSvg='<g class="seasonal-champagne__body">'+body
  +'<g class="seasonal-champagne__cork"><path d="M19 0h10v5h-2v3h-6V5h-2z" fill="#a6855d"/><path d="M21 1h6v2h-6z" fill="#d9b56e"/></g>'
  +'<g class="seasonal-champagne__bubbles" fill="#f6dda0">'+bubbles+'</g>'
  +'<g class="seasonal-champagne__foam" fill="#eee5d2"><path class="seasonal-champagne__jet" d="M22 8V0h-3v-7h-4v-5h5v-6h8v6h5v5h-4V0h-3v8z"/>'+foam+'</g></g>'
  +'<g class="seasonal-champagne__toast" transform="translate(0 -14)"><g class="seasonal-champagne__glass-left">'+glass+'</g><g transform="translate(20 0)"><g class="seasonal-champagne__glass-right">'+glass+'</g></g><path class="seasonal-champagne__clink" d="M23-2v-5m-7 6-3-4m17 4 3-4" stroke="#f6dda0" stroke-width="2"/></g>'
  +'<g class="seasonal-champagne__fireworks"><g>'+burst(5,-8,'#d9b56e')+'</g><g>'+burst(55,3,'#81b3c8')+'</g></g>';

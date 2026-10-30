// Christmas and New Year pixel drawings share a small transparent winter palette.
import { pixelSprite } from './pixel-art.js';
const colors={R:'#bd6060',r:'#853f48',W:'#eee5d2',w:'#c1c9ce',G:'#66876e',g:'#3f6254',Y:'#d9b56e',F:'#f6dda0',B:'#7196ac',b:'#455d7c',P:'#a084ad',S:'#dca78c',N:'#302b39',H:'#986e50'};
function drawing(kind,paint){
  const cells=Array.from({length:24},()=>Array(24).fill('.'));
  const box=(x,y,w,h,c)=>{for(let j=Math.max(0,y);j<Math.min(24,y+h);j++)for(let i=Math.max(0,x);i<Math.min(24,x+w);i++)cells[j][i]=c;};
  const line=(x,y,a,b,c)=>{const n=Math.max(Math.abs(a-x),Math.abs(b-y));for(let i=0;i<=n;i++)box(Math.round(x+(a-x)*i/(n||1)),Math.round(y+(b-y)*i/(n||1)),1,1,c);};
  const disc=(x,y,r,c)=>{for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r)box(x+i,y+j,1,1,c);};
  const star=(x,y,r,c)=>{line(x-r,y,x+r,y,c);line(x,y-r,x,y+r,c);line(x-r+1,y-r+1,x+r-1,y+r-1,c);line(x+r-1,y-r+1,x-r+1,y+r-1,c);};
  paint({box,line,disc,star});return pixelSprite(kind,cells.map(row=>row.join('')),2,colors);
}
const santa=(d,face=true)=>{const{box,disc}=d;box(6,5,12,6,'R');box(8,3,8,3,'R');box(11,2,6,2,'R');box(16,4,4,3,'R');disc(20,7,2,'W');box(4,8,15,3,'W');box(6,11,12,7,'S');box(5,14,3,5,'W');box(16,14,3,5,'W');box(7,17,10,4,'W');box(9,20,6,2,'W');box(10,14,4,2,'R');box(8,16,8,2,'W');if(face){box(8,12,2,2,'N');box(14,12,2,2,'N');box(11,18,2,1,'r');}};
const clock=(d,hands=true)=>{const{disc,box,line}=d;disc(12,12,10,'Y');disc(12,12,8,'b');disc(12,12,7,'W');for(const[x,y]of[[11,6],[17,11],[11,17],[6,11]])box(x,y,2,2,'Y');if(hands){line(12,12,12,7,'N');line(12,12,16,14,'N');}box(11,11,2,2,'Y');};
const gift=({box})=>{box(3,9,18,12,'R');box(2,7,20,4,'r');box(10,7,4,14,'Y');box(5,3,5,4,'Y');box(14,3,5,4,'Y');box(8,5,8,3,'Y');};
const bell=({box,disc})=>{box(10,2,4,3,'Y');disc(12,11,7,'Y');box(5,11,14,7,'Y');box(3,17,18,3,'F');box(10,20,4,2,'H');box(7,7,2,7,'F');};
const tree=({box,line})=>{box(10,18,4,5,'H');for(const[y,w]of[[4,3],[7,5],[10,7],[13,9]])for(let j=0;j<5;j++)box(12-w-j,y+j,(w+j)*2,1,'G');for(const[x,y]of[[10,9],[15,13],[7,16],[17,18]])box(x,y,2,2,'R');line(6,14,18,18,'Y');box(11,2,3,3,'Y');};
export const christmasArtwork=[
  drawing(20,d=>santa(d)),drawing(21,tree),
  drawing(22,({star,line})=>{star(12,12,9,'w');for(const[x,y]of[[6,6],[18,6],[6,18],[18,18]]){line(x-2,y,x+2,y,'W');line(x,y-2,x,y+2,'W');}}),
  drawing(23,({disc,box,line})=>{disc(12,16,6,'W');disc(12,8,4,'W');box(8,2,8,3,'N');box(6,5,12,2,'N');box(8,11,9,2,'R');box(15,12,2,5,'R');box(10,8,1,1,'N');box(14,8,1,1,'N');box(12,9,3,1,'Y');line(6,15,2,11,'H');line(18,15,22,11,'H');box(12,16,1,4,'N');}),
  drawing(24,({box,line,disc})=>{disc(12,13,6,'H');disc(12,17,4,'S');box(9,12,2,2,'N');box(15,12,2,2,'N');disc(12,17,2,'R');for(const x of[6,18]){line(x,10,x,2,'H');line(x,6,x-3,3,'H');line(x,7,x+3,4,'H');}}),
  drawing(25,({box,line})=>{box(3,10,16,8,'R');box(16,7,5,9,'r');box(5,17,2,4,'Y');box(17,17,2,4,'Y');line(3,21,20,21,'Y');line(20,21,22,18,'Y');box(5,5,8,5,'Y');box(8,4,2,8,'G');}),
  drawing(26,({box})=>{box(10,3,9,12,'R');box(5,13,14,7,'R');box(4,15,4,5,'R');box(9,2,11,4,'W');box(14,9,3,3,'G');box(6,18,6,3,'W');}),
  drawing(27,({box})=>{box(7,2,9,4,'W');box(5,4,4,5,'W');box(14,4,4,17,'W');for(let y=5;y<20;y+=5)box(14,y,4,2,'R');box(7,2,3,4,'R');box(5,6,4,2,'R');}),
  drawing(28,gift),
  drawing(29,({box,disc})=>{box(10,2,4,5,'H');disc(12,14,8,'R');box(5,13,14,3,'Y');box(7,8,3,4,'W');box(10,18,5,2,'r');}),drawing(30,bell),
  drawing(31,({disc,box})=>{disc(12,12,10,'G');disc(12,12,5,'.');box(4,6,3,3,'g');box(17,14,3,3,'g');box(7,18,10,3,'R');box(10,16,4,7,'R');box(4,11,2,2,'Y');box(17,5,2,2,'Y');}),
  drawing(32,({disc,line})=>{disc(7,9,5,'G');disc(17,9,5,'G');disc(12,18,5,'G');line(4,5,12,12,'g');line(20,5,12,12,'g');disc(10,12,2,'R');disc(14,12,2,'R');disc(12,15,2,'R');}),
  drawing(33,({disc,box,line})=>{disc(12,6,4,'H');box(9,9,6,9,'H');line(5,11,19,11,'H');box(3,10,4,3,'H');box(17,10,4,3,'H');box(7,17,4,6,'H');box(13,17,4,6,'H');box(10,5,1,1,'W');box(14,5,1,1,'W');box(10,8,5,1,'W');box(11,12,2,2,'R');box(11,16,2,2,'G');}),
  drawing(34,({box,disc})=>{box(8,9,8,12,'W');box(10,7,4,3,'H');disc(12,5,3,'Y');box(12,3,1,3,'F');box(10,12,2,6,'w');box(5,21,14,2,'Y');}),
  drawing(35,({box,disc})=>{disc(7,11,4,'R');box(3,10,8,9,'R');box(10,11,3,4,'R');box(3,18,8,3,'W');disc(18,11,4,'G');box(14,10,8,9,'G');box(12,11,3,4,'G');box(14,18,8,3,'W');}),
  drawing(36,({box})=>{box(4,3,16,5,'R');box(12,6,5,15,'R');for(let y=4;y<20;y+=4)box(12,y,5,2,'G');box(3,3,3,5,'G');box(12,21,1,2,'Y');box(14,21,1,2,'Y');box(16,21,1,2,'Y');}),
  drawing(37,({box,disc})=>{for(let j=0;j<12;j++)box(12-Math.floor(j/2),2+j,3+j,1,'R');box(4,14,15,4,'W');disc(19,16,3,'W');}),
  drawing(38,({box})=>{box(8,3,9,12,'r');box(5,13,14,8,'N');box(3,16,4,5,'N');box(7,3,11,4,'W');box(9,10,6,3,'Y');box(11,11,2,1,'N');box(4,21,16,2,'H');}),
  drawing(39,({disc,box})=>{disc(12,13,7,'S');box(5,10,14,4,'G');for(let y=2;y<10;y++)box(12-(y-2),y,1+2*(y-2),1,'G');box(8,14,2,2,'N');box(14,14,2,2,'N');box(10,18,4,1,'R');}),
  drawing(40,({box})=>{box(6,2,12,5,'N');box(8,6,8,6,'S');box(9,8,1,1,'N');box(14,8,1,1,'N');box(5,12,14,8,'R');box(10,12,4,8,'Y');box(7,20,4,3,'N');box(13,20,4,3,'N');box(7,3,10,1,'Y');}),
  drawing(41,({box,line})=>{for(let y=3;y<11;y++)box(12-(y-3),y,1+2*(y-3),1,'r');box(4,10,16,12,'H');box(3,10,18,2,'W');box(7,14,3,4,'Y');box(15,14,3,4,'Y');box(11,16,3,6,'r');line(5,22,20,22,'W');}),
  drawing(42,({box,line})=>{box(6,4,12,3,'Y');box(5,8,2,12,'H');box(17,8,2,12,'H');box(7,19,10,3,'Y');box(8,9,8,10,'b');box(11,12,3,6,'F');line(8,4,12,1,'H');line(12,1,16,4,'H');}),
  drawing(43,({star})=>star(12,12,10,'Y')),
  drawing(44,({disc,box,line})=>{disc(12,5,3,'S');box(7,2,10,1,'Y');for(let y=9;y<21;y++)box(12-Math.floor((y-9)/2),y,1+2*Math.floor((y-9)/2),1,'W');line(9,10,3,6,'w');line(15,10,21,6,'w');}),
  drawing(45,({disc,box})=>{disc(12,13,8,'H');box(9,3,6,4,'H');for(let y=7;y<21;y+=4)for(let x=6;x<19;x+=5)box(x+(y%2),y,3,2,'Y');}),
  drawing(46,({disc,box})=>{disc(12,11,9,'B');disc(12,11,7,'b');box(7,14,10,3,'W');box(10,8,4,6,'G');box(8,11,8,2,'G');box(11,5,2,2,'Y');box(5,19,14,4,'H');box(4,6,2,5,'W');}),
];
export const newYearArtwork=[
  drawing(50,d=>clock(d)),
  drawing(51,({box})=>{box(10,2,4,6,'Y');box(9,6,6,3,'G');box(7,9,10,13,'g');box(7,13,10,5,'W');box(9,14,6,3,'Y');}),
  drawing(52,({line,box})=>{for(const[x,s]of[[5,1],[18,-1]]){line(x,4,x+s,12,'W');line(x+s,12,x+s*3,12,'W');line(x+s*3,12,x+s*4,4,'W');line(x+s,8,x+s*3,8,'Y');line(x+s*2,12,x+s*2,20,'W');box(x,21,6,1,'Y');}}),
  drawing(53,({box,star})=>{for(let y=3;y<21;y++)box(12-Math.floor((y-3)/2),y,1+2*Math.floor((y-3)/2),1,y%4<2?'P':'Y');star(12,3,2,'F');}),
  drawing(54,({star})=>{star(12,12,9,'Y');star(12,12,5,'R');}),
  drawing(55,({star})=>{star(8,8,6,'B');star(17,16,5,'P');}),
  drawing(56,({disc,box})=>{disc(12,12,9,'b');for(let y=5;y<20;y+=4)for(let x=5;x<20;x+=4)if((x-12)**2+(y-12)**2<65)box(x,y,3,3,(x+y)%8?'B':'W');box(11,1,2,3,'Y');}),
  drawing(57,({box,line})=>{box(9,8,7,10,'R');for(let y=2;y<8;y++)box(12-(y-2),y,1+2*(y-2),1,'Y');line(9,16,5,21,'P');line(15,16,20,21,'P');box(11,18,3,5,'F');}),
  drawing(58,({box})=>{box(3,4,18,18,'W');box(3,4,18,5,'R');box(6,2,2,5,'H');box(16,2,2,5,'H');box(11,11,3,8,'Y');box(8,13,3,2,'Y');box(8,19,9,2,'Y');}),
  drawing(59,({disc,line})=>{disc(7,8,5,'R');disc(17,10,5,'B');line(7,13,12,22,'Y');line(17,15,12,22,'Y');}),
  drawing(60,({line,box})=>{for(const[x,c]of[[4,'R'],[10,'B'],[17,'Y']]){line(x,3,x+3,7,c);line(x+3,7,x,11,c);line(x,11,x+3,15,c);line(x+3,15,x,20,c);box(x+2,21,2,2,c);}}),
  drawing(61,({box,line})=>{box(3,15,18,5,'Y');for(const x of[4,11,18]){line(x,15,x-1,6,'Y');line(x-1,6,x+2,10,'Y');}box(5,16,3,2,'P');box(15,16,3,2,'R');}),
  drawing(62,({box,disc})=>{box(3,13,18,6,'Y');for(const x of[5,12,19]){box(x-1,7,3,6,'Y');disc(x,6,2,'F');}box(5,15,3,2,'R');box(15,15,3,2,'B');}),
  drawing(63,gift),
  drawing(64,({star,line})=>{star(12,12,7,'P');line(4,20,20,4,'Y');star(18,6,3,'F');}),
  drawing(65,({box,star})=>{for(const[x,h]of[[2,9],[7,15],[13,11],[18,17]]){box(x,23-h,4,h,'b');box(x+1,24-h,1,2,'Y');}star(8,5,3,'R');star(18,3,2,'Y');}),
  drawing(66,({disc,box})=>{disc(12,12,9,'Y');disc(12,10,5,'.');box(3,3,5,9,'Y');box(16,3,5,9,'Y');box(8,3,8,5,'.');box(5,8,2,2,'H');box(17,8,2,2,'H');}),
  drawing(67,({disc,box})=>{disc(12,12,9,'Y');disc(12,12,6,'H');box(11,6,2,13,'F');box(8,9,8,2,'F');box(8,15,8,2,'F');}),
  drawing(68,({disc,line})=>{for(const[x,y]of[[8,7],[16,7],[8,15],[16,15]])disc(x,y,4,'G');line(12,13,15,22,'g');}),
  drawing(69,({line,box})=>{line(4,19,18,7,'Y');line(5,20,19,8,'Y');box(3,18,5,4,'R');box(17,4,4,5,'P');box(19,9,3,2,'P');}),
  drawing(70,({star})=>star(12,12,9,'B')),
  drawing(71,({box,line})=>{box(3,6,18,14,'W');line(3,6,12,14,'Y');line(21,6,12,14,'Y');box(10,13,5,5,'R');}),
  drawing(72,({star,line})=>{star(17,7,5,'F');line(13,10,3,18,'Y');line(15,12,6,21,'R');line(10,10,2,14,'B');}),
  drawing(73,({box,disc})=>{box(5,13,14,7,'H');box(5,11,14,4,'W');disc(12,9,3,'R');box(4,20,16,2,'Y');}),
  drawing(74,({line,star})=>{line(4,22,15,10,'H');star(15,8,6,'Y');star(15,8,3,'W');}),
  drawing(75,({box,star})=>{for(const[x,y,c]of[[3,3,'R'],[17,4,'Y'],[5,17,'B'],[18,16,'P'],[11,10,'G']])box(x,y,3,4,c);star(12,4,2,'F');}),
  drawing(76,({box,line})=>{box(2,8,20,3,'P');box(4,12,16,8,'B');box(8,16,8,6,'Y');line(2,6,7,2,'R');line(21,6,17,2,'R');box(10,3,3,4,'Y');}),
];
export const santaCursorSvg=drawing(20,d=>santa(d,false)).svg
  + '<g class="seasonal-santa__eyes"><g class="seasonal-santa__pupils"><rect x="16" y="24" width="4" height="4" fill="#302b39"/><rect x="28" y="24" width="4" height="4" fill="#302b39"/></g></g><rect class="seasonal-santa__mouth" x="22" y="36" width="4" height="2" fill="#853f48"/>'
  + '<g class="seasonal-santa__ho" font-family="monospace" font-weight="bold" font-size="8" fill="#f6dda0" stroke="#302b39" stroke-width=".6" paint-order="stroke"><text x="10" y="18">Ho!</text><text x="20" y="14">Ho!</text><text x="16" y="20">Ho!</text></g>'
  + '<g transform="translate(28 20) scale(.45)"><g class="seasonal-santa__bell">'+christmasArtwork[10].svg+'</g></g>'
  + '<g transform="translate(8 28) scale(.5)"><g class="seasonal-santa__gift">'+christmasArtwork[8].svg+'</g></g>';

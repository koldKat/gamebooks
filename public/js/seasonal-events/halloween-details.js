// Draw complete alternate poses and connected details for Halloween creatures.
import {pixelSprite} from './pixel-art.js';
import {compactPixelSvg} from './pixel-paths.js';
const draw=rows=>pixelSprite(0,rows).svg;
export const mummySkeleton=draw([
  '........................',
  '..........WWWWWW........',
  '..........WNNNNW........',
  '..........WNWNWW........',
  '..........WWNWWW........',
  '...........WWWW.........',
  '............WW..........',
  '........WWWWWWWWWW......',
  '.....WWWW...WW...WW.....',
  '....WW...WWWWWW...WW....',
  '...WW....W..WW.W...WW...',
  '...WW....WWWWWWW....W...',
  '.........W..WW.W........',
  '.........WWWWWWW........',
  '.........W..WW.W........',
  '.........WWWWWWW........',
  '.........WW..WW.........',
  '........WW...WW.........',
  '.......WW....WW.........',
  '......WW......WW........',
  '.....WW.......WW........',
  '....WW........WWW.......',
  '...WWW........WWW.......',
]);
export function batFrames(index){
  // Independent complete wings overlap a stationary torso at their hinges.
  const points=index===10?[[11,11],[8,10],[2,5],[3,12],[5,15],[7,13],[9,16],[11,15]]
    :[[11,11],[8,10],[1,9],[2,15],[4,13],[6,17],[8,15],[11,17]];
  const inside=(x,y)=>{
    let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
      const[a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;
    }return hit;
  };
  const make=side=>{
    const grid=Array.from({length:24},()=>Array(24).fill('.'));
    for(let y=0;y<24;y++)for(let x=0;x<24;x++)if(inside(side==='left'?x+.5:23.5-x,y+.5))grid[y][x]='B';
    return draw(grid.map(row=>row.join('')));
  };
  const grid=Array.from({length:24},()=>Array(24).fill('.'));
  const put=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)grid[j][i]=color;};
  put(10,9,4,9,'N');put(9,7,2,3,'N');put(13,7,2,3,'N');put(10,11,1,1,'Y');put(13,11,1,1,'Y');put(10,18,1,2,'N');put(13,18,1,2,'N');
  return '<g class="haunt-bat-wing-left">'+make('left')+'</g><g class="haunt-bat-wing-right">'+make('right')+'</g><g class="haunt-bat-body">'+draw(grid.map(row=>row.join('')))+'</g>';
}

export function catArtwork(){
  const body=compactPixelSvg(draw([
    '........................','........................','........................','........................',
    '.................N..N...','.................NN.NN..','................ENNNNNE.',
    '................ENNNNNE.','................ENNNNNE.','................ENNNNNNE',
    '...............ENNNNNNE.','........ENNNNNNNNNNNNE..','.......ENNNNNNNNNNNNE...',
    '......ENNNNNNNNNNNNNE...','......ENNNNNNNNNNNNNE...','......ENNNNNNNNNNNNE....',
    '.......ENNNNNNNNNNNE....','........ENNNNNNNNNE.....','.........NNNNNNNNN......',
  ]));
  const tail=compactPixelSvg(draw([
    '........................','........................','........................','........................',
    '........................','........................','........................','...EEE..................',
    '..ENNE..................','..ENE...................','..ENE...................',
    '..ENNE..................','...ENNE.................','....ENNE................',
    '.....ENNNE..............','......ENNNE.............','.......ENNNE............',
  ]));
  const legs='<g class="haunt-cat-leg-back"><path fill="#27242f" d="M18 34h4v10h-6v-2h2zM30 34h4v10h-6v-2h2z"/></g><g class="haunt-cat-leg-front"><path fill="#15151e" d="M22 34h4v10h-6v-2h2zM34 32h4v12h-6v-2h2z"/></g>';
  const eyes='<g class="haunt-cat-eyes"><path fill="#d8ad69" d="M38 16h4v2h-4z"/></g>';
  const still=legs+body+tail+eyes;
  return {kind:6,pixelated:true,animated:true,svg:'<g class="halloween-animated haunt-kind-6 haunt-sprite-13"><g class="haunt-cat-jump">'+legs+body+'<g class="haunt-cat-tail">'+tail+'</g>'+eyes+'</g></g>',staticMask:`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+still+'</svg>')}")`};
}

export function scarecrowArtwork(index){
  const rows=[
    '........................','..........HHHH..........','.........HHHHHH.........',
    '........HHHHHHHH........','......HHHHHHHHHHHH......','.........YYYYYY.........',
    '.........YNYNYY.........','.........YYYYYY.........','.........YNNNNY.........',
    '..........YYYY..........','...........HH...........',
    '..Y.YY.BBBBBBBBBB.YY.Y..','.YYYHHHBBBBBBBBBBHHHYYY.',
    '..Y.YY.BBBBYYBBBB.YY.Y..','.......BBBBBBBBBB.......','.......BBBYBBYBBB.......',
    '.......BBBBBBBBBB.......','.......BB.BBBB.BB.......','.......Y...HH...Y.......',
    '...........HH...........','...........HH...........','...........HH...........',
    '...........HH...........','........................',
  ];
  const body=compactPixelSvg(draw(index===26?rows.map(r=>r.replaceAll('B','R')):rows));
  const eyes='<g class="haunt-scarecrow-eyes"><path fill="#9b3749" d="M20 12h2v2h-2zM24 12h2v2h-2z"/></g>';
  return {kind:index===26?16:13,pixelated:true,animated:true,svg:'<g class="halloween-animated haunt-kind-'+(index===26?16:13)+' haunt-sprite-'+index+'">'+body+eyes+'</g>',staticMask:`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+body+'</svg>')}")`};
}

export function potionArtwork(){
  const glass=compactPixelSvg(draw([
    '........................','.........HHHHHH.........','.........HhhhhH.........',
    '.........HHHHHH.........','..........f..f..........','..........f..f..........',
    '..........f..f..........','..........f..f..........','.........f....f.........',
    '........f......f........','.......f........f.......','......f..........f......',
    '.....f............f.....','.....f............f.....','....f..............f....',
    '....f..............f....','....f..............f....','....f..............f....',
    '.....f............f.....','.....f............f.....','......f..........f......',
    '.......ffffffffff.......','........................','........................',
  ]));
  const liquid='<g class="haunt-potion-liquid"><path fill="currentColor" d="M12 26h24v4h2v8h-2v2h-4v2H16v-2h-4v-2h-2v-8h2z"/></g>';
  const shine='<path fill="#b6bfce" fill-opacity=".65" d="M12 28h2v8h-2zM14 24h2v2h-2z"/>';
  const smoke='<g class="haunt-potion-smoke"><path fill="#b6bfce" d="M20 6h8V2h6v4h4v8h-4v4H18v-4h-6V8h8z"/></g>';
  const still=liquid+glass+shine;
  return {kind:18,pixelated:true,animated:true,svg:'<g class="halloween-animated haunt-kind-18 haunt-sprite-17">'+still+smoke+'</g>',staticMask:`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+still+'</svg>')}")`};
}

export function eyeFire(index){
  const centers=index===5?[[15,18],[31,18]]:[[18,32],[31,32]];
  return '<g class="haunt-eye-fire">'+centers.map(([x,y])=>`<g transform="translate(${x} ${y}) scale(${index===25?'.6 .7':'1 1'})"><path fill="#a33c28" d="M-4 3v-5h2v-5h2v3h2v-2h2v9z"/><path fill="#e59131" d="M-2 3v-5h2v-2h2v7z"/><path fill="#f6d58c" d="M0 3v-3h2v3z"/></g>`).join('')+'</g>';
}

export function cauldronArtwork(){
  const body=compactPixelSvg(draw([
    '........................','........................','........................','........................',
    '........................','........................','........................','........................',
    '......EEEEEEEEEEEE......','....EEZZzzzzzzZZZZEE....','...EEZZZZZZZZZZZZZZEE...',
    '..EEEZZZzzZZZZzzZZZEEE..','..ENEEEEEEEEEEEEEEEENE..','..ENEONNNNNNNNNNNOENE..',
    '...EEONNNNNNNNNNNOEE...','....EONNNNNNNNNNNOE....','....EONNNNNNNNNNNOE....',
    '.....EONNNNNNNNNOE.....','.....EONNNNNNNNNOE.....','......EOONNNNNOOE......',
    '.......EEEEEEEEE........','.......ENN..NNE.........','......ENN....NNE........',
  ]));
  const bubbles='<g class="haunt-cauldron-bubbles"><path class="haunt-bubble-one" fill="#a0ae7c" d="M14 16h4v4h-4z"/><path class="haunt-bubble-two" fill="#7c9566" d="M24 18h4v4h-4z"/><path class="haunt-bubble-three" fill="#a0ae7c" d="M32 16h4v4h-4z"/></g>';
  const steam='<g class="haunt-cauldron-steam"><path fill="#b6bfce" d="M20 16v-4h2V8h-2V4h2v4h2v4h-2v4z"/><path fill="#7c9566" d="M30 16v-4h-2V8h2v4h2v4z"/></g>';
  return {kind:17,pixelated:true,animated:true,svg:'<g class="halloween-animated haunt-kind-17 haunt-sprite-20">'+body+bubbles+steam+'</g>',staticMask:`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+body+'</svg>')}")`};
}

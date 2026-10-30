// Draw a rounded champagne bottle and its bounded celebration effects in the shared cursor style.
const body=`<path d="M20 7h8v12q0 4 5 7 5 3 5 10v6q0 4-5 4H15q-5 0-5-4v-6q0-7 5-10 5-3 5-7Z" fill="#5d873a" stroke="#283b1b" stroke-width="1.5"/>
<path d="M27 19q0 7 5 10 4 4 4 9v5q0 2-4 2H19q10-4 9-12Z" fill="#355729"/>
<path d="M21 7h6v13h-6Z" fill="#d7a74e" stroke="#78501e" stroke-width="1"/><path d="m21 10 6 2m-6 1 6 2m-6 1 6 2" stroke="#ffe39a" stroke-width=".7"/>
<path d="M21 22q-1 5-6 8-2 4-2 10m3-10 1-2m17 7v7" fill="none" stroke="#9fbd60" stroke-width="1.1" stroke-linecap="round"/>
<path d="M13 32q11 3 22 0v10q-11 3-22 0Z" fill="#f0dfae" stroke="#7c5727" stroke-width="1.1"/>
<path d="M15 34q9 2 18 0m-18 6q9 2 18 0" fill="none" stroke="#c29b4d" stroke-width=".6"/>
<path d="m24 34 1.2 2.2 2.5.4-1.8 1.8.4 2.4-2.3-1.1-2.3 1.1.4-2.4-1.8-1.8 2.5-.4Z" fill="#b58231" stroke="#77501f" stroke-width=".5"/>
<path d="m15 36 2 1-2 1m18-2-2 1 2 1" fill="none" stroke="#b78838" stroke-width=".6"/>`;
const bubbles=[[-3,0],[2,-1],[5,2],[-5,3],[0,4]].map(([x,y],i)=>`<rect x="${23+x}" y="${5+y}" width="${i%2?2:3}" height="${i%2?2:3}" rx="1" style="--bubble-x:${x*2}px;animation-delay:${-i*.4}s"/>`).join('');
const foam=Array.from({length:18},(_,i)=>{
  const dx=(i%2?-1:1)*(10+i%5*5),dy=-22-i%4*6;
  return `<rect x="23" y="5" width="${i%3?2:4}" height="${i%3?2:4}" rx="1" style="--foam-x:${dx}px;--foam-y:${dy}px;--foam-delay:${i%4*60}ms"/>`;
}).join('');
const glass='<path d="M10 6h8v10q0 5-4 5t-4-5ZM14 21v11M9 33q5-2 10 0" fill="none" stroke="#eee5d2" stroke-width="2"/><path d="M12 11h4v5l-1 2h-2l-1-2z" fill="#d9b56e"/>';
const burst=(x,y,color)=>[-1,0,1].flatMap(dx=>[-1,0,1].filter(dy=>dx||dy).map(dy=>`<rect x="${x+dx*9}" y="${y+dy*9}" width="3" height="3" fill="${color}"/>`)).join('')+`<path d="M${x} ${y-5}v10m-5-5h10" stroke="#f6dda0" stroke-width="2"/>`;

export const champagneCursorSvg='<g class="seasonal-champagne__body">'+body
  +'<g class="seasonal-champagne__cork"><path d="M21 1q-3 0-3 3t3 3v2h6V7q3 0 3-3t-3-3Z" fill="#b49a70" stroke="#80694a" stroke-width="1"/><path d="M21 1h6v2h-6z" fill="#d9b56e"/></g>'
  +'<g class="seasonal-champagne__bubbles" fill="#f6dda0">'+bubbles+'</g>'
  +'<g class="seasonal-champagne__foam" fill="#eee5d2"><path class="seasonal-champagne__jet" d="M22 8q2-12-4-17-4-4 0-6 2-2 5 1-1-7 3-7 4 0 2 8 7-5 9-1 2 3-4 6-8 5-7 16Z"/>'+foam+'</g></g>'
  +'<g class="seasonal-champagne__toast" transform="translate(0 -14)"><g class="seasonal-champagne__glass-left">'+glass+'</g><g transform="translate(20 0)"><g class="seasonal-champagne__glass-right">'+glass+'</g></g><path class="seasonal-champagne__clink" d="M23-2v-5m-7 6-3-4m17 4 3-4" stroke="#f6dda0" stroke-width="2"/></g>'
  +'<g class="seasonal-champagne__fireworks"><g>'+burst(5,-8,'#d9b56e')+'</g><g>'+burst(55,3,'#81b3c8')+'</g></g>';

// Draw a rounded champagne bottle and its bounded celebration effects in the shared cursor style.
const body=`<path d="M20 7h8v13q0 3 5 7 4 3 4 9v6q0 4-5 4H16q-5 0-5-4v-6q0-6 4-9 5-4 5-7Z" fill="#497b58" stroke="#284c3c" stroke-width="1.4"/>
<path d="M20 7h8v12h-8Z" fill="#c8a568" stroke="#8c7147" stroke-width="1.2"/><path d="M22 9v8m-6 16v8" stroke="#92b28b" stroke-width="1.2" stroke-linecap="round"/>
<rect x="14" y="32" width="20" height="10" rx="2" fill="#e8dec0" stroke="#a98b55" stroke-width="1.1"/>
<path d="m24 33 1.2 2.3 2.5.4-1.8 1.8.4 2.5-2.3-1.2-2.3 1.2.4-2.5-1.8-1.8 2.5-.4Z" fill="#b69a5d"/>`;
const bubbles=[[-3,0],[2,-1],[5,2],[-5,3],[0,4]].map(([x,y],i)=>`<rect x="${23+x}" y="${5+y}" width="${i%2?2:3}" height="${i%2?2:3}" rx="1" style="--bubble-x:${x*2}px;animation-delay:${-i*.4}s"/>`).join('');
const foam=Array.from({length:18},(_,i)=>{
  const dx=(i%2?-1:1)*(10+i%5*5),dy=-22-i%4*6;
  return `<rect x="23" y="5" width="${i%3?2:4}" height="${i%3?2:4}" rx="1" style="--foam-x:${dx}px;--foam-y:${dy}px;--foam-delay:${i%4*60}ms"/>`;
}).join('');
const glass='<path d="M10 6h8v10l-2 4h-4l-2-4zM14 20v12M9 33h10" fill="none" stroke="#eee5d2" stroke-width="2"/><path d="M12 11h4v5l-1 2h-2l-1-2z" fill="#d9b56e"/>';
const burst=(x,y,color)=>[-1,0,1].flatMap(dx=>[-1,0,1].filter(dy=>dx||dy).map(dy=>`<rect x="${x+dx*9}" y="${y+dy*9}" width="3" height="3" fill="${color}"/>`)).join('')+`<path d="M${x} ${y-5}v10m-5-5h10" stroke="#f6dda0" stroke-width="2"/>`;

export const champagneCursorSvg='<g class="seasonal-champagne__body">'+body
  +'<g class="seasonal-champagne__cork"><path d="M21 1q-3 0-3 3t3 3v2h6V7q3 0 3-3t-3-3Z" fill="#b49a70" stroke="#80694a" stroke-width="1"/><path d="M21 1h6v2h-6z" fill="#d9b56e"/></g>'
  +'<g class="seasonal-champagne__bubbles" fill="#f6dda0">'+bubbles+'</g>'
  +'<g class="seasonal-champagne__foam" fill="#eee5d2"><path class="seasonal-champagne__jet" d="M22 8q2-12-4-17-4-4 0-6 2-2 5 1-1-7 3-7 4 0 2 8 7-5 9-1 2 3-4 6-8 5-7 16Z"/>'+foam+'</g></g>'
  +'<g class="seasonal-champagne__toast" transform="translate(0 -14)"><g class="seasonal-champagne__glass-left">'+glass+'</g><g transform="translate(20 0)"><g class="seasonal-champagne__glass-right">'+glass+'</g></g><path class="seasonal-champagne__clink" d="M23-2v-5m-7 6-3-4m17 4 3-4" stroke="#f6dda0" stroke-width="2"/></g>'
  +'<g class="seasonal-champagne__fireworks"><g>'+burst(5,-8,'#d9b56e')+'</g><g>'+burst(55,3,'#81b3c8')+'</g></g>';

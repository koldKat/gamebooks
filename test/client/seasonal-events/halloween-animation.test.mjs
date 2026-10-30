import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {halloweenArtwork} from '../../../public/js/seasonal-events/artwork.js';
import {halloweenClassics} from '../../../public/js/seasonal-events/classic-artwork.js';
import {halloweenCreatures} from '../../../public/js/seasonal-events/creature-artwork.js';
import {hauntedArtwork} from '../../../public/js/seasonal-events/haunted-artwork.js';

function pixels(svg){
  const map=new Map();
  for(const m of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"\/>/g)){
    const[,x,y,w,h,fill]=m;for(let j=+y;j<+y+ +h;j++)for(let i=+x;i<+x+ +w;i++)map.set(j*48+i,fill);
  }
  for(const p of svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g))for(const m of p[2].matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g)){
    const[,x,y,w,h]=m;for(let j=+y;j<+y+ +h;j++)for(let i=+x;i<+x+ +w;i++)map.set(j*48+i,p[1]);
  }
  return [...map].sort(([a],[b])=>a-b);
}
const originals=[...halloweenClassics,...halloweenCreatures,...hauntedArtwork];

test('the permanent static backup exactly preserves all25 non-web Halloween drawings',()=>{
  const backup=fs.readFileSync('public/images/seasonal/halloween-static-backup.svg','utf8');
  const saved=new Map([...backup.matchAll(/<g id="halloween-sprite-(\d+)"[^>]*>([\s\S]*?)<\/g><\/g>/g)].map(m=>[+m[1],m[2]]));
  assert.equal(saved.size,25);
  originals.forEach((art,index)=>{if(art.kind!==4)assert.deepEqual(pixels(saved.get(index)),pixels(art.svg),'backup'+index);});
});
test('unchanged silhouettes keep every pixel while corrected creatures use compact alternate poses',()=>{
  assert.equal(halloweenArtwork.length,27);
  let animated=0;halloweenArtwork.forEach((art,index)=>{
    if(art.kind===4){assert.equal(art,originals[index]);assert.equal(art.animated,undefined);return;}
    assert.equal(art.animated,true);
    if([2,9].includes(index)){
      const colors=index===2?{'#df862b':'#b47735','#994a24':'#79502c','#f1b14b':'#c7934b'}:{'#df862b':'#a59446','#994a24':'#71602f','#f1b14b':'#c0ad64'};
      assert.deepEqual(pixels(art.svg),pixels(originals[index].svg).map(([p,c])=>[p,colors[c]||c]),'only pumpkin skin palette changes');
    }else if(![3,5,10,13,16,17,19,20,23,25,26].includes(index))assert.deepEqual(pixels(art.svg),pixels(originals[index].svg),'animated pixels'+index);animated++;
  });assert.equal(animated,25);
});
test('creatures have connected moving parts',()=>{
  for(const [index,parts]of [[0,['body','hem']],[1,['tool','eyes']],[2,['ember','stalk']],[5,['jaw']],[12,['engraving']],[14,['legs-left','legs-right']],[16,['brain','face']],[19,['wrap-0','wrap-5']],[21,['cape']],[22,['brim']],[24,['windows']],[25,['flame']]]){
    for(const part of parts)assert.ok(halloweenArtwork[index].svg.includes('haunt-part--'+part),'part'+index+'/'+part);
  }
  assert.ok(halloweenArtwork[13].svg.includes('haunt-cat-tail')&&halloweenArtwork[13].svg.includes('haunt-cat-eyes'));
});
test('pixel paths remove most SVG elements and all per-pixel animations',()=>{
  const before=originals.filter(a=>a.kind!==4).reduce((n,a)=>n+(a.svg.match(/<rect /g)||[]).length,0);
  const after=halloweenArtwork.filter(a=>a.kind!==4).reduce((n,a)=>n+(a.svg.match(/<(?:rect|path) /g)||[]).length,0);
  assert.ok(after<before*.35,JSON.stringify({before,after}));
  assert.ok(!fs.readFileSync('public/css/halloween-artwork.css','utf8').includes('.haunt-part--ember rect'));
  console.log(JSON.stringify({originalPixelElements:before,compactPixelElements:after}));
});

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
  return [...map].sort(([a],[b])=>a-b);
}
const originals=[...halloweenClassics,...halloweenCreatures,...hauntedArtwork];

test('the permanent static backup exactly preserves all25 non-web Halloween drawings',()=>{
  const backup=fs.readFileSync('public/images/seasonal/halloween-static-backup.svg','utf8');
  const saved=new Map([...backup.matchAll(/<g id="halloween-sprite-(\d+)"[^>]*>([\s\S]*?)<\/g><\/g>/g)].map(m=>[+m[1],m[2]]));
  assert.equal(saved.size,25);
  originals.forEach((art,index)=>{if(art.kind!==4)assert.deepEqual(pixels(saved.get(index)),pixels(art.svg),'backup'+index);});
});
test('every non-web sprite is animated without losing or inventing a single original pixel',()=>{
  assert.equal(halloweenArtwork.length,27);
  let animated=0;halloweenArtwork.forEach((art,index)=>{
    if(art.kind===4){assert.equal(art,originals[index]);assert.equal(art.animated,undefined);return;}
    assert.equal(art.animated,true);assert.deepEqual(pixels(art.svg),pixels(originals[index].svg),'animated pixels'+index);animated++;
  });assert.equal(animated,25);
});
test('creatures have their own moving parts, including four fingers and one thumb',()=>{
  for(const [index,parts]of [[0,['hem']],[1,['tool','eyes']],[2,['ember','stalk']],[3,['wing-left','wing-right']],[5,['jaw']],[13,['tail']],[14,['legs-left','legs-right']],[16,['brain','jaw']],[17,['finger-0','finger-1','finger-2','finger-3','thumb']],[19,['cloth']],[20,['cape','fangs']],[22,['brim']],[23,['arm-left','arm-right']],[24,['windows']],[25,['flame']]]){
    for(const part of parts)assert.ok(halloweenArtwork[index].svg.includes('haunt-part--'+part),'part'+index+'/'+part);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {halloweenArtwork} from '../../../public/js/seasonal-events/artwork.js';
import {halloweenPalette} from '../../../public/js/seasonal-events/halloween-pixels.js';

test('all 27 new Halloween objects use the same static pixel grid and palette',()=>{
 assert.equal(halloweenArtwork.length,27);assert.equal(halloweenArtwork.filter(a=>a.kind===4).length,2);
 assert.equal(new Set(halloweenArtwork.map(a=>a.name)).size,27);
 for(const art of halloweenArtwork){
  assert.equal(art.pixelSize,3);assert.equal(art.animated,undefined);
  assert.ok(!/animate|haunt-|seasonal-pumpkin|style=/.test(art.svg));
  const paths=[...art.svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)];assert.ok(paths.length>0&&paths.length<=9);
  for(const[,fill,d]of paths){assert.ok(Object.values(halloweenPalette).includes(fill));
   for(const m of d.matchAll(/M(\d+) (\d+)h(\d+)v3h-\d+z/g)){
    const[,x,y,w]=m.map(Number);assert.ok(x%3===0&&y%3===0&&w%3===0&&x+w<=48&&y+3<=48);
   }
  }
 }
});
test('the retired Halloween artwork and animation files are removed',()=>{
 for(const name of ['classic-artwork.js','creature-artwork.js','haunted-artwork.js','halloween-animation.js','halloween-details.js','spider-crawl.js'])assert.equal(fs.existsSync('public/js/seasonal-events/'+name),false,name);
 assert.equal(fs.existsSync('public/images/seasonal/halloween-static-backup.svg'),false);
 assert.equal(fs.existsSync('public/css/halloween-artwork.css'),false);
});

// Five more Halloween silhouettes in the shared transparent retro pixel style.
import { pixelSprite } from './pixel-art.js';
// Fit each new silhouette to the same 22-pixel footprint as the established pack.
function sprite(kind, rows) {
  const points = rows.flatMap((row,y) => [...row].flatMap((color,x) => color === '.' ? [] : [{x,y}]));
  const left = Math.min(...points.map(p=>p.x)), top = Math.min(...points.map(p=>p.y));
  const width = Math.max(...points.map(p=>p.x))-left+1, height = Math.max(...points.map(p=>p.y))-top+1;
  const scale = 22 / Math.max(width,height), w = Math.round(width*scale), h = Math.round(height*scale);
  const x0 = Math.floor((24-w)/2), y0 = Math.floor((24-h)/2);
  return pixelSprite(kind, Array.from({length:24},(_,y) => Array.from({length:24},(_,x) =>
    x<x0 || x>=x0+w || y<y0 || y>=y0+h ? '.' : rows[top+Math.min(height-1,Math.floor((y-y0)/scale))][left+Math.min(width-1,Math.floor((x-x0)/scale))]).join('')));
}
export const hauntedArtwork = [
  // Crooked witch hat with a purple brim and a warm square buckle.
  sprite(12, ['........................','............PPPP........','...........PbbP.........','..........PbbP..........','.........PbbbP..........','........PbbbbP..........','.......PbbbbbP..........','......PbbbbbbP..........','.....PbbbbbbbP..........','....PRRRRRRRRRP.........','....PRRYYYYRRRP.........','....PRRYNNYRRRP.........','....PRRYYYYRRRP.........','...PbbbbbbbbbbbP........','..PbbbbbbbbbbbbbP.......','.PbbbbbbbbbbbbbbbP......','..PPPPPPPPPPPPPPP.......','........................','........................','........................','........................','........................','........................','........................']),
  // Ragged blue-coated scarecrow on a stake, with one missing button eye.
  sprite(13, ['........................','..........HHHH..........','.........HHHHHH.........','.......HHHHHHHHHH.......','.........YYYYYY.........','.........YNYYYY.........','.........YYYYYY.........','..........YNNY..........','...........HH...........','....YY..BBBBBBBB..YY....','...YYYYBBBBBBBBBBYYYY...','....YY.BBYYBBYYBB.YY....','.......BBBBBBBBBB.......','........BBBBBBBB........','.........BBHHBB.........','.........B.HH.B.........','........Y..HH..Y........','...........HH...........','...........HH...........','........................','........................','........................','........................','........................']),
  // Crooked haunted house with glowing windows and a tiny chimney.
  sprite(14, ['........................','...............NN.......','.........N.....NN.......','........NNN....NN.......','.......NNNNN...NN.......','......NNNNNNN.NNNN......','.....NNNNNNNNNNNNNN.....','....NNNNNNNNNNNNNNNN....','.....NBBBBBBBBBBBBN.....','.....NBBYYBBYYBBBBN.....','.....NBBYYBBYYBBBBN.....','.....NBBBBBBBBBBBBN.....','.....NBBBBBBBBBBBBN.....','.....NBBYYBBNNNBBBN.....','.....NBBYYBBNYNBBBN.....','.....NBBBBBBNYNBBBN.....','....NNNNNNNNNNNNNNNN....','........................','........................','........................','........................','........................','........................','........................']),
  // Candle burning through a small skull, with wax drips.
  sprite(15, ['........................','...........L............','..........LYL...........','...........Y............','.........TTTTT..........','.........TWTWT..........','.........TWTTT..........','.........TWTTT..........','.......TTTTTTTTT........','......TTWWWWWWWTT.......','.....TTWWWWWWWWWTT......','.....TWWNNWWWNNWWT......','.....TWWNNWWWNNWWT......','......TWWWWNWWWWT.......','.......TWWNNNWWT........','.......TWTWTWTWT........','........TTTTTTT.........','........................','........................','........................','........................','........................','........................','........................']),
  // Tattered scarecrow with a stitched grin and uneven straw arms.
  sprite(16, ['........................','..........HHHH..........','.........HHHHHH.........','.......HHHHHHHHHH.......','.........YYYYYY.........','.........YNYNYY.........','.........YYYYYY.........','..........YNNY..........','...........HH...........','.....YY.RRRRRRRR.YY.....','....YYYYRRRRRRRRYYYY....','.....YY.RRHRRHRR.YY.....','........RRRRRRRR........','.........RRRRRR.........','..........HHHH..........','.........HH..HH.........','........YY....YY........','........................','........................','........................','........................','........................','........................','........................']),
];

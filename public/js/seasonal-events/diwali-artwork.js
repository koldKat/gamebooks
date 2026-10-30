// Transparent retro Diwali lamps, lanterns, flowers, sweets and firework motifs.
import { pixelSprite } from './pixel-art.js';
import { festiveArtwork } from './festive-artwork.js';
const colors = { Y:'#e2b96d', F:'#f5df9a', A:'#d68b49', H:'#9d543d',
  R:'#bc6471', P:'#865c8e', T:'#5d9990', G:'#71845c', W:'#e5d2b0' };
const sprite = rows => pixelSprite(11, rows, 3, colors);
const lamp = [
  '................','.......F........','......FFF.......','......FYF.......',
  '.....FYYAF......','......YAY.......','.......A........','................',
  '..YYYYYYYYYYYY..','...AHHHHHHHHA...','....AHHHHHHA....','.....AYYYYA.....',
  '......AHHA......','.......AA.......','................','................',
];
const lantern = [
  '.......YY.......','.......YY.......','.....YYYYYY.....','....YRRRRRRY....',
  '...YRRRFFRRRY...','...YRRRFFRRRY...','...YRRFFFFRRY...','...YRRFFFFRRY...',
  '...YRRRFFRRRY...','....YRRFFRRY....','.....YYYYYY.....','......YYYY......',
  '.....Y.YY.Y.....','.....Y.YY.Y.....','.......YY.......','................',
];
const rangoli = [
  '.......T........','......TTT.......','...P...T...P....','..PPP..Y..PPP...',
  '...P..YYY..P....','.....YYFYY......','.T..YYFFFYY..T..','TTTYYFFYFFYYTTT.',
  '.T..YYFFFYY..T..','.....YYFYY......','...P..YYY..P....','..PPP..Y..PPP...',
  '...P...T...P....','......TTT.......','.......T........','................',
];
const spark = [
  '.......F........','..Y....Y....Y...','...Y...Y...Y....','....F..Y..F.....',
  '.....Y.F.Y......','......FFF.......','..YYYFFYFFYYY...','......FFF.......',
  '.....Y.F.Y......','....F..Y..F.....','...Y...Y...Y....','..Y....Y....Y...',
  '.......F........','................','................','................',
];
const flower = [
  '................','......RRRR......','....RRAAAARR....','...RAAYYYYAAR...',
  '..RAAYFFFFYAAR..','..RAYFFYYFFYAR..','..RAYFYAAYFYAR..',
  '..RAYFYAAYFYAR..','..RAYFFYYFFYAR..','..RAAYFFFFYAAR..','...RAAYYYYAAR...',
  '....RRAAAARR....','......RRRR......','.....GG..GG.....','....GG....GG....','................',
];
const sweets = [
  '................','................','.......YY.......','......YFYY......',
  '...YY.YYYY.YY...','..YFYY....YFYY..','..YYYY.YY.YYYY..','......YFYY......',
  '..YYYYYYYYYYYY..','...TWWWWWWWT....','....TTWWWWT.....','.....TTTTT......',
  '.......T........','......TTT.......','................','................',
];
const gift = [
  '................','.....YY..YY.....','....YPPYYPPY....','.....YYYYYY.....',
  '..RRRRRYYRRRRR..','..RWWWWYYWWWWR..','..RRRRRYYRRRRR..','...RRRRYYRRRR...',
  '...RPPPYYPPPR...','...RPPPYYPPPR...',
  '...RRRRYYRRRR...','...RRRRYYRRRR...','...RRRRYYRRRR...','...RRRRRRRRRR...',
  '................','................',
];
const recolor = (rows, from, to) => rows.map(row => row.replaceAll(from, to));
export const diwaliArtwork = [lamp, lantern, rangoli, spark, flower, sweets, gift,
  recolor(lamp,'H','P'), recolor(lantern,'R','T'), recolor(rangoli,'P','R'),
  recolor(spark,'Y','T'), recolor(flower,'R','Y')].map(sprite).concat(festiveArtwork);
export const diyaSvg = diwaliArtwork[0].svg;
// Separate flame and bowl let the cursor burn without moving the clay lamp.
export const diyaCursorSvg = `<g class="seasonal-diya__fire"><g class="seasonal-diya__flame">${sprite(lamp.map((row, y) => y < 7 ? row : '.'.repeat(16))).svg}</g></g>`
  + sprite(lamp.map((row, y) => y >= 7 ? row : '.'.repeat(16))).svg
  + '<g class="seasonal-diya__embers" fill="#f5df9a"><rect x="21" y="11" width="3" height="3"/><rect x="24" y="14" width="2" height="2"/><rect x="18" y="15" width="2" height="2"/></g>'
  + '<g class="seasonal-diya__smoke" fill="none" stroke="#c5b69c" stroke-width="2" stroke-linejoin="miter"><path d="M23 17h-3v-4h5V9h-5V5h3"/><path d="M25 15h3v-4h-4V7h5V3"/></g>';

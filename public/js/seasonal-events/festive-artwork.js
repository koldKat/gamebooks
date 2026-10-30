// Additional Diwali pixel motifs with distinct silhouettes and transparent edges.
import { pixelSprite } from './pixel-art.js';
const colors = { Y:'#e2b96d', F:'#f5df9a', A:'#d68b49', H:'#9d543d',
  R:'#bc6471', P:'#865c8e', T:'#5d9990', G:'#71845c', W:'#e5d2b0' };
const sprite = rows => pixelSprite(11, rows.split('/'), 3, colors);
export const festiveArtwork = [
  // Lotus with pink outer petals, warm centre and green resting leaves.
  sprite('................ /.......R......../......RFR......./...R..RFR..R..../..RFR.RFR.RFR.../..RFFRRFRRFFR.../...RFFRFRFFR..../...RRFFFFFRR..../....RRFFFRR...../.....RFFFR....../..GGG.YYY.GGG.../...GGGGGGGGG..../.....GGGGG....../................ /................ /................'.replaceAll(' ','')),
  // Brass temple bell, open rim and a separate clapper.
  sprite('................ /.......YY......./......YFFY....../.......YY......./......YYYY....../.....YFFFFY...../.....YFFFFY...../....YFFFFFFY..../....YFFFFFFY..../...YFFFFFFFFY.../..YYYYYYYYYYYY../.....HHHHHH...../.......YY......./.......AA......./................ /................'.replaceAll(' ','')),
  // Painted kalash, coconut and five pointed mango leaves.
  sprite('................ /.......HH......./......HAHA....../......AHAH....../...G..AHAH..G.../....GGHHHHGG..../.....GGGGGG...../.....YYYYYY...../....YRYYYYRY..../...YRYYYYYYRY.../...YRRYYYYRRY.../...YYYYRRYYYY.../....YYYYYYYY..../.....YYYYYY...../................ /................'.replaceAll(' ','')),
  // Toran: marigold flowers and hanging green leaves.
  sprite('................ /..YYYYYYYYYYYY../..A..A..A..A..../.AY.AY.AY.AY..../..A..A..A..A..../..G..G..G..G..../.GG.GG.GG.GG..../.GG.GG.GG.GG..../..G..G..G..G..../................ /................ /................ /................ /................ /................ /................'.replaceAll(' ','')),
  // Two lamps whose flames lean away from one another.
  sprite('................ /....F......F..../...FY......YF.../...YA......AY.../....A......A..../................ /.YYYYYY..YYYYYY./..AHHA....AHHA../...AA......AA.../................ /................ /................ /................ /................ /................ /................'.replaceAll(' ','')),
  // A drooping string of warm festival lights.
  sprite('................ /..H..........H../..HH........HH../...HH......HH.../....HHHHHHHH..../...Y..Y..Y..Y.../..YFY.FF.FF.YFY./...Y..YY.YY..Y../................ /................ /................ /................ /................ /................ /................ /................'.replaceAll(' ','')),
  // Tall brass standing lamp on a stepped foot.
  sprite('................ /.......F......../......FYF......./.......A......../....YYYYYYYY..../.....AYYYYA...../......YYYY....../.......YY......./.......YY......./......YFFY....../.......YY......./.......YY......./......YYYY....../....YYYYYYYY..../................ /................'.replaceAll(' ','')),
  // Peacock feather: teal eye, violet inner ring and a long green quill.
  sprite('................ /.....GGGGG....../....GTTTTTG...../...GTTYYYTTG..../...GTYPPPYTG..../...GTYPFPYTG..../...GTYPPPYTG..../....GTYYYTG...../.....GTTTG....../......GTG......./.......G......../......GG......../.....G.G......../....G..G......../.......G......../................'.replaceAll(' ','')),
  // Diamond rangoli, with small corner flourishes.
  sprite('................ /.......F......../..T...YYY...T.../...T.YPPPY.T..../....YPRRRPY...../...YPRFFF RPY..../..YPRFYFYFRPY.../.FYPRFYFYFRPYF../..YPRFYFYFRPY.../...YPRFFFRPY..../....YPRRRPY...../...T.YPPPY.T..../..T...YYY...T.../.......F......../................ /................'.replaceAll(' ','')),
  // Eight-spoked circular rangoli.
  sprite('................ /......TTTT....../....TTYFFYTT..../...TYFFYYFFYT.../..TYFYFYYFYFYT../..TFYFYFFYFYFT../.TYFYFFYYFFYFYT./.TFYYFYFFYFYYFT./.TFYYFYFFYFYYFT./.TYFYFFYYFFYFYT./..TFYFYFFYFYFT../..TYFYFYYFYFYT../...TYFFYYFFYT.../....TTYFFYTT..../......TTTT....../................'.replaceAll(' ','')),
  // Hand-held sparkler, with a long diagonal stick.
  sprite('................ /....F.....F...../.....Y...Y....../..F...YFY...F.../...YYYFFFYYY..../......YFY......./..F..Y.F.Y..F.../....Y..H..Y...../...F...H...F..../........H......./.........H....../..........H...../...........H..../............H.../................ /................'.replaceAll(' ','')),
  // Anar fountain sprays tiny gold sparks above its cone.
  sprite('................ /...F....F....F../....Y...Y...Y.../..F..Y..F..Y.F../...Y..Y.Y.Y.Y.../.....Y.YFY.Y..../....F..YYY..F.../......AYYYA...../......AYYYA...../.....ARYYYRA..../.....ARYYYRA..../....ARRYYYRRA.../....AYYYYYYYA.../....AAAAAAAAA.../................ /................'.replaceAll(' ','')),
  // Ground spinner, ringed with sparks.
  sprite('................ /......F..F....../...F...YY...F.../....Y.Y..Y.Y..../...Y.YYYYYY.Y.../..Y.YAAFF AAY.Y../.F.YAFYYYYFAY.F./...YAFYAAYFAY.../...YAFYAAYFAY.../.F.YAAFYYFAAY.F./..Y.YAAAAAAY.Y../...Y.YYYYYY.Y.../....Y.Y..Y.Y..../...F...YY...F.../......F..F....../................'.replaceAll(' ','')),
  // A plate of round laddoos, each with a pale highlight.
  sprite('................ /................ /......YYY......./.....YFYYY....../.....YYYYY....../...YYY...YYY..../..YFYYY.YFYYY.../..YYYYY.YYYYY.../...YYY...YYY..../..WWWWWWWWWWWW../...TWWWWWWWWT.../....TTTTTTTT..../................ /................ /................ /................'.replaceAll(' ','')),
  // Decorated doorway with a garland and two little entrance lamps.
  sprite('................ /..YYYYYYYYYYYY../..YRYYRYYRYYRY../..YG..G..G..GY../..Y..........Y../..Y.HHHHHHHH.Y../..Y.H......H.Y../..Y.H......H.Y../..Y.H......H.Y../..Y.H......H.Y../..Y.H......H.Y../..Y.H......H.Y../.F..H......H..F./.Y..HHHHHHHH..Y./.AAA........AAA./................'.replaceAll(' ','')),
];

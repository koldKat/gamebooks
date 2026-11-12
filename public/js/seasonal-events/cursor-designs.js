// Register three mouse companions per event, sharing their live and admin-preview factories.
import {createPumpkin} from './pumpkin.js';
import {createDiya} from './diya.js';
import {createSanta,createNewYearChampagne} from './winter-cursors.js';
import {createCursorCompanion} from './cursor-companion.js';
import {variantArtwork} from './variant-artwork.js';
import {lateAutumnArtwork} from './late-autumn-artwork.js';
import {fridayArtwork} from './friday-artwork.js';

const palettes={thanksgiving:['#bd915e','#a66c42','#8b9b62','#d8b778'],'st-nicholas':['#ad665b','#d8bd81','#91a17c','#d9d3bc'],'st-lucia':['#e6d7b2','#b7c18b','#c7a15f','#b77c73'],halloween:['#d38a38','#789961','#d8ceb0','#a66d79'],diwali:['#d8b779','#a37597','#789b75','#c1a169'],christmas:['#c4d0cc','#b77369','#a88860','#e0c28b'],'new-year':['#d7bb7d','#789dac','#a685b7','#648d6f']};
function variant(id,label,effects,durations,season){
 const actions=effects.map((name,i)=>({name,delay:[70000,90000,120000][Math.min(i,2)],spread:[60000,70000,90000][Math.min(i,2)],duration:durations[i],previewDelay:[4500,10000,16000,22000][i]}));
 return {id,label,colors:palettes[season]||['#897c91','#ba7772','#aaa391','#6c727e'],actions:effects,create:options=>{
  const stop=createCursorCompanion({...options,name:id,svg:variantArtwork[id]||lateAutumnArtwork[id]||fridayArtwork[id],face:true,actions});stop.node.classList.add('seasonal-variant');return stop;
 }};
}
export const cursorDesigns={
 'friday-13':[
  variant('black-cat','Black cat',['is-hissing','is-startled','is-shadowing'],[2400,2000,2800],'friday-13'),
  variant('cracked-mirror','Cracked mirror',['is-cracking','is-haunted','is-shuddering'],[2400,3000,1800],'friday-13'),
  variant('cursed-die','Slasher mask',['is-stalking','is-slashing','is-sawing'],[2400,2600,3200],'friday-13')],
 thanksgiving:[
  variant('turkey','Turkey',['is-fanning','is-gobbling','is-leaffall'],[2600,2200,2800],'thanksgiving'),
  variant('acorn','Acorn',['is-caplift','is-sprouting','is-leaffall'],[2400,3200,2800],'thanksgiving'),
  variant('harvest-pie','Harvest pie',['is-steaming','is-berrybounce','is-crustglow'],[2800,2400,2600],'thanksgiving')],
 'st-nicholas':[
  variant('nicholas','St. Nicholas',['is-blessing','is-bellringing','is-mitrelift'],[2600,2400,2600],'st-nicholas'),
  variant('ribbon-gift','Ribboned gift',['is-opening','is-bowbounce','is-ribbonwave'],[3000,2400,2600],'st-nicholas'),
  variant('treat-boot','Treat boot',['is-treatpop','is-candywave','is-snowpuff'],[3000,2400,2800],'st-nicholas')],
 'st-lucia':[
  variant('lucia-candle','Lucia candle',['is-flaring','is-embers','is-waxdrip'],[2600,2400,3000],'st-lucia'),
  variant('saffron-bun','Saffron bun',['is-steaming','is-uncoiling','is-sugarsparkle'],[2800,2600,2400],'st-lucia'),
  variant('candle-crown','Candle crown',['is-brightening','is-candledance','is-starlight'],[2600,2800,2400],'st-lucia')],
 halloween:[{id:'pumpkin',label:'Pumpkin',actions:['is-gaping','is-clacking','is-drooling'],colors:palettes.halloween,create:createPumpkin},
  variant('mummy','Mummy',['is-unwrapping','is-dusting','is-runes'],[3400,2100,2400],'halloween'),
  variant('zombie','Zombie',['is-exploding','is-screaming','is-flies','is-vomiting'],[3000,2000,2600,3400],'halloween')],
 diwali:[{id:'diya',label:'Diya lamp',actions:['is-flaring','is-sparking','is-smoking'],colors:palettes.diwali,create:createDiya},
  variant('lotus','Lotus',['is-blooming','is-fireflies','is-radiant'],[2600,2400,2200],'diwali'),
  variant('lantern','Lantern',['is-bright','is-sparking','is-smoking'],[2400,2500,2800],'diwali')],
 christmas:[{id:'santa',label:'Father Christmas',actions:['is-laughing','is-ringing','is-gifting'],colors:palettes.christmas,create:createSanta},
  variant('snowman','Snowman',['is-hatpop','is-sneezing','is-scarf'],[2200,3200,2400],'christmas'),
  variant('reindeer','Reindeer',['is-antlers','is-nose','is-breath'],[2000,2000,2400],'christmas')],
 'new-year':[{id:'champagne',label:'Champagne',actions:['is-popping','is-toasting','is-fireworks'],colors:palettes['new-year'],create:createNewYearChampagne},
  variant('partyhat','Party hat',['is-horn','is-confetti','is-wiggling'],[2400,2200,2200],'new-year'),
  variant('star','Celebration star',['is-comet','is-sparkling','is-rainbow'],[2600,2200,2400],'new-year')],
};

// Register three mouse companions per event, sharing their live and admin-preview factories.
import {createPumpkin} from './pumpkin.js';
import {createDiya} from './diya.js';
import {createSanta,createNewYearChampagne} from './winter-cursors.js';
import {createCursorCompanion} from './cursor-companion.js';
import {variantArtwork} from './variant-artwork.js';

const palettes={halloween:['#d38a38','#789961','#d8ceb0','#a66d79'],diwali:['#d8b779','#a37597','#789b75','#c1a169'],christmas:['#c4d0cc','#b77369','#a88860','#e0c28b'],'new-year':['#d7bb7d','#789dac','#a685b7','#648d6f']};
function variant(id,label,effects,durations,season){
 const actions=effects.map((name,i)=>({name,delay:[70000,90000,120000][i],spread:[60000,70000,90000][i],duration:durations[i],previewDelay:[4500,10000,16000][i]}));
 return {id,label,colors:palettes[season],actions:effects,create:options=>{
  const stop=createCursorCompanion({...options,name:id,svg:variantArtwork[id],face:true,actions});stop.node.classList.add('seasonal-variant');return stop;
 }};
}
export const cursorDesigns={
 halloween:[{id:'pumpkin',label:'Pumpkin',actions:['is-gaping','is-clacking','is-drooling'],colors:palettes.halloween,create:createPumpkin},
  variant('mummy','Mummy',['is-unwrapping','is-dusting','is-runes'],[3400,2100,2400],'halloween'),
  variant('zombie','Zombie',['is-exploding','is-screaming','is-flies'],[3000,2000,2600],'halloween')],
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

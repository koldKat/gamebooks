// Define Father Christmas and New Year champagne actions using the shared cursor lifecycle.
import { createCursorCompanion } from './cursor-companion.js';
import { santaCursorSvg } from './winter-artwork.js';
import { champagneCursorSvg } from './champagne.js';
const actions=names=>names.map((name,i)=>({name,delay:[70000,90000,120000][i],spread:[60000,70000,90000][i],duration:[2300,2500,2800][i],previewDelay:[4500,10000,16000][i]}));
export const createSanta=options=>createCursorCompanion({...options,name:'santa',svg:santaCursorSvg,face:true,
  actions:actions(['is-laughing','is-ringing','is-gifting'])});
export const createNewYearChampagne=options=>createCursorCompanion({...options,name:'champagne',svg:champagneCursorSvg,
  actions:actions(['is-popping','is-toasting','is-fireworks'])});

// The lamp shares the face, action timers and complete cleanup used by other companions.
import {diyaCursorSvg} from './diya-artwork.js';
import {createCursorCompanion} from './cursor-companion.js';
export function createDiya(options={}) {
  return createCursorCompanion({...options,name:'diya',svg:diyaCursorSvg,face:true,actions:[
    {name:'is-flaring',delay:70000,spread:60000,duration:1800,previewDelay:4500},
    {name:'is-sparking',delay:90000,spread:70000,duration:2400,previewDelay:10000},
    {name:'is-smoking',delay:120000,spread:90000,duration:3000,previewDelay:16000},
  ]});
}

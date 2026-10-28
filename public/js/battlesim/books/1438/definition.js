import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1438,title:'Rescue in Mirkwood',family:'tolkien-quest',stateKey:'sim1438',i18nPrefix:'battlesim1438',nightControls:true,itemModifiers:[
  {key:'owl',bonuses:{ob:1}},
  {key:'elvishSword',weapon:'sword',bonuses:{meleeOb:1}},
  {key:'weightlessStaff',weapon:'staff',bonuses:{magic:1}},
  {key:'banditSword',weapon:'sword',bonuses:{meleeOb:1}},
  {key:'magicAxe',weapon:'axe',bonuses:{meleeOb:1}},
  {key:'magicHelmet',bonuses:{db:1}},
  {key:'silkenShirt',bonuses:{db:2}},
]});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==55||new Set(entries.map(e=>e.section)).size!==55||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<1)))throw new Error('Incomplete Tolkien Quest roster');
  roster=structuredClone(entries);
});

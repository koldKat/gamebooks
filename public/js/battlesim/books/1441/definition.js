import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1441,title:'Mines of Moria',family:'tolkien-quest',stateKey:'sim1441',i18nPrefix:'battlesim1441',
  combatRules:{combatEscapeMinimum:9,fireboltPicks:1,calmEscapes:true,calmNeedsExit:true,charmOneOpponent:true,unmodifiedTwelve:true,
    missileChargeBonus:{field:'specialArrows',item:'recurvedBow',weapon:'bow',ob:2}},
  heroFields:[{key:'specialArrows',value:0,min:0,max:3},{key:'mirenna',value:0,min:0,max:3},{key:'healingNuts',value:0,min:0,max:1}],
  hiddenModifierControls:['elvenChain','orcSlayer','deviceCharges'],
  itemModifiers:[{key:'magicRing',bonuses:{magic:1}},{key:'greyCloak',bonuses:{db:1}},{key:'recurvedBow',missile:'bow',bonuses:{}}],
  recoveryItems:[{key:'mirenna',field:'mirenna',damage:10},{key:'nut',field:'healingNuts',damage:10}],woundedExitControl:true,
});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==16||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<1)))throw new Error('Incomplete Tolkien Quest roster');
  roster=entries.flatMap(entry=>[entry,...(entry.surprisedEntrySections??[]).map(from=>({...entry,section:entry.section+'-from'+from,label:entry.label+' (from §'+from+')',rules:{...entry.rules,surprised:true,allowedOpeningActions:[]},enemies:structuredClone(entry.enemies)}))]);
  if(roster.length!==20||new Set(roster.map(e=>e.section)).size!==20)throw new Error('Incomplete Tolkien Quest encounter references');
});

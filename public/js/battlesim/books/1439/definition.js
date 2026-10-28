import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1439,title:'A Spy in Isengard',family:'tolkien-quest',stateKey:'sim1439',i18nPrefix:'battlesim1439',
  combatRules:{combatEscapeMinimum:9,fireboltPicks:1,deviceSpell:'firebolt',calmEscapes:true,calmNeedsExit:true,charmOneOpponent:true,unmodifiedTwelve:true,advancedOpeningActions:true,spellChargeFields:{luck:'luckCharges'}},
  heroFields:[{key:'luckCharges',value:0,min:0,max:3}],deviceChargesMaximum:1,
  extraOpeningActions:['runPast','sneakPast'],
  hiddenModifierControls:['elvenChain','orcSlayer'],
  ruleFlags:['sourceRunAwayChoice'],
  itemModifiers:[{key:'mithril',armour:'none',bonuses:{db:3}},
    {key:'enchantedSword',weapon:'sword',bonuses:{meleeOb:2},throwBonuses:{missileOb:2}},
    {key:'carnilSword',weapon:'sword',bonuses:{meleeOb:2},throwBonuses:{missileOb:2}},
    {key:'carnilBow',missile:'bow',bonuses:{missileOb:1}},
    {key:'carnilCloak',bonuses:{sneakAway:1}}],
});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==37||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<1)))throw new Error('Incomplete Tolkien Quest roster');
  roster=entries.flatMap(entry=>entry.chooseOneOpponent?entry.enemies.map((enemy,index)=>({...entry,section:index?entry.section+'-choice'+(index+1):entry.section,label:enemy.displayName,enemies:[structuredClone(enemy)]})):entry);
  if(roster.length!==41||new Set(roster.map(e=>e.section)).size!==41)throw new Error('Incomplete Tolkien Quest encounter references');
});

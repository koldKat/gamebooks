import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1440,title:'Treason at Helm’s Deep',family:'tolkien-quest',stateKey:'sim1440',i18nPrefix:'battlesim1440',
  combatRules:{combatEscapeMinimum:9,fireboltPicks:1,deviceSpell:'firebolt',calmEscapes:true,allowedOpeningActions:['escape'],allowZeroEndurance:true,unmodifiedTwelve:true},
  heroFields:[{key:'strength',value:10,min:0,max:1000000}],deviceChargesMaximum:5,minimumOpponentEndurance:0,
  itemModifiers:[{key:'talisman',bonuses:{db:2}},{key:'enchantedSpear',weapon:'spear',bonuses:{weaponDamageMultiplier:2}}],
});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==18||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<0)))throw new Error('Incomplete Tolkien Quest roster');
  roster=entries.flatMap(entry=>[entry,...(entry.derivedEncounters??[]).map(derived=>({...entry,...derived,rules:{...entry.rules,...derived.rules},enemies:structuredClone(entry.enemies)}))]);
  if(roster.length!==24||new Set(roster.map(e=>e.section)).size!==24)throw new Error('Incomplete Tolkien Quest encounter references');
});

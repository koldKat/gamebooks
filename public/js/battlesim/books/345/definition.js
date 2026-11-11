// Identify Trail of the Wolf and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:345, title:"Trail of the Wolf", family:'lone-wolf', stateKey:'sim345', i18nPrefix:'battlesim345',
  supportsArchery:false, allowCombatPsychicChanges:true, roll:{skill:25,endurance:30},
  controls:[['kaiScreen','nextKaiScreen'],['deliverance','nextDeliverance'],['curingReady','nextCuringReady']],
  combatOptions:{
    psychicProfile:{blast:4,surge:8,cost:1,minimumEndurance:6},
    healing:{whenTrue:'deliverance',available:'curingReady',setupField:'nextCuringReady',threshold:8,amount:20},
  },
});
export let ENCOUNTERS=[];
export let ENCOUNTER_RULES={};
export let COMBAT_TABLE=[];
export const loadRoster=createMagnakaiRosterLoader(definition,catalog=>{
  COMBAT_TABLE=catalog.table;ENCOUNTERS=catalog.encounters;ENCOUNTER_RULES=catalog.rules;
});

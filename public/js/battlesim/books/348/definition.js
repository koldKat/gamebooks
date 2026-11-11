// Identify The Hunger of Sejanoz and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:348, title:"The Hunger of Sejanoz", family:'lone-wolf', stateKey:'sim348', i18nPrefix:'battlesim348',
  supportsArchery:false, allowCombatPsychicChanges:true, roll:{skill:25,endurance:30},
  controls:[['stolenIlluminatus','nextStolenIlluminatus'],['nexus','nextNexus'],['flame','nextFlame'],['deliverance','nextDeliverance'],['curingReady','nextCuringReady']],
  combatOptions:{
    psychicProfile:{blast:4,surge:8,cost:1,minimumEndurance:6},
    psychicModes:{kaiBlast:{bonus:0,cost:4,minimumEndurance:0,immunityFlag:'kaiBlastImmune',damageDice:2,zeroValue:1}},
    weaponFlame:{whenTrue:'flame',amount:1},
    healing:{whenTrue:'deliverance',available:'curingReady',setupField:'nextCuringReady',threshold:8,amount:20},
  },
});
export let ENCOUNTERS=[];
export let ENCOUNTER_RULES={};
export let COMBAT_TABLE=[];
export const loadRoster=createMagnakaiRosterLoader(definition,catalog=>{
  COMBAT_TABLE=catalog.table;ENCOUNTERS=catalog.encounters;ENCOUNTER_RULES=catalog.rules;
});

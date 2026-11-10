// Identify The Plague Lords of Ruel and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:333, title:'The Plague Lords of Ruel', family:'lone-wolf', stateKey:'sim333', i18nPrefix:'battlesim333',
  supportsArchery:false, allowPriorRounds:true, roll:{skill:25,endurance:30},
  basicEnduranceBonusField:'nextArmorEndurance',
  controls:[['screen','nextScreen'],['nonEdged','nextNonEdged'],['longWeapon','nextLongWeapon'],
    ['sommerwerd','nextSommerwerd'],['helshezag','nextHelshezag'],['deliverance','nextDeliverance'],['curingReady','nextCuringReady']],
  numericControls:[['armorEndurance','nextArmorEndurance',0,10000]],
  combatOptions:{
    psychicProfile:{blast:4,surge:6,cost:1,minimumEndurance:4},
    psychicModes:{kai:{bonus:8,cost:1,minimumEndurance:6,immunityFlag:'kaiImmune'}},
    healing:{whenTrue:'deliverance',available:'curingReady',setupField:'nextCuringReady',threshold:8,amount:20},
    permanentRoundCost:{whenTrue:'helshezag',minRound:2,amount:1},
  },
});
export let ENCOUNTERS=[];
export let ENCOUNTER_RULES={};
export let COMBAT_TABLE=[];
export const loadRoster=createMagnakaiRosterLoader(definition,catalog=>{
  COMBAT_TABLE=catalog.table;ENCOUNTERS=catalog.encounters;ENCOUNTER_RULES=catalog.rules;
});

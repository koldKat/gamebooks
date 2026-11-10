// Identify The Deathlord of Ixia and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:337, title:'The Deathlord of Ixia', family:'lone-wolf', stateKey:'sim337', i18nPrefix:'battlesim337',
  supportsArchery:false, allowPriorRounds:true, roll:{skill:25,endurance:30},
  basicEnduranceBonusField:'nextArmorEndurance',
  controls:[['sunLord','nextSunLord'],['sommerwerd','nextSommerwerd'],['dessiStone','nextDessiStone'],['enemyUndead','nextEnemyUndead'],['flame','nextFlame'],
    ['helshezag','nextHelshezag'],['deliverance','nextDeliverance'],['curingReady','nextCuringReady']],
  numericControls:[['armorEndurance','nextArmorEndurance',0,10000]],
  combatOptions:{
    psychicProfile:{blast:4,surge:6,cost:1,minimumEndurance:4},
    psychicModes:{kai:{bonus:8,cost:1,minimumEndurance:6,immunityFlag:'kaiImmune'},
      kaiBlast:{bonus:0,cost:4,minimumEndurance:0,immunityFlag:'kaiBlastImmune',damageDice:2,zeroValue:1}},
    weaponFlame:{whenTrue:'flame',amount:1},
    weaponLossMultiplier:{whenAny:['sommerwerd','dessiStone'],amount:2},
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

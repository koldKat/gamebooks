// Identify The Masters of Darkness and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:332, title:'The Masters of Darkness', family:'lone-wolf', stateKey:'sim332', i18nPrefix:'battlesim332',
  supportsArchery:false, allowPriorRounds:true, basicEnduranceBonusField:'nextArmorEndurance',
  controls:[['tracking','nextTracking'],['divination','nextDivination'],['screen','nextScreen'],
    ['unarmedMastery','nextUnarmedMastery'],['scion','nextScion'],['archmaster','nextArchmaster'],
    ['nexusArchmaster','nextNexusArchmaster'],['longWeapon','nextLongWeapon'],['dagger','nextDagger'],
    ['helshezag','nextHelshezag'],['curingReady','nextCuringReady'],['lastingWounds','nextLastingWounds']],
  numericControls:[['armorEndurance','nextArmorEndurance',0,10000],['openingModifier','nextOpeningModifier',-1000,1000]],
  combatOptions:{
    psychicProfile:{whenTrue:'archmaster',blast:3,surge:6,cost:1,minimumEndurance:4},
    healing:{whenTrue:'archmaster',available:'curingReady',setupField:'nextCuringReady',threshold:6,amount:20},
    permanentRoundCost:{whenTrue:'helshezag',minRound:2,amount:1},
  },
});
export let ENCOUNTERS=[];
export let ENCOUNTER_RULES={};
export let COMBAT_TABLE=[];
export const loadRoster=createMagnakaiRosterLoader(definition,catalog=>{
  COMBAT_TABLE=catalog.table;ENCOUNTERS=catalog.encounters;ENCOUNTER_RULES=catalog.rules;
});

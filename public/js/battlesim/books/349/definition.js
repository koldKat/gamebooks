// Identify The Storms of Chai and load its printed combat presets from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id:349, title:'The Storms of Chai', family:'lone-wolf', stateKey:'sim349', i18nPrefix:'battlesim349',
  supportsArchery:false, allowCombatPsychicChanges:true, allowContinuations:true, allowPriorRounds:true,
  roll:{skill:25,endurance:30},
  controls:[['enemyUndead','nextEnemyUndead'],['kirusami','nextKirusami'],['enhancedKirusami','nextEnhancedKirusami'],
    ['wardstone','nextWardstone'],['powerStrike','nextPowerStrike'],['malavan','nextMalavan'],
    ['animal','nextAnimal'],['flame','nextFlame'],['deliverance','nextDeliverance'],['curingReady','nextCuringReady']],
  combatOptions:{
    psychicProfile:{blast:4,surge:8,cost:1,minimumEndurance:6},
    psychicModes:{
      psiSurge:{bonus:6,cost:2,minimumEndurance:6,immunityFlag:'surgeImmune',allowedSections:[116]},
      kaiBlast:{bonus:0,cost:4,minimumEndurance:0,immunityFlag:'kaiBlastImmune',damageDice:2,zeroValue:1},
    },
    skillAdjustments:[
      {whenTrue:'kirusami',amount:1,equipmentOnly:true},
      {whenTrue:'powerStrike',amount:1,equipmentOnly:true},
      {whenTrue:'wardstone',amount:3,requiresUndead:true},
      {whenTrue:'malavan',amount:2,psychicModes:['blast','surge','psiSurge']},
    ],
    openingCosts:[{whenTrue:'powerStrike',amount:3,equipmentOnly:true}],
    firstRoundCosts:[{whenTrue:'kirusami',amount:3,enhancedWhen:'enhancedKirusami',enhancedAmount:4}],
    weaponLossMultiplier:{whenAny:['kirusami'],amount:2,enhancedWhen:'enhancedKirusami',enhancedAmount:3},
    weaponDamageBonuses:[{whenTrue:'powerStrike',amount:1}],
    weaponFlame:{whenTrue:'flame',amount:1,unlessAny:['kirusami']},
    healing:{whenTrue:'deliverance',available:'curingReady',setupField:'nextCuringReady',threshold:8,amount:20},
  },
});
export let ENCOUNTERS=[];
export let ENCOUNTER_RULES={};
export let COMBAT_TABLE=[];
export const loadRoster=createMagnakaiRosterLoader(definition,catalog=>{
  COMBAT_TABLE=catalog.table;ENCOUNTERS=catalog.encounters;ENCOUNTER_RULES=catalog.rules;
});

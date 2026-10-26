import {configureDestinyAbilityQuota} from './ability-quota.js';

// Mutates only the action's private combat snapshot. Health, equipment,
// character data and carried charges remain separate from temporary effects.
export function resetDestinyCombatActor(fight,sequence){
  const reset=sequence.restoreAbilities||sequence.carryAbilities;
  fight.effects=reset?fight.effects.filter(effect=>effect.kind==='health-penalty'||fight.abilityCatalog?.[effect.source]?.quotaStatus):[];
  fight.phase='start';fight.turn=null;
  if(!sequence.carryAbilities)fight.used={};
  delete fight.combatBoostsApplied;delete fight.portableShieldHealth;
  Object.assign(fight.hero,fight.hero.normal);
  for(const key of ['chargedAttacks','sacrificedSummons','lastHealthHitRound','nextHeroSpeedDice','sustainedDamage','combatStance','scoreRerollAbility'])delete fight[key];
  delete fight.encounter.heroStatuses;delete fight.encounter.growingStatus;
  if(reset){
    for(const key of ['opponentFaceCounts','savedHeroDie','savedOpponentDice','autoWinRound','phantomHealth','iceMantle','sweetSpot','trap','bearForm','crystalArmour','powerTotemActive'])delete fight[key];
    for(const key of ['blockedRounds','disableHeroAbilities',...(sequence.carryAbilities?[]:['cancelledAbilities','sacrificedAbilities'])])delete fight.encounter[key];
    if(!sequence.preserveQuota)configureDestinyAbilityQuota(fight,{preserveGrants:true});
    if(fight.encounter.abilityChallenge)fight.encounter.abilityChallenge.activePassives=[];
  }
}

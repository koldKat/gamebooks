// Declarative extensions used by family catalogs. These mutate only the copy
// already owned by useDestinyAbility; no application or character state writes.
import {destinyStat,destinyDamageScore,destinyStrike,hasDestinyAbility,isDestinyOpponentActive,destinyAttackerTarget,destinyOpponentDamageTotal,destinyImmuneToAbility,addDestinyStatEffect,healDestinyHero,applyDestinyHeroRoll} from './effects.js';
import {prepareDestinyDamage,destinyDie} from './damage.js';
import {cleanseDestinyStatuses} from './effects.js';
import {destinyHeroRecipient,healDestinyRecipient} from './allies.js';
import {applyDestinyCatalogDice} from './catalog-dice.js';
import {validateDestinyQuotaOverride} from './ability-quota.js';
import {startDestinySustainedAbility} from './sustained.js';

export function applyDestinyCatalogAction(fight,name,spec,options,roll) {
  if(spec.restoreStartingAttributes){
    fight.effects=fight.effects.filter(effect=>effect.kind!=='stat'||effect.target!=='hero'||!spec.restoreStartingAttributes.includes(effect.attribute)||spec.restoreStatSources&&!spec.restoreStatSources.includes(effect.source)||!(effect.amount<0||effect.set!==undefined&&effect.set<fight.hero.normal[effect.attribute]));
    for(const attribute of spec.restoreStartingAttributes)fight.hero[attribute]=fight.hero.normal[attribute];
  }
  applyDestinyCatalogDice(fight,name,spec,options,roll);
  startDestinySustainedAbility(fight,name,spec,options);
  if(spec.allowScoreRerolls)fight.scoreRerollAbility=name;
  if(spec.scoreFaceBonus)(fight.turn.scoreFaceBonuses??=[]).push({...spec.scoreFaceBonus,source:name});
  const attacker=fight.turn.pendingAbility?.event?.attacker ?? destinyAttackerTarget(fight);
  const target=spec.reflectIncoming||spec.hitAttacker ? attacker : options.target ?? fight.target;
  if(spec.rollTable){
    if(!Number.isInteger(target)||!isDestinyOpponentActive(fight,target))throw new RangeError('Choose a living opponent');
    fight.turn.pendingAbility={type:'catalog-table',name,spec:structuredClone(spec),options:structuredClone(options),target,returnPhase:fight.phase,dice:applyDestinyHeroRoll(fight,[destinyDie(roll)],'ability')};
    fight.phase='ability-rolled';
  }
  if(spec.markScoreBonus)fight.effects.push({kind:'score-flat',hero:true,opponent:target,amount:spec.markScoreBonus,from:fight.round+1,until:Number.MAX_SAFE_INTEGER,source:name});
  if (spec.reflectIncoming && options.target !== undefined && options.target!==attacker) throw new RangeError('Reflect damage to the attacker');
  if (spec.requiresMainHand && fight.equipment?.mainHand?.type!==spec.requiresMainHand) throw new RangeError('Required main-hand weapon is missing');
  if (spec.requiredTargetTrait && !fight.encounter?.traitsByTarget?.[target]?.includes(spec.requiredTargetTrait)) throw new RangeError('This opponent does not have the required trait');
  if(spec.hitAttacker&&options.target!==undefined&&options.target!==attacker)throw new RangeError('This ability targets the attacker');
  if(spec.targetHealthAtMost!==undefined&&(!isDestinyOpponentActive(fight,target)||fight.opponents[target].health>spec.targetHealthAtMost))throw new RangeError('Opponent Health is above the ability threshold');
  for(const [hand,types] of Object.entries(spec.requiresWeaponHands||{})) {
    if(!types.includes(fight.equipment?.[hand]?.type))throw new RangeError('Required '+hand+' weapon is missing');
  }
  if(spec.healthAtMost!==undefined&&fight.hero.health>spec.healthAtMost)throw new RangeError('Health is above the ability threshold');
  if(spec.fixedStatCost){
    const {attribute,amount}=spec.fixedStatCost;
    if(destinyStat(fight,'hero',attribute)<amount)throw new RangeError('Not enough '+attribute+' for this ability');
    addDestinyStatEffect(fight,'hero',attribute,-amount,null,name);
  }
  if(spec.payQuotaOverride){
    const ability=validateDestinyQuotaOverride(fight,name,spec,options),quota=fight.abilityQuota;
    fight.hero.health-=spec.payQuotaOverride;
    quota.paidExempt.push(ability);
    fight.history.push({type:'quota-exemption',round:fight.round,name,ability,healthCost:spec.payQuotaOverride});
  }
  if(spec.healWeaponStat)healDestinyHero(fight,(fight.equipment?.mainHand?.[spec.healWeaponStat]||0)+(fight.equipment?.leftHand?.[spec.healWeaponStat]||0));
  if(spec.scorePerOwnedAbility)fight.turn.damageScoreBonus=(fight.turn.damageScoreBonus||0)+(fight.abilities?.[spec.scorePerOwnedAbility.ability]||0)*spec.scorePerOwnedAbility.amount;
  if(spec.scoreFromStory)fight.effects.push({kind:'score-flat',hero:true,amount:fight.character.sourceCounters[spec.scoreFromStory.key],from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name});
  if(spec.reviveAlly){
    if(options.ally===undefined)throw new RangeError('Choose a fallen ally');
    const ally=destinyHeroRecipient(fight,options,true);
    if(ally.hero.health!==0)throw new RangeError('Choose a fallen ally');
    ally.hero.health=Math.min(spec.reviveAlly,ally.hero.maxHealth);
    const statuses=['bleed','disease','venom','burn','delirium','ongoing-damage'];
    cleanseDestinyStatuses(ally,statuses);
    delete ally.encounter.heroStatuses;delete ally.encounter.growingStatus;
  }
  if(spec.passiveRecoverySources){
    const sources=fight.turn.passiveSourcesByTarget?.[target]||{};
    const amount=Math.min(fight.turn.passiveDamageByTarget?.[target]||0,spec.passiveRecoverySources.reduce((sum,source)=>sum+(sources[source]||0),0));
    if(!amount)throw new RangeError('No eligible passive Health damage to recover');
    const ally=options.ally!==undefined||fight.allies?.length?destinyHeroRecipient(fight,{ally:options.ally??0},true):null;
    healDestinyHero(fight,amount);if(ally)healDestinyRecipient(fight,ally,amount);
  }
  if(spec.meditationHeal){
    const healing=spec.meditationHeal;
    fight.effects.push({kind:'end-heal',amount:hasDestinyAbility(fight,healing.upgradeAbility)?healing.upgradedAmount:healing.amount,from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name});
  }
  for(const change of spec.allOpponentStats||[])for(let index=0;index<fight.opponents.length;index++){
    if(isDestinyOpponentActive(fight,index)&&fight.opponents[index][change.attribute]!==null)addDestinyStatEffect(fight,index,change.attribute,change.amount,change.duration,name,change.delay||0);
  }
  for(const change of spec.attackerStats||[]){
    if(isDestinyOpponentActive(fight,attacker)&&fight.opponents[attacker][change.attribute]!==null)addDestinyStatEffect(fight,attacker,change.attribute,change.amount,change.duration,name,change.delay||0);
  }
  if(spec.stealPlayedAbility){
    const stolen=options.ability,stolenSpec=fight.abilityCatalog?.[stolen];
    if(!fight.encounter?.heroVersusHero || !fight.encounter.playedAbilitiesByTarget?.[target]?.includes(stolen) || !['sp','mo'].includes(stolenSpec?.category) || stolen===name)throw new RangeError('Choose a speed or modifier ability already played by the opposing hero');
    fight.abilities[stolen]=(fight.abilities[stolen]||0)+1;
    fight.used[stolen]=0;
  }
  if (spec.executeBelowStat || spec.executeBelowHealth !== undefined || spec.summonDamage) {
    if (!Number.isInteger(target) || !isDestinyOpponentActive(fight,target)) throw new RangeError('Choose a living opponent');
  }
  if (spec.executeBelowStat || spec.executeBelowHealth !== undefined) {
    const limit=spec.executeBelowStat ? destinyStat(fight,'hero',spec.executeBelowStat) : spec.executeBelowHealth;
    if (fight.opponents[target].health>limit) throw new RangeError('Opponent health is above the execution threshold');
    destinyStrike(fight,target,fight.opponents[target].health,name,'execution');
    if(spec.forceVictory)(fight.encounter??={}).forcedVictory=true;
  }
  if (spec.chargeDice) {
    const charge=fight.chargedAttacks?.[name];
    if (!charge) {
      (fight.chargedAttacks??={})[name]={round:fight.round,dice:spec.chargeDice};
    } else {
      if (fight.round<=charge.round) throw new RangeError('Release the charge in a later winning round');
      prepareDestinyDamage(fight,name,{category:spec.category,replacement:true,hit:'one',dice:charge.dice},options,roll);
      delete fight.chargedAttacks[name];
    }
  }
  if (spec.summonDamage) fight.effects.push({kind:'ongoing-damage',target,amount:spec.summonDamage,
    from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name,dispelOnDoubles:!!spec.dispelOnDoubles});
  if (spec.cancelDodge) {
    if (!fight.turn.opponentDodged || fight.turn.winner!=='hero') throw new RangeError('The opponent must dodge this round first');
    delete fight.turn.opponentDodged;
    delete fight.turn.normalDamageReplaced;
    fight.phase='damage';
  }
  if (spec.cancelCounterstrike || spec.cancelIncoming || spec.reflectIncoming) {
    const pending=fight.phase==='ability-rolled' ? fight.turn.pendingAbility : null;
    const event=pending?.event;
    if (pending && (pending.type!=='encounter' || event.owner!=='opponent' || !event.damageDice)) throw new RangeError('Resolve an opponent damage roll first');
    if (spec.cancelCounterstrike && !event?.counterstrike) throw new RangeError('This is not an opponent counterstrike');
    if (!pending && fight.turn.winner!=='opponent') throw new RangeError('Resolve an opponent damage roll first');
    if (spec.sacrificeSummon) {
      if (!hasDestinyAbility(fight,spec.sacrificeSummon) || !fight.abilityCatalog?.[spec.sacrificeSummon]?.summon || fight.sacrificedSummons?.includes(spec.sacrificeSummon)) throw new RangeError('No summoned allies remain to sacrifice');
      (fight.sacrificedSummons??=[]).push(spec.sacrificeSummon);
    }
    if (spec.reflectIncoming) {
      let armour=destinyStat(fight,'hero','armour');
      if(fight.turn.ignoreArmour&&!destinyImmuneToAbility(fight,fight.turn.opponentArmourAbility))armour=0;
      else if(fight.turn.halfArmour)armour-=Math.ceil(armour/2);
      const amount=Math.min(fight.hero.health,pending ? destinyOpponentDamageTotal(fight,pending.dice,pending.bonuses) : Math.max(0,destinyDamageScore(fight)-armour));
      destinyStrike(fight,target,amount,name,'reflected');
    }
    if (pending) {
      if (pending.suspendedAbility) {fight.turn.pendingAbility=pending.suspendedAbility;fight.phase='ability-rolled';}
      else {delete fight.turn.pendingAbility;fight.phase=pending.returnPhase;}
    } else fight.turn.avoidDamage=true;
  }
}

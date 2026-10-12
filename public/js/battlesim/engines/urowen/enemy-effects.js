import {rollUrowenDie,urowenDamage} from './core.js';
import {damageUrowenChestArmor} from './forms.js';

const clone=value=>structuredClone(value);
function die(value) {
  if(!Number.isInteger(value)||value<1||value>6)throw new RangeError('Invalid die');
  return value;
}
export function urowenEnemyAttribute(enemy,rules) {
  return rules.rage&&enemy.life<rules.rage.belowLife?rules.rage.attributeValue:enemy.attributeValue;
}
export function urowenEnemyRerolls(enemy,rules,phase) {
  if(rules.rerollAllBelowLife&&enemy.life<rules.rerollAllBelowLife.belowLife) {
    return [...rules.rerollAllBelowLife.values];
  }
  return [...(rules.rerollAll??(phase==='attack'?rules.rerollAttackOnly:undefined)??[])];
}
export function applyUrowenEnemyDie(enemy,rules,raw) {
  die(raw);
  const next=clone(enemy);
  if(raw===6&&rules.anyRaw6Heal) {
    if(!Number.isSafeInteger(next.maxLife)||next.maxLife<1)throw new RangeError('Invalid enemy life cap');
    next.life=Math.min(next.maxLife,next.life+rules.anyRaw6Heal);
  }
  return next;
}
export function urowenWonEnemyAttackEffects(rules,raw) {
  die(raw);
  return raw===6&&rules.wonRawAttack6NextPenalty?[{type:'next-player-attack-penalty',amount:rules.wonRawAttack6NextPenalty}]:[];
}
export function resolveUrowenEnemyDodge(rules,roll) {
  if(!rules.dodgeOn)return {dodged:false,rolls:[]};
  const raw=rollUrowenDie(roll).raw;
  return {dodged:rules.dodgeOn.includes(raw),rolls:[raw]};
}
export function resolveUrowenPlayerDodge(career,rules,roll) {
  const allowed=career==='minstrel'?(rules.minstrelDodgeOn??rules.playerDodgeOn??[6]):rules.playerDodgeOn;
  if(!allowed)return {dodged:false,rolls:[]};
  const raw=rollUrowenDie(roll).raw;
  return {dodged:allowed.includes(raw),rolls:[raw]};
}
export function urowenPlayerHitDefense(rules,rawDamage) {
  die(rawDamage);
  return {blocked:rawDamage===6&&!!rules.blockPlayerRawDamage6,
    reflected:rawDamage===6?(rules.reflectPlayerRawDamage6??0):0};
}
export function resolveUrowenEnemyHit(player,enemy,rules,{rawDamage,location,armorBonus=0},roll) {
  die(rawDamage);die(location);
  const next=clone(player),effects=[],rolls=[];
  if(rules.escapeOnRawDamage?.includes(rawDamage)) {
    return {player:next,damage:0,effects,rolls,destination:rules.escapeDestination??null,escaped:true};
  }
  const extra=rawDamage===6?(rules.rawDamage6Extra??0):0;
  if(!Number.isSafeInteger(armorBonus)||armorBonus<0)throw new RangeError('Invalid armor bonus');
  const armor=rules.ignorePlayerArmor?0:next.armor[location-1]+armorBonus;
  let damage=urowenDamage({rawDamage,location,bonus:enemy.damageBonus+(rules.extraIgnoresArmor?0:extra),armor});
  if(rules.extraIgnoresArmor)damage+=extra;
  if(rawDamage===6&&rules.rawDamage6PermanentChestArmorLoss) {
    next.armor=damageUrowenChestArmor(next.armor);
    effects.push({type:'permanent-chest-armor-loss',amount:1});
  }
  let destination=rawDamage===6?rules.rawDamage6InstantDefeat:null;
  if(location===6&&rawDamage===6&&rules.rawHead6AndDamage6InstantDefeat) {
    destination=rules.rawHead6AndDamage6InstantDefeat;
  }
  if(damage>0) {
    if(rawDamage===6&&rules.rawDamage6Bleed)effects.push({type:'bleeding',amount:rules.rawDamage6Bleed,
      explicitlyNonstacking:!!rules.bleedExplicitlyNonstacking});
    if(rawDamage===1&&rules.rawDamage1Venom)effects.push({type:'venom',amount:rules.rawDamage1Venom});
    if(rawDamage===6&&rules.rawDamage6Venom)effects.push({type:'venom',amount:rules.rawDamage6Venom});
    if(rawDamage===6&&rules.rawDamage6CumulativeAttackPenalty)effects.push({type:'cumulative-player-attack-penalty',amount:rules.rawDamage6CumulativeAttackPenalty});
    if(rawDamage===6&&rules.rawDamage6AttackPenalty)effects.push({type:'player-attack-penalty',amount:rules.rawDamage6AttackPenalty});
    if(location===6&&rules.headHitOngoing)effects.push({type:'freezing',amount:rules.headHitOngoing});
    if(location===6&&rules.headHitAttackPenalty)effects.push({type:'player-attack-penalty',amount:rules.headHitAttackPenalty});
    if(rules.limbHitNextAttackPenalty?.locations.includes(location))effects.push({type:'next-player-attack-penalty',amount:rules.limbHitNextAttackPenalty.penalty});
    if(rules.whip) {
      const raw=rollUrowenDie(roll).raw;rolls.push(raw);
      if(raw>=rules.whip.rollAtLeast) {
        damage+=rules.whip.extraDamage;
        effects.push({type:'next-player-attack-penalty',amount:rules.whip.nextAttackPenalty});
      }
    }
  }
  next.life-=damage;
  return {player:next,damage,effects,rolls,destination:destination??null,
    escaped:!!rules.escapeOnRawDamage?.includes(rawDamage)};
}

import {rollUrowenDie,urowenDamage} from './core.js';
import {UROWEN_RULES,UROWEN_SOURCE} from './roster.js';
const enemyRules=section=>UROWEN_SOURCE.encounters.find(row=>row.section===section).enemyRules;

const clone = value => structuredClone(value);
const stages = Object.freeze([
  null,
  {attribute:2,perception:3,life:5,power:2},
  {attribute:3,perception:4,life:8,power:3},
  {attribute:4,perception:5,life:10,power:4},
  {attribute:5,perception:6,life:40,power:5},
]);
function integer(value,min,max=Number.MAX_SAFE_INTEGER) {
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError('Invalid value');
  return value;
}
export function createUrowenTransformation(character,stage) {
  integer(stage,1,4);
  const original=clone(character),player=clone(character),bonus=stages[stage];
  for(const key of ['STR','SK','MAG'])player.attributes[key]+=bonus.attribute;
  player.attributes.PER+=bonus.perception;
  player.maxLife+=bonus.life;
  player.life+=bonus.life;
  player.power+=bonus.power;
  return {original,player,stage};
}
export function restoreUrowenTransformation(transformation) {
  return clone(transformation.original);
}
export function createUrowenPossession(character) {
  const player=clone(character);
  Object.assign(player,clone(UROWEN_RULES.possession.player));
  return {original:clone(character),player,stage:'possession'};
}
export function urowenPossessionHit({rawDamage,location}) {
  integer(rawDamage,1,6);integer(location,1,6);
  const rules=UROWEN_RULES.possession;
  return {instantKill:rawDamage===rules.hitRoll&&rules.killLocations.includes(location),
    bleeding:rawDamage===rules.hitRoll&&rules.bleedLocations.includes(location)?rules.bleeding:0};
}
export function createUrowenMission(character,{weaponAttribute='SK'}={}) {
  if(!['STR','SK','MAG'].includes(weaponAttribute))throw new RangeError('Invalid attribute');
  const player=clone(character);
  player.life=100;player.maxLife=100;
  player.weapon={attribute:weaponAttribute,dice:1,bonus:6,reroll:[1],sorcererOne:3,effect:'scepter'};
  return {original:clone(character),player,stage:'mission'};
}
export function recoverUrowenMissionLife(mission,section) {
  const amount={394:50,386:40,376:30,361:40,349:50}[section];
  if(amount===undefined||mission.stage!=='mission')throw new RangeError('Invalid checkpoint');
  const next=clone(mission);
  next.player.life=Math.min(100,next.player.life+amount);
  return next;
}
export function createUrowenAppendages(count,life) {
  integer(count,1,3);integer(life,1);
  return Array.from({length:count},(_,index)=>({id:index,life,maxLife:life}));
}
export function hitUrowenAppendage(appendages,index,damage) {
  integer(index,0,appendages.length-1);integer(damage,0);
  if(appendages[index].life<=0)throw new RangeError('Appendage defeated');
  const next=clone(appendages);
  next[index].life=Math.max(0,next[index].life-damage);
  return next;
}
export function urowenAppendageDamage(appendages) {
  return appendages.filter(appendage=>appendage.life>0).length;
}
export function urowenSisteliumDamage(alive,maximum=enemyRules(UROWEN_RULES.sisteliumSection).copies) {
  integer(maximum,0);integer(alive,0,maximum);
  return Math.floor(Math.max(0,alive-1)/2);
}
export function urowenArdronteSupportDamage(life) {
  integer(Math.abs(life),0);
  const rules=enemyRules(UROWEN_RULES.ardronteSection).secondHeadRoundEnd;
  return life>rules.whileLifeAbove?rules.damage:0;
}
export function resolveUrowenCharge(roll,{enemy=false,charge=null}={}) {
  const rules=enemy?(charge??enemyRules(UROWEN_RULES.chargeSection).openingCharge):
    {hitOn:[4,5,6],playerDodgeOn:[6],damageBonus:3,damageDice:4};
  const hit=rollUrowenDie(roll).raw,rolls=[hit];
  if(!rules.hitOn.includes(hit))return {hit:false,dodged:false,damage:0,rolls};
  const dodge=rollUrowenDie(roll).raw;rolls.push(dodge);
  if(rules.playerDodgeOn.includes(dodge))return {hit:false,dodged:true,damage:0,rolls};
  let damage=rules.damageBonus;
  for(let index=0;index<rules.damageDice;index++) {
    const value=rollUrowenDie(roll).raw;rolls.push(value);damage+=value;
  }
  return {hit:true,dodged:false,damage,rolls};
}
export function urowenEnemyLocation(roll,{increase=0,highestOfTwo=false,reroll=[]}={}) {
  integer(increase,0,1);
  const first=rollUrowenDie(roll,{reroll}),rolls=[first];
  let location=first.value;
  if(highestOfTwo) {
    const second=rollUrowenDie(roll,{reroll});rolls.push(second);
    location=Math.max(location,second.value);
  }
  return {location:Math.min(6,location+increase),rolls};
}
export function damageUrowenChestArmor(armor) {
  if(!Array.isArray(armor)||armor.length!==6)throw new RangeError('Invalid armor');
  const next=[...armor];
  for(const index of [1,2,3])next[index]=Math.max(0,integer(next[index],0)-1);
  return next;
}
export function resolveUrowenCompanionHit(roll,armor) {
  const location=rollUrowenDie(roll).raw,damage=rollUrowenDie(roll).raw;
  return {location,rawDamage:damage,damage:urowenDamage({rawDamage:damage,location,
    bonus:UROWEN_RULES.companion.bonus+(damage===UROWEN_RULES.companion.extraRoll?UROWEN_RULES.companion.extra:0),armor:armor[location-1]})};
}
export function canUrowenCompanionAttack({life,used}) {
  return !used&&life>0&&life<UROWEN_RULES.companion.belowLife;
}
export function startUrowenInvisibility(enemy,{belowLife,powerCost=4,attacks=2}) {
  integer(belowLife,1);integer(powerCost,1);integer(attacks,1,2);
  if(enemy.life>=belowLife||enemy.power<powerCost||enemy.invisibilityAttacks>0) {
    throw new RangeError('Invisibility unavailable');
  }
  const next=clone(enemy);next.power-=powerCost;next.invisibilityAttacks=attacks;
  return next;
}

import {rollUrowenDie,urowenDamage} from './core.js';

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
  player.career=null;
  player.attributes={STR:3,SK:0,MAG:0,PER:0};
  player.maxLife=30;player.life=30;player.power=0;
  player.armor=[0,0,0,0,0,0];
  player.weapon={attribute:'STR',dice:1,bonus:2,reroll:[]};
  return {original:clone(character),player,stage:'possession'};
}
export function urowenPossessionHit({rawDamage,location}) {
  integer(rawDamage,1,6);integer(location,1,6);
  return {instantKill:rawDamage===6&&[2,3,4,6].includes(location),
    bleeding:rawDamage===6&&[1,5].includes(location)?5:0};
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
export function urowenSisteliumDamage(alive) {
  integer(alive,0,5);
  return Math.floor(Math.max(0,alive-1)/2);
}
export function urowenArdronteSupportDamage(life) {
  integer(Math.abs(life),0);
  return life>18?1:0;
}
export function resolveUrowenCharge(roll,{enemy=false}={}) {
  const hit=rollUrowenDie(roll).raw,rolls=[hit];
  if(hit<(enemy?5:4))return {hit:false,dodged:false,damage:0,rolls};
  const dodge=rollUrowenDie(roll).raw;rolls.push(dodge);
  if(dodge===6)return {hit:false,dodged:true,damage:0,rolls};
  let damage=3;
  for(let index=0;index<(enemy?2:4);index++) {
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
    bonus:2+(damage===6?2:0),armor:armor[location-1]})};
}
export function canUrowenCompanionAttack({life,used}) {
  return !used&&life>0&&life<6;
}
export function startUrowenInvisibility(enemy,{belowLife,powerCost=4,attacks=2}) {
  integer(belowLife,1);integer(powerCost,1);integer(attacks,1,2);
  if(enemy.life>=belowLife||enemy.power<powerCost||enemy.invisibilityAttacks>0) {
    throw new RangeError('Invisibility unavailable');
  }
  const next=clone(enemy);next.power-=powerCost;next.invisibilityAttacks=attacks;
  return next;
}

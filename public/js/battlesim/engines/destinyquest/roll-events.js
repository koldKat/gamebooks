import { destinyDie } from './damage.js';
import { damageDestinyHero, addDestinyStatEffect, destinyStat, observeDestinyHealth, isDestinyOpponentActive, destinyAttackerTarget, hasDestinyAbility, onDestinyHeroDice, applyDestinyHeroRoll, destinyStrike, recordDestinyDefeat,onDestinyOpponentHealthHit } from './effects.js';
import { queueDestinyEncounterEvent } from './encounter-events.js';

const doubles = values => values.length > 1 && new Set(values).size < values.length;
function hurt(fight, amount, name) {
  const damage = damageDestinyHero(fight,amount);
  fight.history.push({ type: 'roll-hazard', name, round: fight.round, damage });
  return damage;
}

// Only newly rolled dice trigger face effects. Doubles inspect the resulting
// complete roll, including an unchanged or saved companion die.
export function onDestinyHeroSpeedRoll(fight, indices, roll) {
  if (!indices.length) return;
  const values = fight.turn.heroSpeedDice;
  if(fight.encounter?.heroSpeedRerollHighest) {
    const highest=Math.max(...values),selected=values.map((face,index)=>face===highest?index:-1).filter(index=>index>=0);
    for(const index of selected) {const previous=values[index];values[index]=destinyDie(roll);fight.history.push({type:'forced-speed-reroll',name:fight.encounter.heroSpeedRerollHighest,round:fight.round,index,previous,result:values[index]});}
    indices=[...new Set([...indices,...selected])];
  }
  const forced = fight.encounter?.heroSpeedRerolls;
  if (forced) for (const index of indices) {
    let attempts = 0;
    while (forced.faces.includes(values[index])) {
      if (++attempts > 1000) throw new RangeError('Forced speed reroll did not produce an allowed face');
      const previous = values[index];
      values[index] = destinyDie(roll);
      fight.history.push({ type: 'forced-speed-reroll', name: forced.name, round: fight.round, index, previous, result: values[index] });
    }
  }
  if (fight.turn.speedFace) for (const index of indices) {
    if (values[index]===fight.turn.speedFace.from) values[index]=fight.turn.speedFace.to;
  }
  for(const index of indices)if(fight.encounter?.heroSpeedFaceMap?.[values[index]]!==undefined)
    values[index]=fight.encounter.heroSpeedFaceMap[values[index]];
  applyDestinyHeroRoll(fight,values,'speed',indices);onDestinyHeroDice(fight,values);
  for (const [name,spec] of Object.entries(fight.abilityCatalog||{})) {
    const strike=spec.heroSpeedFaceStrike;
    if(!strike || !hasDestinyAbility(fight,name) || fight.equipment?.mainHand?.type!==strike.requiresMainHand || fight.equipment?.leftHand?.type!==strike.requiresLeftHand)continue;
    const amount=strike.damageFromFastestWeapon?Math.max(fight.equipment.mainHand.speed||0,fight.equipment.leftHand.speed||0):strike.amount;
    if(!amount)continue;
    const returnPhase=fight.phase;
    for(const index of indices)if(values[index]===strike.face)queueDestinyEncounterEvent(fight,{kind:'damage-choice',name,amount},returnPhase,roll);
  }
  for (const rule of fight.encounter?.heroSpeedFaces || []) {
    if (rule.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    const hits=indices.filter(index=>rule.faces.includes(values[index]));
    if(rule.amount)hurt(fight,hits.length*rule.amount,rule.name);
    if(rule.lockFaces)fight.turn.lockedHeroDice=[...new Set([...(fight.turn.lockedHeroDice||[]),...hits])];
    for(const index of hits)if(rule.dice)queueDestinyEncounterEvent(fight,{kind:'enemy-dice-damage',name:rule.name,dice:rule.dice,owner:'opponent',damageDice:true},'speed-rolled',roll);
  }
  if (!doubles(values)) return;
  for(const name of Object.keys(fight.abilities||{})){
    const amount=fight.abilityCatalog?.[name]?.heroSpeedDoublesStrike;
    if(amount&&hasDestinyAbility(fight,name)&&isDestinyOpponentActive(fight,fight.target))destinyStrike(fight,fight.target,amount,name,'passive');
  }
  for (const rule of fight.encounter?.heroSpeedDoubles || []) {
    if (rule.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    if(rule.forceLoss)fight.turn.forcedOpponentWin=true;
    if (rule.choiceGroup) {
      const counts = new Map();
      values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
      const pairs = [...counts.values()].reduce((total, count) => total + Math.floor(count / 2), 0);
      const available = (fight.encounter.opponentGroups?.[rule.choiceGroup] || []).filter(target => isDestinyOpponentActive(fight, target));
      const returnPhase = fight.phase;
      for (let i = 0; i < Math.min(pairs, available.length); i++) queueDestinyEncounterEvent(fight,
        { kind: 'defeat-choice', name: rule.name, group: rule.choiceGroup }, returnPhase, roll);
    }
    if (rule.amount) hurt(fight, rule.amount, rule.name);
    if (rule.armourLoss) addDestinyStatEffect(fight, 'hero', 'armour', -rule.armourLoss, null, rule.name);
    if (rule.dice && fight.hero.health > 0) queueDestinyEncounterEvent(fight,
      { name: rule.name, kind: 'enemy-dice-damage', dice: rule.dice, owner: 'opponent', damageDice: true }, 'speed-rolled', roll);
  }
}

export function onDestinyOpponentSpeedRoll(fight, values) {
  if (!doubles(values)) return;
  const target = destinyAttackerTarget(fight);
  for (const rule of fight.encounter?.opponentSpeedDoubles || []) {
    if (rule.targets && !rule.targets.includes(target)) continue;
    for(const healing of rule.healing||[]){
      if(!isDestinyOpponentActive(fight,healing.target))continue;
      const opponent=fight.opponents[healing.target];
      opponent.health=Math.min(opponent.maxHealth,opponent.health+healing.amount);
    }
    if (rule.amount) onDestinyOpponentHealthHit(fight,target,hurt(fight,rule.amount,rule.name),'ability');
    if(rule.selfDamage&&fight.opponents[target].health!==null&&isDestinyOpponentActive(fight,target)){
      const damage=Math.min(rule.selfDamage,fight.opponents[target].health);
      fight.opponents[target].health-=damage;observeDestinyHealth(fight);
      if(fight.opponents[target].health===0){recordDestinyDefeat(fight,target);fight.turn.deaths.push(target);}
      fight.history.push({type:'roll-hazard',name:rule.name,round:fight.round,target,damage});
    }
    if (rule.forceLoss) {
      fight.turn.forcedOpponentWin = true;
      if (rule.blockCategories) fight.encounter.blockedRounds = { from: fight.round, until: fight.round, categories: [...rule.blockCategories] };
      if (rule.lockRerolls) fight.turn.rerollsLocked = true;
    }
    if (rule.attribute) hurt(fight, destinyStat(fight, target, rule.attribute), rule.name);
  }
}

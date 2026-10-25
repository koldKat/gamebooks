import { demondoomDamage, applyDemondoomPhysicalDamage, demondoomOutcome, finishDemondoomFight,
  demondoomInitialOrder, demondoomDeathLuck, demondoomRegentWeapon, demondoomAlternatingWeapon } from './demondoom-rules.js';
import { fireWolfHitThreshold, FIRE_WOLF_WEAPONS } from './fire-wolf.js';
import { checkDemondoomInclination, attemptDemondoomSpell, applyDemondoomSpellEffect, restoreDemondoomTimewarp } from './demondoom-magic.js';
import { rollDemondoomCharacter } from './demondoom-character.js';
import { DEMONDOOM_RULES } from './demondoom-roster.js';

const die = random => Math.floor(random()*6)+1;
const dice = random => die(random)+die(random);
function log(fight,event) {fight.log.push(event);if(fight.log.length>150)fight.log.splice(0,fight.log.length-150);return event;}

export function createDemondoomFight(prepared) {
  const fight={...structuredClone(prepared),round:0,attacks:0,enemyTurns:0,rest:0,turn:prepared.encounter.first??null,
    sequence:0,openingStrikes:0,enemyAttacks:prepared.enemies.map(()=>0),rewardedKills:[],pending:null,outcome:null,log:[],luckUsed:false};
  fight.opening={player:structuredClone(fight.player),enemies:structuredClone(fight.enemies)};
  if(fight.encounter.opening)fight.turn='enemy';
  return fight;
}

export function demondoomEnemyActive(fight,index) {
  const enemy=fight.enemies[index];
  return !!enemy&&enemy.lifePoints>0&&!enemy.paralysed&&(!fight.encounter.sequential||index===fight.sequence);
}

export function checkDemondoomFight(fight) {
  if(fight.outcome||fight.pending)return;
  for(const [index,enemy]of fight.enemies.entries())if(enemy.lifePoints<=0&&!fight.rewardedKills.includes(index)) {
    fight.rewardedKills.push(index);
    fight.player.power+=fight.encounter.powerPerKill??0;
  }
  const result=demondoomOutcome(fight.player,fight.enemies,fight.luckUsed);
  if(result==='death-luck') {fight.pending=result;return;}
  if(result) {
    if(result==='win'&&fight.encounter.rule==='sqquash')fight.player.strength=fight.opening.player.strength;
    finishDemondoomFight(fight,result);return;
  }
  if(fight.encounter.sequential&&!demondoomEnemyActive(fight,fight.sequence)) {
    while(fight.sequence<fight.enemies.length&&!demondoomEnemyActive({...fight,encounter:{sequential:false}},fight.sequence))fight.sequence++;
    if(fight.sequence>=fight.enemies.length) {finishDemondoomFight(fight,'avoided');return;}
    fight.round=fight.attacks=fight.enemyTurns=fight.rest=0;
    fight.turn=fight.encounter.first??null;
    fight.opening={player:structuredClone(fight.player),enemies:structuredClone(fight.enemies)};
  }
  if(fight.enemies.every(enemy=>enemy.lifePoints<=0||enemy.paralysed))finishDemondoomFight(fight,'avoided');
}

export function determineDemondoomInitiative(fight,random=Math.random) {
  if(fight.outcome||fight.pending||fight.turn||fight.encounter.manualGroup)return null;
  if(['web','amoebix'].includes(fight.encounter.rule)) {fight.turn='player';return 'player';}
  const enemy=fight.enemies[fight.sequence];
  fight.turn=demondoomInitialOrder(fight.player,enemy,dice(random),dice(random));
  return log(fight,{kind:'initiative',first:fight.turn});
}

function checkRoundLimit(fight) {
  if(fight.encounter.rule==='amoebix'&&fight.round>=DEMONDOOM_RULES.amoebixRounds&&fight.enemies.some(enemy=>enemy.lifePoints>0)) {
    fight.player.lifePoints=0;checkDemondoomFight(fight);
  }
  if(fight.encounter.returnAfter&&fight.round>=fight.encounter.returnAfter&&fight.enemyTurns>=fight.encounter.returnAfter&&!fight.outcome&&!fight.pending)
    finishDemondoomFight(fight,'reconsider');
}

export function endDemondoomGroupRound(fight) {
  if(!fight.encounter.manualGroup||fight.outcome||fight.pending)return false;
  fight.round++;
  if(fight.rest&&!--fight.rest)fight.attacks=0;
  checkRoundLimit(fight);return true;
}

export function rollDemondoomAttack(fight,side,target=0,random=Math.random) {
  if(fight.outcome||fight.pending)return null;
  if(!['player','enemy'].includes(side)||!Number.isInteger(target)||!demondoomEnemyActive(fight,target))return {error:'no-target'};
  if(!fight.encounter.manualGroup&&fight.turn!==side)return {error:'wrong-turn'};
  const enemy=fight.enemies[target],rule=fight.encounter.rule;
  if(side==='enemy'&&['web','amoebix'].includes(rule))return {error:'no-enemy-attack'};
  if(side==='enemy'&&fight.encounter.magicImmune&&!fight.guardSpellPaid)return {error:'spell-cost-required'};
  if(side==='player'&&fight.encounter.mode==='magic')return {error:'magic-route'};
  if(side==='player'&&fight.openingStrikes<(fight.encounter.opening??0))return {error:'enemy-opening'};
  if(side==='player'&&fight.paralysedPlayerRounds>0) {
    fight.paralysedPlayerRounds--;fight.turn='enemy';
    if(!fight.encounter.manualGroup)fight.round++;
    return log(fight,{kind:'paralysed',remaining:fight.paralysedPlayerRounds});
  }
  const attacker=side==='player'?fight.player:enemy,defender=side==='player'?enemy:fight.player;
  if(side==='enemy'&&rule!=='sqquash'&&(!Number.isFinite(enemy.strength)||!Number.isFinite(enemy.skill)))return {error:'manual-stats'};
  if(side==='enemy'&&enemy.manualWeapon&&!(typeof enemy.weapon==='number'&&enemy.weapon>=0)&&!Object.hasOwn(FIRE_WOLF_WEAPONS,enemy.weapon))return {error:'manual-weapon'};
  if(side==='player'&&!Number.isFinite(fight.player.strength))return {error:'manual-stats'};
  if(side==='player'&&!Object.hasOwn(FIRE_WOLF_WEAPONS,fight.player.weapon)&&!(Number.isFinite(fight.player.weapon)&&fight.player.weapon>=0))return {error:'manual-weapon'};
  if(side==='player'&&(fight.rest||fight.attacks>=Math.floor(fight.player.stamina/10))) {
    if(!fight.rest)fight.rest=2;
    if(['web','amoebix'].includes(rule)) {fight.round+=fight.rest;fight.rest=0;fight.attacks=0;checkRoundLimit(fight);}
    else fight.turn='enemy';
    return log(fight,{kind:'rest'});
  }
  if(side==='player') {
    fight.attacks++;
    if(!fight.encounter.manualGroup)fight.round++;
  } else {
    fight.enemyTurns++;fight.enemyAttacks[target]++;
    if(fight.openingStrikes<(fight.encounter.opening??0))fight.openingStrikes++;
  }
  const roll=dice(random),threshold=side==='enemy'?(fight.encounter.hitThreshold??fireWolfHitThreshold(attacker)):fireWolfHitThreshold(attacker);
  let weapon=attacker.weapon;
  if(side==='enemy'&&rule==='regent')weapon=demondoomRegentWeapon(fight.enemyAttacks[target],die(random));
  if(side==='enemy'&&rule==='cupric')weapon=demondoomAlternatingWeapon(fight.enemyAttacks[target],...DEMONDOOM_RULES.cupricWeapons);
  if(side==='enemy'&&rule==='regina')weapon=DEMONDOOM_RULES.regina.weapon;
  let damage;
  try {damage=demondoomDamage(rule==='sqquash'&&side==='enemy'?{...attacker,strength:0}:attacker,defender,roll,{weapon,hitThreshold:threshold,halfDamage:side==='player'&&fight.encounter.halfDamage});}
  catch {return {error:'manual-stats'};}
  damage=Math.max(0,damage-(attacker.magicFear??0));
  if(side==='player')applyDemondoomPhysicalDamage(fight.player,enemy,damage,fight.encounter);
  else {
    if(rule==='bear'&&roll===DEMONDOOM_RULES.bear.halfRoll)damage=fight.player.lifePoints/DEMONDOOM_RULES.bear.divisor;
    if(rule==='assassin'&&roll===DEMONDOOM_RULES.assassin.halfRoll)damage=fight.player.lifePoints/DEMONDOOM_RULES.assassin.divisor;
    if(rule==='regina'&&fight.enemyAttacks[target]%DEMONDOOM_RULES.regina.fatalEvery===0&&roll===DEMONDOOM_RULES.regina.fatalRoll)damage=fight.player.lifePoints;
    if(rule==='dragon'&&fight.enemyAttacks[target]%DEMONDOOM_RULES.dragon.every===0&&roll>=DEMONDOOM_RULES.dragon.minRoll)damage=dice(random)*DEMONDOOM_RULES.dragon.multiplier;
    fight.player.lifePoints-=damage;
    if(!fight.encounter.manualGroup&&fight.rest&&!--fight.rest)fight.attacks=0;
  }
  if(side==='player'&&rule==='sqquash'&&roll>=threshold)fight.player.strength=Math.max(0,fight.player.strength-DEMONDOOM_RULES.sqquashStrengthLoss);
  const event=log(fight,{kind:'attack',side,target,roll,threshold,damage});
  if(side==='enemy'&&rule==='assassin'&&roll>=threshold&&roll!==DEMONDOOM_RULES.assassin.halfRoll)event.poisonCheckRequired=true;
  const sequence=fight.sequence;
  checkDemondoomFight(fight);
  checkRoundLimit(fight);
  if(fight.encounter.rule==='immune-spell'&&fight.openingStrikes>=fight.encounter.opening&&!fight.outcome&&!fight.pending)finishDemondoomFight(fight,'reconsider');
  if(!fight.outcome&&!fight.pending&&sequence===fight.sequence)fight.turn=['web','amoebix'].includes(rule)?'player':side==='player'?'enemy':'player';
  return event;
}

export function castDemondoomEnemySpell(fight,spell,target=0,random=Math.random) {
  if(fight.outcome||fight.pending||!demondoomEnemyActive(fight,target))return {error:'unavailable'};
  if(!fight.encounter.manualGroup&&fight.turn!=='enemy')return {error:'wrong-turn'};
  const rule=fight.encounter.rule,enemy=fight.enemies[target];
  const magic=DEMONDOOM_RULES.enemyMagic,thresholds=magic.thresholds;
  if(!(['regent','village-spawn'].includes(rule)&&Object.hasOwn(thresholds,spell))&&!(rule==='captain'&&spell==='blight'))return {error:'forbidden-spell'};
  if(rule==='village-spawn'&&spell!=='firebolt')return {error:'forbidden-spell'};
  const cost=rule==='captain'?magic.captainCost:dice(random);
  if(rule==='captain'&&enemy.power<cost)return {error:'insufficient-power'};
  if(rule==='captain')enemy.power-=cost;else enemy.lifePoints-=cost;
  const roll=dice(random),success=roll>=(thresholds[spell]??magic.defaultThreshold);
  let damage=0;
  if(success) {
    if(spell==='leprosy')fight.leprosy=true;
    if(spell==='blight')fight.paralysedPlayerRounds=magic.paralysisRounds;
    if(spell==='crack-of-doom')damage=magic.crackDamage;
    if(spell==='firebolt')damage=magic.fireboltDamage;
    fight.player.lifePoints-=damage;
  }
  fight.turn='player';fight.enemyTurns++;fight.enemyAttacks[target]++;
  if(fight.rest&&!--fight.rest)fight.attacks=0;
  checkDemondoomFight(fight);
  return log(fight,{kind:'enemy-spell',spell,cost,roll,success,damage});
}

export function resolveDemondoomDeathLuck(fight,random=Math.random) {
  if(fight.pending!=='death-luck'||fight.outcome)return null;
  const roll=dice(random),success=demondoomDeathLuck(fight.player,roll);
  fight.luckUsed=true;fight.pending=null;
  if(success) {
    fight.player.lifePoints=fight.player.maxLife;
    for(const [index,enemy]of fight.enemies.entries()) {
      if(fight.encounter.sequential&&index<fight.sequence)continue;
      enemy.lifePoints=enemy.maxLife;delete enemy.paralysed;
    }
    fight.round=fight.attacks=fight.enemyTurns=fight.rest=fight.openingStrikes=0;
    fight.enemyAttacks.fill(0);fight.turn=fight.encounter.first??null;
  } else finishDemondoomFight(fight,'loss');
  log(fight,{kind:'death-luck',roll,success});return success;
}

export function applyDemondoomManualDamage(fight,damage) {
  if(fight.outcome||fight.pending||!Number.isFinite(damage)||damage<0)return false;
  fight.player.lifePoints-=damage;checkDemondoomFight(fight);return log(fight,{kind:'manual-damage',damage});
}

export function castDemondoomPlayerSpell(fight,spell,options={},random=Math.random) {
  if(fight.outcome&&!(spell==='resurrection'&&fight.player.lifePoints<=0))return {error:'unavailable'};
  if(fight.pending&&spell!=='resurrection')return {error:'pending'};
  if(spell==='resurrection'&&fight.player.lifePoints>0)return {error:'wrong-life-state'};
  const guardPayment=fight.encounter.magicImmune&&!fight.guardSpellPaid;
  if(spell!=='resurrection'&&!guardPayment&&!fight.encounter.manualGroup&&fight.turn!=='player')return {error:'wrong-turn'};
  if(spell!=='resurrection'&&fight.paralysedPlayerRounds>0)return {error:'paralysed'};
  const target=options.target??0,enemy=fight.enemies[target];
  if(!enemy)return {error:'no-target'};
  if(spell==='retrace'&&!options.visited?.map(String).includes(String(options.destination)))return {error:'unvisited-destination'};
  checkDemondoomInclination(fight.player,fight.encounter.section,random);
  const result=attemptDemondoomSpell(fight.player,fight.encounter.section,spell,{...options,magicImmune:fight.encounter.magicImmune},random);
  if(result.error)return result;
  if(guardPayment) {fight.guardSpellPaid=true;fight.turn='enemy';}
  if(!guardPayment&&!['timewarp','resurrection','retrace'].includes(spell)) {
    fight.turn='enemy';if(!fight.encounter.manualGroup)fight.round++;
  }
  if(result.success) {
    if(result.effect==='timewarp')restoreDemondoomTimewarp(fight);
    else if(spell==='resurrection') {
      const old=fight.player,penalty=(old.resurrectionPenalty??0)+10;
      const rolled=rollDemondoomCharacter(random,old.skill,penalty);
      fight.player={...old,...rolled,power:old.power,maxPower:old.maxPower};
      fight.outcome=fight.pending=null;fight.skillAwarded=fight.recorded=false;
      fight.round=fight.attacks=fight.enemyTurns=fight.rest=fight.openingStrikes=0;
      fight.enemyAttacks.fill(0);fight.turn=fight.encounter.first??null;
    } else if(spell==='retrace') {result.destination=String(options.destination);finishDemondoomFight(fight,'warped');}
    else {
      const effect=applyDemondoomSpellEffect(fight.player,enemy,result,fight.encounter,random);
      if(effect?.escape)finishDemondoomFight(fight,'avoided');
    }
  }
  checkDemondoomFight(fight);
  log(fight,{kind:'spell',...result});return result;
}

import { createDestinyOpponent,onDestinyHeroRoundWon } from './core.js';
import { spawnDestinyOpponents, applyDestinyOpponentForm } from './round-events.js';
import { destinyDie } from './damage.js';
import { destinyEncounterEventSettings } from './encounter-settings.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import { damageDestinyHero, destinyStat, addDestinyStatEffect, observeDestinyHealth, hasDestinyAbility, destinyStrike, isDestinyOpponentActive, isDestinyOpponentDead, recordDestinyDefeat, destinyAttackerTarget, destinyImmuneToAbility, destinyOpponentDamageTotal,destinyArmour,applyDestinyHeroRoll,onDestinyHeroDice,applyDestinyAcceptedHeroRoll,recordDestinyRollFaces,onDestinyOpponentHealthHit } from './effects.js';

export function queueDestinyEncounterEvent(fight, event, returnPhase, roll) {
  if(destinyImmuneToAbility(fight,event.ability))return;
  const suspended = ['ability-rolled', 'ability-choice'].includes(fight.phase) ? fight.turn.pendingAbility : null;
  if (suspended && !event.interruptsPending) {
    (fight.turn.afterAbilityEvents ??= []).push({ event: structuredClone(event), returnPhase });
    return;
  }
  if (['ability-sacrifice', 'defeat-choice', 'damage-choice','shared-item-loss'].includes(event.kind)) {
    fight.turn.pendingAbility = { type: event.kind, name: event.name, event: structuredClone(event), returnPhase };
    fight.phase = 'ability-choice';
    return;
  }
  const boosted = event.boostFromPreviousStep && fight.encounter?.[event.boostFromPreviousStep] === fight.encounter?.hazardStep - 1;
  fight.turn.pendingAbility = { type: 'encounter', name: event.name, event: structuredClone(event), returnPhase,
    dice: Array.from({ length: boosted ? event.boostDice : event.dice ?? 1 }, () => destinyDie(roll)), bonuses: {}, options: {} };
  if(event.snapshotAttribute)fight.turn.pendingAbility.event.attributeSnapshot=destinyStat(fight,'hero',event.snapshotAttribute);
  if (suspended) fight.turn.pendingAbility.suspendedAbility = structuredClone(suspended);
  fight.phase = 'ability-rolled';
  if(event.heroRoll){
    const values=fight.turn.pendingAbility.dice;
    applyDestinyHeroRoll(fight,values,event.heroRoll);onDestinyHeroDice(fight,values);
  }
}

export function resumeDestinyEncounterQueue(fight, roll) {
  if (fight.status !== 'active' || ['ability-rolled', 'ability-choice'].includes(fight.phase)) return;
  const queued = fight.turn.afterAbilityEvents?.shift();
  if (queued) queueDestinyEncounterEvent(fight, queued.event, queued.returnPhase, roll);
}

function heroDamage(fight, amount, enemyDice = false, attacker = destinyAttackerTarget(fight)) {
  const lost = damageDestinyHero(fight,amount);
  if(enemyDice)onDestinyOpponentHealthHit(fight,attacker,lost,'dice');
  if (enemyDice && lost && hasDestinyAbility(fight, 'lightning') && isDestinyOpponentActive(fight, attacker)) {
    destinyStrike(fight, attacker, 2, 'lightning', 'passive');
  }
}

export function resolveDestinyEncounterEvent(fight, pending, roll, { roster } = {}) {
  const { event, dice } = pending;
  const total = event.owner==='opponent'&&event.damageDice ? destinyOpponentDamageTotal(fight,dice,pending.bonuses) : dice.reduce((sum, value, index) => sum + value + (pending.bonuses?.[index] || 0), 0);
  fight.phase = pending.returnPhase;
  if(event.heroRoll){
    applyDestinyAcceptedHeroRoll(fight,dice,event.heroRoll);
    if(fight.hero.health<=0)return;
  }
  if(event.owner==='opponent')recordDestinyRollFaces(fight,dice,'opponent',event.damageDice?'damage':'ability');
  if(fight.encounter?.forcedLoss||fight.encounter?.forcedVictory)return;
  fight.history.push({ type: 'encounter-roll', name: pending.name, round: fight.round, dice: [...dice], total });
  const stageDamage = amount => {
    if (event.atEnd) (fight.turn.encounterEndEffects ??= []).push({ target: 'hero', amount, ignoreArmour: event.ignoreArmour??true, source: event.name });
    else heroDamage(fight,Math.max(0,amount-(event.ignoreArmour===false?destinyArmour(fight,'hero'):0)));
  };
  let eventSettings;
  const settings = () => eventSettings ??= destinyEncounterEventSettings(fight, roster, event.kind);
  switch (event.kind) {
    case 'persistent-grid-hazard': {
      const grid=fight.encounter.gridHazard,[x,y]=dice;
      if(dice.length!==2||x>grid.columns||y>grid.rows)throw new RangeError('Invalid grid reference roll');
      if(grid.occupied.some(cell=>cell[0]===x&&cell[1]===y)){
        fight.history.push({type:'grid-reroll',round:fight.round,position:[x,y]});
        queueDestinyEncounterEvent(fight,event,pending.returnPhase,roll);break;
      }
      grid.occupied.push([x,y]);
      const damage=grid.hero[0]===x&&grid.hero[1]===y?damageDestinyHero(fight,grid.damage):0;
      fight.history.push({type:'grid-hazard',round:fight.round,position:[x,y],hero:[...grid.hero],damage});
      break;
    }
    case 'story-reward-table': {
      const outcome=event.outcomes.find(item=>total<=item.maximum);
      if(!outcome)throw new RangeError('Missing story reward outcome');
      if(outcome.gold){
        if(!Number.isSafeInteger(outcome.gold)||outcome.gold<0)throw new RangeError('Invalid story gold reward');
        (fight.encounter.storyRewards??=[]).push({name:event.name,gold:outcome.gold,round:fight.round,dice:[...dice]});
      }
      for(const change of outcome.changes||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
      break;
    }
    case 'opponent-recovery-table': {
      if(!isDestinyOpponentActive(fight,event.target))break;
      const result=Math.min(event.maximum,total+(event.rollBonus||0));
      const outcome=event.outcomes.find(item=>result<=item.maximum);
      if(!outcome)throw new RangeError('Missing opponent recovery outcome');
      const opponent=fight.opponents[event.target];
      if(outcome.heal)opponent.health=Math.min(opponent.maxHealth,opponent.health+outcome.heal);
      for(const [attribute,amount] of Object.entries(outcome.changes||{}))addDestinyStatEffect(fight,event.target,attribute,amount,null,event.name);
      fight.history.push({type:'opponent-recovery',round:fight.round,target:event.target,result,health:opponent.health});
      break;
    }
    case 'heal-until-escape': {
      const attempt=event.attempt||1;
      if(total>attempt&&isDestinyOpponentActive(fight,event.attacker)){
        const opponent=fight.opponents[event.attacker];opponent.health=Math.min(opponent.maxHealth,opponent.health+event.amount);
        if(attempt+1<event.maximumAttempts)queueDestinyEncounterEvent(fight,{...event,attempt:attempt+1},pending.returnPhase,roll);
        else fight.history.push({type:'automatic-escape',name:event.name,round:fight.round,attempt:event.maximumAttempts});
      }
      break;
    }
    case 'heal-opponent-if-low':
      if((event.faces?event.faces.includes(total):total<=event.limit)&&isDestinyOpponentActive(fight,event.target)){
        const healing={target:event.target,amount:event.amount,uncapped:!!event.uncapped};
        if(event.atEnd)(fight.turn.encounterEndOpponentHealing??=[]).push(healing);
        else{
          const opponent=fight.opponents[event.target];opponent.health=Math.min(healing.uncapped?Number.MAX_SAFE_INTEGER:opponent.maxHealth,opponent.health+healing.amount);
        }
      }
      break;
    case 'match-position': {
      const outcome=event.outcomes.find(item=>item.faces.includes(total));
      if(!outcome)throw new RangeError('Missing position for this roll');
      fight.encounter.opponentPosition=outcome.position;
      if(outcome.position!==fight.encounter.chosenPositions?.[event.choice])queueDestinyEncounterEvent(fight,event.onMismatch,'end',roll);
      break;
    }
    case 'approach-challenge': {
      const score=total+destinyStat(fight,'hero',event.attribute);
      if(score>=event.minimum)fight.encounter.approachSuccesses=(fight.encounter.approachSuccesses||0)+1;
      else{fight.encounter.approachSuccesses=0;heroDamage(fight,event.damage);}
      fight.history.push({type:'approach-progress',round:fight.round,score,successes:fight.encounter.approachSuccesses});
      if(fight.hero.health>0&&fight.encounter.approachSuccesses>=event.required){
        fight.turn.winner='hero';fight.turn.heroSpeedDice=[];fight.turn.opponentSpeedDice=[];
        fight.phase='damage';onDestinyHeroRoundWon(fight,roll);
      }
      break;
    }
    case 'damage-outcome': {
      const outcome=event.outcomes.find(item=>item.faces.includes(total));
      if(!outcome)throw new RangeError('Missing damage outcome for this roll');
      if(outcome.target==='hero')stageDamage(outcome.amount);
      else if(isDestinyOpponentActive(fight,outcome.target)){
        const opponent=fight.opponents[outcome.target];
        const amount=Math.max(0,outcome.amount-(outcome.ignoreArmour===false?destinyArmour(fight,outcome.target):0));
        const lost=Math.min(opponent.health,amount);opponent.health-=lost;
        observeDestinyHealth(fight);
        fight.history.push({type:'encounter-damage',round:fight.round,target:outcome.target,damage:lost,source:event.name});
        if(isDestinyOpponentDead(fight,outcome.target)){
          recordDestinyDefeat(fight,outcome.target);
          if(!fight.turn.deaths.includes(outcome.target))fight.turn.deaths.push(outcome.target);
        }
      }
      break;
    }
    case 'opponent-form': {
      const form=fight.encounter.roundForms.profiles.find(profile=>profile.faces.includes(total));
      if(!form)throw new RangeError('Missing opponent form for this roll');
      applyDestinyOpponentForm(fight,form);
      break;
    }
    case 'absorb-stat':
      if(total>=event.minimum)addDestinyStatEffect(fight,event.target,event.attribute,-event.amount,null,event.name);
      if(destinyStat(fight,event.target,event.attribute)===0)fight.encounter.forcedVictory=true;
      fight.turn.normalDamageReplaced=true;fight.phase='end';
      break;
    case 'skip-attack-if-low':
      if(total<=event.limit){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'damage-if-roll-above-stat':
      if(total>destinyStat(fight,'hero',event.attribute))stageDamage(Math.max(0,event.amount-(event.armourDivisor?Math.ceil((fight.hero.armour===null?0:destinyStat(fight,'hero','armour'))/event.armourDivisor):0)));
      break;
    case 'change-end-target':
      if(event.faces.includes(total)){
        const effect=fight.encounter.endEffects.find(effect=>effect.source===event.effectSource);
        if(!effect)throw new RangeError('Missing controlled effect');
        effect.target=event.target;fight.encounter[event.flag]=true;
      }
      break;
    case 'damage-if-high':
      if(total>event.limit){
        stageDamage(event.amount);
        for(const healing of event.healing||[])if(isDestinyOpponentActive(fight,healing.target)) {
          const recipient=fight.opponents[healing.target];recipient.health=Math.min(recipient.maxHealth,recipient.health+healing.amount);
        }
        for(const change of event.changes||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
      }
      break;
    case 'victory-after-faces':
      if (event.faces.includes(total)) {
        fight.encounter.victorySuccesses = (fight.encounter.victorySuccesses || 0) + 1;
        if (fight.encounter.victorySuccesses >= event.required) fight.encounter.forcedVictory = true;
      }
      if(event.replacesAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'attack-variation': {
      const outcome=event.outcomes.find(item=>item.faces.includes(total));
      if(!outcome)throw new RangeError('No attack variation for this roll');
      if(outcome.unlessHeroAbility&&hasDestinyAbility(fight,outcome.unlessHeroAbility))break;
      if(outcome.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))break;
      if(outcome.heroDamage)stageDamage(outcome.heroDamage);
      if(outcome.heroStatus&&!destinyImmuneToAbility(fight,outcome.heroStatus.name)) {
        const status=outcome.heroStatus,previous=fight.encounter.heroStatuses?.[status.name];
        (fight.encounter.heroStatuses??={})[status.name]=previous===undefined?status.initial:previous+status.increment;
      }
      for(const healing of outcome.healing||[])if(isDestinyOpponentActive(fight,healing.target)){
        const recipient=fight.opponents[healing.target];recipient.health=Math.min(recipient.maxHealth,recipient.health+healing.amount);
      }
      if(outcome.healOpponent){
        const target=event.attacker??destinyAttackerTarget(fight),opponent=fight.opponents[target];
        if(outcome.deferHealing)(fight.turn.encounterEndOpponentHealing??=[]).push({target,amount:outcome.healOpponent});
        else opponent.health=Math.min(opponent.maxHealth,opponent.health+outcome.healOpponent);
      }
      if(outcome.heroDamageAttribute&&!(outcome.immuneAbility&&hasDestinyAbility(fight,outcome.immuneAbility)))stageDamage(outcome.heroDamageAttribute==='armour'?destinyArmour(fight,'hero'):destinyStat(fight,'hero',outcome.heroDamageAttribute));
      for(const change of outcome.stats||[]){
        addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
        if(change.set!==undefined)fight.effects[fight.effects.length-1].set=change.set;
      }
      if(outcome.extraDamageDice)fight.turn.extraDamageDice=(fight.turn.extraDamageDice||0)+outcome.extraDamageDice;
      if(outcome.skipAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      if(outcome.damageDice)queueDestinyEncounterEvent(fight,{kind:'enemy-dice-damage',name:event.name,dice:outcome.damageDice,owner:'opponent',damageDice:true},fight.phase,roll);
      break;
    }
    case 'opponent-stat-table': {
      const outcome=event.outcomes.find(row=>total<=row.maximum);
      if(!outcome)throw new RangeError('Unknown opponent stat result');
      fight.opponents[event.target??fight.target][event.attribute]=outcome.value;
      break;
    }
    case 'next-round-speed-dice':
      if(event.faces.includes(total))fight.nextHeroSpeedDice={round:fight.round+1,count:event.count};
      break;
    case 'opponent-dodge':
      if(event.limit===undefined||total<=event.limit){fight.turn.opponentDodged=event.name;fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'opponent-ability':
      if(event.limit===undefined||total<=event.limit){
        if(event.ignoreArmour){fight.turn.ignoreArmour=true;fight.turn.opponentArmourAbility=event.ability;}
        if(event.heroSpeedCount)fight.turn.heroSpeedCount=event.heroSpeedCount;
      }
      break;
    case 'loss-if-low':
      if(total<=event.limit)fight.encounter.forcedLoss=true;
      break;
    case 'schedule-end-effect':
      (fight.encounter.scheduledEndEffects ??= []).push({ ...structuredClone(event.effect), round: total + event.delay });
      break;
    case 'spawn':
      if (event.source === undefined || isDestinyOpponentActive(fight, event.source)) {
        const count=total<=event.limit?event.lowCount:event.highCount;
        if(count!==0)spawnDestinyOpponents(fight,{...event,count},fight.round,createDestinyOpponent);
      }
      if(event.replacesAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    case 'revival': {
      if (isDestinyOpponentDead(fight, event.target) && (event.maximum!==undefined?total<=event.maximum:total>=event.minimum)) {
        fight.opponents[event.target].health = event.health;
        fight.turn.deaths = fight.turn.deaths.filter(target => target !== event.target);
        if (!fight.turn.deaths.length) fight.turn.pendingPassiveDeath = false;
        if (fight.phase === 'death-move' && fight.turn.deaths.length <= fight.turn.deathMoveDeathsSeen) fight.phase = fight.turn.afterDeathMove;
        fight.history.push({ type: 'revival', round: fight.round, target: event.target, health: event.health });
      } else recordDestinyDefeat(fight, event.target);
      if (destinyDeathMovesEnabled(fight) && ['start', 'encounter-start'].includes(fight.phase) && fight.turn.deaths.length > fight.turn.deathMoveDeathsSeen && !fight.turn.used.dm) {
        fight.turn.afterDeathMove = fight.phase;
        fight.phase = 'death-move';
      }
      break;
    }
    case 'damage-if-low': {
      const limit = event.limit === 'round' ? Math.min(6, fight.round) : event.limit;
      const score = total + (event.attribute ? destinyStat(fight, 'hero', event.attribute) : 0) + (event.attributeModifier || 0);
      if (score <= limit) {
        const bonus=event.damageBonusAttribute?(event.damageBonusAttribute==='armour'?destinyArmour(fight,'hero'):destinyStat(fight,'hero',event.damageBonusAttribute)):0;
        const amount=event.amountFromTargetHealth?((fight.opponents[event.amountFromTargetHealth.target].health>=event.amountFromTargetHealth.minimum)?event.amountFromTargetHealth.high:event.amountFromTargetHealth.low):event.amount;
        stageDamage(amount+bonus);
        if(event.skipAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
        for (const change of event.changes || []) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      }
      if(event.replacesAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      for(const change of event.alwaysChanges||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
      break;
    }
    case 'faces-damage':
      stageDamage(dice.filter(value => event.faces.includes(value)).reduce((sum, value) => sum + value, 0) * (event.multiplier ?? 1));
      break;
    case 'transport-damage': {
      const rule = settings();
      stageDamage(total);
      const transport = fight.equipment?.transport;
      if (!transport) throw new RangeError('Choose the transport used in this encounter');
      for (const [attribute, amount] of Object.entries(rule.wear)) transport[attribute] = Math.max(0, transport[attribute] - amount);
      for (const effect of fight.effects) if (effect.source === 'armour-plating') effect.amount = Math.floor(transport.toughness / 2);
      break;
    }
    case 'stat-if-low':
      if (total <= event.limit) {
        if (event.attribute) addDestinyStatEffect(fight, 'hero', event.attribute, event.amount, settings().duration, event.name, event.delay || 0);
        for (const change of event.changes || []) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      }else for(const change of event.otherwiseChanges||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,event.name,change.delay||0);
      break;
    case 'pursuit': {
      const rule=fight.encounter.pursuit,score=total+destinyStat(fight,'hero','speed'),success=score>=rule.difficulty;
      fight.turn.winner=success?'hero':'standoff';fight.phase=success?'damage':'end';
      if(!success){rule.difficulty+=rule.increment;fight.turn.normalDamageReplaced=true;}
      fight.history.push({type:'pursuit-challenge',name:event.name,round:fight.round,score,success});break;
    }
    case 'entangle-targets': {
      if(total>=destinyStat(fight,'hero','speed')) {
        fight.turn.blockedSingleTargets=[...event.targets];
        if(event.targets.includes(fight.target)) {
          fight.target=fight.opponents.findIndex((_,i)=>!event.targets.includes(i)&&isDestinyOpponentActive(fight,i));
          fight.turn.autoWin=!!fight.encounter.automaticHitTargets?.includes(fight.target);
        }
      }
      break;
    }
    case 'redirect-attack': {
      if(total<=event.limit&&isDestinyOpponentActive(fight,event.target)) {
        fight.turn.enemyAttackTarget=destinyAttackerTarget(fight);
        fight.turn.singleTargetRedirect={target:event.target,protectedTargets:[...event.whenTargets]};fight.target=event.target;
      }
      break;
    }
    case 'numbered-strike': {
      const target=total-1;
      if(isDestinyOpponentActive(fight,target))stageDamage(event.amount);
      break;
    }
    case 'resource-loss': {
      const before=fight.encounter.resources[event.resource];
      fight.encounter.resources[event.resource]=Math.max(0,before-total);
      fight.history.push({type:'resource-change',round:fight.round,resource:event.resource,previous:before,value:fight.encounter.resources[event.resource],source:event.name});
      break;
    }
    case 'arcane-control': {
      const rule=fight.encounter.arcaneControl,score=total+event.attributeSnapshot+(event.surgeBonus||0),success=score>=rule.difficulty;
      const target=success?rule.enemyArmy:rule.friendlyArmy;fight.opponents[target].health=Math.max(0,fight.opponents[target].health-rule.controlDamage);
      fight.history.push({type:'arcane-control',round:fight.round,score,success,target,damage:rule.controlDamage});
      queueDestinyEncounterEvent(fight,{kind:'arcane-backlash',name:'Backlash',dice:1,heroRoll:'ability',modifier:success?1:-1},'end',roll);
      break;
    }
    case 'arcane-backlash': {
      const rule=fight.encounter.arcaneControl,result=total+event.modifier;
      if(result>=rule.enemyMinimum){
        const opponent=fight.opponents[rule.druid];opponent.health=Math.max(0,opponent.health-rule.backlashDamage);
        let available=rule.restoreMagic;
        for(const effect of fight.effects)if(available>0&&effect.kind==='stat'&&effect.target==='hero'&&effect.attribute==='magic'&&effect.source===rule.surgeName&&effect.amount<0){const restored=Math.min(available,-effect.amount);effect.amount+=restored;available-=restored;}
      }else if(result>=rule.heroMinimum)stageDamage(rule.backlashDamage);
      if(fight.opponents[rule.druid].health===0||fight.opponents[rule.enemyArmy].health===0)fight.encounter.forcedVictory=true;
      fight.history.push({type:'arcane-backlash',round:fight.round,result});break;
    }
    case 'objective-damage-table': {
      const count=event.opponents.filter(target=>isDestinyOpponentActive(fight,target)).length;
      const face=Math.max(1,total-(count===1?event.singleOpponentReduction||0:0));
      const row=event.outcomes.find(outcome=>outcome.faces.includes(face));
      if(!row)throw new RangeError('Unknown objective damage roll');
      const objective=fight.opponents[event.target];objective.health=Math.max(0,objective.health-row.damage);
      fight.history.push({type:'objective-damage',round:fight.round,target:event.target,damage:row.damage,health:objective.health});
      break;
    }
    case 'ability-drain': {
      if(total<=event.limit){fight.used[event.abilityName]=(fight.used[event.abilityName]||0)+1;stageDamage(event.amount);}
      break;
    }
    case 'resource-dodge': {
      const count=fight.encounter.resources[event.resource]||0;
      if(total<=count){fight.encounter.resources[event.resource]=Math.max(0,count-1);fight.turn.normalDamageReplaced=true;fight.phase='end';}
      break;
    }
    case 'resource-if-low': {
      const before=fight.encounter.resources?.[event.resource];
      if(!Number.isSafeInteger(before)||before<0)throw new RangeError('Missing encounter resource');
      const value=total<=event.limit?before+event.increment:event.otherwiseSet??before;
      if(!Number.isSafeInteger(value)||value<0||value>1000000)throw new RangeError('Invalid encounter resource');
      fight.encounter.resources[event.resource]=value;
      fight.history.push({type:'resource-change',round:fight.round,resource:event.resource,previous:before,value,source:event.name});
      break;
    }
    case 'spirit-link': {
      const rule = settings();
      if (total <= rule.limit) {
        stageDamage(rule.damage);
        (fight.turn.encounterEndOpponentHealing ??= []).push({ ...rule.healing });
      }
      break;
    }
    case 'distracted': if (total <= settings().limit) fight.phase = 'end'; break;
    case 'weak-venom': {
      const rule = settings();
      if (total === rule.face&&!destinyImmuneToAbility(fight,rule.status)) (fight.encounter.heroStatuses ??= {})[rule.status] = rule.amount;
      break;
    }
    case 'yield':
      if (total >= settings().minimum) fight.encounter.forcedVictory = true;
      break;
    case 'roc-attack': {
      const rule = settings();
      if (total <= rule.limit) {
        heroDamage(fight, rule.damage);
        for (const change of rule.changes) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
        fight.phase = 'end';
      }
      break;
    }
    case 'sable-attack': {
      const rule = settings();
      if (total <= rule.healingLimit) {
        const opponent = fight.opponents[fight.target];
        opponent.health = Math.min(opponent.maxHealth, opponent.health + rule.healing);
        fight.phase = 'end';
      } else if (total >= rule.curseMinimum) {
        const from = fight.round + rule.blockDelay;
        fight.encounter.blockedRounds = { from, until: from + rule.blockDuration - 1, categories: [...rule.blockedCategories] };
        queueDestinyEncounterEvent(fight, rule.curse, 'end', roll);
      }
      break;
    }
    case 'enemy-dice-damage':
      if(event.explodeAcceptedFaces?.includes(dice[dice.length-1])){
        queueDestinyEncounterEvent(fight,{...event,dice:1,accumulatedDamage:(event.accumulatedDamage||0)+total},pending.returnPhase,roll);break;
      }
      heroDamage(fight,total+(event.accumulatedDamage||0)+(event.bonusAttribute==='armour'?destinyArmour(fight,'hero'):event.bonusAttribute?destinyStat(fight,'hero',event.bonusAttribute):0),true,event.attacker??destinyAttackerTarget(fight));
      if(event.replacesAttack){fight.turn.normalDamageReplaced=true;fight.phase='end';}
      if(event.healAttacker){const recipient=fight.opponents[event.attacker??destinyAttackerTarget(fight)];if(recipient.health>0)recipient.health=Math.min(recipient.maxHealth,recipient.health+total);}
      if (event.markStep) fight.encounter[event.markStep] = fight.encounter.hazardStep;
      if (event.nextStepStats) (fight.encounter.nextStepStats ??= []).push(...structuredClone(event.nextStepStats));
      if (fight.hero.health > 0 && event.followUp) queueDestinyEncounterEvent(fight, event.followUp, pending.returnPhase, roll);
      break;
    case 'sequence-challenge':
      fight.encounter.sequenceRemaining--;
      if (total + destinyStat(fight, 'hero', event.attribute) + (event.attributeModifier || 0) < event.minimum) {
        queueDestinyEncounterEvent(fight, event.onFailure, pending.returnPhase, roll);
      }
      break;
    case 'actor-strike': {
      const outcome = event.outcomes.find(item => item.faces.includes(total));
      if (!outcome) throw new RangeError('No encounter outcome for this roll');
      if (isDestinyOpponentActive(fight, outcome.target)) {
        queueDestinyEncounterEvent(fight, { ...outcome.event, attacker: outcome.target }, pending.returnPhase, roll);
      }
      break;
    }
    case 'armour-corrosion': {
      const current = destinyStat(fight, 'hero', event.attribute);
      if (current > 0) addDestinyStatEffect(fight, 'hero', event.attribute, -Math.min(current, event.amount), null, event.name);
      else queueDestinyEncounterEvent(fight, { ...event.overflow, attacker: event.attacker }, pending.returnPhase, roll);
      break;
    }
    case 'restart-sequence':
      if (total <= event.limit) fight.encounter.sequenceRemaining = event.count;
      break;
    case 'sasquatch-attack':
      if (total >= settings().minimum) queueDestinyEncounterEvent(fight, settings().followUp, 'end', roll);
      break;
    case 'sasquatch-challenge':
      if (total + destinyStat(fight, 'hero', settings().attribute) <= settings().limit) queueDestinyEncounterEvent(fight,
        settings().followUp, 'end', roll);
      break;
    case 'splinters':
      if (!event.avoided) heroDamage(fight, dice.filter(face => face <= settings().faceMaximum).length * settings().damagePerFace);
      break;
    case 'ice-prison': {
      const rule = settings();
      if (!fight.encounter.skollFreed && total === rule.face) {
        fight.encounter.prisonSixes = (fight.encounter.prisonSixes || 0) + 1;
        if (fight.encounter.prisonSixes === rule.requiredSuccesses) {
          fight.encounter.skollFreed = true;
          fight.turn.encounterEndHealing = rule.healing;
          fight.encounter.heroScoreBonus = (fight.encounter.heroScoreBonus || 0) + rule.scoreBonus;
        }
      }
      break;
    }
    case 'birdman-attack': if (total <= settings().limit) fight.phase = 'end'; break;
    case 'remove-acorn': {
      const rule = settings();
      if (total >= rule.minimum) {
        fight.encounter.acornsRemoved = (fight.encounter.acornsRemoved || 0) + 1;
        for (const change of rule.changes) addDestinyStatEffect(fight, change.target, change.attribute, change.amount, change.duration, event.name, change.delay || 0);
      } else heroDamage(fight, rule.failureDamage);
      break;
    }
    default: throw new RangeError('Unknown encounter event');
  }
}

export function prepareDestinyEndEvents(fight, roll) {
  if (fight.turn.encounterEndPrepared) return false;
  fight.turn.encounterEndPrepared = true;
  for (const event of fight.encounter?.endTests || []) {
    if(event.skipWhenTurnFlag&&fight.turn[event.skipWhenTurnFlag])continue;
    if(event.requiresWounded&&fight.opponents[event.target].health>=fight.opponents[event.target].maxHealth)continue;
    if (event.every && fight.round % event.every !== 0) continue;
    if (event.requiresAnyAlive && !event.requiresAnyAlive.some(target => isDestinyOpponentActive(fight, target))) continue;
    if (event.kind === 'ice-prison' && fight.encounter.skollFreed) continue;
    if (event.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    queueDestinyEncounterEvent(fight, { ...event, atEnd: true }, 'end', roll);
  }
  return ['ability-rolled','ability-choice'].includes(fight.phase);
}

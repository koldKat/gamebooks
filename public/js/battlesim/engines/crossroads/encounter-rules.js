import {integer,dice,damage,damageSpec,finish} from './values.js';

const abilities = ['strength','intelligence','wisdom','constitution','dexterity','charisma'];
const living = fight => fight.enemies.map((enemy,index) => enemy.hp > 0 && !enemy.fled ? index : -1).filter(index => index >= 0);

export function validateEncounterRules(rules,count) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new RangeError('Invalid encounter rules');
  const index = value => integer(value,0,count-1);
  const change = value => integer(value,-100,100);
  const check = value => { if (!abilities.includes(value)) throw new RangeError('Unknown ability'); };
  if(rules.escapeCheck)check(rules.escapeCheck.ability);
  if(rules.surpriseRounds!==undefined)integer(rules.surpriseRounds,1,1000);
  if(rules.openingEnemyTurn)integer(rules.openingEnemyTurn.count,1,count);
  if(rules.enemyEscape){index(rules.enemyEscape.enemy);integer(rules.enemyEscape.afterRound,1,1000);}
  if(rules.engulf){index(rules.engulf.enemy);integer(rules.engulf.consecutive,1,100);damageSpec(rules.engulf.damage);}
  if(rules.reinforcements)index(rules.reinforcements.template);
  if(rules.duplicates){
    integer(rules.duplicates.rounds,1,1000);integer(rules.duplicates.attacks,1,10);
    if(!Array.isArray(rules.duplicates.hitHeroOn)||!rules.duplicates.hitHeroOn.length)throw new RangeError('Missing duplicate targeting');
    rules.duplicates.hitHeroOn.forEach(value=>integer(value,1,6));
  }
  if(rules.holdOff){integer(rules.holdOff.count,1,100);integer(rules.holdOff.maximumAttackers,1,100);if(rules.holdOff.damage!==undefined)integer(rules.holdOff.damage,1);}
  if (rules.enemies) {
    if (!Array.isArray(rules.enemies) || rules.enemies.length !== count) throw new RangeError('Invalid enemy rules');
    for (const enemy of rules.enemies) {
      if (enemy.fromRound !== undefined) integer(enemy.fromRound,1,1000);
      if (enemy.afterDeathOf) { enemy.afterDeathOf.forEach(index); integer(enemy.delay,1,1000); }
      if (enemy.attackAfterDeathOf !== undefined) index(enemy.attackAfterDeathOf);
      if (enemy.attackEvery !== undefined) integer(enemy.attackEvery,1,1000);
      if (enemy.firstAttackRound !== undefined) integer(enemy.firstAttackRound,1,1000);
      if (enemy.fleeBelowHp !== undefined) integer(enemy.fleeBelowHp,1);
    }
  }
  if (rules.mount) { index(rules.mount.rider); index(rules.mount.mount); change(rules.mount.hitChange); change(rules.mount.attackChange); }
  if (rules.fatigue) { index(rules.fatigue.enemy); check(rules.fatigue.ability); change(rules.fatigue.hitChange); change(rules.fatigue.attackChange); }
  if (rules.charge) { check(rules.charge.ability); integer(rules.charge.failedDamageMultiplier,0,10); }
  if (rules.extraEnemyAttack) { check(rules.extraEnemyAttack.ability); index(rules.extraEnemyAttack.enemy); }
  if (rules.blindness) { index(rules.blindness.enemy); integer(rules.blindness.damage,0); check(rules.blindness.avoidAbility); check(rules.blindness.continueAbility); }
  if (rules.ally) {
    index(rules.ally.enemy); check(rules.ally.ability); integer(rules.ally.delay,1,1000); change(rules.ally.damageBonus);
    if (!Array.isArray(rules.ally.absorbOn)) throw new RangeError('Missing ally targeting');
    rules.ally.absorbOn.forEach(value => integer(value,1,6));
  }
  if (rules.freeRounds) { integer(rules.freeRounds.threshold,1,6); integer(rules.freeRounds.low,0,1000); integer(rules.freeRounds.high,0,1000); }
  if (rules.opening) {
    index(rules.opening.enemy);
    if(rules.opening.attackBonus!==undefined)change(rules.opening.attackBonus);
    if(rules.opening.damageMultiplier!==undefined)integer(rules.opening.damageMultiplier,1,10);
  }
  if(rules.retrieval){check(rules.retrieval.ability);damageSpec(rules.retrieval.damage);}
  if(rules.grip){index(rules.grip.enemy);check(rules.grip.ability);if(rules.grip.proneToHit!==undefined)integer(rules.grip.proneToHit,3,18);if(rules.grip.proneToBeHit!==undefined)integer(rules.grip.proneToBeHit,3,18);}
  if(rules.net){
    if(!Array.isArray(rules.net.casters)||!rules.net.casters.length)throw new RangeError('Missing net casters');
    rules.net.casters.forEach(index);integer(rules.net.threshold,3,18);integer(rules.net.captureTurns,1,100);check(rules.net.ability);
    if(rules.net.escapeTurns!==undefined)integer(rules.net.escapeTurns,1,100);
  }
  if(rules.capture){
    if(rules.capture.hpAtMost!==undefined)integer(rules.capture.hpAtMost);
    if(rules.capture.damageAtLeast!==undefined)integer(rules.capture.damageAtLeast);
    if(rules.capture.minimumHp!==undefined)integer(rules.capture.minimumHp);
  }
  if(rules.earlyVictory){rules.earlyVictory.enemies.forEach(index);integer(rules.earlyVictory.beforeRound,1,1000);}
  if (rules.abilityOutcome) check(rules.abilityOutcome.ability);
  if (rules.heroAttackBonus !== undefined) change(rules.heroAttackBonus);
  if (rules.openingDamage !== undefined) integer(rules.openingDamage);
  if (rules.firstRoundAttacks) {
    check(rules.firstRoundAttacks.ability);
    integer(rules.firstRoundAttacks.success,1,2);integer(rules.firstRoundAttacks.failure,1,2);
  }
  if (rules.firstHitWin) index(rules.firstHitWin.enemy);
  if (rules.roundLimitOutcome && !['win','loss','draw'].includes(rules.roundLimitOutcome.status)) throw new RangeError('Invalid round outcome');
  if (rules.vessel) {
    index(rules.vessel.enemy);integer(rules.vessel.maxHits,1);integer(rules.vessel.initialHits,0,rules.vessel.maxHits-1);
  }
  const attacks = values => {
    if (!Array.isArray(values) || !values.length) throw new RangeError('Missing form attacks');
    for (const attack of values) { integer(attack.toHit,3,18);damageSpec(attack.damage); }
  };
  if (rules.shapeshift) {
    index(rules.shapeshift.enemy);integer(rules.shapeshift.every,1,1000);
    if (!Array.isArray(rules.shapeshift.forms) || rules.shapeshift.forms.length<2) throw new RangeError('Missing shapes');
    for (const [i,form] of rules.shapeshift.forms.entries()) {
      integer(form.toBeHit,3,18);
      if (i<rules.shapeshift.forms.length-1) attacks(form.attacks);
    }
  }
  if (rules.disarm) {
    index(rules.disarm.enemy);check(rules.disarm.ability);integer(rules.disarm.requiredConsecutive,1,100);
    attacks(rules.disarm.afterAttacks);
  }
}

// Availability is shared by the UI and transitions. A future reinforcement
// remains in the fight even when every currently available enemy is defeated.
function availableEnemies(fight,round) {
  if (!fight) return [];
  if (fight.rulesVersion !== 2) return living(fight);
  const groups = fight.rules.attackGroups;
  const candidates = groups ? groups.map(group => group.find(index => fight.enemies[index].hp > 0)).filter(index => index !== undefined) : living(fight);
  const rules = fight.rules.mechanics?.enemies ?? [];
  return candidates.filter(index => {
    const rule = rules[index] ?? {};
    const arrival = rule.afterDeathOf ? fight.encounter?.arrivals?.[index] ?? Infinity : rule.fromRound ?? 1;
    return round >= arrival;
  });
}

export function encounterTargets(fight,round = (fight?.round ?? 0)+1) {
  const available=availableEnemies(fight,round);
  return fight?.rules.mechanics?.orderedTargets ? available.slice(0,1) : available;
}

export function encounterRound(original,{target = 0,allyTarget = null,healing = null,action = 'attack',roll = () => Math.floor(Math.random()*6)+1} = {}) {
  const partingShot=action==='partingShot'&&original?.status==='win'&&original.rules.mechanics?.partingShot&&original.round>=original.rules.roundLimit&&!original.encounter?.partingShotUsed;
  if ((original?.status !== 'active'&&!partingShot) || original.rulesVersion !== 2) throw new RangeError('No active fight');
  const fight=structuredClone(original),rules=fight.rules.mechanics;
  validateEncounterRules(rules,fight.enemies.length);
  const escapeCheck=action==='escapeCheck',sourceExit=action==='sourceExit';
  const round=fight.round+(partingShot||escapeCheck||sourceExit?0:1),available=availableEnemies(fight,round);
  const openingEnemyTurn=round===1&&rules.openingEnemyTurn;
  if(!['attack','retrieve','escapeGrip','flee','surrender','partingShot','escapeCheck','sourceExit'].includes(action)||action==='partingShot'&&!partingShot||healing!==null&&action!=='attack')throw new RangeError('Invalid action');
  if (action==='attack' && healing === null && available.length && !encounterTargets(fight,round).includes(target)) throw new RangeError('Choose an available target');
  if (rules.abilityOutcome && healing!==null) throw new RangeError('This encounter is an ability check');
  if(openingEnemyTurn&&healing!==null)throw new RangeError('No healing during the surprise attack');
  if (healing !== null) {
    integer(healing,1);
    if (fight.hero.hp >= fight.hero.maxHp) throw new RangeError('Already at maximum hit points');
  }
  fight.events=[];fight.round=round;
  const state=fight.encounter ??= {arrivals:{},allyRound:null,freeRounds:0,blinded:false,bonusAttack:false};
  if(healing!==null&&(fight.rules.enemyOnly||state.netTurns))throw new RangeError('No healing during this action');
  if(rules.grip&&state.gripped===undefined){state.gripped=Boolean(rules.grip.initiallyHeld);state.gripApplied=state.gripped;}
  const route = (status,section) => {
    finish(fight,status);fight.destination=section;fight.events.at(-1).destination=section;
  };
  if(sourceExit){
    if(!rules.sourceExit)throw new RangeError('No source item available');
    state.sourceExitUsed=true;route('escaped',rules.sourceExit.section);return fight;
  }
  const afterArmour=amount=>Math.max(0,amount-(rules.guardLethalDamageReduction&&fight.hero.hp-amount<0?0:fight.hero.damageReduction??0));
  if (rules.vessel && state.vesselHits===undefined) state.vesselHits=rules.vessel.initialHits;
  if (round===1 && rules.openingDamage) {
    const lost=Math.min(fight.hero.hp,rules.openingDamage);
    fight.hero.hp-=lost;fight.damageTaken+=lost;fight.events.push({kind:'openingDamage',amount:lost});
    if (!fight.hero.hp) { finish(fight,'loss');return fight; }
  }
  const check = (ability,strict=false) => {
    const values=dice(3,roll),total=values.reduce((sum,value)=>sum+value,0),passed=strict?total<fight.hero[ability]:total<=fight.hero[ability];
    fight.events.push({kind:'check',ability,dice:values,total,passed});
    return passed;
  };
  // A printed escape check happens after a completed round. It does not
  // repeat attacks, advance reinforcements or allow retries in that round.
  if(escapeCheck){
    if(!rules.escapeCheck||round<1||state.escapeCheckedRound===round)throw new RangeError('No escape check available');
    state.escapeCheckedRound=round;
    if(check(rules.escapeCheck.ability))route('escaped',rules.escapeCheck.section);
    return fight;
  }
  if(allyTarget!==null&&(!rules.holdOff?.damage||!available.includes(allyTarget)))throw new RangeError('Choose a living ally target');
  const announceDeaths = () => {
    (rules.enemies ?? []).forEach((rule,index) => {
      if (rule.afterDeathOf && state.arrivals[index] === undefined && rule.afterDeathOf.some(dead => !fight.enemies[dead].hp)) state.arrivals[index]=round+rule.delay;
    });
  };
  const done = () => {
    if (fight.status!=='active') return true;
    if(rules.earlyVictory&&round<rules.earlyVictory.beforeRound&&rules.earlyVictory.enemies.every(index=>!fight.enemies[index].hp)){
      route('win',rules.earlyVictory.section);return true;
    }
    announceDeaths();
    (rules.enemies ?? []).forEach((rule,index)=>{
      const enemy=fight.enemies[index];
      if (rule.fleeBelowHp && enemy.hp>0 && enemy.hp<rule.fleeBelowHp && !enemy.fled) {
        enemy.fled=true;fight.events.push({kind:'fled',name:enemy.name});
      }
    });
    if (!living(fight).length) { finish(fight,'win'); return true; }
    return false;
  };
  const hitChange = index => (rules.grip?.enemy===index&&state.gripped&&rules.grip.proneToBeHit!==undefined?rules.grip.proneToBeHit-fight.enemies[index].toBeHit:0)
    +(rules.mount?.rider===index && !fight.enemies[rules.mount.mount].hp ? rules.mount.hitChange : 0)
    +(fatigued && rules.fatigue.enemy===index ? rules.fatigue.hitChange : 0);
  const attackChange = index => (rules.grip?.enemy===index&&state.gripped&&rules.grip.proneToHit!==undefined?rules.grip.proneToHit-fight.enemies[index].attacks[0].toHit:0)
    +(rules.mount?.rider===index && !fight.enemies[rules.mount.mount].hp ? rules.mount.attackChange : 0)
    +(fatigued && rules.fatigue.enemy===index ? rules.fatigue.attackChange : 0);
  let fatigued=false;
  if (rules.abilityOutcome) {
    const passed=check(rules.abilityOutcome.ability);
    finish(fight,passed?'win':'loss');
    fight.destination=passed?rules.abilityOutcome.successSection:rules.abilityOutcome.failureSection;
    fight.events.at(-1).destination=fight.destination;return fight;
  }
  function heroAttack(index,{automatic=false,ally=false,attackBonus=0,multiplier=1}={}) {
    if(rules.enemyEscape&&!ally){state.engagedTargets??=[];if(!state.engagedTargets.includes(index))state.engagedTargets.push(index);}
    const enemy=fight.enemies[index];
    const values=automatic ? [] : dice(3,roll),total=values.reduce((sum,value)=>sum+value,fight.hero.attackBonus+attackBonus+(ally?0:rules.heroAttackBonus ?? 0));
    const hit=automatic || total>=enemy.toBeHit+hitChange(index);
    const result=hit ? damage(fight.weaponDamage,roll) : {dice:[],amount:0};
    const lost=Math.min(enemy.hp,Math.max(0,result.amount*multiplier+(hit&&ally ? rules.ally.damageBonus : 0)));
    enemy.hp-=lost;fight.damageDealt+=lost;
    fight.events.push({kind:'attack',side:ally?'ally':'hero',target:index,name:ally?rules.ally.name:enemy.name,dice:values,total,hit,automatic,damageDice:result.dice,damage:lost});
    if (hit && !ally && rules.firstHitWin?.enemy===index && !state.firstHitter) {
      state.firstHitter='hero';route('win',rules.firstHitWin.section);
    }
    announceDeaths();return hit;
  }
  if(partingShot){
    if(!available.includes(target))throw new RangeError('Choose a fleeing opponent');
    state.partingShotUsed=true;heroAttack(target);return fight;
  }
  if (round===1 && rules.opening && (rules.opening.automatic!==false || action==='attack' && healing===null)) {
    heroAttack(rules.opening.enemy,{automatic:rules.opening.automatic!==false,attackBonus:rules.opening.attackBonus??0,multiplier:rules.opening.damageMultiplier??1});
    if (done()) return fight;
    if(!fight.enemies[target]?.hp)target=encounterTargets(fight,round)[0]??target;
  }
  // Blindness threatens only rounds after the injury, never the same round.
  if (state.blinded && !check(rules.blindness.continueAbility)) {
    finish(fight,'loss');fight.destination=rules.blindness.lossSection;
    fight.events.at(-1).destination=fight.destination;return fight;
  }
  if (rules.freeRounds && round===1) {
    const value=dice(1,roll)[0];state.freeRounds=value<=rules.freeRounds.threshold?rules.freeRounds.low:rules.freeRounds.high;
    fight.events.push({kind:'freeRounds',dice:[value],amount:state.freeRounds});
  }
  if(rules.surpriseRounds&&round===1)state.freeRounds=rules.surpriseRounds;
  if (rules.ally && state.allyRound===null && check(rules.ally.ability)) state.allyRound=round+rules.ally.delay;
  if (rules.fatigue) fatigued=!check(rules.fatigue.ability);
  let damageMultiplier=1;
  let extraAttack=state.bonusAttack;state.bonusAttack=false;
  if (rules.firstRoundAttacks && round===1) extraAttack=(check(rules.firstRoundAttacks.ability,rules.firstRoundAttacks.strict)?rules.firstRoundAttacks.success:rules.firstRoundAttacks.failure)===2;
  if (rules.charge && round===1) {
    if (check(rules.charge.ability)) {
      damageMultiplier=0;state.bonusAttack=check(rules.charge.ability);
    } else damageMultiplier=rules.charge.failedDamageMultiplier;
  }
  const extraEnemy=rules.extraEnemyAttack && round===1 && !check(rules.extraEnemyAttack.ability) ? rules.extraEnemyAttack.enemy : null;
  let heroMiss=false,disarming=false;
  let skipHero=Boolean(openingEnemyTurn),fleeing=false;
  if(action==='surrender'){
    if(!rules.surrender)throw new RangeError('Cannot surrender');
    route('surrendered',rules.surrender.section);return fight;
  }
  if(action==='flee'){
    if(!rules.flee||state.gripped)throw new RangeError('Cannot flee');
    skipHero=true;fleeing=true;
    if(!rules.flee.finalAttack||rules.flee.onlyAfterAttack&&!state.heroAttacked){route('escaped',rules.flee.section);return fight;}
  }
  if(action==='retrieve'){
    if(!rules.retrieval||state.weaponRetrieved||state.netTurns)throw new RangeError('Cannot retrieve weapon');
    skipHero=true;
    if(check(rules.retrieval.ability,rules.retrieval.strict)){state.weaponRetrieved=true;fight.weaponDamage=damageSpec(rules.retrieval.damage);fight.events.push({kind:'weaponRetrieved'});}
  }
  if(action==='escapeGrip'){
    if(!rules.grip||!state.gripped)throw new RangeError('Not held');
    skipHero=true;if(check(rules.grip.ability)){state.gripped=false;fight.events.push({kind:'gripFreed'});}
  }
  if(state.netTurns){
    skipHero=true;
    if(check(rules.net.ability,rules.net.strict)){state.netTurns=0;fight.events.push({kind:'netFreed'});}
    else if(++state.netTurns>=rules.net.captureTurns)state.netCapturePending=true;
  }
  if (rules.disarm && !state.disarmed && healing===null) {
    disarming=true;
    state.disarmStreak=check(rules.disarm.ability,rules.disarm.strict)?(state.disarmStreak ?? 0)+1:0;
    if (state.disarmStreak>=rules.disarm.requiredConsecutive) {
      state.disarmed=true;fight.enemies[rules.disarm.enemy].attacks=structuredClone(rules.disarm.afterAttacks);
      fight.events.push({kind:'disarmed',name:fight.enemies[rules.disarm.enemy].name});
    }
  }
  if (healing !== null) {
    const restored=Math.min(healing,fight.hero.maxHp-fight.hero.hp);
    fight.hero.hp+=restored;fight.events.push({kind:'healing',amount:restored});
  } else if (available.length && !disarming && !skipHero && !rules.net?.escapeOnly && !fight.rules.enemyOnly) {
    state.heroAttacked=true;
    heroMiss=!heroAttack(target);
    if (done()) return fight;
    const count=rules.duplicates&&round<=rules.duplicates.rounds?rules.duplicates.attacks:extraAttack?2:1;
    for(let attack=1;attack<count;attack++) {
      const next=encounterTargets(fight,round);
      const index=next.includes(target)?target:next[0];
      if (index!==undefined) heroMiss=!heroAttack(index);
      if (done()) return fight;
    }
  }
  const allyHere=rules.ally && state.allyRound!==null && round>=state.allyRound;
  if (allyHere && fight.enemies[rules.ally.enemy].hp>0) {
    heroAttack(rules.ally.enemy,{ally:true});if (done()) return fight;
  }
  const partition=()=>{
    const alive=available.filter(index=>fight.enemies[index].hp>0&&!fight.enemies[index].fled);
    if(!rules.holdOff||alive.length<2)return {attackers:alive,held:[]};
    const attackers=Math.min(rules.holdOff.maximumAttackers,Math.max(1,alive.length-rules.holdOff.count));
    const held=alive.slice().reverse();
    if(alive.includes(allyTarget)){held.splice(held.indexOf(allyTarget),1);held.unshift(allyTarget);}
    held.length=alive.length-attackers;
    return {held,attackers:alive.filter(index=>!held.includes(index))};
  };
  const held=partition().held;
  if(rules.holdOff?.damage&&held.length){
    const index=held[0],enemy=fight.enemies[index],lost=Math.min(enemy.hp,rules.holdOff.damage);
    enemy.hp-=lost;fight.damageDealt+=lost;
    fight.events.push({kind:'attack',side:'ally',target:index,name:rules.holdOff.name,dice:[],total:0,hit:true,automatic:true,damageDice:[],damage:lost});
    if(done())return fight;
  }
  let engulfDamage=false;
  const attackers=openingEnemyTurn?partition().attackers.slice(0,openingEnemyTurn.count):partition().attackers;
  for (const index of attackers) {
    if (!fight.enemies[index].hp || fight.enemies[index].fled || round<=state.freeRounds) continue;
    const enemy=fight.enemies[index],schedule=rules.enemies?.[index] ?? {};
    if (rules.vessel?.enemy===index && healing===null && !heroMiss) continue;
    if (schedule.attackAfterDeathOf!==undefined && fight.enemies[schedule.attackAfterDeathOf].hp>0) continue;
    const first=schedule.firstAttackRound ?? 1;
    if (round<first || (round-first)%(schedule.attackEvery ?? 1)!==0) continue;
    const repetitions=extraEnemy===index?2:1;
    for (let repeat=0;repeat<repetitions;repeat++) {
      let previousHit=false;
      for (const attack of enemy.attacks) {
        if (attack.when==='heroMiss' && !heroMiss || attack.when==='otherwise' && heroMiss || attack.when==='previousHit'&&!previousHit) continue;
        if (allyHere && index===rules.ally.enemy) {
          const value=dice(1,roll)[0];
          if (rules.ally.absorbOn.includes(value)) { fight.events.push({kind:'absorbed',name:rules.ally.name,dice:[value]});continue; }
        }
        let values,total,hit;
        if (attack.vesselHit) {
          values=dice(3,roll);total=values.reduce((sum,value)=>sum+value,0);hit=total>=attack.toHit;
          if (hit) state.vesselHits++;
          fight.events.push({kind:'vesselAttack',name:rules.vessel.name,dice:values,total,hit,hits:state.vesselHits,max:rules.vessel.maxHits});
          if (state.vesselHits>=rules.vessel.maxHits) { finish(fight,'loss');return fight; }
          continue;
        }
        if (attack.check==='constitution') {
          values=dice(3,roll);total=values.reduce((sum,value)=>sum+value,0);hit=total>fight.hero.constitution;
        } else {
          values=dice(3,roll);total=values.reduce((sum,value)=>sum+value,openingEnemyTurn?.ignoreDefence?0:-fight.hero.defenceBonus);hit=total>=attack.toHit+attackChange(index);
        }
        previousHit=hit;
        if(hit&&rules.duplicates&&round<=rules.duplicates.rounds){
          const selection=dice(1,roll);
          if(!rules.duplicates.hitHeroOn.includes(selection[0])){
            fight.events.push({kind:'attack',side:'enemy',target:index,name:enemy.name,dice:values,total,hit:true,damageDice:[],damage:0});
            fight.events.push({kind:'absorbed',name:rules.duplicates.name,dice:selection});continue;
          }
        }
        const result=hit?damage(attack.damage,roll):{dice:[],amount:0};
        if (hit && rules.firstHitWin?.enemy===index && !state.firstHitter) state.firstHitter='enemy';
        const amount=afterArmour(result.amount*damageMultiplier);
        const remaining=fight.hero.hp-amount;
        const lost=Math.min(fight.hero.hp,amount);
        fight.hero.hp-=lost;fight.damageTaken+=lost;
        if(rules.engulf?.enemy===index&&lost>0)engulfDamage=true;
        fight.events.push({kind:'attack',side:'enemy',target:index,name:enemy.name,dice:values,total,hit,damageDice:result.dice,damage:lost});
        if(hit&&rules.grip?.enemy===index&&rules.grip.onFirstHit&&!state.gripApplied){state.gripped=true;state.gripApplied=true;fight.events.push({kind:'gripped'});}
        if(hit&&rules.capture){
          const capture=rules.capture;
          if((capture.minimumHp===undefined||remaining>=capture.minimumHp)
            &&(capture.hpAtMost===undefined||remaining<=capture.hpAtMost)
            &&(capture.damageAtLeast===undefined||fight.damageTaken>=capture.damageAtLeast)){
            route('loss',capture.section);return fight;
          }
        }
        if (!fight.hero.hp) { finish(fight,'loss');return fight; }
        if (hit && !state.blinded && rules.blindness?.enemy===index && result.amount===rules.blindness.damage && !check(rules.blindness.avoidAbility)) {
          state.blinded=true;fight.events.push({kind:'blinded'});
        }
      }
    }
  }
  if(rules.engulf){
    state.engulfStreak=engulfDamage?(state.engulfStreak??0)+1:0;
    if(!state.engulfed&&state.engulfStreak>=rules.engulf.consecutive){state.engulfed=true;fight.events.push({kind:'engulfed'});}
    if(state.engulfed&&fight.enemies[rules.engulf.enemy].hp>0){
      const result=damage(rules.engulf.damage,roll),lost=Math.min(fight.hero.hp,afterArmour(result.amount));
      fight.hero.hp-=lost;fight.damageTaken+=lost;
      fight.events.push({kind:'attack',side:'enemy',target:rules.engulf.enemy,name:rules.engulf.name,dice:[],total:0,hit:true,automatic:true,damageDice:result.dice,damage:lost});
      if(!fight.hero.hp){finish(fight,'loss');return fight;}
    }
  }
  if(rules.enemyEscape&&round>=rules.enemyEscape.afterRound&&fight.enemies[rules.enemyEscape.enemy].hp>0&&!(state.engagedTargets??[]).includes(rules.enemyEscape.enemy)){
    route('draw',rules.enemyEscape.section);return fight;
  }
  if(fleeing){route('escaped',rules.flee.section);return fight;}
  if(rules.reinforcements&&fight.status==='active'&&living(fight).length){
    const enemy=structuredClone(fight.enemies[rules.reinforcements.template]);
    enemy.hp=enemy.maxHp;enemy.fled=false;enemy.name=rules.reinforcements.name+' '+(fight.enemies.length+1);
    fight.enemies.push(enemy);fight.events.push({kind:'reinforcement',name:enemy.name});
  }
  if(state.netCapturePending){route('loss',rules.net.section);return fight;}
  if(rules.net&&!state.netTurns&&rules.net.casters.some(index=>fight.enemies[index].hp>0)){
    const values=dice(3,roll),total=values.reduce((a,b)=>a+b,0),hit=total>=rules.net.threshold;
    fight.events.push({kind:'netThrown',dice:values,total,hit});
    if(hit){state.netTurns=1;state.netAvoided=0;}
    else if(rules.net.escapeOnly&&(state.netAvoided=(state.netAvoided??0)+1)>=rules.net.escapeTurns){route('win',rules.net.escapeSection);return fight;}
  }
  if (rules.vessel) {
    fight.destination=healing===null && !heroMiss ? rules.vessel.heroHitSection
      : fight.events.some(event=>event.kind==='vesselAttack'&&event.hit)?rules.vessel.enemyHitSection:rules.vessel.bothMissSection;
  }
  if (fight.rules.roundLimit && round>=fight.rules.roundLimit) {
    if (rules.roundLimitOutcome) route(rules.roundLimitOutcome.status,rules.roundLimitOutcome.section);
    else finish(fight,fight.rules.roundResult==='compareDamage'
      ? fight.damageDealt>fight.damageTaken?'win':fight.damageDealt<fight.damageTaken?'loss':'draw':'win');
  }
  if (rules.shapeshift && round%rules.shapeshift.every===0) {
    state.formIndex=(state.formIndex ?? 0)+1;
    const form=rules.shapeshift.forms[state.formIndex],enemy=fight.enemies[rules.shapeshift.enemy];
    enemy.name=form.name;enemy.toBeHit=form.toBeHit;enemy.attacks=structuredClone(form.attacks);
    fight.events.push({kind:'shape',name:form.name});
    if (state.formIndex===rules.shapeshift.forms.length-1) {
      finish(fight,'win');fight.destination=rules.shapeshift.lastSection;fight.events.at(-1).destination=fight.destination;
    }
  }
  return fight;
}

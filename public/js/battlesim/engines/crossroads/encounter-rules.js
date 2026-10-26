import {integer,dice,damage,damageSpec,finish} from './values.js';

const abilities = ['strength','intelligence','wisdom','constitution','dexterity','charisma'];
const living = fight => fight.enemies.map((enemy,index) => enemy.hp > 0 && !enemy.fled ? index : -1).filter(index => index >= 0);

export function validateEncounterRules(rules,count) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new RangeError('Invalid encounter rules');
  const index = value => integer(value,0,count-1);
  const change = value => integer(value,-100,100);
  const check = value => { if (!abilities.includes(value)) throw new RangeError('Unknown ability'); };
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
  if (rules.opening) index(rules.opening.enemy);
  if (rules.abilityOutcome) check(rules.abilityOutcome.ability);
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

export function encounterRound(original,{target = 0,healing = null,roll = () => Math.floor(Math.random()*6)+1} = {}) {
  if (original?.status !== 'active' || original.rulesVersion !== 2) throw new RangeError('No active fight');
  const fight=structuredClone(original),rules=fight.rules.mechanics;
  validateEncounterRules(rules,fight.enemies.length);
  const round=fight.round+1,available=availableEnemies(fight,round);
  if (healing === null && available.length && !encounterTargets(fight,round).includes(target)) throw new RangeError('Choose an available target');
  if (rules.abilityOutcome && healing!==null) throw new RangeError('This encounter is an ability check');
  if (healing !== null) {
    integer(healing,1);
    if (fight.hero.hp >= fight.hero.maxHp) throw new RangeError('Already at maximum hit points');
  }
  fight.events=[];fight.round=round;
  const state=fight.encounter ??= {arrivals:{},allyRound:null,freeRounds:0,blinded:false,bonusAttack:false};
  const check = (ability,strict=false) => {
    const values=dice(3,roll),total=values.reduce((sum,value)=>sum+value,0),passed=strict?total<fight.hero[ability]:total<=fight.hero[ability];
    fight.events.push({kind:'check',ability,dice:values,total,passed});
    return passed;
  };
  const announceDeaths = () => {
    (rules.enemies ?? []).forEach((rule,index) => {
      if (rule.afterDeathOf && state.arrivals[index] === undefined && rule.afterDeathOf.some(dead => !fight.enemies[dead].hp)) state.arrivals[index]=round+rule.delay;
    });
  };
  const done = () => {
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
  const hitChange = index => (rules.mount?.rider===index && !fight.enemies[rules.mount.mount].hp ? rules.mount.hitChange : 0)
    +(fatigued && rules.fatigue.enemy===index ? rules.fatigue.hitChange : 0);
  const attackChange = index => (rules.mount?.rider===index && !fight.enemies[rules.mount.mount].hp ? rules.mount.attackChange : 0)
    +(fatigued && rules.fatigue.enemy===index ? rules.fatigue.attackChange : 0);
  let fatigued=false;
  if (rules.abilityOutcome) {
    const passed=check(rules.abilityOutcome.ability);
    finish(fight,passed?'win':'loss');
    fight.destination=passed?rules.abilityOutcome.successSection:rules.abilityOutcome.failureSection;
    fight.events.at(-1).destination=fight.destination;return fight;
  }
  function heroAttack(index,{automatic=false,ally=false}={}) {
    const enemy=fight.enemies[index];
    const values=automatic ? [] : dice(3,roll),total=values.reduce((sum,value)=>sum+value,fight.hero.attackBonus);
    const hit=automatic || total>=enemy.toBeHit+hitChange(index);
    const result=hit ? damage(fight.weaponDamage,roll) : {dice:[],amount:0};
    const lost=Math.min(enemy.hp,Math.max(0,result.amount+(hit&&ally ? rules.ally.damageBonus : 0)));
    enemy.hp-=lost;fight.damageDealt+=lost;
    fight.events.push({kind:'attack',side:ally?'ally':'hero',target:index,name:ally?rules.ally.name:enemy.name,dice:values,total,hit,automatic,damageDice:result.dice,damage:lost});
    announceDeaths();return hit;
  }
  if (round===1 && rules.opening) {
    heroAttack(rules.opening.enemy,{automatic:true});
    if (done()) return fight;
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
  if (rules.ally && state.allyRound===null && check(rules.ally.ability)) state.allyRound=round+rules.ally.delay;
  if (rules.fatigue) fatigued=!check(rules.fatigue.ability);
  let damageMultiplier=1;
  const extraAttack=state.bonusAttack;state.bonusAttack=false;
  if (rules.charge && round===1) {
    if (check(rules.charge.ability)) {
      damageMultiplier=0;state.bonusAttack=check(rules.charge.ability);
    } else damageMultiplier=rules.charge.failedDamageMultiplier;
  }
  const extraEnemy=rules.extraEnemyAttack && round===1 && !check(rules.extraEnemyAttack.ability) ? rules.extraEnemyAttack.enemy : null;
  let heroMiss=false,disarming=false;
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
  } else if (available.length && !disarming) {
    heroMiss=!heroAttack(target);
    if (done()) return fight;
    if (extraAttack) {
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
  for (const index of available) {
    if (!fight.enemies[index].hp || fight.enemies[index].fled || round<=state.freeRounds) continue;
    const enemy=fight.enemies[index],schedule=rules.enemies?.[index] ?? {};
    if (schedule.attackAfterDeathOf!==undefined && fight.enemies[schedule.attackAfterDeathOf].hp>0) continue;
    const first=schedule.firstAttackRound ?? 1;
    if (round<first || (round-first)%(schedule.attackEvery ?? 1)!==0) continue;
    const repetitions=extraEnemy===index?2:1;
    for (let repeat=0;repeat<repetitions;repeat++) {
      for (const attack of enemy.attacks) {
        if (attack.when==='heroMiss' && !heroMiss || attack.when==='otherwise' && heroMiss) continue;
        if (allyHere && index===rules.ally.enemy) {
          const value=dice(1,roll)[0];
          if (rules.ally.absorbOn.includes(value)) { fight.events.push({kind:'absorbed',name:rules.ally.name,dice:[value]});continue; }
        }
        let values,total,hit;
        if (attack.check==='constitution') {
          values=dice(3,roll);total=values.reduce((sum,value)=>sum+value,0);hit=total>fight.hero.constitution;
        } else {
          values=dice(3,roll);total=values.reduce((sum,value)=>sum+value,-fight.hero.defenceBonus);hit=total>=attack.toHit+attackChange(index);
        }
        const result=hit?damage(attack.damage,roll):{dice:[],amount:0};
        const lost=Math.min(fight.hero.hp,result.amount*damageMultiplier);
        fight.hero.hp-=lost;fight.damageTaken+=lost;
        fight.events.push({kind:'attack',side:'enemy',target:index,name:enemy.name,dice:values,total,hit,damageDice:result.dice,damage:lost});
        if (!fight.hero.hp) { finish(fight,'loss');return fight; }
        if (hit && !state.blinded && rules.blindness?.enemy===index && result.amount===rules.blindness.damage && !check(rules.blindness.avoidAbility)) {
          state.blinded=true;fight.events.push({kind:'blinded'});
        }
      }
    }
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

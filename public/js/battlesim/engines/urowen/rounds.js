import {rollUrowenDie,urowenDamage,urowenCombatOutcome,healUrowenPotion} from './core.js';
import {urowenEnemyAttribute,urowenEnemyRerolls,applyUrowenEnemyDie,
  resolveUrowenEnemyDodge,resolveUrowenPlayerDodge,urowenPlayerHitDefense,
  resolveUrowenEnemyHit,urowenWonEnemyAttackEffects} from './enemy-effects.js';
import {urowenEnemyLocation,urowenPossessionHit,hitUrowenAppendage,
  urowenAppendageDamage,urowenSisteliumDamage,startUrowenInvisibility,
  resolveUrowenCompanionHit,canUrowenCompanionAttack} from './forms.js';
import {castUrowenSpell} from './spells.js';
import {applyUrowenWeaponHit} from './weapons.js';
import {settleUrowenFight} from './bets.js';

const clone=value=>structuredClone(value);
const terminal=new Set(['win','loss','retreated','escaped','stopped']);
function rememberEffect(fight,effect) {
  const old=fight.effects.find(item=>item.type===effect.type&&item.enemy===fight.target);
  if(effect.type==='cumulative-player-attack-penalty') {
    if(old)old.amount+=effect.amount;
    else fight.effects.push({...effect,enemy:fight.target});
  } else if(old) {
    old.amount=Math.max(old.amount,effect.amount);
  } else fight.effects.push({...effect,enemy:fight.target});
}
function attackPenalty(fight) {
  return (fight.rules.playerAttackPenalty??0)+fight.effects
    .filter(item=>item.type.includes('attack-penalty'))
    .reduce((sum,item)=>sum+item.amount,0);
}
function synchronizePlayer(state) {
  if(state.temporary) {
    const fight=state.fight;
    state.temporary.player=clone(fight.player);
    if(fight.rules.playerArmor!==false)for(let index=0;index<6;index++) {
      const loss=Math.max(0,fight.initialArmor[index]-fight.player.armor[index]);
      const unapplied=Math.max(0,loss-fight.appliedArmorLoss[index]);
      state.character.armor[index]=Math.max(0,state.character.armor[index]-unapplied);
      fight.appliedArmorLoss[index]=loss;
    }
  }
  else {
    state.character.life=state.fight.player.life;
    state.character.power=state.fight.player.power;
    if(state.fight.rules.playerArmor!==false)state.character.armor=clone(state.fight.player.armor);
  }
}
function finishRound(state,result) {
  const fight=state.fight,enemy=fight.enemies[fight.target];
  if(!terminal.has(fight.status)) {
    if(!result.skipSupport&&fight.appendages.length&&enemy.life>0) {
      const damage=urowenAppendageDamage(fight.appendages);
      fight.player.life-=damage;result.supportDamage=(result.supportDamage??0)+damage;
    }
    if(!result.skipSupport&&enemy.rules.secondHeadRoundEnd&&enemy.life>enemy.rules.secondHeadRoundEnd.whileLifeAbove) {
      const damage=enemy.rules.secondHeadRoundEnd.damage;
      fight.player.life-=damage;result.supportDamage=(result.supportDamage??0)+damage;
    }
    fight.status=urowenCombatOutcome(fight.player.life,enemy.life);
    if(fight.status==='fighting'&&enemy.rules.retreatAtLife!==undefined&&enemy.life<=enemy.rules.retreatAtLife) {
      fight.status='retreated';
    }
    if(fight.status==='fighting'&&fight.rules.bothStopAtLife!==undefined&&
      (fight.player.life<=fight.rules.bothStopAtLife||enemy.life<=fight.rules.bothStopAtLife))fight.status='stopped';
    if(fight.status==='win'&&fight.target+1<fight.enemies.length) {
      fight.target++;fight.status='fighting';fight.appendages=[];
      result.nextEnemy=fight.target;
    } else if(['win','retreated'].includes(fight.status)) {
      if(fight.rules.restoreOnVictory!==false&&state.temporary?.stage!=='mission') {
        fight.player.life=fight.player.maxLife;
      }
    }
  }
  synchronizePlayer(state);
  if(terminal.has(fight.status)) {
    settleUrowenFight(state);
    state.history.push({section:fight.section,status:fight.status,rounds:fight.round,
      remainingLife:fight.player.life});
  }
  state.log.push(result);
  state.log=state.log.slice(-150);
  return {state,result};
}
export function startUrowenEncounter(state) {
  if(state.fight?.status!=='prepared')throw new RangeError('Encounter not prepared');
  if(state.fight.player.life<=0)throw new RangeError('Character is not conscious');
  const rules=state.fight.enemies[state.fight.target].rules;
  if((rules.precombatElixir||rules.precombatEnemyArrow||rules.precombatVolley||rules.openingCharge)&&!state.fight.openingDone) {
    throw new RangeError('Resolve the printed opening first');
  }
  const next=clone(state);next.fight.status='fighting';return next;
}
export function resolveUrowenEncounterRound(state,roll,options={}) {
  if(state.fight?.status!=='fighting')throw new RangeError('Encounter is not fighting');
  const next=clone(state),fight=next.fight,player=fight.player;
  let enemy=fight.enemies[fight.target];
  const rules=enemy.rules,result={round:++fight.round,dice:[],playerDamage:0,enemyDamage:0};
  const playerDie=(phase='attack')=>{
    const weapon=player.weapon;
    const reroll=[...(weapon.reroll??[])];
    if(phase==='location'&&fight.rules.rerollPlayerLegLocation&&!reroll.includes(1))reroll.push(1);
    const value=rollUrowenDie(roll,{reroll,
      convertOne:phase==='damage'&&player.career==='sorcerer'?weapon.sorcererOne??3:undefined});
    result.dice.push({actor:'player',phase,...value});return value;
  };
  const enemyDie=(phase='attack')=>{
    const value=rollUrowenDie(roll,{reroll:urowenEnemyRerolls(enemy,rules,phase)});
    enemy=applyUrowenEnemyDie(enemy,rules,value.raw);
    fight.enemies[fight.target]=enemy;
    result.dice.push({actor:'enemy',phase,...value});return value;
  };
  const ongoing=fight.effects.filter(item=>['bleeding','venom','freezing'].includes(item.type))
    .reduce((sum,item)=>sum+item.amount,0);
  player.life-=ongoing;result.ongoing=ongoing;
  if(enemy.net)enemy.life-=enemy.net.ongoing;
  enemy.life-=enemy.weaponBleeding??0;
  enemy.life-=enemy.weaponVenom??0;
  if(rules.startRoundSupportDamage) {
    const damage=urowenSisteliumDamage(fight.enemies.filter(item=>item.life>0).length,fight.enemies.length);
    player.life-=damage;result.supportDamage=damage;
  }
  const initial=urowenCombatOutcome(player.life,enemy.life);
  if(initial!=='fighting') {result.skipSupport=true;return finishRound(next,result);}
  if(next.character.companion&&canUrowenCompanionAttack({life:player.life,used:fight.companionUsed})) {
    const hit=resolveUrowenCompanionHit(roll,enemy.armorByLocation);
    enemy.life-=hit.damage;fight.companionUsed=true;result.companionDamage=hit.damage;
    result.dice.push({actor:'companion',phase:'location',raw:hit.location},
      {actor:'companion',phase:'damage',raw:hit.rawDamage});
    if(urowenCombatOutcome(player.life,enemy.life)!=='fighting') {
      result.skipSupport=true;return finishRound(next,result);
    }
  }
  let playerWins=false,enemyWins=false;
  const invisible=enemy.invisibilityAttacks>0;
  if(invisible) {
    enemy.invisibilityAttacks--;enemyWins=true;result.invisible=true;
  } else {
    const pa=playerDie(),ea=enemyDie();
    result.playerAttack=pa.value+player.attributes[player.weapon.attribute]
      +(fight.rules.mountedPlayerAttackBonus??0)+(fight.elixirAttackBonus??0)+(fight.nextElixirAttackBonus??0)+(fight.sceneAttackBonus??0)-attackPenalty(fight);
    fight.nextElixirAttackBonus=0;
    result.enemyAttack=ea.value+urowenEnemyAttribute(enemy,rules)
      -(enemy.poppy?.attackPenalty??0)-(enemy.net?.attackPenalty??0)-(enemy.spitPenalty??0)-(enemy.brokenBones??0);
    fight.effects=fight.effects.filter(item=>item.type!=='next-player-attack-penalty');
    playerWins=result.playerAttack>result.enemyAttack;
    enemyWins=result.enemyAttack>result.playerAttack;
    if(enemyWins) {
      for(const effect of urowenWonEnemyAttackEffects(rules,ea.raw))rememberEffect(fight,effect);
      if(rules.invisibility&&enemy.life<rules.invisibility.belowLife&&enemy.power>=rules.invisibility.powerCost) {
        enemy=startUrowenInvisibility(enemy,rules.invisibility);
        enemy.invisibilityAttacks--;
        fight.enemies[fight.target]=enemy;result.invisible=true;
      }
    }
  }
  if(playerWins) {
    if(options.potionIndex!==undefined) {
      const index=options.potionIndex,potions=next.character.potions;
      if(fight.rules.items===false||!Number.isInteger(index)||index<0||!potions?.[index]||potions[index].quantity<1) {
        throw new RangeError('Potion unavailable');
      }
      const potion=potions[index],healing=healUrowenPotion(player,potion,roll);
      potion.quantity--;fight.player=healing.player;
      result.healed=healing.healed;
      result.dice.push(...healing.rolls.map(raw=>({actor:'player',phase:'potion',raw})));
    } else if(options.monkHeal) {
      if(player.career!=='monk'||fight.monkUsed)throw new RangeError('Healing unavailable');
      const raw=rollUrowenDie(roll).raw,amount=raw===6?8:raw;
      result.dice.push({actor:'player',phase:'heal',raw});
      const healed=Math.min(player.maxLife,player.life+amount)-player.life;
      player.life+=healed;fight.monkUsed=true;result.healed=healed;
    } else if(options.spell) {
      if(fight.rules.spells===false||player.weapon.attribute!=='MAG')throw new RangeError('Spell unavailable');
      const spell=castUrowenSpell(player,enemy,options.spell,roll,
        {wonMagicAttack:true,known:options.knownSpells?.includes(options.spell),damageBonus:fight.sceneDamageBonus??0});
      fight.player=spell.player;enemy=spell.enemy;fight.enemies[fight.target]=enemy;
      result.enemyDamage=spell.damage;result.healed=spell.healed;
      result.dice.push(...spell.rolls.map(raw=>({actor:'player',phase:'spell',raw})));
    } else {
      const dodge=resolveUrowenEnemyDodge(rules,roll);
      result.dice.push(...dodge.rolls.map(raw=>({actor:'enemy',phase:'dodge',raw})));
      result.enemyDodged=dodge.dodged;
      if(!dodge.dodged) {
        const appendage=options.appendage;
        if(appendage!==undefined&&(!Number.isInteger(appendage)||!fight.appendages[appendage]||fight.appendages[appendage].life<=0)) {
          throw new RangeError('Invalid appendage');
        }
        const location=appendage===undefined?(enemy.headLocked?6:playerDie('location').value):undefined;
        const raw=playerDie('damage').raw;
        const defense=urowenPlayerHitDefense(rules,raw);
        let bonus=player.weapon.bonus+(fight.sceneDamageBonus??0);
        if(raw===6&&fight.rules.bothRawDamage6Base!==undefined)bonus=fight.rules.bothRawDamage6Base-6+(fight.sceneDamageBonus??0);
        if(options.fireEdge&&raw===6) {
          if(raw!==6||fight.fireEdgeUsed||!options.knownSpells?.includes('fireEdge')||fight.rules.spells===false)throw new RangeError('Fire edge unavailable');
          fight.fireEdgeUsed=true;bonus+=3;
        }
        let damage=appendage===undefined?urowenDamage({rawDamage:raw,location,bonus,
          armor:enemy.armorByLocation[location-1],career:player.career,sorcererOne:player.weapon.sorcererOne??3}):
          Math.max(0,(player.career==='warrior'&&raw===6?8:player.career==='sorcerer'&&raw===1?player.weapon.sorcererOne??3:raw)+bonus);
        if(options.headSpit&&location===6) {
          if(location!==6||!fight.rules.playerHeadSpitOncePerEnemy||enemy.spitPenalty)throw new RangeError('Venom unavailable');
          damage=raw+3+(fight.sceneDamageBonus??0);enemy.spitPenalty=1;
        }
        if(defense.blocked)damage=0;
        fight.player.life-=defense.reflected;result.playerDamage+=defense.reflected;
        if(appendage===undefined) {
          enemy.life-=damage;
          enemy=applyUrowenWeaponHit(enemy,player.weapon,{rawDamage:raw,location,damage});
          if(damage>0&&fight.poisonCoating&&!fight.poisonDelivered) {
            enemy.weaponVenom=1;fight.poisonDelivered=true;
          }
          fight.enemies[fight.target]=enemy;
          if(next.temporary?.stage==='possession'&&!defense.blocked) {
            const effect=urowenPossessionHit({rawDamage:raw,location});
            if(effect.instantKill)enemy.life=0;
            if(effect.bleeding)enemy.net={...(enemy.net??{}),ongoing:effect.bleeding,attackPenalty:enemy.net?.attackPenalty??0};
          }
        } else fight.appendages=hitUrowenAppendage(fight.appendages,appendage,damage);
        result.enemyDamage=damage;result.location=location;result.rawDamage=raw;
      }
    }
  } else if(enemyWins) {
    const dodge=resolveUrowenPlayerDodge(player.career,result.invisible?rules.invisibility:rules,roll);
    result.dice.push(...dodge.rolls.map(raw=>({actor:'player',phase:'dodge',raw})));
    result.playerDodged=dodge.dodged;
    if(!dodge.dodged) {
      const locationResult=urowenEnemyLocation(()=>enemyDie('location').raw,
        {increase:rules.locationIncrease??0,highestOfTwo:!!rules.chooseHighestLocation});
      const raw=enemyDie('damage').raw;
      const hitEnemy=clone(enemy);
      hitEnemy.damageBonus-=enemy.poppy?.damagePenalty??0;
      if(raw===6&&fight.rules.bothRawDamage6Base!==undefined)hitEnemy.damageBonus=fight.rules.bothRawDamage6Base-6;
      const hit=resolveUrowenEnemyHit(player,hitEnemy,rules,{location:locationResult.location,rawDamage:raw,
        armorBonus:fight.elixirArmorBonus??0},roll);
      fight.player=hit.player;result.playerDamage+=hit.damage;
      if(player.magicGreaves&&locationResult.location===1&&!rules.ignorePlayerArmor) {
        const beforeArmor=urowenDamage({rawDamage:raw,location:1,bonus:hitEnemy.damageBonus+
          (raw===6&&!rules.extraIgnoresArmor?(rules.rawDamage6Extra??0):0)});
        if(beforeArmor>0&&player.armor[0]>=2) {
          enemy.life-=2;result.enemyDamage+=2;result.greavesReflection=2;
        }
      }
      result.location=locationResult.location;result.rawDamage=raw;
      result.dice.push(...hit.rolls.map(raw=>({actor:'enemy',phase:'effect',raw})));
      for(const effect of hit.effects)rememberEffect(fight,effect);
      if(options.lethalMirror&&raw===6) {
        if(raw!==6||fight.lethalMirrorUsed||!options.knownSpells?.includes('lethalMirror')||fight.rules.spells===false)throw new RangeError('Mirror unavailable');
        fight.lethalMirrorUsed=true;enemy.life-=3;result.enemyDamage+=3;
      }
      if(hit.escaped) {fight.status='escaped';fight.destination=hit.destination;}
      else if(hit.destination!==null) {fight.status='loss';fight.destination=hit.destination;}
    }
  }
  if(fight.status==='fighting'&&enemy.life>0&&rules.supportLion) {
    const location=rollUrowenDie(roll).raw,rawDamage=rollUrowenDie(roll).raw;
    const damage=urowenDamage({rawDamage,location,bonus:rules.supportLion.damageBonus,
      armor:fight.player.armor[location-1]});
    fight.player.life-=damage;result.supportDamage=(result.supportDamage??0)+damage;
    result.dice.push({actor:'support-lion',phase:'location',raw:location},
      {actor:'support-lion',phase:'damage',raw:rawDamage});
  }
  return finishRound(next,result);
}

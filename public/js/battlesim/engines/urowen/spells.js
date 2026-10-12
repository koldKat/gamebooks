import {rollUrowenDie,urowenDamage} from './core.js';
const costs=Object.freeze({fireball:2,poppy:3,lifeSuction:2});
export function castUrowenSpell(player,enemy,spell,roll,{wonMagicAttack=false,known=false,damageBonus=0}={}) {
  if(!Number.isSafeInteger(damageBonus)||Math.abs(damageBonus)>1)throw new RangeError('Invalid damage bonus');
  if(!Object.hasOwn(costs,spell)||!known||!wonMagicAttack||player.power<costs[spell]) {
    throw new RangeError('Spell unavailable');
  }
  const nextPlayer=structuredClone(player),nextEnemy=structuredClone(enemy),rolls=[];
  nextPlayer.power-=costs[spell];
  const die=()=>{const raw=rollUrowenDie(roll).raw;rolls.push(raw);return raw;};
  let damage=0,healed=0;
  if(spell==='fireball') {
    const location=die(),rawDamage=die();
    damage=urowenDamage({rawDamage,location,bonus:5+damageBonus,armor:nextEnemy.armorByLocation[location-1],
      career:nextPlayer.career,sorcererOne:nextPlayer.weapon.sorcererOne??3});
  } else if(spell==='lifeSuction') {
    damage=die()+die()+damageBonus;
    const life=Math.min(nextPlayer.maxLife,nextPlayer.life+damage);
    healed=life-nextPlayer.life;nextPlayer.life=life;
  } else {
    nextEnemy.poppy={damagePenalty:3,attackPenalty:1};
  }
  nextEnemy.life-=damage;
  return {player:nextPlayer,enemy:nextEnemy,rolls,damage,healed};
}
export function useUrowenLethalMirror(fight,rawEnemyDamage,{known=false}={}) {
  if(!known||rawEnemyDamage!==6||fight.lethalMirrorUsed)throw new RangeError('Ability unavailable');
  const next=structuredClone(fight);next.lethalMirrorUsed=true;next.enemy.life-=3;
  return next;
}
export function useUrowenFireEdge(fight,rawPlayerDamage,{known=false}={}) {
  if(!known||rawPlayerDamage!==6||fight.fireEdgeUsed)throw new RangeError('Ability unavailable');
  const next=structuredClone(fight);next.fireEdgeUsed=true;
  return {fight:next,extraDamage:3};
}
export function throwUrowenNet(roll,{owned=false}={}) {
  if(!owned)throw new RangeError('Net unavailable');
  const raw=rollUrowenDie(roll).raw,hit=raw>=5;
  return {raw,hit,consumed:hit,enemyAttackPenalty:hit?2:0,enemyOngoing:hit?1:0};
}

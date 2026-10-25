import {rollUrowenDie,urowenDamage,urowenCombatOutcome} from './core.js';
import {resolveUrowenCharge} from './forms.js';
import {throwUrowenNet} from './spells.js';
import {UROWEN_RULES} from './roster.js';
const clone=value=>structuredClone(value);
export function resolveUrowenOpening(state,roll,{retry=false,hunterBow=null,net=false,horseCharge=false}={}) {
  if(state.fight?.status!=='prepared'||state.fight.openingDone)throw new RangeError('Opening unavailable');
  const next=clone(state),fight=next.fight,player=fight.player,enemy=fight.enemies[fight.target],rules=enemy.rules;
  const result={kind:'opening',dice:[],playerDamage:0,enemyDamage:0};
  const die=phase=>{const raw=rollUrowenDie(roll).raw;result.dice.push({phase,raw});return raw;};
  if(rules.precombatVolley) {
    if(rules.precombatVolley.hitOn.includes(die('volley'))) {
      player.life-=rules.precombatVolley.damage;result.playerDamage+=rules.precombatVolley.damage;
    }
  }
  if(rules.precombatElixir) {
    const hit=rules.precombatElixir.hitOn.includes(die('elixir'));
    if(hit)enemy.attributeValue=rules.precombatElixir.attributeValue;
    result.elixirHit=hit;
  }
  if(rules.precombatEnemyArrow&&!(retry&&rules.precombatEnemyArrow.retryOmitsArrow)) {
    const arrow=rules.precombatEnemyArrow;
    if(arrow.hitOn.includes(die('enemy-arrow-attack'))) {
      const location=die('enemy-arrow-location'),rawDamage=die('enemy-arrow-damage');
      const damage=urowenDamage({rawDamage,location,bonus:arrow.damageBonus,armor:player.armor[location-1]+(fight.elixirArmorBonus??0)});
      player.life-=damage;result.playerDamage+=damage;
    }
  }
  if(rules.openingCharge&&player.life>0) {
    const charge=resolveUrowenCharge(roll,{enemy:true,charge:rules.openingCharge});
    result.dice.push(...charge.rolls.map(raw=>({phase:'enemy-charge',raw})));
    player.life-=charge.damage;result.playerDamage+=charge.damage;
  }
  if(player.life>0&&hunterBow) {
    if(player.career!=='hunter'||fight.rules.hunterArrow===false||fight.rules.weapons===false)throw new RangeError('Hunter arrow unavailable');
    if(!Number.isSafeInteger(hunterBow.difficulty)||hunterBow.difficulty<1||hunterBow.dice!==1||!Number.isSafeInteger(hunterBow.bonus)) {
      throw new RangeError('Invalid bow');
    }
    if(!Number.isSafeInteger(next.character.arrows)||next.character.arrows<1)throw new RangeError('No arrows remaining');
    next.character.arrows--;
    if(die('hunter-arrow-attack')+player.attributes.SK>=hunterBow.difficulty) {
      const location=die('hunter-arrow-location'),rawDamage=die('hunter-arrow-damage');
      const damage=urowenDamage({rawDamage,location,bonus:hunterBow.bonus+(fight.sceneDamageBonus??0),armor:enemy.armorByLocation[location-1]});
      enemy.life-=damage;result.enemyDamage+=damage;
    }
  }
  if(player.life>0&&enemy.life>0&&net) {
    if(fight.rules.items===false||!next.character.net)throw new RangeError('Net unavailable');
    const thrown=throwUrowenNet(roll,{owned:true});
    result.dice.push({phase:'net',raw:thrown.raw});result.netHit=thrown.hit;
    if(thrown.consumed) {
      next.character.net=false;player.net=false;
      enemy.net={attackPenalty:thrown.enemyAttackPenalty,ongoing:thrown.enemyOngoing};
    }
  }
  if(player.life>0&&enemy.life>0&&horseCharge) {
    if(fight.section!==UROWEN_RULES.horseChargeSection||!next.character.horse)throw new RangeError('Horse charge unavailable');
    const charge=resolveUrowenCharge(roll);
    result.dice.push(...charge.rolls.map(raw=>({phase:'horse-charge',raw})));
    enemy.life-=charge.damage;result.enemyDamage+=charge.damage;
  }
  fight.openingDone=true;
  const outcome=urowenCombatOutcome(player.life,enemy.life);
  if(outcome!=='fighting') {
    fight.status=outcome;
    if(outcome==='win'&&fight.target+1<fight.enemies.length) {
      fight.target++;fight.status='prepared';fight.openingDone=false;
    } else {
      if(outcome==='win'&&next.temporary?.stage!=='mission'&&fight.rules.restoreOnVictory!==false)player.life=player.maxLife;
      next.history.push({section:fight.section,status:outcome,rounds:0,remainingLife:player.life});
    }
  }
  if(next.temporary)next.temporary.player=clone(player);
  else {next.character.life=player.life;next.character.power=player.power;}
  next.log.push(result);
  return {state:next,result};
}

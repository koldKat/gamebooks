export const UROWEN_RACES = Object.freeze({
  sylvanElf:'MAG', snowElf:'SK', dwarf:'STR', flitzgar:'SK', verinfes:'STR', berwald:'SK',
});
export const UROWEN_CAREERS = Object.freeze({
  sorcerer:'MAG', hunter:'PER', warrior:'STR', thief:'SK', minstrel:'SK', monk:'MAG', alchemist:'MAG',
});
const difficulties = new Set(['destroyer','easy','standard','difficult','heroic']);
const attributes = ['STR','SK','MAG','PER'];
const locationBonus = [-1,0,0,0,1,3];
const copy = value => structuredClone(value);
function integer(value, minimum, maximum=Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value<minimum || value>maximum) throw new RangeError('Invalid value');
  return value;
}
export function createUrowenCharacter({race='flitzgar',career='warrior',difficulty='standard'}={}) {
  if (!Object.hasOwn(UROWEN_RACES,race) || !Object.hasOwn(UROWEN_CAREERS,career) || !difficulties.has(difficulty)) {
    throw new RangeError('Invalid character choice');
  }
  const stats = Object.fromEntries(attributes.map(key => [key,0]));
  stats[UROWEN_RACES[race]]++;
  const careerAttribute = UROWEN_CAREERS[career];
  stats[stats[careerAttribute] ? 'PER' : careerAttribute]++;
  return {race,career,difficulty,attributes:stats,life:20,maxLife:20,
    power:{sorcerer:3,monk:1,alchemist:2}[career]??0,experience:0,earnedExperience:0,
    coins:15,bagSlots:career==='thief'?7:6,armor:[0,0,0,0,0,0],arrows:0,
    weapon:{attribute:'SK',dice:1,bonus:-3,reroll:[],sorcererOne:3}};
}
export function urowenProgressThresholds(difficulty) {
  if (!difficulties.has(difficulty)) throw new RangeError('Invalid difficulty');
  return {power:difficulty==='destroyer'?2:difficulty==='heroic'?5:4,
    life:difficulty==='destroyer'?8:difficulty==='heroic'?11:10};
}
export function changeUrowenExperience(character, delta) {
  integer(Math.abs(delta),0);
  const next=copy(character),thresholds=urowenProgressThresholds(next.difficulty);
  if(next.dragonBoneRing)thresholds.power=3;
  next.experience=Math.max(0,next.experience+delta);
  if (delta>0) {
    const old=next.earnedExperience;
    next.earnedExperience+=delta;
    const power=Math.floor(next.earnedExperience/thresholds.power)-Math.floor(old/thresholds.power);
    const life=Math.floor(next.earnedExperience/thresholds.life)-Math.floor(old/thresholds.life);
    next.power+=power;
    next.maxLife+=life;
  }
  return next;
}
export function urowenUpgradeCost(character, attribute) {
  if (!attributes.includes(attribute)) throw new RangeError('Invalid attribute');
  return (attribute==='PER'?2:['destroyer','easy'].includes(character.difficulty)?6:8)
    +(character.difficulty==='heroic'?1:0);
}
export function upgradeUrowenAttribute(character, attribute) {
  const cost=urowenUpgradeCost(character,attribute);
  integer(character.attributes[attribute],0,5);
  if (character.experience<cost) throw new RangeError('Not enough experience');
  const next=copy(character);
  next.attributes[attribute]++;
  next.experience-=cost;
  return next;
}
export function urowenCoinReward(amount,difficulty,{bet=false}={}) {
  integer(amount,0);
  if (!difficulties.has(difficulty)) throw new RangeError('Invalid difficulty');
  if (bet || !['destroyer','difficult','heroic'].includes(difficulty)) return amount;
  return amount+(amount<100?20:40)*(difficulty==='destroyer'?1:-1);
}
export function rollUrowenDie(roll=()=>Math.floor(Math.random()*6)+1,{reroll=[],convertOne}={}) {
  if (convertOne!==undefined) integer(convertOne,1,8);
  if (reroll.some(value=>!Number.isInteger(value)||value<1||value>6) || new Set(reroll).size===6) {
    throw new RangeError('Invalid reroll policy');
  }
  const discarded=[];
  for (let attempt=0;attempt<128;attempt++) {
    const raw=integer(roll(),1,6);
    // The crystal's specific sorcerer conversion takes precedence over rerolling that damage die.
    if (raw===1 && convertOne) return {raw,value:convertOne,discarded};
    if (!reroll.includes(raw)) return {raw,value:raw,discarded};
    discarded.push(raw);
  }
  throw new RangeError('Reroll limit exceeded');
}
export function urowenDamage({rawDamage,location,bonus=0,armor=0,career=null,sorcererOne=3}) {
  integer(rawDamage,1,6); integer(location,1,6); integer(armor,0); integer(Math.abs(bonus),0);
  integer(sorcererOne,3,4);
  const die=career==='sorcerer'&&rawDamage===1?sorcererOne:
    career==='warrior'&&rawDamage===6?8:rawDamage;
  return Math.max(0,die+bonus+locationBonus[location-1]-armor);
}
export function urowenCombatOutcome(playerLife,enemyLife) {
  integer(Math.abs(playerLife),0); integer(Math.abs(enemyLife),0);
  if (playerLife<=0 && enemyLife<=0) {
    return playerLife===enemyLife?'fighting':playerLife>enemyLife?'win':'loss';
  }
  return enemyLife<=0?'win':playerLife<=0?'loss':'fighting';
}
export function createUrowenDuel(character,enemy,{restoreOnVictory=true}={}) {
  integer(character.life,1); integer(character.maxLife,1); integer(enemy.life,1);
  if (character.weapon.dice!==1 || enemy.damageDice!==undefined&&enemy.damageDice!==1) {
    throw new RangeError('Use the special encounter handler for multi-die damage');
  }
  if (!['STR','SK','MAG'].includes(enemy.attribute)) throw new RangeError('Invalid opponent attribute');
  return {player:copy(character),enemy:copy(enemy),round:0,status:'fighting',
    playerOngoing:0,enemyOngoing:0,restoreOnVictory,monkUsed:false};
}
export function healUrowenPotion(character,{dice=1,bonus=0}={},roll) {
  integer(dice,1,4); integer(Math.abs(bonus),0);
  if (character.life<=0) throw new RangeError('Character is not conscious');
  const next=copy(character),results=[];
  for(let index=0;index<dice+(next.career==='alchemist'?1:0);index++) {
    results.push(rollUrowenDie(roll).raw);
  }
  const before=next.life;
  next.life=Math.min(next.maxLife,next.life+Math.max(0,results.reduce((a,b)=>a+b,bonus)));
  return {player:next,rolls:results,healed:next.life-before};
}
export function resolveUrowenDuelRound(fight,roll,{monkHeal=false}={}) {
  if (fight.status!=='fighting') throw new RangeError('Fight finished');
  const next=copy(fight),result={dice:[],damage:0,healed:0};
  const die=(options={})=>{const value=rollUrowenDie(roll,options);result.dice.push(value);return value;};
  next.round++;
  next.player.life-=integer(next.playerOngoing,0);
  next.enemy.life-=integer(next.enemyOngoing,0);
  next.status=urowenCombatOutcome(next.player.life,next.enemy.life);
  if (next.status==='fighting') {
    const weapon=next.player.weapon;
    const playerAttack=die({reroll:weapon.reroll}).value+next.player.attributes[weapon.attribute];
    const enemyAttack=die({reroll:next.enemy.reroll??[]}).value+next.enemy.attributeValue;
    result.playerAttack=playerAttack; result.enemyAttack=enemyAttack;
    if (playerAttack>enemyAttack) {
      if (monkHeal) {
        if (next.player.career!=='monk' || next.monkUsed) throw new RangeError('Healing unavailable');
        const raw=die().raw,healing=raw===6?8:raw;
        const life=Math.min(next.player.maxLife,next.player.life+healing);
        result.healed=life-next.player.life; next.player.life=life; next.monkUsed=true;
      } else {
        const location=die({reroll:weapon.reroll}).value;
        const rawDamage=die({reroll:weapon.reroll,convertOne:next.player.career==='sorcerer'?weapon.sorcererOne??3:undefined}).raw;
        result.damage=urowenDamage({rawDamage,location,bonus:weapon.bonus,
          armor:next.enemy.armorByLocation[location-1],career:next.player.career,sorcererOne:weapon.sorcererOne??3});
        next.enemy.life-=result.damage;
      }
    } else if (enemyAttack>playerAttack) {
      const dodged=next.player.career==='minstrel' && die().raw===6;
      result.dodged=dodged;
      if (!dodged) {
        const location=die({reroll:next.enemy.reroll??[]}).value;
        const rawDamage=die({reroll:next.enemy.reroll??[]}).raw;
        result.damage=urowenDamage({rawDamage,location,bonus:next.enemy.damageBonus,
          armor:next.player.armor[location-1]});
        next.player.life-=result.damage;
      }
    }
    next.status=urowenCombatOutcome(next.player.life,next.enemy.life);
  }
  if (next.status==='win'&&next.restoreOnVictory) next.player.life=next.player.maxLife;
  return {fight:next,result};
}

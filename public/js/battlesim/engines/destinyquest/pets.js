// Pets have one combat snapshot, separate from both hero equipment and allies.
// Printed pet names and starting attributes are supplied by the source roster.
import {destinyDie,prepareDestinyDamage} from './damage.js';
import {destinyStrike,isDestinyOpponentActive,hasDestinyAbility,addDestinyStatEffect,restoreDestinySpentStat,applyDestinyHeroRoll} from './effects.js';

const stances = new Set(['aggressive','passive']);
const active = fight => fight.pet?.health > 0 && !fight.encounter?.disablePet;
const owns = (fight,name) => active(fight) && fight.pet.abilities.includes(name);
const number = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;

export function attachDestinyPet(fight,input,{stance='passive',target=0}={}) {
  if (fight?.status!=='active'||fight.phase!=='start'||fight.round!==0||fight.pet||fight.team) throw new RangeError('Choose one pet before combat');
  if (!input || typeof input.name!=='string' || !input.name.trim() || !['pet','minion'].includes(input.type) ||
      !number(input.armour) || !number(input.health) || !number(input.maxHealth??input.health) ||
      (input.maxHealth??input.health)<1 || input.health>(input.maxHealth??input.health) ||
      !['brawn','magic'].includes(input.damageStat) || !number(input[input.damageStat]) ||
      !Array.isArray(input.abilities) || input.abilities.some(name=>typeof name!=='string') ||
      !stances.has(stance) || !Number.isSafeInteger(target) || target<0 || target>=fight.opponents.length) throw new RangeError('Invalid pet');
  const next=structuredClone(fight);
  next.pet={name:input.name,type:input.type,damageStat:input.damageStat,
    [input.damageStat]:input[input.damageStat],armour:input.armour,health:input.health,maxHealth:input.maxHealth??input.health,
    abilities:[...new Set(input.abilities)],stance,target};
  for(const name of Object.keys(next.abilities||{})) {
    const bonus=next.abilityCatalog?.[name]?.petHealthBonus;
    if(bonus&&bonus.type===next.pet.type&&hasDestinyAbility(next,name)) {
      next.pet.maxHealth+=bonus.amount;
      if(next.pet.health>0)next.pet.health+=bonus.amount;
    }
  }
  next.pet.normal={[input.damageStat]:input[input.damageStat],armour:input.armour,maxHealth:next.pet.maxHealth};
  return next;
}

export function setDestinyPetStance(fight,stance) {
  if (fight?.status!=='active'||fight.phase!=='start'||!active(fight)||!stances.has(stance)) throw new RangeError('Choose a pet stance at the start of a round');
  const next=structuredClone(fight);next.pet.stance=stance;return next;
}

export function prepareDestinyPetRound(fight,options) {
  if (options.petStance!==undefined) {
    if (!active(fight)||!stances.has(options.petStance)) throw new RangeError('Choose a living pet and valid stance');
    fight.pet.stance=options.petStance;
  }
  if(fight.round===1&&owns(fight,'winged-tormenter')&&hasDestinyAbility(fight,'far-sight')) fight.autoWinRound=1;
}

export function applyDestinyPetSpeedLoss(fight,attacker,roll) {
  if(!owns(fight,'winged-tormenter')||!hasDestinyAbility(fight,'death-from-above')) return;
  const die=destinyDie(roll);
  fight.history.push({type:'pet-ability-roll',round:fight.round,name:'death-from-above',die});
  if(die>=5&&isDestinyOpponentActive(fight,attacker)) {destinyStrike(fight,attacker,fight.pet.brawn,'death-from-above','pet');return true;}
  return false;
}

// Called only after the enemy score is final and would damage the hero.
// Return true if the pet received the attack, including fully armoured attacks.
function petReceivesAttack(fight,roll) {
  if(!active(fight))return false;
  const pet=fight.pet;
  if (pet.stance==='passive') {
    if (pet.type==='minion'&&hasDestinyAbility(fight,'astral-manipulator')) return false;
    const die=destinyDie(roll);
    fight.history.push({type:'pet-guard',round:fight.round,die,target:die===1?'pet':'hero'});
    if (die!==1) return false;
  }
  return true;
}

export function prepareDestinyMirageDefense(fight,{score,heroDamage,ignorePetArmour,returnPhase},roll) {
  if(heroDamage<=0||fight.turn.mirageChecked)return false;
  const effects=fight.effects.filter(effect=>effect.kind==='mirage'&&effect.from<=fight.round&&effect.until>=fight.round);
  if(!effects.length)return false;
  fight.turn.petRoute=petReceivesAttack(fight,roll);fight.turn.mirageChecked=true;
  const recipient=fight.turn.petRoute?'pet':'hero';
  if(!effects.some(effect=>effect.target===recipient)||recipient==='pet'&&score<=(ignorePetArmour?0:fight.pet.armour))return false;
  fight.turn.pendingAbility={type:'mirage-defense',name:'minor-mirage',recipient,returnPhase,
    dice:applyDestinyHeroRoll(fight,[destinyDie(roll)],'ability')};
  fight.phase='ability-rolled';return true;
}

export function routeDestinyPetAttack(fight,{attacker,score,heroDamage,ignoreArmour=false},roll) {
  if(heroDamage<=0||!(fight.turn.petRoute??petReceivesAttack(fight,roll)))return false;
  const pet=fight.pet;
  const damage=Math.min(pet.health,Math.max(0,score-(ignoreArmour?0:pet.armour)));
  pet.health-=damage;
  if(damage&&pet.health===0) {pet.defeatPending=true;pet.deathTarget=attacker;}
  fight.turn.petIntercept={name:pet.name,attacker,damage,stance:pet.stance};
  fight.history.push({type:'pet-damage',round:fight.round,attacker,damage,remaining:pet.health});
  if(damage&&pet.abilities.includes('dark-bond')) restoreDestinySpentStat(fight,'magic',1);
  if (pet.stance==='aggressive'&&isDestinyOpponentActive(fight,attacker)) {
    const lost=destinyStrike(fight,attacker,pet[pet.damageStat],'pet-retaliation','pet');
    pet.lastRetaliation={round:fight.round,target:attacker,damage:lost};
  }
  if (damage&&hasDestinyAbility(fight,'guardian')&&isDestinyOpponentActive(fight,attacker)) destinyStrike(fight,attacker,2,'guardian','pet');
  return true;
}

export function finishDestinyPetRound(fight) {
  if (!active(fight)) return;
  const pet=fight.pet;
  if (owns(fight,'spark-jolt')) for (let target=0;target<fight.opponents.length;target++) {
    if (isDestinyOpponentActive(fight,target)) destinyStrike(fight,target,1,'spark-jolt','pet-passive');
  }
  if (pet.stance==='passive') {
    if (owns(fight,'winged-tormenter')&&isDestinyOpponentActive(fight,pet.target)) destinyStrike(fight,pet.target,1,'winged-tormenter','pet-passive');
    if (owns(fight,'lick-your-wounds')) pet.health=Math.min(pet.maxHealth,pet.health+4);
  }
}

export function restoreDestinyPet(fight) {
  resetDestinyPetCombatStats(fight);
  if (fight.pet) {fight.pet.health=fight.pet.maxHealth;delete fight.pet.defeatPending;}
}

export function prepareDestinyPetDeath(fight,roll) {
  const pet=fight.pet;
  if(!pet?.defeatPending||pet.health>0||fight.turn?.pendingAbility||fight.encounter?.forcedLoss||fight.hero.health<=0)return false;
  delete pet.defeatPending;
  const targets=fight.opponents.map((_,i)=>i).filter(i=>isDestinyOpponentActive(fight,i));
  if(!targets.length)return false;
  for(const name of Object.keys(fight.abilities||{})) {
    const spec=fight.abilityCatalog?.[name]?.onPetDeath;
    if(!spec||spec.type!==pet.type||spec.requiresPetAbility&&!pet.abilities.includes(spec.requiresPetAbility)||!hasDestinyAbility(fight,name))continue;
    const target=targets.includes(pet.deathTarget)?pet.deathTarget:targets[0];
    const returnPhase=['damage-rolled','speed-rolled'].includes(fight.phase)?'end':fight.phase;
    prepareDestinyDamage(fight,name,{...spec,category:'pa',passive:true,passiveAttack:true,damageKind:'pet-passive',selectTarget:spec.hit==='one'},
      {target,deferDamage:true},roll);
    fight.turn.pendingAbility.returnPhase=returnPhase;
    return true;
  }
  return false;
}

export function resetDestinyPetCombatStats(fight) {
  if (fight.pet) {Object.assign(fight.pet,fight.pet.normal);delete fight.pet.lastRetaliation;}
}

// Modifier abilities are activated by the player through the regular ability
// action, with its combat-wide charge checks. They are not automatic passives.
export function applyDestinyPetAbility(fight,name,options={}) {
  const pet=fight.pet;
  if(name==='minor-mirage') {
    const recipient=options.recipient??'hero';
    if(!['hero','pet'].includes(recipient)||recipient==='pet'&&(!active(fight)||pet.type!=='minion')) throw new RangeError('Choose the hero or a living minion');
    fight.effects.push({kind:'mirage',target:recipient,from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name});return;
  }
  if(name==='resurrection') {
    if(!pet||pet.type!=='minion'||pet.health!==0) throw new RangeError('Choose a defeated minion');
    restoreDestinyPet(fight);return;
  }
  if(name==='paralysis') {
    const hit=pet?.lastRetaliation;
    if (!pet?.abilities.includes(name)||pet.stance!=='aggressive'||hit?.round!==fight.round||!hit.damage||!isDestinyOpponentActive(fight,hit.target)) throw new RangeError('The pet must inflict retaliation damage first');
    addDestinyStatEffect(fight,hit.target,'speed',-1,1,name,1);return;
  }
  if(!active(fight)) throw new RangeError('Choose a living pet or minion');
  if(name==='pack-spirit') {
    const ability=options.ability,spec=fight.abilityCatalog?.[ability];
    if(!pet.abilities.includes('lick-your-wounds')||!['sp','co'].includes(spec?.category)||!hasDestinyAbility(fight,ability)||fight.used[ability]) throw new RangeError('Choose an unused speed or combat ability for the mastiff');
    fight.used[ability]=1;pet.brawn+=1;return;
  }
  if(pet.type!=='minion') throw new RangeError('Choose a living minion');
  if(name==='energy-boost') {pet.armour+=3;return;}
  if(name==='evocation') {
    if(!number(pet.magic)) throw new RangeError('Choose a magical minion');
    fight.turn.damageScoreBonus=(fight.turn.damageScoreBonus||0)+pet.magic;return;
  }
  throw new RangeError('Unknown pet ability');
}

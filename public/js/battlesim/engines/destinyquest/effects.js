// Serializable, round-scoped effects shared by combat and ability actions.
import { onDestinyOpponentSpeedRoll } from './roll-events.js';
import { destinyPenaltyApplies } from './book-rules.js';
import {destinyQuotaPassiveActive,destinyAbilityGrantActive} from './ability-quota.js';
import {destinyScoreContext} from './score-immunity.js';
export const hasDestinyAbility = (fight, name) => (!fight.abilityCatalog || Object.hasOwn(fight.abilityCatalog, name) || !!fight.encounter?.grantedAbilities?.[name]) &&
  (!fight.combatStance||fight.abilityCatalog?.[name]?.quotaStatus||fight.combatStance.allowedAbilities.includes(name)||fight.combatStance.passives.includes(name))&&
  destinyQuotaPassiveActive(fight,name)&&(!fight.abilityGrantSources?.[name]||destinyAbilityGrantActive(fight,name))&&
  (!fight.abilityCatalog?.[name]?.activeWithLeftHand || fight.equipment?.leftHand?.type===fight.abilityCatalog[name].activeWithLeftHand) &&
  (!fight.abilityCatalog?.[name]?.activeWithMainHand || fight.equipment?.mainHand?.type===fight.abilityCatalog[name].activeWithMainHand) &&
  (!fight.abilityCatalog?.[name]?.activeWithWeapons || Object.entries(fight.abilityCatalog[name].activeWithWeapons).every(([hand,type])=>fight.equipment?.[hand]?.type===type)) &&
  (fight.abilityCatalog?.[name]?.activeHealthAtMost===undefined || fight.hero.health<=fight.abilityCatalog[name].activeHealthAtMost) &&
  !fight.encounter?.disableHeroAbilities && !fight.encounter?.sacrificedAbilities?.includes(name) && !fight.encounter?.cancelledAbilities?.includes(name) && (fight.abilities?.[name] || 0) -
  (!fight.encounter?.grantedAbilities?.[name]?.ignoreTransport && fight.equipment?.transport?.stability === 0 && fight.equipment.transport.abilities?.includes(name) ? 1 : 0) > 0;

export const destinyImmuneToAbility=(fight,ability)=>!!ability && Object.entries(fight.abilityCatalog||{}).some(([name,spec])=>(spec.immuneOpponentAbility===ability||spec.immuneOpponentAbilities?.includes(ability))&&hasDestinyAbility(fight,name));

export function destinyHeroHasStatus(fight,status){
  if(destinyImmuneToAbility(fight,status))return false;
  return (fight.encounter?.heroStatuses?.[status]||0)>0||fight.effects.some(effect=>effect.target==='hero'&&(effect.status||effect.kind)===status&&effect.from<=fight.round&&effect.until>=fight.round);
}

export function destinyCategoryBlocked(fight,category){
  const blocked=fight.encounter?.blockedRounds;
  return !!blocked&&fight.round>=blocked.from&&fight.round<=blocked.until&&blocked.categories.includes(category);
}

export function destinyPassiveDamageBonus(fight) {
  const encounter=(fight.encounter?.damagePerDieWhenDefeated||[]).filter(rule=>(rule.targets||[rule.target]).every(index=>!isDestinyOpponentActive(fight,index)))
    .reduce((sum,rule)=>sum+rule.amount,0);
  return encounter+Object.entries(fight.abilityCatalog||{}).reduce((sum,[name,spec])=>sum+
    (spec.damagePerDie&&hasDestinyAbility(fight,name)&&!fight.sacrificedSummons?.includes(name)?spec.damagePerDie:0),0);
}

export const destinyPetHasAbility=(fight,name)=>!!(name&&fight.pet?.health>0&&!fight.encounter?.disablePet&&fight.pet.abilities?.includes(name));

export function destinyPetDamageBonus(fight,name,perDie=false) {
  if(!(fight.pet?.health>0)||fight.encounter?.disablePet) return 0;
  return (fight.pet.abilities||[]).reduce((sum,ability)=>{
    const bonus=fight.abilityCatalog?.[ability]?.petDamageBonus;
    return sum+(bonus?.abilities.includes(name)?(perDie?bonus.perDie||0:bonus.flat||0):0);
  },0);
}

export function destinyAbilityHealthCost(fight,spec) {
  return spec.sacrificeWaiverPetAbility&&destinyPetHasAbility(fight,spec.sacrificeWaiverPetAbility)?0:spec.sacrifice||0;
}

export function destinyOpponentDamageTotal(fight,values,bonuses={}){
  const reduction=fight.effects.filter(effect=>effect.kind==='opponent-die-reduction'&&effect.from<=fight.round&&effect.until>=fight.round).reduce((sum,effect)=>sum+effect.amount,0);
  return values.reduce((sum,face,index)=>sum+Math.max(0,face-reduction)+(bonuses[index]||0),0);
}

export function onDestinyHeroDice(fight,values) {
  if (values.length<2 || new Set(values).size===values.length) return;
  for(const effect of fight.effects)if(effect.dispelOnDoubles&&effect.dispelBy!=='opponent'){
    if(effect.kind==='health-penalty'){
      fight.hero.maxHealth+=effect.amount;
      if(fight.hero.health>0)fight.hero.health=Math.min(fight.hero.maxHealth,fight.hero.health+effect.healthRemoved);
    }
    if(fight.abilityCatalog?.[effect.source]?.quotaStatus){
      delete fight.abilities[effect.source];
      if(!(fight.clearedCurses??=[]).includes(effect.source))fight.clearedCurses.push(effect.source);
      if(fight.character){
        if(fight.character.abilities)delete fight.character.abilities[effect.source];
        fight.character.clearedCurses=[...fight.clearedCurses];
      }
    }
  }
  fight.effects=fight.effects.filter(effect=>!effect.dispelOnDoubles||effect.dispelBy==='opponent');
  for (const [name,spec] of Object.entries(fight.abilityCatalog||{}))if((spec.doublesHeal||spec.restoreOnDoubles)&&hasDestinyAbility(fight,name)){
    if(destinyCategoryBlocked(fight,spec.category))continue;
    if(spec.doublesHeal){
      const checked=Object.keys(fight.abilities||{}).some(status=>{
        const rule=fight.abilityCatalog[status]?.abilityCheck;
        return rule&&hasDestinyAbility(fight,status)&&(!rule.categories||rule.categories.includes(spec.category))&&(!rule.abilities||rule.abilities.includes(name));
      });
      if(checked)(fight.turn.automaticModifiers??=[]).push({name,action:{heal:spec.doublesHeal}});
      else{if(spec.category==='mo')delete fight.sustainedDamage;healDestinyHero(fight,spec.doublesHeal);}
    }
    if(spec.restoreOnDoubles&&fight.used[name]>0&&!fight.encounter?.unrestorableAbilities?.includes(name))restoreDestinyAbilityCharge(fight,name,Number.MAX_SAFE_INTEGER);
  }
}

export function applyDestinyHeroRoll(fight,values,kind,indices=values.map((_,index)=>index)){
  const proxy=fight.opponentProxies?.[0];
  if(proxy&&indices.length){proxy.opponents=[fight.hero];destinyOnOpponentRoll(proxy,indices.map(index=>values[index]),kind);}
  for(const index of indices){
    const replacement=fight.encounter?.heroDieFaceMap?.[values[index]];
    if(replacement!==undefined)values[index]=replacement;
  }
  for(const rule of fight.encounter?.heroRollFaces||[]){
    if(rule.kinds&&!rule.kinds.includes(kind)||rule.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))continue;
    const amount=damageDestinyHero(fight,indices.filter(index=>rule.faces.includes(values[index])).length*rule.amount);
    if(!amount)continue;
    fight.history.push({type:'roll-hazard',name:rule.name,round:fight.round,damage:amount});
  }
  for(const name of Object.keys(fight.abilities||{})){
    const healing=fight.abilityCatalog?.[name]?.heroFaceHealing;
    if(healing&&healing.kinds.includes(kind)&&hasDestinyAbility(fight,name))healDestinyHero(fight,indices.filter(index=>values[index]===healing.face).length*healing.amount);
  }
  for (const rule of fight.encounter?.heroRollHealing || []) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    const amount = indices.filter(index=>rule.faces.includes(values[index])).length * rule.amount;
    if (amount) healDestinyHero(fight, amount);
  }
  return values;
}

export function applyDestinyAcceptedHeroRoll(fight,values,kind){
  recordDestinyRollFaces(fight,kind==='speed'&&fight.savedHeroDie?.round===fight.round?values.slice(1):values,'hero',kind);
  for(const rule of fight.encounter?.acceptedHeroRollFaces||[]){
    if(rule.kinds&&!rule.kinds.includes(kind))continue;
    const hits=values.filter(face=>rule.faces.includes(face)).length;
    const damage=damageDestinyHero(fight,hits*rule.amount);
    if(damage)fight.history.push({type:'roll-hazard',name:rule.name,round:fight.round,damage});
  }
}

export function recordDestinyRollFaces(fight,values,owner,kind){
  if(fight.status!=='active')return;
  for(const rule of fight.encounter?.acceptedRollCounters||[]){
    if(rule.owner!==owner||rule.kinds&&!rule.kinds.includes(kind)||rule.target!==undefined&&rule.target!==destinyAttackerTarget(fight))continue;
    const hits=values.filter(face=>rule.faces.includes(face)).length;
    if(!hits)continue;
    rule.count=(rule.count||0)+hits;
    fight.history.push({type:'roll-counter',name:rule.name,round:fight.round,owner,count:rule.count});
    if(rule.count>=rule.required)fight.encounter[rule.outcome==='win'?'forcedVictory':'forcedLoss']=true;
  }
}

export const destinyAbilityDamageMultiplier=(fight,target,name)=>fight.encounter?.abilityDamageMultiplierByTarget?.[target]?.[name]??1;

export function applyDestinyDamageSourceRules(fight,target,amount,kind,source) {
  if(amount<=0)return;
  for(const rule of fight.encounter?.damageSourceRules||[]) {
    if(rule.triggered||rule.target!==target)continue;
    const matches=rule.abilities.includes(source)||kind==='score'&&rule.scoreAbilities?.some(name=>hasDestinyAbility(fight,name)&&!fight.encounter?.abilityImmunityByTarget?.[target]?.includes(name));
    if(matches){rule.triggered=true;Object.assign(fight.encounter,structuredClone(rule.set));}
  }
}

export function recordDestinyOpponentDamage(fight,target,amount,kind) {
  if(amount<=0)return;
  if(fight.encounter?.trackActiveDamage&&!['passive','pet-passive','companion','encounter-destruction'].includes(kind))
    (fight.turn.activeDamageByTarget??={})[target]=((fight.turn.activeDamageByTarget||{})[target]||0)+amount;
  if(kind==='encounter-destruction')return;
  for(const rule of fight.encounter?.healthLossGroupDamage||[])if(rule.target===target){
    const previous=rule.healthLost||0;rule.healthLost=previous+amount;
    rule.pending=(rule.pending||0)+Math.floor(rule.healthLost/rule.every)-Math.floor(previous/rule.every);
  }
  for(const rule of fight.encounter?.onDamageResources||[])if(rule.targets.includes(target)&&(!rule.kinds||rule.kinds.includes(kind)))fight.encounter.resources[rule.resource]+=rule.amount;
}

export const destinyRoundMatches=(fight,rule)=>(rule.fromRound===undefined||fight.round>=rule.fromRound)&&
  (rule.untilRound===undefined||fight.round<=rule.untilRound)&&(!rule.every||fight.round%rule.every===(rule.roundRemainder??0));

export function onDestinyOpponentHealthHit(fight,attacker,damage,kind){
  if(!damage||!isDestinyOpponentActive(fight,attacker))return;
  const growth=fight.encounter?.growingStatusOnHit;
  if(growth?.kinds?.includes(kind)&&(growth.target===undefined||growth.target===attacker)&&!fight.encounter.growingStatus&&!destinyImmuneToAbility(fight,growth.status||growth.name))fight.encounter.growingStatus={...structuredClone(growth),from:fight.round};
  if(kind==='score'&&fight.team&&fight.encounter?.teamStunOnScoreHit?.includes(attacker)){
    (fight.team.stunnedUntil??={})[fight.team.active]=fight.round+1;
    if(fight.hero.health>0&&[fight,...fight.allies].filter(actor=>actor.hero.health>0).length===1)fight.encounter.forcedLoss=true;
  }
  for(const rule of fight.encounter?.combinedStatusOnHit||[]){
    if(rule.target!==attacker||!rule.kinds.includes(kind))continue;
    const statuses=rule.statuses.filter(status=>!destinyImmuneToAbility(fight,status));
    if(!statuses.length)continue;
    const prior=fight.effects.find(effect=>effect.kind==='combined-status'&&effect.source===rule.name);
    if(prior)prior.statuses=[...new Set([...prior.statuses,...statuses])];
    else fight.effects.push({kind:'combined-status',target:'hero',statuses,amount:rule.amount,source:rule.name,from:fight.round,until:Number.MAX_SAFE_INTEGER});
  }
  for(const rule of fight.encounter?.onOpponentHealthHit||[]){
    if(rule.target!==attacker||rule.kinds&&!rule.kinds.includes(kind)||rule.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))continue;
    if(rule.heal){const opponent=fight.opponents[attacker];opponent.health=Math.min(opponent.maxHealth,opponent.health+rule.heal);}
    for(const [attribute,amount] of Object.entries(rule.heroChanges||{}))addDestinyStatEffect(fight,'hero',attribute,amount,null,rule.name);
  }
}

export function cleanseDestinyStatuses(fight,statuses){
  fight.effects=fight.effects.filter(effect=>{
    if(effect.target!=='hero')return true;
    if(effect.kind==='combined-status'){effect.statuses=effect.statuses.filter(status=>!statuses.includes(status));return effect.statuses.length>0;}
    return !statuses.includes(effect.status||effect.kind);
  });
  if(fight.encounter?.heroStatuses)for(const status of statuses)delete fight.encounter.heroStatuses[status];
  if(statuses.includes(fight.encounter?.growingStatus?.status||fight.encounter?.growingStatus?.name))delete fight.encounter.growingStatus;
}

export function destinyScoreExtraDice(fight,values,roll) {
  const faces=Object.entries(fight.abilityCatalog||{}).filter(([name,spec])=>spec.scoreExplodingFace&&hasDestinyAbility(fight,name)).map(([,spec])=>spec.scoreExplodingFace);
  const extra=[];
  for (let i=0;i<values.length+extra.length;i++) {
    if (!faces.includes(i<values.length?values[i]:extra[i-values.length])) continue;
    if (extra.length>=1000) throw new RangeError('Exploding damage roll did not end');
    const value=roll();if(!Number.isInteger(value)||value<1||value>6)throw new RangeError('A die must roll 1-6');
    extra.push(applyDestinyHeroRoll(fight,[value],'damage')[0]);
  }
  return extra;
}

export function isDestinyOpponentActive(fight, target) {
  const opponent = fight.opponents[target];
  return Boolean(opponent && (opponent.role === 'indestructible' || fight.encounter?.activeAtZeroTargets?.includes(target)&&opponent.health===0 || opponent.health > (fight.encounter?.surrenderAt?.[target] ?? 0)) &&
    !fight.encounter?.inactiveTargets?.includes(target) && !fight.encounter?.surrenderedTargets?.includes(target) && !fight.encounter?.escapedTargets?.includes(target));
}

export function isDestinyOpponentDead(fight, target) {
  return fight.opponents[target]?.health === 0 && fight.encounter?.surrenderAt?.[target] === undefined&&!fight.encounter?.activeAtZeroTargets?.includes(target);
}

export const destinyAttackerTarget = fight => fight.turn?.enemyAttackTarget ?? fight.encounter?.attackProxy?.[fight.target] ?? fight.target;

export function destinyDamageAllowed(fight, target, kind = 'score') {
  if (!isDestinyOpponentActive(fight, target)) return false;
  if (fight.opponents[target].role === 'indestructible') return false;
  if(fight.encounter?.shieldsByTarget?.[target]?.health>0&&['passive','pet-passive'].includes(kind))return false;
  if(fight.encounter?.damageOnlyFromActions?.includes(target)&&kind!=='book-action')return false;
  if(fight.phase!=='start'&&['score','single-ability'].includes(kind)&&fight.turn?.blockedSingleTargets?.includes(target))return false;
  if(fight.encounter?.damageRequiresHeroWinTargets?.includes(target)&&fight.turn?.winner!=='hero')return false;
  if(kind!=='score'&&fight.encounter?.normalScoreOnlyTargets?.includes(target))return false;
  if (fight.encounter?.damageShieldWhileAlive?.some(rule => rule.target === target &&
      (!rule.kinds||rule.kinds.includes(kind)) &&
      rule.protectors.some(index => isDestinyOpponentActive(fight, index)))) return false;
  return !['passive','pet-passive'].includes(kind) || !fight.encounter?.passiveImmuneTargets?.includes(target);
}

export function destinyStat(fight, target, attribute, {ignoreModifierIncreases = false} = {}) {
  const actor = target === 'hero' ? fight.hero : fight.opponents[target];
  let value = attribute==='armour'&&fight.encounter?.shieldsByTarget?.[target]?.health>0?fight.encounter.shieldsByTarget[target].armour:actor[attribute];
  if (value === null) throw new RangeError('This component has no such combat attribute');
  if (fight.status !== 'active') return value;
  if(target==='hero') for(const name of Object.keys(fight.abilities||{})) {
    const spec=fight.abilityCatalog?.[name];
    if(spec?.attributeBonuses?.[attribute]&&hasDestinyAbility(fight,name)) value+=spec.attributeBonuses[attribute];
  }
  const flank=attribute==='armour'&&fight.encounter?.armourByHeroSpeedAbility?.[target];
  if(flank)value=fight.turn?.winner==='hero'&&fight.turn.playedSpeedAbility?flank.flanked:flank.normal;
  for(const rule of fight.encounter?.statWhenAllDead||[])if(rule.target===target&&rule.attribute===attribute&&rule.dead.every(index=>isDestinyOpponentDead(fight,index)))value=rule.set;
  for (const effect of fight.effects) {
    if (effect.blockedByShield || effect.kind !== 'stat' || effect.target !== target || effect.attribute !== attribute ||
        fight.round < effect.from || fight.round > effect.until) continue;
    if(target==='hero'&&destinyImmuneToAbility(fight,effect.status||effect.source))continue;
    if(fight.encounter?.statAbilityImmunityByTarget?.[target]?.includes(attribute)&&fight.abilityCatalog?.[effect.source])continue;
    if (ignoreModifierIncreases && fight.abilityCatalog?.[effect.source]?.category === 'mo' &&
        (effect.amount > 0 || effect.set !== undefined && effect.set > value)) continue;
    if(attribute==='armour'&&fight.encounter?.permanentArmourReductionImmune?.includes(target)&&effect.until===Number.MAX_SAFE_INTEGER&&fight.abilityCatalog?.[effect.source]&&(effect.amount<0||effect.set!==undefined&&effect.set<value))continue;
    if (attribute === 'armour' && fight.encounter?.armourReductionImmune?.includes(target) &&
        effect.source !== 'encounter-health' && (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
    if (target === 'hero' && attribute === 'armour' && hasDestinyAbility(fight, 'ice-mantle') &&
        (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
    if(target==='hero'&&(effect.amount<0||effect.set!==undefined&&effect.set<value)&&Object.keys(fight.abilities||{}).some(name=>fight.abilityCatalog?.[name]?.immuneStatReduction===attribute&&hasDestinyAbility(fight,name)))continue;
    if (effect.set !== undefined) value = effect.set;
    else value += effect.amount;
  }
  for (const effect of fight.encounter?.statWhileAlive || []) {
    if (effect.target === target && effect.attribute === attribute && isDestinyOpponentActive(fight, effect.alive)) value += effect.amount;
  }
  if (target === 'hero' && attribute === 'speed' && hasDestinyAbility(fight, 'blood-frenzy') &&
      fight.effects.some(effect => effect.kind === 'bleed' && isDestinyOpponentActive(fight, effect.target))) value++;
  if (target === 'hero' && attribute === 'speed' && fight.chronicTriggered && fight.bookRules?.deathPenalties !== false) value--;
  if (target === 'hero') for (const [name,spec] of Object.entries(fight.abilityCatalog || {})) {
    const boost=spec.lowHealthBoost;
    if (boost?.attribute===attribute && fight.hero.health<=boost.health && hasDestinyAbility(fight,name)) value+=boost.amount;
  }
  return Math.max(fight.encounter?.statMinimumByTarget?.[target]?.[attribute] ?? 0, value);
}

// A printed dash stays null on the component. It supplies no absorption when
// calculating a hit; it is never replaced with a fabricated armour attribute.
export const destinyArmour=(fight,target)=>((target==='hero'?fight.hero:fight.opponents[target]).armour===null?0:destinyStat(fight,target,'armour'));

export function destinyOpponentSpeedResult(fight) {
  const target=destinyAttackerTarget(fight),saved=fight.savedOpponentDice;
  if(saved?.round===fight.round&&saved.target===target&&Number.isFinite(saved.result)) return saved.result;
  return fight.turn.opponentSpeedDice.reduce((sum,face)=>sum+face,0)+destinyStat(fight,target,'speed')+(fight.turn.opponentSpeedBonus||0);
}

export function addDestinyStatEffect(fight, target, attribute, amount, duration, source, delay = 0) {
  const from = fight.round + delay;
  fight.effects.push({ kind: 'stat', target, attribute, amount, from,
    until: duration === null ? Number.MAX_SAFE_INTEGER : from + duration - 1, source, ...(fight.encounter?.shieldsByTarget?.[target]?.health>0&&fight.abilityCatalog?.[source]?{blockedByShield:true}:{}) });
  if (target==='hero' && attribute==='armour' && amount>0 && delay===0) {
    for (const name of Object.keys(fight.abilities||{})) {
      if (fight.abilityCatalog?.[name]?.healOnArmourIncrease && hasDestinyAbility(fight,name)) healDestinyHero(fight,amount);
    }
  }
}

// Story blessings expire by combats, independently of the entered base stats.
// Spend them when the player's first round begins, never on setup or rendering.
export function beginDestinyCombatBoosts(fight){
  if(fight.round!==1||fight.combatBoostsApplied||fight.encounter?.heroRelay?.active||!fight.character?.combatBoosts)return;
  for(const [attribute,boost] of Object.entries(fight.character?.combatBoosts||{})){
    if(!['speed','brawn','magic','armour'].includes(attribute)||!boost||
      !Number.isSafeInteger(boost.amount)||boost.amount<0||boost.amount>1000000||
      !Number.isSafeInteger(boost.combats)||boost.combats<0||boost.combats>100)throw new RangeError('Invalid story combat boost');
    if(!boost.combats||!boost.amount)continue;
    addDestinyStatEffect(fight,'hero',attribute,boost.amount,null,'story-blessing');
    boost.combats--;
  }
  fight.combatBoostsApplied=true;
}

export function healDestinyHero(fight, amount) {
  observeDestinyHealth(fight);
  if (fight.hero.health <= 0) return 0;
  const restored = Math.min(amount, fight.hero.maxHealth - fight.hero.health);
  fight.hero.health += restored;
  return restored;
}

// Absorb combat damage before health is deducted. Explicit health costs and
// sacrifices deliberately keep their separate, direct health deductions.
export function damageDestinyHero(fight, amount){
  const absorbed=Math.min(fight.portableShieldHealth||0,Math.max(0,amount));
  if(absorbed){
    fight.portableShieldHealth-=absorbed;
    fight.history.push({type:'shield-absorption',round:fight.round,damage:absorbed,remaining:fight.portableShieldHealth});
  }
  const lost=Math.min(fight.hero.health,Math.max(0,amount-absorbed));
  fight.hero.health-=lost;
  observeDestinyHealth(fight);
  return lost;
}

// Restore paid attribute costs without undoing enemy debuffs or adding a new
// bonus on top of the hero's starting attributes.
export function restoreDestinySpentStat(fight,attribute,amount) {
  let restored=0;
  for(const effect of fight.effects) {
    if(restored>=amount) break;
    if(effect.kind!=='stat'||effect.target!=='hero'||effect.attribute!==attribute||!(effect.amount<0)||
      fight.abilityCatalog?.[effect.source]?.fixedStatCost?.attribute!==attribute||effect.from>fight.round||effect.until<fight.round) continue;
    const value=Math.min(amount-restored,-effect.amount);effect.amount+=value;restored+=value;
  }
  return restored;
}

export function restoreDestinyAbilityCharge(fight,name,count=1){
  if(fight.abilityCatalog?.[name]?.unrestorable||fight.encounter?.unrestorableAbilities?.includes(name))throw new RangeError('This ability cannot be restored');
  const restored=Math.min(fight.used[name]||0,count);fight.used[name]=(fight.used[name]||0)-restored;
  if(fight.encounter?.soulStolenAbilities?.[name])fight.encounter.soulStolenAbilities[name]=Math.max(0,fight.encounter.soulStolenAbilities[name]-restored);
  return restored;
}

export function observeDestinyHealth(fight) {
  for(const target of fight.encounter?.regrowingTargets||[])if(fight.opponents[target].health===0&&!fight.encounter.inactiveTargets?.includes(target)){
    (fight.encounter.inactiveTargets??=[]).push(target);
  }
  for(const rule of fight.encounter?.heroThresholdHealing||[])if(!rule.used&&fight.hero.health<=rule.health){
    rule.used=true;fight.hero.health=rule.full?fight.hero.maxHealth:Math.min(fight.hero.maxHealth,fight.hero.health+rule.amount);
    fight.effects=fight.effects.filter(effect=>effect.target!=='hero'||!rule.cleanse?.includes(effect.status||effect.kind));
    if(rule.cleanse)cleanseDestinyStatuses(fight,rule.cleanse);
    if(rule.cleanse?.includes(fight.encounter.growingStatus?.status||fight.encounter.growingStatus?.name))delete fight.encounter.growingStatus;
    if(fight.turn)fight.turn.suppressHitStatuses=[...(fight.turn.suppressHitStatuses||[]),...(rule.cleanse||[])];
    fight.history.push({type:'encounter-healing',round:fight.round,name:rule.name,health:fight.hero.health});
  }
  for(const rule of fight.encounter?.statusAttributeGrowth||[])if(!destinyHeroHasStatus(fight,rule.status))fight.opponents[rule.target][rule.attribute]=rule.reset;
  if (fight.hero.health < 10 && destinyPenaltyApplies(fight, 'chronic-convulsions')) fight.chronicTriggered = true;
  for (const rule of fight.encounter?.healthThresholdStats || []) {
    const opponent = fight.opponents[rule.target];
    if (rule.triggered || !opponent || opponent.health > rule.health || rule.requiresLiving&&opponent.health<=0) continue;
    if(rule.event&&!fight.turn)continue;
    rule.triggered = true;
    if(rule.set)Object.assign(fight.encounter,structuredClone(rule.set));
    if(rule.event)(fight.turn.afterHealthDamageEvents??=[]).push({...structuredClone(rule.event),target:rule.target});
    for (const [attribute, amount] of Object.entries(rule.changes || {})) addDestinyStatEffect(fight, rule.target, attribute, amount, null, 'encounter-health');
    for (const [attribute, amount] of Object.entries(rule.heroChanges || {})) addDestinyStatEffect(fight, 'hero', attribute, amount, null, 'encounter-health');
    if (rule.activateTargets) fight.encounter.inactiveTargets = (fight.encounter.inactiveTargets || []).filter(target => !rule.activateTargets.includes(target));
    if(rule.suspendTargets)fight.encounter.inactiveTargets=[...new Set([...(fight.encounter.inactiveTargets||[]),...rule.suspendTargets])];
    if(rule.clearTargetEffects)fight.effects=fight.effects.filter(effect=>effect.target!==rule.target||!rule.clearTargetEffects.includes(effect.kind));
    if(rule.nextTarget!==undefined)fight.encounter.nextTarget=rule.nextTarget;
    if(rule.speedDice)(fight.encounter.speedDiceByTarget??={})[rule.target]=rule.speedDice;
    if(rule.damageDice)(fight.encounter.damageDiceByTarget??={})[rule.target]=rule.damageDice;
  }
}

export function destinyDamageScore(fight) {
  fight=destinyScoreContext(fight);
  const hero = fight.turn.winner === 'hero';
  const target = hero ? 'hero' : destinyAttackerTarget(fight);
  const attacker = hero ? fight.hero : fight.opponents[target];
  const power = hero ? fight.encounter?.heroDamageStat ? destinyStat(fight,target,fight.encounter.heroDamageStat) : fight.turn.damageUsesBrawn ? destinyStat(fight, target, 'brawn') : Math.max(destinyStat(fight, target, 'brawn'), destinyStat(fight, target, 'magic'))
    : fight.encounter?.damageDiceOnlyTargets?.includes(target)?0:fight.encounter?.highestDamageAttributeTargets?.includes(target)?Math.max(destinyStat(fight,target,'brawn'),destinyStat(fight,target,'magic')):destinyStat(fight, target, attacker.damageStat);
  const statusBonus=hero ? Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.scorePerDieAgainstStatuses && hasDestinyAbility(fight,name) &&
    fight.effects.some(effect=>effect.target===fight.target && spec.scorePerDieAgainstStatuses.includes(effect.kind) && effect.from<=fight.round && effect.until>=fight.round)).length : 0;
  const reduction=hero ? 0 : fight.effects.filter(effect=>effect.kind==='opponent-die-reduction'&&effect.from<=fight.round&&effect.until>=fight.round).reduce((sum,effect)=>sum+effect.amount,0);
  const scorePassives=hero?Object.keys(fight.abilities||{}).map(name=>[name,fight.abilityCatalog?.[name]]).filter(([name,spec])=>(spec?.passiveScorePerDie||spec?.passiveScoreFaceBonus)&&hasDestinyAbility(fight,name)&&!fight.encounter?.abilityImmunityByTarget?.[fight.target]?.includes(name)):[];
  const perDie = statusBonus + (hero?fight.encounter?.heroScorePerDie||0:0) + scorePassives.reduce((sum,[name,spec])=>sum+(spec.passiveScorePerDie||0)+(spec.passiveScorePerDie?fight.encounter?.abilityDamageBonusByTarget?.[fight.target]?.[name]||0:0),0) + (hero?destinyPassiveDamageBonus(fight):0) + (fight.turn.damagePerDie || 0) + (hero ?
    fight.effects.filter(effect => ['score-per-die', 'damage-per-die'].includes(effect.kind) && effect.from <= fight.round && effect.until >= fight.round && !fight.encounter?.abilityImmunityByTarget?.[fight.target]?.includes(effect.source))
      .reduce((total, effect) => total + effect.amount*destinyAbilityDamageMultiplier(fight,fight.target,effect.source), 0) : 0);
  const kept = fight.turn.damageKeepHighest && !hero && !(fight.turn.keepAllDamageDoubles&&new Set(fight.turn.damageDice).size<fight.turn.damageDice.length) ? new Set(fight.turn.damageDice.map((face,index)=>({face,index}))
    .sort((a,b)=>b.face-a.face).slice(0,fight.turn.damageKeepHighest).map(item=>item.index)) : null;
  const dice = fight.turn.damageDice.reduce((total, face, index) => kept && !kept.has(index) ? total : total + Math.max(0,face-reduction) + perDie +
    (fight.turn.damageDieBonuses?.[index] || 0) +
    (hero && face === 6 && hasDestinyAbility(fight, 'mangle') && !fight.abilityCatalog?.mangle?.scoreFaceBonus ? 2 : 0) +
    (hero ? (fight.turn.scoreFaceBonuses||[]).filter(rule=>rule.face===face).reduce((sum,rule)=>sum+rule.amount,0) : 0) +
    scorePassives.reduce((sum,[,spec])=>sum+(spec.passiveScoreFaceBonus?.face===face?spec.passiveScoreFaceBonus.amount:0),0), 0);
  const bonus = fight.effects.filter(effect => effect.kind === 'score-flat' && effect.hero === hero && (effect.opponent===undefined||effect.opponent===fight.target) &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0);
  const resourceBonus=hero?0:(fight.encounter?.opponentScoreFromResource||[]).filter(rule=>rule.target===target).reduce((sum,rule)=>sum+(fight.encounter.resources?.[rule.resource]||0)*rule.amount,0);
  const encounter = hero ? 0 : resourceBonus-(fight.encounter?.scoreReductionByTarget?.[target] || 0) +
    (fight.encounter?.mirrorBonusTarget === target ? fight.opponents.filter((opponent, index) => index !== target && isDestinyOpponentActive(fight, index)).length : 0);
  const conditional = hero ? (fight.encounter?.heroScoreWhenDefeated || []).filter(rule => (rule.targets || [rule.target]).every(index => !isDestinyOpponentActive(fight, index)))
    .reduce((total, rule) => total + rule.amount, 0) : 0;
  const faceBonus=(hero ? fight.encounter?.heroScoreFaceBonus || [] : (fight.encounter?.opponentScoreFaceBonus||[]).filter(rule=>rule.target===target))
    .filter(rule=>fight.turn.damageDice.some(face=>rule.faces.includes(face))).reduce((sum,rule)=>sum+rule.amount,0);
  const allies=hero?(fight.encounter?.survivingAllies?.length||0)*(fight.encounter?.heroScorePerAlly||0):0;
  const supported=(fight.encounter?.scoreBonusWhileAlive||[]).filter(rule=>rule.target===target&&isDestinyOpponentActive(fight,rule.alive)).reduce((sum,rule)=>sum+rule.amount,0);
  return dice + power + bonus + (fight.turn.damageScoreBonus || 0) + encounter + faceBonus + (hero ? fight.encounter?.heroScoreBonus || 0 : 0) + conditional + allies + supported;
}

export function destinyOnHeroHit(fight, target, damage, kind = 'score') {
  if (damage<=0||['companion','pet','pet-passive'].includes(kind))return;
  if(fight.team&&kind!=='passive')fight.team.lastDamageByTarget[target]=fight.team.active;
  if (fight.round > 0 && fight.turn.winner==='hero') for (const [name,spec] of Object.entries(fight.abilityCatalog || {})) {
    const boost=spec.consecutiveHitBoost;
    if (!boost || !hasDestinyAbility(fight,name) || fight.used[name] || fight.lastHealthHitRound?.[name]===fight.round) continue;
    const previous=fight.lastHealthHitRound?.[name];
    (fight.lastHealthHitRound??={})[name]=fight.round;
    if (previous===fight.round-1) {
      addDestinyStatEffect(fight,'hero',boost.attribute,boost.amount,null,name);
      fight.used[name]=1;
      fight.history.push({type:'ability',round:fight.round,name,automatic:true});
    }
  }
  if (!['score', 'dice', 'first-strike'].includes(kind)) return;
  const healing = Object.entries(fight.abilityCatalog || {}).reduce((total, [name, spec]) =>
    total + (spec.onHitHeal && hasDestinyAbility(fight, name) ? spec.onHitHeal : 0), 0);
  if (healing) healDestinyHero(fight, healing);
  if(fight.encounter?.inactiveTargets?.includes(target))return;
  if (fight.encounter?.passiveImmuneTargets?.includes(target)) return;
  for(const name of Object.keys(fight.abilities||{})) {
    const status=fight.abilityCatalog?.[name]?.onHealthHitStatus;
    if(!status||!hasDestinyAbility(fight,name)||fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name)||
      fight.effects.some(effect=>effect.target===target&&effect.status===status.name)) continue;
    fight.effects.push({kind:'ongoing-damage',status:status.name,source:name,target,amount:status.amount,from:fight.round,until:Number.MAX_SAFE_INTEGER});
  }
  if(kind==='score')for(const name of Object.keys(fight.abilities||{})){
    const status=fight.abilityCatalog?.[name]?.scoreHitStatus;
    if(!status||!hasDestinyAbility(fight,name)||fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name)||fight.effects.some(effect=>effect.kind===status.kind&&effect.target===target&&effect.source===name))continue;
    fight.effects.push({kind:status.kind,target,...(status.amount===undefined?{}:{amount:status.amount}),from:fight.round+(status.delay||0),until:Number.MAX_SAFE_INTEGER,source:name});
  }
  for (const [ability, amount, delay] of [['bleed', 1, 0], ['disease', 2, 1], ['venom', 2, 0]]) {
    if (fight.encounter?.passiveImmunityByTarget?.[target]?.includes(ability)) continue;
    if (!hasDestinyAbility(fight, ability) || fight.effects.some(effect => effect.kind === ability && effect.target === target&&(!fight.team||(effect.teamOwner??0)===fight.team.active))) continue;
    const status = fight.abilityCatalog?.[ability]?.statusEffect;
    const upgraded = (status?.upgrades || []).filter(rule => hasDestinyAbility(fight, rule.ability))
      .reduce((value, rule) => value + rule.bonus, status?.amount ?? amount);
    fight.effects.push({ kind: ability, target, amount: upgraded, from: fight.round + (status?.delay ?? delay), until: Number.MAX_SAFE_INTEGER,...(fight.team?{teamOwner:fight.team.active}:{}) });
  }
  if (kind === 'score' && fight.turn.damageDice?.includes(6) && hasDestinyAbility(fight, 'ice-edge')) {
    addDestinyStatEffect(fight, target, 'speed', -1, 1, 'ice-edge', 1);
  }
}

export function reflectDestinyDamage(fight, target, damage, kind) {
  if (['pet','pet-passive'].includes(kind)) return;
  if (!damage) return;
  for (const rule of fight.encounter?.reflectDamage || []) {
    if(!destinyRoundMatches(fight,rule))continue;
    if(rule.immuneAbility&&hasDestinyAbility(fight,rule.immuneAbility))continue;
    if(rule.kinds&&!rule.kinds.includes(kind))continue;
    if(!rule.allDamage&&!['score','dice','first-strike'].includes(kind))continue;
    if (rule.target !== undefined && rule.target !== target) continue;
    if (rule.requiresAlive?.some(index => !isDestinyOpponentActive(fight, index))) continue;
    if(rule.nonlethalOnly&&fight.opponents[target].health<=damage)continue;
    if(rule.event){
      (fight.turn.afterHealthDamageEvents??=[]).push(structuredClone(rule.event));
      continue;
    }
    if(rule.dice){
      (fight.turn.afterHealthDamageEvents??=[]).push({kind:'enemy-dice-damage',name:rule.name,dice:rule.dice,owner:'opponent',damageDice:true,attacker:target});
      continue;
    }
    const amount = rule.resource ? fight.encounter.resources?.[rule.resource]||0 : rule.heroAttribute ? (rule.heroAttribute==='armour'?destinyArmour(fight,'hero'):destinyStat(fight,'hero',rule.heroAttribute)) : rule.divisor ? Math.ceil(damage / rule.divisor) : rule.amount;
    const lost=damageDestinyHero(fight,amount);
    fight.history.push({ type: 'reflected-damage', round: fight.round, target, damage: lost });
  }
}

export function absorbDestinyShieldDamage(fight,target,amount){
  const shield=fight.encounter?.shieldsByTarget?.[target];if(!(shield?.health>0))return false;
  const damage=Math.min(shield.health,amount);shield.health-=damage;
  fight.history.push({type:'shield-damage',round:fight.round,target,damage,health:shield.health});
  return true;
}

export function destinyStrike(fight, target, amount, source, kind = 'dice') {
  const opponent = fight.opponents[target];
  if (!isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living opponent');
  if(fight.encounter?.abilityImmunityByTarget?.[target]?.includes(source))return 0;
  if (!destinyDamageAllowed(fight, target, kind)) return 0;
  amount=Math.max(0,amount+(fight.encounter?.abilityDamageBonusByTarget?.[target]?.[source]||0));
  if(absorbDestinyShieldDamage(fight,target,amount))return 0;
  const proxy=fight.opponentProxies?.[target];
  if(proxy)proxy.opponents=[fight.hero];
  const lost = proxy?damageDestinyHero(proxy,amount):Math.min(opponent.health, amount);
  reflectDestinyDamage(fight, target, lost, kind);
  if(proxy){
    opponent.health=proxy.hero.health;onDestinyOpponentHealthHit(proxy,0,lost,kind);
    if(lost&&['score','dice'].includes(kind)&&hasDestinyAbility(proxy,'lightning'))damageDestinyHero(fight,2);
  }else opponent.health -= lost;
  recordDestinyOpponentDamage(fight,target,lost,kind);
  applyDestinyDamageSourceRules(fight,target,lost,kind,source);
  observeDestinyHealth(fight);
  destinyOnHeroHit(fight, target, lost, kind);
  if(!['companion','pet','pet-passive'].includes(kind)){
    fight.turn.lastHeroDamage ??= {};
    fight.turn.lastHeroDamage[target] = (fight.turn.lastHeroDamage[target] || 0) + lost;
  }
  if (isDestinyOpponentDead(fight, target)) {
    recordDestinyDefeat(fight, target);
    fight.turn.deaths.push(target);
    if (['passive','pet-passive'].includes(kind)) fight.turn.pendingPassiveDeath = true;
  }
  fight.history.push({ type: 'ability-damage', round: fight.round, target, damage: lost, source });
  return lost;
}

export function destinyRollOpponentDice(fight, count, roll, kind) {
  const draw = () => {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    return value;
  };
  const values = Array.from({ length: count }, draw);
  if(kind==='damage')delete fight.turn.faceTriggeredHealing;
  const faceDamage = faces => {
    if (kind !== 'speed') return;
    const target=destinyAttackerTarget(fight);
    for (const [name,spec] of Object.entries(fight.abilityCatalog || {})) {
      const rule=spec.opponentSpeedFaceDamage;
      if (!rule || !hasDestinyAbility(fight,name) || rule.requires && fight.equipment?.leftHand?.type!==rule.requires) continue;
      for (const face of faces) if (face===rule.face && isDestinyOpponentActive(fight,target) && destinyDamageAllowed(fight,target,'passive')) {
        const dice=applyDestinyHeroRoll(fight,Array.from({length:rule.dice},draw),'damage');onDestinyHeroDice(fight,dice);
        applyDestinyAcceptedHeroRoll(fight,dice,'damage');
        destinyStrike(fight,target,dice.reduce((sum,value)=>sum+value,0),name,'dice');
      }
    }
  };
  faceDamage(values);
  if (kind === 'speed') onDestinyOpponentSpeedRoll(fight, values);
  destinyOnOpponentRoll(fight, values, kind);
  const rerollFaces=fight.encounter?.rerollFacesByTarget?.[destinyAttackerTarget(fight)] ?? (fight.encounter?.rerollOnesByTarget?.includes(destinyAttackerTarget(fight))?[1]:[]);
  if (rerollFaces.length && isDestinyOpponentActive(fight, destinyAttackerTarget(fight))) {
    const rerolled = [];
    values.forEach((value, index) => { if (rerollFaces.includes(value)) { values[index] = draw(); rerolled.push(values[index]); } });
    if (rerolled.length) { faceDamage(rerolled); destinyOnOpponentRoll(fight, rerolled, kind); }
    if (rerolled.length && kind === 'speed') onDestinyOpponentSpeedRoll(fight, values);
  }
  const exploding=kind==='damage'?fight.encounter?.opponentScoreExplodingFacesByTarget?.[destinyAttackerTarget(fight)]:null;
  if(exploding)for(let i=0;i<values.length;i++)if(exploding.includes(values[i])){
    if(values.length>=1000)throw new RangeError('Exploding opponent damage roll did not end');
    const value=draw();values.push(value);destinyOnOpponentRoll(fight,[value],kind);
  }
  if(kind==='damage')for(const rule of fight.encounter?.opponentDamageFaceTriggers||[]){
    if(rule.target!==destinyAttackerTarget(fight)||!values.some(face=>rule.faces.includes(face)))continue;
    const extra=Array.from({length:rule.extraDice||0},draw);values.push(...extra);destinyOnOpponentRoll(fight,extra,kind);
    if(rule.healOpponent){const opponent=fight.opponents[rule.target];opponent.health=Math.min(opponent.maxHealth,opponent.health+rule.healOpponent);}
    if(rule.healOnHealthHit)fight.turn.faceTriggeredHealing=(fight.turn.faceTriggeredHealing||0)+rule.healOnHealthHit;
  }
  const punch = fight.encounter?.damageSixExtraDice?.[destinyAttackerTarget(fight)];
  if (kind === 'damage' && punch && values.includes(6) && !fight.turn.damageSixTriggered) {
    fight.turn.damageSixTriggered = true;
    const extra = Array.from({ length: punch }, draw);
    destinyOnOpponentRoll(fight, extra, kind);
    values.push(...extra);
    addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, 'tusk-punch', 1);
  }
  return values;
}

export function recordDestinyDefeat(fight, target) {
  if (!isDestinyOpponentDead(fight, target)) return;
  // A possible revival must resolve before final-defeat rewards apply.
  if (fight.encounter?.revivalChecks?.some(rule => rule.target === target && !rule.used)) return;
  fight.defeated ??= [];
  if (fight.defeated.includes(target)) return;
  fight.defeated.push(target);
  for(const rule of fight.encounter?.onDeathDestroyAdjacent||[])if(rule.targets.includes(target)) {
    for(const adjacent of [target-1,target+1]) if(rule.victims.includes(adjacent)&&isDestinyOpponentActive(fight,adjacent)) {
      if(rule.resource)fight.encounter.resources[rule.resource]+=rule.amount;
      destinyStrike(fight,adjacent,fight.opponents[adjacent].health,rule.name,'encounter-destruction');
    }
  }
  const actors=[fight,...(fight.allies||[])];
  for(const rule of fight.encounter?.onDeathTeamEffects||[])if(rule.dead===target){
    for(const actor of actors)actor.effects.push({...structuredClone(rule.effect),target:'hero',from:fight.round,until:Number.MAX_SAFE_INTEGER,source:rule.name});
  }
  for(const rule of fight.encounter?.onDeathLowestHeroStats||[])if(rule.dead===target){
    const shared=fight.effects.filter(effect=>typeof effect.target==='number');
    const living=actors.filter(actor=>actor.hero.health>0).sort((a,b)=>(a===fight?fight.team?.active??0:a.teamActorId??0)-(b===fight?fight.team?.active??0:b.teamActorId??0));
    const context=actor=>actor===fight?fight:{...fight,...actor,encounter:{...fight.encounter,...actor.encounter},effects:[...shared,...actor.effects]};
    const lowest=living.reduce((best,actor)=>!best||destinyStat(context(actor),'hero',rule.attribute)<destinyStat(context(best),'hero',rule.attribute)?actor:best,null);
    if(lowest)addDestinyStatEffect(lowest===fight?fight:{...lowest,round:fight.round},'hero',rule.attribute,rule.amount,null,rule.name);
  }
  for(const rule of fight.encounter?.onDeathTeamStats||[]){
    if(!rule.targets.includes(target)||rule.once&&rule.applied)continue;
    rule.applied=true;
    for(const actor of [fight,...(fight.allies||[])])for(const [attribute,amount] of Object.entries(rule.changes)){
      addDestinyStatEffect(actor===fight?fight:{...actor,round:fight.round},'hero',attribute,amount,null,rule.name);
    }
  }
  const aspects=fight.encounter?.aspectCycle;
  if(aspects?.activeAspect===target){
    aspects.activeAspect=null;
    fight.encounter.inactiveTargets=[...new Set([...(fight.encounter.inactiveTargets||[]).filter(index=>index!==aspects.main),target])];
    fight.history.push({type:'aspect-return',round:fight.round,target:aspects.main});
  }
  for (const rule of fight.encounter?.roundRampingDamage || []) {
    if (rule.source === target && rule.stoppedRound === undefined) rule.stoppedRound = fight.round;
  }
  const cycle = fight.encounter?.formCycle;
  if (cycle?.shell === target && cycle.parts.some(index => fight.opponents[index].health > 0)) {
    fight.encounter.inactiveTargets = [...new Set([...(fight.encounter.inactiveTargets || []).filter(index => !cycle.parts.includes(index)), cycle.shell])];
    cycle.reformRound = fight.round + cycle.partRounds + 1;
    fight.history.push({ type: 'form-split', round: fight.round, target, reformRound: cycle.reformRound });
  }
  const counter = fight.encounter?.defeatCounter;
  if (counter && !fight.encounter.forcedVictory) {
    const amount = (counter.amountByTarget?.[target] || 0) + Object.entries(counter.amountByGroup || {})
      .reduce((sum, [group, reward]) => sum + (fight.encounter.opponentGroups?.[group]?.includes(target) ? reward : 0), 0);
    counter.remaining = Math.max(0, counter.remaining - amount);
    fight.history.push({ type: 'defeat-counter', round: fight.round, target, amount, remaining: counter.remaining });
    if (!counter.remaining) fight.encounter.forcedVictory = true;
  }
  if (hasDestinyAbility(fight, 'malefic-runes')) addDestinyStatEffect(fight, 'hero', 'magic', 1, null, 'malefic-runes');
  const explosion = fight.encounter?.deathDamageByTarget?.[target] || 0;
  if (explosion) damageDestinyHero(fight,explosion);
  for(const rule of fight.encounter?.deathDamageRules||[])if(rule.target===target){
    const amount=Math.max(0,rule.amount-(rule.ignoreArmour?0:destinyArmour(fight,'hero')));
    const damage=damageDestinyHero(fight,amount);
    fight.history.push({type:'death-damage',round:fight.round,target,damage});
  }
  for(const rule of fight.encounter?.onDeathTests||[])if(rule.dead===target)(fight.turn.afterHealthDamageEvents??=[]).push(structuredClone(rule.event));
  for (const effect of fight.encounter?.onDeathStatChanges || []) {
    if (effect.dead !== target || !isDestinyOpponentActive(fight, effect.target)) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(fight, effect.target, attribute, amount, null, 'encounter-death');
  }
  for(const rule of fight.encounter?.onDeathRemoveEffects||[])if(rule.dead===target)fight.effects=fight.effects.filter(effect=>effect.source!==rule.source);
  for (const effect of fight.encounter?.onDeathSetStats || []) {
    if (effect.dead === target && isDestinyOpponentActive(fight, effect.target)) fight.opponents[effect.target][effect.attribute] = effect.value;
  }
  for (const effect of fight.encounter?.onDeathDamageEffects || []) {
    if (effect.dead === target && isDestinyOpponentActive(fight, effect.target)) fight.effects.push({ kind: 'ongoing-damage', target: effect.target,
      amount: effect.amount, from: fight.round + (effect.delay || 0), until: Number.MAX_SAFE_INTEGER, source: 'encounter-death' });
  }
}

export function destinyOnOpponentRoll(fight, values, kind) {
  if(values.length>1&&new Set(values).size<values.length)fight.effects=fight.effects.filter(effect=>!effect.dispelOnDoubles||effect.dispelBy!=='opponent');
  const target = destinyAttackerTarget(fight);
  if (!isDestinyOpponentActive(fight, target)) return;
  for(const name of Object.keys(fight.abilities||{})){
    const boost=fight.abilityCatalog?.[name]?.opponentFaceStatBoost;
    if(!boost||boost.kind!==kind||!hasDestinyAbility(fight,name))continue;
    const before=fight.opponentFaceCounts?.[name]||0,after=before+values.filter(face=>face===boost.face).length;
    (fight.opponentFaceCounts??={})[name]=after;
    const gained=Math.floor(after/boost.every)-Math.floor(before/boost.every);
    if(gained)addDestinyStatEffect(fight,'hero',boost.attribute,gained*boost.amount,null,name);
  }
  for(const rule of fight.encounter?.opponentRollHeroDamage||[]){
    if(rule.target!==target||rule.kind&&rule.kind!==kind)continue;
    const damage=damageDestinyHero(fight,values.filter(face=>rule.faces.includes(face)).length*rule.amount);
    if(damage)fight.history.push({type:'roll-hazard',round:fight.round,name:rule.name,damage});
  }
  for(const rule of fight.encounter?.opponentRollHealing||[]){
    if(rule.target!==target||rule.kind&&rule.kind!==kind)continue;
    const opponent=fight.opponents[target],amount=values.filter(face=>rule.faces.includes(face)).length*rule.amount;
    opponent.health=Math.min(opponent.maxHealth,opponent.health+amount);
  }
  const sweet = fight.sweetSpot ? values.filter(value => value === fight.sweetSpot).length * 2 : 0;
  const exploit = kind === 'speed' && hasDestinyAbility(fight, 'exploit') ? values.filter(value => value === 1).length : 0;
  if (sweet + exploit) {
    fight.history.push({ type: 'passive-roll', kind, dice: [...values], target, sweet, exploit });
    destinyStrike(fight, target, sweet + exploit, 'opponent-dice', 'passive');
  }
}

export function destinyDieLocked(fight, owner, kind, index) {
  if(owner==='opponent'&&fight.encounter?.immutableOpponentDiceTargets?.includes(destinyAttackerTarget(fight)))return true;
  if (kind === 'speed') return owner === 'hero' ? (fight.turn.lockedHeroDice || []).includes(index) : Boolean(fight.turn.lockedOpponentDice);
  return owner === 'hero' && (fight.turn.lockedDamageDice || []).includes(index);
}

export function rollDestinyDamageDice(fight, count, roll, unmodified = false, source) {
  const bonus = destinyPassiveDamageBonus(fight)+destinyPetDamageBonus(fight,source,true)+(unmodified ? 0 : fight.effects.filter(effect => effect.kind === 'damage-per-die' &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0));
  let total = 0;
  for (let i = 0; i < count; i++) {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    const values=applyDestinyHeroRoll(fight,[value],'damage');
    applyDestinyAcceptedHeroRoll(fight,values,'damage');
    total += values[0] + bonus;
  }
  return total;
}

export function destinyPassiveEffects(fight, roll, {effectOwner} = {}) {
  const result=(fight.encounter?.endResourceDamage||[])
    .filter(rule=>!rule.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))
    .map(rule=>({target:rule.target??'hero',amount:(fight.encounter.resources?.[rule.resource]||0)*rule.amount,
      ignoreArmour:rule.ignoreArmour??true,source:rule.name,recordMaximum:rule.recordMaximum})).filter(effect=>effect.amount>0);
  for(const rule of fight.encounter?.endDamagePerLivingGroup||[])if(destinyRoundMatches(fight,rule)) {
    const count=rule.targets.filter(target=>isDestinyOpponentActive(fight,target)).length;
    if(count)result.push({target:'hero',amount:count*rule.amount,ignoreArmour:rule.ignoreArmour??true,source:rule.name});
  }
  if(fight.encounter?.endDamageAllOpponents)fight.opponents.forEach((_,target)=>{
    if(isDestinyOpponentActive(fight,target))result.push({target,amount:fight.encounter.endDamageAllOpponents,ignoreArmour:true,source:'encounter'});
  });
  const objective=fight.encounter?.friendlyObjective;
  if(objective)result.push({target:objective.target,amount:objective.damagePerSource*objective.sources.filter(target=>isDestinyOpponentActive(fight,target)).length,
    ignoreArmour:true,allowInactive:true,source:objective.name});
  const periodic=fight.encounter?.periodicObjectiveStrike;
  if(periodic&&fight.round%periodic.every===0)result.push({target:periodic.target,amount:fight.opponents[periodic.source].health,
    ignoreArmour:true,allowInactive:true,source:periodic.name});
  if (destinyPenaltyApplies(fight, 'weeping-wounds')) result.push({ target: 'hero', amount: 1, ignoreArmour: true, source: 'weeping-wounds' });
  if (fight.encounter?.roundDamagePerLivingOpponent && (!fight.encounter.roundDamageResource ||
      fight.encounter.resources?.[fight.encounter.roundDamageResource] > 0)) result.push({ target: 'hero',
    amount: fight.encounter.roundDamagePerLivingOpponent * fight.opponents.filter((opponent, target) => isDestinyOpponentActive(fight, target)).length,
    ignoreArmour: true, source: 'encounter' });
  if (fight.encounter?.outnumbered) {
    const count = fight.opponents.filter((opponent, target) => isDestinyOpponentActive(fight, target)).length;
    if (count > 1) result.push({ target: 'hero', amount: count, ignoreArmour: true, source: 'outnumbered' });
  }
  for (const [name, amount] of Object.entries(fight.encounter?.heroStatuses || {})) if(amount>0&&!destinyImmuneToAbility(fight,name))result.push({ target: 'hero', amount, ignoreArmour: true, source: name });
  if (fight.encounter?.growingStatus&&!destinyImmuneToAbility(fight,fight.encounter.growingStatus.status||fight.encounter.growingStatus.name)) result.push({ target: 'hero', amount: Math.min(fight.encounter.growingStatus.maximum??Number.MAX_SAFE_INTEGER,fight.encounter.growingStatus.increment *
    (fight.round - fight.encounter.growingStatus.from + 1)), ignoreArmour: true, source: fight.encounter.growingStatus.name });
  if (fight.encounter?.damageWithoutAttackAbility && !fight.turn.playedSpeedAbility && !fight.turn.used.co) result.push({ target: 'hero',
    amount: fight.encounter.damageWithoutAttackAbility, ignoreArmour: true, source: 'tide-of-darkness' });
  for (const rule of fight.encounter?.roundRampingDamage || []) result.push({
    target: 'hero', amount: rule.current ?? rule.initial, ignoreArmour: true, source: rule.name,
  });
  for (const effect of fight.encounter?.endEffects || []) {
    if(!destinyRoundMatches(fight,effect))continue;
    if(effect.pairedCaptive&&fight.team?.active!==fight.team?.pairing?.prisonActor)continue;
    if(effect.immuneAbility&&hasDestinyAbility(fight,effect.immuneAbility))continue;
    if(effect.requiresFlag&&!fight.encounter[effect.requiresFlag])continue;
    if(fight.turn?.suppressedEndEffects?.includes(effect.source))continue;
    if (effect.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    const amount = effect.subtractActorAttribute?Math.max(0,effect.amount-destinyStat(fight,effect.actor,effect.subtractActorAttribute)):effect.amountWithAbility&&hasDestinyAbility(fight,effect.amountWithAbility.ability)?effect.amountWithAbility.amount:effect.actorAttribute ? (effect.baseAmount||0)+destinyStat(fight, effect.actor, effect.actorAttribute) : effect.healthDivisor ?
      Math.floor(fight.opponents[effect.actor].health / effect.healthDivisor) : effect.amount;
    result.push({ ...effect, amount, ignoreArmour: effect.ignoreArmour ?? true, source: 'encounter' });
  }
  for (const name of ['barbs', 'decay', 'thorns']) {
    if (!hasDestinyAbility(fight, name)) continue;
    fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target) && !fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name)) result.push({ target, amount: 1, ignoreArmour: true, source: name });
    });
  }
  for (const [name, spec] of Object.entries(fight.abilityCatalog || {})) {
    if (!hasDestinyAbility(fight, name)) continue;
    if (spec.openingPassive && !fight.used[name]) continue;
    if (spec.endSelfDamage) result.push({target:'hero',amount:spec.endSelfDamage,ignoreArmour:true,source:name});
    if (spec.endDamage||spec.endDamageFromStat) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target) && !fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name) && !fight.encounter?.abilityImmunityByTarget?.[target]?.includes(name)) {
        if(spec.endDamageTargetTrait&&!fight.encounter?.traitsByTarget?.[target]?.includes(spec.endDamageTargetTrait))return;
        let amount=spec.endDamageFromStat?Math.floor(destinyStat(fight,'hero',spec.endDamageFromStat.attribute)/spec.endDamageFromStat.divisor):spec.endDamage;
        for(const upgrade of spec.endDamageUpgrades||[])if(hasDestinyAbility(fight,upgrade.ability))amount+=upgrade.amount;
        if(fight.team)for(const ally of fight.allies)if(ally.hero.health>0)for(const [ability,rule] of Object.entries(ally.abilityCatalog||{})){
          if(rule.allyEndDamageBonus?.ability===name&&hasDestinyAbility(ally,ability))amount+=rule.allyEndDamageBonus.amount;
        }
        result.push({target,amount:amount*destinyAbilityDamageMultiplier(fight,target,name),ignoreArmour:true,source:name});
      }
    });
  }
  if (fight.crystalArmour) fight.opponents.forEach((opponent, target) => {
    if (isDestinyOpponentActive(fight, target)) result.push({ target, amount: 1, ignoreArmour: true, source: 'crystal-armour' });
  });
  if (fight.powerTotemActive) fight.opponents.forEach((opponent, target) => {
    if (isDestinyOpponentActive(fight, target)) result.push({ target, amount: 1, ignoreArmour: true, source: 'power-totem' });
  });
  for (const effect of fight.effects) {
    if(effectOwner!==undefined&&typeof effect.target==='number'&&(effect.teamOwner??0)!==effectOwner)continue;
    if(effect.kind==='combined-status'){
      if(fight.hero.health>0&&fight.round>=effect.from&&fight.round<=effect.until&&effect.statuses.some(status=>!destinyImmuneToAbility(fight,status)))result.push({target:'hero',amount:effect.amount,ignoreArmour:true,source:effect.source});
      continue;
    }
    if(effect.target==='hero'&&destinyImmuneToAbility(fight,effect.status||effect.kind))continue;
    if (fight.encounter?.passiveImmunityByTarget?.[effect.target]?.some(name=>name===(effect.status||effect.kind)||name===effect.source)) continue;
    if (!['bleed', 'disease', 'venom', 'burn', 'ongoing-damage', 'delayed-dice'].includes(effect.kind) ||
        fight.round < effect.from || fight.round > effect.until || (effect.target==='hero'?fight.hero.health<=0:!isDestinyOpponentActive(fight, effect.target))) continue;
    let amount = effect.amount;
    if (effect.kind === 'burn') {
      const base=Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.burnDamage && hasDestinyAbility(fight,name)).map(([,spec])=>spec.burnDamage);
      if (!base.length) continue;
      amount=Math.max(...base,...Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.burnUpgrade && hasDestinyAbility(fight,name)).map(([,spec])=>spec.burnUpgrade));
      amount*=destinyAbilityDamageMultiplier(fight,effect.target,'burn');
    }
    if (effect.kind === 'bleed') {
      amount += fight.bleedBonus || 0;
      if(fight.bloodMark?.target===effect.target) amount+=fight.bloodMark.amount;
      for(const name of Object.keys(fight.abilities||{})) if(fight.abilityCatalog?.[name]?.bleedEndBonus&&hasDestinyAbility(fight,name)) amount+=fight.abilityCatalog[name].bleedEndBonus;
    }
    if (effect.kind === 'delayed-dice') {
      amount = rollDestinyDamageDice(fight, 1, roll, false, effect.source);
    }
    result.push({ target: effect.target, amount, ignoreArmour: true, source: effect.source || effect.kind });
  }
  return result;
}

export function destinyPassiveProtection(fight, amount) {
  if (fight.effects.some(effect => effect.kind === 'freeze' && fight.round >= effect.from && fight.round <= effect.until)) return 0;
  return amount;
}

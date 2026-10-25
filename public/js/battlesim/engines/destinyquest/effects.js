// Serializable, round-scoped effects shared by combat and ability actions.
import { onDestinyOpponentSpeedRoll } from './roll-events.js';
import { destinyPenaltyApplies } from './book-rules.js';
export const hasDestinyAbility = (fight, name) => (!fight.abilityCatalog || Object.hasOwn(fight.abilityCatalog, name) || !!fight.encounter?.grantedAbilities?.[name]) && !fight.encounter?.disableHeroAbilities && !fight.encounter?.sacrificedAbilities?.includes(name) && !fight.encounter?.cancelledAbilities?.includes(name) && (fight.abilities?.[name] || 0) -
  (!fight.encounter?.grantedAbilities?.[name]?.ignoreTransport && fight.equipment?.transport?.stability === 0 && fight.equipment.transport.abilities?.includes(name) ? 1 : 0) > 0;

export const destinyImmuneToAbility=(fight,ability)=>!!ability && Object.entries(fight.abilityCatalog||{}).some(([name,spec])=>spec.immuneOpponentAbility===ability&&hasDestinyAbility(fight,name));

export function destinyPassiveDamageBonus(fight) {
  return Object.entries(fight.abilityCatalog||{}).reduce((sum,[name,spec])=>sum+
    (spec.damagePerDie&&hasDestinyAbility(fight,name)&&!fight.sacrificedSummons?.includes(name)?spec.damagePerDie:0),0);
}

export function destinyOpponentDamageTotal(fight,values,bonuses={}){
  const reduction=fight.effects.filter(effect=>effect.kind==='opponent-die-reduction'&&effect.from<=fight.round&&effect.until>=fight.round).reduce((sum,effect)=>sum+effect.amount,0);
  return values.reduce((sum,face,index)=>sum+Math.max(0,face-reduction)+(bonuses[index]||0),0);
}

export function onDestinyHeroDice(fight,values) {
  if (values.length<2 || new Set(values).size===values.length) return;
  fight.effects=fight.effects.filter(effect=>!effect.dispelOnDoubles);
  for (const [name,spec] of Object.entries(fight.abilityCatalog||{})) if (spec.doublesHeal&&hasDestinyAbility(fight,name)) healDestinyHero(fight,spec.doublesHeal);
}

export function applyDestinyHeroRoll(fight,values,kind,indices=values.map((_,index)=>index)){
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
  for (const rule of fight.encounter?.heroRollHealing || []) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    const amount = indices.filter(index=>rule.faces.includes(values[index])).length * rule.amount;
    if (amount) healDestinyHero(fight, amount);
  }
  return values;
}

export function applyDestinyAcceptedHeroRoll(fight,values,kind){
  for(const rule of fight.encounter?.acceptedHeroRollFaces||[]){
    if(rule.kinds&&!rule.kinds.includes(kind))continue;
    const hits=values.filter(face=>rule.faces.includes(face)).length;
    const damage=damageDestinyHero(fight,hits*rule.amount);
    if(damage)fight.history.push({type:'roll-hazard',name:rule.name,round:fight.round,damage});
  }
}

export const destinyAbilityDamageMultiplier=(fight,target,name)=>fight.encounter?.abilityDamageMultiplierByTarget?.[target]?.[name]??1;

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
  return Boolean(opponent && (opponent.role === 'indestructible' || opponent.health > (fight.encounter?.surrenderAt?.[target] ?? 0)) &&
    !fight.encounter?.inactiveTargets?.includes(target) && !fight.encounter?.surrenderedTargets?.includes(target));
}

export function isDestinyOpponentDead(fight, target) {
  return fight.opponents[target]?.health === 0 && fight.encounter?.surrenderAt?.[target] === undefined;
}

export const destinyAttackerTarget = fight => fight.turn?.enemyAttackTarget ?? fight.encounter?.attackProxy?.[fight.target] ?? fight.target;

export function destinyDamageAllowed(fight, target, kind = 'score') {
  if (!isDestinyOpponentActive(fight, target)) return false;
  if (fight.opponents[target].role === 'indestructible') return false;
  if (fight.encounter?.damageShieldWhileAlive?.some(rule => rule.target === target &&
      rule.protectors.some(index => isDestinyOpponentActive(fight, index)))) return false;
  return kind !== 'passive' || !fight.encounter?.passiveImmuneTargets?.includes(target);
}

export function destinyStat(fight, target, attribute, {ignoreModifierIncreases = false} = {}) {
  const actor = target === 'hero' ? fight.hero : fight.opponents[target];
  let value = actor[attribute];
  if (value === null) throw new RangeError('This component has no such combat attribute');
  if (fight.status !== 'active') return value;
  const flank=attribute==='armour'&&fight.encounter?.armourByHeroSpeedAbility?.[target];
  if(flank)value=fight.turn?.winner==='hero'&&fight.turn.playedSpeedAbility?flank.flanked:flank.normal;
  for(const rule of fight.encounter?.statWhenAllDead||[])if(rule.target===target&&rule.attribute===attribute&&rule.dead.every(index=>isDestinyOpponentDead(fight,index)))value=rule.set;
  for (const effect of fight.effects) {
    if (effect.kind !== 'stat' || effect.target !== target || effect.attribute !== attribute ||
        fight.round < effect.from || fight.round > effect.until) continue;
    if (ignoreModifierIncreases && fight.abilityCatalog?.[effect.source]?.category === 'mo' &&
        (effect.amount > 0 || effect.set !== undefined && effect.set > value)) continue;
    if (attribute === 'armour' && fight.encounter?.armourReductionImmune?.includes(target) &&
        effect.source !== 'encounter-health' && (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
    if (target === 'hero' && attribute === 'armour' && hasDestinyAbility(fight, 'ice-mantle') &&
        (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
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
  return Math.max(0, value);
}

// A printed dash stays null on the component. It supplies no absorption when
// calculating a hit; it is never replaced with a fabricated armour attribute.
export const destinyArmour=(fight,target)=>((target==='hero'?fight.hero:fight.opponents[target]).armour===null?0:destinyStat(fight,target,'armour'));

export function addDestinyStatEffect(fight, target, attribute, amount, duration, source, delay = 0) {
  const from = fight.round + delay;
  fight.effects.push({ kind: 'stat', target, attribute, amount, from,
    until: duration === null ? Number.MAX_SAFE_INTEGER : from + duration - 1, source });
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

export function observeDestinyHealth(fight) {
  if (fight.hero.health < 10 && destinyPenaltyApplies(fight, 'chronic-convulsions')) fight.chronicTriggered = true;
  for (const rule of fight.encounter?.healthThresholdStats || []) {
    const opponent = fight.opponents[rule.target];
    if (rule.triggered || !opponent || opponent.health > rule.health) continue;
    rule.triggered = true;
    for (const [attribute, amount] of Object.entries(rule.changes || {})) addDestinyStatEffect(fight, rule.target, attribute, amount, null, 'encounter-health');
    if (rule.activateTargets) fight.encounter.inactiveTargets = (fight.encounter.inactiveTargets || []).filter(target => !rule.activateTargets.includes(target));
    if(rule.speedDice)(fight.encounter.speedDiceByTarget??={})[rule.target]=rule.speedDice;
    if(rule.damageDice)(fight.encounter.damageDiceByTarget??={})[rule.target]=rule.damageDice;
  }
}

export function destinyDamageScore(fight) {
  const hero = fight.turn.winner === 'hero';
  const target = hero ? 'hero' : destinyAttackerTarget(fight);
  const attacker = hero ? fight.hero : fight.opponents[target];
  const power = hero ? fight.turn.damageUsesBrawn ? destinyStat(fight, target, 'brawn') : Math.max(destinyStat(fight, target, 'brawn'), destinyStat(fight, target, 'magic'))
    : destinyStat(fight, target, attacker.damageStat);
  const statusBonus=hero ? Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.scorePerDieAgainstStatuses && hasDestinyAbility(fight,name) &&
    fight.effects.some(effect=>effect.target===fight.target && spec.scorePerDieAgainstStatuses.includes(effect.kind) && effect.from<=fight.round && effect.until>=fight.round)).length : 0;
  const reduction=hero ? 0 : fight.effects.filter(effect=>effect.kind==='opponent-die-reduction'&&effect.from<=fight.round&&effect.until>=fight.round).reduce((sum,effect)=>sum+effect.amount,0);
  const perDie = statusBonus + (hero?destinyPassiveDamageBonus(fight):0) + (fight.turn.damagePerDie || 0) + (hero ?
    fight.effects.filter(effect => ['score-per-die', 'damage-per-die'].includes(effect.kind) && effect.from <= fight.round && effect.until >= fight.round && !fight.encounter?.abilityImmunityByTarget?.[fight.target]?.includes(effect.source))
      .reduce((total, effect) => total + effect.amount*destinyAbilityDamageMultiplier(fight,fight.target,effect.source), 0) : 0);
  const kept = fight.turn.damageKeepHighest && !hero ? new Set(fight.turn.damageDice.map((face,index)=>({face,index}))
    .sort((a,b)=>b.face-a.face).slice(0,fight.turn.damageKeepHighest).map(item=>item.index)) : null;
  const dice = fight.turn.damageDice.reduce((total, face, index) => kept && !kept.has(index) ? total : total + Math.max(0,face-reduction) + perDie +
    (fight.turn.damageDieBonuses?.[index] || 0) +
    (hero && face === 6 && hasDestinyAbility(fight, 'mangle') ? 2 : 0), 0);
  const bonus = fight.effects.filter(effect => effect.kind === 'score-flat' && effect.hero === hero &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0);
  const encounter = hero ? 0 : -(fight.encounter?.scoreReductionByTarget?.[target] || 0) +
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
  if (damage<=0)return;
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
  if (fight.encounter?.passiveImmuneTargets?.includes(target)) return;
  for (const [ability, amount, delay] of [['bleed', 1, 0], ['disease', 2, 1], ['venom', 2, 0]]) {
    if (fight.encounter?.passiveImmunityByTarget?.[target]?.includes(ability)) continue;
    if (!hasDestinyAbility(fight, ability) || fight.effects.some(effect => effect.kind === ability && effect.target === target)) continue;
    const status = fight.abilityCatalog?.[ability]?.statusEffect;
    const upgraded = (status?.upgrades || []).filter(rule => hasDestinyAbility(fight, rule.ability))
      .reduce((value, rule) => value + rule.bonus, status?.amount ?? amount);
    fight.effects.push({ kind: ability, target, amount: upgraded, from: fight.round + (status?.delay ?? delay), until: Number.MAX_SAFE_INTEGER });
  }
  if (kind === 'score' && fight.turn.damageDice?.includes(6) && hasDestinyAbility(fight, 'ice-edge')) {
    addDestinyStatEffect(fight, target, 'speed', -1, 1, 'ice-edge', 1);
  }
}

export function reflectDestinyDamage(fight, target, damage, kind) {
  if (!damage) return;
  for (const rule of fight.encounter?.reflectDamage || []) {
    if(!rule.allDamage&&!['score','dice','first-strike'].includes(kind))continue;
    if (rule.target !== undefined && rule.target !== target) continue;
    if (rule.requiresAlive?.some(index => !isDestinyOpponentActive(fight, index))) continue;
    if(rule.nonlethalOnly&&fight.opponents[target].health<=damage)continue;
    if(rule.dice){
      (fight.turn.afterHealthDamageEvents??=[]).push({kind:'enemy-dice-damage',name:rule.name,dice:rule.dice,owner:'opponent',damageDice:true,attacker:target});
      continue;
    }
    const amount = rule.divisor ? Math.ceil(damage / rule.divisor) : rule.amount;
    const lost=damageDestinyHero(fight,amount);
    fight.history.push({ type: 'reflected-damage', round: fight.round, target, damage: lost });
  }
}

export function destinyStrike(fight, target, amount, source, kind = 'dice') {
  const opponent = fight.opponents[target];
  if (!isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living opponent');
  if(fight.encounter?.abilityImmunityByTarget?.[target]?.includes(source))return 0;
  if (!destinyDamageAllowed(fight, target, kind)) return 0;
  const lost = Math.min(opponent.health, amount);
  reflectDestinyDamage(fight, target, lost, kind);
  opponent.health -= lost;
  observeDestinyHealth(fight);
  destinyOnHeroHit(fight, target, lost, kind);
  fight.turn.lastHeroDamage ??= {};
  fight.turn.lastHeroDamage[target] = (fight.turn.lastHeroDamage[target] || 0) + lost;
  if (isDestinyOpponentDead(fight, target)) {
    recordDestinyDefeat(fight, target);
    fight.turn.deaths.push(target);
    if (kind === 'passive') fight.turn.pendingPassiveDeath = true;
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
  const target = destinyAttackerTarget(fight);
  if (!isDestinyOpponentActive(fight, target)) return;
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
  if (kind === 'speed') return owner === 'hero' ? (fight.turn.lockedHeroDice || []).includes(index) : Boolean(fight.turn.lockedOpponentDice);
  return owner === 'hero' && (fight.turn.lockedDamageDice || []).includes(index);
}

export function rollDestinyDamageDice(fight, count, roll, unmodified = false) {
  const bonus = destinyPassiveDamageBonus(fight)+(unmodified ? 0 : fight.effects.filter(effect => effect.kind === 'damage-per-die' &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0));
  let total = 0;
  for (let i = 0; i < count; i++) {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    total += applyDestinyHeroRoll(fight,[value],'damage')[0] + bonus;
  }
  return total;
}

export function destinyPassiveEffects(fight, roll) {
  const result = [];
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
  for (const [name, amount] of Object.entries(fight.encounter?.heroStatuses || {})) result.push({ target: 'hero', amount, ignoreArmour: true, source: name });
  if (fight.encounter?.growingStatus) result.push({ target: 'hero', amount: fight.encounter.growingStatus.increment *
    (fight.round - fight.encounter.growingStatus.from + 1), ignoreArmour: true, source: fight.encounter.growingStatus.name });
  if (fight.encounter?.damageWithoutAttackAbility && !fight.turn.playedSpeedAbility && !fight.turn.used.co) result.push({ target: 'hero',
    amount: fight.encounter.damageWithoutAttackAbility, ignoreArmour: true, source: 'tide-of-darkness' });
  for (const rule of fight.encounter?.roundRampingDamage || []) result.push({
    target: 'hero', amount: rule.current ?? rule.initial, ignoreArmour: true, source: rule.name,
  });
  for (const effect of fight.encounter?.endEffects || []) {
    if(fight.turn?.suppressedEndEffects?.includes(effect.source))continue;
    if (effect.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    const amount = effect.actorAttribute ? destinyStat(fight, effect.actor, effect.actorAttribute) : effect.healthDivisor ?
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
    if (spec.endDamage) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target) && !fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name)) {
        result.push({target,amount:spec.endDamage*destinyAbilityDamageMultiplier(fight,target,name),ignoreArmour:true,source:name});
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
    if (fight.encounter?.passiveImmunityByTarget?.[effect.target]?.includes(effect.status || effect.kind)) continue;
    if (!['bleed', 'disease', 'venom', 'burn', 'ongoing-damage', 'delayed-dice'].includes(effect.kind) ||
        fight.round < effect.from || fight.round > effect.until || !isDestinyOpponentActive(fight, effect.target)) continue;
    let amount = effect.amount;
    if (effect.kind === 'burn') {
      const base=Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.burnDamage && hasDestinyAbility(fight,name)).map(([,spec])=>spec.burnDamage);
      if (!base.length) continue;
      amount=Math.max(...base,...Object.entries(fight.abilityCatalog || {}).filter(([name,spec])=>spec.burnUpgrade && hasDestinyAbility(fight,name)).map(([,spec])=>spec.burnUpgrade));
      amount*=destinyAbilityDamageMultiplier(fight,effect.target,'burn');
    }
    if (effect.kind === 'bleed') amount += fight.bleedBonus || 0;
    if (effect.kind === 'delayed-dice') {
      amount = rollDestinyDamageDice(fight, 1, roll);
    }
    result.push({ target: effect.target, amount, ignoreArmour: true, source: effect.source || effect.kind });
  }
  return result;
}

export function destinyPassiveProtection(fight, amount) {
  if (fight.effects.some(effect => effect.kind === 'freeze' && fight.round >= effect.from && fight.round <= effect.until)) return 0;
  return amount;
}

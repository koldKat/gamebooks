import {DESTINY_ABILITIES} from './abilities.js';

const anytime=['speed','speed-rolled','damage','damage-rolled','ability-rolled','end'];
const damage=['damage','damage-rolled'];
const rule=(category,phases,extra={})=>({category,phases,...extra});
const catalog={};
for(const name of ['acid','barbs','bleed','charge','charm','cleave','command','corruption',
  'critical-strike','dark-pact','deceive','deep-wound','deflect','dodge','dominate','evade',
  'fatal-blow','feint','focus','gut-ripper','haste','heal','impale','iron-will','lightning',
  'might-of-stone','overload','overpower','piercing','quicksilver','radiance','rake',
  'regrowth','retaliation','rust','sear','sidestep','sideswipe','slam','thorn-armour',
  'thorns','trickster','vanish']) {
  catalog[name]={...DESTINY_ABILITIES[name],phases:DESTINY_ABILITIES[name].phases.filter(phase=>phase!=='death-move')};
}
Object.assign(catalog,{
  adrenaline:rule('sp',['speed'],{attribute:'speed',amount:2,duration:2}),
  ambidextrous:rule('pa',[],{swapSwordHands:true}),
  'beep-beep':rule('pa',[],{discoveredGoldMultiplier:2}),
  'good-taste':rule('pa',[],{backpackMagicBonusDice:1}),
  'loot-master':rule('pa',[],{goldInsteadOfLoot:20}),
  'midas-touch':rule('pa',[],{goldForReplacedEquipment:30}),
  'patchwork-pauper':rule('pa',[],{retainEquipmentAbilitySlots:['chest','gloves','cloak','feet']}),
  usurper:rule('mo',anytime,{stealPlayedAbility:true}),
  bolt:rule('co',['damage'],{heroWon:true,replacement:true,chargeDice:3}),
  ensnare:rule('co',['end'],{cancelDodge:true}),
  execution:rule('sp',['speed'],{requiresMainHand:'sword',executeBelowStat:'speed',limit:null}),
  expertise:rule('mo',['ability-rolled'],{cancelCounterstrike:true}),
  hamstring:rule('co',['end'],{cancelDodge:true}),
  haunt:rule('co',['damage'],{heroWon:true,replacement:true,summonDamage:2,dispelOnDoubles:true}),
  'kick-start':rule('pa',[],{reviveHealth:15,cleanseOnRevive:true}),
  'life-spark':rule('pa',[],{doublesHeal:4}),
  'raining-blows':rule('mo',[],{scoreExplodingFace:6}),
  reflect:rule('co',['damage-rolled','ability-rolled'],{reflectIncoming:true,requiredTargetTrait:'vampire'}),
  sacrifice:rule('co',['damage-rolled','ability-rolled'],{cancelIncoming:true,sacrificeSummon:'shades'}),
  'second-skin':rule('pa',[],{immuneOpponentAbility:'piercing'}),
  shades:rule('pa',[],{summon:true,damagePerDie:2}),
  stake:rule('sp',anytime,{executeBelowHealth:10,requiredTargetTrait:'vampire',forceVictory:true}),
  steadfast:rule('pa',[],{immuneOpponentAbility:'knockdown'}),
  'swift-strikes':rule('pa',[],{heroSpeedFaceStrike:{face:6,requiresMainHand:'sword',requiresLeftHand:'sword',damageFromFastestWeapon:true}}),
  backfire:rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',dice:3,selfDamageDice:2}),
  'blood-rage':rule('mo',[],{consecutiveHitBoost:{rounds:2,attribute:'brawn',amount:2}}),
  'brain-drain':rule('mo',damage,{heroWon:true,spendStat:'magic',maxSpend:5}),
  burn:rule('pa',[],{burnDamage:1}),
  embers:rule('pa',[],{burnUpgrade:2}),
  'ice-shield':rule('mo',anytime,{rollStat:'armour'}),
  ignite:rule('co',['damage'],{heroWon:true,replacement:true,hit:'all',dice:2,shared:true,unmodified:true,ignite:true}),
  'last-laugh':rule('mo',['speed-rolled','damage-rolled'],{reroll:'opponent-all'}),
  martyr:rule('mo',['damage-rolled'],{enemyWon:true,replaceIncomingDamage:5}),
  merciless:rule('pa',[],{scorePerDieAgainstStatuses:['bleed','disease','venom']}),
  'second-sight':rule('mo',anytime,{opponentDieReduction:2}),
  'seeing-red':rule('pa',[],{lowHealthBoost:{health:20,attribute:'speed',amount:2}}),
  'shadow-speed':rule('sp',['speed'],{speedFace:{from:1,to:3}}),
  'shield-spin':rule('pa',[],{opponentSpeedFaceDamage:{face:1,dice:1,requires:'shield'}}),
  'shield-wall':rule('co',anytime,{requires:'shield',multiplyStat:'armour',multiplier:2,hit:'one',dice:1}),
  shock:rule('co',['end'],{afterHit:true,hit:'one',fixedDamageStat:'armour',fixedDamageOwner:'opponent',fixedDamageDivisor:2,currentTarget:true}),
  steal:rule('mo',anytime,{chooseAttribute:['speed','brawn','magic','armour'],matchOpponent:true}),
  'time-shift':rule('sp',['speed'],{matchOpponent:true,matchAttribute:'speed',duration:3,lockSpeedAbilities:true}),
  vampirism:rule('mo',['end'],{healLastHitDivisor:2}),
  'avenging-spirit':rule('co',['end'],{afterEnemyHit:true,hit:'one',fixedDamageStat:'armour',unmodified:true,currentTarget:true}),
  'black-rain':rule('pa',['damage'],{replacement:true,heroWon:true,hit:'all',dice:1,shared:true,requires:'bow',passiveAttack:true}),
  brutality:{...catalog.overpower},
  'bulls-eye':rule('mo',['start'],{opening:true,openingDice:1,openingExclusiveWith:['first-strike'],exclusiveCareer:'assassin'}),
  'cats-speed':{...catalog.haste},
  cauterise:rule('mo',anytime,{cleanse:['venom','bleed','disease']}),
  'chill-touch':{...catalog.radiance},
  'cleansing-light':rule('pa',[],{endHeal:2}),
  'click-your-heels':{...catalog.quicksilver},
  courage:rule('sp',['speed'],{attribute:'speed',amount:4}),
  cripple:rule('co',['end'],{afterHit:true,afterHitStats:[{attribute:'speed',amount:-1,duration:3,delay:1}]}),
  'deadly-poisons':rule('mo',[]),
  demolish:rule('sp',['speed'],{opponentSpeedDiceReduction:1,enemy:true,attribute:'armour',amount:-1,duration:null}),
  disease:rule('pa',[],{statusEffect:{amount:2,delay:0}}),
  disrupt:rule('co',['end'],{afterHit:true,afterHitStats:[{attribute:'magic',amount:-3,duration:null}]}),
  eureka:rule('mo',anytime,{chooseAttribute:['speed','brawn','magic'],amount:1}),
  'fallen-hero':rule('mo',anytime,{attribute:'brawn',amount:3,heal:10}),
  fearless:{...catalog.quicksilver},
  'feral-fury':{...catalog['deep-wound']},
  'fire-aura':rule('pa',[],{endDamage:1}),
  'first-cut':rule('pa',['start'],{opening:true,openingDamage:1,openingKind:'fixed-opening',passiveAttack:true,excludedCareer:'assassin'}),
  'first-strike':rule('pa',['start'],{opening:true,openingDice:1,requiresMainHand:'dagger',passiveAttack:true,openingExclusiveWith:['bulls-eye'],exclusiveCareer:'assassin'}),
  fortitude:rule('mo',anytime,{chooseAttribute:['brawn','armour'],amount:3}),
  'head-butt':rule('co',['damage'],{enemyWon:true,replacement:true}),
  'ice-shards':rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',fixedDamageStat:'magic'}),
  judgement:rule('co',['end'],{afterEnemyHit:true,hit:'one',fixedDamageStat:'speed',fixedDamageDivisor:2,currentTarget:true}),
  'lay-of-the-land':{...catalog.haste},
  leech:rule('pa',[],{onHitHeal:2}),
  mend:rule('mo',anytime,{heal:15}),
  'natures-revenge':rule('co',['damage'],{replacement:true,heroWon:true,hit:'one',dice:2,slowTargets:true}),
  parry:rule('co',['damage'],{enemyWon:true,replacement:true}),
  'poison-mastery':rule('pa',[]),
  pound:rule('co',damage,{heroWon:true,scoreBonus:3,statChanges:[{attribute:'speed',amount:-1,duration:1,delay:1}]}),
  puncture:rule('co',['damage'],{replacement:true,heroWon:true,hit:'one',dice:2,armourLoss:1}),
  riposte:{...catalog.retaliation},
  savagery:rule('mo',anytime,{chooseAttribute:['brawn','magic'],amount:2}),
  'second-wind':rule('mo',anytime,{regain:['sp']}),
  'shadow-fury':rule('co',damage,{heroWon:true,scoreEquipmentSpeed:true}),
  'spider-sense':{...catalog.dodge},
  'spore-cloud':rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:2,currentTarget:true}),
  surge:rule('co',damage,{heroWon:true,attribute:'magic',amount:3,statChanges:[{attribute:'speed',amount:-1,duration:1,delay:1}]}),
  'swamp-legs':rule('sp',['speed'],{enemy:true,attribute:'speed',amount:-1}),
  'thorn-fist':rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:2,currentTarget:true}),
  tourniquet:rule('mo',anytime,{cleanse:['venom','bleed','disease']}),
  vanquish:rule('mo',anytime,{attribute:'brawn',amount:2}),
  venom:rule('pa',[],{statusEffect:{amount:2,delay:0,upgrades:[{ability:'deadly-poisons',bonus:1},{ability:'poison-mastery',bonus:1}]}}),
  vitriol:rule('pa',['start'],{opening:true,openingPassive:true,endDamage:1,endSelfDamage:1}),
  zapped:rule('sp',['speed'],{enemy:true,statChanges:['speed','brawn','magic'].map(attribute=>({attribute,amount:-3,duration:1}))}),
});
for(const name of ['curse','immobilise','knockdown','shackle','stun','webbed','windblast']) {
  catalog[name]=rule('sp',['speed'],{opponentSpeedDiceReduction:1});
}

// Source rules are complete; the book's encounters and application entry must
// still be integrated before this catalog is released.
export const LEGION_SOURCE_ABILITIES=Object.freeze(('acid adrenaline ambidextrous avenging-spirit backfire barbs beep-beep black-rain bleed blood-rage bolt brain-drain brutality bulls-eye burn cats-speed cauterise charge charm chill-touch cleansing-light cleave click-your-heels command corruption courage cripple critical-strike curse dark-pact deadly-poisons deceive deep-wound deflect demolish disease disrupt dodge dominate embers ensnare eureka evade execution expertise fallen-hero fatal-blow fearless feint feral-fury fire-aura first-cut first-strike focus fortitude good-taste gut-ripper hamstring haste haunt head-butt heal ice-shards ice-shield ignite immobilise impale iron-will judgement kick-start knockdown last-laugh lay-of-the-land leech life-spark lightning loot-master martyr mend merciless midas-touch might-of-stone natures-revenge overload overpower parry patchwork-pauper piercing poison-mastery pound puncture quicksilver radiance raining-blows rake reflect regrowth retaliation riposte rust sacrifice savagery sear second-sight second-skin second-wind seeing-red shackle shades shadow-fury shadow-speed shield-spin shield-wall shock sidestep sideswipe slam spider-sense spore-cloud stake steadfast steal stun surge swamp-legs swift-strikes thorn-armour thorn-fist thorns time-shift tourniquet trickster usurper vampirism vanish vanquish venom vitriol webbed windblast zapped').split(' '));
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
}
export const LEGION_ABILITIES=freeze(catalog);
export const LEGION_PENDING_ABILITIES=Object.freeze(LEGION_SOURCE_ABILITIES.filter(name=>!Object.hasOwn(catalog,name)));

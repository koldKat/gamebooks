import {LEGION_ABILITIES} from './legion-abilities.js';
import {DESTINY_ABILITIES} from './abilities.js';

const anytime=['speed','speed-rolled','damage','damage-rolled','ability-rolled','end'];
const damage=['damage','damage-rolled'];
const rule=(category,phases,extra={})=>({category,phases,...extra});
const catalog={};

// These definitions have identical wording and categories in both volumes.
for(const name of ('acid bleed cauterise charge critical-strike curse dark-pact deceive deflect disease evade fatal-blow fearless focus immobilise impale iron-will knockdown leech lightning parry piercing quicksilver radiance sear second-skin shadow-fury sidestep sideswipe steadfast steal stun thorn-armour time-shift trickster webbed').split(' ')) {
  catalog[name]=structuredClone(LEGION_ABILITIES[name]);
}
// Wording changes here do not change the solo mechanic. Ally targeting and the
// other new mechanics are kept out of this catalog until their adapters exist.
for(const name of ('barbs charm cleave command deep-wound disrupt dodge dominate feint fire-aura gut-ripper haste overload overpower pound rake retaliation rust slam surge thorns vanish venom').split(' ')) {
  catalog[name]=structuredClone(LEGION_ABILITIES[name]);
}
for(const name of ('crawlers cruel-twist cunning fear finesse hooked insight reckless roll-with-it sneak sure-edge wave').split(' ')) {
  const spec=DESTINY_ABILITIES[name];
  catalog[name]={...spec,phases:spec.phases.filter(phase=>phase!=='death-move')};
}
Object.assign(catalog,{
  // Prophecy is granted by the prologue, outside the glossary. Fallen Hero is
  // printed on the Scapula but omitted from this volume's glossary; Book One
  // supplies its explicit rule, unchanged in the existing family catalog.
  prophecy:{...catalog.dodge},
  'fallen-hero':structuredClone(LEGION_ABILITIES['fallen-hero']),
  ashes:rule('sp',['speed'],{firstRound:true,attribute:'armour',amount:1,duration:null}),
  blind:{...catalog.webbed},
  windblast:{...catalog.webbed},
  blink:{...catalog.dodge},
  constrictor:{...catalog.webbed},
  dirge:{...catalog.parry},
  'safe-path':{...catalog.fearless},
  'heavy-blow':{...catalog['deep-wound']},
  corrode:{...catalog.rust},
  melt:{...catalog.rust},
  shatter:{...catalog.rust},
  'back-draft':rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:2,hitAttacker:true}),
  retaliation:rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:1,hitAttacker:true}),
  sideswipe:rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:1,hitAttacker:true}),
  'demon-spines':rule('co',['end'],{afterEnemyHit:true,hit:'one',dice:1,hitAttacker:true}),
  counter:rule('co',damage,{enemyWon:true,scoreEffect:-2,scoreHero:false,hit:'one',dice:1,hitAttacker:true}),
  confound:rule('co',damage,{enemyWon:true,avoidDamage:true,hit:'one',dice:1,hitAttacker:true,attackerStats:['brawn','magic'].map(attribute=>({attribute,amount:-1,duration:null}))}),
  'faithful-friend':rule('mo',anytime,{scoreEffect:2,scoreHero:true}),
  heartless:rule('mo',anytime,{chooseAttribute:['brawn','magic'],amount:2}),
  'war-paint':rule('mo',anytime,{chooseAttribute:['brawn','armour'],amount:3}),
  wisdom:rule('mo',anytime,{attribute:'magic',amount:2}),
  savagery:rule('mo',anytime,{attribute:'brawn',amount:2}),
  redemption:rule('mo',anytime,{attribute:'brawn',amount:2,heal:4}),
  penance:rule('mo',damage,{heroWon:true,sacrifice:4,damageDie:true}),
  compulsion:rule('co',damage,{heroWon:true,damageDie:true,statChanges:[{attribute:'speed',amount:-2,duration:1,delay:1}]}),
  doom:rule('co',['end'],{afterHit:true,afterHitStats:['armour','brawn','magic'].map(attribute=>({attribute,amount:-1,duration:null}))}),
  shunt:rule('co',['end'],{afterHit:true,afterHitStats:[{attribute:'speed',amount:-2,duration:1,delay:1}]}),
  stagger:rule('co',['end'],{afterHit:true,afterHitStats:[{attribute:'armour',set:0,duration:1,delay:1}]}),
  shock:rule('co',['end'],{afterHit:true,hit:'one',fixedDamageStat:'armour',fixedDamageOwner:'opponent',fixedDamageDivisor:2,currentTarget:true}),
  frostbite:rule('co',['end'],{afterHit:true,frostbite:true}),
  'savage-call':rule('co',['damage'],{heroWon:true,replacement:true,permanentBrawn:2}),
  flurry:rule('co',['damage'],{heroWon:true,replacement:true,hit:'all',dice:1,shared:true}),
  volley:rule('co',['damage'],{heroWon:true,replacement:true,hit:'all',dice:1,shared:true}),
  trample:rule('co',['damage'],{heroWon:true,replacement:true,hit:'all',dice:3,shared:true}),
  swarm:rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',dice:1,slowTargets:true}),
  skewer:rule('co',['damage'],{heroWon:true,replacement:true,hit:'all',dice:1,shared:true,slowTargets:true}),
  wither:rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',dice:2,weaken:true}),
  'monkey-mob':rule('co',['damage'],{heroWon:true,replacement:true,summonDamage:2}),
  packmaster:rule('co',['damage'],{heroWon:true,replacement:true,summonDamage:2,dispelOnDoubles:true}),
  parasite:{...catalog.steal},
  vampirism:rule('mo',['end'],{healLastHitDivisor:2}),
  'coup-de-grace':rule('pa',anytime,{executeBelowHealth:10}),
  headshot:rule('pa',anytime,{executeBelowHealth:5}),
  'sweet-spot':rule('pa',['start'],{opening:true}),
  faith:rule('mo',[],{doublesHeal:2}),
  channel:rule('mo',anytime,{perItem:true,fixedStatCost:{attribute:'magic',amount:2},scoreEffect:4,scoreHero:true}),
  'focused-strike':rule('co',damage,{heroWon:true,ignoreArmour:true,requiresWeaponHands:{mainHand:['fist','fist weapon'],leftHand:['fist','fist weapon']}}),
  'blessed-blades':rule('mo',anytime,{requiresWeaponHands:{mainHand:['sword'],leftHand:['sword']},healWeaponStat:'brawn'}),
  'last-defence':rule('mo',anytime,{healthAtMost:10,attribute:'brawn',amount:2,duration:null}),
  'near-death':rule('mo',anytime,{healthAtMost:10,attribute:'magic',amount:2,duration:null}),
  unstoppable:rule('mo',damage,{enemyWon:true,sacrifice:5,reverse:true}),
  'tremor-strike':rule('sp',['speed'],{allOpponentStats:[{attribute:'speed',amount:-2,duration:2}]}),
  'wish-master':rule('sp',['speed'],{duration:null,statChanges:[{attribute:'speed',amount:-1},{attribute:'magic',amount:2},{attribute:'armour',amount:2}]}),
  'last-rites':rule('pa',anytime,{targetHealthAtMost:15,enemy:true,duration:null,statChanges:[{attribute:'speed',amount:-1},{attribute:'armour',amount:-1}]}),
  veil:rule('co',damage,{enemyWon:true,avoidDamage:true,statChanges:[{attribute:'speed',amount:1,duration:1,delay:1}]}),
  gouge:rule('pa',[]),
  bleed:{...catalog.bleed,statusEffect:{amount:1,delay:0,upgrades:[{ability:'gouge',bonus:1}]}},
  'turn-up-the-heat':rule('pa',[],{allyEndDamageBonus:{ability:'fire-aura',amount:1}}),
  'fire-aura':rule('pa',[],{endDamage:1,endDamageUpgrades:[{ability:'turn-up-the-heat',amount:1}]}),
  'searing-mantle':rule('pa',[],{endDamageFromStat:{attribute:'armour',divisor:4}}),
  'holy-protector':rule('pa',[],{endDamage:1,endDamageTargetTrait:'undead'}),
  'blood-thief':rule('pa',[],{activeWithLeftHand:'bow',heroFaceHealing:{kinds:['damage'],face:6,amount:4}}),
  'blood-hail':rule('co',['damage'],{heroWon:true,replacement:true,requires:'bow',hit:'all',dice:2,shared:true,bonusAgainstStatus:{status:'bleed',priorRound:true,amount:4}}),
  'demon-claws':rule('pa',[],{heroSpeedDoublesStrike:4}),
  'fiery-temper':rule('pa',[],{opponentFaceStatBoost:{kind:'damage',face:6,every:2,attribute:'brawn',amount:2}}),
  indomitable:rule('pa',[],{immuneStatReduction:'brawn'}),
  'snake-strike':rule('pa',['start'],{opening:true,openingDice:2,requiresLeftHand:'snake',passiveAttack:true}),
  exploit:rule('pa',[]),
  weaver:rule('pa',[]),
  mangle:rule('mo',['damage-rolled'],{heroWon:true,scoreFaceBonus:{face:6,amount:2}}),
  // These protections are applied by explicit encounter descriptions.
  'fire-shield':rule('pa',[]),
  insulated:rule('pa',[]),
  heal:rule('mo',anytime,{heal:4,perItem:true,allyTarget:true}),
  regrowth:rule('mo',anytime,{heal:6,perItem:true,allyTarget:true}),
  'greater-heal':rule('mo',anytime,{heal:8,perItem:true,allyTarget:true}),
  'might-of-stone':rule('mo',anytime,{attribute:'armour',amount:3,allyTarget:true}),
  'iron-will':rule('mo',anytime,{attribute:'armour',amount:3,allyTarget:true}),
  'many-scales':rule('mo',anytime,{attribute:'armour',amount:3,allyTarget:true}),
  resolve:rule('mo',anytime,{attribute:'armour',amount:4,allyTarget:true}),
  'spirit-ward':rule('mo',anytime,{attribute:'armour',amount:6,allyTarget:true}),
  bless:rule('mo',anytime,{heal:6,chooseAttribute:['brawn','magic'],amount:1,duration:null,allyTarget:true,attributeBonusFromAbility:{ability:'miracle',amount:1}}),
  miracle:rule('pa',[]),
  primal:rule('co',['damage'],{heroWon:true,replacement:true,duration:null,allyTarget:true,statChanges:[{attribute:'brawn',amount:2},{attribute:'magic',amount:2}]}),
  purge:rule('mo',anytime,{cleanse:['disease','venom'],allyTarget:true}),
  refresh:rule('mo',anytime,{regain:['sp','co','mo','pa'],allyTarget:true}),
  'shock-treatment':rule('mo',anytime,{allyTarget:true,reviveAlly:10}),
  atonement:rule('mo',['start'],{passiveRecoverySources:['bleed','barbs','disease','fire-aura','thorns','venom']}),
  meditation:rule('co',['damage'],{heroWon:true,replacement:true,meditationHeal:{amount:1,upgradeAbility:'tranquillity',upgradedAmount:2}}),
  tranquillity:rule('pa',[]),
  beguile:rule('mo',anytime,{regain:['sp']}),
  reaper:rule('mo',['end'],{afterHit:true,afterHitMayBeLethal:true,advanced:true}),
  vortex:rule('co',['damage'],{heroWon:true,replacement:true,advanced:true}),
  'silver-frost':rule('mo',['speed-rolled'],{advanced:true}),
  'magic-tap':rule('mo',anytime,{attribute:'magic',amount:2,restoreOnDoubles:true}),
  'high-five':rule('mo',['speed-rolled','damage-rolled','ability-rolled'],{heroDieFace:5}),
  'shadow-speed':rule('mo',['speed-rolled'],{heroSpeedFaceMap:{from:1,to:3}}),
  'sure-grip':rule('mo',['speed-rolled'],{heroSpeedFaceMap:{from:1,to:6}}),
  surefooted:rule('mo',['speed-rolled'],{reroll:'hero-speed',rerollAllSpeed:true}),
  hypnotise:rule('mo',['damage-rolled'],{rerollOpponentDamageFaces:[6]}),
  siphon:rule('mo',['damage-rolled'],{opponentDamageFaceMap:{from:6,to:1}}),
  slick:rule('co',['damage'],{heroWon:true,useHeroSpeedDiceForDamage:'all',lockCopiedSpeedDice:true}),
  'roll-with-it':rule('mo',['damage'],{heroWon:true,useHeroSpeedDiceForDamage:'one'}),
  suppress:rule('mo',['speed','speed-rolled'],{opponentSpeedResultBonus:-2}),
  underhand:rule('mo',['damage'],{enemyWon:true,reverse:true,requiresLosingSpeedDoubles:true}),
  hexed:rule('pa',[],{quotaStatus:true,quotaMaximum:8}),
  'demon-blood':rule('pa',[],{quotaStatus:true,quotaIncrease:2,permanentHealthBonus:10}),
  'prowler-set':rule('pa',[],{setSlots:['head','gloves','chest'],quotaExemptAbilities:['evade','blind-strike','backstab','sidestep','vanish']}),
  'volcanism-set':rule('pa',[],{setSlots:['head','gloves','chest'],quotaExemptAbilities:['back-draft','fire-aura','sear','fire-shield']}),
  'faith-and-duty-set':rule('-',[],{setSlots:['mainHand','leftHand'],grantsAbility:'redemption'}),
  'fiend-s-finest-set':rule('-',[],{setSlots:['gloves','head'],grantsAbility:'exploit'}),
  'cistene-s-chattels-set':rule('-',[],{setSlots:['necklace','leftHand'],grantsAbility:'miracle'}),
  'missionary-s-calling-set':rule('-',[],{setSlots:['head','chest'],grantsAbility:'penance'}),
  'savage-arms-set':rule('-',[],{setSlots:['mainHand','leftHand'],grantsAbility:'mangle'}),
  'seraphim-s-symbols-set':rule('-',[],{setSlots:['necklace','ring'],grantsAbility:'tranquillity'}),
  'elysium-soaked':rule('pa',[],{quotaStatus:true,abilityCheck:{categories:['mo'],cancelMaximum:1}}),
  'broken-trust':rule('pa',[],{quotaStatus:true,abilityCheck:{abilities:['blessed-bullets'],cancelMaximum:5,blockCategoryOnFailure:true}}),
  'blessed-bullets':rule('co',['damage'],{heroWon:true,replacement:true,requiresCompanion:'virgil',quotaExempt:true,hit:'one',dice:3,slowTargets:true}),
  'blood-sworn-set':rule('mo',anytime,{setSlots:['head','gloves','chest'],quotaExempt:true,payQuotaOverride:4,limit:null}),
  'double-punch':rule('co',['damage'],{heroWon:true,replacement:true,requiresWeaponHands:{mainHand:['dagger'],leftHand:['dagger']},hit:'one',dice:2,addWeaponStat:'brawn',usageUpgrade:{ability:'vindicator',limit:2,damageBonus:2}}),
  vindicator:rule('pa',[]),
  'pagan-s-spirit-set':rule('-',[],{setPieces:['dagger','boots'],grantsAbility:'vindicator'}),
  'thorn-cage':rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',dice:1,ongoing:1}),
  'charm-offensive':rule('co',damage,{heroWon:true,scorePerOwnedAbility:{ability:'charm',amount:2}}),
  convulsions:rule('pa',[],{scoreHitStatus:{kind:'lose-speed-doubles',delay:1}}),
  'spirit-mark':rule('co',['end'],{afterHit:true,currentTarget:true,markScoreBonus:2}),
  toxicology:rule('pa',[],{immuneOpponentAbilities:['delirium','disease','venom']}),
  'curse-of-vulnerability':rule('pa',[],{quotaStatus:true,setupStatChanges:[{attribute:'armour',amount:-3,dispelOnDoubles:true}]}),
  'curse-of-weakness':rule('pa',[],{quotaStatus:true,setupStatChanges:['brawn','magic'].map(attribute=>({attribute,amount:-5,dispelOnDoubles:true}))}),
  backstab:rule('co',['speed','speed-rolled','damage','end'],{hit:'one',dice:2,requiresAnyWeaponType:'dagger',requiresControlTrigger:true}),
  'blind-strike':rule('co',['speed','speed-rolled','damage','end'],{hit:'one',dice:2,requiresControlTrigger:true}),
  'ley-line-infusion':rule('co',['damage'],{heroWon:true,replacement:true,allyTarget:true,rollTable:{maximum:6,outcomes:[
    {maximum:1,dice:1,selfDamageDice:1},
    {maximum:3,heal:5,dice:1},
    {maximum:5,heal:8,dice:1},
    {maximum:6,heal:8,allyHeal:8,dice:1},
  ]}}),
  'wild-child':rule('mo',['ability-rolled'],{pendingRollBonus:{ability:'ley-line-infusion',amount:1}}),
  'call-of-nature-set':rule('-',[],{setSlots:['ring','gloves'],grantsAbility:'wild-child'}),
  'bright-spark':rule('mo',anytime,{allowScoreRerolls:true}),
  'stone-rain':rule('co',['damage'],{heroWon:true,replacement:true,hit:'one',dice:1,repeatDamage:[1,2,4]}),
  'stone-skin':rule('co',['damage'],{heroWon:true,replacement:true,combatStance:{speed:-2,avoidMaximum:2,allowedAbilities:['trample']}}),
  defender:rule('pa',['damage','damage-rolled','ability-rolled','end'],{teamDefender:true}),
  pillage:rule('pa',[],{victoryReward:{dice:2,goldFromDice:true}}),
  cutpurse:rule('pa',[],{victoryReward:{dice:1,outcomes:[
    {maximum:2,gold:20},
    {maximum:4,item:{name:'Elixir of invisibility',uses:1,ability:'vanish'}},
    {maximum:6,item:{name:'Flask of healing',uses:1,heal:6}},
  ]}}),
  'tome-raider':rule('pa',[],{permanentBonus:{attribute:'magic',amount:2,countKey:'spellbooks'}}),
  'strength-in-numbers':rule('mo',anytime,{scoreFromStory:{key:'freedTigrisCarts',maximum:4,requiresFlag:'huntersCamp'}}),
  'gorilla-rage':rule('mo',[],{combatAbilityTrigger:{face:6,attributes:['brawn','magic'],amount:1}}),
  'curse-of-frailty':rule('pa',[],{quotaStatus:true,setupHealthPenalty:5}),
});

for(const name of ['immobilise','knockdown','stun','webbed'])catalog[name]={...catalog[name],controlTrigger:true};

function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
}

// Not registered as a book entry while the remaining abilities, team combat,
// encounter adapters and source-specific challenges are being implemented.
export const HEART_ABILITIES=freeze(catalog);

// Coverage of source names is separate from encounter and team-rule completion.
export const HEART_SOURCE_ABILITIES=Object.freeze(["acid","ashes","atonement","back-draft","backstab","barbs","beguile","bleed","bless","blessed-blades","blessed-bullets","blind","blind-strike","blink","blood-hail","blood-sworn-set","blood-thief","bright-spark","broken-trust","call-of-nature-set","cauterise","channel","charge","charm","charm-offensive","cistene-s-chattels-set","cleave","command","compulsion","confound","constrictor","convulsions","corrode","counter","coup-de-grace","crawlers","critical-strike","cruel-twist","cunning","curse","curse-of-frailty","curse-of-vulnerability","curse-of-weakness","cutpurse","dark-pact","deceive","deep-wound","defender","deflect","demon-blood","demon-claws","demon-spines","dirge","disease","disrupt","dodge","dominate","doom","double-punch","elysium-soaked","evade","exploit","faith","faith-and-duty-set","faithful-friend","fallen-hero","fatal-blow","fear","fearless","feint","fiend-s-finest-set","fiery-temper","finesse","fire-aura","fire-shield","flurry","focus","focused-strike","frostbite","gorilla-rage","gouge","greater-heal","gut-ripper","haste","headshot","heal","heartless","heavy-blow","hexed","high-five","holy-protector","hooked","hypnotise","immobilise","impale","indomitable","insight","insulated","iron-will","knockdown","last-defence","last-rites","leech","ley-line-infusion","lightning","magic-tap","mangle","many-scales","meditation","melt","might-of-stone","miracle","missionary-s-calling-set","monkey-mob","near-death","overload","overpower","packmaster","pagan-s-spirit-set","parasite","parry","penance","piercing","pillage","pound","primal","prophecy","prowler-set","purge","quicksilver","radiance","rake","reaper","reckless","redemption","refresh","regrowth","resolve","retaliation","roll-with-it","rust","safe-path","savage-arms-set","savage-call","savagery","sear","searing-mantle","second-skin","seraphim-s-symbols-set","shadow-fury","shadow-speed","shatter","shock","shock-treatment","shunt","sidestep","sideswipe","silver-frost","siphon","skewer","slam","slick","snake-strike","sneak","spirit-mark","spirit-ward","stagger","steadfast","steal","stone-rain","stone-skin","strength-in-numbers","stun","suppress","sure-edge","sure-grip","surefooted","surge","swarm","sweet-spot","thorn-armour","thorn-cage","thorns","time-shift","tome-raider","toxicology","trample","tranquillity","tremor-strike","trickster","turn-up-the-heat","underhand","unstoppable","vampirism","vanish","veil","venom","vindicator","volcanism-set","volley","vortex","war-paint","wave","weaver","webbed","wild-child","windblast","wisdom","wish-master","wither"]);
export const HEART_PENDING_ABILITIES=Object.freeze(HEART_SOURCE_ABILITIES.filter(name=>!Object.hasOwn(catalog,name)));

import { queueDestinyEncounterEvent } from './encounter-events.js';
import { addDestinyStatEffect, healDestinyHero, hasDestinyAbility, destinyStrike, destinyRollOpponentDice, destinyDieLocked, isDestinyOpponentActive, destinyAttackerTarget, observeDestinyHealth, destinyStat, destinyScoreExtraDice, onDestinyHeroDice, applyDestinyHeroRoll } from './effects.js';
import { settleDestinyFight,onDestinyHeroRoundWon } from './core.js';
import { applyDestinyAdvancedAbility } from './advanced.js';
import { prepareDestinyDamage } from './damage.js';
import { prepareDestinyAbilityRoll, finishDestinyAbilityAction } from './ability-rolls.js';
import { useDestinyOpening } from './openings.js';
import { cureDestinyCharacter } from './character.js';
import { onDestinyHeroSpeedRoll } from './roll-events.js';
import { destinyBookOptionSnapshot, destinyPenaltyApplies, destinyDeathMovesEnabled } from './book-rules.js';
import {applyDestinyCatalogAction} from './catalog-actions.js';
import {destinyCanEquipItem} from './travel-rules.js';

const rule = (category, phases, extra = {}) => Object.freeze({ category, phases, ...extra });
const anytime = ['speed', 'speed-rolled', 'damage', 'damage-rolled', 'ability-rolled', 'end', 'death-move'];
const heroDamage = ['damage', 'damage-rolled'];
const definitions = {
  charge: rule('sp', ['speed'], { attribute: 'speed', amount: 2, firstRound: true }),
  frenzy: rule('sp', ['speed'], { attribute: 'speed', amount: 3 }),
  quicksilver: rule('sp', ['speed'], { attribute: 'speed', amount: 2 }),
  radiance: rule('sp', ['speed'], { attribute: 'speed', amount: -2, enemy: true }),
  crawlers: rule('sp', ['speed'], { attribute: 'speed', amount: -1, duration: 2, enemy: true }),
  haste: rule('sp', ['speed'], { speedDie: true }),
  reckless: rule('sp', ['speed'], { speedDie: true, limit: null }),
  cunning: rule('mo', anytime, { attribute: 'brawn', amount: 3 }),
  malice: rule('mo', anytime, { attribute: 'brawn', amount: 3 }),
  savagery: rule('mo', anytime, { attribute: 'brawn', amount: 2 }),
  'mortal-wound': rule('mo', anytime, { attribute: 'brawn', amount: 4 }),
  focus: rule('mo', anytime, { attribute: 'magic', amount: 3 }),
  'might-of-stone': rule('mo', anytime, { attribute: 'armour', amount: 3 }),
  'iron-will': rule('mo', anytime, { attribute: 'armour', amount: 3 }),
  resolve: rule('mo', anytime, { attribute: 'armour', amount: 4 }),
  insight: rule('mo', anytime, { attribute: 'armour', amount: -2, duration: 2, enemy: true }),
  'mental-freeze': rule('mo', anytime, { attribute: 'magic', amount: -3, duration: 2, enemy: true }),
  darksilver: rule('mo', anytime, { attribute: 'speed', amount: 3, sacrifice: 2 }),
  heal: rule('mo', anytime, { heal: 4, perItem: true }),
  regrowth: rule('mo', anytime, { heal: 6, perItem: true }),
  'greater-heal': rule('mo', anytime, { heal: 8, perItem: true }),
  acid: rule('mo', anytime, { scorePerDie: 1 }),
  sear: rule('mo', anytime, { scorePerDie: 1 }),
  'bloody-maiden': rule('mo', anytime, { scorePerDie: 2, duration: 1 }),
  'frost-burn': rule('mo', anytime, { scoreEffect: 2, scoreHero: true }),
  'deep-wound': rule('co', heroDamage, { damageDie: true, heroWon: true }),
  'heavy-blow': rule('co', heroDamage, { damageDie: true, heroWon: true }),
  overload: rule('co', heroDamage, { damageDie: true, heroWon: true }),
  'blood-oath': rule('mo', heroDamage, { damageDie: true, heroWon: true, sacrifice: 4 }),
  piercing: rule('co', heroDamage, { heroWon: true, ignoreArmour: true }),
  'fatal-blow': rule('co', heroDamage, { heroWon: true, halfArmour: true }),
  dodge: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  evade: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  sidestep: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  vanish: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  command: rule('co', ['damage', 'ability-rolled'], { enemyWon: true, reverse: true, attackInterruption: true }),
  fear: rule('mo', anytime, { scoreEffect: -2, scoreHero: false }),
  freeze: rule('mo', anytime, { freeze: true }),
  'pain-sink': rule('pa', anytime, { freeze: true }),
  agility: rule('mo', ['speed-rolled'], { dieAction: 'agility' }),
  sneak: rule('mo', ['speed-rolled'], { dieAction: 'sneak' }),
  'critical-strike': rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'critical', requiresDamageRoll: true }),
  'gut-ripper': rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'critical', requiresDamageRoll: true }),
  dominate: rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'dominate', requiresDamageRoll: true }),
  protection: rule('mo', ['damage-rolled'], { enemyWon: true, dieAction: 'protection' }),
  watchful: rule('mo', ['speed-rolled', 'damage-rolled', 'ability-rolled'], { dieAction: 'watchful' }),
  'sixth-sense': rule('mo', ['speed-rolled', 'damage-rolled', 'ability-rolled'], { dieAction: 'watchful' }),
  feint: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  distraction: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  'dogged-determination': rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  boneshaker: rule('mo', ['speed-rolled'], { reroll: 'opponent-speed' }),
  intimidate: rule('mo', ['speed-rolled'], { reroll: 'both-speed' }),
  finesse: rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, reroll: 'damage-plus-two', requiresDamageRoll: true }),
  'cold-snap': rule('mo', ['damage-rolled', 'ability-rolled'], { reroll: 'damage-plus-two', requiresDamageRoll: true }),
  charm: rule('mo', ['speed-rolled', 'damage-rolled', 'ability-rolled'], { reroll: 'hero-die', perItem: true }),
  'savage-call': rule('co', ['damage'], { replacement: true, heroWon: true, permanentBrawn: 2 }),
  'arcane-feast': rule('co', ['damage'], { replacement: true, heroWon: true, arcaneFeast: true }),
  phantom: rule('co', ['damage'], { replacement: true, heroWon: true, phantom: true }),
  cleave: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  lash: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  splinters: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  'furious-sweep': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 2, shared: true, slowHero: true }),
  aftershock: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'adjacent', dice: 1 }),
  blizzard: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'adjacent', dice: 2, delayed: true }),
  immolation: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'two', dice: 1, shared: true, armourLoss: 1 }),
  'dragon-fire': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'dragon', dice: 3 }),
  'drake-fire': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'dragon', dice: 3 }),
  'hurricane-rush': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 2, recoil: true }),
  'mind-flay': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true, drain: true }),
  'nail-gun': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, armourLoss: 2 }),
  wither: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, weaken: true }),
  rake: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 3, unmodified: true }),
  'vital-artery': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 1, ongoing: 1 }),
  'spin-shot': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, speedDifference: true }),
  stampede: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'below', dice: 3 }),
  skewer: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true, slowTargets: true }),
  'shadow-thorns': rule('dm', ['death-move'], { hit: 'all', dice: 1, shared: true }),
  eviscerate: rule('dm', ['death-move'], { execute: 5 }),
  rust: rule('co', ['end'], { afterHit: true, armourLoss: 2 }),
  corrode: rule('co', ['end'], { afterHit: true, armourLoss: 2 }),
  shatter: rule('co', ['end'], { afterHit: true, shatter: true }),
  corruption: rule('co', ['end'], { afterHit: true, weaken: 2 }),
  frostbite: rule('co', ['end'], { afterHit: true, frostbite: true }),
  'dark-pact': rule('co', heroDamage, { heroWon: true, sacrifice: 4, scoreBonus: 4 }),
  impale: rule('co', heroDamage, { heroWon: true, scoreBonus: 3, advanced: true }),
  'frost-guard': rule('mo', anytime, { attribute: 'armour', amount: 3, advanced: true }),
  'deadly-dance': rule('sp', ['speed'], { enemy: true, limit: 2, advanced: true }),
  'cruel-twist': rule('mo', ['damage-rolled'], { heroWon: true, advanced: true }),
  'ice-slick': rule('mo', ['speed-rolled'], { advanced: true }),
  trickster: rule('mo', ['speed-rolled'], { advanced: true }),
  deceive: rule('mo', ['speed-rolled'], { advanced: true }),
  counter: rule('co', heroDamage, { enemyWon: true, scoreBonus: -2, advanced: true }),
  overpower: rule('co', ['damage'], { enemyWon: true, replacement: true, hit: 'one', dice: 2, currentTarget: true }),
  deflect: rule('co', ['damage'], { enemyWon: true, replacement: true, hit: 'one', dice: 2, currentTarget: true }),
  slam: rule('co', ['damage'], { enemyWon: true, replacement: true, advanced: true }),
  unstoppable: rule('mo', ['damage', 'ability-rolled'], { enemyWon: true, reverse: true, sacrifice: 5, attackInterruption: true }),
  'roll-with-it': rule('mo', ['damage'], { heroWon: true, advanced: true }),
  'shoulder-charge': rule('co', ['damage'], { heroWon: true, advanced: true }),
  'twin-blade': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  wave: rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'scarlet-strikes': rule('dm', ['death-move'], { advanced: true }),
  retaliation: rule('co', ['end'], { afterEnemyHit: true, hit: 'one', dice: 1, currentTarget: true }),
  sideswipe: rule('co', ['end'], { afterEnemyHit: true, hit: 'one', dice: 1, currentTarget: true }),
  revenge: rule('co', ['end'], { afterEnemyHit: true, hit: 'all', dice: 1, shared: true }),
  'shock-blast': rule('co', ['end'], { afterEnemyHit: true, hit: 'all', dice: 1, shared: true }),
  'punch-drunk': rule('co', ['end'], { afterEnemyHit: true, advanced: true }),
  rebound: rule('co', ['end'], { afterEnemyHit: true, advanced: true }),
  'thorn-armour': rule('co', anytime, { attribute: 'armour', amount: 3, hit: 'all', dice: 1, shared: true }),
  parasite: rule('mo', anytime, { advanced: true }),
  reaper: rule('mo', ['end', 'death-move'], { afterHit: true, advanced: true }),
  'pain-barrier': rule('mo', ['start', 'death-move'], { advanced: true }),
  'choke-hold': rule('mo', ['end', 'death-move'], { advanced: true }),
  'coup-de-grace': rule('pa', anytime, { advanced: true }),
  recall: rule('mo', anytime, { regain: ['mo'] }),
  recharge: rule('dm', ['death-move'], { regain: ['sp', 'mo'] }),
  recovery: rule('dm', ['death-move'], { regain: ['mo'] }),
  'tormented-soul': rule('mo', anytime, { sacrifice: 4, regain: ['sp', 'co'] }),
  windfall: rule('co', ['end'], { afterEnemyHit: true, regain: ['sp'] }),
  murder: rule('dm', ['death-move'], { advanced: true }),
  petrify: rule('dm', ['death-move'], { advanced: true }),
  'frost-hound': rule('dm', ['death-move'], { advanced: true, requires: 'syns-heart' }),
  recuperation: rule('dm', ['death-move'], { advanced: true }),
  'spirit-call': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'poison-cloud': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'rallying-call': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'horn', advanced: true }),
  'shape-shift': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'sure-edge': rule('mo', anytime, { advanced: true }),
  'tactical-manoeuvres': rule('co', heroDamage, { enemyWon: true, avoidDamage: true, advanced: true }),
  'blind-strike': rule('co', ['speed', 'speed-rolled', 'damage', 'end'], { hit: 'one', dice: 2, advanced: true, currentTarget: true }),
  'take-the-bait': rule('co', ['damage'], { heroWon: true, requires: 'grapple', abilityRoll: true }),
  'warg-strike': rule('co', ['damage'], { heroWon: true, abilityRoll: true }),
  'chaotic-catalyst': rule('co', ['damage'], { heroWon: true, abilityRoll: true }),
  'pick-n-mix': rule('mo', anytime, { abilityRoll: true, backpack: true, perItem: true }),
  'spirit-breaker': rule('co', ['damage'], { heroWon: true, replacement: true, hit: 'one', dice: 3, armourLoss: 2, priorBait: true }),
  'power-totem': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'totem', advanced: true }),
  'totem-blast': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'totem', hit: 'all', dice: 2, shared: true, advanced: true, limit: null }),
  'creeping-cold': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'sound-the-charge': rule('sp', ['speed'], { speedDie: true, requires: 'horn', advanced: true }),
  'upper-hand': rule('dm', ['death-move'], { advanced: true }),
  gouge: rule('co', anytime, { advanced: true }),
  vortex: rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'dry-ice': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'crystal-armour': rule('mo', ['damage'], { heroWon: true, replacement: true, requires: 'syns-heart', advanced: true }),
  hooked: rule('mo', ['speed-rolled'], { advanced: true }),
  'silver-frost': rule('mo', ['speed-rolled'], { advanced: true }),
  torrent: rule('mo', anytime, { advanced: true }),
  'veiled-strike': rule('pa', anytime, { advanced: true, limit: null }),
  cure: rule('-', anytime, { backpack: true, perItem: true }),
};
for (const name of ['first-blood', 'first-cut', 'best-laid-plans', 'sweet-spot', 'armour-plating', 'ice-mantle']) {
  definitions[name] = rule('pa', ['start'], { opening: true });
}
for (const name of ['blind', 'curse', 'immobilise', 'knockdown', 'shackles', 'webbed', 'windblast']) {
  definitions[name] = rule('sp', ['speed'], { fewerOpponentDice: true });
}
for (const name of ['barbs', 'decay', 'thorns', 'bleed', 'disease', 'blood-frenzy', 'mangle',
  'ice-edge', 'lightning', 'siphon', 'salvation', 'heart-steal', 'anguish', 'weaver', 'wind-chill',
  'venom', 'brittle-edge', 'exploit', 'malefic-runes', 'gambit', 'getaway', 'necrosis',
  'ice-hooks', 'insulated', 'persuade']) definitions[name] = rule('pa', []);
export const DESTINY_ABILITIES = Object.freeze(definitions);

function draw(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
  return value;
}

export function configureDestinyAbilities(fight, inventory, equipment = {}, options = {}) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' || fight.character || Object.keys(fight.used).length ||
      !inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new RangeError('Configure abilities before combat');
  const next = structuredClone(fight);
  Object.assign(next, destinyBookOptionSnapshot(options));
  const catalog = next.abilityCatalog ?? DESTINY_ABILITIES;
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) throw new RangeError('Invalid equipment');
  next.equipment = {};
  for (const slot of ['mainHand', 'leftHand', 'transport', 'feet', 'head', 'chest', 'cloak', 'gloves', 'talisman', 'necklace', 'ring1', 'ring2']) {
    if (!equipment[slot]) continue;
    const item = equipment[slot];
    if (typeof item !== 'object' || Array.isArray(item)) throw new RangeError('Invalid equipment');
    next.equipment[slot] = { type: String(item.type || ''), id: String(item.id || '') };
    if(item.hand!==undefined){
      if(!destinyCanEquipItem(inventory,catalog,item,slot))throw new RangeError('Cannot equip this item in that hand');
      next.equipment[slot].hand=item.hand;
    }
    if (item.abilities !== undefined && (!Array.isArray(item.abilities) || item.abilities.some(name => typeof name !== 'string' || !Object.hasOwn(catalog, name)))) throw new RangeError('Invalid item abilities');
    next.equipment[slot].abilities = [...new Set(item.abilities || [])];
    for (const stat of ['brawn', 'speed', 'magic', 'armour', 'health', 'toughness', 'stability']) {
      const value = item[stat] ?? 0;
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new RangeError('Invalid equipment attribute');
      next.equipment[slot][stat] = value;
    }
  }
  next.abilities = {};
  for (const [name, count] of Object.entries(inventory)) {
    if (!Object.hasOwn(catalog, name) || !Number.isInteger(count) || count < 1 || count > 100 ||
        catalog[name].category === 'dm' && !destinyDeathMovesEnabled(next)) {
      throw new RangeError('Invalid ability inventory');
    }
    next.abilities[name] = count;
  }
  return next;
}

function dieIndex(values, index) {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) throw new RangeError('Choose a die');
  return index;
}

export const destinyAbilitySpec = (fight, name) => fight.encounter?.grantedAbilities?.[name]?.spec ??
  (fight.abilityCatalog ?? DESTINY_ABILITIES)[name];

export function useDestinyBackpackItem(fight,index,roll=()=>Math.floor(Math.random()*6)+1){
  if(fight?.status!=='active'||fight.encounter?.disableBackpack||!fight.turn||fight.turn.used.backpack||!anytime.includes(fight.phase))throw new RangeError('A backpack item is unavailable this round');
  const item=fight.character?.backpack?.[index];
  if(!Number.isInteger(index)||index<0||!item||!Number.isSafeInteger(item.quantity??1)||(item.quantity??1)<1)throw new RangeError('Choose an available backpack item');
  const next=applyDestinyPotionEffect(fight,item,roll);
  const remaining=(item.quantity??1)-1;
  if(remaining)next.character.backpack[index].quantity=remaining;else next.character.backpack.splice(index,1);
  return next;
}

// Potion-effect counters are simulator modifiers, not an item inventory. The
// universal inventory and equipment are never read, replaced or consumed here.
export function useDestinyPotionModifier(fight,attribute,roll=()=>Math.floor(Math.random()*6)+1){
  if(!['health','speed','brawn','magic','armour'].includes(attribute))throw new RangeError('Choose a potion effect');
  if(fight?.status!=='active'||fight.encounter?.disableBackpack||!fight.turn||fight.turn.used.backpack||!anytime.includes(fight.phase))throw new RangeError('A potion is unavailable this round');
  const modifier=fight.character?.potionModifiers?.[attribute];
  if(!modifier||!Number.isSafeInteger(modifier.uses)||modifier.uses<1)throw new RangeError('No uses of this potion remain');
  const item={name:attribute+' potion',duration:modifier.duration,
    ...(attribute==='health'?{heal:modifier.amount}:{stats:{[attribute]:modifier.amount}})};
  const next=applyDestinyPotionEffect(fight,item,roll);
  next.character.potionModifiers[attribute].uses--;
  return next;
}

function applyDestinyPotionEffect(fight,item,roll){
  const stats=item.stats||{},health=item.heal||0,duration=item.duration===undefined?1:item.duration;
  if((duration!==null&&(!Number.isSafeInteger(duration)||duration<1||duration>100))||!Number.isSafeInteger(health)||health<0||health>1000000||
    Object.entries(stats).some(([key,value])=>!['speed','brawn','magic','armour'].includes(key)||!Number.isSafeInteger(value)||value<0||value>1000000)||(!health&&!Object.values(stats).some(value=>value>0)))throw new RangeError('Invalid backpack item effects');
  const next=structuredClone(fight);
  for(const [attribute,base] of Object.entries(stats)){
    let value=base;
    if(attribute==='magic'&&base>0)for(const[name,spec]of Object.entries(next.abilityCatalog||{}))if(spec.backpackMagicBonusDice&&hasDestinyAbility(next,name))for(let i=0;i<spec.backpackMagicBonusDice;i++)value+=applyDestinyHeroRoll(next,[draw(roll)],'potion')[0];
    addDestinyStatEffect(next,'hero',attribute,value,duration,'backpack');
  }
  if(health)healDestinyHero(next,health);
  next.turn.used.backpack=true;
  next.history.push({type:'backpack',round:next.round,name:String(item.name||'Backpack item')});
  return next;
}

export function useDestinyAbility(fight, name, options = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  const spec = destinyAbilitySpec(fight, name);
  if (spec?.opening) return useDestinyOpening(fight, name, options, roll, spec);
  if (!spec || fight?.status !== 'active' || !fight.turn || !hasDestinyAbility(fight, name) || !spec.phases.includes(fight.phase)) {
    throw new RangeError('Ability unavailable at this combat stage');
  }
  const interception = fight.encounter?.abilityInterception;
  if (fight.turn.pendingAbility?.type === 'ability-interception' && interception?.categories.includes(spec.category)) {
    throw new RangeError('Resolve the ability interception first');
  }
  if (fight.turn.used[spec.category]) throw new RangeError('Only one ability of this category per round');
  if(fight.turn.blockedAbilities?.includes(name))throw new RangeError('This ability cannot avoid this attack');
  if(spec.speedDie&&fight.turn.heroSpeedDiceLocked)throw new RangeError('Abilities cannot change the Speed dice count this round');
  if (spec.category === 'sp' && fight.effects.some(effect => effect.lockSpeedAbilities && fight.round >= effect.from && fight.round <= effect.until)) throw new RangeError('The current speed ability has not faded');
  if (fight.turn.rerollsLocked && fight.phase === 'speed-rolled' && spec.reroll) throw new RangeError('Rerolls cannot alter this round');
  if ((spec.fewerOpponentDice || spec.opponentSpeedDiceReduction) && fight.encounter?.speedDiceReductionImmune?.includes(destinyAttackerTarget(fight))) throw new RangeError('This opponent is immune to reducing speed dice');
  const blocked = fight.encounter?.blockedRounds;
  if (blocked && fight.round >= blocked.from && fight.round <= blocked.until && blocked.categories.includes(spec.category)) throw new RangeError('This ability type is blocked this round');
  if (fight.encounter?.blockAbilitiesWhileAlive?.some(rule => rule.categories.includes(spec.category) && isDestinyOpponentActive(fight, rule.target))) throw new RangeError('Defeat the opponent blocking this ability type');
  if (spec.firstRound && fight.round !== 1) throw new RangeError('Ability requires the first combat round');
  if (spec.heroWon && fight.turn.winner !== 'hero' && !(fight.phase === 'ability-rolled' && fight.turn.pendingAbility.type === 'damage')) throw new RangeError('Win the round first');
  if (spec.enemyWon && fight.turn.winner !== 'opponent') throw new RangeError('Opponent must win the round');
  if ((!spec.hit||spec.hit==='one')&&fight.encounter?.abilityImmunityByTarget?.[options.target??fight.target]?.includes(name)) throw new RangeError('This opponent is immune to that ability');
  if (spec.attackInterruption && fight.phase === 'ability-rolled' && !fight.turn.pendingAbility.event?.attackChoice) throw new RangeError('The attack choice has already resolved');
  if (spec.afterHit && (fight.turn.winner !== 'hero' || !fight.turn.healthDamage)) throw new RangeError('Cause health damage with a damage score first');
  if (spec.afterEnemyHit && (fight.turn.winner !== 'opponent' || !fight.turn.healthDamage)) throw new RangeError('Take health damage from the opponent first');
  if (fight.bearForm && spec.category === 'co') throw new RangeError('Combat abilities are unavailable in bear form');
  if (spec.requires && ![fight.equipment?.leftHand?.id, fight.equipment?.leftHand?.type].includes(spec.requires)) throw new RangeError('Required left-hand equipment is missing');
  if (spec.requiresDamageRoll && fight.phase === 'ability-rolled' && fight.turn.pendingAbility.type !== 'damage' && !fight.turn.pendingAbility.event?.damageDice) throw new RangeError('Requires damage dice');
  if (spec.priorBait && !(fight.takeBaitSucceededRound > 0 && fight.takeBaitSucceededRound < fight.round)) throw new RangeError('Grapple successfully in an earlier round first');
  if (spec.backpack && fight.turn.used.backpack) throw new RangeError('Only one backpack item per round');
  if (spec.abilityRoll && fight.phase === 'ability-rolled') throw new RangeError('Resolve the pending roll first');
  const limit = spec.perItem ? fight.abilities[name] : spec.limit === null ? Infinity :
    spec.limit || ((name === 'curse' || name === 'fear') && hasDestinyAbility(fight, 'anguish') ? 2 : 1);
  if ((fight.used[name] || 0) >= limit && !(spec.chargeDice && fight.chargedAttacks?.[name])) throw new RangeError('Ability has no uses left');
  // Sacrifices are paid while alive. They cannot be used to heal back from zero.
  if (spec.sacrifice && fight.hero.health < spec.sacrifice) throw new RangeError('Not enough health to sacrifice');
  if (spec.category === 'sp' && destinyPenaltyApplies(fight, 'head-blow')) {
    if (fight.turn.passedSpeedAbility && fight.turn.passedSpeedAbility !== name) throw new RangeError('Finish the checked speed ability first');
    if (fight.turn.passedSpeedAbility !== name) {
      const next = structuredClone(fight);
      next.turn.pendingAbility = { type: 'test', name: 'head-blow', dice: [draw(roll)], returnPhase: next.phase,
        options: { ability: name, abilityOptions: structuredClone(options) } };
      next.phase = 'ability-rolled';
      return next;
    }
  }
  if (interception?.categories.includes(spec.category) && isDestinyOpponentActive(fight, interception.target) && fight.turn.passedEncounterAbility !== name) {
    const checkedOptions = spec.category === 'sp' && fight.turn.passedSpeedOptions ? fight.turn.passedSpeedOptions : options;
    const target = spec.enemy ? checkedOptions.target ?? (spec.category === 'sp' ? destinyAttackerTarget(fight) : fight.target) : 'hero';
    if (spec.enemy && (!Number.isInteger(target) || !isDestinyOpponentActive(fight, target))) throw new RangeError('Choose a living opponent');
    const next = structuredClone(fight);
    next.turn.pendingAbility = { type: 'ability-interception', name: interception.name, rule: structuredClone(interception),
      ability: name, abilityOptions: structuredClone(checkedOptions), returnPhase: fight.phase,
      suspendedAbility: fight.turn.pendingAbility ? structuredClone(fight.turn.pendingAbility) : null,
      dice: Array.from({ length: interception.dice }, () => draw(roll)) };
    next.phase = 'ability-rolled';
    return next;
  }
  if (spec.chooseAttribute && !spec.chooseAttribute.includes(options.attribute)) throw new RangeError('Choose an allowed attribute');
  const next = structuredClone(fight);
  delete next.turn.passedEncounterAbility;
  const heroSpeedRolls = [];
  if (spec.category === 'sp') {
    next.turn.playedSpeedAbility = true;
    if (next.turn.passedSpeedOptions) options = next.turn.passedSpeedOptions;
    delete next.turn.passedSpeedAbility;
    delete next.turn.passedSpeedOptions;
  }
  const target = spec.enemy ? options.target ?? (spec.category === 'sp' ? destinyAttackerTarget(next) : next.target) : 'hero';
  if (spec.enemy && (!Number.isInteger(target) || target < 0 || !isDestinyOpponentActive(next, target))) throw new RangeError('Choose a living opponent');
  if (spec.sacrifice) next.hero.health -= spec.sacrifice;
  if (name === 'cure') {
    if (!next.character) throw new RangeError('Attach the character before using Cure');
    next.character = cureDestinyCharacter(next.character);
  }
  if (spec.backpack) next.turn.used.backpack = true;
  const duration = spec.duration === undefined ? 1 : spec.duration;
  if (spec.chooseAttribute && !spec.matchOpponent) addDestinyStatEffect(next, 'hero', options.attribute, spec.amount, duration, name);
  if (spec.matchOpponent) {
    const attribute = options.attribute ?? spec.matchAttribute;
    const opponent = destinyAttackerTarget(next);
    const value = destinyStat(next, opponent, attribute);
    if (value < destinyStat(next, 'hero', attribute)) throw new RangeError('This ability can only raise an attribute');
    next.effects.push({kind:'stat',target:'hero',attribute,set:value,from:next.round,until:next.round+duration-1,source:name,lockSpeedAbilities:!!spec.lockSpeedAbilities});
  }
  if (spec.rollStat) addDestinyStatEffect(next,'hero',spec.rollStat,applyDestinyHeroRoll(next,[draw(roll)],spec.rollStat)[0],duration,name);
  if (spec.multiplyStat) addDestinyStatEffect(next,'hero',spec.multiplyStat,destinyStat(next,'hero',spec.multiplyStat)*(spec.multiplier-1),duration,name);
  if (spec.spendStat) {
    const amount=options.amount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > spec.maxSpend || amount > destinyStat(next,'hero',spec.spendStat)) throw new RangeError('Choose an available amount to spend');
    addDestinyStatEffect(next,'hero',spec.spendStat,-amount,null,name);
    next.turn.damageScoreBonus=(next.turn.damageScoreBonus||0)+amount;
  }
  if (spec.healLastHitDivisor) {
    const lost=next.turn.lastHeroDamage?.[options.target ?? next.target];
    if (!(lost>0)) throw new RangeError('Cause health damage first');
    healDestinyHero(next,Math.ceil(lost/spec.healLastHitDivisor));
  }
  if (spec.replaceIncomingDamage !== undefined) next.turn.replaceIncomingDamage=spec.replaceIncomingDamage;
  if (spec.speedFace) next.turn.speedFace={...spec.speedFace};
  if (spec.opponentDieReduction) next.effects.push({kind:'opponent-die-reduction',amount:spec.opponentDieReduction,from:next.round,until:Number.MAX_SAFE_INTEGER,source:name});
  if (spec.attribute) addDestinyStatEffect(next, target, spec.attribute, spec.amount, duration, name);
  for (const change of spec.statChanges || []) {
    const actor = target === 'hero' ? next.hero : next.opponents[target];
    if (actor[change.attribute] !== null) addDestinyStatEffect(next, target, change.attribute, change.amount,
      change.duration === undefined ? duration : change.duration, name, change.delay || 0);
  }
  if (spec.heal) healDestinyHero(next, spec.heal + (hasDestinyAbility(next, 'salvation') ? 1 : 0));
  if (spec.cleanse) {
    next.effects = next.effects.filter(effect => effect.target !== 'hero' || !spec.cleanse.includes(effect.status || effect.kind));
    if (next.encounter?.heroStatuses) for (const status of spec.cleanse) delete next.encounter.heroStatuses[status];
    if (spec.cleanse.includes(next.encounter?.growingStatus?.status || next.encounter?.growingStatus?.name)) delete next.encounter.growingStatus;
  }
  if (spec.speedDie) next.turn.heroSpeedCount = (next.turn.heroSpeedCount || 2) + 1;
  if (name === 'reckless') next.turn.reckless = true;
  if (spec.fewerOpponentDice) next.turn.opponentSpeedCount = 1;
  if (spec.opponentSpeedDiceReduction) next.turn.opponentSpeedReduction = spec.opponentSpeedDiceReduction;
  if (spec.damageDie) {
    if (next.phase === 'damage-rolled') {
      const face=applyDestinyHeroRoll(next,[draw(roll)],'damage')[0];next.turn.damageDice.push(face,...destinyScoreExtraDice(next,[face],roll));
      onDestinyHeroDice(next,next.turn.damageDice);
    }
    else next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
  }
  if (spec.scoreBonus) next.turn.damageScoreBonus = (next.turn.damageScoreBonus || 0) + spec.scoreBonus;
  if (spec.scoreEquipmentSpeed) next.turn.damageScoreBonus = (next.turn.damageScoreBonus || 0) +
    (next.equipment?.mainHand?.speed || 0) + (next.equipment?.leftHand?.speed || 0);
  if (spec.scoreEffect) next.effects.push({ kind: 'score-flat', amount: spec.scoreEffect,
    hero: spec.scoreHero, from: next.round, until: next.round, source: name });
  if (spec.scorePerDie) next.effects.push({ kind: 'score-per-die', amount: spec.scorePerDie,
    from: next.round, until: spec.duration ? next.round + spec.duration - 1 : Number.MAX_SAFE_INTEGER, source: name });
  if (name === 'bloody-maiden') next.effects[next.effects.length - 1].kind = 'damage-per-die';
  if (spec.ignoreArmour) next.turn.ignoreArmour = true;
  if (spec.halfArmour) next.turn.halfArmour = true;
  if (spec.avoidDamage) next.turn.avoidDamage = true;
  if (spec.reverse) {
    next.turn.winner = 'hero';
    delete next.turn.enemyFixedDamage;delete next.turn.pendingEnemyCharge;delete next.turn.blockedAbilities;
    if (next.phase === 'ability-rolled') { delete next.turn.pendingAbility; next.phase = 'damage'; }
    onDestinyHeroRoundWon(next,roll);
  }
  if (spec.freeze) next.effects.push({ kind: 'freeze', from: next.round, until: next.round + 1, source: name });
  const action = spec.dieAction;
  let pendingGroup;
  if (next.phase === 'ability-rolled' && next.turn.pendingAbility.type === 'damage') {
    const groupIndex = options.group ?? 0;
    dieIndex(next.turn.pendingAbility.groups, groupIndex);
    pendingGroup = next.turn.pendingAbility.groups[groupIndex];
  }
  if (next.phase === 'ability-rolled' && next.turn.pendingAbility.event?.damageDice) {
    pendingGroup = { dice: next.turn.pendingAbility.dice, bonuses: next.turn.pendingAbility.bonuses };
  }
  if (action) {
    if (action === 'critical') {
      const values = pendingGroup?.dice || next.turn.damageDice;
      if (!pendingGroup && values.every((_, index) => destinyDieLocked(next, 'hero', 'damage', index))) throw new RangeError('Saved dice cannot be changed');
      values.forEach((_, index) => { if (pendingGroup || !destinyDieLocked(next, 'hero', 'damage', index)) values[index] = 6; });
    }
    else {
      if (action === 'watchful' && next.phase === 'ability-rolled' && next.turn.pendingAbility.event?.owner !== 'opponent') throw new RangeError('Choose an opponent die');
      const heroSpeed = action === 'agility';
      const enemySpeed = action === 'sneak' || action === 'watchful' && next.phase === 'speed-rolled';
      const values = heroSpeed ? next.turn.heroSpeedDice : enemySpeed ? next.turn.opponentSpeedDice : pendingGroup?.dice || next.turn.damageDice;
      const index = dieIndex(values, options.die);
      const owner = enemySpeed || ['protection', 'watchful'].includes(action) ? 'opponent' : 'hero';
      const kind = heroSpeed || enemySpeed ? 'speed' : 'damage';
      if (!pendingGroup && destinyDieLocked(next, owner, kind, index)) throw new RangeError('Saved dice cannot be changed');
      if (action === 'agility' && values[index] !== 1) throw new RangeError('Choose a one');
      if (['protection', 'watchful'].includes(action) && values[index] !== 6) throw new RangeError('Choose a six');
      if (action === 'watchful' && next.phase === 'damage-rolled' && next.turn.winner !== 'opponent') throw new RangeError('Choose an opponent die');
      values[index] = action === 'agility' || action === 'dominate' ? 6 : 1;
    }
  }
  if (spec.reroll) {
    const mode = spec.reroll;
    if (mode === 'opponent-all') {
      if (next.phase === 'speed-rolled') {
        if (next.turn.lockedOpponentDice || next.turn.rerollsLocked) throw new RangeError('Saved dice cannot be rerolled');
        next.turn.opponentSpeedDice=destinyRollOpponentDice(next,next.turn.opponentSpeedDice.length,roll,'speed');
      } else {
        if (next.turn.winner !== 'opponent') throw new RangeError('Choose an opponent roll');
        if (next.turn.damageDice.some((_,index)=>destinyDieLocked(next,'opponent','damage',index))) throw new RangeError('Saved dice cannot be rerolled');
        next.turn.damageDice=destinyRollOpponentDice(next,next.turn.damageDice.length,roll,'damage');
      }
    }
    if (mode === 'both-speed' || mode === 'opponent-speed') {
      if (next.turn.lockedOpponentDice && mode === 'opponent-speed') throw new RangeError('Frozen dice cannot be rerolled');
      if (!next.turn.lockedOpponentDice) {
        next.turn.opponentSpeedDice = destinyRollOpponentDice(next, next.turn.opponentSpeedDice.length, roll, 'speed');
      }
    }
    if (mode === 'both-speed') next.turn.heroSpeedDice = next.turn.heroSpeedDice.map((value, index) => {
      if (destinyDieLocked(next, 'hero', 'speed', index)) return value;
      heroSpeedRolls.push(index);
      return draw(roll);
    });
    if (mode === 'hero-speed') {
      if (!Array.isArray(options.dice) || !options.dice.length || new Set(options.dice).size !== options.dice.length) throw new RangeError('Choose dice to reroll');
      for (const index of options.dice) {
        dieIndex(next.turn.heroSpeedDice, index);
        if (destinyDieLocked(next, 'hero', 'speed', index)) throw new RangeError('Saved dice cannot be rerolled');
        next.turn.heroSpeedDice[index] = draw(roll);
        heroSpeedRolls.push(index);
      }
    }
    if (mode === 'hero-die' || mode === 'damage-plus-two') {
      if (mode === 'hero-die' && next.phase === 'ability-rolled' && next.turn.pendingAbility.event?.owner === 'opponent') throw new RangeError('Choose a hero die');
      if (mode === 'hero-die' && next.phase === 'damage-rolled' && next.turn.winner !== 'hero') throw new RangeError('Choose a hero die');
      const values = next.phase === 'speed-rolled' ? next.turn.heroSpeedDice : next.phase === 'ability-rolled' ?
        pendingGroup?.dice || next.turn.pendingAbility.dice : next.turn.damageDice;
      const index = dieIndex(values, options.die);
      if (next.phase !== 'ability-rolled' && destinyDieLocked(next, next.turn.winner === 'opponent' && next.phase === 'damage-rolled' ? 'opponent' : 'hero',
        next.phase === 'speed-rolled' ? 'speed' : 'damage', index)) throw new RangeError('Saved dice cannot be rerolled');
      values[index] = draw(roll);
      if(next.phase!=='speed-rolled')applyDestinyHeroRoll(next,values,'damage',[index]);
      if(next.phase==='damage-rolled'&&next.turn.winner==='hero'){
        values.push(...destinyScoreExtraDice(next,[values[index]],roll));onDestinyHeroDice(next,values);
      } else if(next.phase==='ability-rolled'&&pendingGroup)onDestinyHeroDice(next,values);
      if (next.phase === 'speed-rolled') heroSpeedRolls.push(index);
      if (mode === 'damage-plus-two') {
        const bonuses = pendingGroup ? pendingGroup.bonuses : (next.turn.damageDieBonuses ??= {});
        bonuses[index] = (bonuses[index] || 0) + 2;
      }
    }
  }
  const alive = () => next.opponents.map((opponent, index) => isDestinyOpponentActive(next, index) ? index : -1).filter(index => index >= 0);
  const chosen = options.target ?? next.target;
  if (spec.currentTarget && chosen !== next.target) throw new RangeError('This ability affects the current opponent');
  const requireLiving = index => {
    if (!Number.isInteger(index) || !isDestinyOpponentActive(next, index)) throw new RangeError('Choose a living opponent');
    return index;
  };
  if (spec.advanced) applyDestinyAdvancedAbility(next, name, options, roll);
  applyDestinyCatalogAction(next,name,spec,options,roll);
  if (spec.regain) {
    const restored = options.restore;
    if (!destinyAbilitySpec(next, restored) || !hasDestinyAbility(next, restored) ||
        !spec.regain.includes(destinyAbilitySpec(next, restored).category) || !(next.used[restored] > 0)) {
      throw new RangeError('Choose an already used ability of the required type');
    }
    next.used[restored]--;
  }
  if (spec.hit) {
    prepareDestinyDamage(next, name, spec, options, roll);
  }
  if (spec.execute) for (const index of alive()) {
    if (next.opponents[index].health <= spec.execute) destinyStrike(next, index, next.opponents[index].health, name);
  }
  if (spec.afterHit) {
    const index = requireLiving(next.target);
    if (spec.armourLoss) addDestinyStatEffect(next, index, 'armour', -spec.armourLoss, null, name);
    if (spec.weaken) {
      const attribute = options.attribute ?? next.opponents[index].damageStat;
      if (!['brawn', 'magic'].includes(attribute)) throw new RangeError('Choose brawn or magic');
      addDestinyStatEffect(next, index, attribute, -spec.weaken, null, name);
    }
    if (spec.frostbite) addDestinyStatEffect(next, index, 'speed', -1, 2, name, 1);
    for (const change of spec.afterHitStats || []) {
      addDestinyStatEffect(next, index, change.attribute, change.amount, change.duration, name, change.delay || 0);
    }
    if (spec.shatter) {
      if (!['armour-minus-two', 'armour-zero-next-round'].includes(options.variant)) throw new RangeError('Choose the printed Shatter variant');
      if (options.variant === 'armour-minus-two') addDestinyStatEffect(next, index, 'armour', -2, null, name);
      else next.effects.push({ kind: 'stat', target: index, attribute: 'armour', set: 0,
        from: next.round + 1, until: next.round + 1, source: name });
    }
  }
  if (spec.permanentBrawn) addDestinyStatEffect(next, 'hero', 'brawn', spec.permanentBrawn, null, name);
  if (spec.arcaneFeast) {
    requireLiving(chosen);
    addDestinyStatEffect(next, chosen, 'magic', -2, null, name);
    addDestinyStatEffect(next, 'hero', 'magic', 2, null, name);
  }
  if (spec.phantom) next.phantomHealth = 8;
  if (spec.replacement && next.phase !== 'ability-rolled') {
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  }
  if (spec.abilityRoll) {
    const returnPhase = next.phase;
    prepareDestinyAbilityRoll(next, name, options, roll);
    next.turn.pendingAbility.returnPhase = returnPhase;
    if (spec.backpack) next.turn.used.backpack = true;
  }
  next.used[name] = (next.used[name] || 0) + 1;
  if (['sp', 'co', 'dm'].includes(spec.category)) next.turn.used[spec.category] = true;
  if (spec.fewerOpponentDice || spec.opponentSpeedDiceReduction) next.turn.controlledOpponent = destinyAttackerTarget(next);
  if (['evade', 'sidestep', 'vanish'].includes(name) && hasDestinyAbility(next, 'veiled-strike')) next.turn.veiledStrikeAvailable = true;
  if (spec.category === 'co' && hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  if (spec.category === 'sp' && hasDestinyAbility(next, 'wind-chill')) {
    for (const index of alive()) destinyStrike(next, index, 2, 'wind-chill', 'passive');
  }
  if (['piercing', 'deep-wound'].includes(name) && hasDestinyAbility(next, 'heart-steal')) {
    if (next.phase === 'damage-rolled') next.turn.damageDice.push(draw(roll));
    else next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
  }
  next.history.push({ type: 'ability', round: next.round, name, target });
  if (name === 'ice-slick') heroSpeedRolls.push(next.turn.heroSpeedDice.length - 1);
  onDestinyHeroSpeedRoll(next, heroSpeedRolls, roll);
  if (['speed-rolled', 'damage', 'damage-rolled'].includes(next.phase) && !isDestinyOpponentActive(next, next.target)) next.phase = 'end';
  if (spec.category === 'dm' && next.phase !== 'ability-rolled') next.phase = next.turn.afterDeathMove;
  else if (destinyDeathMovesEnabled(next) && next.phase === 'end' && !next.turn.pendingPassiveDeath && next.turn.deaths.length > next.turn.deathMoveDeathsSeen) {
    next.phase = 'death-move';
    next.turn.afterDeathMove = 'end';
  }
  if (spec.category === 'dm' && hasDestinyAbility(next, 'gambit') && next.hero.health > 0 && alive().length) {
    next.turn.pendingAbility = { type: 'test', name: 'gambit', dice: [draw(roll)], returnPhase: next.phase,
      suspendedAbility: next.turn.pendingAbility || null, options: {} };
    next.phase = 'ability-rolled';
  }
  if(spec.cancelCounterstrike||spec.cancelIncoming||spec.reflectIncoming)return finishDestinyAbilityAction(next,roll);
  settleDestinyFight(next, roll);
  return next;
}

// Called only with the copy owned by resolveDestinyAbilityRoll.
export function applyDestinyAbilityInterception(next, pending, roll) {
  const name = pending.ability, spec = destinyAbilitySpec(next, name);
  if (!spec) throw new RangeError('Unknown checked ability');
  const result = pending.dice.reduce((total, value) => total + value, 0);
  next.history.push({ type: 'ability-interception', round: next.round, name, test: pending.name, dice: [...pending.dice], result });
  next.phase = pending.returnPhase;
  if (pending.suspendedAbility) next.turn.pendingAbility = pending.suspendedAbility;
  if (result > pending.rule.cancelMaximum) {
    next.turn.passedEncounterAbility = name;
    return finishDestinyAbilityAction(useDestinyAbility(next, name, pending.abilityOptions, roll), roll);
  }
  if (pending.rule.disableOnCancel) (next.encounter.cancelledAbilities ??= []).push(name);
  next.used[name] = (next.used[name] || 0) + 1;
  if (['sp', 'co', 'dm'].includes(spec.category)) next.turn.used[spec.category] = true;
  if (spec.backpack) next.turn.used.backpack = true;
  if (spec.category === 'sp') {
    next.turn.playedSpeedAbility = true;
    delete next.turn.passedSpeedAbility;
    delete next.turn.passedSpeedOptions;
  }
  if (spec.sacrifice) next.hero.health = Math.max(0, next.hero.health - spec.sacrifice);
  observeDestinyHealth(next);
  if (spec.category === 'co' && hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  if (spec.category === 'sp' && hasDestinyAbility(next, 'wind-chill')) {
    next.opponents.forEach((opponent, target) => { if (isDestinyOpponentActive(next, target)) destinyStrike(next, target, 2, 'wind-chill', 'passive'); });
  }
  next.history.push({ type: 'ability', round: next.round, name, target: spec.enemy ? pending.abilityOptions.target ?? destinyAttackerTarget(next) : 'hero', ignored: true });
  if (pending.rule.onCancel && next.hero.health > 0) queueDestinyEncounterEvent(next, pending.rule.onCancel, next.phase, roll);
  return finishDestinyAbilityAction(next, roll);
}

export function resolveDestinyGambit(fight, name) {
  if (fight?.status !== 'active' || fight.phase !== 'ability-choice' || fight.turn.pendingAbility?.name !== 'gambit-restore') throw new RangeError('No Gambit choice pending');
  const next = structuredClone(fight);
  const pending = next.turn.pendingAbility;
  if (name !== null) {
    if (!destinyAbilitySpec(next, name) || !['sp', 'mo'].includes(destinyAbilitySpec(next, name).category) || !hasDestinyAbility(next, name) || !(next.used[name] > 0)) throw new RangeError('Choose a used speed or modifier ability');
    next.used[name]--;
  }
  if (pending.suspendedAbility) { next.turn.pendingAbility = pending.suspendedAbility; next.phase = 'ability-rolled'; }
  else { delete next.turn.pendingAbility; next.phase = pending.returnPhase; }
  return next;
}

export function destinyUnusedAbilities(fight) {
  return Object.keys(fight.abilities || {}).filter(name => {
    const spec = destinyAbilitySpec(fight, name);
    // Always-on passives are already in use; per-item actions may still have an unused copy.
    return spec?.phases.length && hasDestinyAbility(fight, name) && (fight.used[name] || 0) < (spec.perItem ? fight.abilities[name] : 1);
  });
}

export function resolveDestinyAbilitySacrifice(fight, name = null, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active' || fight.phase !== 'ability-choice' || fight.turn.pendingAbility?.type !== 'ability-sacrifice') {
    throw new RangeError('No ability sacrifice choice pending');
  }
  if (name !== null && !destinyUnusedAbilities(fight).includes(name)) throw new RangeError('Choose an unused ability');
  const next = structuredClone(fight), pending = next.turn.pendingAbility;
  let damage = 0;
  if (name === null) {
    damage = Math.min(next.hero.health, pending.event.damageOnDecline);
    next.hero.health -= damage;
    observeDestinyHealth(next);
  } else (next.encounter.sacrificedAbilities ??= []).push(name);
  next.history.push({ type: 'ability-sacrifice', round: next.round, name, damage });
  delete next.turn.pendingAbility;
  next.phase = pending.returnPhase;
  return finishDestinyAbilityAction(next, roll);
}

export function resolveDestinyDefeatChoice(fight, target, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active' || fight.phase !== 'ability-choice' || fight.turn?.pendingAbility?.type !== 'defeat-choice') throw new RangeError('No opponent defeat choice pending');
  const pending = fight.turn.pendingAbility;
  if (!Number.isInteger(target) || !fight.encounter.opponentGroups?.[pending.event.group]?.includes(target) || !isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living member of this group');
  const next = structuredClone(fight);
  delete next.turn.pendingAbility;
  next.phase = pending.returnPhase;
  destinyStrike(next, target, next.opponents[target].health, pending.name);
  next.history.push({ type: 'defeat-choice', name: pending.name, round: next.round, target });
  return finishDestinyAbilityAction(next, roll);
}

export function resolveDestinyDamageChoice(fight,target,roll=()=>Math.floor(Math.random()*6)+1){
  if(fight?.status!=='active'||fight.phase!=='ability-choice'||fight.turn?.pendingAbility?.type!=='damage-choice')throw new RangeError('No damage target choice pending');
  if(!Number.isInteger(target)||!isDestinyOpponentActive(fight,target))throw new RangeError('Choose a living opponent');
  const next=structuredClone(fight),pending=next.turn.pendingAbility;
  delete next.turn.pendingAbility;next.phase=pending.returnPhase;
  destinyStrike(next,target,pending.event.amount,pending.name,'passive');
  return finishDestinyAbilityAction(next,roll);
}

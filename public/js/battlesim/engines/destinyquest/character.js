import { destinyDie } from './damage.js';
import {hasDestinyAbility} from './effects.js';

export const DESTINY_PENALTIES = Object.freeze({
  1: 'weeping-wounds', 2: 'crippled', 3: 'head-blow',
  4: 'fingerless', 5: 'nervous-twitch', 6: 'chronic-convulsions',
});
const persistent = Object.values(DESTINY_PENALTIES).filter(name => name !== 'fingerless');

export function createDestinyCharacter(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid character');
  const next = structuredClone(input);
  next.defeats ??= 0;
  if (!Number.isSafeInteger(next.defeats) || next.defeats < 0 || next.defeats > 1000000) throw new RangeError('Invalid defeat count');
  next.nextPenaltyAt ??= (Math.floor(next.defeats / 5) + 1) * 5;
  if (!Number.isSafeInteger(next.nextPenaltyAt) || next.nextPenaltyAt <= next.defeats || next.nextPenaltyAt % 5) throw new RangeError('Invalid next penalty threshold');
  next.penalties ??= [];
  if (!Array.isArray(next.penalties) || new Set(next.penalties).size !== next.penalties.length ||
      next.penalties.some(name => !persistent.includes(name))) throw new RangeError('Invalid death penalties');
  next.outcomeIds ??= [];
  if (!Array.isArray(next.outcomeIds) || next.outcomeIds.some(id => typeof id !== 'string')) throw new RangeError('Invalid outcome history');
  return next;
}

export function cureDestinyCharacter(character) {
  const next = createDestinyCharacter(character);
  next.defeats = Math.max(0, next.defeats - 2);
  // Already assessed penalties remain assessed. Healing the tally must not
  // award the same five-defeat threshold again when the player reaches it.
  return next;
}

export function destinyCharacterAbilityCounts(character, inventory, equipment = {}) {
  if (!inventory) return inventory;
  const counts = structuredClone(inventory);
  for (const [penalty, slot] of [['crippled', 'feet'], ['nervous-twitch', 'mainHand']]) {
    if (!character.penalties.includes(penalty)) continue;
    for (const name of equipment[slot]?.abilities || []) if (counts[name]) counts[name]--;
  }
  return counts;
}

export function attachDestinyCharacter(fight, character, { deathPenalties = fight?.bookRules?.deathPenalties ?? true } = {}) {
  if (typeof deathPenalties !== 'boolean') throw new RangeError('Invalid death penalty rule');
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' || Object.keys(fight.used).length) throw new RangeError('Attach the character before combat');
  if (fight.character) throw new RangeError('Character already attached');
  const profile = createDestinyCharacter(character);
  if (deathPenalties && profile.pendingRingDestruction) throw new RangeError('Resolve the lost ring before another fight');
  const next = structuredClone(fight);
  if (next.bookRules || !deathPenalties) next.bookRules = { ...next.bookRules, deathPenalties };
  next.character = profile;
  if (deathPenalties && next.abilities) next.abilities = destinyCharacterAbilityCounts(profile, next.abilities, next.equipment);
  return next;
}

export function recordDestinyOutcome(character, fight, outcomeId, roll = () => Math.floor(Math.random() * 6) + 1,
  { deathPenalties = fight?.bookRules?.deathPenalties ?? true } = {}) {
  if (typeof deathPenalties !== 'boolean') throw new RangeError('Invalid death penalty rule');
  const next = createDestinyCharacter(character);
  if ((!['win', 'loss'].includes(fight?.status)&&!(fight?.status==='retreat'&&fight.encounter?.retreatSection)) || typeof outcomeId !== 'string' || !outcomeId || outcomeId.length > 128) throw new RangeError('A finished fight needs an outcome ID');
  if (next.outcomeIds.includes(outcomeId)) return { character: next, recorded: false, escaped: false, penalty: null };
  const receipt = { character: next, recorded: true, escaped: false, penalty: null };
  for(const reward of fight.encounter?.storyRewards||[]){
    const gold=next.gold??0;
    if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(reward.gold)||reward.gold<0||!Number.isSafeInteger(gold+reward.gold))throw new RangeError('Invalid story gold balance');
    next.gold=gold+reward.gold;
    (receipt.rewards??=[]).push({...structuredClone(reward),source:'encounter'});
  }
  if(fight.status==='win'){
    const rewardContext={...fight,encounter:{...fight.encounter,disableHeroAbilities:false}};
    for(const [name,spec] of Object.entries(fight.abilityCatalog||{})){
      const reward=spec.victoryReward;
      if(!reward||!hasDestinyAbility(rewardContext,name))continue;
      const dice=Array.from({length:reward.dice},()=>destinyDie(roll)),total=dice.reduce((sum,face)=>sum+face,0);
      const outcome=reward.goldFromDice?{gold:total}:reward.outcomes.find(outcome=>total<=outcome.maximum);
      if(!outcome)throw new RangeError('Unknown victory reward');
      if(outcome.gold){
        const gold=next.gold??0;
        if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(gold+outcome.gold))throw new RangeError('Invalid story gold balance');
        next.gold=gold+outcome.gold;
      }
      (receipt.rewards??=[]).push({ability:name,dice,gold:outcome.gold||0,...(outcome.item?{item:structuredClone(outcome.item)}:{})});
    }
    if(fight.team&&Number.isSafeInteger(fight.encounter?.sourceBookId)&&fight.encounter.sourceSection){
      const key=`${fight.encounter.sourceBookId}:${fight.encounter.sourceSection}`;
      next.teamVictories??=[];
      if(!Array.isArray(next.teamVictories)||next.teamVictories.some(key=>typeof key!=='string'))throw new RangeError('Invalid team victory history');
      receipt.teamLootEligible=!next.teamVictories.includes(key);
      if(receipt.teamLootEligible)next.teamVictories.push(key);
    }
  }
  if (fight.status === 'loss') {
    for(const flag of fight.encounter?.onDefeatCharacterFlags||[]){
      if(typeof flag!=='string'||!flag)throw new RangeError('Invalid encounter flag');
      (next.encounterFlags??={})[flag]=true;
    }
    if (!fight.encounter?.disableHeroAbilities && (fight.abilities?.getaway || 0) > 0) {
      receipt.getawayDie = destinyDie(roll);
      receipt.escaped = receipt.getawayDie >= 5;
    }
    if (!receipt.escaped) {
      next.defeats++;
      if (next.defeats >= next.nextPenaltyAt && deathPenalties) {
        let selected = null;
        for (let attempt = 0; attempt < 1000; attempt++) {
          const face = destinyDie(roll);
          const name = DESTINY_PENALTIES[face];
          if (next.penalties.includes(name)) continue;
          selected = name;
          receipt.penaltyDie = face;
          break;
        }
        if (!selected) throw new RangeError('No new penalty was rolled');
        if (selected === 'fingerless') next.pendingRingDestruction = true;
        else next.penalties.push(selected);
        receipt.penalty = selected;
      }
      // Keep the saved threshold valid even in books without death penalties.
      // Existing penalties and equipment remain untouched by that rule choice.
      if (next.defeats >= next.nextPenaltyAt) next.nextPenaltyAt += 5;
    }
  }
  next.outcomeIds.push(outcomeId);
  return receipt;
}

export function resolveDestinyRingLoss(character, slot) {
  const next = createDestinyCharacter(character);
  if (!next.pendingRingDestruction) throw new RangeError('No pending ring loss');
  const equipped = ['ring1', 'ring2'].filter(key => next.equipment?.[key]);
  if (equipped.length && !equipped.includes(slot)) throw new RangeError('Choose an equipped ring');
  if (!equipped.length && slot !== null) throw new RangeError('No ring is equipped');
  const removed = equipped.length ? next.equipment[slot] : null;
  if (removed) {
    next.equipment[slot] = null;
    for (const name of removed.abilities || []) if (next.abilities?.[name]) next.abilities[name]--;
    // Only this simulator's explicitly represented attributes are changed.
    // Free-form sheets and unrelated run data are never interpreted or reset.
    for (const attribute of ['speed', 'brawn', 'magic', 'armour', 'health']) {
      const amount = removed[attribute] ?? 0;
      if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid ring attributes');
      if (typeof next.attributes?.[attribute] === 'number') next.attributes[attribute] = Math.max(0, next.attributes[attribute] - amount);
      if (attribute === 'health' && typeof next.attributes?.maxHealth === 'number') next.attributes.maxHealth = Math.max(0, next.attributes.maxHealth - amount);
    }
  }
  delete next.pendingRingDestruction;
  return { character: next, removedRing: removed };
}

export function destinyVendorPrice(basePrice, { quantity = 1, persuade = false, trapperHide = false } = {}) {
  if (!Number.isSafeInteger(basePrice) || basePrice < 0 || !Number.isSafeInteger(quantity) || quantity < 1 ||
      typeof persuade !== 'boolean' || typeof trapperHide !== 'boolean') throw new RangeError('Invalid vendor sale');
  const total = (basePrice + (persuade ? 10 : 0) + (trapperHide ? 5 : 0)) * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError('Sale total is too large');
  return total;
}

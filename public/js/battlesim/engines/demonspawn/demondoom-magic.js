import { applyDemondoomSpellDamage } from './demondoom-rules.js';

export const DEMONDOOM_SPELLS = Object.freeze([
  {id:'armour',cost:25}, {id:'fireball',cost:15}, {id:'invisibility',cost:30,oncePerAdventure:true},
  {id:'paralysis',cost:30,oncePerAdventure:true}, {id:'poison-needle',cost:25},
  {id:'resurrection',cost:null,manual:true}, {id:'retrace',cost:null,manual:true},
  {id:'timewarp',cost:15}, {id:'xenophobia',cost:20},
].map(Object.freeze));
const die = random => Math.floor(random() * 6) + 1;
const dice = random => die(random) + die(random);

export function checkDemondoomInclination(player, section, random = Math.random) {
  const id = String(section);
  player.magicSections ??= {};
  if (!Object.hasOwn(player.magicSections,id)) player.magicSections[id] = {inclined:dice(random)>=4,used:[]};
  return player.magicSections[id].inclined;
}

export function demondoomCastAvailability(player, section, spellId, manualCost) {
  const spell = DEMONDOOM_SPELLS.find(spell=>spell.id===spellId);
  if (!spell) return {error:'unknown-spell'};
  const state = player.magicSections?.[String(section)];
  if (!state) return {error:'inclination-required'};
  if (!state.inclined) return {error:'unwilling'};
  if (state.used.includes(spellId)) return {error:'used-this-section'};
  if (spell.oncePerAdventure && player.adventureSpells?.includes(spellId)) return {error:'used-this-adventure'};
  const cost = spell.cost ?? manualCost;
  if (!Number.isFinite(cost) || cost < 0) return {error:'manual-cost-required'};
  if (!Number.isFinite(player.power) || player.power < cost) return {error:'insufficient-power'};
  if (player.lifePoints <= 0 && spellId !== 'resurrection') return {error:'dead'};
  return {spell,cost};
}

export function attemptDemondoomSpell(player, section, spellId, options = {}, random = Math.random) {
  const available = demondoomCastAvailability(player,section,spellId,options.manualCost);
  if (available.error) return available;
  const {spell,cost} = available;
  const state = player.magicSections[String(section)];
  player.power -= cost;
  state.used.push(spellId);
  if (spell.oncePerAdventure) {
    player.adventureSpells ??= [];
    player.adventureSpells.push(spellId);
  }
  const roll = dice(random), success = roll >= 6;
  if (!success) return {spell:spellId,cost,roll,success:false};
  if (options.magicImmune) return {spell:spellId,cost,roll,success:true,effect:'immune'};
  if (spell.manual) return {spell:spellId,cost,roll,success:true,effect:'manual'};
  return {spell:spellId,cost,roll,success:true,effect:spellId};
}

export function applyDemondoomSpellEffect(player, enemy, result, options = {}, random = Math.random) {
  if (!result?.success || result.applied || !result.effect || ['immune','manual'].includes(result.effect)) return null;
  result.applied = true;
  switch (result.effect) {
    case 'armour': player.magicArmour = 10; return {armour:10};
    case 'fireball': return {damage:applyDemondoomSpellDamage(enemy,50,options)};
    case 'invisibility': return {escape:true};
    case 'paralysis': enemy.paralysed = true; return {paralysed:true};
    case 'poison-needle': {
      const immunity = die(random);
      if (immunity <= 3) enemy.lifePoints = 0;
      return {immunity,killed:immunity<=3};
    }
    case 'xenophobia': enemy.magicFear = 5; return {fear:5};
    default: return null;
  }
}

export function tradeDemondoomLifeForPower(player, amount) {
  if (!Number.isFinite(amount) || amount <= 0 || player.lifePoints <= amount || !Number.isFinite(player.power)) return false;
  player.lifePoints -= amount;
  player.power += amount;
  player.maxPower = Math.max(player.maxPower ?? 0,player.power);
  return true;
}

export function restoreDemondoomTimewarp(fight) {
  if (!fight.opening?.player || !Array.isArray(fight.opening.enemies)) throw new Error('Missing combat opening snapshot');
  const magicSections = structuredClone(fight.player.magicSections ?? {});
  const adventureSpells = structuredClone(fight.player.adventureSpells ?? []);
  fight.player = {...structuredClone(fight.opening.player),magicSections,adventureSpells};
  fight.enemies = structuredClone(fight.opening.enemies);
  fight.round = fight.attacks = fight.enemyTurns = fight.rest = 0;
  fight.enemyAttacks = fight.enemies.map(() => 0);
  fight.openingStrikes = 0;
  fight.leprosy = false;
  fight.paralysedPlayerRounds = 0;
  fight.pending = null;
  fight.outcome = null;
  fight.turn = fight.encounter?.first ?? null;
}

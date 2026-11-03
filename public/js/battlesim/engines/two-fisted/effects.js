// Apply database-defined combat equipment, consumables and injury recovery without advancing the story.
import {combatInteger as integer, rollSix} from './dice.js';
import {coPilotSkills, coPilotAlive, injureCombatant} from './injuries.js';
import {groundPlayer, validateGroundFight} from './ground.js';
import {spacePlayer, validateSpaceFight} from './space.js';
import {validateTwoFistedSupport} from './catalog.js';

const copy = value => structuredClone(value);
const active = fight => ['fighting', 'firefighting'].includes(fight.status);

function owned(player, id) {
  if (!(player.inventory?.[id] > 0)) throw new RangeError('Enter an owned combat item');
}

function actorFor(player, who) {
  if (!['hero', 'copilot'].includes(who)) throw new RangeError('Choose the protagonist or co-pilot');
  const actor = who === 'hero' ? player : player.copilot;
  if (!actor || actor.dead || who === 'copilot' && !coPilotAlive(actor)) throw new RangeError('Choose a living combatant');
  return actor;
}

export function configureTwoFistedLoadout(original, selections, support) {
  validateTwoFistedSupport(support);
  const player = original.ship ? spacePlayer(original) : groundPlayer(original), uses = new Map();
  for (const who of ['hero', 'copilot']) {
    if (who === 'copilot' && !player.copilot) continue;
    const actor = who === 'hero' ? player : player.copilot, selection = selections[who] ?? {};
    actor.loadout = {extras: []}; actor.armour = null; actor.traumaKit = false; actor.traumaKitItem = null;
    const ids = [selection.melee, selection.ranged, selection.armour, ...(selection.extras ?? [])].filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new RangeError('Equip each item once per combatant');
    for (const id of ids) {
      owned(player, id);
      const item = support.items.find(item => item.id === id), effect = item?.combat;
      if (!effect || !['weapon', 'armour', 'extra'].includes(effect.kind)) throw new RangeError('Choose combat equipment');
      uses.set(id, (uses.get(id) ?? 0) + 1);
      if (uses.get(id) > player.inventory[id]) throw new RangeError('The same item cannot be equipped by both combatants');
      if (effect.kind === 'weapon') {
        if (selection[effect.mode] !== id) throw new RangeError('Choose a weapon for its printed combat mode');
        actor.loadout[effect.mode] = {id, ...copy(effect)};
      } else if (effect.kind === 'armour') {
        if (selection.armour !== id) throw new RangeError('Choose armour in the armour slot');
        actor.armour = effect.armour;
      } else {
        if (!(selection.extras ?? []).includes(id)) throw new RangeError('Choose extras in their equipment slots');
        actor.loadout.extras.push({id, ...copy(effect)});
        if (effect.action === 'trauma-kit') {actor.traumaKit = true; actor.traumaKitItem = id;}
      }
    }
    if (actor.armour === 'nova' && ids.length > 1) throw new RangeError('Nova Armour prevents equipping other items');
  }
  if (selections.shipUpgrades != null) {
    if (!player.ship || new Set(selections.shipUpgrades).size !== selections.shipUpgrades.length) throw new RangeError('Choose distinct ship upgrades');
    player.ship.upgrades = selections.shipUpgrades.map(id => {
      owned(player, id);
      const upgrade = support.shipUpgrades.find(upgrade => upgrade.id === id);
      if (!upgrade) throw new RangeError('Unknown ship upgrade');
      return copy(upgrade);
    });
    // Enter current HULL and POWER with upgrades already included, just as in the record sheet.
  }
  return player;
}

export function recoverCombatInjuries(actor, amount) {
  if (!actor || actor.dead) throw new RangeError('Recovery cannot revive a dead combatant');
  integer(amount);
  const before = actor.injuries ?? 0, healed = Math.min(before, amount), after = before - healed;
  const penalties = count => actor.trait === 'horizon' ? Math.max(0, count - 1) : count;
  const restored = penalties(before) - penalties(after);
  if (actor.combat != null) {
    for (const key of coPilotSkills) if (actor[key] != null) {
      actor[key] = Math.min(actor['max' + key[0].toUpperCase() + key.slice(1)] ?? Infinity, actor[key] + restored);
    }
  } else if (!actor.trueGrit) actor.expertise = Math.min(actor.maxExpertise ?? Infinity, actor.expertise + restored);
  actor.injuries = after;
  if (!after) actor.armourInjuryUsed = false;
  return healed;
}

function validateBoundary(fight) {
  (fight.mode === 'space' ? validateSpaceFight : validateGroundFight)(fight);
  if (active(fight) && (fight.status === 'firefighting' || fight.pending || fight.roundAction
      || fight.mode === 'space' && fight.stage !== 'ready' || fight.queue?.length)) throw new RangeError('Finish the current combat phase first');
}

function applyItem(player, item, options, support, fight, roll) {
  const effect = item.combat, inCombat = fight && active(fight), who = options.who ?? 'hero';
  if (!effect || !['activate', 'ship-action'].includes(effect.kind)) throw new RangeError('This item has no combat activation');
  owned(player, item.id);
  const user = actorFor(player, options.user ?? 'hero');
  if (inCombat && user.armour === 'nova') throw new RangeError('Nova Armour prevents using items in combat');
  if (inCombat && effect.outsideOnly) throw new RangeError('Use this recovery item outside combat');
  if (effect.modes && (!inCombat || !effect.modes.includes(fight.mode))) throw new RangeError('Use this item in its printed combat mode');
  const target = () => {
    const enemy = fight?.opponents[options.target];
    if (!enemy || !(fight.mode === 'space' ? enemy.hull : enemy.health)) throw new RangeError('Choose a living opponent');
    return enemy;
  };
  switch (effect.action) {
    case 'energy':
      player.energy += effect.amount;
      player.expertise = Math.max(0, player.expertise - (effect.expertiseLoss ?? 0));
      if (effect.expertiseLoss) player.temporaryExpertiseLoss = (player.temporaryExpertiseLoss ?? 0) + effect.expertiseLoss;
      for (let i = 0; i < (effect.injuries ?? 0); i++) injureCombatant(player, 'hero');
      break;
    case 'restore-energy':
      integer(player.maxEnergy, 1); player.energy = player.maxEnergy;
      player.goldenEnergyJitters = true; break;
    case 'power':
      if (!player.ship) throw new RangeError('Enter current ship statistics');
      player.ship.power = Math.min(player.ship.maxPower, player.ship.power + effect.amount); break;
    case 'heal': {
      const actor = actorFor(player, who);
      if (effect.requiredTrait && actor.trait !== effect.requiredTrait || effect.excludedTraits?.includes(actor.trait)) throw new RangeError('This recovery item cannot heal that combatant');
      recoverCombatInjuries(actor, effect.all ? actor.injuries ?? 0 : effect.amount); break;
    }
    case 'repair':
      if (options.repair === 'copilot') {
        const crew = actorFor(player, 'copilot');
        if (crew.trait !== 'horizon') throw new RangeError('Only Horizon-8 can use hull repairs');
        recoverCombatInjuries(crew, crew.injuries ?? 0);
      } else {
        if (!player.ship) throw new RangeError('Enter current ship statistics');
        player.ship.hull = Math.min(player.ship.maxHull, player.ship.hull + effect.amount);
      }
      break;
    case 'badge': {
      const crew = actorFor(player, 'copilot');
      if (crew.badgeUsed) throw new RangeError('This co-pilot has already used the badge');
      crew.badgeUsed = true; crew.badgeActive = true; break;
    }
    case 'auto-round':
      if (player.nextAutomaticHeroWin) throw new RangeError('An automatic round is already prepared');
      player.nextAutomaticHeroWin = true; break;
    case 'suppress-fists': target().fistsSuppressed = true; break;
    case 'defeat-one':
      target().health = 0;
      if (fight.mode === 'melee') for (let i = Math.ceil(rollSix(roll) / (6 / effect.injuryDie)); i > 0; i--) injureCombatant(player, 'hero');
      break;
    case 'ally':
      if (player.trobble && !player.trobble.discarded) throw new RangeError('Trobble is already assigned to this fight');
      player.trobble = {...copy(effect.combatant), itemId: item.id, inactive: false, discarded: false}; break;
    case 'dazzle': {
      target();
      const upgrade = player.ship?.upgrades.find(upgrade => upgrade.id === item.id);
      const rule = support.shipUpgrades.find(upgrade => upgrade.id === item.id);
      if (!upgrade || !rule || fight.nextDazzle) throw new RangeError('Choose an installed, unused Dazzler Beam');
      if (player.ship.power < rule.actionPowerCost) throw new RangeError('Not enough POWER for the Dazzler Beam');
      player.ship.power -= rule.actionPowerCost;
      fight.nextDazzle = {target: options.target, penalty: rule.targetWeaponsPenalty}; break;
    }
    default: throw new RangeError('Unsupported combat action');
  }
  if (effect.consumed !== false) player.inventory[item.id]--;
}

export function applyCombatItem(original, id, options = {}, support, roll) {
  validateTwoFistedSupport(support); validateBoundary(original);
  if (!active(original)) throw new RangeError('Use recovery outside the completed encounter');
  const fight = copy(original), item = support.items.find(item => item.id === id);
  if (!item) throw new RangeError('Unknown combat item');
  applyItem(fight.player, item, options, support, fight, roll);
  const player = fight.player;
  if (!player.energy || !player.expertise || player.dead || player.ship && (!player.ship.hull || !player.ship.power)) fight.status = 'loss';
  else if (fight.opponents.every(enemy => !(fight.mode === 'space' ? enemy.hull : enemy.health))) fight.status = 'win';
  fight.log.push({round: fight.round, type: 'item', id, ...copy(options)});
  if (fight.log.length > 100) fight.log.splice(0, fight.log.length - 100);
  return fight;
}

export function useCombatRecovery(original, id, options = {}, support) {
  validateTwoFistedSupport(support);
  const player = original.ship ? spacePlayer(original) : groundPlayer(original);
  const item = support.items.find(item => item.id === id);
  if (!item) throw new RangeError('Unknown combat item');
  applyItem(player, item, options, support, null);
  return player;
}

export function useIyspEnergy(original) {
  validateBoundary(original);
  if (!active(original)) throw new RangeError('Choose an active encounter');
  const fight = copy(original), crew = actorFor(fight.player, 'copilot');
  if (crew.trait !== 'iysp') throw new RangeError('Only Iysp Eeld has this ability');
  injureCombatant(fight.player, 'copilot'); fight.player.energy += 10;
  fight.log.push({round: fight.round, type: 'iysp-energy'});
  if (fight.log.length > 100) fight.log.shift();
  return fight;
}

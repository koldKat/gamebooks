// Explicit printed exceptions for The Eye of Winter's Fury. The shared combat
// engine consumes their declarative effects without branching on a book ID.
import { hasDestinyAbility, destinyStat } from './effects.js';
import { destinyVendorPrice } from './character.js';
import { winterRosterFor } from './winters-fury-roster.js';
import { createDestinyFight, settleDestinyFight } from './core.js';
import { configureDestinyAbilities } from './abilities.js';
import { attachDestinyCharacter } from './character.js';
import { destinyStrike, addDestinyStatEffect } from './effects.js';
import { destinyDie } from './damage.js';

export const WINTER_IMPLEMENTED_ENCOUNTERS = Object.freeze(['30', '34', '37', '41', '48', '49', '54', '70', '76', '83', '91', '100', '101', '107', '118', '135', '141', '152', '154', '159', '166', '167', '174', '175', '184', '187', '194', '202', '211', '216', '236', '271', '272', '275', '292', '293', '300', '311', '316', '318', '325', '333', '337', '340', '348', '371', '375', '379', '402', '407', '436', '447', '467', '468', '475', '485', '516', '533', '542', '565', '567', '578', '580', '590', '599', '603', '615', '619', '626', '635', '666', '668', '672', '698']);

export function winterChallenge(fight, section, { leif = false } = {}) {
  const hooks = hasDestinyAbility(fight, 'ice-hooks');
  if (String(section) === '35') return { turns: hooks ? 5 : 7, threshold: 15, rollBonus: leif ? 2 : 0 };
  if (String(section) === '67') return { threshold: hooks ? 8 : 14, rollBonus: 0 };
  throw new RangeError('Unknown climbing challenge');
}

export function configureWinterEncounter(fight, section, { fimbulwinter = false, bannerLit = false } = {}) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start') throw new RangeError('Choose the encounter before combat');
  if (Object.keys(fight.used).length) throw new RangeError('Choose the encounter before opening abilities');
  if (typeof fimbulwinter !== 'boolean') throw new RangeError('Specify whether the Titan shield is present');
  if (typeof bannerLit !== 'boolean') throw new RangeError('Specify whether the tower banner was lit');
  const next = structuredClone(fight);
  const insulated = hasDestinyAbility(next, 'insulated');
  const rules = { sourceSection: String(section) };
  switch (String(section)) {
    case '30': case '34': case '236': case '272': case '371': case '485': case '533': break;
    case '41':
      rules.endTests = [{ name: 'Acid spray', kind: 'damage-if-low', dice: 1, limit: 'round', amount: 4 }];
      rules.endEffects = next.opponents.map((_, target) => ({ target, amount: 2 }));
      break;
    case '37': case '54':
      rules.rerollOnesByTarget = [0];
      rules.endEffects = [{ target: 0, amount: 1 }];
      break;
    case '48':
      if (!next.equipment?.transport) throw new RangeError('Choose the transport used in this encounter');
      rules.damageShieldWhileAlive = [{ target: 0, protectors: [1, 2, 3, 4] }];
      rules.restrictProtectedTargets = true;
      rules.endTests = [{ name: 'Under pressure', kind: 'transport-damage', dice: 4, every: 4, requiresAnyAlive: [1, 2, 3, 4], owner: 'opponent', damageDice: true }];
      break;
    case '49': rules.outnumbered = true; break;
    case '70': rules.fleeAtHealth = { 0: 10 }; break;
    case '76': rules.onDeathStatChanges = [0, 1].map(target => ({ dead: 1 - target, target, changes: { speed: 1, brawn: 1 } })); break;
    case '83': rules.enemyWinTest = { name: 'Perilous plunge', kind: 'roc-attack', dice: 1, attackChoice: true }; break;
    case '91': rules.initialStats = [{ target: 'hero', attribute: 'speed', amount: -1, from: 1, until: 2 }]; break;
    case '100': case '194': rules.outnumbered = true; break;
    case '101': rules.enemyWinTest = { name: 'Might of chaos', kind: 'sable-attack', dice: 1, attackChoice: true }; break;
    case '107':
      rules.regeneration = [{ target: 1, amount: 10, uncapped: true, requiresAlive: [0] }];
      rules.endEffects = [{ target: 'hero', amount: 2, requiresAlive: [1] }];
      break;
    case '118':
      rules.resources = { candles: 16 };
      rules.roundDamagePerLivingOpponent = 1;
      rules.roundDamageResource = 'candles';
      break;
    case '135':
      rules.endEffects = [{ target: 'hero', amount: 2 }];
      rules.startStats = [{ round: 3, target: 0, changes: { armour: 3, speed: -1 } }];
      break;
    case '141':
      rules.onDeathSetStats = [{ dead: 2, target: 0, attribute: 'speed', value: 3 }, { dead: 2, target: 1, attribute: 'speed', value: 3 }];
      rules.blockAbilitiesWhileAlive = [{ target: 0, categories: ['sp', 'co'] }];
      rules.endEffects = [{ target: 'hero', amount: 2, requiresAlive: [1] }];
      break;
    case '152': rules.deathDamageByTarget = Object.fromEntries(next.opponents.map((_, index) => [index, 4])); break;
    case '154':
      if (insulated) rules.scoreReductionByTarget = { 0: 3 };
      rules.endTests = [{ name: 'Petrifying gaze', kind: 'faces-damage', dice: 4,
        faces: fimbulwinter || next.equipment?.leftHand?.id === 'fimbulwinter' ? [1] : [5, 6] }];
      break;
    case '159': rules.acornsRemoved = 0; break;
    case '166': case '402': rules.initialStats = [{ target: 0, attribute: 'speed', set: 0, from: 1, until: 2 }]; break;
    case '167':
      rules.statWhileAlive = [{ alive: 1, target: 'hero', attribute: 'speed', amount: -1 }];
      rules.endEffects = [{ target: 'hero', amount: 2, requiresAlive: [0] }];
      break;
    case '174':
      rules.startTests = [{ name: 'Stalactite splinters', kind: 'splinters', dice: 6, every: 3 }];
      rules.lossAfterRound = 7;
      break;
    case '175':
      rules.initialStats = [{ target: 'hero', attribute: 'speed', amount: -1, from: 1, until: Number.MAX_SAFE_INTEGER }];
      rules.healthDamageTest = { name: 'Weak venom', kind: 'weak-venom', dice: 1 };
      break;
    case '184':
      rules.outnumbered = true;
      rules.regeneration = [{ target: 0, amount: 2 }];
      rules.endArmourGrowth = [{ target: 1, amount: 1, maximum: 5 }, { target: 2, amount: 1, maximum: 5 }];
      break;
    case '187': case '375':
      rules.outnumbered = true;
      rules.regeneration = next.opponents.map((_, target) => ({ target, amount: 2 }));
      rules.blockAbilitiesWhileAlive = [{ target: 0, categories: ['mo'] }];
      break;
    case '202': rules.endTests = [{ name: 'Spore cloud', kind: 'stat-if-low', dice: 1, limit: 3, attribute: 'speed', amount: -1, delay: 1 }]; break;
    case '211': rules.startTests = [{ name: 'Throwing knives', kind: 'damage-if-low', dice: 2, attribute: 'speed', limit: 9, amount: 4 }]; break;
    case '216':
      rules.heroScoreBonus = 2;
      rules.onEnemyScoreHealthHit = [{ target: 'hero', attribute: 'speed', amount: -1, duration: 1, delay: 1 }];
      break;
    case '271':
      rules.endEffects = [{ target: 'hero', amount: 4, requiresAlive: [1] }];
      rules.passiveImmunityByTarget = { 1: ['bleed', 'venom'] };
      rules.victoryTargets = [0];
      break;
    case '275':
      rules.endStats = [{ round: 4, target: 0, changes: { speed: -1, brawn: 3 } }];
      rules.heroStatusOnHit = { name: 'disease', amount: 2 };
      break;
    case '292':
      rules.deathDamageByTarget = Object.fromEntries(next.opponents.slice(1).map((_, index) => [index + 1, insulated ? 2 : 5]));
      rules.initialStats = [{ target: 'hero', attribute: 'speed', amount: 2, from: 1, until: 2 }];
      rules.armourReductionImmune = [0];
      rules.healthThresholdStats = [{ target: 0, health: 40, changes: { armour: -6 } }];
      rules.endEffects = next.opponents.slice(1).map((_, index) => ({ target: 'hero', amount: 1, requiresAlive: [index + 1] }));
      rules.passiveImmunityByTarget = Object.fromEntries(next.opponents.map((_, index) => [index, ['bleed', 'decay', 'venom']]));
      rules.endTests = [{ name: 'Ice prison', kind: 'ice-prison', dice: 1 }];
      break;
    case '293': case '348':
      rules.disableHeroAbilities = true;
      rules.startTests = [{ name: 'I yield', kind: 'yield', dice: 1, target: 0, maxHealth: 10 }];
      break;
    case '300': rules.endEffects = [{ target: 0, amount: 1 }]; rules.heroScoreBonus = 2; break;
    case '311':
      rules.roundDamagePerLivingOpponent = 1;
      rules.onDeathStatChanges = next.opponents.flatMap((_, dead) => next.opponents.flatMap((_, target) =>
        dead === target ? [] : [{ dead, target, changes: { magic: -1, armour: -1 } }]));
      break;
    case '316': case '567':
      rules.endEffects = next.opponents.slice(1).map((_, index) => ({ target: 'hero', amount: 1, requiresAlive: [index + 1] }));
      rules.startStats = [{ round: 4, target: 0, changes: { speed: 2 } }];
      break;
    case '318':
      rules.surrenderAt = Object.fromEntries(next.opponents.map((_, target) => [target, 10]));
      rules.statWhileAlive = ['speed', 'brawn', 'magic'].map(attribute => ({ alive: 0, target: 'hero', attribute, amount: attribute === 'speed' ? -1 : -4 }));
      rules.outnumbered = true;
      break;
    case '325': rules.onHeroScoreHealthHit = [{ target: 'hero', attribute: 'speed', set: 0, duration: 1, delay: 1 }]; break;
    case '333': rules.heroWinTest = { name: 'Spitting feathers', kind: 'birdman-attack', dice: 1 }; break;
    case '337': rules.enemyWinTest = { name: 'Swat back', kind: 'sasquatch-attack', dice: 1, attackChoice: true }; break;
    case '340': rules.heroScoreBonus = 2; break;
    case '379':
      rules.statWhileAlive = [{ alive: 1, target: 'hero', attribute: 'speed', amount: -1 }];
      rules.endTests = [{ name: 'Many mouths of Moulder', kind: 'damage-if-low', dice: 1, limit: 2, amount: 1, requiresAlive: [0] }];
      break;
    case '407':
      rules.speedDiceReductionImmune = [0];
      rules.healthThresholdStats = [{ target: 0, health: 50, changes: { speed: -1, brawn: 4 } }];
      break;
    case '436': rules.outnumbered = true; rules.heroStatusOnHit = { name: 'disease', amount: 2 }; break;
    case '447': rules.outnumbered = true; rules.blockCategoriesOnHit = ['sp', 'co', 'mo', 'dm']; break;
    case '467':
      rules.onEnemyScoreHealthHit = [{ target: 'hero', attribute: 'speed', amount: -2, duration: 1, delay: 1 }];
      rules.roundDamagePerLivingOpponent = 1;
      rules.heroScoreBonus = 2;
      break;
    case '468':
      rules.attackProxy = { 1: 0 };
      rules.unselectableTargets = [0];
      rules.victoryTargets = [1];
      rules.passiveImmuneTargets = [1];
      rules.automaticHitsAfterWin = 2;
      rules.endEffects = [{ target: 'hero', amount: 2 }];
      break;
    case '475': rules.heroDamageWithoutSpeedAbility = 4; break;
    case '516':
      rules.outnumbered = true;
      rules.regeneration = next.opponents.map((_, target) => ({ target, amount: 2 }));
      break;
    case '542':
      if (!next.equipment?.transport) throw new RangeError('Choose the transport used in this encounter');
      rules.startTests = [{ name: 'Poison spray', kind: 'transport-damage', dice: 1, owner: 'opponent', damageDice: true }];
      break;
    case '565':
      if (!insulated) rules.mirrorBonusTarget = 0;
      rules.attackProxy = { 1: 0, 2: 0, 3: 0 };
      rules.damageShieldWhileAlive = [{ target: 0, protectors: [1, 2, 3] }];
      rules.passiveImmunityByTarget = { 1: ['bleed', 'decay'], 2: ['bleed', 'decay'], 3: ['bleed', 'decay'] };
      rules.heroScoreWhenDefeated = [{ targets: [1, 2, 3], amount: 2 }];
      break;
    case '578':
      rules.roundDamagePerLivingOpponent = insulated ? 0 : 1;
      rules.heroScoreBonus = 2;
      rules.inactiveTargets = [1, 2, 3];
      rules.healthThresholdStats = [50, 30, 10].map((health, index) => ({ target: 0, health, activateTargets: [index + 1] }));
      rules.passiveImmunityByTarget = Object.fromEntries(next.opponents.map((_, target) => [target, ['bleed', 'decay', 'venom']]));
      break;
    case '580':
      rules.damageShieldWhileAlive = [{ target: 0, protectors: [1] }];
      rules.restrictProtectedTargets = true;
      rules.automaticHitTargets = [1];
      rules.passiveImmuneTargets = [1];
      rules.regeneration = [{ target: 0, amount: 5, uncapped: true, requiresAlive: [1] }];
      if (bannerLit) rules.heroScoreWhenDefeated = [{ target: 1, amount: 2 }];
      break;
    case '590':
      rules.endEffects = [{ target: 'hero', actor: 0, actorAttribute: 'magic', requiresAlive: [0] }];
      rules.heroScoreBonus = 2;
      break;
    case '599':
      if (insulated) rules.scoreReductionByTarget = { 0: 2 };
      rules.endEffects = [{ target: 'hero', actor: 0, healthDivisor: 10, requiresAlive: [0] }];
      rules.passiveImmunityByTarget = { 0: ['bleed', 'decay', 'disease', 'venom'] };
      break;
    case '603': rules.growingStatusOnHit = { name: 'infestation', increment: 2 }; break;
    case '615': rules.roundDamagePerLivingOpponent = insulated ? 1 : 2; break;
    case '619':
      rules.onEnemyScoreHealthHit = [{ attacker: 0, target: 'hero', attribute: 'speed', amount: -1, duration: 1, delay: 1 }];
      rules.roundDamagePerLivingOpponent = 1;
      rules.heroScoreBonus = 2;
      break;
    case '626': rules.damageWithoutAttackAbility = 5; rules.endEffects = [{ target: 'hero', amount: 1 }]; break;
    case '635':
      rules.blockAbilitiesWhileAlive = [{ target: 0, categories: ['sp'] }];
      rules.startStats = [{ round: 5, target: 0, changes: { speed: 1, magic: 3 } }];
      break;
    case '666': rules.reflectDamage = [{ target: 0, divisor: 2 }]; rules.endEffects = [{ target: 'hero', amount: 2 }]; break;
    case '668':
      rules.damageDiceByTarget = { 0: 2 };
      rules.endTests = [{ name: 'Spirit link', kind: 'spirit-link', dice: 1 }];
      break;
    case '672': rules.roundDamagePerLivingOpponent = 1; rules.heroScoreBonus = 2; break;
    case '698':
      rules.onEnemyScoreHealthHit = ['brawn', 'magic'].map(attribute => ({ attacker: 0, target: 'hero', attribute, amount: -1, duration: null }));
      rules.endEffects = [{ target: 'hero', amount: 4, requiresAlive: [1] }];
      rules.enemyWinTest = { name: 'Baiting the beast', kind: 'distracted', dice: 1, attackChoice: true };
      break;
    default: throw new RangeError('Unsupported encounter exception');
  }
  next.encounter = rules;
  rules.implementation = WINTER_IMPLEMENTED_ENCOUNTERS.includes(String(section)) ? 'complete' : 'partial';
  for (const effect of rules.initialStats || []) next.effects.push({ kind: 'stat', ...effect, source: 'encounter' });
  return next;
}

export function createWinterFight(hero, section, { abilities = {}, equipment = {}, character = null, fimbulwinter = false, bannerLit = false } = {}) {
  if (!WINTER_IMPLEMENTED_ENCOUNTERS.includes(String(section))) throw new RangeError('This encounter still needs its complete rules adapter');
  const preset = winterRosterFor(section);
  const parts = preset.parts.filter(part => String(section) === '118' ? part.role === 'opponent' : true);
  if (parts.some(part => part.role !== 'opponent') && !['468', '565'].includes(String(section))) throw new RangeError('This encounter requires its dedicated component adapter');
  const opponents = parts.map(part => {
    const enemy = { name: part.name, speed: part.speed, armour: part.armour, health: part.health, damageStat: part.damageStat };
    if (part.role !== 'opponent') enemy.role = part.role;
    for (const key of ['brawn', 'magic']) if (part[key] !== undefined) enemy[key] = part[key];
    return enemy;
  });
  let fight = configureDestinyAbilities(createDestinyFight(hero, opponents), abilities, equipment);
  if (character) fight = attachDestinyCharacter(fight, character);
  fight = configureWinterEncounter(fight, section, { fimbulwinter, bannerLit });
  return fight;
}

export function useWinterAction(fight, action, { count = 1 } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active') throw new RangeError('No active encounter');
  const next = structuredClone(fight);
  const section = next.encounter?.sourceSection;
  if (action === 'smash-ice') {
    if (section !== '49' || next.phase !== 'damage' || next.turn.winner !== 'hero') throw new RangeError('Win a round against an ice tomb first');
    addDestinyStatEffect(next, next.target, 'armour', -4, null, action);
    next.encounter.smashedIce = true;
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  } else if (action === 'remove-acorn') {
    if (section !== '159' || next.phase !== 'damage' || next.turn.winner !== 'hero' || next.encounter.acornsRemoved >= 3) throw new RangeError('Win a round with an acorn remaining');
    next.turn.pendingAbility = { type: 'encounter', name: 'Spit it out', event: { name: 'Spit it out', kind: 'remove-acorn' }, dice: [destinyDie(roll)], returnPhase: 'end', options: {} };
    next.turn.normalDamageReplaced = true;
    next.phase = 'ability-rolled';
  } else if (action === 'avoid-splinters') {
    const pending = next.turn?.pendingAbility;
    if (section !== '174' || next.phase !== 'ability-rolled' || pending?.event?.kind !== 'splinters' || pending.event.avoided ||
        destinyStat(next, 'hero', 'speed') < 1) throw new RangeError('Spend an available speed point during the splinter shower');
    addDestinyStatEffect(next, 'hero', 'speed', -1, null, action);
    pending.event.avoided = true;
  } else if (action === 'snuff-candles') {
    if (section !== '118' || next.phase !== 'damage' || next.turn.winner !== 'hero' || !(next.encounter.resources.candles > 0)) throw new RangeError('Win a round while candles remain');
    next.turn.pendingAbility = { type: 'resource', name: action, dice: [destinyDie(roll), destinyDie(roll)], returnPhase: 'end',
      resource: 'candles', onZeroStats: next.opponents.map((_, target) => ({ target, changes: { magic: -1, armour: -1 } })), options: {} };
    next.turn.normalDamageReplaced = true;
    next.phase = 'ability-rolled';
  } else if (action === 'tar-barrels') {
    if (!['141', '184'].includes(section) || next.phase !== 'end' || !Number.isInteger(count) || count < 1 ||
        count + (next.turn.tarBarrelsUsed || 0) > 4 || !Number.isSafeInteger(next.character?.tarBarrels) || !(next.character.tarBarrels >= count)) throw new RangeError('Choose up to four available tar barrels at round end');
    next.character.tarBarrels -= count;
    next.turn.tarBarrelsUsed = (next.turn.tarBarrelsUsed || 0) + count;
    next.opponents.forEach((opponent, target) => {
      if (opponent.health > 0) destinyStrike(next, target, count, action, 'passive');
    });
  } else throw new RangeError('Unknown encounter action');
  settleDestinyFight(next);
  return next;
}

export function winterSalePrice(fight, price, { quantity = 1, hide = false } = {}) {
  if (typeof hide !== 'boolean') throw new RangeError('Specify whether these are hides');
  return destinyVendorPrice(price, { quantity, persuade: hasDestinyAbility(fight, 'persuade'),
    trapperHide: hide && fight.character?.career === 'trapper' });
}

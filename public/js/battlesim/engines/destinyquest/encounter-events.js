import { destinyDie } from './damage.js';
import { destinyStat, addDestinyStatEffect, observeDestinyHealth, hasDestinyAbility, destinyStrike, isDestinyOpponentActive, destinyAttackerTarget } from './effects.js';

export function queueDestinyEncounterEvent(fight, event, returnPhase, roll) {
  if (['ability-rolled', 'ability-choice'].includes(fight.phase)) {
    (fight.turn.afterAbilityEvents ??= []).push({ event: structuredClone(event), returnPhase });
    return;
  }
  fight.turn.pendingAbility = { type: 'encounter', name: event.name, event: structuredClone(event), returnPhase,
    dice: Array.from({ length: event.dice || 1 }, () => destinyDie(roll)), bonuses: {}, options: {} };
  fight.phase = 'ability-rolled';
}

export function resumeDestinyEncounterQueue(fight, roll) {
  if (fight.status !== 'active' || ['ability-rolled', 'ability-choice'].includes(fight.phase)) return;
  const queued = fight.turn.afterAbilityEvents?.shift();
  if (queued) queueDestinyEncounterEvent(fight, queued.event, queued.returnPhase, roll);
}

function heroDamage(fight, amount, enemyDice = false) {
  const lost = Math.min(fight.hero.health, amount);
  fight.hero.health -= lost;
  observeDestinyHealth(fight);
  const attacker = destinyAttackerTarget(fight);
  if (enemyDice && lost && hasDestinyAbility(fight, 'lightning') && isDestinyOpponentActive(fight, attacker)) {
    destinyStrike(fight, attacker, 2, 'lightning', 'passive');
  }
}

export function resolveDestinyEncounterEvent(fight, pending, roll) {
  const { event, dice } = pending;
  const total = dice.reduce((sum, value, index) => sum + value + (pending.bonuses?.[index] || 0), 0);
  fight.phase = pending.returnPhase;
  fight.history.push({ type: 'encounter-roll', name: pending.name, round: fight.round, dice: [...dice], total });
  const stageDamage = amount => {
    if (event.atEnd) (fight.turn.encounterEndEffects ??= []).push({ target: 'hero', amount, ignoreArmour: true, source: event.name });
    else heroDamage(fight, amount);
  };
  switch (event.kind) {
    case 'damage-if-low': {
      const limit = event.limit === 'round' ? Math.min(6, fight.round) : event.limit;
      const score = total + (event.attribute ? destinyStat(fight, 'hero', event.attribute) : 0);
      if (score <= limit) stageDamage(event.amount);
      break;
    }
    case 'faces-damage':
      stageDamage(dice.filter(value => event.faces.includes(value)).reduce((sum, value) => sum + value, 0));
      break;
    case 'transport-damage': {
      stageDamage(total);
      const transport = fight.equipment?.transport;
      if (!transport) throw new RangeError('Choose the transport used in this encounter');
      for (const attribute of ['stability', 'toughness']) transport[attribute] = Math.max(0, transport[attribute] - 2);
      for (const effect of fight.effects) if (effect.source === 'armour-plating') effect.amount = Math.floor(transport.toughness / 2);
      break;
    }
    case 'stat-if-low':
      if (total <= event.limit) addDestinyStatEffect(fight, 'hero', event.attribute, event.amount, 1, event.name, event.delay || 0);
      break;
    case 'spirit-link':
      if (total <= 3) {
        stageDamage(4);
        (fight.turn.encounterEndOpponentHealing ??= []).push({ target: 0, amount: 4 });
      }
      break;
    case 'distracted': if (total <= 3) fight.phase = 'end'; break;
    case 'weak-venom':
      if (total === 1) (fight.encounter.heroStatuses ??= {}).venom = 2;
      break;
    case 'yield':
      if (total >= 4) fight.encounter.forcedVictory = true;
      break;
    case 'roc-attack':
      if (total <= 2) {
        heroDamage(fight, 5);
        addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, event.name, 1);
        fight.phase = 'end';
      }
      break;
    case 'sable-attack':
      if (total <= 2) {
        const opponent = fight.opponents[fight.target];
        opponent.health = Math.min(opponent.maxHealth, opponent.health + 5);
        fight.phase = 'end';
      } else if (total >= 5) {
        fight.encounter.blockedRounds = { from: fight.round + 1, until: fight.round + 1, categories: ['sp', 'co'] };
        queueDestinyEncounterEvent(fight, { name: 'Curse of chaos', kind: 'enemy-dice-damage', dice: 3, owner: 'opponent', damageDice: true }, 'end', roll);
      }
      break;
    case 'enemy-dice-damage':
      heroDamage(fight, total, true);
      if (fight.hero.health > 0 && event.followUp) queueDestinyEncounterEvent(fight, event.followUp, pending.returnPhase, roll);
      break;
    case 'sasquatch-attack':
      if (total >= 3) queueDestinyEncounterEvent(fight, { name: 'Swat back damage', kind: 'enemy-dice-damage', dice: 2,
        owner: 'opponent', damageDice: true, followUp: { name: 'Ground smash', kind: 'sasquatch-challenge', dice: 2 } }, 'end', roll);
      break;
    case 'sasquatch-challenge':
      if (total + destinyStat(fight, 'hero', 'speed') <= 14) queueDestinyEncounterEvent(fight,
        { name: 'Ground smash damage', kind: 'enemy-dice-damage', dice: 1, owner: 'opponent', damageDice: true }, 'end', roll);
      break;
    case 'splinters':
      if (!event.avoided) heroDamage(fight, dice.filter(face => face <= 2).length * 4);
      break;
    case 'ice-prison':
      if (!fight.encounter.skollFreed && total === 6) {
        fight.encounter.prisonSixes = (fight.encounter.prisonSixes || 0) + 1;
        if (fight.encounter.prisonSixes === 3) {
          fight.encounter.skollFreed = true;
          fight.turn.encounterEndHealing = 6;
          fight.encounter.heroScoreBonus = (fight.encounter.heroScoreBonus || 0) + 2;
        }
      }
      break;
    case 'birdman-attack': if (total <= 3) fight.phase = 'end'; break;
    case 'remove-acorn':
      if (total >= 3) {
        fight.encounter.acornsRemoved = (fight.encounter.acornsRemoved || 0) + 1;
        for (const attribute of ['speed', 'magic', 'armour']) addDestinyStatEffect(fight, 0, attribute, -1, null, event.name);
      } else heroDamage(fight, 4);
      break;
    default: throw new RangeError('Unknown encounter event');
  }
}

export function prepareDestinyEndEvents(fight, roll) {
  if (fight.turn.encounterEndPrepared) return false;
  fight.turn.encounterEndPrepared = true;
  for (const event of fight.encounter?.endTests || []) {
    if (event.every && fight.round % event.every !== 0) continue;
    if (event.requiresAnyAlive && !event.requiresAnyAlive.some(target => isDestinyOpponentActive(fight, target))) continue;
    if (event.kind === 'ice-prison' && fight.encounter.skollFreed) continue;
    if (event.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    queueDestinyEncounterEvent(fight, { ...event, atEnd: true }, 'end', roll);
  }
  return fight.phase === 'ability-rolled';
}

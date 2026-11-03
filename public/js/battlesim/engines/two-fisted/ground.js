// Resolve independent hand-to-hand and ranged encounters using the printed ENERGY and FISTS rules.
import {combatInteger as integer, rollSix, rollFists, rollIndex} from './dice.js';
import {coPilotSkills as skills, coPilotAlive as crewAlive, injureCombatant} from './injuries.js';
import {combatLoadout, trobbleActive} from './loadout.js';

const copy = value => structuredClone(value);
const alive = enemy => enemy.health > 0;

function modifiers(actor) {
  integer(actor.attackBonus ?? 0, -1000, 1000);
  integer(actor.fistBonus ?? 0, -1000, 1000);
  integer(actor.damage ?? 1, 1, 1000);
}

function validateCrew(crew) {
  if (!crew) return;
  integer(crew.fists, 0, 20); integer(crew.injuries ?? 0);
  for (const key of skills) if (crew[key] != null) integer(crew[key]);
  if (crew.combat == null) throw new RangeError('Enter current co-pilot combat expertise');
  modifiers(crew);
}

export function groundPlayer(values = {}) {
  const player = {expertise: 6, energy: 60, fists: 2, injuries: 0,
    trueGrit: false, rightStuffAvailable: false, copilot: null, ...copy(values)};
  integer(player.expertise); integer(player.energy); integer(player.fists, 0, 20); integer(player.injuries);
  for (const key of ['trueGrit', 'rightStuffAvailable']) if (typeof player[key] !== 'boolean') throw new RangeError('Invalid character ability');
  validateCrew(player.copilot);
  if (player.copilot?.trait === 'horizon' && player.copilot.injuries > 0 && player.copilot.armourInjuryUsed == null) player.copilot.armourInjuryUsed = true;
  if (player.trobble) {
    integer(player.trobble.expertise); integer(player.trobble.fists, 0, 20);
    integer(player.trobble.discardThrough, 1, 5);
  }
  if (player.inventory != null) {
    if (typeof player.inventory !== 'object' || Array.isArray(player.inventory)) throw new RangeError('Invalid combat items');
    Object.values(player.inventory).forEach(count => integer(count));
  }
  modifiers(player);
  return player;
}

function validateEnemy(enemy, starting = false) {
  integer(enemy.expertise); integer(enemy.health, starting ? 1 : 0);
  // A missing printed value is not a zero or a made-up default.
  if (enemy.fists == null && !enemy.randomFists) throw new RangeError('Enter opponent FISTS');
  if (enemy.fists != null) integer(enemy.fists, 0, 20);
  if (enemy.randomFists != null && enemy.randomFists !== '1d3') throw new RangeError('Invalid random FISTS rule');
  if (enemy.firstRoundFists != null) integer(enemy.firstRoundFists, 0, 20);
  if (enemy.rolledFists != null) integer(enemy.rolledFists, 1, 3);
  integer(enemy.fistBonus ?? 0, -1000, 1000);
}

export function startGroundFight(player, encounter, roll) {
  player = groundPlayer(player);
  if (!player.expertise || !player.energy || player.dead) throw new RangeError('The protagonist cannot fight while defeated');
  if (!['melee', 'ranged'].includes(encounter?.mode) || !Array.isArray(encounter.opponents)
      || !encounter.opponents.length || encounter.opponents.length > 30) throw new RangeError('Invalid ground encounter');
  encounter.opponents.forEach(enemy => validateEnemy(enemy, true));
  const opponents = copy(encounter.opponents);
  for (const enemy of opponents) if (enemy.randomFists === '1d3') {
    // The footnote determines the encounter's FISTS statistic once, rather than
    // changing that statistic for every matchup or subsequent round.
    enemy.rolledFists ??= Math.ceil(rollSix(roll) / 2); integer(enemy.rolledFists, 1, 3);
  }
  return {rulesVersion: 1, mode: encounter.mode, status: 'fighting', round: 0,
    player, encounter: copy(encounter), opponents,
    queue: [], pending: null, roundAction: null, log: []};
}

export function validateGroundFight(fight) {
  if (fight?.rulesVersion !== 1 || !['melee', 'ranged'].includes(fight.mode)
      || !['fighting', 'win', 'loss', 'ended', 'cancelled'].includes(fight.status)
      || !Array.isArray(fight.opponents) || !fight.opponents.length || fight.opponents.length > 30
      || !Array.isArray(fight.queue) || !Array.isArray(fight.log) || fight.log.length > 100) throw new RangeError('Invalid saved ground encounter');
  groundPlayer(fight.player); fight.opponents.forEach(enemy => validateEnemy(enemy)); integer(fight.round);
  if (fight.roundAction) integer(fight.roundAction.spend);
  return fight;
}

function finish(fight) {
  if (fight.player.energy === 0 || fight.player.expertise === 0 || fight.player.dead) fight.status = 'loss';
  else if (!fight.opponents.some(alive)) fight.status = 'win';
  if (fight.status !== 'fighting') {fight.queue = []; fight.pending = null; fight.roundAction = null;}
  return fight;
}

function note(fight, event) {
  fight.log.push({round: fight.round, ...event});
  if (fight.log.length > 100) fight.log.splice(0, fight.log.length - 100);
}

function injure(fight, who, lethal = false, roll) {
  if (who === 'trobble') {
    const pet = fight.player.trobble; pet.inactive = true;
    const die = rollSix(roll); pet.discarded = lethal || die <= pet.discardThrough;
    if (pet.discarded && pet.itemId && fight.player.inventory) fight.player.inventory[pet.itemId] = Math.max(0, (fight.player.inventory[pet.itemId] ?? 0) - 1);
    note(fight, {type: 'trobble-injury', die, discarded: pet.discarded}); return;
  }
  const event = injureCombatant(fight.player, who, lethal);
  if (event) note(fight, event);
}

function attackProfile(fight, who) {
  if (who === 'trobble') return {expertise: fight.player.trobble.expertise, fists: fight.player.trobble.fists, bonus: 0, damage: 1};
  const crew = fight.player.copilot;
  const actor = who === 'hero' ? fight.player : crew;
  const equipment = combatLoadout(actor, fight.mode, fight.round);
  const ability = who === 'hero' ? fight.roundAction.spend : Math.max(0, crew.combat + equipment.expertise);
  const single = fight.roundAction.initialOpponentCount === 1 && !fight.roundAction.heroAway;
  const expertise = who === 'copilot' && single ? Math.min(ability, fight.roundAction.spend) : ability;
  const fists = actor.fists + equipment.fists + (who === 'copilot' && crew.trait === 'gocky' && fight.mode === 'melee' ? 1 : 0);
  const bonus = (actor.fistBonus ?? 0) + equipment.roll + (actor.armour === 'nova' ? -2 : 0)
    + (who === 'copilot' && crew.trait === 'tarlee' ? Math.min(3, fight.round - 1) : 0);
  return {expertise: expertise + (actor.attackBonus ?? 0), fists, bonus,
    luckySix: who === 'copilot' && crew.trait === 'chakold', damage: equipment.damage};
}

export function groundMaximumSpend(player, mode, round) {
  return Math.min(player.energy, Math.max(0, player.expertise + combatLoadout(player, mode, round).expertise));
}

function enemyProfile(fight, enemy, roll) {
  let fists = enemy.randomFists === '1d3' ? enemy.rolledFists : enemy.fists;
  if (fight.round === 1 && enemy.firstRoundFists != null) fists = enemy.firstRoundFists;
  if (enemy.fistsSuppressed) fists = 0;
  return {expertise: enemy.expertise, fists, bonus: enemy.fistBonus ?? 0, luckySix: Boolean(enemy.luckySix)};
}

// Matchups are explicit player choices. Only unmatched enemies pick a random
// active ally; they do not become accidental mutual exchanges.
export function prepareGroundRound(original, action) {
  validateGroundFight(original);
  if (original.status !== 'fighting' || original.pending || original.queue.length || original.roundAction) throw new RangeError('Finish the current round first');
  const fight = copy(original), living = fight.opponents.map((enemy, i) => alive(enemy) ? i : -1).filter(i => i >= 0);
  integer(action.spend, 0, groundMaximumSpend(fight.player, fight.mode, fight.round + 1));
  if (!living.includes(action.target)) throw new RangeError('Choose a living opponent');
  if (fight.player.nextAutomaticHeroWin && (fight.mode !== 'ranged' || action.spend !== 0)) throw new RangeError('The automatic ranged round spends no ENERGY');
  const crew = fight.player.copilot, activeCrew = crewAlive(crew) && !action.copilotLow;
  const heroAway = Boolean(action.heroAway);
  if (heroAway && (!fight.encounter.onboardFire || !activeCrew || action.spend !== 0)) throw new RangeError('Only an onboard fire permits the protagonist to work elsewhere');
  const targets = activeCrew ? [...(action.copilotTargets ?? [])] : [];
  const maximum = crew?.trait === 'gocky' && fight.mode === 'melee' && !crew.crippled ? 2 : 1;
  if (activeCrew && (!targets.length || targets.length > maximum || new Set(targets).size !== targets.length
      || targets.some(target => !living.includes(target))
      || (!heroAway && living.length > 1 && targets.includes(action.target)))) throw new RangeError('Match the co-pilot to a different opponent');
  fight.round++; fight.player.energy -= action.spend;
  fight.roundAction = {spend: action.spend, initialOpponentCount: living.length, copilotLow: Boolean(action.copilotLow), heroAway,
    automaticHeroWin: Boolean(fight.player.nextAutomaticHeroWin)};
  fight.player.nextAutomaticHeroWin = false;
  if (!heroAway) fight.queue.push({who: 'hero', enemy: action.target, unopposed: null});
  for (const target of targets) fight.queue.push({who: 'copilot', enemy: target, unopposed: living.length === 1 && !heroAway ? 'ally' : null});
  const matched = new Set(heroAway ? targets : [action.target, ...targets]);
  if (trobbleActive(fight.player) && !fight.encounter.onboardFire) {
    if (!living.includes(action.trobbleTarget)) throw new RangeError('Choose Trobble’s opponent');
    if (living.some(index => !matched.has(index)) && matched.has(action.trobbleTarget)) throw new RangeError('Match Trobble to an unmatched opponent');
    fight.queue.push({who: 'trobble', enemy: action.trobbleTarget, unopposed: matched.has(action.trobbleTarget) ? 'ally' : null});
    matched.add(action.trobbleTarget);
  }
  for (const enemy of living.filter(index => !matched.has(index))) {
    fight.queue.push({who: null, enemy, unopposed: 'enemy'});
  }
  note(fight, {type: 'round-start', spend: action.spend});
  return finish(fight);
}

function applyExchange(fight, exchange, roll) {
  const enemy = fight.opponents[exchange.enemy], difference = exchange.allyTotal - exchange.enemyTotal;
  const rangedTie = fight.mode === 'ranged' && difference === 0;
  const outgoing = (difference > 0 || rangedTie) && exchange.unopposed !== 'enemy';
  const incoming = (difference < 0 || rangedTie) && exchange.unopposed !== 'ally';
  if (outgoing) enemy.health = Math.max(0, enemy.health - exchange.profile.damage);
  if (incoming && (fight.mode === 'ranged' || exchange.who !== 'hero' || enemy.lethalOnLostRound)) {
    const lethal = enemy.lethalOnHit || enemy.lethalOnLostRound && exchange.who === 'hero';
    injure(fight, exchange.who, Boolean(lethal), roll);
  }
  note(fight, {type: 'exchange', ...exchange, outgoing, incoming});
  finish(fight);
}

// A failed protagonist roll pauses before its effects when Right Stuff remains
// available. Accepting it or rerolling it never spends a second ENERGY payment.
export function advanceGroundFight(original, roll) {
  validateGroundFight(original);
  if (original.status !== 'fighting' || original.pending || !original.roundAction) throw new RangeError('No exchange is ready');
  const fight = copy(original);
  while (fight.queue.length && fight.status === 'fighting') {
    const slot = fight.queue.shift(), enemy = fight.opponents[slot.enemy];
    if (slot.unopposed === 'enemy') {
      const availableCrew = crewAlive(fight.player.copilot) && !fight.roundAction.copilotLow;
      const allies = ['hero', ...(availableCrew ? ['copilot'] : []), ...(trobbleActive(fight.player) ? ['trobble'] : [])];
      slot.who = fight.roundAction.heroAway ? 'copilot' : allies[rollIndex(allies.length, roll)];
    }
    if (!enemy || !alive(enemy) || slot.who === 'copilot' && !crewAlive(fight.player.copilot)
        || slot.who === 'trobble' && !trobbleActive(fight.player)) continue;
    const profile = attackProfile(fight, slot.who), opposing = enemyProfile(fight, enemy, roll);
    const automatic = slot.who === 'hero' && fight.roundAction.automaticHeroWin;
    const alliedDice = rollFists(automatic ? 0 : profile.fists, roll, profile), enemyDice = rollFists(automatic ? 0 : opposing.fists, roll, opposing);
    const exchange = {...slot, profile, opposing, alliedDice, enemyDice,
      allyTotal: profile.expertise + alliedDice.score, enemyTotal: opposing.expertise + enemyDice.score};
    if (automatic) {exchange.allyTotal = exchange.enemyTotal + 1; exchange.automatic = true;}
    if (slot.who === 'hero' && fight.player.rightStuffAvailable && exchange.allyTotal <= exchange.enemyTotal) {
      fight.pending = exchange; return fight;
    }
    applyExchange(fight, exchange, roll);
  }
  if (!fight.queue.length && !fight.pending) {
    fight.roundAction = null;
    if (fight.status === 'fighting' && fight.encounter.roundLimit && fight.round >= fight.encounter.roundLimit) fight.status = 'ended';
  }
  return fight;
}

export function decideGroundReroll(original, reroll, roll) {
  validateGroundFight(original);
  if (!original.pending || original.status !== 'fighting') throw new RangeError('No failed roll is awaiting a decision');
  const fight = copy(original), exchange = fight.pending;
  if (reroll) {
    if (!fight.player.rightStuffAvailable) throw new RangeError('Right Stuff has already been used');
    fight.player.rightStuffAvailable = false;
    exchange.alliedDice = rollFists(exchange.profile.fists, roll, exchange.profile);
    exchange.allyTotal = exchange.profile.expertise + exchange.alliedDice.score;
    exchange.rightStuffUsed = true;
  }
  fight.pending = null; applyExchange(fight, exchange, roll);
  return fight.status === 'fighting' ? advanceGroundFight(fight, roll) : fight;
}

export function leaveGroundFight(original, reason) {
  validateGroundFight(original);
  if (original.status !== 'fighting') throw new RangeError('This encounter has already ended');
  const fight = copy(original);
  const target = reason === 'surrender' ? fight.encounter.surrenderTarget : reason === 'escape' ? fight.encounter.retreatTarget : null;
  if (!target) throw new RangeError('No printed option for that encounter exit');
  fight.status = reason === 'surrender' ? 'loss' : 'ended'; fight.endingReason = reason;
  fight.queue = []; fight.pending = null; fight.roundAction = null;
  note(fight, {type: reason, section: target});
  return fight;
}

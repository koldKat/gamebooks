// Resolve the printed independent duels without advancing the story or granting campaign rewards.
import {duelInteger as integer, duelFighter as fighter, adjustStrengthEnergy,
  rollDuelDice, resolveDuelStrike} from '../../engines/viking-duel/core.js';

const outcomes = ['wide', 'edge', 'tie', 'behind'];
function branch(input) {
  if (!input || !['win', 'loss'].includes(input.result)) throw new RangeError('Invalid duel branch');
  integer(input.damage);
  if (input.section !== null) integer(input.section, 1, 422);
  if (input.fatal !== undefined && typeof input.fatal !== 'boolean') throw new RangeError('Invalid fatal branch');
  return input;
}

export function normalizeEncounter(input) {
  if (!input || !['opposed', 'ragnar'].includes(input.kind)) throw new RangeError('Invalid duel encounter');
  const encounter = structuredClone(input);
  encounter.key = String(input.key ?? '');
  encounter.name = String(input.name ?? '').trim().slice(0, 300);
  encounter.section = String(input.section ?? '');
  if (!encounter.name) throw new RangeError('Missing opponent name');
  if (encounter.kind === 'opposed') {
    integer(encounter.enemyBase); integer(encounter.strengthFactor, 1, 10); integer(encounter.energyFactor, 1, 10);
    for (const key of outcomes) branch(encounter.outcomes?.[key]);
  } else {
    const enemy = fighter(encounter);
    if (!enemy.energy) throw new RangeError('A duel requires a living opponent');
    for (const key of outcomes.slice(0, 3)) branch(encounter.outcomes?.[key]);
    const choices = encounter.outcomes?.behind;
    if (!Array.isArray(choices) || choices.length !== 2 || new Set(choices.map(choice => choice.section)).size !== 2) {
      throw new RangeError('Missing printed ambiguous outcomes');
    }
    choices.forEach(branch);
    integer(encounter.extendedWin, 1, 422); integer(encounter.deathSection, 1, 422);
  }
  return encounter;
}

export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !['quick', 'extended'].includes(fight.method)
      || !['fighting', 'win', 'loss'].includes(fight.status)) throw new RangeError('Invalid saved duel');
  normalizeEncounter(fight.encounter); fighter(fight.player);
  integer(fight.revision); integer(fight.round);
  if (!Array.isArray(fight.events) || fight.events.length > 200
      || !fight.opponent || typeof fight.opponent.name !== 'string' || typeof fight.opponent.section !== 'string') {
    throw new RangeError('Invalid duel history');
  }
  if (fight.encounter.kind === 'ragnar') fighter(fight.opponent);
  if (fight.status === 'fighting') {
    if (fight.result !== null || !fight.player.energy || fight.destination !== null) throw new RangeError('Invalid active duel');
  } else if (fight.result !== fight.status || fight.pending) throw new RangeError('Invalid duel result');
  if (fight.pending && (fight.encounter.kind !== 'ragnar' || fight.method !== 'quick'
      || !Array.isArray(fight.pending) || fight.pending.length !== 2)) throw new RangeError('Invalid pending decision');
  if (fight.method === 'extended' && fight.encounter.kind !== 'ragnar') throw new RangeError('Invalid extended duel');
  return fight;
}

export function startFight(playerInput, encounterInput, method = 'quick') {
  const player = fighter(playerInput), encounter = normalizeEncounter(encounterInput);
  if (!player.energy || !['quick', 'extended'].includes(method)
      || method === 'extended' && encounter.kind !== 'ragnar') throw new RangeError('Invalid duel setup');
  const opponent = {name:encounter.name, section:encounter.section};
  if (encounter.kind === 'ragnar') Object.assign(opponent, fighter(encounter));
  else opponent.base = encounter.enemyBase;
  return validateFight({rulesVersion:1, revision:0, round:0, method, encounter, player, opponent,
    status:'fighting', result:null, destination:null, dead:false, pending:null, events:[]});
}

function finish(fight, outcome) {
  fight.player.energy = Math.max(0, fight.player.energy - outcome.damage);
  fight.dead = Boolean(outcome.fatal) || fight.player.energy === 0;
  if (outcome.fatal) fight.player.energy = 0;
  fight.status = fight.result = fight.dead ? 'loss' : outcome.result;
  fight.destination = outcome.section;
  fight.pending = null;
}

export function combatAction(original, action, roll = () => Math.floor(Math.random() * 6) + 1) {
  validateFight(original);
  if (original.status !== 'fighting' || action?.expectedRevision !== original.revision) throw new RangeError('Stale duel action');
  const fight = structuredClone(original), encounter = fight.encounter;
  if (action.kind === 'choose') {
    const choice = fight.pending?.find(choice => choice.section === action.section);
    if (!choice) throw new RangeError('Choose a printed outcome');
    finish(fight, choice);
    fight.events.push({kind:'choice', section:choice.section, playerDamage:choice.damage, playerEnergy:fight.player.energy});
  } else {
    if (action.kind !== 'round' || fight.pending) throw new RangeError('No duel round available');
    if (encounter.kind === 'ragnar') {
      // Sections321-323 return to320, which prints this adjustment before each strike.
      const difference = adjustStrengthEnergy(fight.player, fight.opponent);
      fight.events.push({kind:'adjustment', difference, playerEnergy:fight.player.energy, enemyEnergy:fight.opponent.energy});
      if (!fight.player.energy) finish(fight, {result:'loss', section:encounter.deathSection, damage:0});
      else if (fight.method === 'extended' && !fight.opponent.energy) {
        finish(fight, {result:'win', section:encounter.extendedWin, damage:0});
      }
    }
    if (fight.status === 'fighting') {
      const {playerDie, enemyDie} = rollDuelDice(action, roll);
      const playerTotal = encounter.kind === 'opposed'
        ? encounter.strengthFactor * fight.player.strength + encounter.energyFactor * fight.player.energy + playerDie
        : (fight.method === 'extended' ? 2 * fight.player.strength : fight.player.strength + fight.player.energy) + playerDie;
      const enemyTotal = encounter.kind === 'opposed' ? encounter.enemyBase + enemyDie
        : (fight.method === 'extended' ? 2 * fight.opponent.strength : fight.opponent.strength + fight.opponent.energy) + enemyDie;
      const difference = playerTotal - enemyTotal;
      let playerDamage = 0, enemyDamage = 0;
      if (fight.method === 'extended') {
        ({playerDamage, enemyDamage} = resolveDuelStrike(fight.player, fight.opponent, difference));
        if (!fight.player.energy) finish(fight, {result:'loss', section:encounter.deathSection, damage:0});
        else if (!fight.opponent.energy) finish(fight, {result:'win', section:encounter.extendedWin, damage:0});
      } else {
        const key = difference > 1 ? 'wide' : difference === 1 ? 'edge' : difference === 0 ? 'tie' : 'behind';
        const outcome = encounter.outcomes[key];
        if (Array.isArray(outcome)) fight.pending = structuredClone(outcome);
        else {playerDamage = outcome.damage; finish(fight, outcome);}
      }
      fight.round++;
      fight.events.push({kind:'round', round:fight.round, playerDie, enemyDie, playerTotal, enemyTotal,
        playerDamage, enemyDamage, playerEnergy:fight.player.energy, enemyEnergy:fight.opponent.energy ?? null});
    }
  }
  fight.revision++; fight.events = fight.events.slice(-200);
  return validateFight(fight);
}

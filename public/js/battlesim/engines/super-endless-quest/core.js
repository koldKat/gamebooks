// Resolve optional Super Endless Quest encounters without advancing the story.
import {validateStagedQuestFight} from './steps.js';
const copy = value => structuredClone(value);
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const routeKeys = ['winSection', 'loseSection', 'fleeSection', 'surrenderSection'];

export function normalizeEncounter(input) {
  const name = String(input?.displayName ?? input?.name ?? '').trim();
  if (!name || name.length > 200) throw new RangeError('Invalid opponent name');
  const out = {name, target:integer(input.target, 2, 1000000), damageOnMiss:integer(input.damageOnMiss, 1, 1000000)};
  for (const key of routeKeys) if (input[key] != null) {
    if (!/^[1-9]\d{0,5}$/.test(String(input[key]))) throw new RangeError('Invalid printed destination');
    out[key] = String(input[key]);
  }
  for (const key of ['minimumHpToFight', 'minimumHpToFlee', 'forcedSurrenderBelowHp']) {
    if (input[key] != null) out[key] = integer(input[key], 1, 1000000);
  }
  if (input.section != null) out.section = String(input.section);
  if (input.preCombatSave) {
    const save = input.preCombatSave;
    if (save.dice !== 2 || save.sides !== 6 || save.skillBonus != null
        || save.printedFailureDamage != null || !/^[1-9]\d{0,5}$/.test(String(save.failureSection))) {
      throw new RangeError('Unsupported breath save');
    }
    out.preCombatSave = {dice:2, sides:6, successAtLeast:integer(save.successAtLeast, 2, 12), failureSection:String(save.failureSection)};
  }
  return out;
}

export function normalizeCharacter(input) {
  const maxHp = integer(input?.maxHp, 1, 1000000);
  return {maxHp, hp:integer(input.hp, 1, maxHp), fighting:integer(input.fighting, 1, 1000000),
    experience:integer(input.experience, 0, 1000000)};
}

export function startQuestFight(character, encounter) {
  const player = normalizeCharacter(character), opponent = normalizeEncounter(encounter);
  return {rulesVersion:1, initial:copy(player), player, opponent, status:'fighting',
    phase:opponent.preCombatSave ? 'save' : 'attack', round:0, events:[]};
}

function dicePair(dice, random) {
  if (dice === undefined) dice = Array.from({length:2}, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
    return Math.floor(value * 6) + 1;
  });
  if (!Array.isArray(dice) || dice.length !== 2) throw new RangeError('Two dice required');
  return dice.map(value => integer(value, 1, 6));
}

function applyRoll(fight, kind, dice, spent) {
  if (fight.status !== 'fighting' || fight.phase !== kind) throw new RangeError('No roll available');
  integer(spent, 0, fight.player.experience);
  if (kind === 'attack' && fight.player.hp < (fight.opponent.minimumHpToFight ?? 1)) {
    throw new RangeError('Not enough hit points to fight');
  }
  fight.player.experience -= spent;
  const total = dice[0] + dice[1] + spent + (kind === 'attack' ? fight.player.fighting : 0);
  const target = kind === 'save' ? fight.opponent.preCombatSave.successAtLeast : fight.opponent.target;
  const success = total >= target;
  if (kind === 'save') {
    if (success) fight.phase = 'attack';
    else { fight.status = 'loss'; fight.destination = fight.opponent.preCombatSave.failureSection; }
  } else {
    fight.round++;
    if (success) { fight.status = 'win'; fight.destination = fight.opponent.winSection; }
    else {
      fight.player.hp = Math.max(0, fight.player.hp - fight.opponent.damageOnMiss);
      if (!fight.player.hp) fight.status = 'loss';
    }
  }
  fight.events.push({kind, dice:[...dice], spent, total, target, success, round:fight.round,
    hp:fight.player.hp, experience:fight.player.experience});
  return fight;
}

function applyExit(fight, action) {
  if (fight.status !== 'fighting') throw new RangeError('Completed encounter');
  const opponent = fight.opponent;
  if (action !== 'cancelled') {
    if (fight.phase !== 'attack') throw new RangeError('Resolve the breath save first');
    const key = {loss:'loseSection', fled:'fleeSection', surrendered:'surrenderSection'}[action];
    if (!key || !opponent[key]) throw new RangeError('Unavailable printed option');
    if (action === 'loss' && !fight.events.some(event => event.kind === 'attack' && !event.success)) {
      throw new RangeError('A voluntary loss follows an unsuccessful attack');
    }
    if (action === 'fled' && fight.player.hp < (opponent.minimumHpToFlee ?? 1)) throw new RangeError('Too weak to flee');
    if (fight.player.hp < (opponent.forcedSurrenderBelowHp ?? 0) && !fight.round && action !== 'surrendered') {
      throw new RangeError('The printed option is surrender');
    }
    fight.destination = opponent[key];
  }
  fight.status = action;
  fight.events.push({kind:'exit', action, round:fight.round, hp:fight.player.hp, experience:fight.player.experience});
  return fight;
}

// Validate saved rolls by replaying them without generating dice or changing the run.
export function validateQuestFight(fight) {
  if (fight?.rulesVersion === 2) return validateStagedQuestFight(fight);
  if (fight?.rulesVersion !== 1 || !Array.isArray(fight.events) || fight.events.length > 100001) {
    throw new RangeError('Invalid saved encounter');
  }
  const replay = startQuestFight(fight.initial, fight.opponent);
  for (const event of fight.events) {
    if (event.kind === 'exit') applyExit(replay, event.action);
    else applyRoll(replay, event.kind, dicePair(event.dice), event.spent);
    if (JSON.stringify(replay.events.at(-1)) !== JSON.stringify(event)) throw new RangeError('Invalid saved roll');
  }
  for (const key of ['player', 'opponent', 'status', 'phase', 'round', 'destination']) {
    if (JSON.stringify(replay[key]) !== JSON.stringify(fight[key])) throw new RangeError('Invalid saved combat state');
  }
  return fight;
}

export function questRoll(fight, {expectedEvent, dice, spent = 0} = {}, random = Math.random) {
  validateQuestFight(fight);
  if (expectedEvent !== fight.events.length || fight.events.length >= 100000) throw new RangeError('Stale roll');
  // Validate the declaration before asking for random dice.
  integer(spent, 0, fight.player.experience);
  if (fight.status !== 'fighting' || fight.phase === 'attack'
      && fight.player.hp < (fight.opponent.minimumHpToFight ?? 1)) throw new RangeError('No attack available');
  return applyRoll(copy(fight), fight.phase, dicePair(dice, random), spent);
}

export function exitQuestFight(fight, action, expectedEvent) {
  validateQuestFight(fight);
  if (expectedEvent !== fight.events.length) throw new RangeError('Stale combat choice');
  return applyExit(copy(fight), action);
}

export function recoverQuestHp(character, amount) {
  integer(amount, 0, 1000000);
  const player = normalizeCharacter(character);
  return {...player, hp:Math.min(player.maxHp, player.hp + amount)};
}

import { customSixActionsEncounter } from './opponents.js';
import { SIX_ACTIONS_FIGHTS, SIX_ACTIONS_CHECKS, SIX_ACTIONS_WEAPONS, SIX_ACTIONS_RULES } from './roster.js';

const copy = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid SIX ACTIONS value');
  return value;
}
function dice(roll = () => Math.floor(Math.random() * 6) + 1) {
  const values = [integer(roll(6), 1, 6), integer(roll(6), 1, 6)];
  return { dice: values, total: values[0] + values[1] };
}
function validateCharacter(character, alive = true) {
  if (!character || !Object.hasOwn(SIX_ACTIONS_WEAPONS, character.weapon)) throw new RangeError('Invalid weapon');
  integer(character.wounds, 0, alive ? 2 : 3);
  integer(character.bombs); integer(character.grenades);
  return character;
}
export function newSixActionsCharacter({ wounds = 0, bombs = 12, grenades = 12, weapon = 'hk' } = {}) {
  return validateCharacter({ wounds, bombs, grenades, weapon }, false);
}
export function sixActionsBonus(character, modifiers, weapon = character.weapon) {
  validateCharacter(character);
  if (!Object.hasOwn(SIX_ACTIONS_WEAPONS, weapon)) throw new RangeError('Invalid weapon');
  const values = { health: [5, 3, 1][character.wounds], stealth: [4, 2, 0][character.wounds],
    marks: 2, melee: 3, throw: 1, weapon: SIX_ACTIONS_WEAPONS[weapon] };
  if (!Array.isArray(modifiers) || modifiers.some(key => !Object.hasOwn(values, key))) throw new RangeError('Invalid modifiers');
  return modifiers.reduce((total, key) => total + values[key], 0);
}
export function sixActionsCheck(character, section, roll) {
  validateCharacter(character);
  const context = SIX_ACTIONS_CHECKS.find(entry => entry.section === section);
  if (!context) throw new RangeError('Unknown source check');
  const result = dice(roll), bonus = sixActionsBonus(character, context.modifiers, context.weapon);
  return { ...result, bonus, total: result.total + bonus,
    section: result.total + bonus <= context.lower ? context.lowSection : context.highSection };
}
export function startSixActionsFight(character, section, options = {}) {
  validateCharacter(character);
  const source = customSixActionsEncounter(section, options.opponents) ?? SIX_ACTIONS_FIGHTS.find(entry => entry.section === section);
  if (!source) throw new RangeError('Unknown source encounter');
  const config = copy(source);
  if (config.manualSecondThreshold) config.secondThreshold = integer(options.secondThreshold, 2, 12);
  if (config.manualEnemies) config.enemies = integer(options.remainingEnemies, 1, 100);
  if (config.kind === 'knife') config.weapon = 'knife';
  const fight = { rulesVersion: 1, config, character: copy(character), status: 'fighting',
    round: 1, killed: 0, remaining: config.enemies, vehicleHits: 0, targetAlive: [true, true],
    groups: config.groups ? copy(SIX_ACTIONS_RULES.groups) : null, section: null };
  return fight;
}
function validateFight(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active SIX ACTIONS encounter');
  validateCharacter(fight.character);
  integer(fight.round, 1); integer(fight.killed); integer(fight.remaining); integer(fight.vehicleHits);
}
function end(fight, status, section) { fight.status = status; fight.section = section; }
function reinforce(fight) {
  const { config, round } = fight;
  let count = config.waves?.[round] || 0;
  if (round > 1 && (config.reinforcement === 'each'
      || config.reinforcement === 'even' && round % 2 === 0
      || config.reinforcement === 'odd' && round % 2 === 1
      || config.reinforcement === 'afterTwo' && round > 2)) count++;
  fight.remaining += count;
}
function shots(fight, options) {
  const { config, round } = fight;
  if (options.enemyShots !== undefined) return integer(options.enemyShots, 0, 100);
  if (config.manualShots) return integer(options.enemyShots, 0, 100);
  if (config.firstFree && round === 1) return 0;
  if (config.kind === 'knife') return fight.targetAlive.filter((alive, index) => alive && (index === 0 || round >= SIX_ACTIONS_RULES.knifeSecondRound)).length;
  if (config.fixedShots !== undefined) return config.fixedShots;
  if (config.firstShots !== undefined && round === 1) return Math.min(config.firstShots, fight.remaining);
  if (config.scheduledShots) return round >= 2 ? round : 0;
  if (config.collective) return fight.remaining > 0 ? 1 : 0;
  return fight.remaining;
}
function enemyPhase(fight, options, roll, result) {
  let count = shots(fight, options);
  if (fight.config.kind === 'knife') {
    for (const [index, alive] of fight.targetAlive.entries()) {
      if (!alive || index === 1 && fight.round < SIX_ACTIONS_RULES.knifeSecondRound) continue;
      if (!count--) break;
      const rolled = dice(roll), threshold = index === 0 ? fight.config.enemyThreshold : fight.config.secondThreshold;
      if (rolled.total >= threshold) fight.character.wounds++;
      result.enemy.push({ ...rolled, threshold, hit: rolled.total >= threshold, target: index });
      if (fight.character.wounds >= 3) break;
    }
  } else for (let index = 0; index < count; index++) {
    const rolled = dice(roll), hit = rolled.total >= fight.config.enemyThreshold;
    result.enemy.push({ ...rolled, threshold: fight.config.enemyThreshold, hit });
    if (hit) {
      if (fight.config.vehicleLimit) fight.vehicleHits++;
      else fight.character.wounds++;
    }
    if (fight.character.wounds >= 3) break;
  }
  if (fight.character.wounds >= 3) end(fight, 'loss', fight.config.loss);
}
function playerPhase(fight, options, roll, result) {
  const { config, round } = fight;
  if (config.kind === 'raft' || config.enemyOnlyFirst && round === 1) return;
  const grenade = options.grenade === true;
  if (grenade && (!config.grenade || !fight.character.grenades)) throw new RangeError('No grenade available');
  const target = config.kind === 'knife' ? integer(options.target ?? fight.targetAlive.findIndex(Boolean), 0, 1) : null;
  if (target !== null && !fight.targetAlive[target]) throw new RangeError('Target already defeated');
  if (config.groups && !['armour', 'jeep'].includes(options.group)) throw new RangeError('Select a source group');
  if (config.groups && fight.groups[options.group] === 0) throw new RangeError('Group already defeated');
  const rolled = dice(roll), bonus = sixActionsBonus(fight.character,
    grenade ? ['weapon', 'throw'] : config.modifiers,
    grenade ? 'grenade' : config.weapon || fight.character.weapon);
  const total = rolled.total + bonus + (config.modifier || 0), threshold = grenade ? 9 : config.playerThreshold;
  if (grenade) fight.character.grenades--;
  const kills = Math.min(fight.remaining, total >= threshold ? grenade ? 3
    : round === 1 && config.firstKills ? config.firstKills
    : round > 1 && config.laterKills ? config.laterKills : config.killsPerHit || 1 : 0);
  fight.killed += kills; fight.remaining -= kills;
  if (target !== null && kills) fight.targetAlive[target] = false;
  if (config.groups && kills) fight.groups[options.group]--;
  result.player = { ...rolled, bonus, total, threshold, kills };
}
export function sixActionsRound(fight, options = {}, roll) {
  validateFight(fight);
  const next = copy(fight), result = { fight: next, enemy: [], player: null };
  reinforce(next);
  if (next.config.enemyFirst || next.config.enemyOnlyFirst && next.round === 1) enemyPhase(next, options, roll, result);
  if (next.status !== 'fighting') return result;
  playerPhase(next, options, roll, result);
  const { config } = next;
  const reachedGoal = !config.rounds && (config.killGoal ? next.killed >= config.killGoal : next.remaining === 0)
    || config.survivorSection && next.remaining === 0;
  if (reachedGoal) {
    end(next, config.postCheck ? 'post-check' : 'win', config.postCheck ? null : config.win);
    return result;
  }
  if (!config.enemyFirst && !(config.enemyOnlyFirst && next.round === 1)) enemyPhase(next, options, roll, result);
  if (next.status !== 'fighting') return result;
  if (config.rounds && next.round >= config.rounds) {
    if (config.vehicleLimit) {
      const lost = next.vehicleHits >= config.vehicleLimit;
      end(next, lost ? 'loss' : 'win', lost ? config.loss : config.win);
    } else if (config.survivorSection && next.remaining) end(next, 'escaped', config.survivorSection);
    else end(next, 'win', config.win);
  } else next.round++;
  return result;
}
export function sixActionsPostCheck(fight, roll) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'post-check' || !fight.config.postCheck) throw new RangeError('No source post-combat check');
  const next = copy(fight), result = dice(roll);
  const total = result.total + sixActionsBonus(next.character, next.config.modifiers);
  const lost = total <= SIX_ACTIONS_RULES.postCheckLower;
  end(next, lost ? 'loss' : 'win', lost ? next.config.loss : next.config.win);
  return { ...result, total, fight: next };
}

import { customFreewayEncounter } from './opponents.js';
import { FREEWAY_FIGHTS, FREEWAY_CONTESTS, FREEWAY_RACES } from './roster.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Freeway Fighter value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { const values = [die(roll), die(roll)]; return { dice: values, total: values[0] + values[1] }; }
function validateCharacter(character, alive = true) {
  if (!character) throw new RangeError('No character');
  for (const key of ['skill', 'stamina', 'luck', 'firepower', 'armour']) {
    integer(character[key], alive && ['stamina', 'armour'].includes(key) ? 1 : 0);
    integer(character[key + 'Initial'], 1);
    if (character[key] > character[key + 'Initial']) throw new RangeError('Stat exceeds initial value');
  }
  for (const key of ['medkits', 'rockets', 'spikes', 'oil', 'credits']) integer(character[key]);
  if (typeof character.magnum !== 'boolean' || typeof character.knuckleduster !== 'boolean') throw new RangeError('Invalid equipment');
  return character;
}
export function newFreewayCharacter(roll) {
  const skill = die(roll) + 6, stamina = dice(roll).total + 24, luck = die(roll) + 6;
  const firepower = die(roll) + 6, armour = dice(roll).total + 24;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    firepower, firepowerInitial: firepower, armour, armourInitial: armour,
    medkits: 10, rockets: 4, spikes: 3, oil: 2, credits: 200, magnum: false, knuckleduster: false };
}
export function validateFreewayCharacter(character) { return validateCharacter(character, false); }
export function testFreewayLuck(character, roll) {
  validateCharacter(character);
  const next = clone(character), result = dice(roll), lucky = result.total <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return { ...result, lucky, character: next };
}
export function healFreewayCharacter(character, activeFight = null) {
  validateCharacter(character);
  if (activeFight?.status === 'fighting' || !character.medkits || character.stamina === character.staminaInitial) throw new RangeError('Cannot use a medkit');
  const next = clone(character);
  next.medkits--; next.stamina = Math.min(next.staminaInitial, next.stamina + 4);
  return next;
}
export function startFreewayFight(character, section, options = {}) {
  validateCharacter(character);
  const source = customFreewayEncounter(section, options) ?? FREEWAY_FIGHTS.find(entry => entry.section === section);
  if (!source) throw new RangeError('Unknown encounter');
  const config = clone(source);
  if (config.manualRounds) config.rounds = integer(options.rounds, 1, 100);
  if (config.knuckleduster) config.playerDamage = character.knuckleduster ? 2 : 1;
  return { rulesVersion: 1, config, character: clone(character), status: 'fighting',
    round: 0, hits: 0, playerLoss: 0, enemies: config.enemies.map(enemy => ({ ...enemy, loss: 0, defeated: false })), section: null };
}
function validateFight(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active encounter');
  validateCharacter(fight.character);
  integer(fight.round); integer(fight.hits); integer(fight.playerLoss);
  if (!(fight.config.custom && fight.config.section === 0 && ['hand','shoot','vehicle'].includes(fight.config.kind)) && !FREEWAY_FIGHTS.some(entry => entry.section === fight.config.section) || !Array.isArray(fight.enemies) || !fight.enemies.length) throw new RangeError('Invalid encounter');
  for (const enemy of fight.enemies) { integer(enemy.attack); integer(enemy.health); integer(enemy.loss); }
}
function finish(fight, status, section) {
  fight.status = status; fight.section = section ?? null;
  if (fight.config.woundPenalty && fight.hits > 1) fight.character.skill = Math.max(0, fight.character.skill - 1);
}
function defeated(enemy, config) { return enemy.health === 0 || config.kind === 'hand' && !config.deathFight && enemy.loss >= 6; }
function outcome(fight) {
  const { config, character } = fight;
  const pool = config.kind === 'vehicle' ? 'armour' : 'stamina';
  if (character[pool] === 0) { finish(fight, 'loss'); return; }
  if (config.kind === 'hand' && !config.deathFight && fight.playerLoss >= 6) { finish(fight, 'loss', config.loss); return; }
  if (fight.enemies.every(enemy => enemy.defeated) || config.rounds && fight.round >= config.rounds) finish(fight, 'win', config.win);
}
function targetIndex(fight, value) {
  const index = value === undefined ? fight.enemies.findIndex(enemy => !enemy.defeated) : integer(value, 0, fight.enemies.length - 1);
  if (index < 0 || fight.enemies[index].defeated) throw new RangeError('Target already defeated');
  if (!fight.config.simultaneous && index !== fight.enemies.findIndex(enemy => !enemy.defeated)) throw new RangeError('Fight enemies in printed order');
  return index;
}
function damage(config, who, roll) {
  return config[who + 'Damage'] ?? (config.kind === 'hand' ? 1 : die(roll));
}
export function freewayRound(fight, options = {}, roll) {
  validateFight(fight);
  const next = clone(fight), { config, character } = next;
  const target = targetIndex(next, options.target), rocket = options.rocket === true;
  if (rocket && (config.kind !== 'vehicle' || config.rockets === false || !character.rockets)) throw new RangeError('Rocket unavailable');
  next.round++;
  const result = { fight: next, attacks: [], rocket };
  const indices = config.simultaneous ? next.enemies.map((enemy, index) => enemy.defeated ? -1 : index).filter(index => index >= 0) : [target];
  if (rocket) {
    character.rockets--; next.enemies[target].health = 0; next.enemies[target].defeated = true;
  }
  const attack = config.kind === 'vehicle' ? character.firepower : character.skill;
  const modifier = (config.modifier || 0) + (next.round === 1 ? config.firstModifier || 0 : 0)
    + (config.kind === 'shoot' && character.magnum ? 1 : 0);
  for (const index of indices) {
    const enemy = next.enemies[index];
    if (enemy.defeated) continue;
    const enemyRoll = dice(roll), playerRoll = dice(roll);
    const playerAttack = playerRoll.total + attack + modifier, enemyAttack = enemyRoll.total + enemy.attack;
    let playerDamage = 0, enemyDamage = 0;
    if (enemyAttack > playerAttack) {
      enemyDamage = damage(config, 'enemy', roll);
      const pool = config.kind === 'vehicle' ? 'armour' : 'stamina';
      character[pool] = Math.max(0, character[pool] - enemyDamage);
      next.playerLoss += enemyDamage; next.hits++;
    } else if (playerAttack > enemyAttack && index === target && !rocket) {
      playerDamage = damage(config, 'player', roll);
      enemy.health = Math.max(0, enemy.health - playerDamage); enemy.loss += playerDamage;
      enemy.defeated = defeated(enemy, config);
    }
    result.attacks.push({ index, playerRoll, enemyRoll, playerAttack, enemyAttack, playerDamage, enemyDamage });
    outcome(next);
    if (next.status !== 'fighting') return result;
  }
  outcome(next);
  if (next.status === 'fighting' && !config.simultaneous && config.kind === 'hand' && next.enemies[target].defeated) next.playerLoss = 0;
  return result;
}
export function freewayContest(character, section, roll) {
  validateCharacter(character);
  const config = FREEWAY_CONTESTS.find(entry => entry.section === section);
  if (!config) throw new RangeError('Unknown contest');
  const playerDie = die(roll), enemyDie = die(roll);
  const playerAttack = playerDie + character.skill + config.modifier, enemyAttack = enemyDie + config.enemySkill;
  const won = playerAttack >= enemyAttack;
  return { playerDie, enemyDie, playerAttack, enemyAttack, won, section: won ? config.win : config.loss };
}
export function startFreewayRace(section) {
  const config = FREEWAY_RACES.find(entry => entry.section === section);
  if (!config) throw new RangeError('Unknown race');
  return { rulesVersion: 1, config: clone(config), player: 0, enemy: 0, round: 0, status: 'racing', section: null };
}
export function freewayRaceStep(race, roll) {
  if (race?.rulesVersion !== 1 || race.status !== 'racing') throw new RangeError('No active race');
  integer(race.player, 0, 23); integer(race.enemy, 0, 23); integer(race.round);
  const next = clone(race), enemyDie = die(roll);
  next.round++; next.enemy += enemyDie;
  if (next.enemy >= 24) { next.status = 'loss'; next.section = next.config.loss; return { race: next, enemyDie, playerDie: null }; }
  const playerDie = die(roll);
  next.player += playerDie + next.config.boost;
  if (next.player >= 24) { next.status = 'win'; next.section = next.config.win; }
  return { race: next, enemyDie, playerDie };
}

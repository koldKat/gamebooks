import {ABILITIES, RULES_REVISION} from './definition.js';

export function integer(value, min = 0, max = 1000000) {
  if (value == null || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new RangeError('Invalid combat value');
  return Number(value);
}

export function character(source) {
  const next = structuredClone(source);
  for (const key of ['skill', 'stamina', 'maxStamina', 'courage', 'luck', 'coins', 'healingUses', 'magicUses', 'invisibilityUses', 'leafUses', 'ointmentUses', 'balmUses', 'arrows']) next[key] = integer(next[key]);
  if (!next.maxStamina || next.stamina > next.maxStamina || !Array.isArray(next.abilities) || next.abilities.some(key => !ABILITIES.includes(key)) || new Set(next.abilities).size !== next.abilities.length || next.abilities.length > 3) throw new RangeError('Invalid character');
  next.scimitar = Boolean(next.scimitar);
  return next;
}

export const active = fight => Boolean(fight && !fight.outcome);

function requireActive(fight) {
  if (!active(fight) || fight.rulesVersion !== RULES_REVISION) throw new RangeError('No active fight');
  return structuredClone(fight);
}

export function settle(fight) {
  if (fight.player.stamina <= 0) fight.outcome = 'loss';
  while (fight.index < fight.enemies.length && fight.enemies[fight.index].stamina <= 0) fight.index++;
  if (!fight.outcome && fight.index === fight.enemies.length) fight.outcome = 'win';
  return fight;
}

export function startFight(player, enemies, options = {}) {
  const next = character(player);
  if (!next.stamina || !Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Invalid fight setup');
  const opponents = enemies.map(row => ({displayName: String(row.displayName || row.name || '').trim().slice(0, 200),
    skill: integer(row.skill), stamina: integer(row.stamina, 1)}));
  const rules = {...options, enemyDamage: integer(options.enemyDamage, 0, 1000), magicDamage: integer(options.magicDamage ?? 10, 0, 1000),
    playerDamageAdjustment: integer(options.playerDamageAdjustment ?? 0, -1000, 1000),
    physicalPlayerDamage: options.physicalPlayerDamage == null ? null : integer(options.physicalPlayerDamage, 0, 1000)};
  if (options.applyInjuries) {
    next.skill = Math.max(0, next.skill - integer(options.initialSkillLoss ?? 0));
    next.stamina = Math.max(0, next.stamina - integer(options.initialStaminaLoss ?? 0));
    next.courage = Math.max(0, next.courage - integer(options.initialCourageLoss ?? 0));
  }
  if (options.invisibility && next.stamina > 0) {
    if (!next.abilities.includes('invisibility') || !next.invisibilityUses) throw new RangeError('No invisibility');
    next.invisibilityUses--;
  }
  if (options.leaf && next.stamina > 0) {
    if (!next.leafUses) throw new RangeError('No leaf');
    next.leafUses--;
  }
  const arrows = next.stamina > 0 ? integer(options.archeryKills ?? 0, 0, opponents.length) : 0;
  if (arrows && (!options.archery || arrows > next.arrows)) throw new RangeError('Archery unavailable');
  next.arrows -= arrows;
  for (let index = 0; index < arrows; index++) opponents[index].stamina = 0;
  return settle({rulesVersion: RULES_REVISION, name: String(options.name || opponents.map(row => row.displayName).join(', ')).slice(0, 500),
    encounterId: options.encounterId ?? null, player: next, enemies: opponents, rules, index: 0, round: 0,
    outcome: null, recorded: false, skillPenaltyApplied: false, events: [{kind: 'start'}]});
}

export function exchange(fight, rolls) {
  const next = requireActive(fight);
  const playerRoll = integer(rolls.player, 1, 6), enemyRoll = integer(rolls.enemy, 1, 6);
  const enemy = next.enemies[next.index];
  const playerStrength = next.player.skill + (next.rules.invisibility ? 2 : 0) - playerRoll;
  const enemyStrength = enemy.skill - enemyRoll;
  let playerDamage = 0, enemyDamage = 0;
  next.round++;
  if (playerStrength > enemyStrength) {
    const weaponDamage = next.player.scimitar && next.rules.goldenScimitarBonusApplies !== false ? 4 : 3;
    playerDamage = Math.max(0, (next.rules.physicalPlayerDamage ?? weaponDamage) + next.rules.playerDamageAdjustment + (next.rules.leaf ? 1 : 0));
    enemy.stamina = Math.max(0, enemy.stamina - playerDamage);
    if (next.rules.firstWound && playerDamage > 0) {next.outcome = 'win'; next.finishReason = 'firstWound';}
  } else if (enemyStrength > playerStrength) {
    enemyDamage = next.rules.leaf ? 1 : next.rules.enemyDamage;
    next.player.stamina = Math.max(0, next.player.stamina - enemyDamage);
  }
  next.events = [{kind: 'round', round: next.round, enemy: enemy.displayName, playerRoll, enemyRoll, playerStrength, enemyStrength, playerDamage, enemyDamage}];
  settle(next);
  if (!next.outcome && !next.skillPenaltyApplied && next.rules.skillLossAfterRound && next.round >= next.rules.skillLossAfterRound) {
    next.player.skill = Math.max(0, next.player.skill - 1);
    next.skillPenaltyApplied = true;
    next.events.push({kind: 'skillLoss'});
  }
  return next;
}

export function castMagic(fight) {
  const next = requireActive(fight);
  if (!next.rules.magicAllowed || !next.player.abilities.includes('magic') || !next.player.magicUses) throw new RangeError('Magic unavailable');
  next.player.magicUses--;
  for (const enemy of next.enemies) enemy.stamina = Math.max(0, enemy.stamina - next.rules.magicDamage);
  next.events = [{kind: 'magic', damage: next.rules.magicDamage}];
  return settle(next);
}

export function abandon(fight) {
  const next = requireActive(fight);
  next.outcome = 'abandoned';
  next.events = [{kind: 'abandoned'}];
  return next;
}

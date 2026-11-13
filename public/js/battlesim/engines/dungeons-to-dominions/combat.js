// Resolve independent Dungeons to Dominions combats without changing story state.
const LIMIT = 1000000;
const STATUSES = new Set(['fighting', 'win', 'loss', 'fled', 'cancelled']);
const integer = (value, min = 0, max = LIMIT) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
function label(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new RangeError('Invalid combat name');
  return value.trim();
}
export function normalizeEncounter(source) {
  if (!source || !Array.isArray(source.profiles) || !source.profiles.length || source.profiles.length > 8) throw new RangeError('Invalid opponents');
  const result = structuredClone(source);
  result.name = label(source.name);
  result.section = integer(source.section ?? 0);
  result.profiles = source.profiles.map(row => ({...row, name:label(row.name), av:integer(row.av, -100, 100),
    armor:integer(row.armor, 0, 100), damage:integer(row.damage, 0, 100), hp:integer(row.hp, 1),
    missileDamage:row.missileDamage == null ? null : integer(row.missileDamage, 0, 100)}));
  result.rules = {...source.rules};
  const rules = result.rules;
  for (const key of ['firstAv', 'allAv', 'firstEnemyAv']) integer(rules[key] ?? 0, -100, 100);
  for (const key of ['nailsOnHit', 'nailsEachRound', 'venomLowThrough', 'venomHighFrom']) integer(rules[key] ?? 0, 0, 12);
  for (const key of ['sequential', 'bypassArmor', 'spores', 'firstAttackMiss', 'benefactor', 'halfIncoming',
    'halfOutgoing', 'silverBonus', 'spiderSurprise', 'stealthAmbush', 'missingWeapon', 'conditionalSurprise',
    'nailsRequireDamage', 'bruteWeakens', 'highConVenom']) {
    if (rules[key] != null && typeof rules[key] !== 'boolean') throw new RangeError('Invalid combat rule');
  }
  return result;
}
function validatePlayer(player, initial = false) {
  label(player.name);
  integer(player.hp, initial ? 1 : 0); integer(player.maxHp, player.hp || 1);
  integer(player.av, -100, 100); integer(player.missileAv, -100, 100);
  integer(player.armor, 0, 100); integer(player.damage, 0, 100);
  for (const key of ['shield', 'ammo', 'bombs']) integer(player[key]);
  for (const key of ['athletics', 'highCon', 'resistant', 'perception', 'hunting', 'stealth', 'spareWeapon',
    'warned', 'silverWeapon', 'elementalResistance', 'voyberry', 'halfOutgoing']) {
    if (typeof player[key] !== 'boolean') throw new RangeError('Invalid player option');
  }
}
export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !STATUSES.has(fight.status)) throw new RangeError('Invalid saved combat');
  validatePlayer(fight.player); normalizeEncounter(fight.opponent);
  integer(fight.revision, 0, Number.MAX_SAFE_INTEGER - 1); integer(fight.round, 0, Number.MAX_SAFE_INTEGER - 1);
  if (!Array.isArray(fight.enemies) || fight.enemies.length !== fight.opponent.profiles.length) throw new RangeError('Changed opponents');
  for (const [index, row] of fight.enemies.entries()) {
    if (row.name !== fight.opponent.profiles[index].name) throw new RangeError('Changed opponent');
    integer(row.hp); integer(row.av, -100, 100);
  }
  if (typeof fight.melee !== 'boolean' || typeof fight.distanceCheck !== 'boolean') throw new RangeError('Invalid distance');
  integer(fight.cloneRemaining, 0, 3);
  if (!Array.isArray(fight.events) || fight.events.length > 100) throw new RangeError('Invalid combat log');
  if (fight.status === 'fighting' && (!fight.player.hp || !fight.enemies.some(row => row.hp > 0))) throw new RangeError('Combat has ended');
  return fight;
}
export function startFight(player, encounter) {
  const defaults = {name:'Player', maxHp:player.hp, missileAv:player.av, shield:0, ammo:0, bombs:0,
    athletics:false, highCon:false, resistant:false, perception:false, hunting:false, stealth:false,
    spareWeapon:false, warned:false, silverWeapon:false, elementalResistance:false, voyberry:false, halfOutgoing:false};
  const current = {...defaults, ...structuredClone(player)};
  validatePlayer(current, true);
  const opponent = normalizeEncounter(encounter);
  return validateFight({rulesVersion:1, revision:0, round:0, status:'fighting', player:current, opponent,
    enemies:structuredClone(opponent.profiles), events:[], melee:false, distanceCheck:false,
    cloneRemaining:0, invulnerableNext:false, healingNext:false});
}
function diceRoller(provided, random, events, round) {
  const offsets = new Map();
  return kind => {
    const offset = offsets.get(kind) ?? 0;
    offsets.set(kind, offset + 1);
    const supplied = provided?.[kind];
    let dice;
    if (supplied !== undefined) {
      const list = Array.isArray(supplied?.[0]) ? supplied : [supplied];
      dice = list[offset];
      if (!Array.isArray(dice) || dice.length !== 2) throw new RangeError('Supply two dice per roll');
      dice.forEach(value => integer(value, 1, 6));
    } else {
      dice = [0, 0].map(() => {
        const value = random();
        if (!(value >= 0 && value < 1)) throw new RangeError('Invalid die generator');
        return Math.floor(value * 6) + 1;
      });
    }
    const total = dice[0] + dice[1];
    events.push({kind:'dice', roll:kind, dice:[...dice], total, round});
    return total;
  };
}
function playerDamage(fight, amount, events, cause) {
  integer(amount);
  if (fight.opponent.rules.halfIncoming) amount = Math.floor(amount / 2);
  const shield = Math.min(fight.player.shield, amount);
  fight.player.shield -= shield;
  const hp = Math.min(fight.player.hp, amount - shield);
  fight.player.hp -= hp;
  if (amount) events.push({kind:'damage', who:'player', hp, shield, amount, cause, round:fight.round});
  return amount;
}
function poisoned(fight, roll, events) {
  const rules = fight.opponent.rules;
  const fatal = total => rules.venomLowThrough ? total <= rules.venomLowThrough : total >= rules.venomHighFrom;
  const bonus = rules.highConVenom && fight.player.highCon ? 2 : 0;
  let deadly = fatal(roll('poison') + bonus);
  if (deadly && fight.player.resistant) deadly = fatal(roll('poisonResistance') + bonus);
  if (!deadly) return;
  if (rules.venomHighFrom && fight.player.voyberry) {
    fight.player.voyberry = false;
    events.push({kind:'antidote', round:fight.round});
  } else {
    fight.player.hp = 0;
    events.push({kind:'poisonDeath', round:fight.round});
  }
}
function avModifier(fight) {
  const rules = fight.opponent.rules, player = fight.player;
  return (rules.allAv ?? 0) + (fight.round === 1 ? rules.firstAv ?? 0 : 0)
    + (rules.spiderSurprise && !player.perception && !player.hunting && fight.round === 1 ? -1 : 0)
    + (rules.stealthAmbush && player.stealth && fight.round === 1 ? 2 : 0)
    + (rules.missingWeapon && !player.spareWeapon ? -2 : 0)
    + (rules.silverBonus && player.silverWeapon ? 1 : 0);
}
function outcome(fight) {
  if (fight.player.hp <= 0) fight.status = 'loss';
  else if (!fight.enemies.some(enemy => enemy.hp > 0)) fight.status = 'win';
  return fight.status !== 'fighting';
}
export function combatAction(previous, action, random = Math.random) {
  validateFight(previous);
  if (!action || previous.status !== 'fighting' || action.expectedRevision !== previous.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(previous), events = [], rules = fight.opponent.rules;
  if (action.kind === 'cancel') {
    fight.status = 'cancelled'; fight.revision++; return fight;
  }
  if (!['round', 'flee'].includes(action.kind)) throw new RangeError('Unknown combat action');
  const firstLiving = fight.enemies.findIndex(enemy => enemy.hp > 0);
  const target = action.target ?? firstLiving;
  integer(target, 0, fight.enemies.length - 1);
  if (!fight.enemies[target].hp || rules.sequential && target !== firstLiving) throw new RangeError('Invalid combat target');
  const mode = action.mode ?? 'melee';
  if (!['melee', 'missile', 'bomb'].includes(mode)) throw new RangeError('Unknown attack');
  if (action.kind === 'round' && mode === 'missile' && (!fight.player.ammo || fight.melee)) throw new RangeError('Missile attack unavailable');
  if (action.kind === 'round' && mode === 'bomb' && !fight.player.bombs) throw new RangeError('No fire bombs');
  fight.round++;
  const roll = diceRoller(action.dice, random, events, fight.round), enemy = fight.enemies[target];
  const invulnerable = fight.invulnerableNext, healing = fight.healingNext;
  fight.invulnerableNext = fight.healingNext = false;
  let missile = mode === 'missile', fleeing = action.kind === 'flee';
  if (fleeing) {
    const total = roll('flee') + (fight.player.athletics ? 2 : 0);
    if (total > 8) fight.status = 'fled';
    events.push({kind:'flee', success:total > 8, total, round:fight.round});
  } else {
    if (missile && fight.distanceCheck) {
      const total = roll('distance') + (fight.player.athletics ? 3 : 0);
      missile = total >= 10;
      events.push({kind:'distance', total, success:missile, round:fight.round});
    }
    if (!missile) fight.melee = true;
    if (missile) { fight.player.ammo--; fight.distanceCheck = true; }
    if (mode === 'bomb') fight.player.bombs--;
    const skipped = fight.round === 1 && (rules.firstAttackMiss || rules.conditionalSurprise && !fight.player.warned);
    const raw = skipped ? null : roll('player');
    const ownAv = (missile ? fight.player.missileAv : fight.player.av) + avModifier(fight);
    const enemyAv = enemy.av + (rules.benefactor && fight.cloneRemaining ? 2 : 0);
    const total = raw === null ? null : raw + ownAv - enemyAv;
    const hit = raw !== null && (raw === 12 || total >= 6);
    let damage = 0;
    if (!skipped || mode === 'bomb') {
      damage = mode === 'bomb' ? hit ? 8 : 4
        : hit ? Math.max(0, (missile ? Math.max(0, 3 + fight.player.missileAv) : fight.player.damage) * (raw === 12 ? 2 : 1) - enemy.armor) : 0;
      if (rules.halfOutgoing || fight.player.halfOutgoing) damage = Math.floor(damage / 2);
    }
    if (invulnerable) damage = 0;
    if (healing) enemy.hp = Math.min(LIMIT, enemy.hp + damage);
    else {
      enemy.hp = Math.max(0, enemy.hp - damage);
      fight.cloneRemaining = Math.max(0, fight.cloneRemaining - damage);
    }
    events.push({kind:'attack', who:'player', target, mode:missile ? 'missile' : mode === 'missile' ? 'melee' : mode,
      total, hit, skipped, damage, healing:Boolean(healing), critical:raw === 12, round:fight.round});
    if (mode === 'bomb' && !hit) playerDamage(fight, fight.player.elementalResistance ? 2 : 4, events, 'fireBomb');
    if (damage && !healing && rules.spores) {
      if (roll('spores') % 2 === 0) playerDamage(fight, fight.player.highCon ? 1 : 2, events, 'spores');
    }
    if (rules.bruteWeakens && enemy.hp > 0 && enemy.hp < fight.opponent.profiles[target].hp / 2 && enemy.av !== 1) {
      enemy.av = 1; events.push({kind:'bruteWeakens', round:fight.round});
    }
  }
  // A defeated sequential foe never gets a replacement's free counterattack.
  if (fight.status === 'fighting' && fight.player.hp > 0) {
    const attackers = fight.enemies.flatMap((row, index) => row.hp > 0 && (!rules.sequential || index === firstLiving) ? [index] : []);
    for (const index of attackers) {
      const row = fight.enemies[index];
      if (!fleeing && missile && row.missileDamage === null) continue;
      const raw = roll('enemy'), surpriseAv = fight.round === 1
        ? (rules.firstEnemyAv ?? 0) + (rules.conditionalSurprise && !fight.player.warned ? 1 : 0) : 0;
      const total = raw + row.av + surpriseAv + (rules.benefactor && fight.cloneRemaining ? 2 : 0)
        - fight.player.av - avModifier(fight);
      const hit = raw === 12 || total >= 6;
      const damage = hit ? Math.max(0, (missile && !fleeing ? row.missileDamage : row.damage) * (raw === 12 ? 2 : 1)
        - (rules.bypassArmor ? 0 : fight.player.armor)) : 0;
      events.push({kind:'attack', who:'enemy', target:index, total, hit, damage, critical:raw === 12, round:fight.round});
      const taken = playerDamage(fight, damage, events, 'attack');
      if (fight.player.hp > 0 && taken > 0 && (rules.venomLowThrough || rules.venomHighFrom)) poisoned(fight, roll, events);
      if (fight.player.hp > 0 && hit && rules.nailsOnHit && (!rules.nailsRequireDamage || taken > 0)) {
        if (roll('nails') % 2) playerDamage(fight, rules.nailsOnHit, events, 'nails');
      }
      if (!fight.player.hp) break;
    }
  }
  if (fight.status === 'fighting') {
    if (rules.nailsEachRound) {
      playerDamage(fight, rules.nailsEachRound, events, 'nails');
      for (const row of fight.enemies) if (row.hp > 0) row.hp = Math.max(0, row.hp - rules.nailsEachRound);
    }
    if (!outcome(fight) && rules.benefactor) {
      const total = roll('benefactor');
      if (total <= 4) fight.invulnerableNext = true;
      else if (total <= 7) fight.cloneRemaining = 3;
      else if (total <= 10) fight.healingNext = true;
      else if (fight.player.armor) fight.player.armor--;
      else playerDamage(fight, 2, events, 'acid');
      events.push({kind:'benefactor', total, round:fight.round});
      outcome(fight);
    }
  }
  fight.events = [...fight.events, ...events].slice(-100);
  fight.revision++;
  return validateFight(fight);
}

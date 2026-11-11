// Resolve optional BODY/SPIRIT encounters without advancing the story.
const statuses = new Set(['fighting', 'win', 'loss', 'cancelled']);
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw RangeError('Invalid combat value');
  return value;
};
const flag = value => {
  if (value !== undefined && typeof value !== 'boolean') throw RangeError('Invalid combat option');
  return value === true;
};
const spirit = value => {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value * 2) || value < 0 || value > 100000) {
    throw RangeError('Invalid SPIRIT');
  }
  return value;
};

export function normalizeAltimerActor(source) {
  if (!source || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200) {
    throw RangeError('Invalid combatant');
  }
  return {...structuredClone(source), name: source.name.trim(),
    body: integer(source.body, 0, 1000), hp: spirit(source.hp)};
}

function options(source = {}) {
  if (source.supportDamage !== undefined && !['none', 'others', 'all'].includes(source.supportDamage)) {
    throw RangeError('Invalid supporting opponents');
  }
  return {
    attackModifier: integer(source.attackModifier ?? 0, -1000, 1000),
    enemyModifier: integer(source.enemyModifier ?? 0, -1000, 1000),
    damageBonus: integer(source.damageBonus ?? 0, 0, 1000),
    damageReduction: integer(source.damageReduction ?? 0, 0, 1000),
    sucker: flag(source.sucker), allowWeakSpot: flag(source.allowWeakSpot),
    supportDamage: source.supportDamage ?? 'none', areaDamage: flag(source.areaDamage),
    shield: flag(source.shield), vest: flag(source.vest), healingPatch: flag(source.healingPatch),
  };
}

export function validateAltimerFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !statuses.has(fight.status)) throw RangeError('Invalid saved encounter');
  normalizeAltimerActor(fight.player);
  integer(fight.player.baseBody, 2, 10);
  if (fight.player.body > fight.player.baseBody) throw RangeError('Invalid temporary BODY');
  if (!fight.opponent || typeof fight.opponent.name !== 'string' || !fight.opponent.name.trim()
      || !Array.isArray(fight.opponent.enemies) || !Array.isArray(fight.enemies)
      || !fight.enemies.length || fight.enemies.length > 100
      || fight.enemies.length !== fight.opponent.enemies.length) throw RangeError('Invalid opponents');
  fight.opponent.enemies.forEach(normalizeAltimerActor);
  fight.enemies.forEach(normalizeAltimerActor);
  options(fight.options);
  flag(fight.weakSpot);
  integer(fight.target, 0, fight.enemies.length);
  integer(fight.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  integer(fight.round, 1, Number.MAX_SAFE_INTEGER - 1);
  if (fight.status === 'fighting') {
    if (!['player', 'enemy'].includes(fight.phase) || !fight.player.hp || !fight.player.body
        || !fight.enemies[fight.target]?.hp) throw RangeError('Invalid active combat phase');
  } else if (fight.phase !== 'complete') throw RangeError('Invalid completed combat phase');
  if (fight.status === 'win' && fight.enemies.some(enemy => enemy.hp > 0)) throw RangeError('Unfinished opponents');
  if (fight.status === 'loss' && fight.player.hp > 0 && !(fight.options.sucker && fight.player.body === 0)) {
    throw RangeError('Invalid combat loss');
  }
  if (!Array.isArray(fight.events) || fight.events.length > 100) throw RangeError('Invalid combat log');
  for (const event of fight.events) {
    integer(event.round, 1, fight.round);
    if (event.kind === 'cancel') continue;
    if (event.kind !== 'attack' || !['player', 'enemy'].includes(event.actor)
        || !Array.isArray(event.dice) || ![0, 2].includes(event.dice.length)
        || (!event.dice.length && !(fight.options.sucker && event.actor === 'enemy'))) {
      throw RangeError('Invalid attack log');
    }
    event.dice.forEach(value => integer(value, 1, 6));
    spirit(event.damage);
    spirit(event.spiritDamage);
    if (event.vestDie !== undefined) integer(event.vestDie, 1, 6);
    integer(event.enemy, 0, fight.enemies.length - 1);
  }
  return fight;
}

export function startAltimerFight(player, opponent, setup = {}) {
  const hero = normalizeAltimerActor(player);
  integer(hero.body, 2, 10); if (!hero.hp) throw RangeError('Enter current SPIRIT');
  if (!opponent || typeof opponent.name !== 'string' || !opponent.name.trim()
      || !Array.isArray(opponent.enemies) || !opponent.enemies.length || opponent.enemies.length > 100) {
    throw RangeError('Choose or enter an opponent');
  }
  const enemies = opponent.enemies.map(value => {
    const enemy = normalizeAltimerActor(value); if (!enemy.hp) throw RangeError('Enter opponent SPIRIT'); return enemy;
  });
  return validateAltimerFight({rulesVersion: 1, player: {...hero, baseBody: hero.body},
    opponent: {...structuredClone(opponent), name: opponent.name.trim(), enemies: structuredClone(enemies)},
    enemies, options: options(setup), weakSpot: false, target: 0,
    phase: 'player', status: 'fighting', round: 1, revision: 0, events: []});
}

function dieFor(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw RangeError('Invalid dice source');
  return Math.floor(value * 6) + 1;
}

function diceFor(action, random) {
  if (action.dice !== undefined) {
    if (!Array.isArray(action.dice) || action.dice.length !== 2) throw RangeError('Enter two dice');
    return action.dice.map(value => integer(value, 1, 6));
  }
  return Array.from({length: 2}, () => dieFor(random));
}

export function altimerAction(source, action, random = Math.random) {
  validateAltimerFight(source);
  if (source.status !== 'fighting' || action.expectedRevision !== source.revision) throw RangeError('Stale combat action');
  const fight = structuredClone(source);
  const complete = status => {
    fight.status = status; fight.phase = 'complete';
    if (status !== 'loss') fight.player.body = fight.player.baseBody;
  };
  if (action.kind === 'cancel') {
    complete('cancelled');
    fight.events = [...fight.events.slice(-99), {kind: 'cancel', round: fight.round}];
  } else if (action.kind === 'attack') {
    const actor = fight.phase, enemy = fight.enemies[fight.target], config = fight.options;
    const event = {kind: 'attack', actor, round: fight.round, enemy: fight.target, dice: [], damage: 0, spiritDamage: 0};
    if (actor === 'player') {
      fight.weakSpot = flag(action.weakSpot);
      if (fight.weakSpot && (!config.allowWeakSpot || config.sucker)) throw RangeError('Weak-spot technique unavailable');
      event.dice = diceFor(action, random);
      const total = event.dice[0] + event.dice[1] + fight.player.body + config.attackModifier
        - enemy.body - (fight.weakSpot ? 2 : 0);
      event.damage = Math.max(0, total); event.weakSpot = fight.weakSpot;
      if (fight.weakSpot) enemy.body = Math.max(0, enemy.body - event.damage);
      // The energy baton always adds SPIRIT damage, even with a BODY-targeting blow.
      event.spiritDamage = (fight.weakSpot ? 0 : event.damage) + config.damageBonus;
      enemy.hp = Math.max(0, enemy.hp - event.spiritDamage);
      if (config.areaDamage) {
        for (const other of fight.enemies) {
          if (other !== enemy && other.hp > 0) other.hp = Math.max(0, other.hp - event.spiritDamage);
        }
      }
      if (!enemy.hp) {
        do {fight.target++;} while (fight.target < fight.enemies.length && !fight.enemies[fight.target].hp);
        if (fight.target === fight.enemies.length) complete('win');
        else {fight.phase = 'player'; fight.round++; fight.weakSpot = false;}
      } else {
        if (config.sucker) fight.player.body = Math.max(0, fight.player.body - 1);
        if (!fight.player.body) complete('loss');
        else fight.phase = 'enemy';
      }
    } else if (config.sucker) {
      // This creature drains BODY instead of making an ordinary damaging attack.
      fight.player.body = Math.max(0, fight.player.body - 1);
      if (!fight.player.body) complete('loss');
      else {fight.phase = 'player'; fight.round++; fight.weakSpot = false;}
    } else {
      event.dice = diceFor(action, random);
      let damage = Math.max(0, event.dice[0] + event.dice[1] + enemy.body + config.enemyModifier
        - (fight.player.body - (fight.weakSpot ? 2 : 0)));
      if (damage > 0 && ['others', 'all'].includes(config.supportDamage)) {
        damage += fight.enemies.filter(other => other.hp > 0).length - (config.supportDamage === 'others' ? 1 : 0);
      }
      damage = Math.max(0, damage - config.damageReduction - (config.shield ? 1 : 0));
      if (damage > 0 && config.vest) {
        event.vestDie = action.vestDie === undefined ? dieFor(random) : integer(action.vestDie, 1, 6);
        if (event.vestDie >= 4) damage = Math.max(0, damage - 4);
      }
      event.damage = config.healingPatch ? damage / 2 : damage;
      event.spiritDamage = event.damage;
      fight.player.hp = Math.max(0, fight.player.hp - event.damage);
      if (!fight.player.hp) complete('loss');
      else {fight.phase = 'player'; fight.round++; fight.weakSpot = false;}
    }
    event.playerBody = fight.player.body; event.playerHp = fight.player.hp;
    event.enemyBody = enemy.body; event.enemyHp = enemy.hp;
    fight.events = [...fight.events.slice(-99), event];
  } else throw RangeError('Unknown combat action');
  fight.revision++;
  return validateAltimerFight(fight);
}

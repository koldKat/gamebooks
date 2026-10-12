const attributes = ['strength', 'mentality', 'dexterity'];
const die = random => Math.floor(random() * 6) + 1;
const dice = random => [die(random), die(random)];
const total = rolls => rolls.reduce((a, b) => a + b, 0);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;

export const SHADOWS_WEAPONS = Object.freeze({
  fists: { stamina: 2, endurance: 0 },
  knobkerrie: { stamina: 3, endurance: 0 },
  spiritSpear: { stamina: 0, endurance: '1d6+2' },
  hunterSpear: { stamina: 0, endurance: 4 },
  revolver: { stamina: '2d6', endurance: 0 },
});

export const SHADOWS_ENCOUNTERS = Object.freeze([
  { id: 34, name: 'hunters', mode: 'ordinary', win: 117, death: 57, insanity: 84,
    enemies: [
      { name: 'hunter1', endurance: 10, dexterity: 5, damage: { stamina: 1, endurance: 2 } },
      { name: 'hunter2', endurance: 7, dexterity: 8, damage: { stamina: 1, endurance: 2 } },
    ] },
  { id: 61, name: 'madman', mode: 'ordinary', opening: true, enemyFirst: true, win: 8,
    enemies: [{ name: 'madman', strength: 7, stamina: 5, dexterity: 7, damage: { stamina: 4, endurance: 0 } }] },
  { id: 197, name: 'hobgoblin', mode: 'ordinary', enemyFirst: true, win: 214, death: 370, insanity: 370,
    enemies: [{ name: 'hobgoblin', mentality: 9, endurance: 18, disbelief: true, damage: { stamina: 2, endurance: 0 } }] },
  { id: 257, name: 'changeling', mode: 'ordinary', opening: true, win: 340, death: 275,
    enemies: [{ name: 'changeling', copyPlayer: true, damage: { stamina: 2, endurance: 0 } }] },
  { id: 337, name: 'mutant', mode: 'ordinary', unarmed: true, win: 276, diningWin: 313,
    enemies: [{ name: 'mutant', strength: 7, stamina: 8, dexterity: 7, damage: { stamina: 2, endurance: 0 } }] },
  { id: 24, name: 'quarryMutant', mode: 'twoStrikes', win: 63, continuation: 2,
    enemies: [{ name: 'quarryMutant', stamina: 12 }] },
  { id: 106, name: 'ambushMutant', mode: 'gunOnly', win: 74, continuation: 95,
    enemies: [{ name: 'ambushMutant', stamina: 10 }] },
  { id: 15, name: 'lurker', mode: 'lurker', win: 111,
    enemies: [{ name: 'lurker', stamina: 20, dexterity: 8, damage: { stamina: 4, endurance: 0 } }] },
  { id: 146, name: 'quarryAlien', mode: 'gunOnly', win: 256, continuation: 119,
    enemies: [{ name: 'quarryAlien', stamina: 12 }] },
  { id: 270, name: 'mineAlien', mode: 'gunOnly', win: 127, continuation: 352,
    enemies: [{ name: 'mineAlien', stamina: 12 }] },
  { id: 331, name: 'reservoirCreature', mode: 'gunOnly', win: 290, continuation: 312,
    enemies: [{ name: 'reservoirCreature', stamina: 12 }] },
].map(spec => Object.freeze({ ...spec, enemies: Object.freeze(spec.enemies.map(enemy => Object.freeze(enemy))) })));

export function createShadowsCharacter(random = Math.random) {
  const player = { bullets: 0, revolver: false, spiritSpear: false, hunterSpear: false,
    weapon: 'knobkerrie', knobkerrieDamage: 3 };
  for (const key of attributes) player[key] = die(random) + 3;
  player.stamina = player.maxStamina = player.strength * 2;
  player.endurance = player.maxEndurance = player.mentality * 2;
  return player;
}

function validate(player, alive = true) {
  for (const key of [...attributes, 'stamina', 'endurance', 'maxStamina', 'maxEndurance', 'bullets']) {
    if (!integer(player[key])) throw new RangeError('Invalid character');
  }
  if (attributes.some(key => player[key] > 9) || player.bullets > 6
    || player.stamina > player.maxStamina || player.endurance > player.maxEndurance
    || ![3, 4].includes(player.knobkerrieDamage)
    || alive && (player.stamina <= 0 || player.endurance <= 0)) throw new RangeError('Invalid character');
}

export function shadowsThreshold(attacker, defender) {
  if (![attacker, defender].every(value => integer(value, 2) && value <= 12)) {
    throw new RangeError('Rating outside the printed conflict table');
  }
  const difference = attacker - defender;
  return difference >= 6 ? 12 : difference <= -6 ? 0 : difference > 0 ? 6 + difference : 7 + difference;
}

export function shadowsTest(player, key, random = Math.random, modifier = 0) {
  if (!attributes.includes(key) || !integer(player[key]) || !Number.isSafeInteger(modifier)) throw new RangeError('Invalid attribute');
  const rolls = dice(random);
  return { rolls, total: total(rolls), success: total(rolls) <= player[key] + modifier };
}

export function shadowsConflict(attacker, defender, random = Math.random) {
  const threshold = shadowsThreshold(attacker, defender), rolls = dice(random);
  return { rolls, total: total(rolls), threshold, success: total(rolls) <= threshold };
}

export function recoverShadows(player) {
  validate(player);
  const stamina = Math.floor((player.maxStamina - player.stamina) / 2);
  const endurance = Math.floor((player.maxEndurance - player.endurance) / 2);
  player.stamina += stamina; player.endurance += endurance;
  return { stamina, endurance };
}

export function equipShadows(player, weapon) {
  if (!SHADOWS_WEAPONS[weapon] || ['revolver', 'spiritSpear', 'hunterSpear'].includes(weapon) && !player[weapon]) return false;
  player.weapon = weapon; return true;
}

const aliveEnemy = enemy => (enemy.stamina ?? enemy.endurance) > 0;
export function shadowsTargets(fight) {
  return fight.enemies.flatMap((enemy, index) => aliveEnemy(enemy) ? [{ enemy, index }] : []);
}

export function settleShadows(fight) {
  if (fight.status !== 'fighting') return;
  if (fight.player.stamina <= 0 || fight.player.endurance <= 0) {
    fight.status = 'loss';
    fight.destination = fight.player.stamina <= 0 ? fight.spec.death ?? 219 : fight.spec.insanity ?? 233;
  } else if (!shadowsTargets(fight).length) {
    fight.status = 'win'; fight.destination = fight.options.diningRoom ? fight.spec.diningWin ?? fight.spec.win : fight.spec.win;
  }
}

function nextRound(fight) {
  settleShadows(fight);
  if (fight.status !== 'fighting') return;
  const enemies = shadowsTargets(fight).map(row => row.index);
  fight.queue = fight.spec.enemyFirst ? [...enemies, -1] : [-1, ...enemies];
  fight.round++;
}

export function startShadowsFight(player, id, options = {}) {
  validate(player);
  const spec = SHADOWS_ENCOUNTERS.find(row => row.id === Number(id));
  if (!spec) throw new RangeError('Unknown encounter');
  const fight = { version: 1, player: structuredClone(player), spec: structuredClone(spec),
    options: { diningRoom: !!options.diningRoom }, status: 'fighting', round: 0, queue: [],
    opening: !!spec.opening, strikes: 0, enemies: spec.enemies.map(enemy => enemy.copyPlayer
      ? { ...enemy, strength: player.strength, stamina: player.stamina, dexterity: player.dexterity }
      : { ...enemy }) };
  if (spec.mode === 'lurker') fight.phase = 'slime';
  if (options.remainingHealth !== undefined) {
    if (spec.enemies.length !== 1 || spec.enemies[0].copyPlayer) throw new RangeError('This encounter cannot override enemy health');
    const key = spec.enemies[0].stamina === undefined ? 'endurance' : 'stamina';
    const value = options.remainingHealth;
    if (!Number.isFinite(value) || value <= 0 || value > spec.enemies[0][key]) throw new RangeError('Invalid remaining enemy health');
    fight.enemies[0][key] = value;
  }
  if (spec.unarmed) fight.player.weapon = 'fists';
  if (spec.mode === 'ordinary' && !fight.opening) nextRound(fight);
  return fight;
}

export function resolveShadowsOpening(fight, random = Math.random, flee = false) {
  if (fight.status !== 'fighting' || !fight.opening) return null;
  const result = shadowsTest(fight.player, 'dexterity', random);
  fight.opening = false;
  if (fight.spec.id === 61 && result.success) { fight.status = 'win'; fight.destination = 8; }
  else if (fight.spec.id === 257 && result.success && flee) { fight.status = 'escaped'; fight.destination = 291; }
  else {
    if (fight.spec.id === 257) {
      if (!result.success) fight.player.weapon = 'fists';
      else fight.player.weapon = 'knobkerrie';
    }
    nextRound(fight);
  }
  return result;
}

function applyDamage(target, damage) {
  for (const key of ['stamina', 'endurance']) if (target[key] !== undefined) target[key] = Math.max(0, target[key] - (damage[key] ?? 0));
}

function playerStrike(fight, index, random, multiplier = 1) {
  const player = fight.player, enemy = fight.enemies[index];
  if (!enemy || !aliveEnemy(enemy)) return null;
  const weapon = SHADOWS_WEAPONS[player.weapon];
  if (!weapon || player.weapon === 'revolver' && (!player.revolver || player.bullets < 1)
    || ['spiritSpear', 'hunterSpear'].includes(player.weapon) && !player[player.weapon]) return null;
  if (player.weapon === 'revolver') player.bullets--;
  const test = shadowsTest(player, 'dexterity', random), damage = { stamina: 0, endurance: 0 };
  if (test.success) {
    for (const key of ['stamina', 'endurance']) {
      const value = player.weapon === 'knobkerrie' && key === 'stamina' ? player.knobkerrieDamage : weapon[key];
      damage[key] = (value === '2d6' ? total(dice(random)) : value === '1d6+2' ? die(random) + 2 : value)
        * (test.rolls.every(value => value === 1) ? 2 : 1) * multiplier;
    }
    applyDamage(enemy, damage);
  }
  return { ...test, actor: -1, target: index, damage };
}

export function shootShadowsTarget(player, random = Math.random) {
  if (!player.revolver || player.bullets < 1 || player.stamina <= 0 || player.endurance <= 0) return null;
  player.bullets--;
  const result = shadowsTest(player, 'dexterity', random);
  const damageRolls = result.success ? dice(random) : [];
  return { ...result, damageRolls, damage: total(damageRolls) * (result.rolls.every(value => value === 1) ? 2 : 1) };
}

export function shadowsAttack(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.opening || fight.spec.mode !== 'ordinary') return null;
  const actor = fight.queue[0];
  let result;
  if (actor === -1) {
    result = playerStrike(fight, target, random);
    if (!result) return null;
  } else {
    const enemy = fight.enemies[actor];
    if (!enemy || !aliveEnemy(enemy)) return null;
    const test = enemy.disbelief ? shadowsConflict(enemy.mentality, fight.player.mentality, random)
      : shadowsTest(enemy, 'dexterity', random);
    const damage = test.success ? { ...enemy.damage } : { stamina: 0, endurance: 0 };
    if (test.success && !enemy.disbelief && test.rolls.every(value => value === 1)) for (const key of Object.keys(damage)) damage[key] *= 2;
    if (enemy.disbelief && !test.success) enemy.endurance = Math.max(0, enemy.endurance - 1);
    applyDamage(fight.player, damage);
    result = { ...test, actor, target: -1, damage, disbelief: !!enemy.disbelief && !test.success };
  }
  fight.queue.shift(); settleShadows(fight);
  fight.queue = fight.queue.filter(index => index === -1 || aliveEnemy(fight.enemies[index]));
  if (!fight.queue.length) nextRound(fight);
  return result;
}

export function shadowsScriptStrike(fight, random = Math.random) {
  if (fight.status !== 'fighting' || !['twoStrikes', 'gunOnly'].includes(fight.spec.mode)) return null;
  if (fight.spec.mode === 'gunOnly' && fight.player.weapon !== 'revolver') return null;
  const result = playerStrike(fight, 0, random); if (!result) return null;
  fight.strikes++; settleShadows(fight);
  if (fight.status === 'fighting' && fight.spec.mode === 'twoStrikes' && fight.strikes >= 2) {
    fight.status = 'continue'; fight.destination = fight.spec.continuation;
  }
  return result;
}

export function finishShadowsShots(fight) {
  if (fight.status !== 'fighting' || fight.spec.mode !== 'gunOnly') return false;
  fight.status = 'continue'; fight.destination = fight.spec.continuation; return true;
}

export function shadowsLurker(fight, action, random = Math.random) {
  if (fight.status !== 'fighting' || fight.spec.mode !== 'lurker') return null;
  const enemy = fight.enemies[0], player = fight.player;
  let result;
  if (action === 'slime' && fight.phase === 'slime') {
    const streams = [shadowsTest(enemy, 'dexterity', random), shadowsTest(enemy, 'dexterity', random)];
    const hits = streams.filter(stream => stream.success).length, damage = { stamina: hits * 4, endurance: 0 };
    applyDamage(player, damage); fight.phase = hits ? 'held' : 'choice';
    result = { streams, damage, destination: hits ? 32 : null };
  } else if (action === 'breakFree' && fight.phase === 'held') {
    result = shadowsConflict(player.strength, 12, random);
    fight.phase = result.success ? 'escape' : 'knockdown';
    result.destination = result.success ? 53 : 159;
  } else if (action === 'resist' && fight.phase === 'knockdown') {
    const attack = shadowsConflict(10, player.strength, random);
    result = { ...attack, success: !attack.success, destination: attack.success ? 170 : 32 };
    if (attack.success) { player.stamina = 0; fight.status = 'loss'; fight.destination = 170; }
    else fight.phase = 'lastBreakFree';
  } else if (action === 'breakFree' && fight.phase === 'lastBreakFree') {
    result = shadowsConflict(player.strength, 12, random);
    fight.status = 'continue'; fight.destination = result.success ? 53 : 159;
    result.destination = fight.destination;
  } else if (action === 'escape' && ['choice', 'escape'].includes(fight.phase)) {
    result = shadowsTest(player, 'dexterity', random);
    fight.status = 'continue'; fight.destination = result.success ? 79 : 99;
    result.destination = fight.destination;
  } else if (action === 'salt' && fight.phase === 'choice') {
    const test = shadowsTest(player, 'dexterity', random);
    const rolls = test.success ? dice(random) : [], damage = { stamina: total(rolls), endurance: 0 };
    applyDamage(enemy, damage); fight.phase = 'slime';
    result = { ...test, damageRolls: rolls, damage, destination: test.success ? 41 : 4, manualInventory: true };
  } else if (action === 'gun' && fight.phase === 'choice' && player.weapon === 'revolver') {
    result = playerStrike(fight, 0, random, 0.25);
    if (!result) return null;
    fight.phase = 'gun';
  } else if (action === 'gun' && fight.phase === 'gun' && player.weapon === 'revolver') {
    result = playerStrike(fight, 0, random, 0.25);
    if (!result) return null;
  } else if (action === 'finishShots' && fight.phase === 'gun') {
    fight.phase = 'slime'; result = { destination: 15 };
  } else return null;
  settleShadows(fight);
  return result;
}

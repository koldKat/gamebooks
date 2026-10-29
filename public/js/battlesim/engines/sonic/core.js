const copy = value => structuredClone(value);

function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Sonic value');
  return value;
}

function die(roll) { return integer(roll(6), 1, 6); }
const randomDie = () => Math.floor(Math.random() * 6) + 1;

export function sonicCharacter(values) {
  if (!values || !values.abilities || !Object.keys(values.abilities).length) throw new TypeError('Missing abilities');
  const character = copy(values);
  for (const value of Object.values(character.abilities)) integer(value, 0, 99);
  integer(character.lives); integer(character.rings);
  integer(character.elapsed ?? 0);
  integer(character.favourBonus ?? 0, 0, 9);
  character.shield = Boolean(character.shield);
  return character;
}

export function sonicHit(character) {
  const next = sonicCharacter(character);
  if (!next.lives) throw new RangeError('No lives remaining');
  if (next.shield) next.shield = false;
  else if (next.rings) next.rings = 0;
  else next.lives--;
  return next;
}

export function sonicExtraLife(character, cost) {
  const next = sonicCharacter(character);
  integer(cost, 1);
  if (!next.lives || next.rings < cost) throw new RangeError('Not enough rings');
  next.rings -= cost; next.lives++;
  return next;
}

export function sonicCheck(character, ability, target, roll = randomDie, bonus = 0) {
  const hero = sonicCharacter(character);
  if (!Object.hasOwn(hero.abilities, ability)) throw new RangeError('Unknown ability');
  integer(target, 1); integer(bonus, -99, 99);
  const dice = die(roll), total = dice + hero.abilities[ability] + bonus + (hero.favourBonus ?? 0);
  return { dice, total, target, success: total >= target };
}

function validateEncounter(encounter, character) {
  if (!encounter || !Object.hasOwn(character.abilities, encounter.ability)) throw new RangeError('Unknown combat ability');
  if (!Array.isArray(encounter.enemies) || !encounter.enemies.length) throw new RangeError('Missing opponents');
  for (const enemy of encounter.enemies) {
    if (typeof enemy.name !== 'string' || !enemy.name.trim()) throw new RangeError('Missing opponent name');
    integer(enemy.rating, 1, 99); integer(enemy.hits, 1, 99);
  }
  integer(encounter.bonus ?? 0, -99, 99);
  integer(encounter.firstAttackModifier ?? 0, -99, 99);
  if (encounter.enemyCounterThreshold === undefined) throw new RangeError('Missing counterattack rule');
  integer(encounter.enemyCounterThreshold, 1, 999);
}

export function sonicEffects(character, effects, roll = randomDie) {
  let hero = sonicCharacter(character);
  for (const effect of effects ?? []) {
    if (!hero.lives) break;
    if (effect.kind === 'hit') hero = sonicHit(hero);
    else if (effect.kind === 'shield') hero.shield = true;
    else if (effect.kind === 'rings') hero.rings = Math.max(0, hero.rings + integer(effect.amount, -1000000));
    else if (effect.kind === 'minutes') hero.elapsed = (hero.elapsed ?? 0) + integer(effect.amount);
    else if (effect.kind === 'randomRings') {
      let amount = integer(effect.bonus ?? 0);
      for (let i = 0; i < integer(effect.dice, 1, 10); i++) amount += die(roll) + (hero.favourBonus ?? 0);
      hero.rings += amount;
    } else throw new RangeError('Unknown source effect');
  }
  return sonicCharacter(hero);
}

export function startSonicFight(character, encounter, { applyEntryEffects = false, roll = randomDie } = {}) {
  let hero = sonicCharacter(character);
  if (!hero.lives) throw new RangeError('No lives remaining');
  validateEncounter(encounter, hero);
  if (applyEntryEffects) {
    let receipt = hero.appliedDamageSection === String(encounter.section);
    const effects = (encounter.entryEffects ?? []).filter(effect => {
      if (receipt && effect.kind === 'hit') { receipt = false; return false; }
      return true;
    });
    hero = sonicEffects(hero, effects, roll);
  }
  delete hero.appliedDamageSection;
  return { rulesVersion: 1, character: hero, config: copy(encounter),
    opponents: encounter.enemies.map(enemy => ({ ...copy(enemy), remainingHits: enemy.hits, started: false })),
    status: hero.lives ? 'fighting' : 'loss', round: 0, attackRolls: 0, hitsTaken: 0, section: null, history: [] };
}

function finish(fight, status, section) {
  fight.status = status; fight.section = section == null ? null : String(section);
}

function resolveHit(fight, roll, event) {
  const branches = fight.config.hitBranches;
  let branch;
  if (branches?.length) {
    event.branchDice = die(roll);
    branch = branches.find(entry => entry.dice.includes(event.branchDice));
    if (!branch) throw new RangeError('Missing hit branch');
  }
  const ignored = Boolean(fight.character.shield && (branch?.damage ?? true));
  if (branch?.damage ?? true) fight.character = sonicHit(fight.character);
  if (ignored) { event.shieldUsed = true; return; }
  fight.hitsTaken++;
  if (!fight.character.lives) { finish(fight, 'loss', fight.config.loss); return; }
  if (branch) {
    if (branch.bonus !== undefined) {
      fight.config.bonus = integer(branch.bonus, -99, 99);
      fight.companionBonus = fight.config.bonus;
    }
    if (branch.damage) fight.character.appliedDamageSection = String(branch.section);
    finish(fight, branch.endFight ? 'loss' : 'paused', branch.section);
  } else if (fight.config.stopAfterHits && fight.hitsTaken >= fight.config.stopAfterHits) {
    if (fight.config.damageSection) fight.character.appliedDamageSection = String(fight.config.damageSection);
    finish(fight, 'loss', fight.config.hitSection);
  }
}

export function sonicRound(saved, { target } = {}, roll = randomDie) {
  if (saved?.rulesVersion !== 1 || saved.status !== 'fighting') throw new RangeError('No active fight');
  const fight = copy(saved), config = fight.config;
  validateEncounter(config, sonicCharacter(fight.character));
  const alive = () => fight.opponents.map((enemy, index) => enemy.remainingHits > 0 ? index : -1).filter(index => index >= 0);
  const available = alive();
  if (!available.length) throw new RangeError('No remaining opponents');
  const selected = target === undefined ? available[0] : integer(target, 0, fight.opponents.length - 1);
  if (!available.includes(selected) || config.oneAtATime && selected !== available[0]) throw new RangeError('Invalid opponent');
  const enemy = fight.opponents[selected];
  const result = { round: ++fight.round, target: selected, enemy: [] };
  if (!enemy.started && config.startEnemyRoll) {
    result.startEnemyDice = die(roll);
    enemy.started = true;
    if (config.startEnemyRoll.defeatOn.includes(result.startEnemyDice)) {
      enemy.remainingHits = 0; result.instantDefeat = true;
    }
  }
  enemy.started = true;
  if (!result.instantDefeat) {
    const modifier = (config.bonus ?? 0) + (fight.attackRolls === 0 ? config.firstAttackModifier ?? 0 : 0);
    result.attack = sonicCheck(fight.character, config.ability, enemy.rating, roll, modifier);
    fight.attackRolls++;
    if (result.attack.success) enemy.remainingHits--;
  }
  if (!alive().length) {
    fight.character = sonicEffects(fight.character, config.victoryEffects, roll);
    const limit = config.victoryTimeLimit;
    result.rewardsApplied = Boolean(config.victoryEffects?.length);
    if (limit && (fight.character.elapsed ?? 0) >= limit.threshold) { fight.reason = 'timeout'; finish(fight, 'loss', limit.section); }
    else finish(fight, 'win', config.win);
  }
  // A newly encountered opponent takes its own turn on the next click. All
  // surviving simultaneous opponents may counter, even after a successful hit.
  if (fight.status === 'fighting' && !result.instantDefeat) {
    const counters = config.oneAtATime ? (enemy.remainingHits > 0 ? [selected] : []) : alive();
    for (const index of counters) {
      const foe = fight.opponents[index], dice = die(roll), total = dice + foe.rating - (fight.character.favourBonus ?? 0);
      const event = { opponent: index, dice, total, hit: total > config.enemyCounterThreshold };
      result.enemy.push(event);
      if (event.hit) resolveHit(fight, roll, event);
      if (fight.status !== 'fighting') break;
    }
  }
  fight.history.push(result);
  return fight;
}

export function resumeSonicFight(saved, encounter) {
  if (saved?.rulesVersion !== 1 || saved.status !== 'paused' || !saved.config.group || saved.config.group !== encounter.group) throw new RangeError('No matching interrupted fight');
  validateEncounter(encounter, sonicCharacter(saved.character));
  if (encounter.resumeFrom && !encounter.resumeFrom.includes(String(saved.section))) throw new RangeError('Wrong continuation passage');
  if (encounter.enemies.length !== saved.opponents.length || encounter.enemies.some((enemy, index) => enemy.key !== saved.opponents[index].key || enemy.rating !== saved.opponents[index].rating || enemy.hits !== saved.opponents[index].hits)) throw new RangeError('Opponent mismatch');
  const fight = copy(saved);
  fight.config = copy(encounter); fight.status = 'fighting'; fight.section = null;
  if (fight.companionBonus !== undefined) fight.config.bonus = fight.companionBonus;
  return fight;
}

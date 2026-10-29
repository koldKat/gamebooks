import { sonicCharacter } from './core.js';

const copy = value => structuredClone(value);
const randomDie = () => Math.floor(Math.random() * 6) + 1;
function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid dual-hero value');
  return value;
}
function die(roll) { return integer(roll(6), 1, 6); }

export function dualHeroes(values) {
  if (!values || Object.keys(values).length !== 2) throw new RangeError('Two heroes are required');
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sonicCharacter(value)]));
}

export function dualRings(saved, hero, amount, threshold) {
  const heroes = dualHeroes(saved), actor = heroes[hero];
  if (!actor) throw new RangeError('Unknown hero');
  integer(amount, -1000000); integer(threshold, 1);
  const previous = actor.rings;
  actor.rings = Math.max(0, previous + amount);
  // The book awards a life above the threshold without telling the reader to
  // spend the rings. Only crossing it grants a life; rendering cannot do so.
  if (actor.lives && previous <= threshold && actor.rings > threshold) actor.lives++;
  return dualHeroes(heroes);
}

export function dualHit(saved, hero) {
  const heroes = dualHeroes(saved), actor = heroes[hero];
  if (!actor || !actor.lives) throw new RangeError('No living hero');
  let lifeLost = false, shieldUsed = false;
  if (actor.shield) { actor.shield = false; shieldUsed = true; }
  else if (actor.rings) actor.rings = 0;
  else { actor.lives--; lifeLost = true; }
  return { heroes, hero, lifeLost, shieldUsed, gameOver: Object.values(heroes).some(value => !value.lives) };
}

export function dualAbilityCheck(saved, actors, ability, target, roll = randomDie, bonus = 0) {
  const heroes = dualHeroes(saved);
  integer(target, 1); integer(bonus, -99, 99);
  if (!Array.isArray(actors) || !actors.length || actors.length > 2 || new Set(actors).size !== actors.length
      || actors.some(key => !heroes[key] || !Object.hasOwn(heroes[key].abilities, ability))) throw new RangeError('Choose the heroes and ability');
  const dice = die(roll), total = dice + bonus + actors.reduce((sum, key) => sum + heroes[key].abilities[ability], 0);
  return { dice, total, target, success: total >= target };
}

function validateEncounter(encounter, heroes) {
  if (!encounter?.enemies?.length || !encounter.rules) throw new RangeError('Missing encounter rules');
  integer(encounter.rules.soloCounterThreshold, 1);
  integer(encounter.rules.jointCounterThreshold, 1);
  integer(encounter.rules.ringLifeThreshold, 1);
  integer(encounter.bonus ?? 0, -99, 99);
  for (const enemy of encounter.enemies) {
    integer(enemy.rating, 1, 999);
    if (typeof enemy.name !== 'string' || !enemy.name.trim()) throw new RangeError('Missing opponent name');
    const actors = enemy.heroes ?? [enemy.hero];
    if (!actors.length || actors.length > 2 || new Set(actors).size !== actors.length
        || actors.some(key => !heroes[key] || !Object.hasOwn(heroes[key].abilities, enemy.ability))) throw new RangeError('Choose the combat ability and heroes');
  }
}

export function startDualFight(saved, encounter, helpers = []) {
  const heroes = dualHeroes(saved);
  if (Object.values(heroes).some(hero => !hero.lives)) throw new RangeError('The adventure has ended');
  validateEncounter(encounter, heroes);
  if (!Array.isArray(helpers) || helpers.length > 100) throw new RangeError('Invalid companions');
  return { rulesVersion: 1, heroes, config: copy(encounter), helpers: copy(helpers),
    opponentIndex: 0, round: 0, status: 'fighting', section: null, history: [] };
}

function finish(fight, status, section) {
  fight.status = status; fight.section = section == null ? null : String(section);
}

function woundHero(fight, hero, event) {
  const result = dualHit(fight.heroes, hero);
  fight.heroes = result.heroes; event.victim = hero; event.lifeLost = result.lifeLost; event.shieldUsed = result.shieldUsed;
  if (result.gameOver) { finish(fight, 'gameOver'); return; }
  if (result.shieldUsed) return;
  const exit = fight.config.exits?.[hero];
  if (exit?.when === 'hit' || result.lifeLost && exit?.when === 'lifeLost') finish(fight, 'loss', exit.section);
}

export function dualRound(saved, { helperTarget } = {}, roll = randomDie) {
  if (saved?.rulesVersion !== 1 || saved.status !== 'fighting') throw new RangeError('No active dual-hero fight');
  const fight = copy(saved), config = fight.config, foe = config.enemies[fight.opponentIndex];
  validateEncounter(config, fight.heroes);
  if (!foe) throw new RangeError('No remaining opponent');
  const actors = foe.heroes ?? [foe.hero], joint = actors.length === 2;
  const healthy = fight.helpers.map((helper, index) => !helper.knockedOut && !helper.mutated ? index : -1).filter(index => index >= 0);
  const bonus = (config.bonus ?? 0) + (config.helperBonus ? healthy.length : 0);
  const attackDice = die(roll), total = attackDice + bonus + actors.reduce((sum, actor) => sum + fight.heroes[actor].abilities[foe.ability], 0);
  const success = joint && config.rules.jointAttackStrict ? total > foe.rating : total >= foe.rating;
  const result = { round: ++fight.round, opponentIndex: fight.opponentIndex, actors, attackDice, total, rating: foe.rating, success };
  if (success) {
    fight.opponentIndex++;
    if (fight.opponentIndex === config.enemies.length) {
      for (const [hero, amount] of Object.entries(config.victoryRings ?? {})) fight.heroes = dualRings(fight.heroes, hero, amount, config.rules.ringLifeThreshold);
      finish(fight, 'win', config.win);
    }
  } else {
    const dice = die(roll), threshold = joint ? config.rules.jointCounterThreshold : config.rules.soloCounterThreshold;
    result.counter = { dice, total: dice + foe.rating, threshold, hit: dice + foe.rating > threshold };
    if (result.counter.hit) {
      if (joint) {
        const targetDice = die(roll), victim = config.rules.jointVictims?.[targetDice - 1];
        if (!actors.includes(victim)) throw new RangeError('Missing joint-hit targeting rule');
        result.counter.targetDice = targetDice; woundHero(fight, victim, result.counter);
      } else if (config.helperHitSplit && healthy.length) {
        const targetDice = die(roll); result.counter.targetDice = targetDice;
        if (config.rules.helperAbsorbsOn.includes(targetDice)) {
          const index = helperTarget ?? healthy[0];
          if (!healthy.includes(index)) throw new RangeError('Choose an active companion');
          fight.helpers[index].knockedOut = true; result.counter.helper = index;
        } else woundHero(fight, actors[0], result.counter);
      } else woundHero(fight, actors[0], result.counter);
    }
  }
  fight.history.push(result);
  return fight;
}

export function dualChaosBurst(rules, roll = randomDie) {
  let count = 0;
  for (let i = 0; i < integer(rules.countDice, 1, 10); i++) count += die(roll);
  const faces = Array.from({ length: count }, () => die(roll));
  return { faces, blueBonus: faces.filter(face => face === rules.blueOn).length,
    greenFaces: faces.filter(face => rules.mutateOn.includes(face)) };
}

export function resolveDualChaos(rules, burst, savedHelpers, targets) {
  const helpers = copy(savedHelpers);
  let used = 0;
  for (const face of burst.greenFaces) {
    const available = helpers.map((helper, index) => !helper.knockedOut && !helper.mutated ? index : -1).filter(index => index >= 0);
    if (!available.length) break;
    const target = targets[used++];
    if (!available.includes(target)) throw new RangeError('Choose the companion struck by the next green bolt');
    if (!(helpers[target].suit && rules.suitProtectsOn.includes(face))) helpers[target].mutated = true;
  }
  if (targets.length !== used) throw new RangeError('Unexpected green-bolt target');
  return helpers;
}

export function dualChaosEncounter(base, burst, helpers) {
  const encounter = copy(base), setup = encounter.chaos;
  if (!setup?.mutant || !setup?.boss) throw new RangeError('Missing Chaos encounter profiles');
  encounter.enemies = helpers.filter(helper => helper.mutated && !helper.knockedOut)
    .map((helper, index) => ({ ...copy(setup.mutant), key: 'mutant-' + index, name: setup.mutant.name + ' (' + helper.name + ')' }));
  encounter.enemies.push({ ...copy(setup.boss), rating: setup.boss.rating + integer(burst.blueBonus) });
  return encounter;
}

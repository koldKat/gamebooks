import { destinyStat, addDestinyStatEffect, healDestinyHero, hasDestinyAbility, destinyStrike } from './effects.js';
import { settleDestinyFight } from './core.js';

const rule = (category, phases, extra = {}) => Object.freeze({ category, phases, ...extra });
const anytime = ['speed', 'speed-rolled', 'damage', 'damage-rolled', 'end', 'death-move'];
const heroDamage = ['damage', 'damage-rolled'];
const definitions = {
  charge: rule('sp', ['speed'], { attribute: 'speed', amount: 2, firstRound: true }),
  frenzy: rule('sp', ['speed'], { attribute: 'speed', amount: 3 }),
  quicksilver: rule('sp', ['speed'], { attribute: 'speed', amount: 2 }),
  radiance: rule('sp', ['speed'], { attribute: 'speed', amount: -2, enemy: true }),
  crawlers: rule('sp', ['speed'], { attribute: 'speed', amount: -1, duration: 2, enemy: true }),
  haste: rule('sp', ['speed'], { speedDie: true }),
  reckless: rule('sp', ['speed'], { speedDie: true, limit: null }),
  cunning: rule('mo', anytime, { attribute: 'brawn', amount: 3 }),
  malice: rule('mo', anytime, { attribute: 'brawn', amount: 3 }),
  savagery: rule('mo', anytime, { attribute: 'brawn', amount: 2 }),
  'mortal-wound': rule('mo', anytime, { attribute: 'brawn', amount: 4 }),
  focus: rule('mo', anytime, { attribute: 'magic', amount: 3 }),
  'might-of-stone': rule('mo', anytime, { attribute: 'armour', amount: 3 }),
  'iron-will': rule('mo', anytime, { attribute: 'armour', amount: 3 }),
  resolve: rule('mo', anytime, { attribute: 'armour', amount: 4 }),
  insight: rule('mo', anytime, { attribute: 'armour', amount: -2, duration: 2, enemy: true }),
  'mental-freeze': rule('mo', anytime, { attribute: 'magic', amount: -3, duration: 2, enemy: true }),
  darksilver: rule('mo', anytime, { attribute: 'speed', amount: 3, sacrifice: 2 }),
  heal: rule('mo', anytime, { heal: 4, perItem: true }),
  regrowth: rule('mo', anytime, { heal: 6, perItem: true }),
  'greater-heal': rule('mo', anytime, { heal: 8, perItem: true }),
  acid: rule('mo', anytime, { scorePerDie: 1 }),
  sear: rule('mo', anytime, { scorePerDie: 1 }),
  'bloody-maiden': rule('mo', anytime, { scorePerDie: 2, duration: 1 }),
  'frost-burn': rule('mo', anytime, { scoreEffect: 2, scoreHero: true }),
  'deep-wound': rule('co', heroDamage, { damageDie: true, heroWon: true }),
  'heavy-blow': rule('co', heroDamage, { damageDie: true, heroWon: true }),
  overload: rule('co', heroDamage, { damageDie: true, heroWon: true }),
  'blood-oath': rule('mo', heroDamage, { damageDie: true, heroWon: true, sacrifice: 4 }),
  piercing: rule('co', heroDamage, { heroWon: true, ignoreArmour: true }),
  'fatal-blow': rule('co', heroDamage, { heroWon: true, halfArmour: true }),
  dodge: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  evade: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  sidestep: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  vanish: rule('co', heroDamage, { enemyWon: true, avoidDamage: true }),
  command: rule('co', ['damage'], { enemyWon: true, reverse: true }),
  fear: rule('mo', anytime, { scoreEffect: -2, scoreHero: false }),
  freeze: rule('mo', anytime, { freeze: true }),
  'pain-sink': rule('pa', anytime, { freeze: true }),
  agility: rule('mo', ['speed-rolled'], { dieAction: 'agility' }),
  sneak: rule('mo', ['speed-rolled'], { dieAction: 'sneak' }),
  'critical-strike': rule('mo', ['damage-rolled'], { heroWon: true, dieAction: 'critical' }),
  'gut-ripper': rule('mo', ['damage-rolled'], { heroWon: true, dieAction: 'critical' }),
  dominate: rule('mo', ['damage-rolled'], { heroWon: true, dieAction: 'dominate' }),
  protection: rule('mo', ['damage-rolled'], { enemyWon: true, dieAction: 'protection' }),
  watchful: rule('mo', ['speed-rolled', 'damage-rolled'], { dieAction: 'watchful' }),
  'sixth-sense': rule('mo', ['speed-rolled', 'damage-rolled'], { dieAction: 'watchful' }),
  feint: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  distraction: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  'dogged-determination': rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  boneshaker: rule('mo', ['speed-rolled'], { reroll: 'opponent-speed' }),
  intimidate: rule('mo', ['speed-rolled'], { reroll: 'both-speed' }),
  finesse: rule('mo', ['damage-rolled'], { heroWon: true, reroll: 'damage-plus-two' }),
  'cold-snap': rule('mo', ['damage-rolled'], { reroll: 'damage-plus-two' }),
  charm: rule('mo', ['speed-rolled', 'damage-rolled'], { reroll: 'hero-die', perItem: true }),
  'savage-call': rule('co', ['damage'], { replacement: true, heroWon: true, permanentBrawn: 2 }),
  'arcane-feast': rule('co', ['damage'], { replacement: true, heroWon: true, arcaneFeast: true }),
  phantom: rule('co', ['damage'], { replacement: true, heroWon: true, phantom: true }),
  cleave: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  lash: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  splinters: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true }),
  'furious-sweep': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 2, shared: true, slowHero: true }),
  aftershock: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'adjacent', dice: 1 }),
  blizzard: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'adjacent', dice: 2, delayed: true }),
  immolation: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'two', dice: 1, shared: true, armourLoss: 1 }),
  'dragon-fire': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'dragon', dice: 3 }),
  'drake-fire': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'dragon', dice: 3 }),
  'hurricane-rush': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 2, recoil: true }),
  'mind-flay': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true, drain: true }),
  'nail-gun': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, armourLoss: 2 }),
  wither: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, weaken: true }),
  rake: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 3, unmodified: true }),
  'vital-artery': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 1, ongoing: 1 }),
  'spin-shot': rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'one', dice: 2, speedDifference: true }),
  stampede: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'below', dice: 3 }),
  skewer: rule('co', ['damage'], { replacement: true, heroWon: true, hit: 'all', dice: 1, shared: true, slowTargets: true }),
  'shadow-thorns': rule('dm', ['death-move'], { hit: 'all', dice: 1, shared: true }),
  eviscerate: rule('dm', ['death-move'], { execute: 5 }),
  rust: rule('co', ['end'], { afterHit: true, armourLoss: 2 }),
  corrode: rule('co', ['end'], { afterHit: true, armourLoss: 2 }),
  shatter: rule('co', ['end'], { afterHit: true, shatter: true }),
  corruption: rule('co', ['end'], { afterHit: true, weaken: 2 }),
  frostbite: rule('co', ['end'], { afterHit: true, frostbite: true }),
};
for (const name of ['blind', 'curse', 'immobilise', 'knockdown', 'shackles', 'webbed', 'windblast']) {
  definitions[name] = rule('sp', ['speed'], { fewerOpponentDice: true });
}
for (const name of ['barbs', 'decay', 'thorns', 'bleed', 'disease', 'blood-frenzy', 'mangle',
  'ice-edge', 'lightning', 'siphon', 'salvation', 'heart-steal', 'anguish', 'weaver', 'wind-chill']) definitions[name] = rule('pa', []);
export const DESTINY_ABILITIES = Object.freeze(definitions);

function draw(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
  return value;
}

export function configureDestinyAbilities(fight, inventory) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' ||
      !inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new RangeError('Configure abilities before combat');
  const next = structuredClone(fight);
  next.abilities = {};
  for (const [name, count] of Object.entries(inventory)) {
    if (!Object.hasOwn(DESTINY_ABILITIES, name) || !Number.isInteger(count) || count < 1 || count > 100) {
      throw new RangeError('Invalid ability inventory');
    }
    next.abilities[name] = count;
  }
  return next;
}

function dieIndex(values, index) {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) throw new RangeError('Choose a die');
  return index;
}

export function useDestinyAbility(fight, name, options = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  const spec = DESTINY_ABILITIES[name];
  if (!spec || fight?.status !== 'active' || !hasDestinyAbility(fight, name) || !spec.phases.includes(fight.phase)) {
    throw new RangeError('Ability unavailable at this combat stage');
  }
  if (fight.turn.used[spec.category]) throw new RangeError('Only one ability of this category per round');
  if (spec.firstRound && fight.round !== 1) throw new RangeError('Ability requires the first combat round');
  if (spec.heroWon && fight.turn.winner !== 'hero') throw new RangeError('Win the round first');
  if (spec.enemyWon && fight.turn.winner !== 'opponent') throw new RangeError('Opponent must win the round');
  if (spec.afterHit && (fight.turn.winner !== 'hero' || !fight.turn.healthDamage)) throw new RangeError('Cause health damage with a damage score first');
  const limit = spec.perItem ? fight.abilities[name] : spec.limit === null ? Infinity :
    (name === 'curse' || name === 'fear') && hasDestinyAbility(fight, 'anguish') ? 2 : 1;
  if ((fight.used[name] || 0) >= limit) throw new RangeError('Ability has no uses left');
  // Sacrifices are paid while alive. They cannot be used to heal back from zero.
  if (spec.sacrifice && fight.hero.health < spec.sacrifice) throw new RangeError('Not enough health to sacrifice');
  const next = structuredClone(fight);
  const target = spec.enemy ? options.target ?? next.target : 'hero';
  if (spec.enemy && (!next.opponents[target] || next.opponents[target].health <= 0)) throw new RangeError('Choose a living opponent');
  if (spec.sacrifice) next.hero.health -= spec.sacrifice;
  if (spec.attribute) addDestinyStatEffect(next, target, spec.attribute, spec.amount, spec.duration || 1, name);
  if (spec.heal) healDestinyHero(next, spec.heal + (hasDestinyAbility(next, 'salvation') ? 1 : 0));
  if (spec.speedDie) next.turn.heroSpeedCount = (next.turn.heroSpeedCount || 2) + 1;
  if (name === 'reckless') next.turn.reckless = true;
  if (spec.fewerOpponentDice) next.turn.opponentSpeedCount = 1;
  if (spec.damageDie) {
    if (next.phase === 'damage-rolled') next.turn.damageDice.push(draw(roll));
    else next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
  }
  if (spec.scoreBonus) next.turn.damageScoreBonus = (next.turn.damageScoreBonus || 0) + spec.scoreBonus;
  if (spec.scoreEffect) next.effects.push({ kind: 'score-flat', amount: spec.scoreEffect,
    hero: spec.scoreHero, from: next.round, until: next.round, source: name });
  if (spec.scorePerDie) next.effects.push({ kind: 'score-per-die', amount: spec.scorePerDie,
    from: next.round, until: spec.duration ? next.round + spec.duration - 1 : Number.MAX_SAFE_INTEGER, source: name });
  if (name === 'bloody-maiden') next.effects[next.effects.length - 1].kind = 'damage-per-die';
  if (spec.ignoreArmour) next.turn.ignoreArmour = true;
  if (spec.halfArmour) next.turn.halfArmour = true;
  if (spec.avoidDamage) next.turn.avoidDamage = true;
  if (spec.reverse) next.turn.winner = 'hero';
  if (spec.freeze) next.effects.push({ kind: 'freeze', from: next.round, until: next.round + 1, source: name });
  const action = spec.dieAction;
  if (action) {
    if (action === 'critical') next.turn.damageDice.fill(6);
    else {
      const heroSpeed = action === 'agility';
      const enemySpeed = action === 'sneak' || action === 'watchful' && next.phase === 'speed-rolled';
      const values = heroSpeed ? next.turn.heroSpeedDice : enemySpeed ? next.turn.opponentSpeedDice : next.turn.damageDice;
      const index = dieIndex(values, options.die);
      if (action === 'agility' && values[index] !== 1) throw new RangeError('Choose a one');
      if (['protection', 'watchful'].includes(action) && values[index] !== 6) throw new RangeError('Choose a six');
      if (action === 'watchful' && next.phase === 'damage-rolled' && next.turn.winner !== 'opponent') throw new RangeError('Choose an opponent die');
      values[index] = action === 'agility' || action === 'dominate' ? 6 : 1;
    }
  }
  if (spec.reroll) {
    const mode = spec.reroll;
    if (mode === 'both-speed' || mode === 'opponent-speed') {
      next.turn.opponentSpeedDice = next.turn.opponentSpeedDice.map(() => draw(roll));
    }
    if (mode === 'both-speed') next.turn.heroSpeedDice = next.turn.heroSpeedDice.map(() => draw(roll));
    if (mode === 'hero-speed') {
      if (!Array.isArray(options.dice) || !options.dice.length || new Set(options.dice).size !== options.dice.length) throw new RangeError('Choose dice to reroll');
      for (const index of options.dice) next.turn.heroSpeedDice[dieIndex(next.turn.heroSpeedDice, index)] = draw(roll);
    }
    if (mode === 'hero-die' || mode === 'damage-plus-two') {
      if (mode === 'hero-die' && next.phase === 'damage-rolled' && next.turn.winner !== 'hero') throw new RangeError('Choose a hero die');
      const values = next.phase === 'speed-rolled' ? next.turn.heroSpeedDice : next.turn.damageDice;
      const index = dieIndex(values, options.die);
      values[index] = draw(roll);
      if (mode === 'damage-plus-two') {
        next.turn.damageDieBonuses ??= {};
        next.turn.damageDieBonuses[index] = (next.turn.damageDieBonuses[index] || 0) + 2;
      }
    }
  }
  const alive = () => next.opponents.map((opponent, index) => opponent.health > 0 ? index : -1).filter(index => index >= 0);
  const chosen = options.target ?? next.target;
  const requireLiving = index => {
    if (!Number.isInteger(index) || !next.opponents[index] || next.opponents[index].health <= 0) throw new RangeError('Choose a living opponent');
    return index;
  };
  if (spec.hit) {
    let targets;
    if (spec.hit === 'all' || spec.hit === 'dragon') targets = alive();
    else if (spec.hit === 'below') targets = alive().filter(index => index >= requireLiving(chosen));
    else if (['two', 'adjacent'].includes(spec.hit)) {
      targets = options.targets;
      if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) throw new RangeError('Choose two opponents');
      targets.forEach(requireLiving);
      if (spec.hit === 'adjacent' && Math.abs(targets[0] - targets[1]) !== 1) throw new RangeError('Choose adjacent opponents');
    } else targets = [requireLiving(chosen)];
    if (spec.hit === 'dragon') requireLiving(chosen);
    const damageDice = count => {
      const bonus = spec.unmodified ? 0 : next.effects.filter(effect => effect.kind === 'damage-per-die' &&
        effect.from <= next.round && effect.until >= next.round).reduce((total, effect) => total + effect.amount, 0);
      return Array.from({ length: count }, () => draw(roll) + bonus).reduce((total, value) => total + value, 0);
    };
    const shared = spec.shared ? damageDice(spec.dice) : null;
    targets.forEach((index, order) => {
      let count = spec.dice;
      if (spec.hit === 'dragon' && index !== chosen) count = 1;
      if (spec.hit === 'below') count = Math.max(1, 3 - order);
      if (spec.speedDifference) count += Math.max(0, destinyStat(next, 'hero', 'speed') - destinyStat(next, index, 'speed'));
      const lost = destinyStrike(next, index, shared ?? damageDice(count), name);
      if (spec.drain && lost) healDestinyHero(next, 2);
      if (spec.recoil && lost) next.hero.health = Math.max(0, next.hero.health - 1);
      if (spec.armourLoss) addDestinyStatEffect(next, index, 'armour', -spec.armourLoss, null, name);
      if (spec.weaken) addDestinyStatEffect(next, index, next.opponents[index].damageStat, -1, null, name);
      if (spec.slowTargets) addDestinyStatEffect(next, index, 'speed', -1, 1, name, 1);
      if (spec.ongoing) next.effects.push({ kind: 'ongoing-damage', target: index, amount: spec.ongoing,
        from: next.round, until: Number.MAX_SAFE_INTEGER, source: name });
      if (spec.delayed) next.effects.push({ kind: 'delayed-dice', target: index,
        from: next.round + 1, until: next.round + 1, source: name });
    });
    if (spec.slowHero) addDestinyStatEffect(next, 'hero', 'speed', -1, 1, name, 1);
  }
  if (spec.execute) for (const index of alive()) {
    if (next.opponents[index].health <= spec.execute) destinyStrike(next, index, next.opponents[index].health, name);
  }
  if (spec.afterHit) {
    const index = requireLiving(next.target);
    if (spec.armourLoss) addDestinyStatEffect(next, index, 'armour', -spec.armourLoss, null, name);
    if (spec.weaken) addDestinyStatEffect(next, index, next.opponents[index].damageStat, -spec.weaken, null, name);
    if (spec.frostbite) addDestinyStatEffect(next, index, 'speed', -1, 2, name, 1);
    if (spec.shatter) {
      if (!['armour-minus-two', 'armour-zero-next-round'].includes(options.variant)) throw new RangeError('Choose the printed Shatter variant');
      if (options.variant === 'armour-minus-two') addDestinyStatEffect(next, index, 'armour', -2, null, name);
      else next.effects.push({ kind: 'stat', target: index, attribute: 'armour', set: 0,
        from: next.round + 1, until: next.round + 1, source: name });
    }
  }
  if (spec.permanentBrawn) addDestinyStatEffect(next, 'hero', 'brawn', spec.permanentBrawn, null, name);
  if (spec.arcaneFeast) {
    requireLiving(chosen);
    addDestinyStatEffect(next, chosen, 'magic', -2, null, name);
    addDestinyStatEffect(next, 'hero', 'magic', 2, null, name);
  }
  if (spec.phantom) next.phantomHealth = 8;
  if (spec.replacement) {
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  }
  next.used[name] = (next.used[name] || 0) + 1;
  if (['sp', 'co', 'dm'].includes(spec.category)) next.turn.used[spec.category] = true;
  if (spec.category === 'co' && hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  if (spec.category === 'sp' && hasDestinyAbility(next, 'wind-chill')) {
    for (const index of alive()) destinyStrike(next, index, 2, 'wind-chill', 'passive');
  }
  if (['piercing', 'deep-wound'].includes(name) && hasDestinyAbility(next, 'heart-steal')) {
    if (next.phase === 'damage-rolled') next.turn.damageDice.push(draw(roll));
    else next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
  }
  next.history.push({ type: 'ability', round: next.round, name, target });
  if (spec.category === 'dm') next.phase = next.turn.afterDeathMove;
  else if (next.phase === 'end' && !next.turn.pendingPassiveDeath && next.turn.deaths.length > next.turn.deathMoveDeathsSeen && spec.hit) {
    next.phase = 'death-move';
    next.turn.afterDeathMove = 'end';
  }
  settleDestinyFight(next);
  return next;
}

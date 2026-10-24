import { addDestinyStatEffect, healDestinyHero, hasDestinyAbility, destinyStrike } from './effects.js';
import { settleDestinyFight } from './core.js';
import { applyDestinyAdvancedAbility } from './advanced.js';
import { prepareDestinyDamage } from './damage.js';
import { prepareDestinyAbilityRoll } from './ability-rolls.js';

const rule = (category, phases, extra = {}) => Object.freeze({ category, phases, ...extra });
const anytime = ['speed', 'speed-rolled', 'damage', 'damage-rolled', 'ability-rolled', 'end', 'death-move'];
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
  'critical-strike': rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'critical', requiresDamageRoll: true }),
  'gut-ripper': rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'critical', requiresDamageRoll: true }),
  dominate: rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, dieAction: 'dominate', requiresDamageRoll: true }),
  protection: rule('mo', ['damage-rolled'], { enemyWon: true, dieAction: 'protection' }),
  watchful: rule('mo', ['speed-rolled', 'damage-rolled'], { dieAction: 'watchful' }),
  'sixth-sense': rule('mo', ['speed-rolled', 'damage-rolled'], { dieAction: 'watchful' }),
  feint: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  distraction: rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  'dogged-determination': rule('mo', ['speed-rolled'], { reroll: 'hero-speed' }),
  boneshaker: rule('mo', ['speed-rolled'], { reroll: 'opponent-speed' }),
  intimidate: rule('mo', ['speed-rolled'], { reroll: 'both-speed' }),
  finesse: rule('mo', ['damage-rolled', 'ability-rolled'], { heroWon: true, reroll: 'damage-plus-two', requiresDamageRoll: true }),
  'cold-snap': rule('mo', ['damage-rolled', 'ability-rolled'], { reroll: 'damage-plus-two', requiresDamageRoll: true }),
  charm: rule('mo', ['speed-rolled', 'damage-rolled', 'ability-rolled'], { reroll: 'hero-die', perItem: true }),
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
  'dark-pact': rule('co', heroDamage, { heroWon: true, sacrifice: 4, scoreBonus: 4 }),
  impale: rule('co', heroDamage, { heroWon: true, scoreBonus: 3, advanced: true }),
  'frost-guard': rule('mo', anytime, { attribute: 'armour', amount: 3, advanced: true }),
  'deadly-dance': rule('sp', ['speed'], { enemy: true, limit: 2, advanced: true }),
  'cruel-twist': rule('mo', ['damage-rolled'], { heroWon: true, advanced: true }),
  'ice-slick': rule('mo', ['speed-rolled'], { advanced: true }),
  trickster: rule('mo', ['speed-rolled'], { advanced: true }),
  deceive: rule('mo', ['speed-rolled'], { advanced: true }),
  counter: rule('co', heroDamage, { enemyWon: true, scoreBonus: -2, advanced: true }),
  overpower: rule('co', ['damage'], { enemyWon: true, replacement: true, hit: 'one', dice: 2, currentTarget: true }),
  deflect: rule('co', ['damage'], { enemyWon: true, replacement: true, hit: 'one', dice: 2, currentTarget: true }),
  slam: rule('co', ['damage'], { enemyWon: true, replacement: true, advanced: true }),
  unstoppable: rule('mo', ['damage'], { enemyWon: true, reverse: true, sacrifice: 5 }),
  'roll-with-it': rule('mo', ['damage'], { heroWon: true, advanced: true }),
  'shoulder-charge': rule('co', ['damage'], { heroWon: true, advanced: true }),
  'twin-blade': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  wave: rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'scarlet-strikes': rule('dm', ['death-move'], { advanced: true }),
  retaliation: rule('co', ['end'], { afterEnemyHit: true, hit: 'one', dice: 1, currentTarget: true }),
  sideswipe: rule('co', ['end'], { afterEnemyHit: true, hit: 'one', dice: 1, currentTarget: true }),
  revenge: rule('co', ['end'], { afterEnemyHit: true, hit: 'all', dice: 1, shared: true }),
  'shock-blast': rule('co', ['end'], { afterEnemyHit: true, hit: 'all', dice: 1, shared: true }),
  'punch-drunk': rule('co', ['end'], { afterEnemyHit: true, advanced: true }),
  rebound: rule('co', ['end'], { afterEnemyHit: true, advanced: true }),
  'thorn-armour': rule('co', anytime, { attribute: 'armour', amount: 3, hit: 'all', dice: 1, shared: true }),
  parasite: rule('mo', anytime, { advanced: true }),
  reaper: rule('mo', ['end', 'death-move'], { afterHit: true, advanced: true }),
  'pain-barrier': rule('mo', ['start', 'death-move'], { advanced: true }),
  'choke-hold': rule('mo', ['end', 'death-move'], { advanced: true }),
  'coup-de-grace': rule('pa', anytime, { advanced: true }),
  recall: rule('mo', anytime, { regain: ['mo'] }),
  recharge: rule('dm', ['death-move'], { regain: ['sp', 'mo'] }),
  recovery: rule('dm', ['death-move'], { regain: ['mo'] }),
  'tormented-soul': rule('mo', anytime, { sacrifice: 4, regain: ['sp', 'co'] }),
  windfall: rule('co', ['end'], { afterEnemyHit: true, regain: ['sp'] }),
  murder: rule('dm', ['death-move'], { advanced: true }),
  petrify: rule('dm', ['death-move'], { advanced: true }),
  'frost-hound': rule('dm', ['death-move'], { advanced: true, requires: 'syns-heart' }),
  recuperation: rule('dm', ['death-move'], { advanced: true }),
  'spirit-call': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'poison-cloud': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'rallying-call': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'horn', advanced: true }),
  'shape-shift': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'sure-edge': rule('mo', anytime, { advanced: true }),
  'tactical-manoeuvres': rule('co', heroDamage, { enemyWon: true, avoidDamage: true, advanced: true }),
  'blind-strike': rule('co', ['speed', 'speed-rolled', 'damage', 'end'], { hit: 'one', dice: 2, advanced: true, currentTarget: true }),
  'take-the-bait': rule('co', ['damage'], { heroWon: true, requires: 'grapple', abilityRoll: true }),
  'warg-strike': rule('co', ['damage'], { heroWon: true, abilityRoll: true }),
  'chaotic-catalyst': rule('co', ['damage'], { heroWon: true, abilityRoll: true }),
  'pick-n-mix': rule('mo', anytime, { abilityRoll: true, backpack: true, perItem: true }),
  'spirit-breaker': rule('co', ['damage'], { heroWon: true, replacement: true, hit: 'one', dice: 3, armourLoss: 2, priorBait: true }),
  'power-totem': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'totem', advanced: true }),
  'totem-blast': rule('co', ['damage'], { heroWon: true, replacement: true, requires: 'totem', hit: 'all', dice: 2, shared: true, advanced: true, limit: null }),
  'creeping-cold': rule('co', ['damage'], { heroWon: true, replacement: true, advanced: true }),
  'sound-the-charge': rule('sp', ['speed'], { speedDie: true, requires: 'horn', advanced: true }),
  'upper-hand': rule('dm', ['death-move'], { advanced: true }),
  gouge: rule('co', anytime, { advanced: true }),
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

export function configureDestinyAbilities(fight, inventory, equipment = {}) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' ||
      !inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new RangeError('Configure abilities before combat');
  const next = structuredClone(fight);
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) throw new RangeError('Invalid equipment');
  next.equipment = {};
  for (const slot of ['mainHand', 'leftHand', 'transport']) {
    if (!equipment[slot]) continue;
    const item = equipment[slot];
    if (typeof item !== 'object' || Array.isArray(item)) throw new RangeError('Invalid equipment');
    next.equipment[slot] = { type: String(item.type || ''), id: String(item.id || '') };
    for (const stat of ['brawn', 'speed', 'toughness', 'stability']) {
      const value = item[stat] ?? 0;
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new RangeError('Invalid equipment attribute');
      next.equipment[slot][stat] = value;
    }
  }
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
  if (!spec || fight?.status !== 'active' || !fight.turn || !hasDestinyAbility(fight, name) || !spec.phases.includes(fight.phase)) {
    throw new RangeError('Ability unavailable at this combat stage');
  }
  if (fight.turn.used[spec.category]) throw new RangeError('Only one ability of this category per round');
  if (spec.firstRound && fight.round !== 1) throw new RangeError('Ability requires the first combat round');
  if (spec.heroWon && fight.turn.winner !== 'hero' && !(fight.phase === 'ability-rolled' && fight.turn.pendingAbility.type === 'damage')) throw new RangeError('Win the round first');
  if (spec.enemyWon && fight.turn.winner !== 'opponent') throw new RangeError('Opponent must win the round');
  if (spec.afterHit && (fight.turn.winner !== 'hero' || !fight.turn.healthDamage)) throw new RangeError('Cause health damage with a damage score first');
  if (spec.afterEnemyHit && (fight.turn.winner !== 'opponent' || !fight.turn.healthDamage)) throw new RangeError('Take health damage from the opponent first');
  if (fight.bearForm && spec.category === 'co') throw new RangeError('Combat abilities are unavailable in bear form');
  if (spec.requires && ![fight.equipment?.leftHand?.id, fight.equipment?.leftHand?.type].includes(spec.requires)) throw new RangeError('Required left-hand equipment is missing');
  if (spec.requiresDamageRoll && fight.phase === 'ability-rolled' && fight.turn.pendingAbility.type !== 'damage') throw new RangeError('Requires damage dice');
  if (spec.priorBait && !(fight.takeBaitSucceededRound > 0 && fight.takeBaitSucceededRound < fight.round)) throw new RangeError('Grapple successfully in an earlier round first');
  if (spec.backpack && fight.turn.used.backpack) throw new RangeError('Only one backpack item per round');
  if (spec.abilityRoll && fight.phase === 'ability-rolled') throw new RangeError('Resolve the pending roll first');
  const limit = spec.perItem ? fight.abilities[name] : spec.limit === null ? Infinity :
    spec.limit || ((name === 'curse' || name === 'fear') && hasDestinyAbility(fight, 'anguish') ? 2 : 1);
  if ((fight.used[name] || 0) >= limit) throw new RangeError('Ability has no uses left');
  // Sacrifices are paid while alive. They cannot be used to heal back from zero.
  if (spec.sacrifice && fight.hero.health < spec.sacrifice) throw new RangeError('Not enough health to sacrifice');
  const next = structuredClone(fight);
  const target = spec.enemy ? options.target ?? next.target : 'hero';
  if (spec.enemy && (!Number.isInteger(target) || target < 0 || !next.opponents[target] || next.opponents[target].health <= 0)) throw new RangeError('Choose a living opponent');
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
  let pendingGroup;
  if (next.phase === 'ability-rolled' && next.turn.pendingAbility.type === 'damage') {
    const groupIndex = options.group ?? 0;
    dieIndex(next.turn.pendingAbility.groups, groupIndex);
    pendingGroup = next.turn.pendingAbility.groups[groupIndex];
  }
  if (action) {
    if (action === 'critical') (pendingGroup?.dice || next.turn.damageDice).fill(6);
    else {
      const heroSpeed = action === 'agility';
      const enemySpeed = action === 'sneak' || action === 'watchful' && next.phase === 'speed-rolled';
      const values = heroSpeed ? next.turn.heroSpeedDice : enemySpeed ? next.turn.opponentSpeedDice : pendingGroup?.dice || next.turn.damageDice;
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
      const values = next.phase === 'speed-rolled' ? next.turn.heroSpeedDice : next.phase === 'ability-rolled' ?
        pendingGroup?.dice || next.turn.pendingAbility.dice : next.turn.damageDice;
      const index = dieIndex(values, options.die);
      values[index] = draw(roll);
      if (mode === 'damage-plus-two') {
        const bonuses = pendingGroup ? pendingGroup.bonuses : (next.turn.damageDieBonuses ??= {});
        bonuses[index] = (bonuses[index] || 0) + 2;
      }
    }
  }
  const alive = () => next.opponents.map((opponent, index) => opponent.health > 0 ? index : -1).filter(index => index >= 0);
  const chosen = options.target ?? next.target;
  if (spec.currentTarget && chosen !== next.target) throw new RangeError('This ability affects the current opponent');
  const requireLiving = index => {
    if (!Number.isInteger(index) || !next.opponents[index] || next.opponents[index].health <= 0) throw new RangeError('Choose a living opponent');
    return index;
  };
  if (spec.advanced) applyDestinyAdvancedAbility(next, name, options, roll);
  if (spec.regain) {
    const restored = options.restore;
    if (!Object.hasOwn(definitions, restored) || !hasDestinyAbility(next, restored) ||
        !spec.regain.includes(definitions[restored].category) || !(next.used[restored] > 0)) {
      throw new RangeError('Choose an already used ability of the required type');
    }
    next.used[restored]--;
  }
  if (spec.hit) {
    prepareDestinyDamage(next, name, spec, options, roll);
  }
  if (spec.execute) for (const index of alive()) {
    if (next.opponents[index].health <= spec.execute) destinyStrike(next, index, next.opponents[index].health, name);
  }
  if (spec.afterHit) {
    const index = requireLiving(next.target);
    if (spec.armourLoss) addDestinyStatEffect(next, index, 'armour', -spec.armourLoss, null, name);
    if (spec.weaken) {
      const attribute = options.attribute ?? next.opponents[index].damageStat;
      if (!['brawn', 'magic'].includes(attribute)) throw new RangeError('Choose brawn or magic');
      addDestinyStatEffect(next, index, attribute, -spec.weaken, null, name);
    }
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
  if (spec.replacement && next.phase !== 'ability-rolled') {
    next.turn.normalDamageReplaced = true;
    next.phase = 'end';
  }
  if (spec.abilityRoll) {
    const returnPhase = next.phase;
    prepareDestinyAbilityRoll(next, name, options, roll);
    next.turn.pendingAbility.returnPhase = returnPhase;
    if (spec.backpack) next.turn.used.backpack = true;
  }
  next.used[name] = (next.used[name] || 0) + 1;
  if (['sp', 'co', 'dm'].includes(spec.category)) next.turn.used[spec.category] = true;
  if (spec.fewerOpponentDice) next.turn.controlledOpponent = next.target;
  if (spec.category === 'co' && hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  if (spec.category === 'sp' && hasDestinyAbility(next, 'wind-chill')) {
    for (const index of alive()) destinyStrike(next, index, 2, 'wind-chill', 'passive');
  }
  if (['piercing', 'deep-wound'].includes(name) && hasDestinyAbility(next, 'heart-steal')) {
    if (next.phase === 'damage-rolled') next.turn.damageDice.push(draw(roll));
    else next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
  }
  next.history.push({ type: 'ability', round: next.round, name, target });
  if (['speed-rolled', 'damage', 'damage-rolled'].includes(next.phase) && next.opponents[next.target].health <= 0) next.phase = 'end';
  if (spec.category === 'dm' && next.phase !== 'ability-rolled') next.phase = next.turn.afterDeathMove;
  else if (next.phase === 'end' && !next.turn.pendingPassiveDeath && next.turn.deaths.length > next.turn.deathMoveDeathsSeen) {
    next.phase = 'death-move';
    next.turn.afterDeathMove = 'end';
  }
  settleDestinyFight(next);
  return next;
}

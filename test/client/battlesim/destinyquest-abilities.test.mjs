import test from 'node:test';
import assert from 'node:assert/strict';
import { createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, retargetDestinyRound,
  skipDestinyDeathMove } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { configureDestinyAbilities, useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
function setup(abilities, extra = {}, enemies = [{ name: 'Enemy', speed: 2, brawn: 4, armour: 3, health: 100 }]) {
  return configureDestinyAbilities(createDestinyFight({ name: 'Hero', speed: 2, brawn: 4, magic: 1,
    armour: 2, health: 20, maxHealth: 30, ...extra }, enemies), abilities);
}
const start = (abilities, extra, enemies) => startDestinyRound(setup(abilities, extra, enemies), 0);
const win = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 1, 1)));
const lose = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)));
const hit = (fight, ...values) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(...values)));

test('speed abilities share one slot, modifiers can combine, and one-round bonuses expire', () => {
  let fight = start({ frenzy: 1, haste: 1, cunning: 1, focus: 1 });
  fight = use(use(use(fight, 'frenzy'), 'cunning'), 'focus');
  assert.equal(destinyStat(fight, 'hero', 'speed'), 5);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 7);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 4);
  assert.throws(() => use(fight, 'haste'), /one ability/);
  fight = hit(win(fight), 1);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 2);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 4);
  assert.throws(() => use(fight, 'frenzy'), /no uses/);
});

test('haste rolls three hero dice; webbed rolls one enemy die', () => {
  let fight = use(start({ haste: 1 }), 'haste');
  fight = rollDestinySpeed(fight, rolls(1, 2, 3, 4, 5));
  assert.deepEqual(fight.turn.heroSpeedDice, [1, 2, 3]);
  assert.deepEqual(fight.turn.opponentSpeedDice, [4, 5]);
  fight = rollDestinySpeed(use(start({ webbed: 1 }), 'webbed'), rolls(4, 4, 6));
  assert.deepEqual(fight.turn.opponentSpeedDice, [6]);
});

test('reckless grants the enemy an extra damage die when the hero loses', () => {
  let fight = use(start({ reckless: 1 }), 'reckless');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 1, 6, 6)));
  fight = hit(fight, 2, 3);
  assert.equal(fight.turn.damageScore, 9);
  assert.equal(fight.hero.health, 13);
});

test('duplicate healing items grant individual uses, salvation adds one, health is capped', () => {
  let fight = start({ heal: 2, salvation: 1 });
  fight = use(fight, 'heal');
  assert.equal(fight.hero.health, 25);
  fight = use(fight, 'heal');
  assert.equal(fight.hero.health, 30);
  assert.throws(() => use(fight, 'heal'), /no uses/);
});

test('distinct permanent die bonuses stack, duplicate copies do not grant extra activations', () => {
  let fight = start({ acid: 2, sear: 1, 'deep-wound': 1 });
  fight = use(use(win(fight), 'acid'), 'sear');
  fight = hit(use(fight, 'deep-wound'), 2, 3);
  assert.equal(fight.turn.damageScore, 13); // (2+2) + (3+2) + brawn 4
  assert.throws(() => use(startDestinyRound(endDestinyRound(fight), 0), 'acid'), /no uses/);
});

test('piercing and deep wound activate heart steal; combat abilities share a slot', () => {
  let fight = use(win(start({ piercing: 1, 'heart-steal': 1, 'deep-wound': 1 })), 'piercing');
  assert.throws(() => use(fight, 'deep-wound'), /one ability/);
  fight = hit(fight, 2, 3);
  assert.equal(fight.turn.healthDamage, 9);
});

test('fatal blow ignores the rounded-up half of odd armour', () => {
  const fight = hit(use(win(start({ 'fatal-blow': 1 })), 'fatal-blow'), 1);
  assert.equal(fight.turn.healthDamage, 4); // 5 minus remaining armour 1
});

test('command reverses an enemy win before rolling; dodge prevents its damage', () => {
  let fight = hit(use(lose(start({ command: 1 })), 'command'), 3);
  assert.equal(fight.turn.winner, 'hero');
  assert.equal(fight.opponents[0].health, 96);
  fight = hit(use(lose(start({ dodge: 1 })), 'dodge'), 6);
  assert.equal(fight.hero.health, 20);
});

test('agility, sneak and selective rerolls act on chosen dice before speed resolution', () => {
  let fight = rollDestinySpeed(start({ agility: 1, sneak: 1, feint: 1 }), rolls(1, 2, 6, 5));
  fight = use(use(fight, 'agility', { die: 0 }), 'sneak', { die: 0 });
  fight = use(fight, 'feint', { dice: [1] }, rolls(4));
  assert.deepEqual(fight.turn.heroSpeedDice, [6, 4]);
  assert.deepEqual(fight.turn.opponentSpeedDice, [1, 5]);
  assert.equal(resolveDestinySpeed(fight).turn.winner, 'hero');
});

test('critical strike changes raw faces, mangle adds two for each six', () => {
  let fight = use(win(start({ 'deep-wound': 1, 'critical-strike': 1, mangle: 1 })), 'deep-wound');
  fight = rollDestinyDamage(fight, rolls(1, 2));
  fight = resolveDestinyDamage(use(fight, 'critical-strike'));
  assert.deepEqual(fight.turn.damageDice, [6, 6]);
  assert.equal(fight.turn.damageScore, 20);
});

test('siphon automatically changes opponent damage sixes to ones', () => {
  const fight = hit(lose(start({ siphon: 1 })), 6);
  assert.deepEqual(fight.turn.damageDice, [1]);
  assert.equal(fight.hero.health, 17);
});

test('finesse rerolls one damage die and adds two without turning it into an extra raw six', () => {
  let fight = rollDestinyDamage(win(start({ finesse: 1, mangle: 1 })), rolls(1));
  fight = resolveDestinyDamage(use(fight, 'finesse', { die: 0 }, rolls(4)));
  assert.deepEqual(fight.turn.damageDice, [4]);
  assert.equal(fight.turn.damageScore, 10);
});

test('bleed starts this round; disease starts the next; repeated hits do not stack either', () => {
  let fight = hit(win(start({ bleed: 1, disease: 1, 'blood-frenzy': 1 })), 1);
  assert.equal(fight.opponents[0].health, 98);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 3);
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[0].health, 97);
  fight = hit(win(startDestinyRound(fight, 0)), 1);
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[0].health, 92);
  assert.equal(fight.effects.filter(effect => effect.kind === 'bleed').length, 1);
});

test('freeze blocks two rounds of passive damage, then expires', () => {
  let fight = use(start({ freeze: 1 }), 'freeze');
  const poison = [{ target: 'hero', amount: 3, ignoreArmour: true }];
  for (let round = 1; round <= 3; round++) {
    if (round > 1) fight = startDestinyRound(fight, 0);
    fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
    fight = endDestinyRound(fight, poison);
    assert.equal(fight.hero.health, round <= 2 ? 20 : 17);
  }
});

test('crawlers affects exactly two rounds; ice edge affects only the following round', () => {
  let fight = use(start({ crawlers: 1, 'ice-edge': 1 }), 'crawlers');
  fight = hit(win(fight), 6);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 0);
  fight = hit(win(fight), 1);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 2);
});

test('lightning retaliation is non-stacking, ignores armour and waits until end for a passive death move', () => {
  const enemies = [{ name: 'Fragile', speed: 2, brawn: 4, armour: 99, health: 2 },
    { name: 'Other', speed: 2, brawn: 4, armour: 3, health: 10 }];
  let fight = hit(lose(start({ lightning: 2 }, {}, enemies)), 1);
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(fight.phase, 'end');
  fight = endDestinyRound(fight);
  assert.equal(fight.phase, 'death-move');
});

test('insufficient sacrifices and invalid dice choices cannot spend uses or mutate a fight', () => {
  const fight = start({ darksilver: 1 }, { health: 1 });
  const before = structuredClone(fight);
  assert.throws(() => use(fight, 'darksilver'), /health/);
  assert.deepEqual(fight, before);
  let lethal = use(start({ darksilver: 1 }, { health: 2 }), 'darksilver');
  assert.equal(lethal.status, 'loss');
  assert.equal(lethal.hero.health, 0);
  const rolled = rollDestinySpeed(start({ agility: 1 }), rolls(2, 2, 2, 2));
  assert.throws(() => use(rolled, 'agility', { die: 0 }), /one/);
  assert.equal(rolled.used.agility, undefined);
});

const group = (count = 3) => Array.from({ length: count }, (_, index) =>
  ({ name: 'Enemy ' + index, speed: 2, brawn: 4, armour: 99, health: 100 }));

test('cleave shares one roll across all living foes, ignores armour and replaces normal damage', () => {
  const fight = use(win(start({ cleave: 1, weaver: 1 }, {}, group())), 'cleave', {}, rolls(4));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [96, 96, 96]);
  assert.equal(fight.hero.health, 22);
  assert.equal(fight.phase, 'end');
  assert.throws(() => rollDestinyDamage(fight), /stage/);
});

test('aftershock rolls separately and rejects nonadjacent targets without spending a charge', () => {
  const ready = win(start({ aftershock: 1 }, {}, group()));
  assert.throws(() => use(ready, 'aftershock', { targets: [0, 2] }), /adjacent/);
  assert.equal(ready.used.aftershock, undefined);
  const fight = use(ready, 'aftershock', { targets: [0, 1] }, rolls(1, 6));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [99, 94, 100]);
});

test('dragon fire and stampede retain distinct target order and separate rolls', () => {
  let fight = use(win(start({ 'dragon-fire': 1 }, {}, group())), 'dragon-fire', { target: 1 }, rolls(1, 2, 3, 4, 6));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [99, 91, 94]);
  fight = use(win(start({ stampede: 1 }, {}, group(4))), 'stampede', { target: 1 }, rolls(1, 2, 3, 4, 5, 6));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [100, 94, 91, 94]);
});

test('hurricane rush recoils once per victim and still resolves all victims on lethal recoil', () => {
  const fight = use(win(start({ 'hurricane-rush': 1 }, { health: 2 }, group())), 'hurricane-rush', {}, rolls(1, 1, 1, 1, 1, 1));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [98, 98, 98]);
  assert.equal(fight.hero.health, 0);
  assert.equal(fight.status, 'loss');
});

test('rake forbids damage modifiers while ordinary damage dice receive bloody maiden', () => {
  let fight = use(use(win(start({ rake: 1, 'bloody-maiden': 1 })), 'bloody-maiden'), 'rake', {}, rolls(1, 1, 1));
  assert.equal(fight.opponents[0].health, 97);
  fight = use(use(win(start({ cleave: 1, 'bloody-maiden': 1 })), 'bloody-maiden'), 'cleave', {}, rolls(1));
  assert.equal(fight.opponents[0].health, 97);
});

test('blizzard delays its extra dice until the next round and rolls separately for each victim', () => {
  let fight = use(win(start({ blizzard: 1 }, {}, group())), 'blizzard', { targets: [0, 1] }, rolls(1, 1, 1, 1));
  fight = endDestinyRound(fight, [], rolls());
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [98, 98, 100]);
  fight = startDestinyRound(fight, 2);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  fight = endDestinyRound(fight, [], rolls(2, 5));
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [96, 93, 100]);
  fight = startDestinyRound(fight, 2);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  assert.doesNotThrow(() => endDestinyRound(fight, [], rolls()));
});

test('phantom absorbs eight total passive damage and passes excess back to the hero', () => {
  let fight = use(win(start({ phantom: 1 })), 'phantom');
  fight = endDestinyRound(fight, [{ target: 'hero', amount: 5, ignoreArmour: true }]);
  assert.equal(fight.hero.health, 20);
  assert.equal(fight.phantomHealth, 3);
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(3, 3, 3, 3)));
  fight = endDestinyRound(fight, [{ target: 'hero', amount: 5, ignoreArmour: true }]);
  assert.equal(fight.hero.health, 18);
  assert.equal(fight.phantomHealth, 0);
});

test('both Shatter variants require an explicit choice and share one combat charge', () => {
  for (const variant of ['armour-minus-two', 'armour-zero-next-round']) {
    let fight = hit(win(start({ shatter: 1 })), 1);
    assert.throws(() => use(fight, 'shatter'), /variant/);
    fight = use(fight, 'shatter', { variant });
    assert.equal(destinyStat(fight, 0, 'armour'), variant === 'armour-minus-two' ? 1 : 3);
    fight = startDestinyRound(endDestinyRound(fight), 0);
    assert.equal(destinyStat(fight, 0, 'armour'), variant === 'armour-minus-two' ? 1 : 0);
    fight = hit(win(fight), 1);
    assert.throws(() => use(fight, 'shatter', { variant }), /no uses/);
    fight = startDestinyRound(endDestinyRound(fight), 0);
    assert.equal(destinyStat(fight, 0, 'armour'), variant === 'armour-minus-two' ? 1 : 3);
  }
});

test('wind chill kills require retargeting, cannot trigger bleed, and preserve the spent speed slot', () => {
  const enemies = [{ name: 'Fragile', speed: 2, brawn: 4, armour: 99, health: 2 }, ...group(2)];
  let fight = use(start({ quicksilver: 1, 'wind-chill': 1, bleed: 1 }, {}, enemies), 'quicksilver');
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(fight.effects.filter(effect => effect.kind === 'bleed').length, 0);
  assert.throws(() => rollDestinySpeed(fight), /living/);
  fight = retargetDestinyRound(fight, 1);
  assert.equal(fight.turn.used.sp, true);
  assert.equal(fight.round, 1);
  assert.doesNotThrow(() => win(fight));
});

test('death moves share one round slot and resolve after a passive batch', () => {
  const enemies = [{ name: 'Weak', speed: 2, brawn: 4, armour: 0, health: 1 },
    { name: 'Small', speed: 2, brawn: 4, armour: 99, health: 5 }, ...group(1)];
  let fight = hit(win(start({ eviscerate: 1, 'shadow-thorns': 1 }, {}, enemies)), 1);
  fight = use(fight, 'eviscerate');
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [0, 0, 100]);
  assert.equal(fight.turn.used.dm, true);
  fight = endDestinyRound(fight);
  assert.equal(fight.phase, 'start');
  assert.throws(() => use(fight, 'shadow-thorns'), /unavailable/);
});

test('deadly dance has two combat uses, a one-round slowdown and a permanent enemy damage increase', () => {
  let fight = start({ 'deadly-dance': 1 });
  for (let i = 1; i <= 2; i++) {
    fight = use(fight, 'deadly-dance');
    assert.equal(destinyStat(fight, 0, 'speed'), 0);
    assert.equal(destinyStat(fight, 0, 'brawn'), 4 + i);
    fight = startDestinyRound(endDestinyRound(hit(win(fight), 1)), 0);
    assert.equal(destinyStat(fight, 0, 'speed'), 2);
  }
  assert.throws(() => use(fight, 'deadly-dance'), /no uses/);
});

test('trickster exchanges selected faces instead of copying or rerolling them', () => {
  let fight = rollDestinySpeed(start({ trickster: 1 }), rolls(1, 2, 5, 6));
  fight = use(fight, 'trickster', { heroDie: 0, opponentDie: 1 });
  assert.deepEqual(fight.turn.heroSpeedDice, [6, 2]);
  assert.deepEqual(fight.turn.opponentSpeedDice, [5, 1]);
});

test('conditional extra dice require a six and invalid requests preserve their charge', () => {
  let fight = rollDestinySpeed(start({ 'ice-slick': 1 }), rolls(1, 2, 1, 1));
  assert.throws(() => use(fight, 'ice-slick'), /six/);
  assert.equal(fight.used['ice-slick'], undefined);
  fight = rollDestinySpeed(start({ 'ice-slick': 1 }), rolls(6, 2, 1, 1));
  fight = use(fight, 'ice-slick', {}, rolls(4));
  assert.deepEqual(fight.turn.heroSpeedDice, [6, 2, 4]);
  fight = rollDestinyDamage(win(start({ 'cruel-twist': 1 })), rolls(6));
  fight = use(fight, 'cruel-twist', {}, rolls(3));
  assert.deepEqual(fight.turn.damageDice, [6, 3]);
});

test('frost guard protects this round and slows all foes only next round', () => {
  let fight = use(start({ 'frost-guard': 1 }, {}, group()), 'frost-guard');
  assert.equal(destinyStat(fight, 'hero', 'armour'), 5);
  assert.equal(destinyStat(fight, 0, 'speed'), 2);
  fight = hit(lose(fight), 6);
  assert.equal(fight.hero.health, 15);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 'hero', 'armour'), 2);
  assert.deepEqual(group().map((_, i) => destinyStat(fight, i, 'speed')), [1, 1, 1]);
});

test('counter both reduces the enemy damage score and inflicts an armour-ignoring damage die', () => {
  let fight = use(lose(start({ counter: 1 })), 'counter', {}, rolls(3));
  fight = hit(fight, 6);
  assert.equal(fight.opponents[0].health, 97);
  assert.equal(fight.turn.damageScore, 8);
  assert.equal(fight.hero.health, 14);
});

test('overpower cancels normal enemy damage and does two dice; slam delays a slowdown', () => {
  let fight = use(lose(start({ overpower: 1 })), 'overpower', {}, rolls(2, 3));
  assert.equal(fight.phase, 'end');
  assert.equal(fight.opponents[0].health, 95);
  assert.equal(fight.hero.health, 20);
  fight = use(lose(start({ slam: 1 })), 'slam');
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 1);
});

test('roll with it uses brawn while shoulder charge can use the greater magic score', () => {
  for (const name of ['roll-with-it', 'shoulder-charge']) {
    let fight = use(win(start({ [name]: 1 }, { brawn: 1, magic: 9 })), name, { die: 0 });
    assert.equal(fight.phase, 'damage-rolled');
    fight = resolveDestinyDamage(fight);
    assert.equal(fight.turn.damageScore, name === 'roll-with-it' ? 7 : 15);
  }
});

test('twin blade uses speed dice without adding a combat attribute or rolling damage', () => {
  const fight = use(win(start({ 'twin-blade': 1 }, {}, group())), 'twin-blade', { targets: [0, 1] }, rolls());
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [88, 88, 100]);
});

test('wave enforces its total and per-foe magic allocation limits without spending invalid uses', () => {
  const ready = win(start({ wave: 1 }, { magic: 7 }, group()));
  assert.throws(() => use(ready, 'wave', { allocations: [5, 1, 1] }), /limit/);
  assert.throws(() => use(ready, 'wave', { allocations: [4, 4, 0] }), /limit/);
  assert.equal(ready.used.wave, undefined);
  const fight = use(ready, 'wave', { allocations: [4, 2, 1] });
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [96, 98, 99]);
});

test('post-hit response abilities require actual enemy health damage', () => {
  let fight = hit(lose(start({ retaliation: 1, rebound: 1 })), 1);
  fight = use(fight, 'retaliation', {}, rolls(3));
  assert.equal(fight.opponents[0].health, 97);
  assert.throws(() => use(fight, 'rebound'), /one ability/);
  fight = hit(lose(start({ rebound: 1 }, { armour: 99 })), 1);
  assert.throws(() => use(fight, 'rebound'), /health damage/);
});

test('parasite raises only the chosen attribute for this round', () => {
  let fight = use(start({ parasite: 1 }, {}, [{ name: 'Mage', speed: 7, magic: 9, armour: 3, health: 100 }]), 'parasite', { attribute: 'magic' });
  assert.equal(destinyStat(fight, 'hero', 'magic'), 9);
  fight = startDestinyRound(endDestinyRound(hit(win(fight), 1)), 0);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 1);
});

test('reaper uses actual health damage; pain barrier uses actual passive loss including dead targets', () => {
  let fight = hit(win(start({ reaper: 1 }, { brawn: 20 })), 3);
  fight = use(fight, 'reaper');
  assert.equal(fight.hero.health, 24);
  const enemies = [{ name: 'Weak', speed: 2, brawn: 4, armour: 0, health: 1 }, ...group(1)];
  fight = start({ barbs: 1, decay: 1, 'pain-barrier': 1 }, {}, enemies);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  fight = endDestinyRound(fight);
  assert.equal(fight.turn.passiveDamageByTarget[0], 1);
  fight = use(fight, 'pain-barrier', { target: 0 });
  assert.equal(fight.hero.health, 21);
});

test('choke hold follows combat-ability health damage and delays its slowdown', () => {
  let fight = use(win(start({ piercing: 1, 'choke-hold': 1 })), 'piercing');
  fight = hit(fight, 1);
  fight = use(fight, 'choke-hold', {}, rolls(2, 3));
  assert.equal(fight.opponents[0].health, 90);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 1);
});

test('recall restores a used modifier once and rejects an unused or wrong-category ability', () => {
  let fight = use(start({ cunning: 1, recall: 1, haste: 1 }), 'cunning');
  assert.throws(() => use(fight, 'recall', { restore: 'haste' }), /required type/);
  fight = use(fight, 'recall', { restore: 'cunning' });
  fight = use(fight, 'cunning');
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 10);
  assert.throws(() => use(fight, 'recall', { restore: 'cunning' }), /no uses/);
});

test('tormented soul pays health to restore a combat ability without clearing the round slot', () => {
  let fight = use(win(start({ piercing: 1, 'tormented-soul': 1 })), 'piercing');
  fight = use(fight, 'tormented-soul', { restore: 'piercing' });
  assert.equal(fight.hero.health, 16);
  assert.equal(fight.used.piercing, 0);
  assert.equal(fight.turn.used.co, true);
  assert.throws(() => use(fight, 'piercing'), /one ability/);
});

test('murder persists and recuperation heals only a surviving hero', () => {
  const enemies = [{ name: 'Weak', speed: 2, brawn: 4, armour: 0, health: 1 }, ...group(1)];
  let fight = hit(win(start({ murder: 1 }, {}, enemies)), 1);
  fight = use(fight, 'murder', { target: 1 });
  assert.equal(destinyStat(fight, 1, 'speed'), 1);
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[1].health, 99);
  fight = hit(win(start({ recuperation: 1 }, {}, enemies)), 1);
  fight = endDestinyRound(use(fight, 'recuperation'));
  assert.equal(fight.hero.health, 21);
});

test('poison cloud requires adjacent targets and persists without repeated casting', () => {
  let fight = use(win(start({ 'poison-cloud': 1 }, {}, group())), 'poison-cloud', { targets: [0, 1] });
  fight = endDestinyRound(fight);
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [99, 99, 100]);
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(3, 3, 3, 3)));
  fight = endDestinyRound(fight);
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [98, 98, 100]);
});

test('equipment prerequisites are checked before spending an ability', () => {
  let fight = win(start({ 'rallying-call': 1 }));
  assert.throws(() => use(fight, 'rallying-call'), /equipment/);
  fight = startDestinyRound(configureDestinyAbilities(setup({}), { 'rallying-call': 1 }, { leftHand: { type: 'horn' } }), 0);
  fight = use(win(fight), 'rallying-call');
  assert.equal(fight.hero.health, 26);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 4);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 6);
});

test('bear form retains the transformation and prevents further combat abilities', () => {
  let fight = use(win(start({ 'shape-shift': 1, piercing: 1 })), 'shape-shift');
  assert.equal(fight.hero.health, 24);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 7);
  assert.equal(destinyStat(fight, 'hero', 'armour'), 0);
  fight = win(startDestinyRound(endDestinyRound(fight), 0));
  assert.throws(() => use(fight, 'piercing'), /bear form/);
  assert.equal(fight.abilities['blood-frenzy'], 1);
});

test('blind strike preserves a won normal attack, but a killed target cannot attack as a ghost', () => {
  let fight = use(start({ blind: 1, 'blind-strike': 1 }), 'blind');
  fight = use(fight, 'blind-strike', {}, rolls(2, 3));
  assert.equal(fight.phase, 'speed');
  assert.equal(fight.opponents[0].health, 95);
  const enemies = [{ name: 'Weak', speed: 2, brawn: 4, armour: 99, health: 1 }, ...group(1)];
  fight = use(start({ blind: 1, 'blind-strike': 1 }, {}, enemies), 'blind');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 1)));
  fight = use(fight, 'blind-strike', {}, rolls(1, 1));
  assert.equal(fight.phase, 'death-move');
  assert.throws(() => rollDestinyDamage(fight), /stage/);
});

test('retargeting does not transfer a single-target disabling effect to a different enemy', () => {
  let fight = use(start({ blind: 1 }, {}, group()), 'blind');
  fight = retargetDestinyRound(fight, 1);
  fight = rollDestinySpeed(fight, rolls(3, 3, 3, 3));
  assert.equal(fight.turn.opponentSpeedDice.length, 2);
});

test('weakening a mixed-stat foe can target its magic independently of its brawn attack', () => {
  const enemies = [{ name: 'Drake keeper', speed: 2, brawn: 5, magic: 3, damageStat: 'brawn', armour: 3, health: 70 }];
  let fight = use(hit(win(start({ corruption: 1 }, {}, enemies)), 1), 'corruption', { attribute: 'magic' });
  assert.equal(destinyStat(fight, 0, 'brawn'), 5);
  assert.equal(destinyStat(fight, 0, 'magic'), 1);
  fight = use(win(start({ wither: 1 }, {}, enemies)), 'wither', { attribute: 'magic' }, rolls(1, 1));
  assert.equal(destinyStat(fight, 0, 'magic'), 2);
});

test('invalid target representations cannot silently spend a single-target ability', () => {
  const fight = start({ radiance: 1 });
  assert.throws(() => use(fight, 'radiance', { target: '0' }), /living/);
  assert.equal(fight.used.radiance, undefined);
  assert.throws(() => use(setup({ 'pain-barrier': 1 }), 'pain-barrier'), /unavailable/);
});

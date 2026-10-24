import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinterFight, useWinterAction } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import { startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage,
  resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const preset = (section, hero = {}, options = {}) => createWinterFight({ speed: 20, brawn: 4, magic: 3,
  armour: 2, health: 20, maxHealth: 30, ...hero }, section, options);
const win = (fight, ...branch) => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 2, 2)), rolls(...branch));
const lose = (fight, ...branch) => resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)), rolls(...branch));
const hit = (fight, value = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(value)), rolls());
const end = (fight, ...values) => endDestinyRound(fight.phase === 'death-move' ? skipDestinyDeathMove(fight) : fight, [], rolls(...values));

test('the elder catches unprotected heroes before ordinary damage, including on a standoff', () => {
  let fight = startDestinyRound(preset(475, { speed: 6, health: 4, maxHealth: 30 }), 0);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  assert.equal(fight.turn.winner, 'standoff');
  assert.equal(fight.status, 'loss');
  fight = use(startDestinyRound(preset(475, {}, { abilities: { frenzy: 1 } }), 0), 'frenzy');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 6, 2, 2)));
  assert.equal(fight.hero.health, 20);
  fight = end(hit(fight));
  fight = win(startDestinyRound(fight, 0));
  assert.equal(fight.hero.health, 16);
});

test('night terrors slow on health hits, add Nanuk damage and continue their end attacks at one survivor', () => {
  let fight = lose(startDestinyRound(preset(467, { speed: 0, armour: 0, health: 80, maxHealth: 80 }), 0));
  fight = end(hit(fight));
  assert.equal(fight.hero.health, 70); // Seven from the score and three from the terrors.
  fight.opponents[0].health = 0;
  fight.opponents[1].health = 0;
  fight.hero.speed = 20;
  fight = startDestinyRound(fight, 2);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 18);
  fight = hit(win(fight));
  assert.equal(fight.turn.damageScore, 7);
  fight = end(fight);
  assert.equal(fight.hero.health, 69);
});

test('the smaller coven has healing and outnumbered without a nonexistent matriarch ward', () => {
  let fight = use(startDestinyRound(preset(516, { brawn: 0, magic: 0 }, { abilities: { insight: 1 } }), 0), 'insight');
  assert.equal(destinyStat(fight, 0, 'armour'), 2);
  fight = hit(win(fight));
  fight.opponents[0].health = 29;
  fight = end(fight);
  assert.equal(fight.opponents[0].health, 30);
  assert.equal(fight.hero.health, 17);
});

test('alternate Grubnose encounter frees his arm on round four and counts only goblin end attacks', () => {
  let fight = preset(567, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 4; round++) {
    fight = startDestinyRound(fight, 0);
    assert.equal(destinyStat(fight, 0, 'speed'), round < 4 ? 3 : 5);
    fight = end(hit(win(fight)));
  }
  assert.equal(fight.hero.health, 12);
  for (const section of [485, 533]) assert.equal(hit(win(startDestinyRound(preset(section, { brawn: 60 }), 0))).status, 'win');
});

test('Keening splinters occur every third round and spending speed avoids the whole shower once', () => {
  let fight = preset(174, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 3; round++) {
    fight = startDestinyRound(fight, 0, round === 3 ? rolls(1, 2, 1, 2, 6, 6) : rolls());
    if (round === 3) {
      const before = structuredClone(fight);
      fight = useWinterAction(fight, 'avoid-splinters');
      assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
      assert.equal(destinyStat(before, 'hero', 'speed'), 20);
      assert.throws(() => useWinterAction(fight, 'avoid-splinters'), /available/);
      fight = resolve(JSON.parse(JSON.stringify(fight)));
      assert.equal(fight.hero.health, 20);
    }
    fight = end(hit(win(fight)));
  }
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
});

test('Keening splinter faces inflict four each and round seven loses only if the foe survives', () => {
  let fight = preset(174, { brawn: 0, magic: 0, health: 100, maxHealth: 100 });
  for (let round = 1; round <= 7; round++) {
    fight = startDestinyRound(fight, 0, rolls(1, 2, 3, 4, 5, 6));
    if (fight.phase === 'ability-rolled') fight = resolve(fight);
    fight = end(hit(win(fight)));
  }
  assert.equal(fight.status, 'loss');
  assert.equal(fight.hero.health, 84);
  fight = preset(174, { brawn: 60 });
  fight.round = 6;
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.status, 'win');
});

test('Sasquatch swats use separate editable damage and speed-challenge windows', () => {
  let fight = lose(startDestinyRound(preset(337, { speed: 0, armour: 99 }, { abilities: { watchful: 1 } }), 0), 3);
  fight = resolve(fight, rolls(6, 2));
  assert.equal(fight.turn.pendingAbility.event.kind, 'enemy-dice-damage');
  fight = use(fight, 'watchful', { die: 0 });
  fight = resolve(fight, rolls(6, 6));
  assert.equal(fight.hero.health, 17);
  assert.equal(fight.turn.pendingAbility.event.kind, 'sasquatch-challenge');
  fight = resolve(JSON.parse(JSON.stringify(fight)), rolls(4));
  assert.equal(fight.turn.pendingAbility.event.name, 'Ground smash damage');
  fight = resolve(fight);
  assert.equal(fight.hero.health, 13);
  assert.equal(fight.phase, 'end');
});

test('Sasquatch normal attacks and successful ground-smash dodges keep their distinct outcomes', () => {
  let fight = lose(startDestinyRound(preset(337, { speed: 0 }), 0), 2);
  assert.equal(resolve(fight).phase, 'damage');
  fight = lose(startDestinyRound(preset(337, { speed: 3 }), 0), 6);
  fight = resolve(fight, rolls(1, 1));
  fight = resolve(fight, rolls(6, 6));
  fight = resolve(fight);
  assert.equal(fight.hero.health, 18);
  assert.equal(fight.phase, 'end');
});

test('Syn Hulda ignores armour reduction, drops ice skin at forty health and blocks ice-body passives', () => {
  let fight = preset(292, { brawn: 49 }, { abilities: { insight: 1, bleed: 1, decay: 1, venom: 1 } });
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 22);
  fight = use(fight, 'insight');
  assert.equal(destinyStat(fight, 0, 'armour'), 10);
  fight = hit(win(fight));
  assert.equal(fight.opponents[0].health, 40);
  assert.equal(destinyStat(fight, 0, 'armour'), 4);
  assert.equal(fight.effects.some(effect => ['bleed', 'venom'].includes(effect.kind)), false);
  fight = end(resolve(end(fight, 1)));
  assert.equal(fight.opponents[0].health, 40);
  assert.equal(fight.hero.health, 17);
});

test('three prison sixes free Skoll once, heal after end damage and add a permanent score bonus', () => {
  let fight = preset(292, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 3; round++) {
    fight = hit(win(startDestinyRound(fight, 0)));
    fight = resolve(end(fight, 6));
    fight = end(fight);
  }
  assert.equal(fight.encounter.skollFreed, true);
  assert.equal(fight.encounter.prisonSixes, 3);
  assert.equal(fight.hero.health, 17); // Nine ice-fang damage, six healing.
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.turn.damageScore, 3);
  fight = end(fight);
  assert.equal(fight.phase, 'start');
  assert.equal(fight.hero.health, 14);
});

test('the razor queen grows only her living swarm, without a starting-health cap', () => {
  let fight = hit(win(startDestinyRound(preset(107, { brawn: 0, magic: 0 }), 0)));
  fight = end(fight);
  assert.equal(fight.opponents[1].health, 70);
  assert.equal(fight.hero.health, 18);
  fight.opponents[0].health = 0;
  fight = end(hit(win(startDestinyRound(fight, 1))));
  assert.equal(fight.opponents[1].health, 70);
  assert.equal(fight.hero.health, 16);
  fight = preset(107);
  fight.opponents[1].health = 0;
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.opponents[1].health, 0);
  assert.equal(fight.hero.health, 20);
});

test('the first training-yard encounter forbids abilities and preserves its surrender roll across reload', () => {
  let fight = startDestinyRound(preset(348, { brawn: 36 }, { abilities: { frenzy: 1, bleed: 1 } }), 0);
  assert.throws(() => use(fight, 'frenzy'), /unavailable/);
  fight = end(hit(win(fight)));
  assert.equal(fight.opponents[0].health, 9);
  assert.equal(fight.effects.some(effect => effect.kind === 'bleed'), false);
  fight = startDestinyRound(fight, 0, rolls(4));
  fight = resolve(JSON.parse(JSON.stringify(fight)));
  assert.equal(fight.status, 'win');
  assert.equal(fight.opponents[0].health, 9);
});

test('the second coven group blocks modifiers until its matriarch dies and never revives fallen acolytes', () => {
  let fight = startDestinyRound(preset(375, { brawn: 60 }, { abilities: { 'might-of-stone': 1 } }), 0);
  assert.throws(() => use(fight, 'might-of-stone'), /blocking/);
  fight = hit(win(fight));
  fight.opponents[1].health = 29;
  fight.opponents[2].health = 0;
  fight = end(fight);
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(fight.opponents[1].health, 30);
  assert.equal(fight.opponents[2].health, 0);
  assert.equal(fight.hero.health, 17);
  fight = startDestinyRound(fight, 1);
  // An owned modifier becomes available as soon as the ward's owner is dead.
  fight = use(fight, 'might-of-stone');
  assert.equal(fight.used['might-of-stone'], 1);
});

test('Moulder tests stop on death while Skelly alone controls the speed penalty', () => {
  let fight = startDestinyRound(preset(379, { brawn: 0, magic: 0 }), 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
  fight = end(hit(win(fight)), 2);
  assert.equal(fight.phase, 'ability-rolled');
  fight = end(resolve(fight));
  assert.equal(fight.hero.health, 19);
  fight.opponents[1].health = 0;
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
  fight = preset(379, { brawn: 30 });
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.phase, 'start');
  assert.equal(fight.hero.health, 20);
});

test('the later hunter ambush expires after exactly two rounds and the riftwing is ordinary combat', () => {
  let fight = preset(402, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 3; round++) {
    fight = startDestinyRound(fight, 0);
    assert.equal(destinyStat(fight, 0, 'speed'), round <= 2 ? 0 : 2);
    fight = end(hit(win(fight)));
  }
  fight = hit(win(startDestinyRound(preset(371, { brawn: 30 }), 0)));
  assert.equal(fight.status, 'win');
});

test('Drokke resists speed-dice reductions and his frenzy triggers once at fifty health', () => {
  let fight = startDestinyRound(preset(407, { brawn: 57 }, { abilities: { webbed: 1 } }), 0);
  const before = structuredClone(fight);
  assert.throws(() => use(fight, 'webbed'), /immune/);
  assert.deepEqual(fight, before);
  fight = hit(win(fight)); // 57 + 1 - 8 = 50 health damage.
  assert.equal(fight.opponents[0].health, 50);
  assert.equal(destinyStat(fight, 0, 'speed'), 13);
  assert.equal(destinyStat(fight, 0, 'brawn'), 11);
  fight = end(fight);
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 0, 'brawn'), 11);
  assert.equal(fight.effects.filter(effect => effect.source === 'encounter-health').length, 2);
});

test('rat disease persists once, independently of outnumbered and the infecting rat', () => {
  let fight = lose(startDestinyRound(preset(436, { speed: 0, armour: 0 }), 0));
  fight = hit(fight);
  fight = end(fight);
  assert.equal(fight.hero.health, 10); // Five from the score, two disease, three outnumbered.
  fight.opponents[0].health = 0;
  fight.opponents[1].health = 0;
  fight = end(hit(win(startDestinyRound(fight, 2))));
  assert.equal(fight.hero.health, 8); // One opponent no longer causes outnumbered damage.
  assert.deepEqual(fight.encounter.heroStatuses, { disease: 2 });
});

test('spider paralysis blocks only the following round, leaving existing passive damage active', () => {
  let fight = lose(startDestinyRound(preset(447, { speed: 0, armour: 0, health: 80, maxHealth: 80 },
    { abilities: { frenzy: 1, 'might-of-stone': 1, bleed: 1 } }), 0));
  fight = hit(fight);
  fight = end(fight);
  fight = startDestinyRound(fight, 0);
  assert.throws(() => use(fight, 'frenzy'), /blocked/);
  assert.throws(() => use(fight, 'might-of-stone'), /blocked/);
  fight.effects.push({ kind: 'bleed', target: 1, amount: 1, from: 1, until: 99 });
  // Use a standoff so paralysis is not renewed by another enemy hit.
  fight.hero.speed = 5;
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  fight = end(fight);
  assert.equal(fight.opponents[1].health, 19);
  fight = use(startDestinyRound(fight, 0), 'frenzy');
  assert.equal(fight.turn.used.sp, true);
});

test('roc attack branches preserve unavoidable fixed damage and ordinary damage-score attacks', () => {
  for (const face of [1, 2, 3, 4, 5, 6]) {
    let fight = lose(startDestinyRound(preset(83, { speed: 0, armour: 99 }), 0), face);
    assert.equal(fight.hero.health, 20);
    fight = resolve(fight);
    if (face <= 2) {
      assert.equal(fight.hero.health, 15);
      assert.equal(fight.phase, 'end');
      fight = startDestinyRound(end(fight), 0);
      assert.equal(destinyStat(fight, 'hero', 'speed'), 0);
    } else assert.equal(fight.phase, 'damage');
  }
});

test('Command and Unstoppable can interrupt a pending enemy attack choice', () => {
  for (const name of ['command', 'unstoppable']) {
    let fight = lose(startDestinyRound(preset(83, { speed: 0 }, { abilities: { [name]: 1 } }), 0), 1);
    fight = use(fight, name);
    assert.equal(fight.turn.winner, 'hero');
    assert.equal(fight.phase, 'damage');
    assert.equal(fight.turn.pendingAbility, undefined);
    assert.equal(fight.hero.health, name === 'unstoppable' ? 15 : 20);
    assert.equal(hit(fight).opponents[0].health, 21); // 25 health minus (4 brawn + 1 die - 1 armour).
  }
});

test('all Sable bands heal, attack normally or open separate opponent-owned curse damage dice', () => {
  for (const face of [1, 2, 3, 4, 5, 6]) {
    let fight = preset(101, { speed: 0, armour: 99 }, { abilities: { watchful: 1, charm: 1 } });
    fight.opponents[0].health = 70;
    fight = lose(startDestinyRound(fight, 0), face);
    fight = resolve(fight, rolls(6, 2, 3));
    if (face <= 2) {
      assert.equal(fight.opponents[0].health, 75);
      assert.equal(fight.phase, 'end');
    } else if (face <= 4) assert.equal(fight.phase, 'damage');
    else {
      assert.throws(() => use(fight, 'charm', { die: 0 }, rolls(1)), /hero die/);
      fight = resolve(use(fight, 'watchful', { die: 0 }));
      assert.equal(fight.hero.health, 14);
      assert.equal(fight.encounter.blockedRounds.from, 2);
      assert.equal(fight.encounter.blockedRounds.until, 2);
    }
  }
});

test('Sable blocks speed and combat abilities for precisely the following round', () => {
  let fight = lose(startDestinyRound(preset(101, { speed: 0, armour: 99 }, { abilities: { haste: 1, command: 1, focus: 1 } }), 0), 6);
  fight = resolve(resolve(fight, rolls(1, 1, 1)));
  fight = startDestinyRound(end(fight), 0);
  assert.throws(() => use(fight, 'haste'), /blocked/);
  fight = use(fight, 'focus');
  fight = resolve(lose(fight, 3));
  assert.throws(() => use(fight, 'command'), /blocked/);
  fight = startDestinyRound(end(hit(fight)), 0);
  assert.doesNotThrow(() => use(fight, 'haste'));
});

test('acid-spray chance increases each round and is applied in the same end batch as phoenix damage', () => {
  let fight = hit(win(startDestinyRound(preset(41, { brawn: 0, magic: 0 }), 0)));
  fight = end(fight, 2);
  assert.equal(fight.hero.health, 20);
  fight = resolve(fight);
  fight = end(fight);
  assert.deepEqual(fight.opponents.map(e => e.health), [18, 18, 18]);
  fight = hit(win(startDestinyRound(fight, 0)));
  fight = resolve(end(fight, 2));
  assert.equal(fight.hero.health, 20);
  fight = end(fight);
  assert.equal(fight.hero.health, 16);
});

test('simultaneous lethal hazard and enemy passive damage cannot produce a healed false victory', () => {
  let fight = preset(41, { brawn: 0, magic: 0, health: 4 });
  fight.opponents.forEach(enemy => { enemy.health = 2; });
  fight = hit(win(startDestinyRound(fight, 0)));
  fight = end(resolve(end(fight, 1)));
  assert.equal(fight.status, 'loss');
  assert.equal(fight.hero.health, 0);
  assert.deepEqual(fight.opponents.map(e => e.health), [0, 0, 0]);
});

test('petrifying gaze allows Charm before its batch and the Titan shield changes only the dangerous faces', () => {
  let fight = hit(win(startDestinyRound(preset(154, { brawn: 0, magic: 0, health: 30 }, { abilities: { charm: 1, insulated: 1 } }), 0)));
  fight = end(fight, 5, 6, 3, 5);
  fight = use(fight, 'charm', { die: 0 }, rolls(1));
  fight = end(resolve(fight));
  assert.equal(fight.hero.health, 19);
  fight = hit(win(startDestinyRound(preset(154, { brawn: 0, magic: 0, health: 30 }, { fimbulwinter: true }), 0)));
  fight = end(resolve(end(fight, 1, 1, 6, 5)));
  assert.equal(fight.hero.health, 28);
});

test('weak venom checks only real health hits and stops rolling once the hero is poisoned', () => {
  let fight = startDestinyRound(preset(175, { speed: 0, armour: 0 }, { abilities: { charm: 1 } }), 0);
  fight = resolveDestinyDamage(rollDestinyDamage(lose(fight), rolls(1)), rolls(1));
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(4)));
  fight = end(fight);
  assert.equal(fight.hero.health, 18);
  fight = startDestinyRound(fight, 0);
  fight = resolveDestinyDamage(rollDestinyDamage(lose(fight), rolls(1)), rolls(1));
  fight = end(resolve(fight));
  assert.equal(fight.hero.health, 14);
  fight = startDestinyRound(fight, 0);
  fight = resolveDestinyDamage(rollDestinyDamage(lose(fight), rolls(1)), rolls());
  assert.equal(fight.phase, 'end');
  assert.equal(end(fight).hero.health, 10);
});

test('Jogahh acorns replace normal damage, lower three stats and have a strict limit of three', () => {
  let fight = preset(159);
  for (const face of [3, 4, 5]) {
    fight = useWinterAction(win(startDestinyRound(fight, 0)), 'remove-acorn', {}, rolls(face));
    fight = end(resolve(fight));
  }
  assert.equal(fight.opponents[0].health, 80);
  assert.equal(destinyStat(fight, 0, 'speed'), 5);
  assert.equal(destinyStat(fight, 0, 'magic'), 6);
  assert.equal(destinyStat(fight, 0, 'armour'), 7);
  fight = win(startDestinyRound(fight, 0));
  assert.throws(() => useWinterAction(fight, 'remove-acorn'), /acorn/);
});

test('spore cloud affects only the following round and clears after a successful avoidance roll', () => {
  let fight = hit(win(startDestinyRound(preset(202), 0)));
  fight = end(resolve(end(fight, 3)));
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
  fight = end(resolve(end(hit(win(fight)), 4)));
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
});

test('Rook challenges use the current speed score, including modifiers played before resolving the test', () => {
  let fight = startDestinyRound(preset(211, { speed: 0 }, { abilities: { darksilver: 1 } }), 0, rolls(4, 5));
  const failed = resolve(fight);
  assert.equal(failed.hero.health, 16);
  fight = resolve(use(fight, 'darksilver'));
  assert.equal(fight.hero.health, 18);
  assert.equal(fight.phase, 'speed');
});

test('a start challenge cannot overwrite a pending trap roll and both survive serialization', () => {
  let fight = use(preset(211, { speed: 0 }, { abilities: { 'best-laid-plans': 1 } }), 'best-laid-plans', { trap: 'cluster-mine' }, rolls(1));
  fight = startDestinyRound(fight, 0, rolls(1), { trapTargets: [0], deferTrapDamage: true });
  assert.equal(fight.turn.pendingAbility.name, 'cluster-mine');
  fight = resolve(JSON.parse(JSON.stringify(fight)), rolls(4, 5));
  assert.equal(fight.turn.pendingAbility.name, 'Throwing knives');
  assert.equal(fight.opponents[0].health, 34);
  fight = resolve(fight);
  assert.equal(fight.hero.health, 16);
});

test('training bans active and automatic special abilities; yielding wins without killing Rutus', () => {
  let fight = preset(293, { brawn: 36 }, { abilities: { barbs: 1, charm: 1, 'first-blood': 1 } });
  assert.throws(() => use(fight, 'first-blood', { target: 0 }), /once/);
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.opponents[0].health, 9);
  fight = startDestinyRound(fight, 0, rolls(4));
  assert.throws(() => use(fight, 'charm', { die: 0 }, rolls(1)), /unavailable/);
  fight = resolve(fight);
  assert.equal(fight.status, 'win');
  assert.equal(fight.opponents[0].health, 9);
});

test('Doomta becomes enraged after round four and damage-score disease does not stack', () => {
  let fight = preset(275, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 4; round++) {
    fight = hit(win(startDestinyRound(fight, 0)));
    assert.equal(destinyStat(fight, 0, 'brawn'), 3);
    fight = end(fight);
  }
  assert.equal(destinyStat(fight, 0, 'brawn'), 6);
  assert.equal(destinyStat(fight, 0, 'speed'), 4);
});

test('companion damage bonuses apply to damage scores; tar slowdown waits until the next round', () => {
  let fight = hit(win(startDestinyRound(preset(216), 0)));
  assert.equal(fight.turn.damageScore, 7);
  fight = startDestinyRound(end(fight), 0);
  // Force an enemy win without changing the stored hero speed.
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)));
  // Hero speed 20 prevents that win, so use the low-speed setup for the hit condition.
  fight = hit(lose(startDestinyRound(preset(216, { speed: 0, armour: 0 }), 0)), 1);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 0);
  fight = startDestinyRound(end(fight), 0);
  assert.equal(fight.effects.some(effect => effect.source === 'encounter-hit' && effect.from === 2), true);
});

test('leaf blades resist bleed and venom, still take decay, and stop the encounter when Willow falls', () => {
  let fight = hit(win(startDestinyRound(preset(271, { brawn: 5 }, { abilities: { bleed: 1, venom: 1, decay: 1 } }), 1)));
  assert.equal(fight.effects.some(effect => ['bleed', 'venom'].includes(effect.kind) && effect.target === 1), false);
  fight = end(fight);
  assert.equal(fight.opponents[1].health, 20);
  fight = hit(win(startDestinyRound(preset(271, { brawn: 100 }), 0)));
  assert.equal(fight.status, 'win');
  assert.equal(fight.opponents[1].health, 25);
});

test('Asynjur crowd control reduces every survivor once per defeated opponent', () => {
  let fight = hit(win(startDestinyRound(preset(311, { brawn: 50 }), 0)));
  assert.equal(destinyStat(fight, 1, 'magic'), 4);
  assert.equal(destinyStat(fight, 1, 'armour'), 4);
  fight = end(fight);
  assert.equal(fight.hero.health, 16);
  fight = hit(win(startDestinyRound(fight, 1)));
  assert.equal(destinyStat(fight, 2, 'magic'), 3);
  assert.equal(destinyStat(fight, 2, 'armour'), 3);
});

test('Grubnose frees his arm at round four; only goblins contribute stabbing damage', () => {
  let fight = preset(316, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 4; round++) {
    fight = startDestinyRound(fight, 0);
    assert.equal(destinyStat(fight, 0, 'speed'), round < 4 ? 3 : 5);
    fight = end(hit(win(fight)));
  }
  assert.equal(fight.hero.health, 8);
});

test('spectral dust sets speed to zero for the next round and still allows a new speed bonus', () => {
  let fight = hit(win(startDestinyRound(preset(325, {}, { abilities: { frenzy: 1 } }), 0)));
  fight = startDestinyRound(end(fight), 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 0);
  fight = use(fight, 'frenzy');
  assert.equal(destinyStat(fight, 'hero', 'speed'), 3);
  fight = hit(lose(fight));
  fight = startDestinyRound(end(fight), 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
});

test('birdman feathers cancel only the low-roll attack branch', () => {
  for (const face of [1, 3, 4, 6]) {
    let fight = win(startDestinyRound(preset(333), 0), face);
    fight = resolve(fight);
    assert.equal(fight.phase, face <= 3 ? 'end' : 'damage');
    if (face <= 3) assert.throws(() => rollDestinyDamage(fight), /stage/);
  }
});

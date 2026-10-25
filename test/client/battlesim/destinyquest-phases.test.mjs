import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinterFight } from './destinyquest-fixtures.mjs';
import { startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage, resolveDestinyDamage,
  endDestinyRound, skipDestinyDeathMove, retargetDestinyRound } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { destinyStat, isDestinyOpponentActive } from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import { resolveDestinyAbilityRoll as resolve } from './destinyquest-fixtures.mjs';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const preset = (section, hero = {}, abilities = {}, options = {}) => createWinterFight({ speed: 20, brawn: 4, magic: 3,
  armour: 2, health: 80, maxHealth: 80, ...hero }, section, { abilities, ...options });
const win = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 2, 2)));
const hit = (fight, face = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(face)));
const end = fight => endDestinyRound(fight.phase === 'death-move' ? skipDestinyDeathMove(fight) : fight, [], rolls());
const transport = (stability = 10, toughness = 10, abilities = []) => ({ equipment: { transport: { stability, toughness, abilities } } });

test('the drake keeper uses Brawn for attacks and its current Magic for the cannon', () => {
  let fight = preset(590, { speed: 0 }, { corruption: 1 });
  fight = hit(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(1, 1, 6, 6))));
  assert.equal(fight.turn.damageScore, 6);
  fight = end(fight);
  assert.equal(fight.hero.health, 73); // Four score damage plus three Magic damage.
  fight.hero.speed = 20;
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.turn.damageScore, 7);
  fight = use(fight, 'corruption', { attribute: 'magic' });
  fight = end(fight);
  assert.equal(fight.hero.health, 72);
});

test('hailstorm scales with remaining health and body of air blocks its four named passive statuses', () => {
  let fight = preset(599, { brawn: 40 }, { bleed: 1, decay: 1, disease: 1, venom: 1 });
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.opponents[0].health, 55);
  assert.equal(fight.hero.health, 75);
  assert.equal(fight.effects.some(effect => ['bleed', 'disease', 'venom'].includes(effect.kind)), false);
});

test('infestation starts on actual score damage, grows each round and cannot be reset by another hit', () => {
  let fight = preset(603, { speed: 0, armour: 100 });
  const lose = fight => resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(1, 1, 6, 6)));
  fight = end(hit(lose(fight)));
  assert.equal(fight.encounter.growingStatus, undefined);
  assert.equal(fight.hero.health, 80);
  fight.hero.armour = 0;
  fight = end(hit(lose(fight)));
  assert.equal(fight.hero.health, 66);
  assert.equal(fight.encounter.growingStatus.from, 2);
  fight = end(hit(lose(fight)));
  assert.equal(fight.hero.health, 50);
  assert.equal(fight.encounter.growingStatus.from, 2);
});

test('both drake heads contribute frost fire and Insulated halves each surviving head contribution', () => {
  for (const insulated of [false, true]) {
    let fight = preset(615, { brawn: 0, magic: 0 }, insulated ? { insulated: 1 } : {});
    fight = end(hit(win(startDestinyRound(fight, 0))));
    assert.equal(fight.hero.health, insulated ? 78 : 76);
    fight.opponents[1].health = 0;
    fight = end(hit(win(startDestinyRound(fight, 0))));
    assert.equal(fight.hero.health, insulated ? 77 : 74);
  }
});

test('only Sleet slows on score hits, while every living attacker contributes claw damage', () => {
  for (const target of [0, 1]) {
    let fight = preset(619, { speed: 4 });
    fight = end(hit(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, target), rolls(1, 1, 6, 6)))));
    fight = startDestinyRound(fight, target);
    assert.equal(destinyStat(fight, 'hero', 'speed'), target === 0 ? 3 : 4);
    assert.equal(fight.hero.health, target === 0 ? 68 : 70);
  }
});

test('the tide punishes rounds without speed or combat abilities, including rounds with only a modifier', () => {
  for (const ability of [null, 'might-of-stone', 'frenzy', 'piercing']) {
    let fight = startDestinyRound(preset(626, { brawn: 0, magic: 0 }, ability ? { [ability]: 1 } : {}), 0);
    if (['frenzy', 'might-of-stone'].includes(ability)) fight = use(fight, ability);
    fight = ability === 'frenzy' ? resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 6, 2, 2))) : win(fight);
    if (ability === 'piercing') fight = use(fight, ability);
    fight = end(hit(fight));
    assert.equal(fight.hero.health, ['frenzy', 'piercing'].includes(ability) ? 79 : 74);
  }
});

test('Barl forbids speed abilities and his fifth-round temper changes each printed stat once', () => {
  let fight = preset(635, { brawn: 0, magic: 0 }, { frenzy: 1 });
  for (let round = 1; round <= 6; round++) {
    fight = startDestinyRound(fight, 0);
    assert.throws(() => use(fight, 'frenzy'), /blocking/);
    assert.equal(destinyStat(fight, 0, 'speed'), round < 5 ? 9 : 10);
    assert.equal(destinyStat(fight, 0, 'magic'), round < 5 ? 7 : 10);
    fight = end(hit(win(fight)));
  }
});

test('the cardinal reflects actual score and ability-dice damage, without reflecting passive damage', () => {
  let fight = preset(666, { brawn: 20 }, { decay: 1, 'blind-strike': 1, webbed: 1 });
  fight = hit(win(use(startDestinyRound(fight, 0), 'webbed')));
  assert.equal(fight.turn.healthDamage, 13);
  assert.equal(fight.hero.health, 73);
  fight = use(fight, 'blind-strike', {}, rolls(3, 2));
  assert.equal(fight.hero.health, 70);
  fight = end(fight);
  assert.equal(fight.hero.health, 68);
  assert.equal(fight.opponents[0].health, 41);
  fight = preset(666, { brawn: 100, health: 20, maxHealth: 20 });
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(fight.status, 'loss'); // Reflection on the killing blow cannot be healed into a win.
});

test('Nanuk rolls two damage dice and spirit-link healing resolves once after end damage', () => {
  let fight = preset(668, { speed: 0, armour: 0 });
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(1, 1, 6, 6)));
  fight = resolveDestinyDamage(rollDestinyDamage(fight, rolls(2, 3)));
  assert.equal(fight.turn.damageScore, 14);
  fight.opponents[0].health = 79;
  fight = resolve(endDestinyRound(fight, [], rolls(3)));
  fight = end(fight);
  assert.equal(fight.hero.health, 62);
  assert.equal(fight.opponents[0].health, 80);
});

test('the drakaloth hive keeps its final surviving end attack and Caul bonus', () => {
  let fight = preset(672);
  fight.opponents[1].health = fight.opponents[2].health = fight.opponents[3].health = 0;
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.hero.health, 79);
  assert.equal(fight.turn.damageScore, 7);
});

test('Fenrir distraction cancels attacks while only Fenrir score hits weaken both hero attack attributes', () => {
  for (const target of [0, 1]) {
    let fight = preset(698, { speed: 0, armour: 0 });
    fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, target), rolls(1, 1, 6, 6)), rolls(3));
    fight = end(resolve(fight));
    assert.equal(fight.hero.health, 76);
    fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, target), rolls(1, 1, 6, 6)), rolls(4));
    fight = hit(resolve(fight));
    assert.equal(destinyStat(fight, 'hero', 'brawn'), target === 0 ? 3 : 4);
    assert.equal(destinyStat(fight, 'hero', 'magic'), target === 0 ? 2 : 3);
  }
});

test('Danse Macabre uses indestructible roots without inventing their missing health or armour', () => {
  let fight = preset(468, { speed: 0 }, { decay: 1, lightning: 1 });
  assert.equal(fight.opponents[0].health, null);
  assert.equal(fight.opponents[0].armour, null);
  assert.equal(fight.opponents[1].speed, null);
  assert.throws(() => startDestinyRound(fight, 0), /component/);
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 1), rolls(1, 1, 6, 6)));
  fight = end(hit(fight));
  assert.equal(fight.hero.health, 74); // Roots magic five + die one - armour two, then hip-hop bones two.
  assert.equal(fight.opponents[0].health, null);
  assert.equal(fight.opponents[1].health, 100);
});

test('winning against roots opens exactly two skeleton strikes before speed must be tested again', () => {
  let fight = hit(win(startDestinyRound(preset(468, { brawn: 10 }), 1)));
  assert.equal(fight.opponents[1].health, 93);
  fight = end(fight);
  assert.equal(fight.encounter.automaticHitsRemaining, 1);
  fight = startDestinyRound(JSON.parse(JSON.stringify(fight)), 1);
  fight = hit(resolveDestinySpeed(rollDestinySpeed(fight, rolls())));
  fight = end(fight);
  assert.equal(fight.opponents[1].health, 86);
  assert.equal(fight.encounter.automaticHitsRemaining, 0);
  fight = rollDestinySpeed(startDestinyRound(fight, 1), rolls(3, 4, 2, 5));
  assert.deepEqual(fight.turn.opponentSpeedDice, [2, 5]);
});

test('only the skeleton must fall, while roots remain intact and passive immunity rejects every passive source', () => {
  let fight = preset(468, { brawn: 0, magic: 0 }, { barbs: 1, bleed: 1, decay: 1, venom: 1 });
  fight = hit(win(startDestinyRound(fight, 1)));
  fight = endDestinyRound(fight, [{ target: 1, amount: 99, ignoreArmour: true, source: 'external passive' }]);
  assert.equal(fight.opponents[1].health, 100);
  fight.hero.brawn = 110;
  fight = hit(win(startDestinyRound(fight, 1)));
  assert.equal(fight.status, 'win');
  assert.equal(fight.opponents[0].health, null);
});

test('mirror shards retain absent speed and magic while the wraith supplies actual attack rolls', () => {
  let fight = preset(565, { speed: 0 }, { lightning: 1 });
  assert.equal(fight.opponents[1].speed, null);
  assert.equal(fight.opponents[1].magic, null);
  assert.throws(() => destinyStat(fight, 1, 'speed'), /no such/);
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 1), rolls(1, 1, 3, 3)));
  assert.equal(fight.history.at(-1).opponent, 11); // Wraith speed five, not a fabricated mirror speed.
  fight = hit(fight);
  assert.equal(fight.turn.damageScore, 7); // Magic three, die one, three living mirrors.
  assert.equal(fight.hero.health, 75);
  assert.equal(fight.opponents[0].health, 40); // The wraith also blocks Lightning while shielded.
  assert.deepEqual(fight.opponents.slice(1).map(enemy => enemy.health), [14, 14, 14]);
});

test('mirror protection covers opening and direct abilities, while soul glass rejects bleed and decay', () => {
  let fight = preset(565, { brawn: 4 }, { 'first-blood': 1, bleed: 1, decay: 1 });
  fight = use(fight, 'first-blood', { target: 0 }, rolls(6, 6));
  assert.equal(fight.opponents[0].health, 40);
  fight = end(hit(win(startDestinyRound(fight, 1))));
  assert.equal(fight.opponents[1].health, 11);
  assert.equal(fight.opponents[2].health, 14);
  assert.equal(fight.opponents[0].health, 40);
  assert.equal(fight.effects.some(effect => effect.kind === 'bleed'), false);
});

test('breaking the last mirror releases Caul damage without changing any source mirror stats', () => {
  let fight = preset(565, { brawn: 16 });
  for (const target of [1, 2, 3]) fight = end(hit(win(startDestinyRound(fight, target))));
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.turn.damageScore, 19);
  assert.equal(fight.opponents[0].health, 25);
  assert.equal(fight.opponents[1].speed, null);
});

test('speed control follows the wraith across mirror targets and Insulated removes only its mirror bonus', () => {
  let fight = use(startDestinyRound(preset(565, { speed: 0 }, { webbed: 1, insulated: 1 }), 1), 'webbed');
  fight = retargetDestinyRound(fight, 2);
  fight = rollDestinySpeed(fight, rolls(1, 1, 6));
  assert.deepEqual(fight.turn.opponentSpeedDice, [6]);
  fight = hit(resolveDestinySpeed(fight));
  assert.equal(fight.turn.damageScore, 4);
  assert.equal(fight.hero.health, 78);
});

test('Kraken tentacles shield all damage paths until every tentacle is defeated', () => {
  let fight = preset(48, { brawn: 40 }, { 'first-blood': 1, decay: 1, wave: 1 }, transport());
  assert.throws(() => startDestinyRound(fight, 0), /guards/);
  fight = use(fight, 'first-blood', { target: 0 }, rolls(6, 6));
  assert.equal(fight.opponents[0].health, 90);
  fight = win(startDestinyRound(fight, 1));
  fight.hero.magic = 20;
  fight = use(fight, 'wave', { allocations: [10, 0, 0, 0, 0] });
  assert.equal(fight.opponents[0].health, 90);
  fight = end(fight);
  assert.equal(fight.opponents[0].health, 90);
  assert.deepEqual(fight.opponents.slice(1).map(enemy => enemy.health), [29, 29, 29, 29]);
  for (const target of [1, 2, 3, 4]) {
    fight = hit(win(startDestinyRound(fight, target)));
    if (fight.round === 4) {
      fight = endDestinyRound(skipDestinyDeathMove(fight), [], rolls(1, 1, 1, 1));
      fight = end(resolve(fight));
    } else fight = end(fight);
  }
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.turn.healthDamage, 34);
});

test('Kraken pressure repeats every fourth round, stages damage once and wears down the real transport', () => {
  let fight = preset(48, { brawn: 0, magic: 0 }, {}, transport(3, 3));
  for (let round = 1; round <= 8; round++) {
    fight = hit(win(startDestinyRound(fight, 1)));
    fight = endDestinyRound(fight, [], round % 4 === 0 ? rolls(1, 2, 3, 4) : rolls());
    if (round % 4 === 0) {
      assert.equal(fight.hero.health, round === 4 ? 80 : 70);
      fight = resolve(JSON.parse(JSON.stringify(fight)));
      fight = end(fight);
    }
  }
  assert.equal(fight.hero.health, 60);
  assert.equal(fight.equipment.transport.stability, 0);
  assert.equal(fight.equipment.transport.toughness, 0);
});

test('transport setup is required, and zero stability removes only its own ability copy', () => {
  for (const section of [48, 542]) assert.throws(() => preset(section), /transport/);
  let fight = startDestinyRound(preset(542, {}, { 'dragon-fire': 1, 'armour-plating': 1 }, transport(2, 9, ['dragon-fire'])), 0, rolls(1));
  fight = resolve(fight);
  assert.equal(fight.hero.health, 79);
  fight = win(fight);
  assert.throws(() => use(fight, 'dragon-fire'), /unavailable/);
  fight = preset(542, {}, { 'dragon-fire': 2 }, transport(2, 9, ['dragon-fire']));
  fight = win(resolve(startDestinyRound(fight, 0, rolls(1))));
  fight = use(fight, 'dragon-fire', { deferDamage: true }, rolls(1, 1, 1));
  assert.equal(fight.phase, 'ability-rolled');
});

test('Seethe poison has editable enemy dice and armour plating follows remaining toughness', () => {
  let fight = preset(542, {}, { 'armour-plating': 1, watchful: 1 }, transport(4, 9));
  fight = use(fight, 'armour-plating');
  assert.equal(destinyStat(fight, 'hero', 'armour'), 6);
  fight = startDestinyRound(fight, 0, rolls(6));
  fight = use(fight, 'watchful', { die: 0 });
  fight = resolve(fight);
  assert.equal(fight.hero.health, 79);
  assert.equal(destinyStat(fight, 'hero', 'armour'), 5);
  assert.equal(fight.equipment.transport.stability, 2);
  assert.equal(fight.equipment.transport.toughness, 7);
});

test('the prison has automatic hits and total passive immunity while the sheltered necromancer grows', () => {
  let fight = preset(580, { brawn: 0, magic: 0 }, { bleed: 1, barbs: 1, decay: 1, venom: 1 });
  assert.throws(() => startDestinyRound(fight, 0), /guards/);
  fight = startDestinyRound(fight, 1);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls()));
  assert.equal(fight.turn.winner, 'hero');
  fight = end(hit(fight));
  assert.equal(fight.opponents[1].health, 20);
  assert.equal(fight.opponents[0].health, 15);
});

test('banner guards help only after the prison breaks and the necromancer stops growing immediately', () => {
  let fight = preset(580, { brawn: 24 }, {}, { bannerLit: true });
  fight = hit(win(startDestinyRound(fight, 1)));
  assert.equal(fight.turn.damageScore, 25);
  fight = end(fight);
  assert.equal(fight.opponents[0].health, 10);
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.turn.damageScore, 27);
  assert.equal(fight.status, 'win');
});

test('surrendering einherjar retain their health and leave targeting, passive damage and outnumbered', () => {
  let fight = preset(318, { brawn: 37, magic: 8 }, { decay: 1, 'malefic-runes': 1, wave: 1 });
  fight = hit(win(startDestinyRound(fight, 1))); // 37 - 4 chain + 1 die - 4 armour = 30.
  assert.equal(fight.opponents[1].health, 10);
  assert.equal(fight.phase, 'end');
  assert.equal(isDestinyOpponentActive(fight, 1), false);
  assert.deepEqual(fight.turn.deaths, []);
  fight = end(fight);
  assert.equal(fight.opponents[1].health, 10);
  assert.equal(fight.hero.health, 77);
  assert.throws(() => startDestinyRound(fight, 1), /living/);
  fight = startDestinyRound(fight, 2);
  assert.throws(() => retargetDestinyRound(fight, 1), /living/);
  fight = win(fight);
  assert.throws(() => use(fight, 'wave', { allocations: [0, 1, 0, 0] }), /Distribute/);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 4);
});

test('handler surrender restores chain attributes immediately and all four surrender without death rewards', () => {
  let fight = preset(318, { brawn: 37, magic: 8 }, { 'malefic-runes': 1 });
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.opponents[0].health, 10);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 37);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 8);
  fight = end(fight);
  for (const target of [1, 2, 3]) {
    fight = hit(win(startDestinyRound(fight, target)));
    if (fight.status === 'active') fight = end(fight);
  }
  assert.equal(fight.status, 'win');
  assert.equal(fight.defeated, undefined);
  assert.equal(fight.effects.some(effect => effect.source === 'malefic-runes'), false);
});

test('surrender on an overwhelming strike does not create a death move or a kill reward', () => {
  let fight = hit(win(startDestinyRound(preset(318, { brawn: 100 }, { 'malefic-runes': 1 }), 1)));
  assert.equal(fight.opponents[1].health, 0);
  assert.deepEqual(fight.turn.deaths, []);
  assert.equal(fight.defeated, undefined);
  assert.equal(fight.phase, 'end');
});

test('reserve snowmen join once at each twenty-health threshold without fake zero-health actors', () => {
  let fight = preset(578, { brawn: 21 }); // 21 + 1 + 2 ally - 4 armour = 20.
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [70, 15, 15, 15]);
  assert.throws(() => startDestinyRound(fight, 1), /living/);
  for (const count of [1, 2, 3]) {
    fight = hit(win(startDestinyRound(fight, 0)));
    assert.equal(fight.opponents[0].health, 70 - count * 20);
    assert.deepEqual([1, 2, 3].map(target => isDestinyOpponentActive(fight, target)), [1, 2, 3].map(target => target <= count));
    fight = end(fight);
  }
  assert.equal(fight.hero.health, 71); // Two, three and four active foes.
  assert.deepEqual(fight.encounter.inactiveTargets, []);
});

test('snow bodies ignore bleed decay venom and insulated heroes ignore the end hazard', () => {
  let fight = preset(578, { brawn: 21 }, { insulated: 1, bleed: 1, decay: 1, venom: 1 });
  fight = end(hit(win(startDestinyRound(fight, 0))));
  assert.equal(fight.opponents[0].health, 50);
  assert.equal(fight.opponents[1].health, 15);
  assert.equal(fight.hero.health, 80);
  assert.equal(fight.effects.some(effect => ['bleed', 'venom'].includes(effect.kind)), false);
});

test('a lethal boss hit activates every reserve and cannot win before all snowmen are defeated', () => {
  let fight = hit(win(startDestinyRound(preset(578, { brawn: 100 }), 0)));
  assert.equal(fight.status, 'active');
  assert.deepEqual(fight.encounter.inactiveTargets, []);
  fight = end(fight);
  for (const target of [1, 2, 3]) {
    fight = hit(win(startDestinyRound(fight, target)));
    if (fight.status === 'active') fight = end(fight);
  }
  assert.equal(fight.status, 'win');
});

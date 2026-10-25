import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(672);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { newSamuraiCharacter } from '../../../public/js/battlesim/engines/sword-of-samurai/character.js';
import { SAMURAI_SOURCE_ROSTERS, SAMURAI_FIGHTS, SAMURAI_RULES,
  samuraiContinuation, samuraiContinuationLimit, samuraiCharcoalTiming } from '../../../public/js/battlesim/engines/sword-of-samurai/roster.js';
import { startSamuraiFight, samuraiRound, resolveSamuraiAction, setSamuraiTarget }
  from '../../../public/js/battlesim/engines/sword-of-samurai/core.js';

const source = JSON.parse(readFileSync(new URL('./sword-of-samurai-source.json', import.meta.url)));
const constant = value => () => value;
const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die roll'); return values.shift(); };
const character = changes => ({ ...newSamuraiCharacter({ art: 'acrobatics' }, constant(6)), luck: 0, ...changes });
const start = (section, changes = {}, options = {}) =>
  startSamuraiFight(section, character(changes), { applyEntry: false, ...options }, constant(6));
const strong = { skill: 100, stamina: 1000 };
const settle = (fight, roll = constant(6)) => {
  let count = 0;
  while (fight.pending) {
    assert.ok(count++ < 20);
    const mandatory = ['curse', 'critical'].includes(fight.pending.kind);
    fight = resolveSamuraiAction(fight, mandatory, roll);
  }
  return fight;
};

test('roster settings control armoured, phantom and phoenix damage', () => {
  const saved=structuredClone(SAMURAI_RULES);
  try {
    SAMURAI_RULES.armour={normal:3,lucky:5,unlucky:1};SAMURAI_RULES.phantom={odd:3,even:4};SAMURAI_RULES.phoenixOffset=0;
    assert.equal(samuraiRound(start(266,strong),constant(1)).enemies[0].stamina,7);
    const lucky=samuraiRound(start(266,{...strong,luck:7}),constant(1));
    assert.equal(resolveSamuraiAction(lucky,true,constant(1)).enemies[0].stamina,5);
    const unlucky=samuraiRound(start(266,{...strong,luck:1}),constant(1));
    assert.equal(resolveSamuraiAction(unlucky,true,constant(6)).enemies[0].stamina,9);
    assert.equal(samuraiRound(start(94,strong),constant(1)).enemies[0].stamina,7);
    assert.equal(samuraiRound(start(94,strong),constant(2)).enemies[0].stamina,6);
    assert.equal(samuraiRound(start(372,{skill:1,stamina:100}),constant(1)).character.stamina,99);
  } finally {Object.assign(SAMURAI_RULES,saved);}
});

test('roster settings control spear, spell, rune and periodic beam effects', () => {
  const saved=structuredClone(SAMURAI_RULES);
  try {
    SAMURAI_RULES.spearDamage=5;SAMURAI_RULES.spells=[{maxRoll:6,stat:'stamina',amount:7,section:901}];
    SAMURAI_RULES.beam={period:1,odd:7,even:2};SAMURAI_RULES.runeLoss=2;
    assert.equal(startSamuraiFight(92,character({skill:1}),{applyEntry:true},constant(6)).character.stamina,19);
    const spell=samuraiRound(start(292,{skill:1,stamina:100}),constant(1));
    assert.equal(spell.character.stamina,91);assert(spell.events.some(e=>e.kind==='spell'&&e.section===901));
    assert.equal(samuraiRound(start(364,{...strong,stamina:100}),constant(1)).character.stamina,93);
    let runes=start(199,{skill:5,stamina:8,luck:3});runes.config.swordRunes=444;
    runes=samuraiRound(runes,rolls(1,1,6,6));runes=resolveSamuraiAction(runes,false,rolls(4,4));
    assert.equal(runes.character.skill,3);assert.equal(runes.character.luck,1);
    assert(runes.events.some(e=>e.kind==='runeLoss'&&e.section===444));
  } finally {Object.assign(SAMURAI_RULES,saved);}
});

test('continuation uses catalog links and captured thresholds with a legacy fallback', () => {
  const first=start(82,strong);first.status='story';first.destination=32;first.enemies[0].stamina=6;
  first.config.threshold.stamina=7;first.wounded=true;
  const saved=JSON.stringify(first),spec=samuraiContinuation(first);
  assert.equal(spec.section,32);assert.equal(samuraiContinuationLimit(spec,first),7);
  const next=startSamuraiFight(32,first.character,{carryFrom:JSON.parse(saved)});
  assert.equal(next.enemies[0].stamina,6);assert.equal(next.wounded,true);
  assert.deepEqual(next.character,first.character);assert.equal(JSON.stringify(first),saved);
  const legacy=JSON.parse(saved);delete legacy.config.threshold;legacy.enemies[0].stamina=4;
  assert.equal(samuraiContinuationLimit(spec,legacy),5);
  assert.equal(startSamuraiFight(32,legacy.character,{carryFrom:legacy}).enemies[0].stamina,4);
  assert.equal(samuraiContinuation({...first,destination:'32'}),undefined);
  assert.equal(samuraiContinuation({...first,config:{},destination:13}),undefined);
  assert.equal(samuraiContinuation({...first,config:{section:'82'}}),undefined);
  const sections=SAMURAI_RULES.charcoalTimingSections;
  try{SAMURAI_RULES.charcoalTimingSections=[281];assert(samuraiCharcoalTiming(281));assert(!samuraiCharcoalTiming(93));}
  finally{SAMURAI_RULES.charcoalTimingSections=sections;}
});

test('all83 printed stat rows and all59 source sections match an independent source fixture', () => {
  const sections = [...new Set(source.rows.map(row => row.section))];
  assert.equal(source.sourceHash, '615239ea3898d0e352bf05f765e45f17d6a051f078cf679e040633189a935337');
  assert.equal(sections.length, 59);
  assert.equal(source.rows.length, 83);
  assert.deepEqual(Object.keys(SAMURAI_SOURCE_ROSTERS).map(Number), sections);
  for (const section of sections) {
    assert.deepEqual(SAMURAI_SOURCE_ROSTERS[section].map(row => [row.skill, row.stamina]),
      source.rows.filter(row => row.section === section).map(row => [row.skill, row.stamina]));
  }
  assert.equal(SAMURAI_FIGHTS.length, 60);
  assert.equal(new Set(SAMURAI_FIGHTS.map(fight => fight.section)).size, 60);
  assert.equal(SAMURAI_FIGHTS.find(fight => fight.section === 32).continuation, 82);
});

test('source roster names map to the correct opponents, not anonymous section labels', () => {
  const names = { КАПА: 'kappa', РОКУРОКУБИ: 'rokuroKubi', ТАЦУ: 'tatsu', ИКИРУ: 'ikiru',
    САМУРАЙКОННИК: 'mountedSamurai', ВОЙНСАМУРАЙ: 'mountedSamurai', МУКАДЕ: 'mukade',
    ПРИЗРАЧНАСЯНКА: 'shadow', ПАЯКТАРАНТУЛА: 'tarantula', ВОДЕНПАЯК: 'waterSpider',
    САМУРАЙПРИЗРАК: 'ghostSamurai', ПРИЗРАЧЕНСАМУРАЙ: 'ghostSamurai', ВЪГЛИЩАР: 'charcoalBurner',
    ПРИЗРАЧЕНДЕМОН: 'ghostDemon', САМУРАЙ: 'samurai', СТРАЖ: 'guard', ТОТАТЕКУМО: 'totateKumo',
    ЛОРДЦИЕЦИН: 'tsietsin', ШИКОМЕ: 'shikome', САБЛЕЗЪБТИГЪР: 'tiger',
    ТЕЛОХРАНИТЕЛНАЦИЕЦИН: 'bodyguard', ГОЛЯМАЗМИЯ: 'greatSnake', СТРАЖШИКОМЕ: 'shikomeGuard',
    МАРМОТ: 'marmot', БОГОМОЛКАДЕМОН: 'mantis', ШУРА: 'shura', РОНИНЪТГИНСЕЙ: 'ginsei',
    ТЪМНИЧАР: 'jailer', ДАЙОНИ: 'daiOni', СРЕБЪРЕНСАМУРАЙ: 'silverSamurai', СКЕЛЕТ: 'skeleton',
    ТАЛАСЪМ: 'talasam', ГАРГАНТУС: 'gargantus', ВЪГЛИЩАРСГЛАВНЯ: 'torchBurner',
    ФЕНИКС: 'phoenix', ЧЕРЕНЛОС: 'blackElk' };
  for (const section of Object.keys(SAMURAI_SOURCE_ROSTERS).map(Number)) {
    const rows = source.rows.filter(row => row.section === section);
    assert.deepEqual(SAMURAI_SOURCE_ROSTERS[section].map(row => row.name), rows.map(row =>
      names[row.name.replace(/^(Първи|Втори|Трети|Четвърти|Пети|Шести)\s+/u, '').replace(/[^А-Я]/gu, '')]));
  }
});

test('all60 encounters terminate at source destinations and leave their input character unchanged', () => {
  for (const spec of SAMURAI_FIGHTS) {
    const c = character(strong), before = structuredClone(c);
    let fight = startSamuraiFight(spec.section, c,
      { applyEntry: false, ...(spec.continuation ? { continuationStamina: 5 } : {}) }, constant(6));
    let rounds = 0;
    while (fight.status === 'fighting') {
      assert.ok(rounds++ < 100, 'Nonterminating encounter ' + spec.section);
      fight = fight.pending ? resolveSamuraiAction(fight, true, constant(6)) : samuraiRound(fight, constant(6));
    }
    assert.ok(source.choices[spec.section].includes(fight.destination), 'Non-source destination ' + spec.section);
    assert.deepEqual(c, before);
  }
});

test('simultaneous opponents retain individual wounds and winning requires finishing both', () => {
  let fight = start(302, strong);
  fight.enemies[0].stamina = 2;
  const before = structuredClone(fight);
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.status, 'fighting');
  assert.deepEqual(fight.enemies.map(enemy => enemy.stamina), [0, 7]);
  assert.equal(fight.target, 1);
  assert.deepEqual(before.enemies.map(enemy => enemy.stamina), [2, 7]);
  while (fight.status === 'fighting') fight = samuraiRound(fight, constant(6));
  assert.equal(fight.status, 'win'); assert.equal(fight.destination, 310);
  assert.ok(fight.enemies.every(enemy => enemy.stamina === 0));
});

test('manual target switching damages only the selected living opponent', () => {
  const initial = start(302, strong), switched = setSamuraiTarget(initial, 1);
  assert.equal(initial.target, 0);
  const result = samuraiRound(switched, constant(6));
  assert.deepEqual(result.enemies.map(enemy => enemy.stamina), [9, 5]);
  assert.throws(() => setSamuraiTarget(result, 2), RangeError);
});

test('sequential challengers cannot be attacked out of order', () => {
  let fight = start(128, strong);
  assert.throws(() => setSamuraiTarget(fight, 1), RangeError);
  fight.enemies[0].stamina = 2;
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.groupStart, 1);
  assert.deepEqual(fight.enemies.map(enemy => enemy.stamina), [0, 8, 9]);
});

test('six skeletons attack as two distinct groups of three, not six simultaneous foes', () => {
  let fight = start(358, strong);
  for (const enemy of fight.enemies.slice(0, 3)) enemy.stamina = 2;
  assert.throws(() => setSamuraiTarget(fight, 3), RangeError);
  for (let i = 0; i < 3; i++) {
    fight = samuraiRound(fight, constant(6));
    assert.equal(fight.status, 'fighting');
    if (i < 2) assert.equal(fight.groupStart, 0);
  }
  assert.equal(fight.groupStart, 3);
  assert.deepEqual(fight.enemies.slice(3).map(enemy => enemy.stamina), [6, 7, 9]);
  assert.equal(fight.target, 3);
});

test('ten shadows are ten sequential printed9/1 opponents', () => {
  let fight = start(51, strong);
  assert.equal(fight.enemies.length, 10);
  assert.ok(fight.enemies.every(enemy => enemy.skill === 9 && enemy.stamina === 1));
  for (let i = 0; i < 10; i++) {
    fight = samuraiRound(fight, constant(6));
    assert.equal(fight.status, i === 9 ? 'win' : 'fighting');
  }
  assert.equal(fight.destination, 121);
});

test('ordinary ties cause no damage even after100 rounds', () => {
  let fight = start(132, { skill: 7 });
  const before = structuredClone(fight);
  for (let i = 0; i < 100; i++) fight = samuraiRound(fight, constant(3));
  assert.equal(fight.character.stamina, before.character.stamina);
  assert.equal(fight.enemies[0].stamina, before.enemies[0].stamina);
  assert.equal(fight.status, 'fighting');
});

test('Kappa threshold exits do not require killing the group or invent a combat victory', () => {
  for (const section of [13, 97]) {
    let fight = start(section, strong);
    for (let i = 0; i < 5; i++) fight = samuraiRound(fight, constant(6));
    assert.equal(fight.status, 'story'); assert.equal(fight.destination, 31);
    assert.deepEqual(fight.enemies.map(enemy => enemy.stamina), [4, 12, 13]);
  }
});

test('ghost continuation carries both wounds, refuses healing and never repeats Iaijutsu', () => {
  let first = start(82, { ...strong, art: 'iaijutsu', stamina: 15 });
  while (first.status === 'fighting') first = samuraiRound(first, constant(6));
  assert.equal(first.destination, 32); assert.equal(first.enemies[0].stamina, 4);
  let continued = startSamuraiFight(32, first.character, { carryFrom: first }, constant(6));
  assert.equal(continued.character.stamina, 15);
  assert.equal(continued.enemies[0].stamina, 4); assert.equal(continued.enemies[0].staminaInitial, 11);
  continued = samuraiRound(continued, constant(6));
  assert.equal(continued.destination, 58); assert.equal(continued.status, 'story');
  assert.equal(continued.enemies[0].stamina, 2);
  assert.throws(() => startSamuraiFight(32, { ...first.character, stamina: 19 }, { carryFrom: first }), RangeError);
  assert.throws(() => start(32), RangeError);
  assert.equal(start(32, strong, { continuationStamina: 5 }).enemies[0].stamina, 5);
});

test('Iaijutsu automatically deals three only once and consumes no unnecessary single-foe dice', () => {
  let fight = start(132, { art: 'iaijutsu', skill: 100 });
  fight = samuraiRound(fight, () => assert.fail('Iaijutsu does not require a normal attack roll'));
  assert.equal(fight.enemies[0].stamina, 6);
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.enemies[0].stamina, 4);
  for (const section of [252, 275]) {
    const started = start(section, { art: 'iaijutsu', skill: 100 });
    assert.equal(samuraiRound(started, constant(6)).enemies[0].stamina, started.enemies[0].stamina - 2);
  }
});

test('Nito is offered on a qualifying losing roll, before the enemy counterattack', () => {
  let fight = start(44, { art: 'nito', skill: 1 }); fight.enemies[0].stamina = 2;
  fight = samuraiRound(fight, rolls(4, 5, 6, 6));
  assert.equal(fight.pending.kind, 'nito'); assert.equal(fight.character.stamina, 24);
  fight = resolveSamuraiAction(fight, true, rolls(6, 6, 1, 1));
  assert.equal(fight.status, 'win'); assert.equal(fight.character.stamina, 24);
});

test('Nito never chains another extra attack and one sword cannot use it', () => {
  let fight = start(44, { art: 'nito', skill: 100 });
  fight = samuraiRound(fight, rolls(4, 5, 1, 1));
  fight = resolveSamuraiAction(fight, true, rolls(6, 6, 1, 1));
  assert.equal(fight.enemies[0].stamina, 5);
  assert.equal(fight.pending, null); assert.equal(fight.queue.length, 0);
  const oneSword = samuraiRound(start(44, { art: 'nito', skill: 100, swords: 1 }), constant(6));
  assert.equal(oneSword.pending, null); assert.equal(oneSword.enemies[0].stamina, 7);
});

test('Luck is resolved before lethal outgoing or incoming damage is finalized', () => {
  let outgoing = start(132, { skill: 100, luck: 1 }); outgoing.enemies[0].stamina = 2;
  outgoing = samuraiRound(outgoing, constant(6));
  assert.equal(outgoing.pending.kind, 'damageLuck'); assert.equal(outgoing.enemies[0].stamina, 2);
  outgoing = resolveSamuraiAction(outgoing, true, constant(6));
  assert.equal(outgoing.status, 'fighting'); assert.equal(outgoing.enemies[0].stamina, 1);
  let incoming = start(132, { skill: 0, stamina: 2, luck: 12 });
  incoming = samuraiRound(incoming, rolls(1, 1, 6, 6));
  assert.equal(incoming.character.stamina, 2); assert.equal(incoming.status, 'fighting');
  incoming = resolveSamuraiAction(incoming, true, constant(1));
  assert.equal(incoming.character.stamina, 1); assert.equal(incoming.status, 'fighting');
});

test('the mantis takes one normally, two on Lucky hits and permits a blocked Unlucky hit', () => {
  assert.equal(samuraiRound(start(266, { skill: 100 }), constant(6)).enemies[0].stamina, 9);
  assert.equal(samuraiRound(start(266, { skill: 100, art: 'iaijutsu' }), constant(6)).enemies[0].stamina, 9);
  for (const [luck, roll, expected] of [[12, 1, 8], [1, 6, 10]]) {
    let fight = samuraiRound(start(266, { skill: 100, luck }), constant(6));
    fight = resolveSamuraiAction(fight, true, constant(roll));
    assert.equal(fight.enemies[0].stamina, expected);
  }
});

test('the half-physical demon uses the printed even2/odd1 damage die', () => {
  for (const [value, stamina] of [[1, 9], [2, 8]]) {
    const fight = samuraiRound(start(94, { skill: 100 }), rolls(6, 6, 1, 1, value));
    assert.equal(fight.enemies[0].stamina, stamina);
  }
});

test('Phoenix damage is1d6 minus1, including a genuine zero', () => {
  for (const [value, stamina] of [[1, 24], [6, 19]]) {
    const fight = samuraiRound(start(372, { skill: 0 }), rolls(1, 1, 6, 6, value));
    assert.equal(fight.character.stamina, stamina);
    assert.equal(fight.wounded, value !== 1);
  }
});

test('first-kill surrender wins without pretending surviving charcoal burners died', () => {
  for (const section of [93, 307]) {
    let fight = start(section, strong); fight.enemies[0].stamina = 2;
    fight = samuraiRound(fight, constant(6));
    assert.equal(fight.status, 'win'); assert.equal(fight.destination, 347);
    assert.equal(fight.enemies[1].stamina, 9); assert.equal(fight.enemies[1].surrendered, true);
  }
});

test('a wounded first kill continues to365; literal early-wound timing is an explicit override', () => {
  let fight = start(93, { skill: 0, stamina: 1000 });
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.status, 'fighting'); assert.equal(fight.wounded, true);
  fight.character.skill = 100; fight.enemies[0].stamina = 2;
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.status, 'story'); assert.equal(fight.destination, 365);
  const early = samuraiRound(start(307, { skill: 0, stamina: 1000 }, { charcoalTiming: 'firstWound' }), constant(6));
  assert.equal(early.destination, 365); assert.equal(early.enemies[0].stamina, 10);
});

test('ambush281 has two defensive exchanges, not four attacks or an early Nito bonus', () => {
  let fight = samuraiRound(start(281, { ...strong, art: 'nito' }), constant(6));
  assert.equal(fight.defenceRemaining, 0); assert.equal(fight.pending, null);
  assert.deepEqual(fight.enemies.map(enemy => enemy.stamina), [10, 9]);
  assert.equal(fight.events.filter(event => event.defenceOnly).length, 2);
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.enemies[0].stamina, 8); assert.equal(fight.pending.kind, 'nito');
});

test('capturing deadlines preserve LIFE; the jailer deadline is fatal, and final-round wins take precedence', () => {
  for (const [section, rounds, destination, fatal] of [[204, 6, 218, false], [256, 9, 218, false], [282, 4, 332, true]]) {
    let fight = start(section, { skill: 0, stamina: 1000 });
    for (let i = 0; i < rounds; i++) fight = samuraiRound(fight, constant(6));
    assert.equal(fight.status, 'loss'); assert.equal(fight.destination, destination);
    assert.equal(fight.character.stamina === 0, fatal);
  }
  let winner = start(282, strong);
  for (let i = 0; i < 4; i++) winner = samuraiRound(winner, constant(6));
  assert.equal(winner.status, 'win'); assert.equal(winner.destination, 308);
  let torches = start(365, { skill: 0, stamina: 1000 });
  for (let i = 0; i < 5; i++) torches = samuraiRound(torches, constant(6));
  assert.equal(torches.status, 'story'); assert.equal(torches.destination, 377);
});

test('Shikome204 cannot counter for the first two rounds but can on the third', () => {
  let fight = start(204, { skill: 0, stamina: 1000 });
  for (let i = 0; i < 2; i++) fight = samuraiRound(fight, constant(6));
  assert.equal(fight.character.stamina, 1000);
  fight = samuraiRound(fight, constant(6));
  assert.equal(fight.character.stamina, 996);
});

test('silver Samurai exits after three hits without forcing enemy STAMINA to zero', () => {
  let fight = start(341, strong);
  for (let i = 0; i < 3; i++) fight = samuraiRound(fight, constant(6));
  assert.equal(fight.status, 'story'); assert.equal(fight.destination, 291);
  assert.equal(fight.enemies[0].stamina, 6);
});

test('Ikiru27 requires its post-hit Luck check and failed curse means109, not a skipped check', () => {
  let fight = samuraiRound(start(27, { skill: 0, stamina: 1000, luck: 1 }), constant(6));
  fight = resolveSamuraiAction(fight, false);
  assert.equal(fight.pending.kind, 'curse');
  assert.throws(() => resolveSamuraiAction(fight, false), RangeError);
  fight = resolveSamuraiAction(fight, true, constant(6));
  assert.equal(fight.status, 'loss'); assert.equal(fight.destination, 109); assert.equal(fight.character.stamina, 0);
  let survivor = samuraiRound(start(27, { skill: 0, stamina: 1000, luck: 12 }), constant(6));
  survivor = resolveSamuraiAction(survivor, false);
  survivor = resolveSamuraiAction(survivor, true, constant(1));
  assert.equal(survivor.status, 'fighting'); assert.equal(survivor.character.stamina, 998);
  assert.equal(survivor.character.luck, 11);
});

test('Ikiru199 critical Luck resolves to235; failed critical Luck leaves the wounded foe alive', () => {
  for (const [luck, value, status, stamina] of [[12, 1, 'win', 0], [1, 6, 'fighting', 10]]) {
    let fight = samuraiRound(start(199, { skill: 100, luck }), constant(6));
    fight = resolveSamuraiAction(fight, false);
    assert.equal(fight.pending.kind, 'critical');
    fight = resolveSamuraiAction(fight, true, constant(value));
    assert.equal(fight.status, status); assert.equal(fight.enemies[0].stamina, stamina);
    if (status === 'win') assert.equal(fight.destination, 235);
  }
});

test('section47 is continuing stat loss, not death or a fresh enemy', () => {
  let fight = samuraiRound(start(199, { skill: 5, stamina: 8, luck: 3 }), rolls(1, 1, 6, 6));
  fight = resolveSamuraiAction(fight, false, rolls(4, 4));
  assert.equal(fight.status, 'fighting'); assert.equal(fight.character.stamina, 6);
  assert.equal(fight.character.skill, 4); assert.equal(fight.character.luck, 2);
  assert.equal(fight.enemies[0].stamina, 12);
  assert.ok(fight.events.some(event => event.kind === 'runeLoss' && event.section === 47));
});

test('the printed equality gap is explicit and either decision preserves current wounds', () => {
  const pending = samuraiRound(start(199, { skill: 5, stamina: 8 }), rolls(1, 1, 6, 6, 3, 3));
  assert.equal(pending.pending.kind, 'runeEquality');
  for (const [choice, skill] of [[false, 5], [true, 4]]) {
    const result = resolveSamuraiAction(pending, choice);
    assert.equal(result.character.skill, skill); assert.equal(result.character.stamina, 6);
    assert.equal(result.status, 'fighting');
  }
  assert.equal(pending.character.skill, 5);
});

test('all six Dai-Oni spell rolls apply the printed losses without restarting the fight', () => {
  for (let value = 1; value <= 6; value++) {
    let fight = start(292, { skill: 1, stamina: 100, luck: 5 }); fight.enemies[0].stamina = 6;
    fight = samuraiRound(fight, rolls(1, 1, 6, 6));
    fight = resolveSamuraiAction(fight, false, constant(value));
    assert.equal(fight.enemies[0].stamina, 6); assert.equal(fight.status, 'fighting');
    assert.equal(fight.character.stamina, value <= 2 ? 96 : 98);
    assert.equal(fight.character.luck, value >= 3 && value <= 4 ? 4 : 5);
    assert.equal(fight.character.skill, value >= 5 ? 0 : 1);
    assert.ok(fight.events.some(event => event.kind === 'spell' && event.section === (value <= 2 ? 90 : value <= 4 ? 102 : 118)));
  }
  const disabled = samuraiRound(start(394, { skill: 0, stamina: 100 }), rolls(1, 1, 6, 6));
  assert.equal(disabled.character.stamina, 98); assert.ok(!disabled.events.some(event => event.kind === 'spell'));
});

test('Gargantus beams occur on each third round and death takes precedence over simultaneous victory', () => {
  for (const [value, status, stamina] of [[1, 'loss', 0], [2, 'win', 4]]) {
    let fight = start(364, { skill: 100, stamina: 4 }); fight.rounds = 2; fight.enemies[0].stamina = 2;
    fight = samuraiRound(fight, rolls(6, 6, 1, 1, value));
    assert.equal(fight.status, status); assert.equal(fight.character.stamina, stamina);
    assert.equal(fight.enemies[0].stamina, 0);
  }
});

test('entry costs and optional rest retain current and initial values without battle-start healing', () => {
  for (const [section, loss] of [[15, 2], [44, 3], [178, 3], [187, 2], [203, 3], [363, 3]]) {
    const fight = start(section, { stamina: 17 }, { applyEntry: true });
    assert.equal(fight.character.stamina, 17 - loss); assert.equal(fight.character.staminaInitial, 24);
  }
  const curse = start(27, { stamina: 17, skill: 12, luck: 12 }, { applyEntry: true });
  assert.deepEqual([curse.character.stamina, curse.character.skill, curse.character.luck], [13, 10, 10]);
  assert.equal(start(397, { stamina: 15 }, { applyEntry: true }).character.stamina, 19);
  assert.equal(start(397, { stamina: 15 }, { applyEntry: true, recover: false }).character.stamina, 15);
  assert.equal(start(397, { stamina: 29 }, { applyEntry: true }).character.stamina, 29);
  const honour = start(321, { honour: 2 }, { applyEntry: true });
  assert.equal(honour.status, 'honourDeath'); assert.equal(honour.destination, 99); assert.equal(honour.character.stamina, 24);
});

test('acrobatics is limited to the printed village fights and penalties remain temporary', () => {
  for (const section of [116, 202, 240]) {
    assert.equal(start(section).enemyModifier, -1);
    assert.equal(start(section, {}, { acrobatics: false }).enemyModifier, 0);
  }
  const fight = start(337, { skill: 12 });
  assert.equal(fight.config.skillModifier, -1); assert.equal(fight.character.skill, 12);
  const unarmed = start(344, { art: 'iaijutsu', skill: 100 }, { applyEntry: true });
  assert.equal(unarmed.character.swords, 0);
  assert.equal(samuraiRound(unarmed, constant(6)).enemies[0].stamina, 7);
});

test('opening arrows carry wounds and mounted spear defence uses<= rather than archery<', () => {
  const archer = { ...newSamuraiCharacter({ art: 'archery' }, constant(6)), skill: 6, luck: 0 };
  const before = structuredClone(archer);
  const fight = startSamuraiFight(92, archer, { preArrows: ['piercing', 'piercing'] }, rolls(1, 1, 1, 1, 3, 3));
  assert.equal(fight.enemies[0].stamina, 5); assert.equal(fight.character.stamina, 24);
  assert.equal(fight.character.arrows.piercing, 1); assert.deepEqual(archer, before);
  assert.throws(() => startSamuraiFight(92, archer, { preArrows: ['leaf'] }), RangeError);
  assert.throws(() => startSamuraiFight(50, archer, { preArrows: ['leaf', 'leaf', 'leaf'] }), RangeError);
  const tiger = startSamuraiFight(224, archer, { preArrows: ['barbed', 'barbed', 'barbed'] }, constant(1));
  assert.equal(tiger.enemies[0].stamina, 3); assert.equal(tiger.character.arrows.barbed, 0);
});

test('saved fight settings are snapshotted and invalid values or reentrant actions are rejected', () => {
  const first = start(132, { skill: 100, luck: 12 }), before = structuredClone(first);
  const pending = samuraiRound(first, constant(6));
  assert.deepEqual(first, before);
  assert.throws(() => samuraiRound(pending), RangeError);
  assert.throws(() => setSamuraiTarget(pending, 0), RangeError);
  assert.throws(() => resolveSamuraiAction(pending, 'yes'), RangeError);
  assert.throws(() => start(132, {}, { playerModifier: .5 }), RangeError);
  for (const mutate of [f => { f.enemies[0].skill = NaN; }, f => { f.enemies[0].stamina = -1; },
    f => { f.config.mode = 'unknown'; }, f => { f.playerModifier = Infinity; }]) {
    const invalid = structuredClone(first); mutate(invalid);
    assert.throws(() => samuraiRound(invalid), RangeError);
  }
  const newer = start(132, { skill: 100 }, { incomingDamage: 4 });
  assert.equal(first.incomingDamage, 2); assert.equal(newer.incomingDamage, 4);
  assert.ok(Object.isFrozen(SAMURAI_FIGHTS) && Object.isFrozen(SAMURAI_SOURCE_ROSTERS[13][0]));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sonicCharacter, sonicHit, sonicExtraLife, sonicCheck, sonicEffects, startSonicFight, sonicRound, resumeSonicFight } from '../../../../public/js/battlesim/engines/sonic/core.js';

const hero = overrides => sonicCharacter({ abilities: { speed: 5, strength: 4, agility: 3, coolness: 2, quickWits: 2, goodLooks: 2 }, lives: 3, rings: 0, ...overrides });
const foe = (key, rating = 7, hits = 1) => ({ key, name: key, rating, hits });
const encounter = overrides => ({ ability: 'speed', enemyCounterThreshold: 10, enemies: [foe('a')], ...overrides });
const dice = (...values) => () => { assert.ok(values.length, 'Unexpected dice roll'); return values.shift(); };

test('ability tests succeed on equality, with a single D6', () => {
  assert.deepEqual(sonicCheck(hero(), 'speed', 7, dice(2)), { dice: 2, total: 7, target: 7, success: true });
  assert.equal(sonicCheck(hero(), 'speed', 7, dice(1)).success, false);
});

test('hits use a shield, then all rings, then one shared life', () => {
  const initial = hero({ shield: true, rings: 18 });
  const first = sonicHit(initial), second = sonicHit(first), third = sonicHit(second);
  assert.deepEqual([first.shield, first.rings, first.lives], [false, 18, 3]);
  assert.deepEqual([second.rings, second.lives, third.lives], [0, 3, 2]);
  assert.equal(initial.shield, true);
});

test('rings purchase lives explicitly, with no automatic conversion', () => {
  const initial = hero({ rings: 100 });
  assert.equal(initial.lives, 3);
  assert.deepEqual([sonicExtraLife(initial, 100).rings, sonicExtraLife(initial, 100).lives], [0, 4]);
  assert.throws(() => sonicExtraLife(hero({ rings: 99 }), 100));
});

test('a counter total of ten misses; eleven hits', () => {
  const start = startSonicFight(hero(), encounter());
  assert.equal(sonicRound(start, {}, dice(1, 3)).character.lives, 3);
  assert.equal(sonicRound(start, {}, dice(1, 4)).character.lives, 2);
  assert.equal(start.round, 0);
});

test('a surviving multi-hit foe counters after being hit', () => {
  const fight = sonicRound(startSonicFight(hero(), encounter({ enemies: [foe('a', 7, 2)] })), {}, dice(2, 4));
  assert.equal(fight.opponents[0].remainingHits, 1);
  assert.equal(fight.character.lives, 2);
});

test('each surviving simultaneous foe counters, but a destroyed foe does not', () => {
  const start = startSonicFight(hero({ rings: 12 }), encounter({ enemies: [foe('a'), foe('b'), foe('c')] }));
  const fight = sonicRound(start, {}, dice(2, 4, 4));
  assert.equal(fight.history[0].enemy.length, 2);
  assert.deepEqual([fight.character.rings, fight.character.lives], [0, 2]);
});

test('one-at-a-time combat does not give the next foe a free attack', () => {
  const start = startSonicFight(hero(), encounter({ oneAtATime: true, enemies: [foe('a'), foe('b')] }));
  const fight = sonicRound(start, {}, dice(2));
  assert.equal(fight.history[0].enemy.length, 0);
  assert.equal(fight.status, 'fighting');
  assert.throws(() => sonicRound(start, { target: 1 }, dice(2)));
});

test('a first-attack penalty applies once to the whole encounter', () => {
  const start = startSonicFight(hero(), encounter({ firstAttackModifier: -2 }));
  const first = sonicRound(start, {}, dice(2, 1));
  assert.equal(first.history[0].attack.total, 5);
  assert.equal(sonicRound(first, {}, dice(2)).status, 'win');
});

test('snowballs are rolled at the start of each enemy, not each round', () => {
  const config = encounter({ oneAtATime: true, startEnemyRoll: { defeatOn: [6] }, enemies: [foe('a'), foe('b')] });
  const first = sonicRound(startSonicFight(hero(), config), {}, dice(1, 1, 1));
  assert.equal(first.status, 'fighting');
  const second = sonicRound(first, {}, dice(2));
  const third = sonicRound(second, {}, dice(6));
  assert.equal(third.history[2].instantDefeat, true);
  assert.equal(third.status, 'win');
});

test('a missed special ray interrupts combat without hurting Sonic', () => {
  const config = encounter({ group: 'same-fight', bonus: 3, enemies: [foe('a', 10, 2)], hitBranches: [{ dice: [1, 2, 3], damage: true, section: '43' }, { dice: [4, 5, 6], damage: false, bonus: 0, section: '199' }] });
  const paused = sonicRound(startSonicFight(hero(), config), {}, dice(2, 1, 4));
  assert.equal(paused.opponents[0].remainingHits, 1);
  assert.deepEqual([paused.character.lives, paused.status, paused.section, paused.config.bonus], [3, 'paused', '199', 0]);
  const resumed = resumeSonicFight(paused, { ...config, bonus: 0 });
  assert.equal(resumed.opponents[0].remainingHits, 1);
  assert.equal(resumed.round, 1);
  assert.throws(() => resumeSonicFight(paused, { ...config, group: 'different-fight' }));
});

test('a shield cancels a damaging hit and its interruption', () => {
  const start = startSonicFight(hero({ shield: true }), encounter({ stopAfterHits: 1, hitSection: '44' }));
  const fight = sonicRound(start, {}, dice(1, 4));
  assert.deepEqual([fight.status, fight.hitsTaken, fight.character.lives, fight.character.shield], ['fighting', 0, 3, false]);
});

test('last-life loss stops further counterattacks', () => {
  const start = startSonicFight(hero({ lives: 1 }), encounter({ enemies: [foe('a'), foe('b')], loss: 'end' }));
  const fight = sonicRound(start, {}, dice(1, 4));
  assert.deepEqual([fight.status, fight.section, fight.history[0].enemy.length], ['loss', 'end', 1]);
});

test('entry changes are opt-in and a paid hit is not charged again at its destination', () => {
  const config = encounter({ section: 'next', entryEffects: [{kind:'hit'},{kind:'rings',amount:5}] });
  assert.equal(startSonicFight(hero({rings:12}),config).character.rings,12);
  const applied=startSonicFight(hero({rings:12}),config,{applyEntryEffects:true});
  assert.deepEqual([applied.character.rings,applied.character.lives],[5,3]);
  const receipted=startSonicFight(hero({appliedDamageSection:'next'}),config,{applyEntryEffects:true});
  assert.deepEqual([receipted.character.rings,receipted.character.lives],[5,3]);
  assert.equal(receipted.character.appliedDamageSection,undefined);
});

test('fatal entry damage cannot be followed by a victory or revived by later effects', () => {
  const f=startSonicFight(hero({lives:1}),encounter({entryEffects:[{kind:'hit'},{kind:'rings',amount:99}]}),{applyEntryEffects:true});
  assert.deepEqual([f.status,f.character.lives,f.character.rings],['loss',0,0]);
  assert.throws(()=>sonicRound(f));
});

test('victory rewards and their dice are applied exactly once', () => {
  const f=sonicRound(startSonicFight(hero(),encounter({victoryEffects:[{kind:'randomRings',dice:1,bonus:6}]})),{},dice(2,4));
  assert.equal(f.character.rings,10);
  assert.throws(()=>sonicRound(f));
});

test('the last victory minute can end the adventure instead of escaping', () => {
  const config=encounter({win:'escape',victoryEffects:[{kind:'minutes',amount:1}],victoryTimeLimit:{threshold:10,section:'too-late'}});
  const late=sonicRound(startSonicFight(hero({elapsed:9}),config),{},dice(2));
  const timely=sonicRound(startSonicFight(hero({elapsed:8}),config),{},dice(2));
  assert.deepEqual([late.status,late.section,late.character.elapsed],['loss','too-late',10]);
  assert.deepEqual([timely.status,timely.section],['win','escape']);
});

test('a discarded companion bonus stays removed on another continuation', () => {
  const config=encounter({group:'ongoing',bonus:3,enemies:[foe('a',10,2)],hitBranches:[{dice:[1,2,3,4,5,6],damage:false,bonus:0,section:'continue'}]});
  const paused=sonicRound(startSonicFight(hero(),config),{},dice(1,1,1));
  const resumed=resumeSonicFight(paused,{...config,resumeFrom:['continue']});
  assert.equal(resumed.config.bonus,0);
  assert.throws(()=>resumeSonicFight(paused,{...config,resumeFrom:['wrong']}));
});

test('a favourable dice modifier helps tests and reduces enemy counter totals', () => {
  assert.equal(sonicCheck(hero({favourBonus:1}),'speed',7,dice(1)).success,true);
  const start=startSonicFight(hero({favourBonus:1}),encounter({enemies:[foe('a',9)]}));
  const f=sonicRound(start,{},dice(1,2));
  assert.equal(f.history[0].enemy[0].total,10);
  assert.equal(f.character.lives,3);
});

test('effects do not touch other character fields or their original input', () => {
  const character=hero({inventory:{untouched:true},elapsed:2});
  const changed=sonicEffects(character,[{kind:'minutes',amount:2},{kind:'shield'},{kind:'rings',amount:12}]);
  assert.deepEqual(changed.inventory,{untouched:true});
  assert.deepEqual([changed.elapsed,changed.shield,changed.rings],[4,true,12]);
  assert.equal(character.elapsed,2);
});

test('a nonfatal defeat ends the encounter instead of leaving an unresumable paused fight',()=>{
  const f=sonicRound(startSonicFight(hero(),encounter({stopAfterHits:1,hitSection:'next'})),{},dice(1,4));
  assert.deepEqual([f.status,f.section,f.character.lives],['loss','next',2]);
});

test('a special capture ends the fight, while a continuation can remain paused',()=>{
  const config=encounter({hitBranches:[{dice:[1,2,3,4,5,6],damage:true,section:'captured',endFight:true}]});
  const f=sonicRound(startSonicFight(hero(),config),{},dice(1,4,1));
  assert.equal(f.status,'loss');
});

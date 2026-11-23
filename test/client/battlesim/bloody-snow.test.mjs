import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {readRosterDocument} = require('../../helpers/roster-db.cjs');
const source = await readFile(new URL('../../../public/js/battlesim/books/32/combat.js', import.meta.url), 'utf8');
const combat = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const entries = readRosterDocument(32).enemies.filter(row => row.stats.slot === 0).map(row => row.stats.entry);
const {setup} = entries[0];
const encounter = section => entries.find(row => row.section === section);
const hero = (number, choices) => {
  const template = setup.heroes[number - 1];
  const player = combat.makePlayer(template);
  player.choices = choices;
  player.items.push(...template.selections.flatMap(({options}, index) => choices[index].flatMap(choice => options[choice])));
  return player;
};
const start = (section, player, weaponId, options, die) => {
  const entry = encounter(section);
  return combat.startFight({setup, encounter:entry, enemies:entry.opponents, player, weaponId, ...options}, die);
};
function rolls(...values) {
  return () => {
    assert.ok(values.length, 'unexpected extra die roll');
    return values.shift();
  };
}

test('six printed characters and seven encounter presets match the reviewed roster', () => {
  assert.deepEqual(entries.map(row => row.section), [19,23,25,26,39,44,51]);
  assert.deepEqual(setup.heroes.map(row => row.attributes),
    [[5,3,1,4,1,20],[4,5,2,3,0,20],[3,3,3,3,2,20],[5,3,1,4,1,20],[3,2,5,1,3,20],null]);
  assert.equal(combat.validatePlayer(hero(1, [[0,1]]), setup), false);
  assert.equal(combat.validatePlayer(hero(4, [[0],[1]]), setup), true);
  assert.deepEqual(hero(3, [[1]]).items, ['Меч','Щит','Арбалет']);
  const mustafa = hero(6, [[0,1,2]]);
  assert.equal(combat.validatePlayer(mustafa, setup), true);
  mustafa.armor++;
  assert.equal(combat.validatePlayer(mustafa, setup), false);
});

test('wolves rotate until all are defeated and a bow shot removes only its selected target', () => {
  const player = hero(2, [[0,1,2]]);
  const fight = start(19, player, 'saber', {shield:true, openings:[{id:'bow',target:1}]}, rolls(3));
  assert.deepEqual(fight.opponents.map(row => row.hp), [2,0,2]);
  const turnOrder = [];
  while (fight.status === 'fighting') {
    turnOrder.push(fight.cursor);
    combat.advanceFight(fight, rolls(6,1));
  }
  assert.deepEqual(turnOrder, [0,2,0,2]);
  assert.equal(fight.status, 'won');
  assert.ok(fight.log.slice(1).every(row => row.playerScore === 12 && row.enemyScore === 6));
  const graze = start(19, player, 'saber', {openings:[{id:'bow',target:2}]}, rolls(2));
  assert.deepEqual(graze.opponents.map(row => row.hp), [2,2,1]);
});

test('green group uses separate opening attacks and weakens at low Life', () => {
  const fight = start(25, hero(2, [[0,1,3]]), 'saber',
    {openings:[{id:'bow'},{id:'spear'}]}, rolls(3,1));
  assert.equal(fight.opponents[0].hp, 5);
  const peter = start(25, hero(1, [[0,1,3]]), 'sickle-knife');
  combat.advanceFight(peter, rolls(6,1));
  assert.equal(peter.opponents[0].hp, 5);
  combat.advanceFight(peter, rolls(1,6,2));
  assert.equal(peter.player.hp, 18);
  combat.advanceFight(peter, rolls(6,1));
  combat.advanceFight(peter, rolls(1,6,2));
  assert.equal(peter.player.hp, 17);
});

test('bear-bull throws are carried into melee and need a usable backup weapon', () => {
  const player = hero(2, [[0,1,3]]);
  const opts = {openings:[{id:'throw-spear'}]};
  const fight = start(39, player, 'saber', opts, rolls());
  assert.equal(fight.opponents[0].hp, 5);
  assert.deepEqual(fight.log.map(row => row.damage), [1,2]);
  assert.throws(() => start(39, player, 'spear', opts, rolls()), /valid melee/);
  assert.throws(() => start(39, {...player, initialGear:false, items:['Копие','Лък']}, 'spear', opts, rolls()), /opening attack/);
});

test('snowman, kidnapper and the last two encounters apply their individual combat options', () => {
  const ilya = hero(2, [[0,1,3]]);
  const snowman = start(23, ilya, 'saber', {openings:[{id:'throw-spear'}]}, rolls());
  assert.equal(snowman.opponents[0].hp, 3);
  assert.throws(() => start(26, ilya, 'saber', {openings:[{id:'spear'},{id:'bow'}]}, rolls(1)), /opening attack/);
  const elder = start(51, ilya, 'spear', {}, rolls());
  assert.equal(elder.opponents[0].hp, 8);
  combat.advanceFight(elder, rolls(2,2,1,1));
  assert.equal(elder.log.at(-1).enemyScore, 11);
  assert.throws(() => start(51, hero(1, [[0,1,2]]), 'cudgel'), /valid melee/);
  const wolf = start(44, hero(1, [[0,1,2]]), 'cudgel', {openings:[{id:'prior-hit'}]}, rolls());
  combat.advanceFight(wolf, rolls(6,1));
  assert.equal(wolf.opponents[0].hp, 3);
});

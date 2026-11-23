import assert from 'node:assert/strict';
import test from 'node:test';
import { beginFight, defaults, exchange, heal, useProjectile } from '../../../public/js/battlesim/books/413/combat.js';
import { drawNumber } from '../../../public/js/battlesim/engines/magic-of-darkness/core.js';

const opponent = { name: 'Нападател', skill: 10, endurance: 4 };
const rolls = (...values) => () => values.shift();

test('uses two independent 1–12 draws and does not move on a tie', () => {
  assert.equal(drawNumber(() => 0), 1);
  assert.equal(drawNumber(() => 0.999), 12);
  const fight = beginFight(defaults, { section: 283, rotation: true, opponents: [opponent, opponent] });
  const tied = exchange(fight, 1, rolls(4, 4));
  assert.equal(tied.event.side, 'tie');
  assert.deepEqual(tied.fight, fight);
  const hit = exchange(tied.fight, 1, rolls(5, 4));
  assert.equal(hit.event.index, 0);
  assert.equal(hit.fight.opponents[0].endurance, 2);
  assert.equal(hit.fight.target, 1);
});

test('supports choosing an opponent, unarmed damage and chainmail skill', () => {
  const fight = beginFight({ ...defaults, chainmail: true }, { section: 140, unarmed: true, opponents: [opponent, opponent] });
  const result = exchange(fight, 1, rolls(4, 4));
  assert.equal(result.fight.opponents[0].endurance, 4);
  assert.equal(result.fight.opponents[1].endurance, 3);
});

test('ends the unarmed arena fight when the player has lost ten endurance', () => {
  let fight = beginFight(defaults, { section: 354, unarmed: true, lossAt: 10, opponents: [{ ...opponent, unarmed: true }] });
  for (let i = 0; i < 10; i += 1) fight = exchange(fight, 0, rolls(1, 12)).fight;
  assert.equal(fight.player.endurance, 40);
  assert.equal(fight.outcome, 'loss');
});

test('projectiles apply automatic damage and keep ammunition across the fight', () => {
  const enemy = { ...opponent, endurance: 15 };
  const start = beginFight({ ...defaults, bolts: 3, knives: 1 }, { section: 195, rotation: true, opponents: [opponent, enemy] });
  const bolt = useProjectile(start, 1, 'bolts').fight;
  assert.equal(bolt.target, 1);
  assert.equal(bolt.player.bolts, 2);
  assert.throws(() => useProjectile(bolt, 1, 'bolts'));
  const knife = useProjectile(bolt, 1, 'knives').fight;
  assert.equal(knife.opponents[1].endurance, 5);
  assert.equal(knife.player.knives, 0);
});

test('healing caps endurance at fifty and spending the final magic point seals it', () => {
  const { character, recovered } = heal({ ...defaults, healing: true, magic: 1, endurance: 47 }, rolls(12));
  assert.equal(recovered, 3);
  assert.equal(character.endurance, 50);
  assert.equal(character.magic, 0);
  assert.equal(character.magicLost, true);
  assert.throws(() => heal({ ...character, magic: 5, endurance: 45 }, rolls(2)));
});

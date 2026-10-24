import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(570);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../public/js/battlesim/engines/virtual-police/core.js';
import { preparePoliceEnemy, POLICE_ENCOUNTERS } from '../../../public/js/battlesim/engines/virtual-police/roster.js';
import { policeHunt, policeDragonOpening } from '../../../public/js/battlesim/engines/virtual-police/openings.js';

const player = { attack: 12, defence: 12, damage: 12, life: 30, magic: 12 };
const enemy = { attack: 12, defence: 12, damage: 12, life: 18 };
const rolls = (...values) => () => { assert.ok(values.length, 'unexpected extra roll'); return values.shift(); };

test('dynamic initiative uses two dice and level code; equality does not hit', () => {
  const f = core.startPoliceFight(player, enemy, { level: 2 }, rolls(1, 3));
  assert.equal(f.turn, 'player');
  const result = core.policeStrike(f);
  assert.equal(result.hit, false);
  assert.equal(result.damage, 0);
  assert.equal(result.fight.turn, 'enemy');
  assert.deepEqual(f.player, player, 'input is unchanged');
  assert.equal(core.startPoliceFight(player, enemy, { level: 6 }, rolls(5, 6)).turn, 'enemy');
});

test('aggressive/defensive tactics use the same die for opposite bonuses', () => {
  const f = core.startPoliceFight(player, enemy, { tactic: 'aggressive', enemyFirst: false });
  const result = core.policeStrike(f, {}, rolls(3));
  assert.equal(result.playerAttack, 15);
  assert.equal(result.playerDefence, 9);
  assert.equal(result.fight.enemy.life, 6);
  const defensive = core.startPoliceFight(player, enemy, { tactic: 'defensive', enemyFirst: true });
  assert.equal(core.policeStrike(defensive, {}, rolls(3)).damage, 0);
});

test('cautious has no invented modifier and explicitly supplied stats are applied', () => {
  const f = core.startPoliceFight(player, enemy, { tactic: 'cautious', enemyFirst: false });
  assert.throws(() => core.policeStrike(f), RangeError);
  const result = core.policeStrike(f, { modifiers: { playerAttack: 3, playerDefence: -1, enemyAttack: 2, enemyDefence: 0 } });
  assert.equal(result.damage, 12);
  assert.equal(result.enemyAttack, 14);
});

test('sequential opponents reset enemy health but never heal the player or spill damage', () => {
  const f = core.startPoliceFight({ ...player, attack: 13, damage: 50, life: 7 }, enemy, { count: 2, enemyFirst: false });
  const r = core.policeStrike(f).fight;
  assert.equal(r.remaining, 1);
  assert.equal(r.enemy.life, 18);
  assert.equal(r.player.life, 7);
  assert.equal(r.status, 'fighting');
});

test('spells always hit, spend only selected magic, and obey arena prohibitions', () => {
  const f = core.startPoliceFight(player, { ...enemy, defence: 999 }, { enemyFirst: false });
  const spell = { base: 4, minimum: 1, spent: 6, bonus: 0 };
  const result = core.policeStrike(f, { spell });
  assert.equal(result.damage, 10);
  assert.equal(result.fight.player.magic, 6);
  assert.throws(() => core.policeStrike(f, { spell: { ...spell, spent: 13 } }), RangeError);
  const arena = core.startPoliceFight(player, enemy, { enemyFirst: false, spellsAllowed: false });
  assert.throws(() => core.policeStrike(arena, { spell }), RangeError);
});

test('party casualties require manual resolution before another round or victory', () => {
  const f = core.startPoliceFight({ ...player, attack: 13, damage: 36 }, { ...enemy, life: 12 }, { count: 3, party: true });
  const r = core.policeStrike(f).fight;
  assert.equal(r.pending.kind, 'enemyCasualties');
  assert.equal(r.status, 'fighting');
  assert.throws(() => core.policeStrike(r), RangeError);
  assert.throws(() => core.resolvePoliceCasualties(r, { killed: 4 }), RangeError);
  const done = core.resolvePoliceCasualties(r, { killed: 3 });
  assert.equal(done.status, 'win');
  assert.equal(f.remaining, 3);
});

test('party damage kills at most one ally, then requires surviving stats', () => {
  const f = core.startPoliceFight({ ...player, attack: 13 }, { ...enemy, attack: 13 }, { party: true, enemyFirst: true });
  const r = core.policeStrike(f).fight;
  assert.equal(r.pending.kind, 'allyCasualty');
  assert.throws(() => core.resolvePoliceCasualties(r), RangeError);
  const n = core.resolvePoliceCasualties(r, { player: { ...player, attack: 8 } });
  assert.equal(n.player.attack, 8);
  assert.equal(n.turn, 'player');
});

const lines = () => [1, 2, 3].map(() => ({ ...player, count: 2, type: 'warrior' }));
test('dragon line rolls match all six printed results', () => {
  const f = core.startPoliceDragon(lines(), { ...enemy, attack: 0 });
  for (const [roll, expected] of [[1, 1], [2, 2], [3, 3], [4, 2], [5, 3], [6, 1]]) {
    assert.equal(core.policeDragonRound(f, rolls(roll)).line, expected);
  }
  assert.throws(() => core.startPoliceDragon(lines().slice(1), enemy), RangeError);
});

test('dragon attacks first; casualty identity and surviving stats precede the counterattack', () => {
  const f = core.startPoliceDragon(lines(), { ...enemy, attack: 99, defence: 0, life: 1 });
  const r = core.policeDragonRound(f, rolls(1)).fight;
  assert.equal(r.status, 'fighting');
  assert.equal(r.enemy.life, 1, 'no strike from an unresolved or dead formation member');
  assert.equal(r.pending.kind, 'dragonCasualty');
  assert.equal(core.resolvePoliceDragonCasualty(r, { heroKilled: true }).status, 'loss');
  assert.throws(() => core.resolvePoliceDragonCasualty(r, { survivor: { attack: 0 } }), RangeError);
  const n = core.resolvePoliceDragonCasualty(r, { survivor: player });
  assert.equal(n.lines[0].count, 1);
  assert.equal(n.status, 'win');
});

const ship = { attack: 12, shield: 10, life: 60 }, base = { attack: 12, defence: 10 };
test('ship blaster attacks roll two dice on both sides and subtract shield from incoming damage', () => {
  const f = core.startPoliceShip(ship, base, { targets: 2 });
  const r = core.policeShipRound(f, {}, rolls(1, 2, 3, 4));
  assert.equal(r.hit, true);
  assert.equal(r.fight.targets, 1);
  assert.equal(r.damage, 9);
  assert.equal(r.fight.ship.life, 51);
  assert.throws(() => core.policeShipRound(f, { command: true }), RangeError);
});

test('ship consumables spend ammunition, respect atmospheric shields and parity', () => {
  const f = core.startPoliceShip(ship, base, { targets: 2, ammunition: 2, atmosphericShield: true });
  const blocked = core.policeShipRound(f, { weapon: 'antiproton' }, rolls(1));
  assert.equal(blocked.hit, false);
  assert.equal(blocked.damage, 10);
  assert.equal(blocked.fight.ammunition, 1);
  const open = core.startPoliceShip(ship, base, { targets: 2, ammunition: 2 });
  const atomic = core.policeShipRound(open, { weapon: 'atomic' }, rolls(2, 1));
  assert.equal(atomic.hit, true);
  assert.throws(() => core.policeShipRound({ ...open, ammunition: 0 }, { weapon: 'atomic' }), RangeError);
});

test('PA bombs reduce base attack; command-centre hits are consecutive and death takes priority', () => {
  const f = core.startPoliceShip(ship, base, { targets: 2, ammunition: 10 });
  const r = core.policeShipRound(f, { weapon: 'pa' }, rolls(1));
  assert.equal(r.fight.base.attack, 8);
  assert.equal(r.fight.targets, 2);
  const almost = core.startPoliceShip({ ...ship, life: 1 }, base, { targets: 2, ammunition: 1, commandHits: 5 });
  const end = core.policeShipRound(almost, { weapon: 'antiproton', command: true }, rolls(1));
  assert.equal(end.fight.commandHits, 6);
  assert.equal(end.fight.status, 'loss');
  const command = core.policeShipRound(f, { weapon: 'pa', command: true }, rolls(1));
  assert.equal(command.fight.base.attack, 8);
  assert.equal(command.fight.commandHits, 1);
});

test('roster distinguishes source omissions from zero and never borrows values from another encounter', () => {
  assert.equal(new Set(POLICE_ENCOUNTERS.map(row => row.id)).size, POLICE_ENCOUNTERS.length);
  for (const id of ['troll', 'banditLeader', 'bear', 'wolf', 'boar', 'forestKnight', 'demons', 'spellDragon']) {
    assert.throws(() => preparePoliceEnemy(id), RangeError, id);
  }
  const troll = preparePoliceEnemy('troll', { enemy: { damage: 20 }, count: 2 });
  assert.equal(troll.enemy.damage, 20);
  assert.equal(troll.count, 2);
  assert.equal(POLICE_ENCOUNTERS.find(row => row.id === 'troll').enemy.damage, null);
});

test('source formulas use level codes and independent random values', () => {
  const brawler = preparePoliceEnemy('brawler', { level: 3 }, rolls(2));
  assert.equal(brawler.enemy.attack, 8);
  assert.equal(brawler.enemy.defence, 12);
  assert.equal(preparePoliceEnemy('bandits', { level: 6 }).count, 22);
  assert.equal(preparePoliceEnemy('crownOrcs', {}, rolls(4)).count, 16);
  const human = preparePoliceEnemy('arenaHuman', { cannotRun: true }, rolls(1, 2, 3, 4));
  assert.deepEqual(human.enemy, { attack: 13, defence: 14, damage: 15, life: 28 });
});

test('invalid inputs do not mutate saved fights and a nonfatal recovery must be explicit', () => {
  assert.throws(() => core.startPoliceFight(player, enemy, { nonfatal: true }), RangeError);
  const fight = core.startPoliceFight({ ...player, life: 1 }, { ...enemy, attack: 99 }, { enemyFirst: true, nonfatal: 15 });
  const result = core.policeStrike(fight).fight;
  assert.equal(result.status, 'defeat');
  assert.equal(result.player.life, 15);
  assert.equal(fight.player.life, 1);
  assert.throws(() => core.policeStrike(result), RangeError);
});

test('dragon ground opening converts archer/mage melee strength without inventing warrior stats', () => {
  const dragon = { attack: 48, defence: 30, damage: 60, life: 60 };
  const result = policeDragonOpening(dragon, { kind: 'ground', lines: [
    { type: 'warrior', count: 1, attack: 24, damage: 20 }, { type: 'archer', count: 2 },
  ] });
  assert.equal(result.damage, 36);
  assert.equal(result.enemy.life, 24);
  assert.equal(dragon.life, 60);
});

test('dragon arrows use one die per archer and strict level-code comparison', () => {
  const dragon = { attack: 48, defence: 30, damage: 60, life: 60 };
  const result = policeDragonOpening(dragon, { kind: 'arrows', level: 2, archers: [2, 2] }, rolls(2, 3));
  assert.equal(result.damage, 8);
  assert.deepEqual(result.dice, [2, 3]);
});

test('dragon harpoon requires shooting six, reduces attack/defence and retains remaining health', () => {
  const dragon = { attack: 48, defence: 30, damage: 60, life: 60 };
  assert.equal(policeDragonOpening(dragon, { kind: 'harpoon', shooting: 5 }).damage, 0);
  const result = policeDragonOpening(dragon, { kind: 'harpoon', shooting: 6 });
  assert.deepEqual(result.enemy, { attack: 36, defence: 18, damage: 60, life: 24 });
});

test('dragon magic requires eligible spells and explicit source-ambiguous protection', () => {
  const dragon = { attack: 48, defence: 30, damage: 60, life: 60 };
  assert.throws(() => policeDragonOpening(dragon, { kind: 'magic', spellStrength: 99 }), RangeError);
  assert.throws(() => policeDragonOpening(dragon, { kind: 'magic', eligibleSpell: true, spellStrength: 99 }), RangeError);
  const result = policeDragonOpening(dragon, { kind: 'magic', eligibleSpell: true, spellStrength: 10, spellProtection: 9 });
  assert.equal(result.enemy.life, 36);
});

test('hunting applies strict shooting threshold and animal parity without inventing damage', () => {
  const shot = { shooting: 4, weaponAttack: 4, speed: 4, animalSpeed: 12, damage: 8 };
  assert.equal(policeHunt(shot).skin, false);
  const result = policeHunt({ ...shot, shooting: 7, animalLife: 20 }, rolls(2));
  assert.equal(result.life, 12);
  assert.equal(result.fights, true);
  const killed = policeHunt({ ...shot, shooting: 7, animalLife: 4 });
  assert.equal(killed.skin, true);
});

test('each party mage can cast only once and invalid casts leave saved state unchanged', () => {
  let fight = core.startPoliceFight({ ...player, defence: 99 }, { ...enemy, life: 100 }, { party: true, partySpells: 1 });
  const spell = { base: 4, minimum: 1, spent: 1 };
  fight = core.policeStrike(fight, { spell }).fight;
  assert.equal(fight.remainingSpells, 0);
  fight = core.resolvePoliceCasualties(fight, { killed: 0, enemyLife: 95 });
  fight = core.policeStrike(fight).fight;
  const saved = structuredClone(fight);
  assert.throws(() => core.policeStrike(fight, { spell }), /once/);
  assert.deepEqual(fight, saved);
});

test('dragon opening wins and all six consecutive ship command hits are resolved', () => {
  const dragon = { attack: 48, defence: 30, damage: 60, life: 20 };
  const opening = policeDragonOpening(dragon, { kind: 'ground', lines: [
    { type: 'warrior', count: 1, attack: 40, damage: 30 }, { type: 'mage', count: 2 },
  ] });
  assert.equal(opening.status, 'win');
  assert.equal(opening.enemy.life, 0);
  let fight = core.startPoliceShip({ attack: 12, shield: 99, life: 60 }, base, { targets: 2, ammunition: 6 });
  for (let i = 0; i < 6; i++) fight = core.policeShipRound(fight, { weapon: 'antiproton', command: true }, rolls(1)).fight;
  assert.equal(fight.status, 'win');
  assert.equal(fight.ammunition, 0);
  assert.equal(fight.commandHits, 6);
});

test('shooting another ship target interrupts consecutive command-centre hits', () => {
  const fight = core.startPoliceShip({ ...ship, shield: 99 }, base, { targets: 2, commandHits: 5, ammunition: 2 });
  const other = core.policeShipRound(fight, { weapon: 'antiproton' }, rolls(1)).fight;
  assert.equal(other.commandHits, 0);
  assert.equal(other.targets, 1);
  assert.equal(core.policeShipRound(other, { weapon: 'antiproton', command: true }, rolls(1)).fight.status, 'fighting');
  assert.equal(fight.commandHits, 5);
});

test('ship weapons keep independent ammunition while legacy saved fights retain their pool', () => {
  const fight = core.startPoliceShip({ ...ship, shield: 99 }, base, { targets: 3,
    ammunition: { antiproton: 1, atomic: 2, pa: 0, pb: 4 } });
  const next = core.policeShipRound(fight, { weapon: 'antiproton' }, rolls(1)).fight;
  assert.deepEqual(next.ammunition, { antiproton: 0, atomic: 2, pa: 0, pb: 4 });
  assert.throws(() => core.policeShipRound(next, { weapon: 'antiproton' }), /ammunition/);
  assert.throws(() => core.policeShipRound(next, { weapon: 'pa' }), /ammunition/);
  const atomic = core.policeShipRound(next, { weapon: 'atomic' }, rolls(2, 1)).fight;
  assert.equal(atomic.ammunition.atomic, 1);
  assert.equal(atomic.ammunition.pb, 4);
  assert.equal(fight.ammunition.antiproton, 1);
});


test('enemy and group generation honor database formulas without changing the printed base stats', () => {
  const brawler=POLICE_ENCOUNTERS.find(row=>row.id==='brawler');
  const bandits=POLICE_ENCOUNTERS.find(row=>row.id==='bandits');
  const originalEnemyGeneration=structuredClone(brawler.enemyGeneration);
  const originalCountFormula=structuredClone(bandits.countFormula);
  const printed=structuredClone(brawler.enemy);
  try {
    brawler.enemyGeneration={attack:{base:9,die:true},defence:{base:4,perLevel:3}};
    bandits.countFormula={base:100,perLevel:5};
    const result=preparePoliceEnemy('brawler',{level:2},rolls(5));
    assert.equal(result.enemy.attack,14);
    assert.equal(result.enemy.defence,10);
    assert.deepEqual(result.dice,[5]);
    assert.equal(preparePoliceEnemy('bandits',{level:6}).count,130);
    assert.deepEqual(brawler.enemy,printed);
    const overridden=preparePoliceEnemy('brawler',{level:2,enemy:{attack:7}},rolls(3));
    assert.equal(overridden.enemy.attack,7);
    assert.deepEqual(overridden.dice,[3]);
  } finally {
    brawler.enemyGeneration=originalEnemyGeneration;
    bandits.countFormula=originalCountFormula;
  }
});

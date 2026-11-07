import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attackTurn, nextRound, ghostDuel } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';

const actor = overrides => ({ name: 'Investigator', hp: 12, maxHp: 12, dex: 60, dodge: 30, brawl: 40,
  pow: 55, str: 50, con: 50, skill: 80, damage: '1D6', ...overrides });
const enemy = overrides => actor({ name: 'Opponent', hp: 30, maxHp: 30, moves: [{ skill: 80, damage: '1D6' }], ...overrides });
const fight = (spec = {}, p = {}, e = {}) => createFight({ enemies: [enemy(e)], ...spec }, [actor(p)]);
const attack = (f, random = () => .1) => attackTurn(f, { side: 'party', index: 0, target: 0, defense: 'none' }, random);
const enemyAttack = (f, defense = 'none', random = () => .1) => attackTurn(f, { side: 'enemies', index: 0, target: 0, defense }, random);
const sequence = values => { let i = 0; return () => { assert.ok(i < values.length, 'unexpected extra roll'); return values[i++]; }; };

test('a real fight preserves setup, consumes turns, retains wounds and ends on enemy defeat', () => {
  const setup = enemy({ hp: 2, maxHp: 2 });
  const f = createFight({ enemies: [setup] }, [actor({ damage: '2' })]);
  attack(f);
  assert.equal(f.enemies[0].hp, 0); assert.equal(f.status, 'win');
  assert.equal(setup.hp, 2); assert.equal(f.log.length, 1);
  assert.equal(attack(f), null);
});

test('invalid attacks preserve the complete fight, including a consumed turn', () => {
  const f = fight(); attack(f);
  const before = structuredClone(f);
  assert.throws(() => attack(f), /cannot act/); assert.deepEqual(f, before);
  nextRound(f); const next = structuredClone(f);
  assert.throws(() => attackTurn(f, { side: 'enemies', index: 0, target: 0, move: 9 }));
  assert.deepEqual(f, next);
});

test('the smugglers simultaneous volley permits mutual deaths and stops after that round', () => {
  const f = fight({ simultaneous: true, singleRound: true }, { hp: 3, maxHp: 3, damage: '3' },
    { hp: 3, maxHp: 3, moves: [{ skill: 80, damage: '3' }] });
  attack(f); assert.equal(f.enemies[0].hp, 3);
  enemyAttack(f); assert.equal(f.party[0].hp, 3);
  nextRound(f); assert.equal(f.enemies[0].hp, 0); assert.equal(f.party[0].hp, 0);
  assert.equal(f.status, 'loss');
  const survivors = fight({ simultaneous: true, singleRound: true });
  attack(survivors); enemyAttack(survivors); nextRound(survivors);
  assert.equal(survivors.status, 'round-complete'); assert.equal(attack(survivors), null);
});

test('vampire resists mundane weapons, receives one shotgun point and takes silver damage', () => {
  for (const [weaponKind, material, expected] of [['firearm', 'ordinary', 0], ['shotgun', 'ordinary', 1], ['firearm', 'silver', 6]]) {
    const f = fight({}, { weaponKind, material, damage: '6' }, { resistance: 'vampire' });
    assert.equal(attack(f).wound.amount, expected);
  }
});

test('Dark Young firearm resistance includes silver ammunition, while axes deal double damage', () => {
  assert.equal(attack(fight({}, { weaponKind: 'firearm', material: 'silver', damage: '12' }, { resistance: 'dark-young' })).wound.amount, 1);
  assert.equal(attack(fight({}, { weaponKind: 'axe', damage: '7' }, { resistance: 'dark-young' })).wound.amount, 14);
});

test('Dog Man regular bullets stun at eight damage after hide without reducing HP', () => {
  const f = fight({}, { weaponKind: 'firearm', damage: '9' }, { resistance: 'lycanthrope', armor: 1 });
  const r = attack(f);
  assert.equal(r.wound.amount, 0); assert.equal(f.enemies[0].hp, 30); assert.equal(f.enemies[0].stunned, true);
  assert.equal(enemyAttack(f).skipped, true);
  nextRound(f); assert.equal(f.enemies[0].stunned, false);
});

test('silver Dog Man wounds can kill through the printed failed CON roll', () => {
  const f = fight({}, { weaponKind: 'firearm', material: 'silver', damage: '9' }, { resistance: 'lycanthrope', con: 80, armor: 1 });
  const r = attack(f, sequence([.1, .1, .9, .9]));
  assert.equal(r.wound.effects[1].constitution.roll, 99);
  assert.equal(f.status, 'win');
});

test('Dog Man eight-point stun and CON death rules apply to bullets rather than silver melee weapons', () => {
  const f = fight({}, { weaponKind: 'melee', material: 'silver', damage: '9' }, { resistance: 'lycanthrope', armor: 1 });
  assert.equal(attack(f).wound.amount, 8);
  assert.equal(f.enemies[0].stunned, false); assert.equal(f.enemies[0].hp, 22);
});

test('vampire blood drain ignores armor and can increase health beyond the normal maximum', () => {
  const f = fight({}, { armor: 99, immobilized: true }, { hp: 30, maxHp: 30,
    moves: [{ automatic: true, damage: '3', effect: 'blood-drain', ignoresArmor: true, requiresImmobilized: true }] });
  assert.equal(enemyAttack(f).wound.amount, 3);
  assert.equal(f.party[0].hp, 9); assert.equal(f.enemies[0].hp, 33);
  f.enemies[0].regeneration = 1; nextRound(f); assert.equal(f.enemies[0].hp, 33);
});

test('vampire flees on her next action at four HP, but can be destroyed first', () => {
  const f = fight({}, {}, { hp: 4, maxHp: 14, fleeAt: 4 });
  assert.equal(enemyAttack(f).fled, true); assert.equal(f.status, 'escaped');
  const killed = fight({}, { damage: '4' }, { hp: 4, maxHp: 14, fleeAt: 4 });
  attack(killed); assert.equal(killed.status, 'win');
});

test('a drained investigator returns as an enemy on one HP next round, preventing a premature win', () => {
  const vampire = enemy({ hp: 3, maxHp: 14, regeneration: 1,
    moves: [{ automatic: true, damage: '3', effect: 'blood-drain', ignoresArmor: true, requiresImmobilized: true }] });
  const f = createFight({ enemies: [vampire] }, [actor({ name: 'Victim', hp: 3, maxHp: 3, immobilized: true }), actor({ damage: '6' })]);
  enemyAttack(f); assert.equal(f.enemies.length, 2); assert.equal(f.enemies[1].hp, 0);
  assert.equal(f.enemies[1].dormant, true);
  attackTurn(f, { side: 'party', index: 1, target: 0, defense: 'none' }, () => .1);
  assert.equal(f.status, 'fighting');
  nextRound(f); assert.equal(f.enemies[1].hp, 1); assert.equal(f.enemies[1].dormant, false);
  assert.equal(f.enemies[1].name, 'Victim');
});

test('crows require over twenty damage in the same round and cannot be chipped down', () => {
  const f = fight({ roundDamageTarget: 20, failedRoundDamage: 1 }, { damage: '20' });
  attack(f); assert.equal(f.enemies[0].hp, 30); nextRound(f);
  assert.equal(f.status, 'fighting'); assert.equal(f.party[0].hp, 11); assert.equal(f.roundDamage, 0);
  f.party[0].damage = '21'; attack(f); nextRound(f); assert.equal(f.status, 'win');
});

test('entanglement skips only the specified attack and keeps later dodge disabled', () => {
  const f = fight({}, {}, { moves: [{ skill: 80, damage: '0', effect: 'entangle', skipAttack: true }] });
  enemyAttack(f); assert.equal(f.party[0].immobilized, true);
  assert.equal(attack(f).skipped, true); nextRound(f);
  assert.ok(attack(f).attack); assert.equal(f.party[0].skip, 0);
});

test('mummy extreme player success deals ordinary damage and its throttle is lethal', () => {
  const f = fight({}, { damage: '6' }, { armor: 2, moves: [{ skill: 70, damage: '0', effect: 'throttle' }] });
  assert.equal(attack(f).wound.amount, 4);
  enemyAttack(f); assert.equal(f.party[0].hp, 0); assert.equal(f.status, 'loss');
});

test('printed fumbles consume the next attack instead of silently hiding an injury', () => {
  const f = fight(); const r = attack(f, () => .99);
  assert.equal(r.attack.level, 0); assert.equal(f.party[0].skip, 1);
  nextRound(f); assert.equal(attack(f).skipped, true); assert.equal(f.party[0].skip, 0);
});

test('Pink Lady ties drain POWER and increase her POWER; first winning duel ends the encounter', () => {
  const f = fight({ kind: 'ghost-power' }, { pow: 55 }, { pow: 75 });
  const r = ghostDuel(f, 0, sequence([.1, .1, .1, .1, 0]));
  assert.equal(r.powerLost, 1); assert.equal(f.party[0].pow, 54); assert.equal(f.enemies[0].pow, 76);
  ghostDuel(f, 0, sequence([.9, .9, .1, 0])); assert.equal(f.status, 'win');
});

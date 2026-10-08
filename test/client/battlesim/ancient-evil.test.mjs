import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCIENT_EVIL_ENCOUNTERS, ANCIENT_EVIL_ROSTER, prepareAncientEvilEncounter } from '../../../public/js/battlesim/engines/demonspawn/ancient-evil-roster.js';
import { createAncientEvilFight, rollAncientEvilCharacter, rollAncientEvilAttack,
  determineAncientEvilInitiative, checkAncientEvilFight, resolveAncientEvilDeathLuck,
  castAncientEvilSpell, ancientEvilCastAvailability, checkAncientEvilSerpent,
  useAncientEvilRuby, finishAncientEvilFight, endAncientEvilGroupRound,
  ANCIENT_EVIL_SPELL_COSTS } from '../../../public/js/battlesim/engines/demonspawn/ancient-evil.js';

const random = (...rolls) => { let i = 0; return () => ((rolls[i++] ?? 3) - .5) / 6; };
const player = () => ({ ...rollAncientEvilCharacter(() => .5), weapon: 'sword', armour: 'none' });
const fight = (section, overrides = {}) => createAncientEvilFight(prepareAncientEvilEncounter(section, { ...player(), ...overrides }));

test('Ancient Evil starts with seven rolled attributes, carried Skill and fresh Power', () => {
  const p = rollAncientEvilCharacter(() => 0, 35);
  assert.equal(p.skill, 35); assert.equal(p.lifePoints, 112); assert.equal(p.power, 50);
  assert.equal(ANCIENT_EVIL_SPELL_COSTS.resurrection, 55);
  assert.equal(ANCIENT_EVIL_SPELL_COSTS.retrace, 20);
});

test('all Ancient Evil encounter profiles are immutable, finite and source named', () => {
  assert.equal(Object.keys(ANCIENT_EVIL_ROSTER).length, 22);
  assert.equal(ANCIENT_EVIL_ENCOUNTERS.length, 32);
  for (const e of ANCIENT_EVIL_ENCOUNTERS) for (const key of e.enemies) {
    const p = ANCIENT_EVIL_ROSTER[key]; assert.ok(p); assert.ok(Object.isFrozen(p));
    assert.ok(Number.isFinite(p.lifePoints)); assert.equal(p.maxLife, p.lifePoints);
  }
});

test('unprinted staff bonuses cannot silently become club bonuses', () => {
  assert.throws(() => prepareAncientEvilEncounter(7, player()), /unprinted/);
  const p = prepareAncientEvilEncounter(7, player(), { playerWeapon: 0, staffWeapon: 0 });
  assert.equal(p.player.weapon, 0); assert.equal(p.enemies[0].weapon, 0);
});

test('Lord Nazar forces ordinary daggers instead of the absent Doomsword', () => {
  const f = fight(12, { weapon: 'doombringer' });
  assert.equal(f.player.weapon, 5); assert.equal(f.enemies[0].weapon, 5);
  assert.equal(prepareAncientEvilEncounter(12, player(), { playerWeapon: 0 }).player.weapon, 5);
});

test('guardian companion neutralizes one enemy without inventing armour', () => {
  const f = fight(95);
  assert.equal(f.enemies.length, 1); assert.equal(f.enemies[0].armour, 'none');
  assert.equal(fight(61).enemies.length, 3); assert.equal(fight(183).enemies.length, 6);
});

test('sequential animated figure and sword must both be defeated', () => {
  const f = fight(197); f.enemies[0].lifePoints = 0; checkAncientEvilFight(f);
  assert.equal(f.sequence, 1); assert.equal(f.outcome, null); assert.equal(f.turn, null);
  f.enemies[1].lifePoints = 0; checkAncientEvilFight(f); assert.equal(f.outcome, 'win');
});

test('player death takes priority over the last enemy death', () => {
  const f = fight(102); f.player.lifePoints = 0; f.enemies[0].lifePoints = 0;
  checkAncientEvilFight(f); assert.equal(f.outcome, null); assert.equal(f.pending, 'death-luck');
});

test('Death Luck is strict, once only, and does not revive defeated earlier sorcerers', () => {
  const f = fight(208, { luck: 96 }); f.sequence = 1; f.enemies[0].lifePoints = 0; f.player.lifePoints = 0;
  checkAncientEvilFight(f); resolveAncientEvilDeathLuck(f, random(1, 1));
  assert.equal(f.enemies[0].lifePoints, 0); assert.equal(f.enemies[1].lifePoints, 693);
  f.player.lifePoints = 0; checkAncientEvilFight(f); assert.equal(f.outcome, 'loss');
  const equal = fight(102, { luck: 16 }); equal.player.lifePoints = 0; checkAncientEvilFight(equal);
  resolveAncientEvilDeathLuck(equal, random(1, 1)); assert.equal(equal.outcome, 'loss');
});

test('serpent opening must be resolved before combat', () => {
  const f = fight(52, { speed: 50 }); f.turn = 'player';
  assert.equal(rollAncientEvilAttack(f, 'player').error, 'opening-check-required');
  const result = checkAncientEvilSerpent(f, random(1, 1));
  assert.equal(result.success, false); assert.equal(f.pending, 'death-luck');
});

test('giant club deals its current blow before shattering on a natural12', () => {
  const f = fight(70); f.turn = 'enemy';
  const result = rollAncientEvilAttack(f, 'enemy', 0, random(6, 6));
  assert.ok(result.damage > 25); assert.equal(f.enemies[0].weapon, 10);
});

test('lethal weapons and Night Stalker fixed drain use printed special values', () => {
  const f = fight(225); f.turn = 'enemy';
  rollAncientEvilAttack(f, 'enemy', 0, random(6, 6)); assert.equal(f.player.lifePoints, 0);
  const s = fight(215); s.turn = 'enemy';
  assert.equal(rollAncientEvilAttack(s, 'enemy', 0, random(6, 6)).damage, 75);
  s.turn = 'player'; assert.equal(rollAncientEvilAttack(s, 'player', 0, random(4, 5)).damage, 0);
});

test('minor demon never supplies Doomsword healing and resists the first5 damage', () => {
  const f = fight(188, { weapon: 'doombringer', lifePoints: 100 }); f.turn = 'player';
  const hit = rollAncientEvilAttack(f, 'player', 0, random(4, 4));
  assert.equal(hit.damage, 43); assert.equal(f.player.lifePoints, 100);
});

test('sorcerers attack sequentially and a natural12 kills the current one', () => {
  const f = fight(208, { weapon: 'doombringer', lifePoints: 100 }); f.turn = 'player';
  const hit = rollAncientEvilAttack(f, 'player', 0, random(6, 6));
  assert.equal(hit.damage, 693); assert.equal(f.sequence, 1); assert.equal(f.outcome, null);
  assert.equal(f.player.lifePoints, 273.25);
});

test('Freya poison drains only following rounds, caps at100 and can restart', () => {
  const f = fight(229, { maxLife: 2000, lifePoints: 2000 }); f.encounter.passiveAttempts = 20;
  rollAncientEvilAttack(f, 'enemy', 0, random(3, 3));
  assert.equal(f.player.freyaPoison, 100);
  const initial = f.player.lifePoints;
  for (let i = 0; i < 7; i++) rollAncientEvilAttack(f, 'enemy', 0, random(1, 1));
  assert.equal(f.player.lifePoints, initial - 100); assert.equal(f.player.freyaPoison, 0);
  rollAncientEvilAttack(f, 'enemy', 0, random(3, 3)); assert.equal(f.player.freyaPoison, 100);
});

test('passive exposure completes without granting combat victory or Skill', () => {
  const f = fight(229); const skill = f.player.skill;
  for (let i = 0; i < 3; i++) rollAncientEvilAttack(f, 'enemy', 0, random(1, 1));
  assert.equal(f.outcome, 'reconsider'); assert.equal(f.player.skill, skill);
});

test('all sleeping bandits get one opening strike, not unlimited free strikes', () => {
  const f = fight(165); f.manualGroup = true;
  rollAncientEvilAttack(f, 'player', 0, random(1, 1));
  assert.equal(rollAncientEvilAttack(f, 'player', 0).error, 'opening-already-used');
  assert.equal(rollAncientEvilAttack(f, 'enemy', 0).error, 'player-opening');
  rollAncientEvilAttack(f, 'player', 1, random(1, 1));
  assert.ok(!rollAncientEvilAttack(f, 'enemy', 0, random(1, 1)).error);
});

test('ruby restores half the lost Life, once after victory, never resurrects', () => {
  const f = fight(102, { rubyPendant: true, maxLife: 500, lifePoints: 100 });
  finishAncientEvilFight(f, 'win'); assert.equal(useAncientEvilRuby(f), 200);
  assert.equal(f.player.lifePoints, 301); assert.equal(useAncientEvilRuby(f), false);
});

test('printed Resurrection cost is enforced and wounded enemies remain wounded', () => {
  const f = fight(102, { power: 55 }); f.player.lifePoints = 0; f.enemies[0].lifePoints = 10;
  checkAncientEvilFight(f); f.player.magicSections = { 102: { inclined: true, used: [] } };
  const result = castAncientEvilSpell(f, 'resurrection', {}, random(3, 3));
  assert.equal(result.cost, 55); assert.equal(f.player.power, 0); assert.equal(f.player.resurrectionPenalty, 10);
  assert.equal(f.enemies[0].lifePoints, 10); assert.equal(f.pending, null);
});

test('Resurrection after a recorded loss permits the later victory to be recorded', () => {
  const f = fight(102, { power: 55 });
  f.player.lifePoints = 0; f.luckUsed = true; checkAncientEvilFight(f);
  f.recorded = true; f.player.magicSections = { 102: { inclined: true, used: [] } };
  castAncientEvilSpell(f, 'resurrection', {}, random(3, 3));
  assert.equal(f.outcome, null); assert.equal(f.recorded, false);
  f.enemies[0].lifePoints = 0; checkAncientEvilFight(f);
  assert.equal(f.outcome, 'win');
});

test('spell costs and once-per-section restrictions apply on failed attempts too', () => {
  const f = fight(102); f.turn = 'player'; f.player.magicSections = { 102: { inclined: true, used: [] } };
  const result = castAncientEvilSpell(f, 'fireball', {}, random(1, 1));
  assert.equal(result.success, false); assert.equal(f.player.power, 35);
  assert.equal(ancientEvilCastAvailability(f.player, 102, 'fireball').error, 'used-this-section');
});

test('attack magic cannot harm a minor demon while Armour can still protect player', () => {
  const f = fight(188); f.turn = 'player'; f.player.magicSections = { 188: { inclined: true, used: [] } };
  castAncientEvilSpell(f, 'fireball', {}, random(3, 3)); assert.equal(f.enemies[0].lifePoints, 640);
  f.turn = 'player'; castAncientEvilSpell(f, 'armour', {}, random(3, 3)); assert.equal(f.player.magicArmour, 10);
});

test('Timewarp restores all fighters and counters but retains spell restrictions', () => {
  const f = fight(102); f.turn = 'player'; f.player.power = 40; f.enemies[0].lifePoints = 1;
  f.player.magicSections = { 102: { inclined: true, used: ['fireball'] } }; f.round = 8;
  castAncientEvilSpell(f, 'timewarp', {}, random(3, 3));
  assert.equal(f.player.power, 50); assert.equal(f.enemies[0].lifePoints, 370); assert.equal(f.round, 0);
  assert.deepEqual(f.player.magicSections[102].used, ['fireball', 'timewarp']);
});

test('group rounds are explicit and bounded logs do not grow indefinitely', () => {
  const f = fight(183);
  for (let i = 0; i < 200; i++) endAncientEvilGroupRound(f);
  assert.equal(f.round, 200); assert.equal(f.log.length, 150);
  assert.equal(determineAncientEvilInitiative(f), null);
});

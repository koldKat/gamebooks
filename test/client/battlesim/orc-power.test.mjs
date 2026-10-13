import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrcFigure, startOrcFight, orcAttack, orcMagic, orcMove, nextOrcTurn,
  orcStat, rollOrcStat, recoverOrcWeapons } from '../../../public/js/battlesim/engines/orc-power/core.js';
import { ORC_FIGURES, prepareOrcFigure } from '../../../public/js/battlesim/engines/orc-power/roster.js';
import { newOrcGame, addOrcGameFigure, beginOrcEncounter, updateOrcEncounter,
  cancelOrcEncounter, adjustOrcGameFigure } from '../../../public/js/battlesim/engines/orc-power/game.js';
import { parseOrcStat, formatOrcStat, parseOrcInteger } from '../../../public/js/battlesim/engines/orc-power/fields.js';

const make = (id, side, fields = {}) => createOrcFigure({ id, side, attack: 8,
  defence: 8, shooting: 8, damage: 2, life: 10, magicPower: 8, ...fields });
const start = (player = {}, enemy = {}) => startOrcFight([
  make('player', 'player', player), make('enemy', 'enemy', enemy),
], 'player');

test('cancelling and restarting does not restore a consumed thrown weapon', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side:'player',
    stats:{ life:12 }, equipment:{ weaponShooting:3, weaponDamage:2 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side:'enemy', stats:{ life:12 } }, () => 1);
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  game = updateOrcEncounter(game, orcAttack(game.fight, 'figure-2', {
    kind:'throw', legal:true, weaponAvailable:true,
  }, () => 1).fight);
  game = cancelOrcEncounter(game);
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  assert.equal(game.fight.figures[0].thrown, true);
  assert.equal(game.fight.figures[0].weaponShooting, 0);
  assert.throws(() => orcAttack(game.fight, 'figure-2', {
    kind:'throw', legal:true, weaponAvailable:true,
  }, () => 1), RangeError);
});

test('form parsing does not coerce unknown blank fields to zero or accept partial numbers', () => {
  assert.equal(formatOrcStat(null), '');
  assert.deepEqual(parseOrcStat(' 12 + d8 '), { base:12, sides:8 });
  assert.deepEqual(parseOrcStat('0'), { base:0, sides:0 });
  assert.equal(formatOrcStat(parseOrcStat('12+d8')), '12+d8');
  assert.equal(parseOrcInteger('-2', { minimum:-1000000 }), -2);
  for (const value of ['', ' ', '12oops', '1.5', '12+d7', '1e3']) assert.throws(() => parseOrcStat(value), RangeError);
  for (const value of ['', ' ', '2x', '1.5', '1e3']) assert.throws(() => parseOrcInteger(value), RangeError);
});

test('explicit source adjustments preserve unrelated figures and reject invalid fields', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side:'player', stats:{ life:12 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side:'enemy', stats:{ life:12 } }, () => 1);
  const original = structuredClone(game);
  game = adjustOrcGameFigure(game, 'figure-1', { life:4, defence:2, petrified:true });
  assert.deepEqual(game.figures[1], original.figures[1]);
  assert.equal(original.figures[0].life, 12);
  assert.equal(game.figures[0].life, 4);
  assert.throws(() => adjustOrcGameFigure(game, 'figure-1', { template:'ghost' }), RangeError);
  assert.throws(() => adjustOrcGameFigure(game, 'figure-1', { life:13 }), RangeError);
  assert.throws(() => adjustOrcGameFigure(game, 'figure-1', { petrified:'false' }), RangeError);
  game = adjustOrcGameFigure(game, 'figure-1', { petrified:false });
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  game = adjustOrcGameFigure(game, 'figure-2', { life:0 });
  assert.equal(game.fight.status, 'win');
  assert.equal(game.history.length, 1);
});

test('changing allegiance does not erase original opponents from group history', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side:'player', stats:{ life:12 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side:'enemy', stats:{ life:12 } }, () => 1);
  game = addOrcGameFigure(game, 'hydra', { side:'enemy' }, () => 1);
  game = beginOrcEncounter(game, ['figure-1','figure-2','figure-3'], 'figure-1');
  game = adjustOrcGameFigure(game, 'figure-2', { side:'player' });
  assert.equal(game.fight.status, 'fighting');
  game = adjustOrcGameFigure(game, 'figure-3', { side:'player' });
  assert.equal(game.fight.status, 'win');
  assert.equal(game.history[0].enemy, 'soldier, hydra');
});

test('saved draft encounters without opponent snapshots can still finish', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side:'player', stats:{ life:12 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side:'enemy', stats:{ life:12 } }, () => 1);
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  delete game.fight.opponentTemplates;
  game = adjustOrcGameFigure(game, 'figure-2', { life:0 });
  assert.equal(game.fight.status, 'win');
  assert.equal(game.history[0].enemy, 'soldier');
});

test('source roster keeps unclear cells unresolved until explicit overrides are supplied', () => {
  const source = structuredClone(ORC_FIGURES);
  assert.equal(ORC_FIGURES.length, 25);
  assert.throws(() => prepareOrcFigure('soldier', { id: 'one', side: 'player' }), RangeError);
  const figure = prepareOrcFigure('soldier', { id: 'one', side: 'player', stats: { life: 12 } }, () => 1);
  assert.equal(figure.maxLife, 12);
  assert.deepEqual(figure.attack, { base: 8, sides: 6 });
  assert.throws(() => prepareOrcFigure('soldier', { id: 'one', side: 'player', stats: { side: 'enemy' } }), RangeError);
  assert.throws(() => prepareOrcFigure('unknown', { id: 'one', side: 'player' }), RangeError);
  assert.deepEqual(ORC_FIGURES, source);
});

test('elemental weaknesses follow the actual source rows, not assumed opposite pairs', () => {
  assert.deepEqual(ORC_FIGURES.filter(figure => figure.elemental)
    .map(figure => [figure.id, figure.weakness]), [
    ['fireElemental','water'], ['airElemental','fire'],
    ['earthElemental','air'], ['waterElemental','earth'],
  ]);
  assert.throws(() => prepareOrcFigure('fireElemental', { id:'fire', side:'enemy' }), RangeError);
  const figure = prepareOrcFigure('fireElemental', { id:'fire', side:'enemy',
    stats: { attack:8, defence:8, damage:4, life:16 } });
  assert.equal(figure.elemental, true);
});

test('encounter initialization preserves game-initialized stats and non-participating figures', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side: 'player', stats: { life: 12 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side: 'enemy', stats: { life: 12 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side: 'player', stats: { life: 12 } }, () => 1);
  game.figures[0].life = 5;
  const original = structuredClone(game);
  const started = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  assert.equal(started.fight.figures[0].life, 5);
  assert.deepEqual(game, original);
  const updated = updateOrcEncounter(started, orcAttack(started.fight, 'figure-2', { legal: true }, () => 1).fight);
  assert.equal(updated.figures[1].life, 8);
  assert.deepEqual(updated.figures[2], original.figures[2]);
  assert.throws(() => addOrcGameFigure(updated, 'soldier', { side: 'player', stats: { life: 12 } }), RangeError);
  assert.throws(() => beginOrcEncounter(updated, ['figure-1','figure-2'], 'figure-1'), RangeError);
  const cancelled = cancelOrcEncounter(updated);
  assert.equal(cancelled.figures[0].life, 5);
  assert.equal(cancelled.figures[1].life, 8);
  assert.equal(cancelled.history.length, 0);
  const resumed = beginOrcEncounter(cancelled, ['figure-1','figure-2'], 'figure-1');
  assert.equal(resumed.fight.figures[1].life, 8);
});

test('finished fights cannot record duplicate history or insert unrelated figures', () => {
  let game = addOrcGameFigure(newOrcGame(), 'soldier', { side: 'player', stats: { life: 12, damage: 20 } }, () => 1);
  game = addOrcGameFigure(game, 'soldier', { side: 'enemy', stats: { life: 12 } }, () => 1);
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-1');
  assert.throws(() => updateOrcEncounter(game, { ...game.fight, figures: [...game.fight.figures, make('foreign','enemy')] }), RangeError);
  const finished = orcAttack(game.fight, 'figure-2', { legal: true }, () => 1).fight;
  const updated = updateOrcEncounter(game, finished, 100);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].ts, 100);
  assert.equal(updated.history[0].outcome, 'win');
  assert.throws(() => updateOrcEncounter(updated, finished, 100), RangeError);
  assert.throws(() => beginOrcEncounter(updated, ['figure-1','figure-2'], 'figure-1'), RangeError);
});

test('source monster figurines cannot be shared by living monsters, even on opposite sides', () => {
  let game = addOrcGameFigure(newOrcGame(), 'hydra', { side:'enemy' }, () => 1);
  assert.throws(() => addOrcGameFigure(game, 'phantomTroll', {
    side:'player', stats:{ life:20 },
  }), RangeError);
  assert.throws(() => addOrcGameFigure(game, 'basilisk', {
    side:'enemy', stats:{ life:2, damage:2 },
  }), RangeError);
  game = addOrcGameFigure(game, 'soldier', { side:'player', stats:{ life:12, attack:100, damage:20 } }, () => 1);
  game = beginOrcEncounter(game, ['figure-1','figure-2'], 'figure-2');
  game = updateOrcEncounter(game, orcAttack(game.fight, 'figure-1', { legal:true }, () => 1).fight);
  assert.equal(game.fight.status, 'win');
  const added = addOrcGameFigure(game, 'phantomTroll', { side:'enemy', stats:{ life:20 } }, () => 1);
  assert.equal(added.figures.length, 3);
});

test('blank, unknown or unsupported stats never become zero', () => {
  for (const value of [null, undefined, '', NaN, -1, { base: 2, sides: 7 }]) {
    assert.throws(() => orcStat(value), RangeError);
  }
  assert.deepEqual(orcStat(0), { base: 0, sides: 0 });
  assert.throws(() => rollOrcStat({ base: 2, sides: 8 }, () => 9), RangeError);
  assert.throws(() => make('one', 'player', { magicPower:null }), RangeError);
  assert.throws(() => make('one', 'player', { magicDamage:null }), RangeError);
});

test('damage and endurance roll once at game initialization, not at combat start', () => {
  let rolls = 0;
  const initialized = createOrcFigure({ id: 'player', side: 'player', attack: 8,
    defence: 8, shooting: 8, damage: { base: 4, sides: 6 },
    life: { base: 12, sides: 8 }, currentLife: 9, magicDamage: { base: 6, sides: 8 } },
  sides => { rolls++; return sides; });
  const fight = startOrcFight([initialized, make('enemy', 'enemy')], 'player');
  assert.equal(rolls, 3);
  assert.equal(fight.figures[0].damage, 10);
  assert.equal(fight.figures[0].maxLife, 20);
  assert.equal(fight.figures[0].life, 9);
  assert.equal(fight.figures[0].magicDamage, 14);
});

test('physical equality hits, magic equality misses, originals remain unchanged', () => {
  const fight = start();
  const physical = orcAttack(fight, 'enemy', { legal: true });
  assert.equal(physical.hit, true);
  assert.equal(physical.fight.figures[1].life, 8);
  assert.equal(physical.fight.actionsLeft, 1);
  assert.equal(fight.figures[1].life, 10);
  const magic = orcMagic(fight, ['enemy'], { legal: true, modifier: 0, damage: 6 });
  assert.equal(magic.results[0].hit, false);
  assert.equal(magic.fight.figures[1].life, 10);
  assert.equal(magic.fight.actionsLeft, 0);
});

test('map shield protects physical attacks only; crossbow protects shots and magic; axe adds damage', () => {
  const fight = start({ attack:10, shooting:10, magicPower:10 });
  assert.equal(orcAttack(fight, 'enemy', { legal:true, defenderMarker:'shield' }).hit, false);
  assert.equal(orcAttack(fight, 'enemy', { legal:true, defenderMarker:'crossbow' }).defence, 8);
  const shot = orcAttack(fight, 'enemy', { legal:true, kind:'shoot', weaponAvailable:true,
    defenderMarker:'crossbow', attackerMarker:'axe' });
  assert.equal(shot.defence, 10); assert.equal(shot.damage, 4);
  assert.equal(orcMagic(fight, ['enemy'], { legal:true, modifier:0, damage:2,
    targetMarkers:{ enemy:'shield' } }).results[0].hit, true);
  assert.equal(orcMagic(fight, ['enemy'], { legal:true, modifier:0, damage:2,
    targetMarkers:{ enemy:'crossbow' } }).results[0].hit, false);
  assert.throws(() => orcAttack(fight, 'enemy', { legal:true, attackerMarker:'invented' }), RangeError);
});

test('attack and defence dice reroll for each attack, equipment is included', () => {
  const fight = start({ attack: { base: 2, sides: 6 }, weaponAttack: 3 },
    { defence: { base: 2, sides: 8 }, armour: 1 });
  const dice = [6, 8, 1, 8];
  const roll = () => dice.shift();
  const first = orcAttack(fight, 'enemy', { legal: true }, roll);
  const second = orcAttack(first.fight, 'enemy', { legal: true }, roll);
  assert.equal(first.attack, 11); assert.equal(first.defence, 11);
  assert.equal(first.hit, true); assert.equal(second.hit, false);
  assert.equal(second.fight.actionsLeft, 0); assert.equal(dice.length, 0);
  assert.throws(() => orcAttack(second.fight, 'enemy', { legal: true }), RangeError);
  assert.equal(nextOrcTurn(second.fight, 'enemy').actionsLeft, 2);
});

test('signed equipment defence penalties remain penalties instead of being clamped', () => {
  const result = orcAttack(start({ attack: 6 }, { armour: -2 }), 'enemy', { legal: true });
  assert.equal(result.defence, 6);
  assert.equal(result.hit, true);
});

test('map legality, ranged eligibility and consumed throwing weapons are explicit', () => {
  const fight = start({ weaponAttack: 4, weaponShooting: 2, weaponDamage: 2 });
  assert.throws(() => orcAttack(fight, 'enemy'), RangeError);
  assert.throws(() => orcAttack(fight, 'enemy', { legal: true, kind: 'shoot' }), RangeError);
  const thrown = orcAttack(fight, 'enemy', { legal: true, kind: 'throw', weaponAvailable: true });
  assert.equal(thrown.damage, 4);
  assert.equal(thrown.fight.figures[0].weaponAttack, 0);
  assert.equal(thrown.fight.figures[0].weaponShooting, 0);
  assert.equal(thrown.fight.figures[0].weaponDamage, 0);
  assert.throws(() => orcAttack(thrown.fight, 'enemy', {
    legal: true, kind: 'throw', weaponAvailable: true,
  }), RangeError);
  assert.throws(() => orcMove(fight), RangeError);
});

test('thrown equipment is recoverable after victory only, without mutating the finished fight', () => {
  const fight = start({ weaponAttack: 4, weaponShooting: 2, weaponDamage: 8 });
  assert.throws(() => recoverOrcWeapons(fight), RangeError);
  const result = orcAttack(fight, 'enemy', { legal: true, kind: 'throw', weaponAvailable: true });
  assert.equal(result.fight.status, 'win');
  const recovered = recoverOrcWeapons(result.fight);
  assert.equal(recovered.figures[0].weaponAttack, 4);
  assert.equal(recovered.figures[0].weaponShooting, 2);
  assert.equal(recovered.figures[0].weaponDamage, 8);
  assert.equal(recovered.figures[0].thrown, false);
  assert.equal(result.fight.figures[0].weaponAttack, 0);
  assert.equal(result.fight.figures[0].thrown, true);
});

test('two actions per actor; damage spells consume both and include allied targets', () => {
  const fight = startOrcFight([make('player', 'player', { magicPower: 12 }),
    make('ally', 'player'), make('enemy', 'enemy')], 'player');
  assert.throws(() => nextOrcTurn(fight, 'enemy'), RangeError);
  const moved = orcMove(fight, { legal: true });
  assert.throws(() => orcMagic(moved, ['enemy'], { legal: true, modifier: 0, damage: 2 }), RangeError);
  const result = orcMagic(fight, ['ally', 'enemy'], { legal: true, modifier: 0, damage: 2 });
  assert.equal(result.fight.actionsLeft, 0);
  assert.equal(result.fight.figures[1].life, 8);
  assert.equal(result.fight.figures[2].life, 8);
  assert.throws(() => orcMagic(fight, ['enemy', 'enemy'], { legal: true, modifier: 0, damage: 2 }), RangeError);
});

test('strategic combat exchanges single blows without tactical manoeuvres', () => {
  const fight = startOrcFight([make('player','player'),make('enemy','enemy')], 'player', { mode:'strategic' });
  assert.equal(fight.actionsLeft, 1);
  assert.throws(() => orcMove(fight, { legal:true }), RangeError);
  const attacked = orcAttack(fight, 'enemy', { legal:true });
  assert.equal(attacked.fight.actionsLeft, 0);
  const next = nextOrcTurn(attacked.fight, 'enemy');
  assert.equal(next.actionsLeft, 1);
  const magic = orcMagic(next, ['player'], { legal:true, modifier:2, damage:2 });
  assert.equal(magic.fight.actionsLeft, 0);
  assert.throws(() => startOrcFight(fight.figures, 'player', { mode:'invented' }), RangeError);
});

test('a figure cannot repeat its actions before other surviving figures get their turn', () => {
  let fight = start();
  fight = orcMove(fight, { legal:true });
  fight = orcMove(fight, { legal:true });
  assert.throws(() => nextOrcTurn(fight, 'player'), RangeError);
  fight = nextOrcTurn(fight, 'enemy');
  assert.equal(fight.round, 1);
  fight = orcMove(fight, { legal:true });
  fight = orcMove(fight, { legal:true });
  fight = nextOrcTurn(fight, 'player');
  assert.equal(fight.round, 2);
  assert.deepEqual(fight.actedIds, []);
});

test('group combat ends only after every fighter on one side falls or leaves', () => {
  const fight = startOrcFight([make('player', 'player', { damage: 10 }),
    make('enemy', 'enemy'), make('second', 'enemy')], 'player');
  const first = orcAttack(fight, 'enemy', { legal: true });
  assert.equal(first.fight.status, 'fighting');
  const last = orcAttack(first.fight, 'second', { legal: true });
  assert.equal(last.fight.status, 'win');
  const loss = orcMove(start(), { legal: true, leave: true });
  assert.equal(loss.status, 'loss');
});

test('simultaneous area-spell death is loss, and removed actors can yield their remaining action', () => {
  const fight = start({ magicPower: 12 });
  const result = orcMagic(fight, ['player', 'enemy'], { legal: true, modifier: 0, damage: 10 });
  assert.equal(result.fight.status, 'loss');
  const group = startOrcFight([make('player', 'player'), make('ally', 'player'), make('enemy', 'enemy')], 'player');
  const left = orcMove(group, { legal: true, leave: true });
  assert.equal(nextOrcTurn(left, 'enemy').actorId, 'enemy');
});

test('elemental escape requires one actual attempted blow in each direction', () => {
  const fight = start({}, { elemental: true });
  assert.throws(() => orcMove(fight, { legal: true, leave: true }), RangeError);
  let next = orcAttack(fight, 'enemy', { legal: true }).fight;
  next = orcAttack(next, 'enemy', { legal: true }).fight;
  assert.throws(() => orcMove(nextOrcTurn(next, 'player'), { legal: true, leave: true }), RangeError);
  next = nextOrcTurn(next, 'enemy');
  next = orcAttack(next, 'player', { legal: true }).fight;
  next = orcAttack(next, 'player', { legal: true }).fight;
  next = nextOrcTurn(next, 'player');
  assert.equal(orcMove(next, { legal: true, leave: true }).status, 'loss');
});

test('elemental cards cannot manoeuvre off their original fields or equip ranged attacks', () => {
  const fight = startOrcFight([make('player','player'),make('enemy','enemy', { elemental:true })], 'enemy');
  assert.throws(() => orcMove(fight, { legal:true }), RangeError);
  assert.throws(() => orcMove(fight, { legal:true, leave:true }), RangeError);
  assert.throws(() => orcAttack(fight, 'player', { kind:'shoot', legal:true, weaponAvailable:true }), RangeError);
  assert.equal(orcAttack(fight, 'player', { legal:true }).hit, true);
});

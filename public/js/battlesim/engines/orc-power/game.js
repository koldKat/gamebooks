import { startOrcFight, recoverOrcWeapons, adjustOrcFigure, adjustOrcFightFigure } from './core.js';
import { prepareOrcFigure, ORC_MONSTER_FIGURINES } from './roster.js';

const copy = value => structuredClone(value);
const busy = game => game.fight?.status === 'fighting';

function valid(game) {
  if (game?.rulesVersion !== 1 || !Array.isArray(game.figures) || !Array.isArray(game.history)
      || new Set(game.figures.map(figure => figure.id)).size !== game.figures.length) {
    throw new RangeError('Invalid game state');
  }
}

export function newOrcGame() {
  return { rulesVersion: 1, figures: [], fight: null, history: [], nextFigure: 1 };
}

export function addOrcGameFigure(game, template, options, roll) {
  valid(game);
  if (busy(game) || game.figures.length >= 100 || !Number.isSafeInteger(game.nextFigure)
      || game.nextFigure < 1) throw new RangeError('Cannot add a figure now');
  const figurine = ORC_MONSTER_FIGURINES[template];
  if (figurine && game.figures.some(figure => figure.life > 0
      && ORC_MONSTER_FIGURINES[figure.template] === figurine)) {
    throw new RangeError('This physical monster figurine is already in use');
  }
  const next = copy(game), id = 'figure-' + next.nextFigure++;
  if (next.figures.some(figure => figure.id === id)) throw new RangeError('Duplicate figure');
  next.figures.push({ ...prepareOrcFigure(template, { ...options, id }, roll), template });
  return next;
}

export function beginOrcEncounter(game, selectedIds, firstId, options) {
  valid(game);
  if (busy(game) || !Array.isArray(selectedIds) || new Set(selectedIds).size !== selectedIds.length) {
    throw new RangeError('Invalid encounter selection');
  }
  const next = copy(game);
  const figures = selectedIds.map(id => {
    const figure = next.figures.find(item => item.id === id);
    if (!figure || figure.life <= 0) throw new RangeError('Unknown or dead figure');
    return { ...figure, removed: false };
  });
  next.fight = startOrcFight(figures, firstId, options);
  return next;
}

export function updateOrcEncounter(game, fight, timestamp = Date.now()) {
  valid(game);
  if (!busy(game) || fight?.rulesVersion !== 1 || !Array.isArray(fight.figures)
      || !['fighting', 'win', 'loss', 'cancelled'].includes(fight.status)
      || !Number.isSafeInteger(timestamp) || timestamp < 0) throw new RangeError('Invalid encounter update');
  const oldIds = game.fight.figures.map(figure => figure.id).sort();
  const newIds = fight.figures.map(figure => figure.id).sort();
  if (oldIds.length !== newIds.length || oldIds.some((id, index) => id !== newIds[index])) {
    throw new RangeError('Encounter figures changed');
  }
  const next = copy(game);
  next.fight = fight.status === 'win' ? recoverOrcWeapons(fight) : copy(fight);
  const updates = new Map(next.fight.figures.map(figure => [figure.id, figure]));
  next.figures = next.figures.map(figure => updates.has(figure.id)
    ? { ...figure, ...updates.get(figure.id) } : figure);
  if (['win', 'loss'].includes(next.fight.status)) {
    const opponents = game.fight.opponentTemplates ?? game.fight.figures.filter(figure => figure.side === 'enemy')
      .map(figure => figure.template ?? figure.id);
    next.history.push({ enemy: opponents.join(', '), outcome: next.fight.status,
    ts: Math.max(timestamp, (next.history.at(-1)?.ts ?? 0) + 1) });
  }
  return next;
}

export function cancelOrcEncounter(game) {
  valid(game);
  if (!busy(game)) throw new RangeError('No active encounter');
  return updateOrcEncounter(game, { ...game.fight, status: 'cancelled' });
}

export function adjustOrcGameFigure(game, id, changes) {
  valid(game);
  if (busy(game)) return updateOrcEncounter(game, adjustOrcFightFigure(game.fight, id, changes));
  const next = copy(game), index = next.figures.findIndex(figure => figure.id === id);
  if (index === -1) throw new RangeError('Unknown figure');
  next.figures[index] = adjustOrcFigure(next.figures[index], changes);
  next.fight = null;
  return next;
}

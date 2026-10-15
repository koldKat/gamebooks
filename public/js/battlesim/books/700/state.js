import { definition, PLAYER_DEFAULTS } from './definition.js';

function emptyState() {
  return { schemaVersion: 1, character: { ...PLAYER_DEFAULTS }, setup: {},
    encounterName: '', fight: null, history: [], decision: null };
}

export function createState(getContext) {
  function read() {
    const { currentBookId, currentPlaythrough } = getContext();
    if (Number(currentBookId) !== definition.id) return null;
    return currentPlaythrough()?.[definition.stateKey] ?? null;
  }

  function change(update) {
    const { currentBookId, currentPlaythrough } = getContext();
    if (Number(currentBookId) !== definition.id) return false;
    const run = currentPlaythrough();
    if (!run) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? emptyState());
    if (next.schemaVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Unsupported saved simulator state');
    const result = update(next);
    if (result?.then) throw new TypeError('Simulator changes must be synchronous');
    const live = getContext();
    if (Number(live.currentBookId) !== definition.id || live.currentPlaythrough() !== run
        || run[definition.stateKey] !== original) return false;
    if (next.fight?.outcome && !next.fight.recorded) {
      next.fight.recorded = true;
      if (['win', 'loss'].includes(next.fight.outcome)) {
        next.history.push({
          enemy: next.encounterName, outcome: next.fight.outcome,
          playerEndurance: next.fight.player.endurance,
          playerEnduranceMax: next.fight.player.enduranceMax,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1),
        });
      }
    }
    run[definition.stateKey] = next;
    live.saveState();
    return true;
  }

  function ensure() {
    if (!read()) change(() => {});
    return read();
  }

  return { read, change, ensure };
}

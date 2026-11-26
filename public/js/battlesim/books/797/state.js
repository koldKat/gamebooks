import { definition } from './definition.js';

export function createState(getContext, { id, stateKey } = definition) {
  function read() {
    const live = getContext();
    return Number(live.currentBookId) === id ? live.currentPlaythrough()?.[stateKey] ?? null : null;
  }
  function change(update) {
    const live = getContext(), run = live.currentPlaythrough();
    if (Number(live.currentBookId) !== id || !run) return false;
    const original = run[stateKey];
    const next = structuredClone(original ?? { schemaVersion: 1, character: null, fight: null, history: [], log: [] });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) throw new RangeError('Unsupported simulator state');
    if (update(next)?.then) throw new TypeError('Synchronous updates only');
    if (next.fight) {
      next.character = structuredClone(next.fight.character);
      if (['win', 'loss', 'timeout'].includes(next.fight.outcome) && !next.fight.recorded) {
        next.fight.recorded = true;
        next.history.push({ enemy: next.encounterName, outcome: next.fight.outcome,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
    }
    next.log = next.log.slice(-160);
    const current = getContext();
    if (Number(current.currentBookId) !== id || current.currentPlaythrough() !== run
      || run[stateKey] !== original) return false;
    run[stateKey] = next;
    current.saveState();
    return true;
  }
  return { read, change };
}

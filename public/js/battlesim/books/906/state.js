import {definition} from './definition.js';

export function createState(getContext) {
  function read() {
    const live = getContext();
    return Number(live.currentBookId) === definition.id ? live.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const live = getContext(), run = live.currentPlaythrough();
    if (!run || Number(live.currentBookId) !== definition.id) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? {schemaVersion: 1, character: null, fight: null, history: [], log: [], setup: {section: 0}});
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) throw new RangeError('Unsupported state');
    if (update(next)?.then) throw new TypeError('Synchronous update required');
    if (next.fight) {
      next.character = structuredClone(next.fight.character);
      if (next.fight.outcome && !next.fight.recorded) {
        next.fight.recorded = true;
        next.history.push({enemy: next.encounterName, outcome: next.fight.outcome, destination: next.fight.destination,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1)});
      }
    }
    next.log = next.log.slice(-160);
    const current = getContext();
    if (Number(current.currentBookId) !== definition.id || current.currentPlaythrough() !== run || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next; current.saveState(); return true;
  }
  return {read, change};
}

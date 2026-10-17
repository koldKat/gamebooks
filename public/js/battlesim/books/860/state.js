import { definition } from './definition.js';

export function createState(getContext) {
  function read() {
    const context = getContext();
    return Number(context.currentBookId) === definition.id ? context.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const context = getContext(), run = context.currentPlaythrough();
    if (Number(context.currentBookId) !== definition.id || !run) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? {schemaVersion: 1, character: null, result: null, history: [], log: []});
    if (next.schemaVersion !== 1 || !Array.isArray(next.log)) throw new RangeError('Unsupported simulator state');
    if (update(next)?.then) throw new TypeError('Synchronous updates only');
    next.log = next.log.slice(-160);
    const live = getContext();
    if (Number(live.currentBookId) !== definition.id || live.currentPlaythrough() !== run || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next;
    live.saveState();
    return true;
  }
  return {read, change};
}

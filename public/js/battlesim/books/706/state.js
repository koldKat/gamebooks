import { definition } from './definition.js';

export function createState(getContext) {
  function read() {
    const { currentBookId, currentPlaythrough } = getContext();
    return Number(currentBookId) === definition.id ? currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const context = getContext();
    if (Number(context.currentBookId) !== definition.id) return false;
    const run = context.currentPlaythrough();
    if (!run) return false;
    const previous = run[definition.stateKey];
    const next = structuredClone(previous ?? {
      schemaVersion: 1, character: { endurance: 40, silver: 40 }, fight: null,
      naval: null, deployment: {}, equipment: {}, history: [],
    });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Unsupported simulator state');
    if (update(next)?.then) throw new TypeError('Updates must be synchronous');
    const live = getContext();
    if (Number(live.currentBookId) !== definition.id || live.currentPlaythrough() !== run || run[definition.stateKey] !== previous) return false;
    for (const fight of [next.naval]) {
      if (fight?.outcome && !fight.recorded) {
        fight.recorded = true;
        if (fight.kind !== 'negotiation' && ['win', 'loss'].includes(fight.outcome)) {
          next.history.push({ enemy: fight.name, outcome: fight.outcome,
            playerEndurance: next.character.endurance, playerEnduranceMax: 40,
            ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
        }
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

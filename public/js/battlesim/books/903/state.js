import {definition} from './definition.js';
import {createCharacter} from './combat.js';

export function createState(getContext) {
  function read() {
    const context = getContext();
    return Number(context.currentBookId) === definition.id
      ? context.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }

  function change(update) {
    const context = getContext(), run = context.currentPlaythrough();
    if (Number(context.currentBookId) !== definition.id || !run) return false;
    const previous = run[definition.stateKey];
    const next = structuredClone(previous ?? {
      schemaVersion: 1, character: createCharacter(), fight: null, history: [],
    });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Unsupported simulator state');
    if (update(next)?.then) throw new TypeError('Updates must be synchronous');
    const live = getContext();
    if (Number(live.currentBookId) !== definition.id || live.currentPlaythrough() !== run
        || run[definition.stateKey] !== previous) return false;
    if (next.fight?.outcome && !next.fight.recorded) {
      next.fight.recorded = true;
      next.history.push({
        enemy: next.fight.enemy.displayName,
        outcome: next.fight.outcome === 'win' ? 'win' : 'loss',
        ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1),
      });
    }
    run[definition.stateKey] = next;
    live.saveState();
    return true;
  }

  function ensure() {
    if (!read()) change(() => {});
    return read();
  }
  return {read, change, ensure};
}

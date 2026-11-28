import { definition } from './definition.js';

export function createState(getContext) {
  const key = definition.stateKey;
  function read() {
    const { bookId, run } = getContext();
    return Number(bookId) === definition.id ? run?.[key] ?? null : null;
  }
  function change(update) {
    const { bookId, run, readOnly } = getContext();
    if (Number(bookId) !== definition.id || !run || readOnly) return false;
    const previous = run[key];
    const next = structuredClone(previous ?? { version: 1, setup: null, fight: null, history: [], log: [] });
    if (next.version !== 1) throw new RangeError('Unsupported fight state');
    update(next);
    const fight = next.fight;
    if (fight?.outcome && !fight.recorded) {
      fight.recorded = true;
      if (fight.outcome === 'win' || fight.outcome === 'loss') {
        next.history.push({
          enemy: fight.enemies.map(enemy => enemy.name).join(', '), outcome: fight.outcome,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1),
        });
      }
    }
    next.log = next.log.slice(-120);
    const live = getContext();
    if (live.run !== run || live.bookId !== bookId || live.readOnly || run[key] !== previous) return false;
    run[key] = next;
    live.save();
    return true;
  }
  return { read, change };
}

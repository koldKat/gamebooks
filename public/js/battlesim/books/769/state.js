import { definition } from './definition.js';

export function createState(getContext) {
  function read() {
    const live = getContext();
    return Number(live.currentBookId) === definition.id ? live.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const live = getContext(), run = live.currentPlaythrough();
    if (Number(live.currentBookId) !== definition.id || !run) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? { schemaVersion: 1, character: null, fight: null, history: [], log: [] });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) throw new RangeError('Unsupported simulator state');
    const beforeFight = next.fight, beforeCharacter = next.character;
    const result = update(next);
    if (result?.then) throw new TypeError('Synchronous simulator changes only');
    if (next.fight === beforeFight && beforeFight && (!beforeFight.outcome || beforeFight.outcome === 'continue') && next.character !== beforeCharacter) {
      throw new RangeError('Finish the fight before editing the character');
    }
    if (next.fight && next.fight !== beforeFight) {
      next.character = structuredClone(next.fight.character);
      if (['win', 'loss'].includes(next.fight.outcome) && !next.fight.recorded) {
        next.fight.recorded = true;
        next.history.push({ enemy: next.encounterName, outcome: next.fight.outcome,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
    }
    next.log = next.log.slice(-160);
    const current = getContext();
    if (Number(current.currentBookId) !== definition.id || current.currentPlaythrough() !== run
      || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next;
    current.saveState();
    return true;
  }
  return { read, change };
}

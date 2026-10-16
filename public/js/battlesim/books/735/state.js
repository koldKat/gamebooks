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
    const next = structuredClone(original ?? { schemaVersion: 1, character: null, fight: null, tank: null, history: [] });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Unsupported simulator state');
    const before = { character: next.character, fight: next.fight, tank: next.tank };
    const result = update(next);
    if (result?.then) throw new TypeError('Synchronous simulator changes only');
    if (next.fight && !next.fight.outcome && next.tank && !next.tank.outcome) throw new RangeError('Another battle is active');
    const characterEdit = next.character !== before.character && next.fight === before.fight && next.tank === before.tank;
    if (characterEdit && (next.fight && !next.fight.outcome || next.tank && !next.tank.outcome)) {
      throw new RangeError('Finish the active battle before editing character scores');
    }
    if (!characterEdit) {
      if (next.fight && next.fight !== before.fight) next.character = structuredClone(next.fight.player);
      if (next.tank && next.tank !== before.tank) next.character = structuredClone(next.tank.player);
    }
    for (const [kind, battle] of [['combat', next.fight], ['tank', next.tank]]) {
      if (battle && ['win', 'loss'].includes(battle.outcome) && !battle.recorded) {
        battle.recorded = true;
        next.history.push({ enemy: next.encounterName, kind, outcome: battle.outcome,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
    }
    const current = getContext();
    if (Number(current.currentBookId) !== definition.id || current.currentPlaythrough() !== run || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next;
    current.saveState();
    return true;
  }
  return { read, change };
}

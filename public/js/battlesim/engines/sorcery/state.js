export function createSimulatorState(getContext, definition) {
  function read() {
    const context = getContext();
    return Number(context.currentBookId) === definition.id ? context.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }

  function change(update) {
    const context = getContext();
    if (Number(context.currentBookId) !== definition.id) return false;
    const run = context.currentPlaythrough();
    if (!run) return false;
    const previous = run[definition.stateKey];
    const next = structuredClone(previous ?? { schemaVersion: 1, character: null, fight: null, darts: null, history: [], log: [], setup: {} });
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) throw new RangeError('Unsupported simulator state');
    if (update(next)?.then) throw new TypeError('Updates must be synchronous');
    const live = getContext();
    if (Number(live.currentBookId) !== definition.id || live.currentPlaythrough() !== run || run[definition.stateKey] !== previous) return false;
    if (next.fight?.outcome && !next.fight.recorded) {
      next.fight.recorded = true;
      if (['win', 'loss'].includes(next.fight.outcome)) {
        const last = next.history.at(-1)?.ts ?? 0;
        if (!Number.isSafeInteger(last) || last < 0) throw new RangeError('Invalid simulator history');
        next.history.push({ enemy: next.fight.name ?? next.fight.config.key, outcome: next.fight.outcome,
          playerStamina: next.fight.player.stamina, playerStaminaMax: next.fight.player.staminaInitial,
          ts: Math.max(Date.now(), last + 1) });
      }
    }
    next.log = next.log.slice(-100);
    run[definition.stateKey] = next;
    live.saveState();
    return true;
  }

  return { read, change };
}

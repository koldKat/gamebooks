// Persist combat state and completed encounter rewards only in the current playthrough.
import {validateBlackSunFight, blackSunRecoveredPlayer} from './combat.js';

export function emptyBlackSunState() {
  return {rulesVersion: 1, player: null, opponentSetup: [], encounter: '', fight: null, history: []};
}

export function rememberBlackSunFight(state, now = Date.now()) {
  if (!state.fight) return state;
  const fight = validateBlackSunFight(state.fight);
  state.player = ['fighting', 'paused'].includes(fight.status)
    ? structuredClone(fight.player) : blackSunRecoveredPlayer(fight);
  if (['win', 'loss'].includes(fight.status) && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid history timestamp');
    fight.recorded = true;
    state.history.push({enemy: fight.encounter.label || 'Custom opponent',
      section: fight.encounter.section || 'custom', outcome: fight.status,
      rounds: fight.round + (fight.phaseHistory ?? []).reduce((n, phase) => n + phase.rounds, 0),
      ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createBlackSunState(getContext) {
  function context() {
    const value = getContext();
    return value?.run && Number(value.bookId) === value.definition.id ? value : null;
  }
  function snapshot() {
    const ctx = context();
    return ctx ? {run: ctx.run, original: ctx.run[ctx.definition.stateKey],
      state: structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyBlackSunState())} : null;
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    if (next.rulesVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Invalid saved combat state');
    rememberBlackSunFight(next);
    ctx = context();
    if (!ctx || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    ctx.run[ctx.definition.stateKey] = next; ctx.saveState();
    return true;
  }
  return {snapshot, update};
}

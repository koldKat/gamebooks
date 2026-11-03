// Preserve current combat values and encounter history within one Real Life playthrough.
import {validateRealLifeFight, realLifeActive, realLifeInteger} from './core.js';

export const emptyRealLifeState = () => ({rulesVersion: 1, setup: {}, opponentSetup: [], allySetup: [], player: null, fight: null, history: []});

export function validateRealLifeState(state) {
  if (state?.rulesVersion !== 1 || !state.setup || !Array.isArray(state.opponentSetup) || !Array.isArray(state.allySetup)
      || !Array.isArray(state.history)) throw new RangeError('Invalid saved state');
  if (state.fight) validateRealLifeFight(state.fight);
  let previous = -1;
  for (const entry of state.history) {
    realLifeInteger(entry.rounds); realLifeInteger(entry.ts, 0, Number.MAX_SAFE_INTEGER);
    if (!['win', 'loss'].includes(entry.outcome) || entry.ts <= previous) throw new RangeError('Invalid history');
    previous = entry.ts;
  }
  return state;
}

export function rememberRealLifeFight(state, now = Date.now()) {
  validateRealLifeState(state);
  const fight = state.fight;
  if (!fight) return state;
  state.player = Object.fromEntries(['strength', 'sword', 'firearm', 'horsemanship', 'wounds',
    ...['agility', 'luck', 'javelin'].filter(key => Object.hasOwn(fight.hero, key))].map(key => [key, fight.hero[key]]));
  Object.assign(state.setup, state.player);
  if (!realLifeActive(fight) && ['win', 'loss'].includes(fight.status) && !fight.recorded) {
    realLifeInteger(now, 0, Number.MAX_SAFE_INTEGER); fight.recorded = true;
    state.history.push({enemy: fight.encounter.name || 'Custom encounter', section: String(fight.encounter.section ?? 'custom'),
      outcome: fight.status, rounds: fight.round, ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createRealLifeState(getContext) {
  const context = () => {
    const ctx = getContext(); return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  };
  function snapshot() {
    const ctx = context();
    if (!ctx) return null;
    const state = structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyRealLifeState());
    validateRealLifeState(state);
    return {run: ctx.run, original: ctx.run[ctx.definition.stateKey], state};
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    rememberRealLifeFight(next);
    ctx = context();
    if (!ctx || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    ctx.run[ctx.definition.stateKey] = next; ctx.saveState(); return true;
  }
  return {snapshot, update};
}

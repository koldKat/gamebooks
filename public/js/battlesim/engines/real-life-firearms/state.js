// Save independent firearm fights and once-only combat history within the current playthrough.
import {validateFirearmFight} from './core.js';

export const emptyFirearmState = () => ({rulesVersion: 1, setup: {}, opponentSetup: [], allySetup: [], fight: null, history: []});

export function validateFirearmState(state) {
  if (state?.rulesVersion !== 1 || !state.setup || !Array.isArray(state.opponentSetup) || !Array.isArray(state.allySetup)
      || !Array.isArray(state.history)) throw new RangeError('Invalid saved firearm state');
  if (state.fight) validateFirearmFight(state.fight);
  let previous = -1;
  for (const entry of state.history) {
    if (!['win', 'loss'].includes(entry.outcome) || !Number.isSafeInteger(entry.ts) || entry.ts <= previous
        || !Number.isSafeInteger(entry.rounds) || entry.rounds < 1) throw new RangeError('Invalid combat history');
    previous = entry.ts;
  }
  return state;
}

export function rememberFirearmFight(state, now = Date.now()) {
  validateFirearmState(state);
  const fight = state.fight;
  if (!fight) return state;
  state.setup[fight.encounter.heroSkill === 'Combat' ? 'combat' : 'firearm'] = fight.hero.skill;
  if (['win', 'loss'].includes(fight.status) && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid combat time');
    fight.recorded = true;
    state.history.push({enemy: fight.encounter.name || 'Custom encounter', section: String(fight.encounter.section ?? 'custom'),
      outcome: fight.status, rounds: fight.round, ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createFirearmState(getContext) {
  const context = () => {
    const ctx = getContext();
    return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  };
  function snapshot() {
    const ctx = context();
    if (!ctx) return null;
    const state = structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyFirearmState());
    validateFirearmState(state);
    return {run: ctx.run, original: ctx.run[ctx.definition.stateKey], state};
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    rememberFirearmFight(next);
    ctx = context();
    if (!ctx || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    ctx.run[ctx.definition.stateKey] = next; ctx.saveState(); return true;
  }
  return {snapshot, update};
}

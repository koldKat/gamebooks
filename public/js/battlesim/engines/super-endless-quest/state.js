// Save encounter stats and history only to the run that initiated the action.
import {validateQuestFight} from './core.js';

export const emptyQuestState = () => ({rulesVersion:1, player:null, opponent:null, fight:null, history:[]});

export function rememberQuestFight(state, now = Date.now(), validateFight = validateQuestFight, preservePlayerFields = false) {
  if (!state.fight) return state;
  const fight = validateFight(state.fight);
  state.player = preservePlayerFields
    ? {...state.player, ...structuredClone(fight.player)} : structuredClone(fight.player);
  state.opponent = structuredClone(fight.opponent);
  if (fight.status !== 'fighting' && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid combat timestamp');
    state.history.push({enemy:fight.opponent.name, section:fight.opponent.section,
      outcome:fight.status, rounds:fight.round, hp:fight.player.hp, experience:fight.player.experience,
      ts:Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
    fight.recorded = true;
  }
  return state;
}

export function createQuestState(getContext, {validateFight = validateQuestFight, preservePlayerFields = false} = {}) {
  const context = () => {
    const ctx = getContext();
    return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  };
  function snapshot() {
    const ctx = context();
    return ctx ? {run:ctx.run, original:ctx.run[ctx.definition.stateKey],
      state:structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyQuestState())} : null;
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    if (next.rulesVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Invalid saved encounter state');
    rememberQuestFight(next, Date.now(), validateFight, preservePlayerFields);
    ctx = context();
    if (!ctx || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    ctx.run[ctx.definition.stateKey] = next;
    ctx.saveState();
    return true;
  }
  return {snapshot, update};
}

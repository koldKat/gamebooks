// Persist optional graded duels and their outcomes only in the currently bound playthrough.
import {validateKnightmareFight} from './core.js';

export function emptyKnightmareState() {
  return {rulesVersion:1, playerLifeForce:'GREEN', opponent:null, luckCharges:0, fight:null, history:[]};
}

export function rememberKnightmareFight(state, now = Date.now()) {
  if (!state.fight) return state;
  const fight = validateKnightmareFight(state.fight);
  state.playerLifeForce = fight.player.lifeForce;
  state.opponent = {displayName:fight.opponent.name, lifeForce:fight.opponent.lifeForce};
  state.luckCharges = fight.luckCharges;
  if (fight.status !== 'fighting' && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid history timestamp');
    fight.recorded = true;
    state.history.push({enemy:fight.opponent.name, outcome:fight.status, rounds:fight.round,
      playerLifeForce:fight.player.lifeForce, opponentLifeForce:fight.opponent.lifeForce,
      ts:Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createKnightmareState(getContext) {
  function context() {
    const ctx = getContext();
    return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  }
  function snapshot() {
    const ctx = context();
    return ctx ? {run:ctx.run, original:ctx.run[ctx.definition.stateKey],
      state:structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyKnightmareState())} : null;
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    if (next.rulesVersion !== 1 || !Array.isArray(next.history)) throw new RangeError('Invalid saved duel state');
    rememberKnightmareFight(next);
    ctx = context();
    if (!ctx || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    ctx.run[ctx.definition.stateKey] = next;
    ctx.saveState();
    return true;
  }
  return {snapshot, update};
}
